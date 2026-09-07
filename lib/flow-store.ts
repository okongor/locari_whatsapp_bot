// lib/flow-store.ts
// Tracks each phone number's current position in the button/list-driven
// menu flow, plus whatever search filters they've selected so far.

import { getFirestore } from "firebase-admin/firestore";
import "@/src/lib/firebaseAdmin";

const db = getFirestore();
const COLLECTION = "whatsappFlowState";

export type FlowStep =
  | "start"
  | "awaiting_property_type"
  | "awaiting_location"
  | "awaiting_location_text"
  | "awaiting_budget"
  | "awaiting_beds"
  | "done";

export type FlowFilters = {
  propertyType?: string;
  location?: string;
  maxPrice?: number;
  beds?: number;
};

export type FlowState = {
  step: FlowStep;
  filters: FlowFilters;
};

const DEFAULT_STATE: FlowState = { step: "start", filters: {} };

export async function getFlowState(phone: string): Promise<FlowState> {
  const doc = await db.collection(COLLECTION).doc(phone).get();
  if (!doc.exists) return { ...DEFAULT_STATE };
  const data = doc.data();
  return {
    step: (data?.step as FlowStep) ?? "start",
    filters: data?.filters ?? {},
  };
}

export async function saveFlowState(phone: string, state: FlowState) {
  await db.collection(COLLECTION).doc(phone).set(
    {
      step: state.step,
      filters: state.filters,
      updatedAt: new Date().toISOString(),
    },
    { merge: false }
  );
}

export async function resetFlowState(phone: string) {
  await saveFlowState(phone, { ...DEFAULT_STATE });
}
