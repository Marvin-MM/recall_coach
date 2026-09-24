"use client";

import { useSystemHealth } from "@/hooks/use-system-health";

/** Live status readout (DB, Walrus relayer, model), shared with the hero badge. */
export function LiveStatus() {
  const system = useSystemHealth();
  const failed = system.status === "unreachable";
  const health = system.status === "ok" || system.status === "degraded" ? system.health : null;

  const dot = (ok: boolean) => (
    <span aria-hidden className={`inline-block size-2 ${ok ? "bg-link" : "bg-destructive"}`} />
  );

  return (
    <div aria-live="polite" className="text-sm">
      {failed ? (
        <p className="text-muted-foreground">Status unavailable right now.</p>
      ) : !health ? (
        <p className="text-muted-foreground">Checking live status…</p>
      ) : (
        <ul className="divide-y divide-border">
          {[
            {
              label: "Walrus Memory",
              ok: health.relayer === "ok",
              value: `${health.relayer}${health.relayerVersion ? ` · v${health.relayerVersion}` : ""}`,
            },
            { label: "Session database", ok: health.db === "ok", value: health.db },
            { label: "Model", ok: true, value: health.model.split("/").pop() ?? health.model },
          ].map((row) => (
            <li key={row.label} className="flex items-center gap-2 py-1.5">
              {dot(row.ok)}
              <span className="mr-auto">{row.label}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
