import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/types";

export interface TestDb {
  db: Db;
  client: PGlite;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/** In-process Postgres with the committed drizzle migrations applied. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return {
    db,
    client,
    reset: async () => {
      await db.execute(
        sql`truncate table "recall_events", "memory_events", "coaching_sessions", "user_settings", "session", "account", "verification", "user" cascade`,
      );
    },
    close: () => client.close(),
  };
}

let counter = 0;
export async function insertUser(db: Db, overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  counter++;
  const rows = await db
    .insert(schema.user)
    .values({
      id: overrides.id ?? `user${counter}abc`,
      name: overrides.name ?? `Test User ${counter}`,
      email: overrides.email ?? `test${counter}@example.test`,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("insertUser failed");
  return row;
}
