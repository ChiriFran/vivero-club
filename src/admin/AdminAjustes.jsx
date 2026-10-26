import { useEffect, useRef, useState } from "react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/admin";
import { fetchConfig, saveConfig } from "../utils/admin";
import { DEFAULT_CONTENT } from "../config/defaults";

const emptyConfig = {
  hero: { ...DEFAULT_CONTENT.hero },
  precio: "",
  precioPeriodo: DEFAULT_CONTENT.precioPeriodo,
  pasos: { ...DEFAULT_CONTENT.pasos },
  beneficios: DEFAULT_CONTENT.beneficios,
  categorias: DEFAULT_CONTENT.categorias,
};

export default function AdminAjustes() {
  const [config, setConfig] = useState(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [nuevaImagen, setNuevaImagen] = useState("");

  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((cfg) => {
        if (!active || !cfg) return;
        const heroCfg = { ...DEFAULT_CONTENT.hero, ...(cfg.hero || {}) };
        const imagenes = Array.isArray(heroCfg.imagenes)
          ? heroCfg.imagenes.filter(Boolean)
          : [];
        if (!imagenes.length && heroCfg.imagenUrl) {
          imagenes.push(heroCfg.imagenUrl);
        }
        setConfig({
          hero: { ...heroCfg, imagenes, imagenUrl: "" },
          precio: cfg.precio ?? "",
          precioPeriodo: cfg.precioPeriodo || DEFAULT_CONTENT.precioPeriodo,
          pasos: { ...DEFAULT_CONTENT.pasos, ...(cfg.pasos || {}) },
          beneficios:
            Array.isArray(cfg.beneficios) && cfg.beneficios.length
              ? cfg.beneficios
              : DEFAULT_CONTENT.beneficios,
          categorias:
            Array.isArray(cfg.categorias) && cfg.categorias.length
              ? cfg.categorias
              : DEFAULT_CONTENT.categorias,
        });
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const updateHero = (name, value) => {
    setConfig((prev) => ({ ...prev, hero: { ...prev.hero, [name]: value } }));
    setOk("");
  };

  const updatePasos = (name, value) => {
    setConfig((prev) => ({ ...prev, pasos: { ...prev.pasos, [name]: value } }));
    setOk("");
  };

  const update = (name, value) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
    setOk("");
  };

  const updateItem = (key, index, name, value) => {
    setConfig((prev) => ({
      ...prev,
      [key]: prev[key].map((item, i) =>
        i === index ? { ...item, [name]: value } : item
      ),
    }));
    setOk("");
  };

  const addItem = (key, template, limit) => {
    setConfig((prev) => {
      if (prev[key].length >= limit) return prev;
      return { ...prev, [key]: [...prev[key], template] };
    });
  };

  const removeItem = (key, index) => {
    setConfig((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index),
    }));
  };

  const updateImagen = (index, value) => {
    setConfig((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        imagenes: prev.hero.imagenes.map((url, i) =>
          i === index ? value : url
        ),
      },
    }));
    setOk("");
  };

  const addImagen = () => {
    const url = nuevaImagen.trim();
    if (!url) return;
    setConfig((prev) => ({
      ...prev,
      hero: { ...prev.hero, imagenes: [...prev.hero.imagenes, url] },
    }));
    setNuevaImagen("");
    setOk("");
  };

  const removeImagen = (index) => {
    setConfig((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        imagenes: prev.hero.imagenes.filter((_, i) => i !== index),
      },
    }));
    setOk("");
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setOk("");
    try {
      const path = `hero/${Date.now()}-${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      setConfig((prev) => ({
        ...prev,
        hero: { ...prev.hero, imagenes: [...prev.hero.imagenes, url] },
      }));
      setOk("Imagen subida. Guardá los cambios para aplicarla.");
    } catch (err) {
      setError(
        "No se pudo subir la imagen. Verificá que Firebase Storage esté activo. " +
          (err.message || "")
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const payload = {
        ...config,
        precio: config.precio === "" ? null : Number(config.precio),
      };
      await saveConfig(payload);
      setOk("Cambios guardados correctamente.");
    } catch (err) {
      setError(err.message || "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="adm-loading">Cargando ajustes...</div>;

  return (
    <form className="adm-panel" onSubmit={handleSubmit}>
      <div className="adm-panel-head">
        <h2>Ajustes de la landing</h2>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      {ok && <div className="adm-alert adm-alert-ok">{ok}</div>}

      <section className="adm-card">
        <h3>Hero · textos</h3>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>Badge (etiqueta superior)</span>
            <input
              type="text"
              value={config.hero.badge}
              onChange={(e) => updateHero("badge", e.target.value)}
              placeholder="Suscripción mensual"
            />
          </label>
          <label className="adm-field">
            <span>Texto del botón</span>
            <input
              type="text"
              value={config.hero.boton}
              onChange={(e) => updateHero("boton", e.target.value)}
              placeholder="Quiero suscribirme"
            />
          </label>
        </div>

        <label className="adm-field">
          <span>Título</span>
          <input
            type="text"
            value={config.hero.titulo}
            onChange={(e) => updateHero("titulo", e.target.value)}
            placeholder="Vivero Club"
          />
        </label>

        <label className="adm-field">
          <span>Subtítulo</span>
          <textarea
            rows={3}
            value={config.hero.subtitulo}
            onChange={(e) => updateHero("subtitulo", e.target.value)}
            placeholder="Suscribite a nuestro club del vivero..."
          />
        </label>
      </section>

      <section className="adm-card">
        <h3>Hero · imágenes</h3>
        <p className="adm-hint">
          Se muestran como carrusel. Si no agregás ninguna, se usan las imágenes
          de <code>src/assets/hero</code>.
        </p>

        {config.hero.imagenes.map((url, index) => (
          <div className="adm-image-row" key={index}>
            <div className="adm-image-thumb">
              {url ? <img src={url} alt="" /> : null}
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => updateImagen(index, e.target.value)}
              placeholder="https://... o /hero/imagen.jpg"
              aria-label={`URL de la imagen ${index + 1}`}
            />
            <button
              type="button"
              className="adm-icon-btn"
              onClick={() => removeImagen(index)}
              aria-label={`Eliminar imagen ${index + 1}`}
            >
              ×
            </button>
          </div>
        ))}

        <div className="adm-image-add">
          <input
            type="text"
            value={nuevaImagen}
            onChange={(e) => setNuevaImagen(e.target.value)}
            placeholder="Pegá una URL para agregar"
            aria-label="Nueva URL de imagen"
          />
          <button
            type="button"
            className="adm-btn adm-btn-ghost"
            onClick={addImagen}
            disabled={!nuevaImagen.trim()}
          >
            + Agregar
          </button>
        </div>

        <div className="adm-upload">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
          />
          <span className="adm-hint">
            {uploading
              ? "Subiendo..."
              : "O subí un archivo y se suma a la galería (Firebase Storage)."}
          </span>
        </div>
      </section>

      <section className="adm-card">
        <h3>Hero · badges de la imagen</h3>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>Badge superior · texto</span>
            <input
              type="text"
              value={config.hero.imagenBadgeArriba}
              onChange={(e) => updateHero("imagenBadgeArriba", e.target.value)}
              placeholder="Plantas seleccionadas"
            />
          </label>
          <label className="adm-field">
            <span>Badge superior · ícono</span>
            <input
              type="text"
              value={config.hero.imagenBadgeArribaIcono}
              onChange={(e) =>
                updateHero("imagenBadgeArribaIcono", e.target.value)
              }
              placeholder="🌿"
            />
          </label>
          <label className="adm-field">
            <span>Badge inferior · texto</span>
            <input
              type="text"
              value={config.hero.imagenBadgeAbajo}
              onChange={(e) => updateHero("imagenBadgeAbajo", e.target.value)}
              placeholder="Envío incluido"
            />
          </label>
          <label className="adm-field">
            <span>Badge inferior · ícono</span>
            <input
              type="text"
              value={config.hero.imagenBadgeAbajoIcono}
              onChange={(e) =>
                updateHero("imagenBadgeAbajoIcono", e.target.value)
              }
              placeholder="🚚"
            />
          </label>
        </div>
        <p className="adm-hint">
          Dejá el texto vacío para ocultar el badge correspondiente.
        </p>
      </section>

      <section className="adm-card">
        <h3>Precio</h3>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>Precio mensual ($)</span>
            <input
              type="number"
              value={config.precio}
              onChange={(e) => update("precio", e.target.value)}
              placeholder="Dejar vacío para no mostrar precio"
            />
          </label>
          <label className="adm-field">
            <span>Período</span>
            <input
              type="text"
              value={config.precioPeriodo}
              onChange={(e) => update("precioPeriodo", e.target.value)}
              placeholder="/ mes"
            />
          </label>
        </div>
        <p className="adm-hint">
          El precio mostrado es informativo. El monto real del cobro lo define el
          plan de suscripción en MercadoPago.
        </p>
      </section>

      <section className="adm-card">
        <h3>Sección de pasos</h3>
        <div className="adm-grid-2">
          <label className="adm-field">
            <span>Etiqueta superior</span>
            <input
              type="text"
              value={config.pasos.eyebrow}
              onChange={(e) => updatePasos("eyebrow", e.target.value)}
              placeholder="Cómo funciona"
            />
          </label>
          <label className="adm-field">
            <span>Título</span>
            <input
              type="text"
              value={config.pasos.titulo}
              onChange={(e) => updatePasos("titulo", e.target.value)}
              placeholder="Tu caja, paso a paso"
            />
          </label>
        </div>
        <label className="adm-field">
          <span>Subtítulo</span>
          <textarea
            rows={2}
            value={config.pasos.subtitulo}
            onChange={(e) => updatePasos("subtitulo", e.target.value)}
            placeholder="Explicá brevemente cómo funciona el club..."
          />
        </label>
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h3>Pasos · contenido</h3>
          <button
            type="button"
            className="adm-btn adm-btn-ghost"
            onClick={() =>
              addItem("beneficios", { icon: "🌿", title: "", text: "" }, 3)
            }
            disabled={config.beneficios.length >= 3}
          >
            + Agregar
          </button>
        </div>
        <p className="adm-hint">
          La sección “Cómo funciona” está pensada para mostrar 3 pasos.
        </p>

        {config.beneficios.map((beneficio, index) => (
          <div className="adm-step-editor" key={index}>
            <div className="adm-step-editor-head">
              <span className="adm-step-index">Paso {index + 1}</span>
              <button
                type="button"
                className="adm-icon-btn"
                onClick={() => removeItem("beneficios", index)}
                aria-label={`Eliminar paso ${index + 1}`}
              >
                ×
              </button>
            </div>
            <div className="adm-step-fields">
              <label className="adm-field adm-field-icon">
                <span>Ícono</span>
                <input
                  className="adm-beneficio-icon"
                  type="text"
                  value={beneficio.icon}
                  onChange={(e) =>
                    updateItem("beneficios", index, "icon", e.target.value)
                  }
                  placeholder="🌿"
                />
              </label>
              <label className="adm-field">
                <span>Título</span>
                <input
                  type="text"
                  value={beneficio.title}
                  onChange={(e) =>
                    updateItem("beneficios", index, "title", e.target.value)
                  }
                  placeholder="Título del paso"
                />
              </label>
            </div>
            <label className="adm-field">
              <span>Descripción</span>
              <textarea
                rows={2}
                value={beneficio.text}
                onChange={(e) =>
                  updateItem("beneficios", index, "text", e.target.value)
                }
                placeholder="Descripción del paso"
              />
            </label>
          </div>
        ))}
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h3>Preferencias (paso 4 del formulario)</h3>
          <button
            type="button"
            className="adm-btn adm-btn-ghost"
            onClick={() =>
              addItem("categorias", { id: "", label: "", icon: "🌿" }, 8)
            }
            disabled={config.categorias.length >= 8}
          >
            + Agregar
          </button>
        </div>

        {config.categorias.map((categoria, index) => (
          <div className="adm-cat-row" key={index}>
            <label className="adm-field adm-field-icon">
              <span>Ícono</span>
              <input
                className="adm-beneficio-icon"
                type="text"
                value={categoria.icon}
                onChange={(e) =>
                  updateItem("categorias", index, "icon", e.target.value)
                }
                placeholder="🌵"
              />
            </label>
            <label className="adm-field">
              <span>ID</span>
              <input
                type="text"
                value={categoria.id}
                onChange={(e) =>
                  updateItem("categorias", index, "id", e.target.value)
                }
                placeholder="suculentas"
              />
            </label>
            <label className="adm-field">
              <span>Nombre visible</span>
              <input
                type="text"
                value={categoria.label}
                onChange={(e) =>
                  updateItem("categorias", index, "label", e.target.value)
                }
                placeholder="Suculentas"
              />
            </label>
            <button
              type="button"
              className="adm-icon-btn"
              onClick={() => removeItem("categorias", index)}
              aria-label={`Eliminar preferencia ${index + 1}`}
            >
              ×
            </button>
          </div>
        ))}
        <p className="adm-hint">
          El &ldquo;id&rdquo; se guarda con cada suscriptor. Evitá cambiarlo una vez
          que hay suscriptores con esa preferencia.
        </p>
      </section>
    </form>
  );
}
