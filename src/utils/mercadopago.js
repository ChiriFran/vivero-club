import { auth } from "../firebase/config";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function readJson(response, fallbackMessage) {
  const text = await response.text();
  let result = null;

  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = null;
    }
  }

  if (!response.ok || result === null) {
    const error = new Error(result?.message || fallbackMessage);
    error.status = response.status;
    throw error;
  }

  return result;
}

async function adminHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Necesitás iniciar sesión como administrador.");
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function crearSuscripcion(data) {
  const response = await fetch(`${API_BASE}/api/mercadopago/crear-suscripcion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return readJson(response, "Error al crear la suscripción");
}

export async function consultarEstado(email) {
  const response = await fetch(
    `${API_BASE}/api/mercadopago/status?email=${encodeURIComponent(email)}`
  );

  return readJson(response, "Error al consultar el estado");
}

export const verificarEstado = consultarEstado;

export async function cancelarSuscripcion(email) {
  const response = await fetch(`${API_BASE}/api/mercadopago/cancelar`, {
    method: "POST",
    headers: await adminHeaders(),
    body: JSON.stringify({ email }),
  });

  return readJson(response, "Error al cancelar la suscripción");
}

export async function sincronizarPagos(email) {
  const response = await fetch(`${API_BASE}/api/mercadopago/sync-pagos`, {
    method: "POST",
    headers: await adminHeaders(),
    body: JSON.stringify({ email }),
  });

  const data = await readJson(response, "Error al sincronizar los pagos");
  if (Array.isArray(data.results) && data.results.length === 1) {
    return data.results[0];
  }
  return data;
}

async function cambiarEstadoSuscripcion(email, accion) {
  const response = await fetch(`${API_BASE}/api/mercadopago/pausar`, {
    method: "POST",
    headers: await adminHeaders(),
    body: JSON.stringify({ email, accion }),
  });

  return readJson(response, "Error al actualizar la suscripción");
}

export function pausarSuscripcion(email) {
  return cambiarEstadoSuscripcion(email, "pausar");
}

export function reactivarSuscripcion(email) {
  return cambiarEstadoSuscripcion(email, "reactivar");
}
