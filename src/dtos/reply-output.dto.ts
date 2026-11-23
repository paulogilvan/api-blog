import type { ReplyWithAuthorRecord } from '../repositories/reply.repository.ts';

/** Formato público de uma reply na API. */
export type ReplyOutputDTO = {
  id: number;
  content: string;
  /** ISO 8601 */
  createdAt: string;
  author: { id: number; name: string };
};

// Escolhe os campos explicitamente: nada além disso vai para a resposta.
export function toReplyOutputDTO(reply: ReplyWithAuthorRecord): ReplyOutputDTO {
  return {
    id: reply.id,
    content: reply.content,
    createdAt: reply.createdAt.toISOString(),
    author: { id: reply.author.id, name: reply.author.name },
  };
}
