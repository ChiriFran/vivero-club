import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

const MP_API_BASE = "https://api.mercadopago.com";

export function getMpToken() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN.");
  return token;
}

async function mpFetch(path, options = {}) {
  const response = await fetch(`${MP_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getMpToken()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data?.message || `MercadoPago respondió ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function createPreapproval({
  planId,
  payerEmail,
  externalReference,
  backUrl,
  notificationUrl,
  reason,
}) {
  const body = {
    preapproval_plan_id: planId,
    payer_email: payerEmail,
    external_reference: externalReference,
    back_url: backUrl,
    reason,
  };

  if (notificationUrl) body.notification_url = notificationUrl;

  return mpFetch("/preapproval", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getPreapproval(preapprovalId) {
  return mpFetch(`/preapproval/${preapprovalId}`);
}

export async function getPayment(paymentId) {
  return mpFetch(`/v1/payments/${paymentId}`);
}

export async function cancelPreapproval(preapprovalId) {
  return mpFetch(`/preapproval/${preapprovalId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

export function mapPreapprovalStatus(status) {
  if (status === "authorized") return { activo: true, pendiente: false };
  if (status === "paused") return { activo: false, pendiente: true };
  if (status === "cancelled") return { activo: false, pendiente: true };
  if (status === "pending") return { activo: false, pendiente: true };
  return null;
}

function parseSignatureHeader(header) {
  const parts = {};
  String(header || "")
    .split(",")
    .forEach((chunk) => {
      const [key, value] = chunk.split("=");
      if (key && value) parts[key.trim()] = value.trim();
    });
  return parts; // { ts, v1 }
}

export function verifyWebhookSignature({ req, dataId }) {
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (!secret) {
    console.warn(
      "MP_WEBHOOK_SECRET no configurado: se omite la validación de firma."
    );
    return true;
  }

  const header = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  const { ts, v1 } = parseSignatureHeader(header);

  if (!ts || !v1) return false;

  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return timingSafeEqual(expected, v1);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return nodeTimingSafeEqual(bufA, bufB);
}
