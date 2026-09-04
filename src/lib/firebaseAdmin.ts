// src/lib/firebaseAdmin.ts
// Copied from the real Locari codebase (src/lib/firebaseAdmin.ts) so behavior
// matches exactly — same env vars, same init pattern.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!getApps().length) {
  try {
    if (projectId && clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          // Replace literal \n characters with actual newlines
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      });
      console.log("✅ Admin SDK Initialized Successfully (Modular)");
    } else {
      console.warn(
        "⚠️  [Admin SDK] Initialization Delayed: Missing environment variables (FIREBASE_PROJECT_ID, etc.). This is normal if you haven't set secrets yet."
      );
    }
  } catch (error: any) {
    console.error("❌ Admin SDK Initialization Failed:", error.message);
  }
}

export function getAdminAuth() {
  try {
    if (!getApps().length) return null;
    return getAuth();
  } catch (e) {
    console.error("[Admin SDK] Failed to get Auth instance:", e);
    return null;
  }
}

export function getAdminDb() {
  try {
    if (!getApps().length) return null;
    return getFirestore();
  } catch (e) {
    console.error("[Admin SDK] Failed to get Firestore instance:", e);
    return null;
  }
}
