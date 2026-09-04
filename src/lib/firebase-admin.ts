// src/lib/firebase-admin.ts
// Initializes Firebase Admin once, reused everywhere (Firestore access,
// the listing-retrieval tool, the conversation store, etc.)
//
// Expects a service account JSON in the FIREBASE_SERVICE_ACCOUNT env var
// (the whole JSON as a single-line string), OR individual
// FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY vars.
// Pick whichever matches how your existing Locari deployment is configured.

import { initializeApp, getApps, cert, App } from "firebase-admin/app";

function loadCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Private keys in env vars usually have literal "\n" — convert back to real newlines
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}

let adminApp: App;

if (!getApps().length) {
  adminApp = initializeApp({
    credential: cert(loadCredentials()),
  });
} else {
  adminApp = getApps()[0];
}

export { adminApp };
