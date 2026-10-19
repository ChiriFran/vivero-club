export const DEFAULT_CONTENT = {
  hero: {
    badge: "Suscripción mensual",
    titulo: "Vivero Club",
    subtitulo:
      "Suscribite a nuestro club del vivero y recibí cada mes una caja con plantas, macetas y productos seleccionados en tu puerta.",
    boton: "Quiero suscribirme",
    imagenUrl: "",
  },
  precio: null,
  precioPeriodo: "/ mes",
  beneficios: [
    {
      icon: "📦",
      title: "Caja curada mensual",
      text: "Seleccionamos plantas y productos según tus preferencias.",
    },
    {
      icon: "🌱",
      title: "Productos seleccionados",
      text: "Materiales de calidad y ejemplares cuidados por especialistas.",
    },
    {
      icon: "🚚",
      title: "Envío mensual incluido",
      text: "Recibís tu caja todos los meses sin costo extra de envío.",
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
