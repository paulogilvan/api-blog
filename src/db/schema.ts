import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 100 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
  token: varchar({ length: 64 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const posts = pgTable(
  'posts',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: varchar({ length: 200 }).notNull(),
    content: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('posts_author_id_idx').on(table.authorId),
    index('posts_created_at_idx').on(table.createdAt),
  ],
);

// A chave primária composta garante no máximo 1 like por usuário por post, inclusive sob
// requisições concorrentes (o like idempotente usa ON CONFLICT DO NOTHING). Ela também
// atende a contagem por post e o `likedByMe` (prefixo `post_id`).
export const postLikes = pgTable(
  'post_likes',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    // Sem ele, apagar um usuário faria varredura completa em post_likes no cascade.
    index('post_likes_user_id_idx').on(table.userId),
  ],
);

export const replies = pgTable(
  'replies',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    content: varchar({ length: 1000 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // Atende a listagem do post na ordem do contrato (created_at ASC, id ASC) e a contagem.
    index('replies_post_id_created_at_id_idx').on(table.postId, table.createdAt, table.id),
    index('replies_author_id_idx').on(table.authorId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostLike = typeof postLikes.$inferSelect;
export type NewPostLike = typeof postLikes.$inferInsert;
export type Reply = typeof replies.$inferSelect;
export type NewReply = typeof replies.$inferInsert;
