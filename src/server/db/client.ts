import "server-only";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { attachDatabasePool } from "@vercel/functions";
import { sql } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import ws from "ws";
import { env } from "@/env";
import { ServiceUnavailableError } from "@/lib/errors";
import { withTimeout } from "@/lib/timeout";
import * as schema from "./schema";
import type { Db } from "./types";

type Driver = "neon" | "pg";

export function pickDriver(url: string, override?: Driver): Driver {
  if (override) return override;
  const host = new URL(url).hostname;
  return host.endsWith(".neon.tech") ? "neon" : "pg";
}

interface DbHolder {
  db: Db;
  end: () => Promise<void>;
}

function create(url: string, driver: Driver): DbHolder {
  if (driver === "neon") {
    // Node has no global WebSocket in all targets; the Neon Pool needs one
    // for interactive transactions.
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url, max: 5 });
    attachDatabasePool(pool);
    return { db: drizzleNeon(pool, { schema }), end: () => pool.end() };
  }
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 10_000 });
  attachDatabasePool(pool);
  return { db: drizzleNodePg(pool, { schema }), end: () => pool.end() };
}

// Survive Next.js dev HMR without leaking pools.
const globalForDb = globalThis as unknown as { __recallDb?: DbHolder | undefined };

export function getDb(): Db {
  if (!globalForDb.__recallDb) {
    globalForDb.__recallDb = create(
      env.DATABASE_URL,
      pickDriver(env.DATABASE_URL, env.DATABASE_DRIVER),
    );
  }
  return globalForDb.__recallDb.db;
}

export async function closeDb(): Promise<void> {
  const holder = globalForDb.__recallDb;
  globalForDb.__recallDb = undefined;
  await holder?.end();
}

/** First connections (cold dev server, serverless cold start) can take a few seconds. */
export async function pingDb(timeoutMs = 4000): Promise<boolean> {
  try {
    await withTimeout(getDb().execute(sql`select 1`), timeoutMs, "db.ping");
    return true;
  } catch {
    return false;
  }
}

/** True for connection-level failures (DB down/unreachable), not query bugs. */
export function isDbUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") {
    if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(code))
      return true;
    // 08xxx connection exceptions, 57P0x admin shutdown / cannot connect now
    if (code.startsWith("08") || code.startsWith("57P0")) return true;
  }
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause !== undefined && cause !== error ? isDbUnavailable(cause) : false;
}

export function toServiceUnavailable(error: unknown): ServiceUnavailableError {
  return new ServiceUnavailableError(
    "Database temporarily unavailable. Please retry shortly.",
    error,
  );
}
