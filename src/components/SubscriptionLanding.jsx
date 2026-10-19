import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import Lenis from "lenis";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { crearSuscripcion } from "../utils/mercadopago";
import { formatPhone, isValidEmail, formatPrecio } from "../utils/validations";
import { mergeContent } from "../config/defaults";
import SubscriptionSuccess from "./SubscriptionSuccess";

const COLLECTION = import.meta.env.VITE_FIRESTORE_COLLECTION || "suscriptores";
const CONFIG_COLLECTION = "config";
const CONFIG_DOC = "landing";

const heroImages = import.meta.glob("../assets/hero/*.{jpg,jpeg,png,webp,avif}", {
  eager: true,
  query: "?url",
  import: "default",
});
const HERO_IMAGE =
  Object.keys(heroImages)
    .sort()
    .map((key) => heroImages[key])[0] || "";

const STEPS = ["Tus datos", "Contacto", "Envío", "Preferencias"];

const HERO_EASE = [0.16, 1, 0.3, 1];

const heroItem = (delay) => ({
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: HERO_EASE, delay },
  },
});

const HORARIOS_ENTREGA = [
  { id: "manana", label: "Por la mañana", icon: "🌅" },
  { id: "tarde", label: "Por la tarde", icon: "🌇" },
];

const MAX_PREFERENCIAS = 2;

const initialForm = {
  nombre: "",
  nombreInstagram: "",
  dni: "",
  telefono: "",
  correo: "",
  direccion: "",
  departamento: "",
  ciudad: "",
  codigoPostal: "",
  horarioEntrega: "",
  preferencias: [],
};

