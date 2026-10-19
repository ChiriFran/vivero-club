import { getDb } from "../_lib/firebase-admin.js";
import { requireAdmin, setCors } from "../_lib/admin-auth.js";

const CONFIG_COLLECTION = "config";
const CONFIG_DOC = "landing";

function cleanArray(rawList, limit, mapFn) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((item) => item && (item.title || item.label || item.id))
    .slice(0, limit)
    .map(mapFn);
}

function normalizeConfig(raw = {}) {
  const hero = raw.hero || {};

  const beneficios = cleanArray(raw.beneficios, 6, (b) => ({
    icon: String(b.icon || "").trim(),
    title: String(b.title || "").trim(),
    text: String(b.text || "").trim(),
  }));

  const categorias = cleanArray(raw.categorias, 8, (c) => ({
    id: String(c.id || "").trim(),
    label: String(c.label || "").trim(),
    icon: String(c.icon || "").trim(),
  }));

  const precio = Number(raw.precio);

  return {
    hero: {
      badge: String(hero.badge || "").trim(),
      titulo: String(hero.titulo || "").trim(),
      subtitulo: String(hero.subtitulo || "").trim(),
      boton: String(hero.boton || "").trim(),
      imagenUrl: String(hero.imagenUrl || "").trim(),
    },
    precio: Number.isNaN(precio) ? null : precio,
    precioPeriodo: String(raw.precioPeriodo || "/ mes").trim(),
    beneficios,
    categorias,
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const db = getDb();
    const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC);

    if (req.method === "GET") {
      const snap = await ref.get();
      return res.status(200).json({ config: snap.exists ? snap.data() : null });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const config = normalizeConfig(body.config || body);
      await ref.set(config, { merge: true });
      return res.status(200).json({ config });
    }

    return res.status(405).json({ message: "Método no permitido" });
  } catch (error) {
    console.error("Error en admin/config:", error);
    return res.status(500).json({ message: "Error al procesar la configuración." });
  }
}
