import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let appInstance = null;

function normalizePrivateKey(key) {
  if (!key) return "";
  return key
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");
}

export function getFirebaseAdmin() {
  if (appInstance) return appInstance;

  const apps = getApps();
  if (apps.length) {
    appInstance = getApp();
    return appInstance;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan credenciales de Firebase Admin (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)."
    );
  }

  appInstance = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return appInstance;
}

export function getDb() {
  const app = getFirebaseAdmin();
  return getFirestore(app);
}

export function getCollectionName() {
  return process.env.FIRESTORE_COLLECTION || "suscriptores";
}
