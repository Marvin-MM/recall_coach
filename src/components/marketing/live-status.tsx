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
        <ul className="space-y-1">
          <li className="flex items-center gap-2">
            {dot(health.relayer === "ok")} Walrus Memory relayer{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {health.relayer}
              {health.relayerVersion ? ` · v${health.relayerVersion}` : ""}
            </span>
          </li>
          <li className="flex items-center gap-2">
            {dot(health.db === "ok")} Session database{" "}
            <span className="font-mono text-xs text-muted-foreground">{health.db}</span>
          </li>
          <li className="flex items-center gap-2">
            {dot(true)} Model{" "}
            <span className="font-mono text-xs text-muted-foreground">{health.model}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
