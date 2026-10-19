import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import {
  getPreapproval,
  getPayment,
  mapPreapprovalStatus,
  verifyWebhookSignature,
} from "../_lib/mercadopago.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-signature, x-request-id"
  );
}

async function findSubscriber(db, collection, { preapprovalId, externalReference, payerEmail }) {
  if (externalReference) {
    const byRef = await db
      .collection(collection)
      .doc(String(externalReference).trim().toLowerCase())
      .get();
    if (byRef.exists) return byRef;
  }

  if (preapprovalId) {
    const byPreapproval = await db
      .collection(collection)
      .where("mercadopago_preapproval_id", "==", preapprovalId)
      .limit(1)
      .get();
    if (!byPreapproval.empty) return byPreapproval.docs[0];
  }

  if (payerEmail) {
    const byEmail = await db
      .collection(collection)
      .doc(payerEmail.trim().toLowerCase())
      .get();
    if (byEmail.exists) return byEmail;
  }

  return null;
}

async function handlePreapproval(db, collection, dataId) {
  const preapproval = await getPreapproval(dataId);
  const status = preapproval.status || null;
  const flags = mapPreapprovalStatus(status);

  const subSnap = await findSubscriber(db, collection, {
    preapprovalId: String(preapproval.id || dataId),
    externalReference: preapproval.external_reference,
    payerEmail: preapproval.payer_email,
  });

  if (!subSnap) return { status: "not_found", preapprovalId: dataId };

  const now = new Date().toISOString();
  const update = {
    mercadopago_preapproval_id: String(preapproval.id || dataId),
    mercadopago_status: status,
  };

  if (flags) Object.assign(update, flags);

  if (status === "authorized") {
    const current = subSnap.data() || {};
    if (!current.fechaPrimerPago) update.fechaPrimerPago = now;
    update.fechaUltimoPago = now;
    update.fechaProximoCobro = preapproval.next_payment_date || null;

    await subSnap.ref.collection("historialPagos").add({
      fecha: now,
      estado: "authorized",
      monto: Number(preapproval.auto_recurring?.transaction_amount ?? 0),
      mercadopago_preapproval_id: String(preapproval.id || dataId),
      type: "preapproval",
    });
  }

  await subSnap.ref.set(update, { merge: true });
  return { status: "updated", preapprovalId: dataId, mpStatus: status };
}

async function handlePayment(db, collection, dataId) {
  const payment = await getPayment(dataId);
  const preapprovalId =
    payment.preapproval_id ||
    payment.metadata?.preapproval_id ||
    payment.point_of_interaction?.transaction_data?.subscription_id ||
    null;

  const subSnap = await findSubscriber(db, collection, {
    preapprovalId: preapprovalId ? String(preapprovalId) : null,
    externalReference: payment.external_reference,
    payerEmail: payment.payer?.email,
  });

  if (!subSnap) return { status: "not_found", paymentId: dataId };

  const now = new Date().toISOString();
  const estado = payment.status || "unknown";

  await subSnap.ref.collection("historialPagos").add({
    fecha: now,
    estado,
    monto: Number(payment.transaction_amount ?? 0),
    mercadopago_payment_id: String(dataId),
    mercadopago_preapproval_id: preapprovalId ? String(preapprovalId) : null,
    type: "payment",
  });

  const update = { fechaUltimoPago: now };
  if (estado === "approved") {
    update.activo = true;
    update.pendiente = false;
    update.mercadopago_status = "authorized";
  }

  await subSnap.ref.set(update, { merge: true });
  return { status: "updated", paymentId: dataId, mpStatus: estado };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", service: "mercadopago-webhook" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const type = body.type || body.topic || body.action || null;
    const dataId = body.data?.id || body.data_id || body.id || req.query?.["data.id"];

    console.log("Webhook MercadoPago:", type, dataId);

    const valid = verifyWebhookSignature({ req, dataId });
    if (!valid) {
      console.error("Firma de webhook inválida.");
      return res.status(401).json({ message: "Firma inválida." });
    }

    if (!dataId) {
      return res.status(200).json({ status: "ignored", reason: "sin data.id" });
    }

    const db = getDb();
    const collection = getCollectionName();

    if (type === "subscription_preapproval" || type === "preapproval") {
      const result = await handlePreapproval(db, collection, String(dataId));
      return res.status(200).json(result);
    }

    if (type === "payment" || type === "subscription_authorized_payment") {
      const result = await handlePayment(db, collection, String(dataId));
      return res.status(200).json(result);
    }

    return res.status(200).json({ status: "ignored", type });
  } catch (error) {
    console.error("Error en webhook:", error);
    return res.status(200).json({ status: "error", message: error.message });
  }
}
