import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Creates a Supabase client scoped to the user identified by a bearer token.
 * Used by raw server routes (e.g. /api/chat) that receive the Authorization header.
 * RLS applies as that user.
 */
export function createUserScopedClient(accessToken: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}