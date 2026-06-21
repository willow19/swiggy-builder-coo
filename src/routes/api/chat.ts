import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";
import { createUserScopedClient } from "@/lib/supabase-bearer.server";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  service: string;
  price: number;
  unit: string | null;
  is_veg: boolean;
  diet_tags: string[];
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const supabase = createUserScopedClient(token);
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = userData.user.id;

        const body = (await request.json()) as { messages?: UIMessage[] };
        const messages = body.messages;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const [{ data: household }, { data: productsData }] = await Promise.all([
          supabase.from("households").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("products").select("*"),
        ]);
        const products = (productsData ?? []) as ProductRow[];

        const budgetCap = Number(household?.budget_cap ?? 2000);
        const diet = household?.dietary_preferences?.length
          ? household.dietary_preferences.join(", ")
          : "none specified";
        const brands = household?.preferred_brands?.length
          ? household.preferred_brands.join(", ")
          : "no specific preference";
        const members = Array.isArray(household?.family_members)
          ? JSON.stringify(household?.family_members)
          : "[]";

        const catalog = products
          .map(
            (p) =>
              `${p.id} | ${p.name} | ${p.brand ?? "Generic"} | ${p.category} | ${p.service} | ₹${p.price}${p.unit ? ` /${p.unit}` : ""} | ${p.is_veg ? "veg" : "non-veg"} | tags:[${p.diet_tags.join(",")}]`,
          )
          .join("\n");

        const systemPrompt = `You are the household's "Chief of Staff" — a warm, practical AI concierge for a busy dual-income Indian family. You help with everyday situations (sick child, surprise guests, weekend groceries, running low on staples) by recommending a shopping/food cart from the available catalog.

HOUSEHOLD PROFILE
- Dietary preferences: ${diet}
- Preferred brands: ${brands}
- Per-order budget cap: ₹${budgetCap}
- Family members: ${members}

RULES
1. Always respect dietary preferences. If the household is vegetarian, never add non-veg items. If Jain, avoid onion/garlic/potato items. Prefer the household's favourite brands when an equivalent exists.
2. Keep the cart within the budget cap when reasonable; if it must exceed, say so and explain.
3. When the user wants you to prepare an order, call the "draft_cart" tool with items chosen ONLY from the catalog below (reference items by their exact id). Pick sensible quantities for a family.
4. NEVER claim an order is placed. You only prepare a DRAFT that the user must Confirm. After calling draft_cart, briefly explain your choices in 1-3 sentences and mention 1-2 alternatives they could swap in.
5. Be concise, friendly, and use Indian context. Use ₹ for prices.

CATALOG (id | name | brand | category | service | price | veg | tags)
${catalog}`;

        const draftCart = tool({
          description:
            "Prepare a draft cart (pending action) of items for the household to review and confirm. Items must reference catalog product ids.",
          inputSchema: z.object({
            title: z.string().describe("Short title for this cart, e.g. 'Weekend groceries'"),
            service: z
              .enum(["instamart", "food"])
              .describe("instamart for groceries/essentials, food for ready meals"),
            items: z
              .array(
                z.object({
                  productId: z.string().describe("Catalog product id"),
                  quantity: z.number().int().min(1).max(20),
                }),
              )
              .min(1),
          }),
          execute: async ({ title, service, items }) => {
            const lineItems = items
              .map((it) => {
                const p = products.find((prod) => prod.id === it.productId);
                if (!p) return null;
                return {
                  productId: p.id,
                  name: p.name,
                  brand: p.brand ?? "Generic",
                  unit: p.unit,
                  price: Number(p.price),
                  quantity: it.quantity,
                  lineTotal: Number(p.price) * it.quantity,
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);

            const subtotal = lineItems.reduce((sum, it) => sum + it.lineTotal, 0);

            const { data: inserted, error } = await supabase
              .from("pending_actions")
              .insert({
                user_id: userId,
                title,
                service,
                items: lineItems,
                subtotal,
                status: "pending",
              })
              .select("id")
              .single();

            if (error || !inserted) {
              return { error: "Could not create the draft cart. Please try again." };
            }

            return {
              pendingActionId: inserted.id,
              title,
              service,
              itemCount: lineItems.length,
              subtotal,
              budgetCap,
              overBudget: subtotal > budgetCap,
            };
          },
        });

        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(key, initialRunId);
        const model = gateway("google/gemini-3-flash-preview");

        const result = streamText({
          model,
          system: systemPrompt,
          messages: await convertToModelMessages(messages),
          tools: { draft_cart: draftCart },
          stopWhen: stepCountIs(50),
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ messages: finalMessages }) => {
            try {
              const rows = finalMessages.map((m) => ({
                user_id: userId,
                client_id: m.id,
                role: m.role,
                parts: m.parts as unknown as object,
              }));
              await supabase
                .from("messages")
                .upsert(rows, { onConflict: "user_id,client_id" });
            } catch (e) {
              console.error("Failed to persist chat messages", e);
            }
          },
          headers: getLovableAiGatewayResponseHeaders(undefined, {
            ...(initialRunId ? { [LOVABLE_AIG_RUN_ID_HEADER]: initialRunId } : {}),
          }),
        });

        return withLovableAiGatewayRunIdHeader(response, gateway);
      },
    },
  },
});