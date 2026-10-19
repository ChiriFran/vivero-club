const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function crearSuscripcion(data) {
  const response = await fetch(`${API_BASE}/api/mercadopago/crear-suscripcion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.message || "Error al crear la suscripción");
  }
  return result;
}

export async function consultarEstado(email) {
  const response = await fetch(
    `${API_BASE}/api/mercadopago/status?email=${encodeURIComponent(email)}`
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.message || "Error al consultar el estado");
  }
  return result;
}

export async function cancelarSuscripcion(email) {
  const response = await fetch(`${API_BASE}/api/mercadopago/cancelar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.message || "Error al cancelar la suscripción");
  }
  return result;
}
