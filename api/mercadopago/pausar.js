import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { normalizeEmail } from "../_lib/club.js";
import { updatePreapprovalStatus } from "../_lib/mp-client.js";
import { requireAdmin, setCors } from "../_lib/admin-auth.js";

const ACCIONES = {
  pausar: {
    mpStatus: "paused",
    fields: {
      activo: false,
      pendiente: true,
      mercadopago_status: "paused",
      fechaCancelacion: null,
      fechaProximoCobro: null,
    },
  },
  reactivar: {
    mpStatus: "authorized",
    fields: {
      activo: true,
      pendiente: false,
      mercadopago_status: "authorized",
      fechaCancelacion: null,
    },
  },
};

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const email = normalizeEmail(body.email);
    const accion = String(body.accion || "").trim();
    const config = ACCIONES[accion];

    if (!email) {
      return res.status(400).json({ message: "El campo email es obligatorio." });
    }

    if (!config) {
      return res
        .status(400)
        .json({ message: "La acción debe ser pausar o reactivar." });
    }

    const db = getDb();
    const collection = getCollectionName();
    const subscriberRef = db.collection(collection).doc(email);
    const snap = await subscriberRef.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "No se encontró el suscriptor." });
    }

    const data = snap.data() || {};
    const preapprovalId = data.mercadopago_preapproval_id || null;
    const mock = process.env.MOCK_MP === "true";

    if (!preapprovalId && !mock) {
      return res.status(400).json({
        message: "El suscriptor no tiene un preapproval de MercadoPago.",
      });
    }

    let mercadopagoActualizado = false;

    if (!mock) {
      try {
        await updatePreapprovalStatus(preapprovalId, config.mpStatus);
        mercadopagoActualizado = true;
      } catch (mpError) {
        console.error("No se pudo actualizar el preapproval en MP:", mpError.message);
        if (mpError.status !== 404) {
          return res.status(502).json({
            message:
              "No se pudo actualizar la suscripción en MercadoPago. No se modificó el estado local.",
            detail: mpError.message,
          });
        }
      }
    }

    await subscriberRef.set(config.fields, { merge: true });

    return res.status(200).json({
      status: accion,
      email,
      preapproval_id: preapprovalId,
      mercadopago_actualizado: mercadopagoActualizado,
    });
  } catch (error) {
    console.error("Error en pausar:", error);
    return res.status(500).json({
      message: error.message || "Error al actualizar la suscripción.",
    });
  }
}
