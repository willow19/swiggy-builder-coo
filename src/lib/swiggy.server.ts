/**
 * Swiggy MCP integration (server-only).
 *
 * - OAuth 2.1 + PKCE with Dynamic Client Registration against mcp.swiggy.com.
 * - Tokens are stored per user in `swiggy_connections` (service-role only table).
 * - Confirm-first: only read/search MCP tools are ever exposed to the agent.
 */
import {
  auth,
  createMCPClient,
  type MCPClient,
  type OAuthClientInformation,
  type OAuthClientProvider,
  type OAuthTokens,
} from "@ai-sdk/mcp";
import { getRequestUrl } from "@tanstack/react-start/server";

const PROJECT_ID = "8fc12dfd-8cdb-40eb-b010-2ad84b202a12";

export const SWIGGY_MCP_SERVERS = {
  instamart: "https://mcp.swiggy.com/im",
  food: "https://mcp.swiggy.com/food",
} as const;

export type SwiggyServerName = keyof typeof SWIGGY_MCP_SERVERS;

const SWIGGY_SCOPE = "mcp:tools mcp:resources mcp:prompts";

/**
 * Swiggy's protected-resource well-known endpoint serves an HTML page instead
 * of JSON, which breaks automatic OAuth discovery. Intercept that one request
 * and answer with the known-correct metadata so discovery proceeds against
 * the real issuer (https://mcp.swiggy.com/auth).
 */
const SWIGGY_RESOURCE_METADATA = {
  resource: "https://mcp.swiggy.com",
  authorization_servers: ["https://mcp.swiggy.com/auth"],
  scopes_supported: ["mcp:tools", "mcp:resources", "mcp:prompts"],
  bearer_methods_supported: ["header"],
};

function swiggyOAuthFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/.well-known/oauth-protected-resource")) {
    return Promise.resolve(
      new Response(JSON.stringify(SWIGGY_RESOURCE_METADATA), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  // The edge runtime rejects `redirect: "error"`; normalise it so OAuth
  // discovery and token exchange work in production too.
  if (init?.redirect === "error") {
    return fetch(input, { ...init, redirect: "manual" });
  }
  return fetch(input, init);
}

export type SwiggyConnectionRow = {
  id: string;
  user_id: string;
  state: string;
  auth_url: string | null;
  access_token: string | null;
  expires_at: string | null;
  scope: string | null;
  client_information: OAuthClientInformation | null;
  code_verifier: string | null;
  oauth_state: string | null;
  return_to: string | null;
};

/**
 * Pick the whitelisted redirect URI based on the host serving this request.
 * Only Swiggy-whitelisted URIs may be used — adding a new one requires
 * notifying Swiggy first.
 */
export function resolveSwiggyUrls(): { redirectUrl: string; returnTo: string } {
  let origin = `https://project--${PROJECT_ID}.lovable.app`;
  // Friendly published host used only for the "back to the app" link; the
  // redirect URI must stay on the whitelisted project-- host.
  let appOrigin = "https://swiggy-builder-coo.lovable.app";
  try {
    const url = getRequestUrl();
    if (url.hostname.includes("-dev")) {
      origin = `https://project--${PROJECT_ID}-dev.lovable.app`;
      appOrigin = origin;
    } else if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      // Local dev isn't whitelisted; fall back to the dev URL so the OAuth
      // flow still completes, then send the user back to the dev app.
      origin = `https://project--${PROJECT_ID}-dev.lovable.app`;
      appOrigin = origin;
    }
  } catch {
    // no request context — default to production
  }
  return {
    redirectUrl: `${origin}/api/public/swiggy/callback`,
    returnTo: `${appOrigin}/`,
  };
}


async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // swiggy_connections is service-role only; the generated Database types may
  // lag behind, so use a loosely-typed handle here.
  return supabaseAdmin as unknown as {
    from: (table: string) => ReturnType<typeof supabaseAdmin.from>;
  };
}

export async function getConnectionRow(userId: string): Promise<SwiggyConnectionRow | null> {
  const db = await adminDb();
  const { data, error } = await db
    .from("swiggy_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SwiggyConnectionRow | null) ?? null;
}

export async function getConnectionRowByState(
  oauthState: string,
): Promise<SwiggyConnectionRow | null> {
  const db = await adminDb();
  const { data, error } = await db
    .from("swiggy_connections")
    .select("*")
    .eq("oauth_state", oauthState)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SwiggyConnectionRow | null) ?? null;
}

