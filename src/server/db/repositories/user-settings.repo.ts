import { eq, sql } from "drizzle-orm";
import { type UserSettingsRow, userSettings } from "../schema";
import type { Queryable } from "../types";

export interface UserSettingsRepo {
  ensure(userId: string): Promise<void>;
  get(userId: string): Promise<UserSettingsRow | null>;
  /** Sets onboarded_at + memory_consent_at atomically (creating the row if needed). */
  completeOnboarding(userId: string, at: Date): Promise<UserSettingsRow>;
}

export function ensureUserSettings(db: Queryable, userId: string): Promise<unknown> {
  return db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing({ target: userSettings.userId });
}

export function createUserSettingsRepo(db: Queryable): UserSettingsRepo {
  return {
    async ensure(userId) {
      await ensureUserSettings(db, userId);
    },

    async get(userId) {
      const rows = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
      return rows[0] ?? null;
    },

    completeOnboarding(userId, at) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .insert(userSettings)
          .values({ userId, onboardedAt: at, memoryConsentAt: at })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: {
              onboardedAt: at,
              // Keep the ORIGINAL consent timestamp if the user re-onboards.
              memoryConsentAt: sql`coalesce(${userSettings.memoryConsentAt}, ${at.toISOString()}::timestamptz)`,
              updatedAt: at,
            },
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error("completeOnboarding: upsert returned no row");
        return row;
      });
    },
  };
}
