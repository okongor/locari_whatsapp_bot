// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  parseInboundPayload,
  sendTextMessage,
  sendListingImage,
  sendListingsPicker,
  buildListingCaption,
} from "@/lib/whatsapp";
import {
  getConversationHistory,
  saveConversationHistory,
} from "@/lib/conversation-store";
import { runAgentTurn } from "@/lib/llm-agent";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;

/**
 * Meta calls this once when you register the webhook URL in the
 * App Dashboard, to confirm you own the endpoint.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Meta POSTs here for every inbound message, delivery receipt, etc.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Always 200 quickly — Meta retries aggressively on non-200s.
  // Do the real work, but don't let a downstream error surface as a webhook failure.
  try {
    const inbound = parseInboundPayload(body);
    if (!inbound || !inbound.text) {
      return NextResponse.json({ ok: true });
    }

    const { from, text } = inbound;

    const history = await getConversationHistory(from);
    const { replyText, listings, updatedHistory } = await runAgentTurn(
      history,
      text
    );

    // Send the assistant's natural-language reply first
    if (replyText) {
      await sendTextMessage(from, replyText);
    }

    // Then send the actual listings, if any were found
    if (listings && listings.length > 0) {
      if (listings.length === 1) {
        const l = listings[0];
        const image = l.imageUrls?.[0];
        if (image) {
          await sendListingImage(from, image, buildListingCaption(l));
        }
      } else {
        await sendListingsPicker(
          from,
          "Here's what I found — tap to see details:",
          listings.map((l: any) => ({
            id: l.id,
            title: l.title,
            yearlyRent: l.yearlyRent,
            beds: l.beds,
            lga: l.address?.lga,
            state: l.address?.state,
          }))
        );
      }
    }

    await saveConversationHistory(from, updatedHistory);
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    // Optionally notify the user something went wrong, best-effort
  }

  return NextResponse.json({ ok: true });
}
