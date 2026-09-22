import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  COACHING_MODES,
  type CoachingMode,
  MEMORY_KINDS,
  MEMORY_STATUSES,
  type MemoryKind,
  type MemoryStatus,
} from "@/types/domain";
import { user } from "./auth-schema";

export * from "./auth-schema";

/*
 * App tables. Postgres holds identity, coaching-session metadata and memory
 * METADATA only (job/blob ids, kinds, status, timings). Memory text and
 * conversation transcripts never land here — they live on Walrus.
 */

export const coachingMode = pgEnum("coaching_mode", COACHING_MODES);
export const memoryKind = pgEnum("memory_kind", MEMORY_KINDS);
export const memoryStatus = pgEnum("memory_status", MEMORY_STATUSES);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  onboardedAt: timestamptz("onboarded_at"),
  /** Explicit consent to store memories on Walrus (public network, encrypted, immutable). */
  memoryConsentAt: timestamptz("memory_consent_at"),
  namespaceVersion: smallint("namespace_version").notNull().default(1),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const coachingSessions = pgTable(
  "coaching_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mode: coachingMode("mode").notNull(),
    /** false = Amnesia Mode: nothing recalled or saved. */
    memoryEnabled: boolean("memory_enabled").notNull().default(true),
    /** Generic label, e.g. "Mock interview · 22 Sep" — never derived from message content. */
    title: text("title").notNull(),
    turnCount: integer("turn_count").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    endedAt: timestamptz("ended_at"),
  },
  (t) => [
    index("coaching_sessions_user_created_idx").on(t.userId, t.createdAt.desc()),
    check("coaching_sessions_turn_count_nonneg", sql`${t.turnCount} >= 0`),
  ],
);

export const memoryEvents = pgTable(
  "memory_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    coachingSessionId: uuid("coaching_session_id").references(() => coachingSessions.id, {
      onDelete: "set null",
    }),
    namespace: text("namespace").notNull(),
    kind: memoryKind("kind").notNull(),
    jobId: text("job_id").notNull().unique(),
    blobId: text("blob_id").unique(),
    status: memoryStatus("status").notNull().default("pending"),
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    completedAt: timestamptz("completed_at"),
  },
  (t) => [
    index("memory_events_user_status_idx").on(t.userId, t.status),
    index("memory_events_namespace_idx").on(t.namespace),
    index("memory_events_session_idx").on(t.coachingSessionId),
    check("memory_events_done_has_blob", sql`${t.status} <> 'done' OR ${t.blobId} IS NOT NULL`),
  ],
);

export const recallEvents = pgTable(
  "recall_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    coachingSessionId: uuid("coaching_session_id").references(() => coachingSessions.id, {
      onDelete: "set null",
    }),
    recalledBlobIds: text("recalled_blob_ids").array().notNull().default(sql`'{}'::text[]`),
    resultCount: integer("result_count").notNull(),
    bestDistance: real("best_distance"),
    latencyMs: integer("latency_ms").notNull(),
    degraded: boolean("degraded").notNull().default(false),
    degradedReason: text("degraded_reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("recall_events_user_created_idx").on(t.userId, t.createdAt.desc())],
);

export type { CoachingMode, MemoryKind, MemoryStatus };
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type CoachingSessionRow = typeof coachingSessions.$inferSelect;
export type MemoryEventRow = typeof memoryEvents.$inferSelect;
export type RecallEventRow = typeof recallEvents.$inferSelect;
