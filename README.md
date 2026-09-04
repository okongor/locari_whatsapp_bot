# Locari WhatsApp Bot

WhatsApp agent for [Locari](https://locari.africa) — chats with customers looking
for rentals and returns real listings from Firestore, right in WhatsApp.

## Structure

- `app/api/whatsapp/webhook/route.ts` — Meta webhook (GET verify, POST inbound messages)
- `lib/claude-agent.ts` — Claude tool-use loop; calls `getPropertyListings`
- `lib/whatsapp.ts` — Meta Cloud API send helpers + inbound payload parsing
- `lib/conversation-store.ts` — Firestore-backed per-phone conversation history
- `src/ai/tools/listing-retrieval.ts` — ⚠️ **placeholder**, built from the search
  spec, not the real Locari source. Replace with the actual file.
- `src/lib/firebase-admin.ts` — Firebase Admin SDK init (shared)

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Env vars** — copy `.env.example` to `.env.local` and fill in:
   ```
   ANTHROPIC_API_KEY=
   WHATSAPP_TOKEN=              # Meta Cloud API access token
   WHATSAPP_PHONE_NUMBER_ID=    # from Meta App Dashboard
   WHATSAPP_VERIFY_TOKEN=       # any string you choose
   FIREBASE_SERVICE_ACCOUNT=    # full service account JSON, single line
   ```
   On Replit, set these under the **Secrets** tab instead of a `.env.local` file.

3. **Swap in the real listing-retrieval.ts** — `src/ai/tools/listing-retrieval.ts`
   is currently rebuilt from the spec (Firestore field names, filtering rules)
   rather than copied from your actual codebase. Once you can paste in the real
   file, replace it directly — nothing else in the project needs to change as
   long as `getPropertyListings(input)` keeps the same shape.

4. **Run locally / on Replit**
   ```
   npm run dev
   ```
   Replit will expose a public HTTPS URL automatically.

5. **Register the webhook** in Meta App Dashboard → WhatsApp → Configuration:
   - Callback URL: `https://<your-url>/api/whatsapp/webhook`
   - Verify token: same value as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` webhook field

6. **Test** — message your Meta test number from WhatsApp and watch the logs.

## Known gaps / next steps

- **No dedupe on retries.** Meta retries webhook POSTs on failure — dedupe on
  the WhatsApp message ID (Firestore or Redis with a short TTL) before this
  goes to production, so a retry doesn't send a duplicate reply.
- **24-hour session window** isn't handled — outside 24h since the user's last
  message, only pre-approved message templates can be sent, not freeform replies.
- **List picker taps aren't routed back into a detail lookup yet** —
  `interactiveReplyId` is parsed in `whatsapp.ts` but the webhook doesn't yet
  fetch and send that specific listing's full detail/image.
- **Minimal error handling / no retry-backoff** on Graph API calls.
- **Firestore query assumptions** in `listing-retrieval.ts` (collection name
  `listings`, composite index on `status` + `yearlyRent` + `beds`) need
  verifying against your real schema and Firestore indexes.
