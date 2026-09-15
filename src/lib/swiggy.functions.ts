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
      const raw = e instanceof Error ? e.message : "Unknown error";
      // Swiggy currently issues HS256 access tokens (also shown in its public
      // auth example), while its MCP verifier can answer "Incorrect alg in MCP
      // JWT". Re-authentication produces the same token type, so distinguish
      // that provider-side mismatch from an expired or revoked sign-in.
      const tokenFormatMismatch = /incorrect alg/i.test(raw);
      const needsReauth = !tokenFormatMismatch && /401|unauthorized|419|invalid_token|404/i.test(raw);
      if (needsReauth) {
        await markConnectionFailed(context.userId).catch(() => {});
      }
      // Swiggy sometimes answers with a full HTML page; never surface that raw.
      const clean = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      return {
        ok: false,
        detail: tokenFormatMismatch
          ? "Your Swiggy sign-in completed, but Swiggy's MCP server rejected the token format it issued (Incorrect alg in MCP JWT). Reconnecting will not fix this; please share this message with the Swiggy Builders team."
          : needsReauth
            ? "Swiggy rejected the saved sign-in. Tap Connect Swiggy and sign in again with your phone + OTP."
            : clean || "Unknown error",
      };
    }
  });
