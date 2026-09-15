// lib/wati.ts
// Thin wrapper around the WATI API (https://docs.wati.io).
// Requires env vars: WATI_API_ENDPOINT (e.g. https://live-mt-server.wati.io/123456),
// WATI_ACCESS_TOKEN (the Bearer token shown in Wati → More → API Docs)

const API_ENDPOINT = process.env.WATI_API_ENDPOINT!; // no trailing slash
const ACCESS_TOKEN = process.env.WATI_ACCESS_TOKEN!; // paste exactly as shown in Wati's API Docs page

function authHeaders() {
  // Wati's dashboard usually displays the token already prefixed with "Bearer ".
  // Handle both cases so a copy-paste either way still works.
  const value = ACCESS_TOKEN.startsWith("Bearer ")
    ? ACCESS_TOKEN
    : `Bearer ${ACCESS_TOKEN}`;
  return {
    Authorization: value,
    "Content-Type": "application/json",
  };
}

async function callWatiApi(path: string, body: Record<string, any>) {
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WATI API error (${res.status}): ${errText}`);
  }

  return res.json();
}

/** Send a plain text message to an already-open session (user messaged within last 24h) */
export async function sendTextMessage(to: string, body: string) {
  return callWatiApi(
    `/api/v1/sendSessionMessage/${encodeURIComponent(to)}?messageText=${encodeURIComponent(body)}`,
    {}
  );
}

/** Send a single listing as an image + caption */
export async function sendListingImage(to: string, imageUrl: string, caption: string) {
  return callWatiApi(
    `/api/v1/sendSessionFileViaUrl/${encodeURIComponent(to)}?fileUrl=${encodeURIComponent(
      imageUrl
    )}&caption=${encodeURIComponent(caption)}`,
    {}
  );
}

export type WatiListRow = { title: string; description?: string };
export type WatiListSection = { title: string; rows: WatiListRow[] };

/** Interactive list message — up to 10 rows across sections */
export async function sendListMessage(
  to: string,
  body: string,
  buttonText: string,
  sections: WatiListSection[]
) {
  return callWatiApi(`/api/v1/sendInteractiveListMessage?whatsappNumber=${encodeURIComponent(to)}`, {
    body,
    buttonText,
    sections,
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

/** Multiple matching listings — sent as an interactive list picker */
export async function sendListingsPicker(
  to: string,
  bodyText: string,
  listings: ListingSummary[]
) {
  const rows = listings.slice(0, 10).map((l) => ({
    title: l.title.slice(0, 24),
    description: `₦${l.yearlyRent.toLocaleString()}/yr · ${l.beds} beds · ${l.lga ?? ""}, ${
      l.state ?? ""
    }`.slice(0, 72),
  }));

  return sendListMessage(to, bodyText, "View listings", [
    { title: "Matching properties", rows },
  ]);
}

export function formatCurrency(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

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
    `${formatCurrency(l.yearlyRent)}/year · ${l.beds} beds${l.baths ? ` · ${l.baths} baths` : ""}`,
    `${l.address.lga}, ${l.address.state}`,
  ];
  if (l.aiCommentary) lines.push(`\n${l.aiCommentary}`);
  return lines.join("\n");
}

// ---- Inbound payload parsing ----

export type InboundMessage = {
  from: string; // WhatsApp number (waId)
  text: string; // typed text, or the tapped row/button's title
  type: "text" | "interactive" | "other";
};

/**
 * Wati's "Message Received" webhook sends a flat JSON object (not nested
 * like Meta's), with `waId` as the sender and `listReply`/`buttonReply`
 * populated for interactive taps. See docs.wati.io/reference/message-received
 */
export function parseInboundPayload(body: any): InboundMessage | null {
  if (!body || !body.waId) return null;

  const from = body.waId as string;

  const listReply = body.listReply;
  const buttonReply = body.buttonReply ?? body.interactiveButtonReply;

  if (listReply) {
    return {
      from,
      text: listReply.title ?? listReply.text ?? "",
      type: "interactive",
    };
  }

  if (buttonReply) {
    return {
      from,
      text: buttonReply.title ?? buttonReply.text ?? "",
      type: "interactive",
    };
  }

  if (body.type === "text" && body.text) {
    return { from, text: body.text as string, type: "text" };
  }

  return { from, text: "", type: "other" };
}
