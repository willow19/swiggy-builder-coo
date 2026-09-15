import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Connection status safe to show in the browser (never includes tokens). */
export const getSwiggyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionRow } = await import("@/lib/swiggy.server");
    const row = await getConnectionRow(context.userId);
    if (!row) return { state: "disconnected" as const, expiresAt: null as string | null };
    const expired =
      row.expires_at != null && new Date(row.expires_at).getTime() < Date.now() + 60_000;
    const state =
      row.state === "ready" && expired ? ("expired" as const) : (row.state as
        | "ready"
        | "authenticating"
        | "failed");
    return {
      state,
      expiresAt: row.expires_at,
      authUrl: state === "authenticating" ? row.auth_url : null,
    };
  });

/** Start (or resume) the Swiggy OAuth flow. */
export const connectSwiggy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { startSwiggyAuth } = await import("@/lib/swiggy.server");
    return startSwiggyAuth(context.userId);
  });

export const disconnectSwiggy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectSwiggy } = await import("@/lib/swiggy.server");
    await disconnectSwiggy(context.userId);
    return { ok: true };
  });

/** Dry-run diagnostic: one low-risk read call against live Instamart. */
export const checkSwiggyConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runSwiggyDiagnostic, markConnectionFailed } = await import("@/lib/swiggy.server");
    try {
      return await runSwiggyDiagnostic(context.userId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      if (/401|unauthorized|419/i.test(message)) {
        await markConnectionFailed(context.userId).catch(() => {});
      }
      return { ok: false, detail: message };
    }
  });
