import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { normalizeEmail } from "../_lib/club.js";
import { cancelPreapproval, getPreapproval } from "../_lib/mp-client.js";
import { requireAdmin, setCors } from "../_lib/admin-auth.js";

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
    const email = body.email;
    const subscriberId = normalizeEmail(email);

    if (!subscriberId) {
      return res.status(400).json({ message: "El campo email es obligatorio." });
    }

    const db = getDb();
    const collection = getCollectionName();
    const subscriberRef = db.collection(collection).doc(subscriberId);
    const snap = await subscriberRef.get();

    if (!snap.exists) {
      return res.status(404).json({ message: "No se encontró el suscriptor." });
    }

    const data = snap.data() || {};
    const preapprovalId = data.mercadopago_preapproval_id || null;
    let mercadopagoCancelado = false;

    if (preapprovalId && process.env.MOCK_MP !== "true") {
      try {
        await cancelPreapproval(preapprovalId);
        mercadopagoCancelado = true;
      } catch (mpError) {
        console.error("No se pudo cancelar en MP:", mpError.message);

        if (mpError.status === 404) {
          mercadopagoCancelado = true;
        } else {
          try {
            const currentPreapproval = await getPreapproval(preapprovalId);
            if (currentPreapproval?.status === "cancelled") {
              mercadopagoCancelado = true;
            }
          } catch (lookupError) {
            console.error(
              "No se pudo verificar el preapproval en MP:",
              lookupError.message
            );
          }

          if (!mercadopagoCancelado) {
            return res.status(502).json({
              message:
                "No se pudo cancelar en MercadoPago. La suscripción sigue activa.",
              detail: mpError.message,
            });
          }
        }
      }
    }

    const now = new Date().toISOString();

    await subscriberRef.set(
      {
        activo: false,
        pendiente: false,
        mercadopago_status: "cancelled",
        fechaCancelacion: now,
        fechaProximoCobro: null,
      },
      { merge: true }
    );

    return res.status(200).json({
      status: "cancelled",
      email: subscriberId,
      preapproval_id: preapprovalId,
      mercadopago_cancelado: mercadopagoCancelado,
      fechaCancelacion: now,
    });
  } catch (error) {
    console.error("Error en cancelar:", error);
    return res
      .status(500)
      .json({ message: error.message || "Error al cancelar la suscripción." });
  }
}
