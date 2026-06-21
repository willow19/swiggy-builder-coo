# Indian Household Chief of Staff — MVP-First Plan

An AI household assistant for Indian families. You describe a situation in plain language ("my child has a fever", "guests in 30 minutes", "weekend groceries"). The assistant reads your **explicitly-managed** family profile (diet, brands, budget), drafts a recommended cart, suggests alternatives, and **waits for your approval before "placing" anything**.

**Strategy:** ship a demoable end-to-end prototype using **mock cart generation** first. Defer all Swiggy OAuth / MCP work until the core flows are fully functional and testable.

## v1 scope decisions
- **Mock carts, not real commerce.** The agent recommends items from a curated sample grocery/food catalog. No external API calls.
- **Explicitly user-managed preferences.** No automatic profile updates, no recurring-pattern learning, no preference inference after orders. (Deferred to v2.)
- **Confirm-first, always.** The agent only generates draft carts + pending actions. Nothing is "ordered" without an explicit user Confirm. Budget cap enforced server-side.

## Build order
1. **Lovable Cloud + schema + RLS**
2. **Authentication**
3. **Household Profile**
4. **Chat UI**
5. **AI Agent**
6. **Pending Actions / Confirm–Edit workflow**
7. **Mock cart generation**
8. *(deferred)* Swiggy OAuth integration
9. *(deferred)* Swiggy MCP connectivity

---

## 1. Lovable Cloud + schema + RLS
Enable Lovable Cloud. Tables (RLS scoped to `auth.uid()`, with GRANTs):
- `households` — owner profile: `dietary_preferences` (e.g. veg/Jain/no-beef/allergies), `preferred_brands`, `budget_cap` (per-order ceiling), optional family members. Explicitly user-edited only.
- `messages` — conversation history (one conversation per household for v1).
- `pending_actions` — draft carts awaiting Confirm/Edit: items JSON, subtotal, status (`pending` / `confirmed` / `cancelled`).

(No `recurring_items`, no `swiggy_connections` in v1.)

## 2. Authentication
Email/password + Google sign-in (Lovable Cloud). Household scoped by RLS. Profile row auto-created for the user on first load.

## 3. Household Profile
A Sheet/panel to view and edit dietary preferences, preferred brands, and budget cap. This is the single source of truth the agent reads — fully manual.

## 4. Chat UI
WhatsApp-style conversation (AI SDK `useChat` → `src/routes/api/chat.ts`), optimistic bubbles, markdown rendering, typing indicator, tool-result cards. One persisted conversation per household.

## 5. AI Agent
Server route using AI SDK `streamText` + Lovable AI Gateway (`google/gemini-3-flash-preview`). System prompt loads the household profile. The agent interprets the situation, picks suitable items from the mock catalog (respecting diet/brands/budget), explains its reasoning, and offers alternatives. It never finalizes — it calls a `draft_cart` tool.

## 6. Pending Actions / Confirm–Edit workflow
The `draft_cart` tool writes a `pending_action` row instead of ordering. The chat renders a **Confirm / Edit card**: itemized cart, quantities, subtotal vs budget cap (over-budget warning), and Confirm / Edit / Cancel actions. Confirm marks the action `confirmed` (mock "order placed" — no external call); Edit lets the user adjust quantities/items; Cancel discards.

## 7. Mock cart generation
A curated sample catalog (groceries + ready meals) seeded via migration with name, brand, category, price, veg/non-veg + diet tags. The agent selects from this catalog so carts are realistic and demoable without Swiggy.

---

## Deferred (post-MVP)
- **8. Swiggy OAuth** — per-user OAuth, callback route `/api/public/swiggy/callback`, token store. Redirect URIs to register later:
  - Prod: `https://project--8fc12dfd-8cdb-40eb-b010-2ad84b202a12.lovable.app/api/public/swiggy/callback`
  - Preview: `https://project--8fc12dfd-8cdb-40eb-b010-2ad84b202a12-dev.lovable.app/api/public/swiggy/callback`
- **9. Swiggy MCP** — swap mock catalog for live Swiggy MCP read tools (`@ai-sdk/mcp`); the gated order tool runs only on Confirm. The confirm-first architecture stays identical, so this is a drop-in replacement of the catalog/order layer.
- **v2 memory:** automatic profile enrichment + recurring-pattern learning.

## Technical notes
- Stack: TanStack Start, AI SDK + Lovable AI Gateway, Lovable Cloud.
- Secrets: `LOVABLE_API_KEY` (managed). No Swiggy secrets needed for v1.
- The whole v1 runs end-to-end with zero external credentials, so it's demoable and pushable to GitHub immediately.
- DPDP caution: store only diet/brands/budget; no sensitive child data.

When you approve, I'll start with Lovable Cloud + schema, then auth, then the Household Profile.