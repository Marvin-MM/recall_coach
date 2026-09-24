CREATE TYPE "public"."session_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."session_message_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TABLE "session_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coaching_session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "session_message_role" NOT NULL,
	"seq" integer NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"status" "session_message_status" DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_messages_session_seq_unique" UNIQUE("coaching_session_id","seq"),
	CONSTRAINT "session_messages_seq_nonneg" CHECK ("session_messages"."seq" >= 0)
);
--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "last_activity_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "save_transcripts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_coaching_session_id_coaching_sessions_id_fk" FOREIGN KEY ("coaching_session_id") REFERENCES "public"."coaching_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_messages_user_created_idx" ON "session_messages" USING btree ("user_id","created_at");--> statement-breakpoint
-- Backfill: existing sessions were last active when last updated (not at migration time).
UPDATE "coaching_sessions" SET "last_activity_at" = "updated_at";