async function patchConnection(userId: string, patch: Record<string, unknown>) {
  const db = await adminDb();
  const { error } = await db.from("swiggy_connections").update(patch).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function markConnectionFailed(userId: string) {
  // Keep the saved token: a single failed read must never cost the user another
  // phone + OTP round. Only an explicit Disconnect clears credentials.
  await patchConnection(userId, { state: "failed" });
}

/**
 * DB-backed OAuthClientProvider for one user. The AI SDK calls these hooks
 * during the OAuth handshake and (for token reads) when opening MCP clients.
 */
export class SwiggyOAuthProvider implements OAuthClientProvider {
  /** Set when the SDK asks us to send the user to Swiggy's consent page. */
  capturedAuthUrl: string | null = null;

  constructor(
    private userId: string,
    private redirectUri: string,
    private returnTo: string,
  ) {}

  get redirectUrl() {
    return this.redirectUri;
  }

  get clientMetadata() {
    return {
      redirect_uris: [this.redirectUri],
      client_name: "Household Chief of Staff",
      client_uri: this.returnTo,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SWIGGY_SCOPE,
    };
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const row = await getConnectionRow(this.userId);
    if (!row?.access_token) return undefined;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000) {
      return undefined; // expired — no refresh tokens in Swiggy v1; re-auth
    }
    return {
      access_token: row.access_token,
      token_type: "Bearer",
      ...(row.scope ? { scope: row.scope } : {}),
    };
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const expiresIn = (tokens as { expires_in?: number }).expires_in ?? 432000;
    await patchConnection(this.userId, {
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scope: (tokens as { scope?: string }).scope ?? SWIGGY_SCOPE,
      state: "ready",
      auth_url: null,
      code_verifier: null,
      oauth_state: null,
    });
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.capturedAuthUrl = authorizationUrl.toString();
    await patchConnection(this.userId, { auth_url: this.capturedAuthUrl });
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await patchConnection(this.userId, { code_verifier: codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const row = await getConnectionRow(this.userId);
    if (!row?.code_verifier) throw new Error("Missing PKCE code verifier — restart connect");
    return row.code_verifier;
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const row = await getConnectionRow(this.userId);
    return row?.client_information ?? undefined;
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    await patchConnection(this.userId, { client_information: info });
  }

  async state(): Promise<string> {
    const row = await getConnectionRow(this.userId);
    if (row?.oauth_state) return row.oauth_state;
    const generated = crypto.randomUUID();
    await patchConnection(this.userId, { oauth_state: generated });
    return generated;
  }

  async saveState(state: string): Promise<void> {
    await patchConnection(this.userId, { oauth_state: state });
  }

  async storedState(): Promise<string | undefined> {
    const row = await getConnectionRow(this.userId);
    return row?.oauth_state ?? undefined;
  }
}

async function ensureConnectionRow(userId: string) {
  const db = await adminDb();
  const { error } = await db.from("swiggy_connections").upsert(
    { user_id: userId, state: "authenticating" },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/**
 * Start (or resume) the OAuth flow. Returns "ready" when an existing token is
 * still valid, or "redirect" with the Swiggy consent URL to open.
 */
export async function startSwiggyAuth(
  userId: string,
): Promise<{ status: "ready" } | { status: "redirect"; authUrl: string }> {
  await ensureConnectionRow(userId);
  const { redirectUrl, returnTo } = resolveSwiggyUrls();
  await patchConnection(userId, { return_to: returnTo });
  const provider = new SwiggyOAuthProvider(userId, redirectUrl, returnTo);
  let result: "AUTHORIZED" | "REDIRECT";
  try {
    result = await auth(provider, {
      serverUrl: SWIGGY_MCP_SERVERS.instamart,
      scope: SWIGGY_SCOPE,
      fetchFn: swiggyOAuthFetch,
    });
  } catch (e) {
    console.error("[swiggy] auth() failed:", e);
    throw e;
  }
  if (result === "AUTHORIZED") {
    await patchConnection(userId, { state: "ready", auth_url: null });
    return { status: "ready" };
  }
  if (!provider.capturedAuthUrl) throw new Error("Swiggy did not return an authorization URL");
  return { status: "redirect", authUrl: provider.capturedAuthUrl };
}

/** Complete the OAuth flow from the callback query params. */
export async function finishSwiggyAuth(
  code: string,
  oauthState: string,
): Promise<{ returnTo: string }> {
  const row = await getConnectionRowByState(oauthState);
  if (!row) throw new Error("Unknown or expired OAuth state — please restart connect");
  const { redirectUrl, returnTo } = resolveSwiggyUrls();
  const provider = new SwiggyOAuthProvider(
    row.user_id,
    redirectUrl,
    row.return_to ?? returnTo,
  );
  await auth(provider, {
    serverUrl: SWIGGY_MCP_SERVERS.instamart,
    authorizationCode: code,
    callbackState: oauthState,
    scope: SWIGGY_SCOPE,
    fetchFn: swiggyOAuthFetch,
  });
  return { returnTo: row.return_to ?? returnTo };
}

export async function disconnectSwiggy(userId: string) {
  const db = await adminDb();
  const { error } = await db.from("swiggy_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Create a live MCP client for one Swiggy server using the user's token. */
export async function createSwiggyMcpClient(
  userId: string,
  server: SwiggyServerName,
): Promise<MCPClient> {
  const { redirectUrl, returnTo } = resolveSwiggyUrls();
  const provider = new SwiggyOAuthProvider(userId, redirectUrl, returnTo);
  return createMCPClient({
    transport: {
      type: "http",
      url: SWIGGY_MCP_SERVERS[server],
      authProvider: provider,
      redirect: "follow",
      // The edge runtime throws "Illegal invocation" if `globalThis.fetch` is
      // passed around unbound, so always hand over a bound wrapper.
      fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        swiggyOAuthFetch(input as RequestInfo | URL, init),
    },
  });
}

/** Tools the agent may never call directly (writes, cart, checkout, payment). */
const BLOCKED_TOOLS = new Set([
  "update_cart",
  "clear_cart",
  "checkout",
  "confirm_order",
  "place_food_order",
  "apply_coupon",
  "apply_food_coupon",
  "create_address",
  "delete_address",
  "flush_food_cart",
  "get_payment_options",
  "check_payment_status",
  "report_error",
]);

/**
 * Load read/search MCP tools for the agent, namespaced per server.
 * Returns null when the user isn't connected or the token is rejected —
 * callers fall back to the mock catalog. Clients are always closed by the
 * caller via the returned `close()`.
 */
export async function loadSwiggyTools(
  userId: string,
): Promise<{ tools: Record<string, unknown>; close: () => Promise<void> } | null> {
  const row = await getConnectionRow(userId);
  if (!row || row.state !== "ready" || !row.access_token) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000) return null;

  const clients: MCPClient[] = [];
  try {
    const tools: Record<string, unknown> = {};
    for (const server of Object.keys(SWIGGY_MCP_SERVERS) as SwiggyServerName[]) {
      const client = await createSwiggyMcpClient(userId, server);
      clients.push(client);
      const serverTools = (await client.tools()) as Record<string, unknown>;
      for (const [name, toolDef] of Object.entries(serverTools)) {
        if (BLOCKED_TOOLS.has(name)) continue;
        tools[`${server}__${name}`] = toolDef;
      }
    }
    return {
      tools,
      close: async () => {
        await Promise.allSettled(clients.map((c) => c.close()));
      },
    };
  } catch (e) {
    await Promise.allSettled(clients.map((c) => c.close()));
    // A 401 here means the token was revoked/expired early — force re-connect.
    if (e instanceof Error && /401|unauthorized/i.test(e.message)) {
      await markConnectionFailed(userId).catch(() => {});
    }
    return null;
  }
}

/**
 * Low-risk live check used by the "Run connection check" dry-run diagnostic:
 * opens an Instamart client and calls get_addresses (read-only).
 */
export async function runSwiggyDiagnostic(userId: string): Promise<{
  ok: boolean;
  detail: string;
}> {
  // Without a live token the MCP client silently restarts OAuth discovery and
  // Swiggy answers with an HTML page — check state first and say so plainly.
  const row = await getConnectionRow(userId);
  if (!row?.access_token || row.state !== "ready") {
    return {
      ok: false,
      detail: "Swiggy isn't linked right now. Tap Connect Swiggy and sign in with your phone + OTP.",
    };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000) {
    return {
      ok: false,
      detail: "Your Swiggy link has expired (tokens last 5 days). Tap Connect Swiggy to sign in again.",
    };
  }
  const client = await createSwiggyMcpClient(userId, "instamart");
  try {
    const tools = (await client.tools()) as unknown as Record<
      string,
      { execute?: (args: Record<string, unknown>, opts?: unknown) => Promise<unknown> }
    >;
    const toolNames = Object.keys(tools);
    const getAddresses = tools["get_addresses"];
    if (getAddresses?.execute) {
      const result = (await getAddresses.execute({})) as {
        content?: { type: string; text?: string }[];
      };
      const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
      return {
        ok: true,
        detail: `Auth OK. ${toolNames.length} Instamart tools visible. get_addresses responded: ${text.slice(0, 300) || "(empty)"}`,
      };
    }
    return { ok: true, detail: `Auth OK. ${toolNames.length} Instamart tools visible.` };
  } finally {
    await client.close().catch(() => {});
  }
}
