import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Check, X, Minus, Plus, ShoppingCart, Loader2, CheckCircle2, Ban } from "lucide-react";
import { toast } from "sonner";

import {
  getPendingAction,
  updatePendingAction,
  setPendingActionStatus,
  getHousehold,
} from "@/lib/household.functions";
import { Button } from "@/components/ui/button";

type CartItem = {
  productId: string;
  name: string;
  brand: string;
  unit?: string | null;
  price: number;
  quantity: number;
  lineTotal: number;
};

export function PendingActionCard({ pendingActionId }: { pendingActionId: string }) {
  const queryClient = useQueryClient();
  const getAction = useServerFn(getPendingAction);
  const updateAction = useServerFn(updatePendingAction);
  const setStatus = useServerFn(setPendingActionStatus);
  const fetchHousehold = useServerFn(getHousehold);

  const { data, isLoading } = useQuery({
    queryKey: ["pending_action", pendingActionId],
    queryFn: () => getAction({ data: { id: pendingActionId } }),
  });

  const { data: household } = useQuery({
    queryKey: ["household"],
    queryFn: () => fetchHousehold(),
  });

  const [items, setItems] = useState<CartItem[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.items) {
      setItems(data.items as unknown as CartItem[]);
      setDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (next: CartItem[]) => updateAction({ data: { id: pendingActionId, items: next } }),
    onSuccess: (row) => {
      queryClient.setQueryData(["pending_action", pendingActionId], row);
      setDirty(false);
    },
    onError: () => toast.error("Could not save changes"),
  });

  const statusMutation = useMutation({
    mutationFn: (status: "confirmed" | "cancelled") =>
      setStatus({ data: { id: pendingActionId, status } }),
    onSuccess: (row, status) => {
      queryClient.setQueryData(["pending_action", pendingActionId], row);
      toast.success(status === "confirmed" ? "Order confirmed (demo)" : "Draft cancelled");
    },
    onError: () => toast.error("Action failed"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading cart…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        This draft is no longer available.
      </div>
    );
  }

  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const status = data.status as string;
  const isPending = status === "pending";

  const changeQty = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.productId === productId
          ? { ...it, quantity: Math.max(0, it.quantity + delta) }
          : it,
      ),
    );
    setDirty(true);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground">{data.title ?? "Draft cart"}</span>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
          {data.service}
        </span>
      </div>

      <div className="divide-y divide-border">
        {items.filter((it) => it.quantity > 0 || isPending).map((it) => (
          <div key={it.productId} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{it.name}</p>
              <p className="text-xs text-muted-foreground">
                {it.brand}
                {it.unit ? ` · ${it.unit}` : ""} · ₹{it.price}
              </p>
            </div>
            {isPending ? (
              <div className="flex items-center gap-1.5">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => changeQty(it.productId, -1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{it.quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => changeQty(it.productId, 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">×{it.quantity}</span>
            )}
            <span className="w-16 text-right text-sm font-semibold text-foreground">
              ₹{it.price * it.quantity}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-border px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-base font-bold text-foreground">₹{subtotal}</span>
        </div>
        <BudgetBar subtotal={subtotal} budgetCap={Number(household?.budget_cap ?? NaN)} />

        {status === "confirmed" && (
          <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent">
            <CheckCircle2 className="h-4 w-4" /> Order confirmed (demo — no real purchase)
          </div>
        )}
        {status === "cancelled" && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
            <Ban className="h-4 w-4" /> Draft cancelled
          </div>
        )}

        {isPending && (
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => saveMutation.mutate(items)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save edits
              </Button>
            ) : null}
            <Button
              size="sm"
              className="flex-1"
              onClick={async () => {
                if (dirty) await saveMutation.mutateAsync(items);
                statusMutation.mutate("confirmed");
              }}
              disabled={statusMutation.isPending || subtotal === 0}
            >
              <Check className="mr-1.5 h-4 w-4" /> Confirm order
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => statusMutation.mutate("cancelled")}
              disabled={statusMutation.isPending}
            >
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function BudgetBar({ subtotal, budgetCap }: { subtotal: number; budgetCap: number }) {
  if (!Number.isFinite(budgetCap) || budgetCap <= 0) return null;
  const pct = Math.min(100, (subtotal / budgetCap) * 100);
  const over = subtotal > budgetCap;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Budget ₹{budgetCap}</span>
        {over && <span className="font-medium text-destructive">Over budget</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={over ? "h-full bg-destructive" : "h-full bg-accent"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}