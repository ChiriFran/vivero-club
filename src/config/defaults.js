export const DEFAULT_CONTENT = {
  hero: {
    badge: "Suscripción mensual",
    titulo: "Vivero Club",
    subtitulo:
      "Suscribite a nuestro club del vivero y recibí cada mes una caja con plantas, macetas y productos seleccionados en tu puerta.",
    boton: "Quiero suscribirme",
    imagenUrl: "",
    imagenes: [],
    imagenBadgeArribaIcono: "🌿",
    imagenBadgeArriba: "Plantas seleccionadas",
    imagenBadgeAbajoIcono: "🚚",
    imagenBadgeAbajo: "Envío incluido",
  },
  precio: null,
  precioPeriodo: "/ mes",
  pasos: {
    eyebrow: "Cómo funciona",
    titulo: "Tu caja, paso a paso",
    subtitulo:
      "Elegís lo que te gusta, armamos una selección pensada para vos y la recibís cada mes en tu puerta. Simple, flexible y sin sorpresas.",
  },
  beneficios: [
    {
      icon: "📦",
      title: "Elegís tus preferencias",
      text: "Contás qué plantas, macetas y productos te gustan para que tu caja tenga sentido en tu espacio.",
    },
    {
      icon: "🌱",
      title: "Preparamos tu selección",
      text: "Nuestro equipo elige ejemplares y materiales de calidad, cuidando cada detalle de la caja.",
    },
    {
      icon: "🚚",
      title: "La recibís en casa",
      text: "Llega todos los meses con envío incluido. Podés pausar o cancelar cuando quieras.",
    },
  ],
  categorias: [
    { id: "suculentas", label: "Suculentas", icon: "🌵" },
    { id: "interior", label: "Plantas de interior", icon: "🪴" },
    { id: "exterior", label: "Plantas resistentes", icon: "🌿" },
    { id: "macetas", label: "Macetas cerámicas", icon: "🏺" },
    { id: "aromaticas", label: "Hierbas aromáticas", icon: "🍃" },
    { id: "mix", label: "Mix sorpresa", icon: "✨" },
  ],
};

export function mergeContent(config) {
  if (!config) return DEFAULT_CONTENT;
  return {
    hero: { ...DEFAULT_CONTENT.hero, ...(config.hero || {}) },
    precio:
      config.precio === undefined || config.precio === ""
        ? DEFAULT_CONTENT.precio
        : config.precio,
    precioPeriodo: config.precioPeriodo || DEFAULT_CONTENT.precioPeriodo,
    pasos: { ...DEFAULT_CONTENT.pasos, ...(config.pasos || {}) },
    beneficios:
      Array.isArray(config.beneficios) && config.beneficios.length
        ? config.beneficios
        : DEFAULT_CONTENT.beneficios,
    categorias:
      Array.isArray(config.categorias) && config.categorias.length
        ? config.categorias
        : DEFAULT_CONTENT.categorias,
  };
}
