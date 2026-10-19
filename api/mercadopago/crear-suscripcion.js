import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { createPreapproval, getMpToken } from "../_lib/mercadopago.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function resolveBaseUrl(req) {
  if (process.env.MP_BACK_URL) return process.env.MP_BACK_URL;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
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
    const { email, nombre } = body;

    if (!email || !nombre) {
      return res
        .status(400)
        .json({ message: "Los campos email y nombre son obligatorios." });
    }

    const subscriberId = email.trim().toLowerCase();
    const mock = process.env.MOCK_MP === "true";
    const planId = process.env.MP_PREAPPROVAL_PLAN_ID;
    const baseUrl = resolveBaseUrl(req);

    if (!mock && !planId) {
      return res
        .status(500)
        .json({ message: "Falta configurar MP_PREAPPROVAL_PLAN_ID." });
    }

    const db = getDb();
    const collection = getCollectionName();
    const subscriberRef = db.collection(collection).doc(subscriberId);

    const existingSnap = await subscriberRef.get();
    if (existingSnap.exists && existingSnap.data()?.activo === true) {
      return res
        .status(400)
        .json({ message: "Ya tenés una suscripción activa." });
    }

    await subscriberRef.set(
      {
        nombre: nombre.trim(),
        correo: subscriberId,
        mercadopago_plan_id: planId || null,
        mercadopago_status: "pending",
        pendiente: true,
        activo: false,
      },
      { merge: true }
    );

    if (mock) {
      return res.status(200).json({
        mock: true,
        init_point: null,
        checkout_url: null,
        preapproval_id: null,
        preapproval_plan_id: null,
      });
    }

    getMpToken();

    const preapproval = await createPreapproval({
      planId,
      payerEmail: subscriberId,
      externalReference: subscriberId,
      backUrl: `${baseUrl}/?suscripcion=ok`,
      notificationUrl: `${baseUrl}/api/mercadopago/webhook`,
      reason: `Suscripción ${nombre.trim()}`,
    });

    const checkoutUrl = preapproval.init_point || preapproval.sandbox_init_point;

    await subscriberRef.set(
      {
        mercadopago_preapproval_id: preapproval.id || null,
        mercadopago_status: preapproval.status || "pending",
      },
      { merge: true }
    );

    return res.status(200).json({
      init_point: checkoutUrl,
      checkout_url: checkoutUrl,
      preapproval_id: preapproval.id || null,
      preapproval_plan_id: planId,
    });
  } catch (error) {
    console.error("Error en crear-suscripcion:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Error al crear la suscripción." });
  }
}
