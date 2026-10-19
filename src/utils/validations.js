export function formatPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function formatPrecio(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `$${number.toLocaleString("es-AR")}`;
}
