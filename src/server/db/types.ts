import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type Schema = typeof schema;

/**
 * Driver-agnostic database handle. Neon (WebSocket Pool), node-postgres and
 * PGlite databases all satisfy this, so repositories run unchanged in prod,
 * local dev and tests.
 */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything repositories can run queries on: the root db or a transaction. */
export type Queryable = Db | Tx;
