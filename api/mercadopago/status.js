import { getDb, getCollectionName } from "../_lib/firebase-admin.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function getStatus(email) {
  const subscriberId = String(email).trim().toLowerCase();
  const db = getDb();
  const collection = getCollectionName();

  const snap = await db.collection(collection).doc(subscriberId).get();

  if (!snap.exists) {
    return { existe: false, email: subscriberId };
  }

  const data = snap.data();
  return {
    existe: true,
    email: subscriberId,
    activo: data.activo === true,
    pendiente: data.pendiente === true,
    mercadopago_status: data.mercadopago_status || null,
    fechaAlta: data.fechaAlta || null,
    fechaProximoCobro: data.fechaProximoCobro || null,
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const email =
      req.method === "GET" ? req.query?.email : (req.body?.email || null);

    if (!email) {
      return res.status(400).json({ message: "El campo email es obligatorio." });
    }

    const status = await getStatus(email);
    return res.status(200).json(status);
  } catch (error) {
    console.error("Error en status:", error);
    return res
      .status(500)
      .json({ message: error.message || "Error al consultar el estado." });
  }
}
