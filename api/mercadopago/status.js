import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { HISTORIAL_SUBCOLLECTION, normalizeEmail } from "../_lib/club.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function mapHistorial(doc) {
  return { id: doc.id, ...doc.data() };
}

async function getHistorial(subscriberRef) {
  try {
    const snap = await subscriberRef
      .collection(HISTORIAL_SUBCOLLECTION)
      .orderBy("fecha", "desc")
      .limit(100)
      .get();
    return snap.docs.map(mapHistorial);
  } catch (error) {
    console.warn("No se pudo ordenar el historial, se usa fallback:", error.message);
    const snap = await subscriberRef.collection(HISTORIAL_SUBCOLLECTION).get();
    return snap.docs
      .map(mapHistorial)
      .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  }
}

async function getStatus(email) {
  const subscriberId = normalizeEmail(email);
  const db = getDb();
  const collection = getCollectionName();
  const subscriberRef = db.collection(collection).doc(subscriberId);
  const snap = await subscriberRef.get();

  if (!snap.exists) {
    return { existe: false, email: subscriberId, historialPagos: [] };
  }

  const data = snap.data() || {};
  const historialPagos = await getHistorial(subscriberRef);

  return {
    existe: true,
    email: subscriberId,
    nombre: data.nombre || "",
    activo: data.activo === true,
    pendiente: data.pendiente === true,
    mercadopago_plan_id: data.mercadopago_plan_id || null,
    mercadopago_preapproval_id: data.mercadopago_preapproval_id || null,
    mercadopago_status: data.mercadopago_status || null,
    fechaAlta: data.fechaAlta || null,
    fechaPrimerPago: data.fechaPrimerPago || null,
    fechaUltimoPago: data.fechaUltimoPago || null,
    fechaProximoCobro: data.fechaProximoCobro || null,
    fechaCancelacion: data.fechaCancelacion || null,
    historialPagos,
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const email = req.method === "GET" ? req.query?.email : body.email || null;

    if (!normalizeEmail(email)) {
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
