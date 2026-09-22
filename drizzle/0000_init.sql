CREATE TYPE "public"."coaching_mode" AS ENUM('mock_interview', 'drill', 'review', 'free_chat');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('profile', 'target_role', 'interview_date', 'learning_style', 'mistake', 'strength', 'improvement', 'goal', 'preference');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "coaching_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"mode" "coaching_mode" NOT NULL,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"title" text NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "coaching_sessions_turn_count_nonneg" CHECK ("coaching_sessions"."turn_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "memory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"coaching_session_id" uuid,
	"namespace" text NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"job_id" text NOT NULL,
	"blob_id" text,
	"status" "memory_status" DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "memory_events_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "memory_events_blob_id_unique" UNIQUE("blob_id"),
	CONSTRAINT "memory_events_done_has_blob" CHECK ("memory_events"."status" <> 'done' OR "memory_events"."blob_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "recall_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"coaching_session_id" uuid,
	"recalled_blob_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"result_count" integer NOT NULL,
	"best_distance" real,
	"latency_ms" integer NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"degraded_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"onboarded_at" timestamp with time zone,
	"memory_consent_at" timestamp with time zone,
	"namespace_version" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_events" ADD CONSTRAINT "memory_events_coaching_session_id_coaching_sessions_id_fk" FOREIGN KEY ("coaching_session_id") REFERENCES "public"."coaching_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_events" ADD CONSTRAINT "recall_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_events" ADD CONSTRAINT "recall_events_coaching_session_id_coaching_sessions_id_fk" FOREIGN KEY ("coaching_session_id") REFERENCES "public"."coaching_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaching_sessions_user_created_idx" ON "coaching_sessions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "memory_events_user_status_idx" ON "memory_events" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "memory_events_namespace_idx" ON "memory_events" USING btree ("namespace");--> statement-breakpoint
CREATE INDEX "memory_events_session_idx" ON "memory_events" USING btree ("coaching_session_id");--> statement-breakpoint
CREATE INDEX "recall_events_user_created_idx" ON "recall_events" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");