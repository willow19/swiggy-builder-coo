import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Plus, X, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";

import { getHousehold, saveHousehold } from "@/lib/household.functions";
import {
  getSwiggyStatus,
  connectSwiggy,
  disconnectSwiggy,
  checkSwiggyConnection,
} from "@/lib/swiggy.functions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DIET_OPTIONS = [
  "vegetarian",
  "non-vegetarian",
  "eggetarian",
  "vegan",
  "jain",
  "no-beef",
  "no-pork",
  "nut-allergy",
];

export function HouseholdSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchHousehold = useServerFn(getHousehold);
  const persist = useServerFn(saveHousehold);

  const { data, isLoading } = useQuery({
    queryKey: ["household"],
    queryFn: () => fetchHousehold(),
  });

  const [name, setName] = useState("");
  const [diet, setDiet] = useState<string[]>([]);
  const [budget, setBudget] = useState(2000);
  const [brands, setBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState("");

  useEffect(() => {
    if (data) {
      setName(data.household_name ?? "");
      setDiet(data.dietary_preferences ?? []);
      setBudget(Number(data.budget_cap ?? 2000));
      setBrands(data.preferred_brands ?? []);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      persist({
        data: {
          household_name: name || null,
          dietary_preferences: diet,
          preferred_brands: brands,
          budget_cap: budget,
          family_members: (data?.family_members as { name: string; note?: string }[]) ?? [],
        },
      }),
    onSuccess: (row) => {
      queryClient.setQueryData(["household"], row);
      toast.success("Household saved");
      onOpenChange(false);
    },
    onError: () => toast.error("Could not save household"),
  });

  const toggleDiet = (d: string) =>
    setDiet((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const addBrand = () => {
    const b = brandInput.trim();
    if (b && !brands.includes(b)) setBrands([...brands, b]);
    setBrandInput("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Household profile</SheetTitle>
          <SheetDescription>
            The assistant uses these preferences when preparing every cart.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-6 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="hname">Household name</Label>
              <Input
                id="hname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Sharmas"
              />
            </div>

            <div className="space-y-2">
              <Label>Dietary preferences</Label>
              <div className="flex flex-wrap gap-2">
                {DIET_OPTIONS.map((d) => {
                  const active = diet.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDiet(d)}
                      className={
                        "rounded-full border px-3 py-1 text-sm capitalize transition-colors " +
                        (active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-secondary")
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Per-order budget cap (₹)</Label>
              <Input
                id="budget"
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Preferred brands</Label>
              <div className="flex gap-2">
                <Input
                  value={brandInput}
                  onChange={(e) => setBrandInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addBrand();
                    }
                  }}
                  placeholder="e.g. Amul, Aashirvaad"
                />
                <Button type="button" variant="outline" size="icon" onClick={addBrand}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {brands.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
                  >
                    {b}
                    <button type="button" onClick={() => setBrands(brands.filter((x) => x !== b))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save household
            </Button>

            <SwiggySection />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SwiggySection() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getSwiggyStatus);
  const connect = useServerFn(connectSwiggy);
  const disconnect = useServerFn(disconnectSwiggy);
  const runCheck = useServerFn(checkSwiggyConnection);

  const { data: status, isLoading } = useQuery({
    queryKey: ["swiggy_status"],
    queryFn: () => fetchStatus(),
    refetchOnWindowFocus: true,
  });

  const connectMutation = useMutation({
    mutationFn: () => connect(),
    onSuccess: (result) => {
      if (result.status === "ready") {
        queryClient.invalidateQueries({ queryKey: ["swiggy_status"] });
        toast.success("Swiggy already connected");
      } else {
        window.open(result.authUrl, "_blank", "noopener,noreferrer");
        toast.message("Finish signing in with Swiggy in the new tab, then come back.");
      }
    },
    onError: () => toast.error("Could not start Swiggy connection"),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swiggy_status"] });
      toast.success("Swiggy disconnected");
    },
    onError: () => toast.error("Could not disconnect"),
  });

  const checkMutation = useMutation({
    mutationFn: () => runCheck(),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.detail);
      else {
        toast.error(`Connection check failed: ${result.detail}`);
        queryClient.invalidateQueries({ queryKey: ["swiggy_status"] });
      }
    },
    onError: () => toast.error("Connection check failed"),
  });

  const state = status?.state ?? "disconnected";
  const label =
    state === "ready"
      ? "Connected"
      : state === "authenticating"
        ? "Finish sign-in"
        : state === "expired" || state === "failed"
          ? "Reconnect needed"
          : "Not connected";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Swiggy account</p>
          <p className="text-xs text-muted-foreground">
            Link Swiggy for live Instamart & Food results. Nothing is ordered without your
            confirmation.
          </p>
        </div>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs font-medium " +
            (state === "ready"
              ? "bg-accent/15 text-accent"
              : "bg-muted px-2 py-0.5 text-muted-foreground")
          }
        >
          {isLoading ? "…" : label}
        </span>
      </div>

      {status?.authUrl && state === "authenticating" && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => window.open(status.authUrl!, "_blank", "noopener,noreferrer")}
        >
          Continue Swiggy sign-in
        </Button>
      )}

      <div className="flex gap-2">
        {state !== "ready" ? (
          <Button
            size="sm"
            className="flex-1"
            onClick={() => connectMutation.mutate()}
            disabled={connectMutation.isPending}
          >
            {connectMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <PlugZap className="mr-1.5 h-4 w-4" />
            )}
            Connect Swiggy
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => checkMutation.mutate()}
              disabled={checkMutation.isPending}
            >
              {checkMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Run check
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              <Unplug className="mr-1.5 h-4 w-4" /> Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  );
}