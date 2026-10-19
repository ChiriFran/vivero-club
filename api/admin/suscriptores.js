import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { requireAdmin, setCors } from "../_lib/admin-auth.js";

const MP_API_BASE = "https://api.mercadopago.com";

async function cancelPreapproval(preapprovalId) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token || !preapprovalId) return false;

  try {
    const response = await fetch(`${MP_API_BASE}/preapproval/${preapprovalId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    });
    return response.ok;
  } catch (error) {
    console.error("Error cancelando preapproval en MP:", error);
    return false;
  }
}

function toSubscriber(id, data) {
  return {
    id,
    nombre: data.nombre || "",
    correo: data.correo || id,
    telefono: data.telefono || "",
    dni: data.dni || "",
    instagram: data.instagram || "",
    direccion: data.direccion || "",
    departamento: data.departamento || "",
    ciudad: data.ciudad || "",
    codigoPostal: data.codigoPostal || "",
    horarioEntrega: data.horarioEntrega || "",
    preferencias: Array.isArray(data.preferencias) ? data.preferencias : [],
    activo: data.activo === true,
    pendiente: data.pendiente === true,
    mercadopago_status: data.mercadopago_status || null,
    fechaAlta: data.fechaAlta || null,
    fechaPrimerPago: data.fechaPrimerPago || null,
    fechaUltimoPago: data.fechaUltimoPago || null,
    fechaProximoCobro: data.fechaProximoCobro || null,
  };
}

function buildStats(subscribers) {
  return {
    total: subscribers.length,
    activos: subscribers.filter((s) => s.activo).length,
    pendientes: subscribers.filter((s) => !s.activo && s.pendiente).length,
    cancelados: subscribers.filter((s) => s.mercadopago_status === "cancelled")
      .length,
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const db = getDb();
    const collection = getCollectionName();

    if (req.method === "GET") {
      const snap = await db.collection(collection).get();
      console.log(
        `admin/suscriptores GET · proyecto=${process.env.FIREBASE_PROJECT_ID} · coleccion=${collection} · docs=${snap.size}`
      );
      const subscribers = snap.docs
        .map((doc) => toSubscriber(doc.id, doc.data()))
        .sort((a, b) => String(b.fechaAlta || "").localeCompare(String(a.fechaAlta || "")));

      return res.status(200).json({
        suscriptores: subscribers,
        stats: buildStats(subscribers),
      });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { action, email } = body;

      if (!email || !action) {
        return res.status(400).json({ message: "Faltan datos (email, action)." });
      }

      const id = String(email).trim().toLowerCase();
      const ref = db.collection(collection).doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ message: "Suscriptor no encontrado." });
      }

      const current = snap.data();

      if (action === "activar") {
        await ref.set(
          { activo: true, pendiente: false, mercadopago_status: "authorized" },
          { merge: true }
        );
      } else if (action === "pausar") {
        await ref.set(
          { activo: false, pendiente: true, mercadopago_status: "paused" },
          { merge: true }
        );
      } else if (action === "cancelar") {
        await cancelPreapproval(current.mercadopago_preapproval_id);
        await ref.set(
          { activo: false, pendiente: true, mercadopago_status: "cancelled" },
          { merge: true }
        );
      } else if (action === "eliminar") {
        await ref.delete();
        return res.status(200).json({ status: "deleted", email: id });
      } else {
        return res.status(400).json({ message: "Acción no válida." });
      }

      const updated = await ref.get();
      return res.status(200).json({
        status: action,
        suscriptor: updated.exists ? toSubscriber(updated.id, updated.data()) : null,
      });
    }

    return res.status(405).json({ message: "Método no permitido" });
  } catch (error) {
    console.error("Error en admin/suscriptores:", error);
    return res
      .status(500)
      .json({ message: "Error al procesar los suscriptores." });
  }
}
