"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";

/** "Start without memory" — creates the next session in Amnesia Mode for honest comparisons. */
export function AmnesiaToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  const hint = `${id}-hint`;
  return (
    <div className="flex items-start gap-3 border border-dashed border-border p-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-describedby={hint} />
      <div className="space-y-0.5 text-xs">
        <label htmlFor={id} className="font-medium text-foreground">
          Start without memory — for comparison
        </label>
        <p id={hint} className="text-muted-foreground">
          Amnesia Mode: the next session recalls nothing and saves nothing.
        </p>
      </div>
    </div>
  );
}
