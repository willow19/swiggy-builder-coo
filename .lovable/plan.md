# Swiggy MCP Dry Run — Live Integration (Phase 2)

Now that Swiggy has whitelisted our redirect URIs, connect the working MVP to the real Swiggy MCP servers, replacing the mock catalog with live data — while keeping the confirm-first architecture intact.

## Go-live rules from Swiggy (to follow throughout)

1. **Ramp gradually** — test against real calls ourselves first (single test account) before pointing any other traffic at it. Small blast radius for auth/payload mismatches.
2. **Redirect URIs must stay whitelisted** — we will use ONLY the two already-whitelisted URIs:
   - Prod: `https://project--8fc12dfd-8cdb-40eb-b010-2ad84b202a12.lovable.app/api/public/swiggy/callback`
   - Preview: `https://project--8fc12dfd-8cdb-40eb-b010-2ad84b202a12-dev.lovable.app/api/public/swiggy/callback`
   Any new URI must be sent to Swiggy before shipping.
3. **Defensive reads** — treat every tool response (availability, pricing, menus) as fresh state. No caching of catalog or price data; cart line items are re-validated at confirm time.

## Build steps

### 1. OAuth callback route
- Create `src/routes/api/public/swiggy/callback.ts` — handles the OAuth redirect, exchanges the code for tokens, stores them per-user.
- New `swiggy_tokens` table (user_id, access_token, refresh_token, expires_at) with RLS + GRANTs; service-role-only access since only server code reads tokens.

### 2. Connect flow
- "Connect Swiggy" entry point in the Household sheet: kicks off the OAuth flow with the whitelisted redirect URI.
- Show connection status (connected / expired / reconnect) in the Household sheet.

### 3. MCP client (server-side)
- A server module that talks to Swiggy's MCP servers (Food, Instamart) with the user's access token.
- Dry-run diagnostics: a server function that calls a low-risk read tool (e.g. address/cart search) and reports success/failure — our "small slice of traffic" check for auth or payload mismatches.

### 4. Swap mock catalog for live tools
- Extend the chat API (`src/routes/api/chat.ts`): when the user has a connected Swiggy account, give the agent real MCP tools (search instamart / food) alongside `draft_cart`.
- `draft_cart` keeps producing pending actions — no auto-ordering. At confirm time, re-fetch live price/availability and flag changes (rule 3).
- Fall back to the mock catalog when Swiggy isn't connected, so the demo keeps working.

### 5. Dry-run validation checklist
- Sign in with a test account → Connect Swiggy → confirm tokens stored.
- Run the diagnostic read tool → verify auth + payload shape.
- Chat: "we need groceries for the weekend" → agent uses live Instamart search → draft cart → confirm card shows live prices.
- Verify price-change handling: stale draft re-validates before confirm.

## Out of scope (unchanged)
- Actual order placement / payment — still confirm-first; confirm stops at "approved".
- Dineout integration and v2 memory features (automatic preference learning).
- No new redirect URIs without notifying Swiggy first.

## Technical notes
- MCP client runs only in server code (Worker-safe, fetch-based); tokens never reach the browser.
- Secrets (Swiggy client ID/secret) stored via the secrets manager, read inside handlers only.
- `swiggy_tokens` gets GRANTs + RLS in the same migration; read only via server code.
