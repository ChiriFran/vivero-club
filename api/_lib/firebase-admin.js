import admin from "firebase-admin";

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

  if (admin.apps.length) {
    appInstance = admin.app();
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

  appInstance = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return appInstance;
}

export function getDb() {
  const app = getFirebaseAdmin();
  return admin.firestore(app);
}

export function getCollectionName() {
  return process.env.FIRESTORE_COLLECTION || "suscriptores";
}

export default admin;
