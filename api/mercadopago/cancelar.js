import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { cancelPreapproval } from "../_lib/mercadopago.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const email = body.email;

    if (!email) {
      return res.status(400).json({ message: "El campo email es obligatorio." });
    }

    const subscriberId = String(email).trim().toLowerCase();
    const db = getDb();
    const collection = getCollectionName();
    const subscriberRef = db.collection(collection).doc(subscriberId);
    const snap = await subscriberRef.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "No se encontró el suscriptor." });
    }

    const preapprovalId = snap.data()?.mercadopago_preapproval_id || null;
    if (preapprovalId && process.env.MOCK_MP !== "true") {
      try {
        await cancelPreapproval(preapprovalId);
      } catch (mpError) {
        console.error("No se pudo cancelar en MP:", mpError.message);
      }
    }

    await subscriberRef.set(
      {
        activo: false,
        pendiente: true,
        mercadopago_status: "cancelled",
      },
      { merge: true }
    );

    return res.status(200).json({ status: "cancelled", email: subscriberId });
  } catch (error) {
    console.error("Error en cancelar:", error);
    return res
      .status(500)
      .json({ message: error.message || "Error al cancelar la suscripción." });
  }
}
