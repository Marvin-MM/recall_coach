"use client";

import { useEffect, useState } from "react";
import type { HealthDto } from "@/types/api";

/** Live /api/health readout (DB, Walrus relayer, model). */
export function LiveStatus() {
  const [health, setHealth] = useState<HealthDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthDto>)
      .then((h) => !cancelled && setHealth(h))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

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
