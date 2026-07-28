import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getHousehold = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("households")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!data) {
      const { data: created, error: insertError } = await supabase
        .from("households")
        .insert({ user_id: userId })
        .select("*")
        .single();
      if (insertError) throw new Error(insertError.message);
      return created;
    }
    return data;
  });

const SaveHouseholdInput = z.object({
  household_name: z.string().max(120).nullable().optional(),
  dietary_preferences: z.array(z.string().max(60)).max(30),
  preferred_brands: z.array(z.string().max(60)).max(50),
  budget_cap: z.number().min(0).max(1000000),
  family_members: z
    .array(z.object({ name: z.string().max(60), note: z.string().max(120).optional() }))
    .max(20),
});

export const saveHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveHouseholdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("households")
      .upsert(
        {
          user_id: userId,
          household_name: data.household_name ?? null,
          dietary_preferences: data.dietary_preferences,
          preferred_brands: data.preferred_brands,
          budget_cap: data.budget_cap,
          family_members: data.family_members,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("messages")
      .select("client_id, role, parts, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const clearMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("messages").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPendingAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("pending_actions")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

const CartItem = z.object({
  productId: z.string(),
  name: z.string(),
  brand: z.string(),
  unit: z.string().nullable().optional(),
  price: z.number(),
  quantity: z.number().int().min(0).max(50),
  lineTotal: z.number(),
});

export const updatePendingAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), items: z.array(CartItem) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const items = data.items
      .filter((it) => it.quantity > 0)
      .map((it) => ({ ...it, lineTotal: it.price * it.quantity }));
    const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
    const { data: row, error } = await supabase
      .from("pending_actions")
      .update({ items, subtotal })
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setPendingActionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["confirmed", "cancelled"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("pending_actions")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });