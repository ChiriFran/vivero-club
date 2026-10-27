import { auth } from "../firebase/admin";
import { db } from "../firebase/config";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

const COLLECTION = import.meta.env.VITE_FIRESTORE_COLLECTION || "suscriptores";
const CONFIG_COLLECTION = "config";
const CONFIG_DOC = "landing";
const HISTORIAL_SUBCOLLECTION = "historialPagos";

function toSubscriber(id, data) {
  return {
    id,
    nombre: data.nombre || "",
    correo: data.correo || id,
    telefono: data.telefono || "",
    dni: data.dni || "",
    instagram: data.instagram || "",
    direccion: data.direccion || "",
    departamento: data.departamento || "",
    ciudad: data.ciudad || "",
    codigoPostal: data.codigoPostal || "",
    horarioEntrega: data.horarioEntrega || "",
    preferencias: Array.isArray(data.preferencias) ? data.preferencias : [],
    activo: data.activo === true,
    pendiente: data.pendiente === true,
    mercadopago_plan_id: data.mercadopago_plan_id || null,
    mercadopago_preapproval_id: data.mercadopago_preapproval_id || null,
    mercadopago_status: data.mercadopago_status || null,
    fechaAlta: data.fechaAlta || null,
    fechaPrimerPago: data.fechaPrimerPago || null,
    fechaUltimoPago: data.fechaUltimoPago || null,
    fechaProximoCobro: data.fechaProximoCobro || null,
    fechaCancelacion: data.fechaCancelacion || null,
  };
}

function buildStats(subscribers) {
  return {
    total: subscribers.length,
    activos: subscribers.filter((s) => s.activo).length,
    pendientes: subscribers.filter((s) => !s.activo && s.pendiente).length,
    cancelados: subscribers.filter((s) => s.mercadopago_status === "cancelled")
      .length,
  };
}

export async function adminLogin(email, password) {
  await signInWithEmailAndPassword(auth, String(email).trim(), password);
}

export async function adminLogout() {
  await signOut(auth);
}

export async function fetchConfig() {
  const snap = await getDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC));
  return snap.exists() ? snap.data() : null;
}

export async function saveConfig(config) {
  await setDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC), config, { merge: true });
  return config;
}

export async function fetchSubscribers() {
  const snap = await getDocs(collection(db, COLLECTION));
  const suscriptores = snap.docs
    .map((d) => toSubscriber(d.id, d.data()))
    .sort((a, b) =>
      String(b.fechaAlta || "").localeCompare(String(a.fechaAlta || ""))
    );
  return { suscriptores, stats: buildStats(suscriptores) };
}

export async function fetchHistorial(email) {
  const id = String(email).trim().toLowerCase();
  const ref = collection(db, COLLECTION, id, HISTORIAL_SUBCOLLECTION);

  try {
    const snap = await getDocs(query(ref, orderBy("fecha", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await getDocs(ref);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  }
}

export async function updateSubscriber(email, action) {
  const id = String(email).trim().toLowerCase();
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Suscriptor no encontrado.");

  if (action === "activar") {
    await setDoc(
      ref,
      { activo: true, pendiente: false, mercadopago_status: "manual" },
      { merge: true }
    );
  } else if (action === "pausar") {
    await setDoc(
      ref,
      {
        activo: false,
        pendiente: true,
        mercadopago_status: "paused",
        fechaProximoCobro: null,
      },
      { merge: true }
    );
  } else if (action === "cancelar") {
    await setDoc(
      ref,
      {
        activo: false,
        pendiente: false,
        mercadopago_status: "cancelled",
        fechaCancelacion: new Date().toISOString(),
        fechaProximoCobro: null,
      },
      { merge: true }
    );
  } else if (action === "eliminar") {
    await deleteDoc(ref);
    return { status: "deleted", email: id };
  } else {
    throw new Error("Acción no válida.");
  }

  const updated = await getDoc(ref);
  return {
    status: action,
    suscriptor: updated.exists()
      ? toSubscriber(updated.id, updated.data())
      : null,
  };
}
