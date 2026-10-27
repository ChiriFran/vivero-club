import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import { normalizeEmail } from "../_lib/club.js";
import { createPreapproval, getMpToken, getPreapproval } from "../_lib/mp-client.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function resolveBaseUrl(req) {
  if (process.env.MP_BACK_URL) return process.env.MP_BACK_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function buildSubscriberData({ raw, existing, subscriberId, nombre, planId, now }) {
  const field = (key, fallback = "") => {
    const provided = text(raw[key]);
    if (provided) return provided;

    const current = existing[key];
    if (
      current !== undefined &&
      current !== null &&
      String(current).trim() !== ""
    ) {
      return text(current);
    }
    return text(fallback);
  };

  const rawPreferences = Array.isArray(raw.preferencias)
    ? raw.preferencias.filter((item) => typeof item === "string").slice(0, 10)
    : [];
  const existingPreferences = Array.isArray(existing.preferencias)
    ? existing.preferencias.filter((item) => typeof item === "string")
    : [];
  const preferences = rawPreferences.length
    ? rawPreferences
    : existingPreferences;

  return {
    nombre: field("nombre", nombre),
    instagram: field("instagram"),
    dni: field("dni"),
    telefono: field("telefono"),
    correo: subscriberId,
    direccion: field("direccion"),
    departamento: field("departamento"),
    ciudad: field("ciudad"),
    codigoPostal: field("codigoPostal"),
    horarioEntrega: field("horarioEntrega"),
    preferencias: preferences,
    tema: "vivero",
    origen: "landing-vivero",
    activo: false,
    pendiente: true,
    fechaAlta: existing.fechaAlta || now,
    fechaPrimerPago: null,
    fechaUltimoPago: null,
    fechaProximoCobro: null,
    mercadopago_plan_id: planId || existing.mercadopago_plan_id || null,
    mercadopago_status: "pending",
    fechaCancelacion: null,
  };
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
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { email, nombre } = body;
    const subscriberId = normalizeEmail(email);

    if (!subscriberId || !String(nombre || "").trim()) {
      return res
        .status(400)
        .json({ message: "Los campos email y nombre son obligatorios." });
    }

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
    const existing = existingSnap.exists ? existingSnap.data() || {} : {};

    if (existing.activo === true) {
      return res
        .status(400)
        .json({ message: "Ya tenés una suscripción activa." });
    }

    const now = new Date().toISOString();
    const raw =
      body.suscriptor && typeof body.suscriptor === "object"
        ? body.suscriptor
        : {};
    const subscriberData = buildSubscriberData({
      raw,
      existing,
      subscriberId,
      nombre,
      planId,
      now,
    });

    if (mock) {
      await subscriberRef.set(subscriberData, { merge: true });
      return res.status(200).json({
        mock: true,
        init_point: null,
        checkout_url: null,
        preapproval_id: null,
        preapproval_plan_id: null,
      });
    }

    if (existing.mercadopago_preapproval_id) {
      try {
        const currentPreapproval = await getPreapproval(
          existing.mercadopago_preapproval_id
        );
        const currentUrl =
          currentPreapproval.init_point || currentPreapproval.sandbox_init_point;

        if (currentPreapproval.status === "pending" && currentUrl) {
          if (currentPreapproval.preapproval_plan_id) {
            subscriberData.mercadopago_plan_id = String(
              currentPreapproval.preapproval_plan_id
            );
          }
          await subscriberRef.set(subscriberData, { merge: true });
          return res.status(200).json({
            init_point: currentUrl,
            checkout_url: currentUrl,
            preapproval_id: currentPreapproval.id || null,
            preapproval_plan_id:
              currentPreapproval.preapproval_plan_id || planId,
            preapproval_status: currentPreapproval.status,
            reused: true,
          });
        }

        if (currentPreapproval.status === "authorized") {
          return res.status(409).json({
            message:
              "Tu suscripción ya está autorizada en MercadoPago. Esperá a que se registre el primer pago.",
          });
        }

        if (currentPreapproval.status === "paused") {
          return res.status(409).json({
            message:
              "Tu suscripción está pausada en MercadoPago. Escribinos para reactivarla.",
          });
        }
      } catch (error) {
        console.warn(
          "No se pudo reutilizar el preapproval pendiente:",
          error.message
        );
      }
    }

    await subscriberRef.set(subscriberData, { merge: true });
    getMpToken();

    const preapproval = await createPreapproval({
      planId,
      payerEmail: subscriberId,
      externalReference: subscriberId,
      backUrl: `${baseUrl}/?suscripcion=ok`,
      notificationUrl: `${baseUrl}/api/mercadopago/webhook`,
      reason: `Suscripción ${String(nombre).trim()}`,
    });

    const checkoutUrl = preapproval.init_point || preapproval.sandbox_init_point;

    try {
      await subscriberRef.set(
        {
          mercadopago_preapproval_id: preapproval.id || null,
          mercadopago_status: preapproval.status || "pending",
        },
        { merge: true }
      );
    } catch (saveError) {
      console.error(
        "No se pudo guardar el preapproval_id en el suscriptor:",
        saveError.message
      );
    }

    return res.status(200).json({
      init_point: checkoutUrl,
      checkout_url: checkoutUrl,
      preapproval_id: preapproval.id || null,
      preapproval_plan_id: planId,
      preapproval_status: preapproval.status || "pending",
    });
  } catch (error) {
    console.error("Error en crear-suscripcion:", error);
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Error al crear la suscripción." });
  }
}
