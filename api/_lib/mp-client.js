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
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 300) };
    }
  }

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

export async function getAuthorizedPayment(authorizedPaymentId) {
  return mpFetch(`/authorized_payments/${authorizedPaymentId}`);
}

export async function searchAuthorizedPayments(
  preapprovalId,
  { offset = 0, limit = 50 } = {}
) {
  const params = new URLSearchParams({
    preapproval_id: String(preapprovalId),
    offset: String(offset),
    limit: String(limit),
  });
  return mpFetch(`/authorized_payments/search?${params.toString()}`);
}

export async function listAuthorizedPayments(
  preapprovalId,
  { limit = 50, maxPages = 40 } = {}
) {
  const all = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const data = await searchAuthorizedPayments(preapprovalId, { offset, limit });
    const batch = Array.isArray(data?.results) ? data.results : [];
    all.push(...batch);

    const total = Number(data?.paging?.total ?? Infinity);
    if (!batch.length || batch.length < limit || all.length >= total) break;
    offset += batch.length;
  }

  return all;
}

export async function cancelPreapproval(preapprovalId) {
  return mpFetch(`/preapproval/${preapprovalId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

export async function updatePreapprovalStatus(preapprovalId, status) {
  return mpFetch(`/preapproval/${preapprovalId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
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

  if (!ts || !v1 || !requestId) return false;

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
