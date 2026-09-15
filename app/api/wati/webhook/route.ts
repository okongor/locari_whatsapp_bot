// app/api/wati/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  parseInboundPayload,
  sendTextMessage,
  sendListMessage,
  sendListingImage,
  sendListingsPicker,
  buildListingCaption,
} from "@/lib/wati";
import { getFlowState, saveFlowState, resetFlowState } from "@/lib/flow-store";
import { getMenuMessage, advanceFlow, matchTitleToId } from "@/lib/menu-flow";
import { getPropertyListings } from "@/src/ai/tools/listing-retrieval";

/** Sends whatever WhatsApp message a given menu step calls for, via WATI */
async function sendMenuStep(to: string, step: Parameters<typeof getMenuMessage>[0]) {
  const message = getMenuMessage(step);
  if (message.kind === "list") {
    await sendListMessage(to, message.body, message.buttonLabel, [
      {
        title: "Options",
        rows: message.rows.map((r) => ({ title: r.title })),
      },
    ]);
  } else {
    await sendTextMessage(to, message.body);
  }
}

const RESTART_KEYWORDS = ["hi", "hello", "start", "restart", "menu"];

/**
 * WATI has no GET verification handshake like Meta — you just paste this
 * URL into Wati → Connectors → Webhooks. Only POST is needed.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const inbound = parseInboundPayload(body);
    if (!inbound || !inbound.from) {
      return NextResponse.json({ ok: true });
    }

    const { from, text, type } = inbound;

    let state = await getFlowState(from);

    if (type === "text" && RESTART_KEYWORDS.includes(text.trim().toLowerCase())) {
      await resetFlowState(from);
      await sendMenuStep(from, "start");
      return NextResponse.json({ ok: true });
    }

    // A tapped list/button reply — match its title back to our internal id
    if (type === "interactive" && text) {
      const selectionId = matchTitleToId(state.step, text);

      if (selectionId) {
        const { nextState, readyToSearch } = advanceFlow(state, { selectionId });
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

      // Tap didn't match a known option (e.g. stale menu) — resend current step
      await sendMenuStep(from, state.step === "done" ? "start" : state.step);
      return NextResponse.json({ ok: true });
    }

    // Free text while we're expecting the custom-location fallback
    if (type === "text" && state.step === "awaiting_location_text") {
      const { nextState, readyToSearch } = advanceFlow(state, { freeText: text });
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

    // Anything else — (re)present the current step's menu
    await sendMenuStep(from, state.step === "done" ? "start" : state.step);
  } catch (err) {
    console.error("WATI webhook error:", err);
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
