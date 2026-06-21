import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { getHousehold, saveHousehold } from "@/lib/household.functions";
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
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}