// lib/whatsapp.ts
// Thin wrapper around the Meta WhatsApp Cloud API.
// Requires env vars: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN

const GRAPH_API_VERSION = "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN!;

const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

async function callGraphApi(payload: Record<string, any>) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp API error (${res.status}): ${errText}`);
  }

  return res.json();
}

/** Send a plain text reply */
export async function sendTextMessage(to: string, body: string) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

/** Send a single listing as an image + caption */
export async function sendListingImage(
  to: string,
  imageUrl: string,
  caption: string
) {
  return callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: imageUrl, caption },
  });
}

export type ListingSummary = {
  id: string;
  title: string;
  yearlyRent: number;
  beds: number;
  lga?: string;
  state?: string;
};

/**
 * Send up to 10 listings as a WhatsApp interactive list message.
 * Use this when there are multiple matches instead of dumping images.
 */
export async function sendListingsPicker(
  to: string,
  bodyText: string,
  listings: ListingSummary[]
) {
  const rows = listings.slice(0, 10).map((l) => ({
    id: `listing_${l.id}`,
    title: l.title.slice(0, 24), // WhatsApp row title limit
    description: `₦${l.yearlyRent.toLocaleString()}/yr · ${l.beds} beds · ${l.lga ?? ""}, ${
      l.state ?? ""
    }`.slice(0, 72),
  }));

  return callGraphApi({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: "View listings",
        sections: [{ title: "Matching properties", rows }],
      },
    },
  });
}

export function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

/** Build a caption for a single listing image message */
export function buildListingCaption(l: {
  title: string;
  yearlyRent: number;
  beds: number;
  baths?: number;
  address: { lga: string; state: string };
  aiCommentary?: string;
}) {
  const lines = [
    `*${l.title}*`,
    `${formatCurrency(l.yearlyRent)}/year · ${l.beds} beds${
      l.baths ? ` · ${l.baths} baths` : ""
    }`,
    `${l.address.lga}, ${l.address.state}`,
  ];
  if (l.aiCommentary) lines.push(`\n${l.aiCommentary}`);
  return lines.join("\n");
}

// ---- Inbound payload parsing ----

export type InboundMessage = {
  from: string;
  text: string;
  type: "text" | "interactive" | "other";
  interactiveReplyId?: string;
};

/** Parses the raw Meta webhook POST body into a normalized message, or null if not a user message */
export function parseInboundPayload(body: any): InboundMessage | null {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];
  if (!message) return null;

  const from = message.from;

  if (message.type === "text") {
    return { from, text: message.text.body, type: "text" };
  }

  if (message.type === "interactive") {
    const listReply = message.interactive?.list_reply;
    return {
      from,
      text: listReply?.title ?? "",
      type: "interactive",
      interactiveReplyId: listReply?.id,
    };
  }

  return { from, text: "", type: "other" };
}
