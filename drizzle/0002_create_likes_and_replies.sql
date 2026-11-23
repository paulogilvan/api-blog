CREATE TABLE "post_likes" (
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "replies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"content" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"post_id" integer NOT NULL,
	"author_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_likes_user_id_idx" ON "post_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "replies_post_id_created_at_id_idx" ON "replies" USING btree ("post_id","created_at","id");--> statement-breakpoint
CREATE INDEX "replies_author_id_idx" ON "replies" USING btree ("author_id");