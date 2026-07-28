## Problem

The chat persists all prior messages from the `messages` table and rehydrates them on every load, so the AI always replies with old context. There's no way to start fresh.

## Solution

Add a **New chat** button in the header that clears the current conversation — both the UI state and the persisted server-side history for the signed-in user — so the next message starts with a clean slate.

## Changes

1. **New server function** `clearMessages` in `src/lib/household.functions.ts`
   - Auth-protected (`requireSupabaseAuth`)
   - Deletes all rows from `messages` scoped to `auth.uid()` (RLS also enforces this)
   - Returns `{ ok: true }`

2. **Chat UI** in `src/routes/_authenticated/index.tsx`
   - Add a "New chat" icon button (e.g. `Plus` or `RotateCcw` from lucide) in the header next to Household
   - On click: show a small confirm (AlertDialog) → call `clearMessages` → `setMessages([])` → invalidate the `["messages"]` query → refocus textarea
   - Empty-state suggestions reappear automatically since `messages.length === 0`

## Out of scope (v1)

- Multiple named threads / thread list — the app is one-conversation by design. If you later want thread history, that's a separate v2 feature.
- No changes to the AI agent, pending actions, or profile.
