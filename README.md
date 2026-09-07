# Locari WhatsApp Bot

WhatsApp bot for [Locari](https://locari.africa) — a Ziva-style, button/list-driven
flow (no typing required) that walks customers through property type → location →
budget → bedrooms, then returns real matching listings from Firestore.

Live at: `https://locari-whatsapp-bot.vercel.app`
Webhook: `https://locari-whatsapp-bot.vercel.app/api/whatsapp/webhook`

## Structure

- `app/api/whatsapp/webhook/route.ts` — Meta webhook (GET verify, POST inbound
  messages). Drives the menu flow: reads the user's button/list tap, advances
  to the next step, and runs the search once all filters are collected.
- `lib/menu-flow.ts` — defines each step's options (property type, location,
  budget, bedrooms) and how a selection advances to the next step.
- `lib/flow-store.ts` — Firestore-backed per-phone "where are they in the
  menu" state (current step + filters collected so far).
- `lib/whatsapp.ts` — Meta Cloud API send helpers (list messages, reply
  buttons, images, text) + inbound payload parsing (text, list taps, button taps).
- `src/ai/tools/listing-retrieval.ts` — ported from Locari's real
  `src/ai/tools/listing-retrieval.ts` (originally a Genkit tool; exposed here
  as a plain async function since this bot doesn't use Genkit).
- `src/lib/firebaseAdmin.ts` — copied as-is from Locari's real
  `src/lib/firebaseAdmin.ts` (same env vars, same init pattern).

### Not currently used, kept for later

- `lib/llm-agent.ts` — a free-text, DeepSeek-powered agent (tool-calling loop)
  that was the original approach before switching to the menu flow. Left in
  place in case a "type your own request" fallback is added later — it isn't
  called from the webhook right now.
- `lib/conversation-store.ts` — chat-history store the AI agent used. Not used
  by the menu flow (which uses `flow-store.ts` instead).

## How the flow works

1. User sends anything (or "hi" / "menu" / "start") → bot sends a **list
   message**: choose property type (House, Shortlet, Office Space, Warehouse, Shop)
2. → **list message**: choose a popular area, or "Type a different area" to
   fall back to free text for one message only
3. → **list message**: choose a yearly rent budget range
4. → **list message**: choose number of bedrooms
5. Bot calls `getPropertyListings` with everything collected and replies with:
   - A single listing → image + caption
   - Multiple listings → an interactive picker list
   - No matches → a message suggesting they widen the search and resend "menu"

State resets after each completed search, so the next message starts a fresh flow.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Env vars** (set in Vercel → Project → Settings → Environment Variables):
   ```
   WHATSAPP_TOKEN=              # Meta Cloud API access token
   WHATSAPP_PHONE_NUMBER_ID=    # from Meta App Dashboard
   WHATSAPP_VERIFY_TOKEN=       # any string you choose, must match Meta's webhook config
   FIREBASE_PROJECT_ID=
   FIREBASE_CLIENT_EMAIL=
   FIREBASE_PRIVATE_KEY=        # keep the literal \n's, the code converts them
   DEEPSEEK_API_KEY=            # only needed if/when the AI fallback in llm-agent.ts is wired back in
   ```
   Use the same Firebase service account Locari's main app uses — this bot
   reads from the same `listings` collection.

3. **Register the webhook** in Meta App Dashboard → WhatsApp → Configuration:
   - Callback URL: `https://locari-whatsapp-bot.vercel.app/api/whatsapp/webhook`
   - Verify token: same value as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` webhook field (separate step from verifying
     the URL — easy to miss)

4. **Vercel Deployment Protection must be off for Production**, or Meta's
   webhook requests get blocked before reaching the app at all (Settings →
   Deployment Protection).

5. **Test** — message the test number and step through the menu; watch
   Vercel's Function Logs for each POST.

## Known gaps / next steps

- **No dedupe on retries.** Meta retries webhook POSTs on failure — dedupe on
  the WhatsApp message ID (Firestore or Redis with a short TTL) before this
  goes to production, so a retry doesn't resend the same menu step twice.
- **24-hour session window** isn't handled — outside 24h since the user's last
  message, only pre-approved message templates can be sent, not freeform replies.
- **Free-text location fallback has no validation** — whatever the user types
  is passed straight into the location filter; a typo just returns zero results.
- **Minimal error handling / no retry-backoff** on Graph API calls.
- **Only `status` and `type` are filtered at the Firestore query level** —
  location, price, and beds are filtered in-memory after fetching (matches
  Locari's real implementation). Fine at current listing volumes; worth
  revisiting if the `listings` collection grows large.
- **No "back" option** — user can't go back a step, only restart entirely by
  sending "menu".
