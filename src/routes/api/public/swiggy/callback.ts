import { createFileRoute } from "@tanstack/react-router";

function htmlPage(title: string, body: string, returnTo?: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#faf7f2;color:#1c1917}
.card{max-width:24rem;text-align:center;padding:2rem}h1{font-size:1.25rem}p{color:#57534e;font-size:.9rem}
a{display:inline-block;margin-top:1rem;background:#ea580c;color:#fff;padding:.6rem 1.2rem;border-radius:.75rem;text-decoration:none;font-weight:600}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p>${returnTo ? `<a href="${returnTo}">Back to the app</a>` : ""}</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/swiggy/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        if (oauthError) {
          return htmlPage(
            "Swiggy connection cancelled",
            `Swiggy returned: ${oauthError}. You can try connecting again from the Household panel.`,
          );
        }
        if (!code || !state) {
          return htmlPage(
            "Invalid callback",
            "Missing authorization code. Please restart the connection from the Household panel.",
          );
        }

        try {
          const { finishSwiggyAuth } = await import("@/lib/swiggy.server");
          const { returnTo } = await finishSwiggyAuth(code, state);
          return htmlPage(
            "Swiggy connected",
            "Your Swiggy account is linked. Live Instamart and Food results are now available in chat.",
            returnTo,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : "Unknown error";
          return htmlPage(
            "Connection failed",
            `We couldn't finish linking Swiggy (${message.slice(0, 200)}). Please try again from the Household panel.`,
          );
        }
      },
    },
  },
});
