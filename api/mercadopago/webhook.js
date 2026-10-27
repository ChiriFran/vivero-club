import { getDb, getCollectionName } from "../_lib/firebase-admin.js";
import {
  getAuthorizedPayment,
  getPayment,
  getPreapproval,
  verifyWebhookSignature,
} from "../_lib/mp-client.js";
import {
  applyPaidPayment,
  authorizedPaymentInfo,
  buildPreapprovalUpdate,
  findSubscriber,
  paymentInfo,
  upsertHistorial,
} from "../_lib/club.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-signature, x-request-id"
  );
}

function resolveType(body) {
  const type = body?.type || body?.topic || null;
  if (type) return type;
  const action = body?.action;
  if (typeof action === "string" && action.includes(".")) {
    return action.split(".")[0];
  }
  return action || null;
}

async function handlePreapproval(db, collection, dataId) {
  const now = new Date().toISOString();
  const preapproval = await getPreapproval(dataId);

  if (!preapproval || typeof preapproval !== "object") {
    throw new Error("MercadoPago devolvió una respuesta inválida.");
  }

  const subSnap = await findSubscriber(db, collection, {
    preapprovalId: preapproval?.id ? String(preapproval.id) : String(dataId),
    externalReference: preapproval?.external_reference,
    payerEmail: preapproval?.payer_email,
  });

  if (!subSnap) return { status: "not_found", preapprovalId: dataId };

  const current = subSnap.data() || {};
  const update = buildPreapprovalUpdate(preapproval, current, now);

  if (preapproval?.status === "authorized" && !current.fechaUltimoPago) {
    update.activo = false;
    update.pendiente = true;
  }

  await subSnap.ref.set(update, { merge: true });

  return {
    status: "updated",
    source: "preapproval",
    preapprovalId: dataId,
    mpStatus: preapproval?.status || null,
    activo: update.activo === true,
  };
}

async function handleAuthorizedPayment(db, collection, dataId) {
  const now = new Date().toISOString();
  const rawAuthorizedPayment = await getAuthorizedPayment(dataId);
  let authorizedPayment = rawAuthorizedPayment;

  if (
    rawAuthorizedPayment?.payment &&
    typeof rawAuthorizedPayment.payment !== "object"
  ) {
    try {
      const payment = await getPayment(rawAuthorizedPayment.payment);
      authorizedPayment = { ...rawAuthorizedPayment, payment };
    } catch (error) {
      console.warn(
        "No se pudo consultar el pago del cobro autorizado:",
        error.message
      );
    }
  }

  const info = authorizedPaymentInfo(authorizedPayment, now);

  let preapproval = null;
  if (info.preapprovalId) {
    try {
      preapproval = await getPreapproval(info.preapprovalId);
    } catch (error) {
      console.warn(
        "No se pudo consultar el preapproval del pago autorizado:",
        error.message
      );
    }
  }

  const subSnap = await findSubscriber(db, collection, {
    preapprovalId: info.preapprovalId,
    externalReference: preapproval?.external_reference,
    payerEmail:
      authorizedPayment?.payer?.email ||
      preapproval?.payer_email ||
      authorizedPayment?.payer_email,
  });

  if (!subSnap) {
    return { status: "not_found", authorizedPaymentId: dataId };
  }

  const current = subSnap.data() || {};

  if (!preapproval && current.mercadopago_preapproval_id) {
    try {
      preapproval = await getPreapproval(current.mercadopago_preapproval_id);
    } catch (error) {
      console.warn(
        "No se pudo consultar el preapproval del suscriptor:",
        error.message
      );
    }
  }

  const saved = await upsertHistorial(subSnap.ref, info, now);

  if (info.paid) {
    const update = await applyPaidPayment({
      subscriberRef: subSnap.ref,
      current,
      info,
      preapproval,
    });

    return {
      status: "updated",
      source: "authorized_payment",
      authorizedPaymentId: dataId,
      paymentId: info.paymentId,
      mpStatus: info.estado,
      historialId: saved?.id || null,
      activo: update.activo === true,
    };
  }

  return {
    status: "stored",
    source: "authorized_payment",
    authorizedPaymentId: dataId,
    paymentId: info.paymentId,
    mpStatus: info.estado,
    historialId: saved?.id || null,
  };
}

async function handlePayment(db, collection, dataId) {
  const now = new Date().toISOString();
  const payment = await getPayment(dataId);
  const info = paymentInfo(payment, now);

  if (!info.preapprovalId && !payment?.external_reference) {
    return {
      status: "ignored",
      reason: "pago sin preapproval ni external_reference",
    };
  }

  let preapproval = null;
  if (info.preapprovalId) {
    try {
      preapproval = await getPreapproval(info.preapprovalId);
    } catch (error) {
      console.warn(
        "No se pudo consultar el preapproval del pago:",
        error.message
      );
    }
  }

  const subSnap = await findSubscriber(db, collection, {
    preapprovalId: info.preapprovalId,
    externalReference:
      payment?.external_reference || preapproval?.external_reference,
    payerEmail: payment?.payer?.email || preapproval?.payer_email,
  });

  if (!subSnap) return { status: "not_found", paymentId: dataId };
  const current = subSnap.data() || {};

  if (!preapproval && current.mercadopago_preapproval_id) {
    try {
      preapproval = await getPreapproval(current.mercadopago_preapproval_id);
    } catch (error) {
      console.warn(
        "No se pudo consultar el preapproval del suscriptor:",
        error.message
      );
    }
  }

  const saved = await upsertHistorial(subSnap.ref, info, now);

  if (info.paid) {
    const update = await applyPaidPayment({
      subscriberRef: subSnap.ref,
      current,
      info,
      preapproval,
    });

    return {
      status: "updated",
      source: "payment",
      paymentId: dataId,
      mpStatus: info.estado,
      historialId: saved?.id || null,
      activo: update.activo === true,
    };
  }

  return {
    status: "stored",
    source: "payment",
    paymentId: dataId,
    mpStatus: info.estado,
    historialId: saved?.id || null,
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", service: "mercadopago-webhook" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Método no permitido" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const type = resolveType(body);
    const action = body.action || null;
    const dataId =
      body.data?.id ||
      body.data_id ||
      body.id ||
      req.query?.["data.id"] ||
      req.query?.id ||
      null;

    console.log(
      "Webhook MercadoPago:",
      JSON.stringify({
        type,
        action,
        id: dataId,
        data: body.data || null,
      })
    );

    const valid = verifyWebhookSignature({ req, dataId });
    if (!valid) {
      console.error("Firma de webhook inválida.");
      return res.status(401).json({ message: "Firma inválida." });
    }

    if (!dataId) {
      return res.status(200).json({ status: "ignored", reason: "sin data.id" });
    }

    const db = getDb();
    const collection = getCollectionName();

    if (type === "subscription_preapproval" || type === "preapproval") {
      const result = await handlePreapproval(db, collection, String(dataId));
      return res.status(200).json(result);
    }

    if (
      type === "subscription_authorized_payment" ||
      type === "authorized_payment"
    ) {
      const result = await handleAuthorizedPayment(
        db,
        collection,
        String(dataId)
      );
      return res.status(200).json(result);
    }

    if (type === "payment") {
      const result = await handlePayment(db, collection, String(dataId));
      return res.status(200).json(result);
    }

    return res.status(200).json({ status: "ignored", type });
  } catch (error) {
    console.error("Error en webhook:", error);
    return res.status(200).json({ status: "error", message: error.message });
  }
}
