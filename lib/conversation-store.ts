// lib/conversation-store.ts
// Stores per-phone-number conversation history so the agent has context
// across WhatsApp's stateless webhook calls.

import { getFirestore } from "firebase-admin/firestore";
import "@/src/lib/firebaseAdmin"; // ensures Admin is initialized

const db = getFirestore();
const COLLECTION = "whatsappConversations";
const MAX_TURNS = 20; // trim history to keep token usage sane

export type ChatMessage = {
  role: "user" | "assistant";
  content: any; // string or Claude content blocks (for tool_use / tool_result)
};

export async function getConversationHistory(
  phone: string
): Promise<ChatMessage[]> {
  const doc = await db.collection(COLLECTION).doc(phone).get();
  if (!doc.exists) return [];
  const data = doc.data();
  return (data?.messages ?? []) as ChatMessage[];
}

export async function saveConversationHistory(
  phone: string,
  messages: ChatMessage[]
) {
  const trimmed = messages.slice(-MAX_TURNS);
  await db
    .collection(COLLECTION)
    .doc(phone)
    .set(
      {
        messages: trimmed,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

export async function clearConversationHistory(phone: string) {
  await db.collection(COLLECTION).doc(phone).delete();
}
