import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { getPreapproval, listAuthorizedPayments } from "../_lib/mp-client.js";
import { requireAdmin, setCors } from "../_lib/admin-auth.js";
import {
  authorizedPaymentInfo,
  buildPreapprovalUpdate,
  fechaMasAntigua,
  fechaMasReciente,
  normalizeEmail,
  resolveFechaProximoCobro,
  upsertHistorial,
} from "../_lib/club.js";

async function syncSubscriber(subscriberRef) {
  const now = new Date().toISOString();
  const snap = await subscriberRef.get();

  if (!snap.exists) {
    return { email: subscriberRef.id, status: "not_found" };
  }

  const current = snap.data() || {};
  const preapprovalId = current.mercadopago_preapproval_id;

  if (!preapprovalId) {
    return { email: subscriberRef.id, status: "no_preapproval" };
  }

  let preapproval;
  try {
    preapproval = await getPreapproval(preapprovalId);
  } catch (error) {
    return {
      email: subscriberRef.id,
      status: "mp_error",
      message: error.message,
    };
  }

  if (!preapproval || typeof preapproval !== "object") {
    return {
      email: subscriberRef.id,
      status: "mp_error",
      message: "MercadoPago devolvió una respuesta inválida.",
    };
  }

  const authorizedPayments = await listAuthorizedPayments(preapprovalId, {
    limit: 50,
    maxPages: 40,
  });
  const infos = authorizedPayments.map((payment) =>
    authorizedPaymentInfo(payment, now)
  );
  const paid = infos.filter((info) => info.paid);

  for (const info of infos) {
    await upsertHistorial(subscriberRef, info, now);
  }

  const update = buildPreapprovalUpdate(preapproval, current, now);

  if (preapproval?.status === "authorized") {
    update.activo = paid.length > 0;
    update.pendiente = paid.length === 0;
  }

  const fechas = paid.map((info) => info.fecha);
  const fechaPrimerPago = fechaMasAntigua(
    current.fechaPrimerPago || current.fechaUltimoPago,
    ...fechas
  );
  const fechaUltimoPago = fechaMasReciente(current.fechaUltimoPago, ...fechas);

  if (fechaPrimerPago) update.fechaPrimerPago = fechaPrimerPago;
  if (fechaUltimoPago) {
    update.fechaUltimoPago = fechaUltimoPago;
    if (!["paused", "cancelled"].includes(preapproval?.status)) {
      update.fechaProximoCobro = resolveFechaProximoCobro(
        preapproval,
        fechaUltimoPago
      );
    }
  }

  await subscriberRef.set(update, { merge: true });

  return {
    email: subscriberRef.id,
    status: "ok",
    preapproval_status: preapproval?.status || null,
    authorized_payments: authorizedPayments.length,
    pagos: paid.length,
    activo: update.activo === true,
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const db = getDb();
    const collection = getCollectionName();

    let refs = [];

    if (Array.isArray(body.emails) && body.emails.length) {
      refs = body.emails
        .map((email) => normalizeEmail(email))
        .filter(Boolean)
        .map((email) => db.collection(collection).doc(email));
    } else if (body.email) {
      const email = normalizeEmail(body.email);
      if (!email) {
        return res
          .status(400)
          .json({ message: "El campo email es obligatorio." });
      }
      refs = [db.collection(collection).doc(email)];
    } else if (body.all === true) {
      const snap = await db.collection(collection).limit(100).get();
      refs = snap.docs
        .filter((doc) => doc.data()?.mercadopago_preapproval_id)
        .map((doc) => doc.ref);
    } else {
      return res
        .status(400)
        .json({ message: "Enviá email, emails o all: true." });
    }

    if (refs.length > 100) {
      return res
        .status(400)
        .json({ message: "Máximo 100 suscriptores por sincronización." });
    }

    const results = [];
    for (const ref of refs) {
      try {
        results.push(await syncSubscriber(ref));
      } catch (error) {
        console.error(`Error sincronizando ${ref.id}:`, error);
        results.push({
          email: ref.id,
          status: "error",
          message: error.message,
        });
      }
    }

    const errors = results.filter((result) => result.status === "error").length;

    return res.status(200).json({
      ok: errors === 0,
      procesados: results.length,
      errores: errors,
      results,
    });
  } catch (error) {
    console.error("Error en sync-pagos:", error);
    return res.status(500).json({
      message: error.message || "Error al sincronizar los pagos.",
    });
  }
}
