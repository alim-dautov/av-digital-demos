CREATE TABLE "doc_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer NOT NULL,
	"version" integer NOT NULL,
	"file_id" integer NOT NULL,
	"token" text NOT NULL,
	"title" text NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"lines" jsonb NOT NULL,
	"hash" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_versions_uq" ON "doc_versions" USING btree ("entity","entity_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_versions_token_uq" ON "doc_versions" USING btree ("token");