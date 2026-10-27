import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin } from "./firebase-admin.js";

export function getAdminUids() {
  return String(process.env.ADMIN_UIDS || "")
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);
}

export async function requireAdmin(req, res) {
  const adminUids = getAdminUids();
  if (!adminUids.length) {
    res.status(500).json({
      message:
        "Falta configurar ADMIN_UIDS en el servidor (lista de UIDs de Firebase autorizados).",
    });
    return null;
  }

  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ message: "No autorizado." });
    return null;
  }

  try {
    const app = getFirebaseAdmin();
    const decoded = await getAuth(app).verifyIdToken(token);

    if (!adminUids.includes(decoded.uid)) {
      res
        .status(403)
        .json({ message: "Tu cuenta no tiene permisos de administrador." });
      return null;
    }

    return decoded;
  } catch (error) {
    console.error("Error verificando token de admin:", error.message);
    res.status(401).json({ message: "Sesión inválida o expirada." });
    return null;
  }
}

export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-admin-token"
  );
}