export default function SubscriptionLanding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);
  const [yaSuscrito, setYaSuscrito] = useState(false);
  const [mock, setMock] = useState(false);
  const [config, setConfig] = useState(null);

  const formRef = useRef(null);
  const heroRef = useRef(null);
  const lenisRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenisRef.current = lenis;
    let frameId;
    const raf = (time) => {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    };
    frameId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const parallax = reduceMotion ? 0 : 1;
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", `${15 * parallax}%`]);
  const bgScale = useTransform(
    scrollYProgress,
    [0, 1],
    [1.05, 1.05 + 0.1 * parallax]
  );
  const contentOpacity = useTransform(
    scrollYProgress,
    [0, 0.75],
    [1, parallax ? 0 : 1]
  );
  const badgesY = useTransform(scrollYProgress, [0, 1], [0, -60 * parallax]);
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -110 * parallax]);
  const subtitleY = useTransform(scrollYProgress, [0, 1], [0, -150 * parallax]);
  const ctaY = useTransform(scrollYProgress, [0, 1], [0, -190 * parallax]);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC))
      .then((snap) => {
        if (active && snap.exists()) setConfig(snap.data());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const content = mergeContent(config);
  const { hero } = content;
  const clubNombre = hero.titulo;
  const heroImage = hero.imagenUrl || HERO_IMAGE;
  const categorias = content.categorias;
  const beneficios = content.beneficios;

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const togglePreferencia = (id) => {
    setForm((prev) => {
      const exists = prev.preferencias.includes(id);
      if (exists) {
        return {
          ...prev,
          preferencias: prev.preferencias.filter((p) => p !== id),
        };
      }
      if (prev.preferencias.length >= MAX_PREFERENCIAS) {
        return prev;
      }
      return { ...prev, preferencias: [...prev.preferencias, id] };
    });
    setTouched((prev) => ({ ...prev, preferencias: true }));
  };

  const selectHorario = (id) => {
    updateField("horarioEntrega", id);
    setTouched((prev) => ({ ...prev, horarioEntrega: true }));
  };

  const handleBlur = (name) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const getStepErrors = () => {
    const errors = {};
    if (step === 0) {
      if (!form.nombre.trim()) errors.nombre = "Ingresá tu nombre.";
      if (!form.dni.trim()) errors.dni = "Ingresá tu DNI.";
    }
    if (step === 1) {
      if (!isValidEmail(form.correo)) errors.correo = "Ingresá un email válido.";
      if (!formatPhone(form.telefono)) errors.telefono = "Ingresá tu teléfono.";
    }
    if (step === 2) {
      if (!form.direccion.trim()) errors.direccion = "Ingresá tu dirección.";
      if (!form.ciudad.trim()) errors.ciudad = "Ingresá tu ciudad.";
      if (!form.codigoPostal.trim()) errors.codigoPostal = "Ingresá tu código postal.";
      if (!form.horarioEntrega)
        errors.horarioEntrega = "Elegí un horario de entrega.";
    }
    if (step === 3) {
      if (form.preferencias.length < 1)
        errors.preferencias = "Elegí al menos una preferencia.";
    }
    return errors;
  };

  const stepErrors = getStepErrors();

  const validateStep = () => {
    const errors = getStepErrors();
    if (Object.keys(errors).length) {
      setTouched((prev) => ({
        ...prev,
        ...Object.keys(errors).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      }));
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateStep()) return;

    setLoading(true);
    setError("");

    try {
      const correo = form.correo.trim().toLowerCase();
      const subscriberId = correo;
      const subscriberRef = doc(db, COLLECTION, subscriberId);
      const existingSnap = await getDoc(subscriberRef);

      if (existingSnap.exists() && existingSnap.data()?.activo === true) {
        setYaSuscrito(true);
        setExito(true);
        return;
      }

      const subscriberData = {
        nombre: form.nombre.trim(),
        instagram: form.nombreInstagram.trim(),
        dni: form.dni.trim(),
        telefono: formatPhone(form.telefono),
        correo: subscriberId,
        direccion: form.direccion.trim(),
        departamento: form.departamento.trim(),
        ciudad: form.ciudad.trim(),
        codigoPostal: form.codigoPostal.trim(),
        horarioEntrega: form.horarioEntrega,
        preferencias: form.preferencias,
        activo: false,
        pendiente: true,
        fechaAlta: new Date().toISOString(),
        mercadopago_plan_id: null,
        mercadopago_preapproval_id: null,
        mercadopago_status: null,
        tema: "vivero",
        origen: "landing-vivero",
      };

      await setDoc(subscriberRef, subscriberData);

      if (import.meta.env.VITE_MOCK_MP === "true") {
        localStorage.setItem("clubSubscriberEmail", subscriberId);
        setMock(true);
        setExito(true);
        return;
      }

      const result = await crearSuscripcion({
        email: subscriberId,
        nombre: form.nombre.trim(),
      });

      if (result?.mock) {
        localStorage.setItem("clubSubscriberEmail", subscriberId);
        setMock(true);
        setExito(true);
        return;
      }

      const checkoutUrl =
        result?.checkout_url || result?.init_point || result?.sandbox_init_point;

      if (checkoutUrl) {
        localStorage.setItem("clubSubscriberEmail", subscriberId);
        window.location.href = checkoutUrl;
        return;
      }

      throw new Error("No pudimos generar el link de pago. Intentá nuevamente.");
    } catch (err) {
      setError(err.message || "Ocurrió un error. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const scrollToForm = () => {
    const target = formRef.current;
    if (!target) return;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, { offset: -16 });
    } else {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const errorBanner = Object.keys(stepErrors).length
    ? "Revisá los campos marcados para continuar."
    : "";

  if (exito) {
    return (
      <SubscriptionSuccess
        yaSuscrito={yaSuscrito}
        mock={mock}
        clubNombre={clubNombre}
        onVolver={() => {
          setExito(false);
          setYaSuscrito(false);
          setMock(false);
        }}
      />
    );
  }

  return (
    <div className="vc-page">
      <motion.section
        ref={heroRef}
        className={`vc-hero ${heroImage ? "vc-hero-imagen" : ""}`}
      >
        {heroImage && (
          <motion.div
            className="vc-hero-bg"
            aria-hidden="true"
            style={{
              backgroundImage: `url(${heroImage})`,
              y: bgY,
              scale: bgScale,
            }}
          />
        )}

        <motion.div
          className="vc-hero-inner"
          initial={reduceMotion ? "show" : "hidden"}
          animate="show"
          style={{ opacity: contentOpacity }}
        >
          <motion.div className="vc-hero-layer" style={{ y: badgesY }}>
            <motion.div className="vc-hero-badges" variants={heroItem(0.1)}>
              {hero.badge && <span className="vc-badge">{hero.badge}</span>}
              {import.meta.env.VITE_MOCK_MP === "true" && (
                <span className="vc-badge vc-badge-demo">Modo demo · sin pago real</span>
              )}
            </motion.div>
          </motion.div>

          <motion.div className="vc-hero-layer" style={{ y: titleY }}>
            <motion.h1 className="vc-title" variants={heroItem(0.22)}>
              {content.hero.titulo}
            </motion.h1>
          </motion.div>

          {hero.subtitulo && (
            <motion.div className="vc-hero-layer" style={{ y: subtitleY }}>
              <motion.p className="vc-subtitle" variants={heroItem(0.34)}>
                {hero.subtitulo}
              </motion.p>
            </motion.div>
          )}

          <motion.div className="vc-hero-layer" style={{ y: ctaY }}>
            <motion.div className="vc-hero-cta" variants={heroItem(0.46)}>
              {content.precio !== null && content.precio !== "" && (
                <div className="vc-price-box">
                  <span className="vc-price">{formatPrecio(content.precio)}</span>
                  <span className="vc-price-period">{content.precioPeriodo}</span>
                </div>
              )}

              <button
                type="button"
                className="vc-btn-primary"
                onClick={scrollToForm}
              >
                {hero.boton}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.section>

      <section className="vc-section">
        <div className="vc-benefits">
          {beneficios.map((benefit, index) => (
            <article className="vc-benefit-card" key={index}>
              <span className="vc-benefit-icon">{benefit.icon}</span>
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="vc-section vc-form-section" ref={formRef}>
        <div className="vc-form-card">
          <h2 className="vc-form-title">Sumate al {clubNombre}</h2>

          <div className="vc-progress">
            {STEPS.map((label, index) => (
              <div
                key={label}
                className={`vc-progress-step ${index <= step ? "is-active" : ""}`}
              >
                <span className="vc-progress-dot">{index + 1}</span>
                <span className="vc-progress-label">{label}</span>
              </div>
            ))}
          </div>

          <form className="vc-form" onSubmit={handleSubmit} noValidate>
            {error && <div className="vc-error-banner">{error}</div>}

            {step === 0 && (
              <div className="vc-step">
                <label className="vc-field">
                  <span>Nombre y apellido</span>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => updateField("nombre", e.target.value)}
                    onBlur={() => handleBlur("nombre")}
                    placeholder="Juana Pérez"
                    autoComplete="name"
                  />
                  {touched.nombre && stepErrors.nombre && (
                    <small className="vc-field-error">{stepErrors.nombre}</small>
                  )}
                </label>

                <label className="vc-field">
                  <span>Instagram (opcional)</span>
                  <input
                    type="text"
                    value={form.nombreInstagram}
                    onChange={(e) => updateField("nombreInstagram", e.target.value)}
                    placeholder="@tucuenta"
                  />
                </label>

                <label className="vc-field">
                  <span>DNI</span>
                  <input
                    type="text"
                    value={form.dni}
                    onChange={(e) => updateField("dni", e.target.value)}
                    onBlur={() => handleBlur("dni")}
                    placeholder="30123456"
                  />
                  {touched.dni && stepErrors.dni && (
                    <small className="vc-field-error">{stepErrors.dni}</small>
                  )}
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="vc-step">
                <label className="vc-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.correo}
                    onChange={(e) => updateField("correo", e.target.value)}
                    onBlur={() => handleBlur("correo")}
                    placeholder="tu@email.com"
                    autoComplete="email"
                  />
                  {touched.correo && stepErrors.correo && (
                    <small className="vc-field-error">{stepErrors.correo}</small>
                  )}
                </label>

                <label className="vc-field">
                  <span>Teléfono</span>
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => updateField("telefono", e.target.value)}
                    onBlur={() => handleBlur("telefono")}
                    placeholder="11 5555 5555"
                    autoComplete="tel"
                  />
                  {touched.telefono && stepErrors.telefono && (
                    <small className="vc-field-error">{stepErrors.telefono}</small>
                  )}
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="vc-step">
                <label className="vc-field">
                  <span>Dirección</span>
                  <input
                    type="text"
                    value={form.direccion}
                    onChange={(e) => updateField("direccion", e.target.value)}
                    onBlur={() => handleBlur("direccion")}
                    placeholder="Av. Siempre Viva 123"
                    autoComplete="street-address"
                  />
                  {touched.direccion && stepErrors.direccion && (
                    <small className="vc-field-error">{stepErrors.direccion}</small>
                  )}
                </label>

                <label className="vc-field">
                  <span>Piso / Depto (opcional)</span>
                  <input
                    type="text"
                    value={form.departamento}
                    onChange={(e) => updateField("departamento", e.target.value)}
                    placeholder="3° B"
                  />
                </label>

                <label className="vc-field">
                  <span>Ciudad</span>
                  <input
                    type="text"
                    value={form.ciudad}
                    onChange={(e) => updateField("ciudad", e.target.value)}
                    onBlur={() => handleBlur("ciudad")}
                    placeholder="Buenos Aires"
                    autoComplete="address-level2"
                  />
                  {touched.ciudad && stepErrors.ciudad && (
                    <small className="vc-field-error">{stepErrors.ciudad}</small>
                  )}
                </label>

                <label className="vc-field">
                  <span>Código postal</span>
                  <input
                    type="text"
                    value={form.codigoPostal}
                    onChange={(e) => updateField("codigoPostal", e.target.value)}
                    onBlur={() => handleBlur("codigoPostal")}
                    placeholder="1425"
                    autoComplete="postal-code"
                  />
                  {touched.codigoPostal && stepErrors.codigoPostal && (
                    <small className="vc-field-error">{stepErrors.codigoPostal}</small>
                  )}
                </label>

                <div className="vc-field">
                  <span>Horario de entrega</span>
                  <div className="vc-entrega-opciones">
                    {HORARIOS_ENTREGA.map((horario) => {
                      const selected = form.horarioEntrega === horario.id;
                      return (
                        <button
                          type="button"
                          key={horario.id}
                          className={`vc-categoria ${selected ? "is-selected" : ""}`}
                          onClick={() => selectHorario(horario.id)}
                          aria-pressed={selected}
                        >
                          <span className="vc-categoria-icon">{horario.icon}</span>
                          <span className="vc-categoria-label">{horario.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {touched.horarioEntrega && stepErrors.horarioEntrega && (
                    <small className="vc-field-error">
                      {stepErrors.horarioEntrega}
                    </small>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="vc-step">
                <p className="vc-step-hint">
                  Elegí entre 1 y {MAX_PREFERENCIAS} preferencias.
                </p>
                <div className="vc-categorias">
                  {categorias.map((categoria) => {
                    const selected = form.preferencias.includes(categoria.id);
                    const limitReached =
                      form.preferencias.length >= MAX_PREFERENCIAS;
                    return (
                      <button
                        type="button"
                        key={categoria.id}
                        className={`vc-categoria ${selected ? "is-selected" : ""}`}
                        onClick={() => togglePreferencia(categoria.id)}
                        aria-pressed={selected}
                        disabled={!selected && limitReached}
                      >
                        <span className="vc-categoria-icon">{categoria.icon}</span>
                        <span className="vc-categoria-label">{categoria.label}</span>
                      </button>
                    );
                  })}
                </div>
                {touched.preferencias && stepErrors.preferencias && (
                  <small className="vc-field-error">{stepErrors.preferencias}</small>
                )}
              </div>
            )}

            {errorBanner && !error && (
              <div className="vc-error-banner">{errorBanner}</div>
            )}

            <div className="vc-form-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="vc-btn-secondary"
                  onClick={back}
                  disabled={loading}
                >
                  Atrás
                </button>
              )}

              {step < STEPS.length - 1 ? (
                <button type="button" className="vc-btn-primary" onClick={next}>
                  Continuar
                </button>
              ) : (
                <button type="submit" className="vc-btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="vc-spinner" aria-hidden="true" />
                      Procesando...
                    </>
                  ) : (
                    "Suscribirme"
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      <footer className="vc-footer">
        <p>
          {clubNombre} · Suscripción mensual · Cancelá cuando quieras.
        </p>
      </footer>
    </div>
  );
}
