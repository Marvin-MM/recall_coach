"use client";

import { useEffect, useState } from "react";
import type { HealthDto } from "@/types/api";

export type SystemHealth =
  | { status: "checking" }
  | { status: "ok" | "degraded"; health: HealthDto }
  | { status: "unreachable" };

const FRESH_MS = 15_000;
/** A degraded first answer is re-checked once: dev cold starts and relayer blips clear quickly. */
const RECHECK_MS = 5_000;

let shared: { at: number; promise: Promise<HealthDto | null> } | null = null;

/** One request per page (15 s), shared by every status badge. `/api/status` always answers 200. */
function loadStatus(force = false): Promise<HealthDto | null> {
  if (!force && shared && Date.now() - shared.at < FRESH_MS) return shared.promise;
  const promise = fetch("/api/status", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<HealthDto>) : null))
    .catch(() => null);
  shared = { at: Date.now(), promise };
  return promise;
}

const toState = (h: HealthDto | null): SystemHealth =>
  h === null
    ? { status: "unreachable" }
    : { status: h.db === "ok" && h.relayer === "ok" ? "ok" : "degraded", health: h };

export function useSystemHealth(): SystemHealth {
  const [state, setState] = useState<SystemHealth>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    void loadStatus().then((first) => {
      if (cancelled) return;
      const next = toState(first);
      if (next.status === "ok") {
        setState(next);
        return;
      }
      // Keep "checking" and look once more before reporting a problem.
      timer = window.setTimeout(() => {
        void loadStatus(true).then((second) => !cancelled && setState(toState(second)));
      }, RECHECK_MS);
    });
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return state;
}
