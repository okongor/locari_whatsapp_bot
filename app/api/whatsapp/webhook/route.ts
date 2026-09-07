// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  parseInboundPayload,
  sendTextMessage,
  sendListMessage,
  sendListingImage,
  sendListingsPicker,
  buildListingCaption,
} from "@/lib/whatsapp";
import { getFlowState, saveFlowState, resetFlowState } from "@/lib/flow-store";
import { getMenuMessage, advanceFlow } from "@/lib/menu-flow";
import { getPropertyListings } from "@/src/ai/tools/listing-retrieval";

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

/** Sends whatever WhatsApp message a given menu step calls for */
async function sendMenuStep(to: string, step: Parameters<typeof getMenuMessage>[0]) {
  const message = getMenuMessage(step);
  if (message.kind === "list") {
    await sendListMessage(to, message.body, message.buttonLabel, [
      { title: "Options", rows: message.rows },
    ]);
  } else {
    await sendTextMessage(to, message.body);
  }
}

const RESTART_KEYWORDS = ["hi", "hello", "start", "restart", "menu"];

/**
 * Meta POSTs here for every inbound message, delivery receipt, etc.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const inbound = parseInboundPayload(body);
    if (!inbound) {
      return NextResponse.json({ ok: true });
    }

    const { from, text, type, interactiveReplyId } = inbound;

    let state = await getFlowState(from);

    // Plain-text greeting/restart keywords always reset to the top of the menu
    if (
      type === "text" &&
      RESTART_KEYWORDS.includes(text.trim().toLowerCase())
    ) {
      await resetFlowState(from);
      await sendMenuStep(from, "start");
      return NextResponse.json({ ok: true });
    }

    // Case 1: user tapped a button/list option
    if (type === "interactive" && interactiveReplyId) {
      const { nextState, readyToSearch } = advanceFlow(state, {
        selectionId: interactiveReplyId,
      });
      state = nextState;
      await saveFlowState(from, state);

      if (readyToSearch) {
        await runSearchAndReply(from, state.filters);
        await resetFlowState(from); // ready for a fresh search next time
        return NextResponse.json({ ok: true });
      }

      await sendMenuStep(from, state.step);
      return NextResponse.json({ ok: true });
    }

    // Case 2: user sent free text while we're expecting the custom-location fallback
    if (type === "text" && state.step === "awaiting_location_text") {
      const { nextState, readyToSearch } = advanceFlow(state, {
        freeText: text,
      });
      state = nextState;
      await saveFlowState(from, state);

      if (readyToSearch) {
        await runSearchAndReply(from, state.filters);
        await resetFlowState(from);
        return NextResponse.json({ ok: true });
      }

      await sendMenuStep(from, state.step);
      return NextResponse.json({ ok: true });
    }

    // Case 3: anything else (unexpected free text mid-flow, or a brand new
    // conversation) — (re)present the current step's menu
    await sendMenuStep(from, state.step === "done" ? "start" : state.step);
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }

  return NextResponse.json({ ok: true });
}

async function runSearchAndReply(
  from: string,
  filters: { propertyType?: string; location?: string; maxPrice?: number; beds?: number }
) {
  const listings = await getPropertyListings(filters);

  if (!listings || listings.length === 0) {
    await sendTextMessage(
      from,
      "I couldn't find any listings matching that exactly 😕 Try again with a wider budget or a nearby area — send *menu* to restart your search."
    );
    return;
  }

  if (listings.length === 1) {
    const l = listings[0];
    const image = l.imageUrls?.[0];
    if (image) {
      await sendListingImage(from, image, buildListingCaption(l));
    } else {
      await sendTextMessage(from, buildListingCaption(l));
    }
  } else {
    await sendListingsPicker(
      from,
      `Found ${listings.length} listings matching what you're after — tap to see details:`,
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

  await sendTextMessage(from, "Send *menu* anytime to start a new search.");
}
