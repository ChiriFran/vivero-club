export const HISTORIAL_SUBCOLLECTION = "historialPagos";

export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestamp(value) {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : null;
}

export function fechaMasAntigua(...values) {
  let result = null;
  let resultTs = Infinity;
  values.forEach((value) => {
    const ts = timestamp(value);
    if (ts !== null && ts < resultTs) {
      resultTs = ts;
      result = toIso(value);
    }
  });
  return result;
}

export function fechaMasReciente(...values) {
  let result = null;
  let resultTs = -Infinity;
  values.forEach((value) => {
    const ts = timestamp(value);
    if (ts !== null && ts > resultTs) {
      resultTs = ts;
      result = toIso(value);
    }
  });
  return result;
}

export function siguienteMes(fecha) {
  const base = toIso(fecha);
  if (!base) return null;
  const date = new Date(base);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

export function resolveFechaProximoCobro(preapproval, fechaUltimoPago) {
  const next = toIso(preapproval?.next_payment_date);
  if (next) return next;
  return siguienteMes(fechaUltimoPago);
}

export function preapprovalFlags(status, now = new Date().toISOString()) {
  if (status === "authorized") {
    return {
      activo: true,
      pendiente: false,
      mercadopago_status: "authorized",
      fechaCancelacion: null,
    };
  }
  if (status === "paused") {
    return {
      activo: false,
      pendiente: true,
      mercadopago_status: "paused",
      fechaCancelacion: null,
    };
  }
  if (status === "cancelled") {
    return {
      activo: false,
      pendiente: false,
      mercadopago_status: "cancelled",
      fechaCancelacion: now,
    };
  }
  if (status === "pending") {
    return {
      activo: false,
      pendiente: true,
      mercadopago_status: "pending",
      fechaCancelacion: null,
    };
  }
  return { mercadopago_status: status || null };
}

export function buildPreapprovalUpdate(
  preapproval,
  current = {},
  now = new Date().toISOString()
) {
  const status = preapproval?.status || null;
  const update = {
    mercadopago_preapproval_id: preapproval?.id
      ? String(preapproval.id)
      : current.mercadopago_preapproval_id || null,
    mercadopago_status: status,
    ...preapprovalFlags(status, now),
  };

  if (preapproval?.preapproval_plan_id) {
    update.mercadopago_plan_id = String(preapproval.preapproval_plan_id);
  }

  const nextPayment = toIso(preapproval?.next_payment_date);
  if (nextPayment) update.fechaProximoCobro = nextPayment;
  if (status === "paused") {
    update.fechaProximoCobro = null;
  }
  if (status === "cancelled") {
    update.fechaProximoCobro = null;
    update.fechaCancelacion = current.fechaCancelacion || now;
  }

  return update;
}

export function isAuthorizedPaymentPaid(authorizedPayment) {
  const paymentStatus = authorizedPayment?.payment?.status;
  if (paymentStatus) return paymentStatus === "approved";
  const status = String(authorizedPayment?.status || "").toLowerCase();
  return ["processed", "approved", "authorized"].includes(status);
}

export function authorizedPaymentInfo(authorizedPayment, now) {
  const paymentRef = authorizedPayment?.payment;
  const payment =
    paymentRef && typeof paymentRef === "object" ? paymentRef : {};
  const paymentId =
    payment.id ??
    (typeof paymentRef === "number" || typeof paymentRef === "string"
      ? paymentRef
      : null);
  const authorizedId = authorizedPayment?.id ?? null;
  const preapprovalId =
    authorizedPayment?.preapproval_id ??
    (typeof authorizedPayment?.preapproval === "string"
      ? authorizedPayment.preapproval
      : null);

  return {
    fecha:
      toIso(
        payment.date_approved ||
          payment.date_created ||
          authorizedPayment?.debit_date ||
          authorizedPayment?.date_created ||
          authorizedPayment?.date_last_updated
      ) || now,
    estado: String(payment.status || authorizedPayment?.status || "unknown"),
    monto: Number(
      payment.transaction_amount ?? authorizedPayment?.transaction_amount ?? 0
    ),
    moneda:
      payment.currency_id || authorizedPayment?.currency_id || "ARS",
    paymentId,
    authorizedId,
    preapprovalId,
    paid: isAuthorizedPaymentPaid(authorizedPayment),
  };
}

export function paymentInfo(payment, now) {
  return {
    fecha:
      toIso(
        payment?.date_approved ||
          payment?.date_created ||
          payment?.date_last_updated
      ) || now,
    estado: String(payment?.status || "unknown"),
    monto: Number(payment?.transaction_amount ?? 0),
    moneda: payment?.currency_id || "ARS",
    paymentId: payment?.id ?? null,
    authorizedId: null,
    preapprovalId:
      payment?.preapproval_id ||
      payment?.metadata?.preapproval_id ||
      payment?.point_of_interaction?.transaction_data?.subscription_id ||
      null,
    paid: payment?.status === "approved",
  };
}

export async function findSubscriber(
  db,
  collection,
  { preapprovalId, externalReference, payerEmail } = {}
) {
  if (preapprovalId) {
    const byPreapproval = await db
      .collection(collection)
      .where("mercadopago_preapproval_id", "==", String(preapprovalId))
      .limit(1)
      .get();
    if (!byPreapproval.empty) return byPreapproval.docs[0];
  }

  if (externalReference) {
    const id = normalizeEmail(externalReference);
    if (id) {
      const byReference = await db.collection(collection).doc(id).get();
      if (byReference.exists) return byReference;
    }
  }

  if (payerEmail) {
    const id = normalizeEmail(payerEmail);
    if (id) {
      const byEmail = await db.collection(collection).doc(id).get();
      if (byEmail.exists) return byEmail;
    }
  }

  return null;
}

export async function upsertHistorial(
  subscriberRef,
  info,
  now = new Date().toISOString()
) {
  const id = info.paymentId
    ? `payment_${info.paymentId}`
    : info.authorizedId
      ? `authorized_${info.authorizedId}`
      : null;

  if (!id) return null;

  const entry = {
    fecha: info.fecha || now,
    estado: info.estado || "unknown",
    monto: Number.isFinite(Number(info.monto)) ? Number(info.monto) : 0,
    moneda: info.moneda || "ARS",
    mercadopago_payment_id: info.paymentId ? String(info.paymentId) : null,
    mercadopago_authorized_payment_id: info.authorizedId
      ? String(info.authorizedId)
      : null,
    mercadopago_preapproval_id: info.preapprovalId
      ? String(info.preapprovalId)
      : null,
    type: "payment",
    actualizadoEn: now,
  };

  await subscriberRef
    .collection(HISTORIAL_SUBCOLLECTION)
    .doc(id)
    .set(entry, { merge: true });

  return { id, entry };
}

export async function applyPaidPayment({
  subscriberRef,
  current = {},
  info,
  preapproval,
}) {
  const fechaPrimerPago = fechaMasAntigua(
    current.fechaPrimerPago || current.fechaUltimoPago,
    info.fecha
  );
  const fechaUltimoPago = fechaMasReciente(current.fechaUltimoPago, info.fecha);
  const preapprovalStatus = preapproval?.status || null;
  const paused = preapprovalStatus === "paused";
  const cancelled = preapprovalStatus === "cancelled";

  const update = {
    activo: !paused && !cancelled,
    pendiente: paused,
    mercadopago_status:
      paused || cancelled ? preapprovalStatus : "authorized",
    fechaPrimerPago,
    fechaUltimoPago,
    fechaCancelacion: cancelled
      ? current.fechaCancelacion || new Date().toISOString()
      : null,
    fechaProximoCobro: paused || cancelled
      ? null
      : resolveFechaProximoCobro(preapproval, fechaUltimoPago),
    mercadopago_preapproval_id: info.preapprovalId
      ? String(info.preapprovalId)
      : current.mercadopago_preapproval_id || null,
  };

  await subscriberRef.set(update, { merge: true });
  return update;
}
