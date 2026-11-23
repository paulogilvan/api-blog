import type { LikesCountRecord } from '../use-cases/likes/likes-count.ts';

/** Resposta de curtir/descurtir: contagem de likes do post após a operação. */
export type LikesOutputDTO = { likes: number };

export function toLikesOutputDTO({ likesCount }: LikesCountRecord): LikesOutputDTO {
  return { likes: likesCount };
}
