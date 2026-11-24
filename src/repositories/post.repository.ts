/** `imagePath` é o caminho relativo a UPLOAD_DIR (ou `null`); a URL pública é montada no DTO. */
export type PostRecord = {
  id: number;
  title: string;
  content: string;
  imagePath: string | null;
  createdAt: Date;
};

/** Contadores derivados de outras tabelas, calculados na leitura (não são colunas de `posts`). */
export type PostCountersRecord = { likesCount: number; repliesCount: number };

export type PostWithAuthorRecord = PostRecord &
  PostCountersRecord & { author: { id: number; name: string } };

/** Abstração de persistência de posts: os use cases dependem só disto, nunca do ORM. */
export interface PostRepository {
  findMany(params: {
    limit: number;
    offset: number;
  }): Promise<{ rows: PostWithAuthorRecord[]; total: number }>;
  findById(id: number): Promise<PostWithAuthorRecord | null>;
  findAuthorId(id: number): Promise<number | null>;
  /**
   * Título do post e contato do autor, para a notificação de nova reply. É o único ponto que
   * lê o e-mail do autor de um post: ele nunca vai para os DTOs. `null` se o post não existe.
   */
  findWithAuthorContact(
    id: number,
  ): Promise<{ title: string; author: { id: number; name: string; email: string } } | null>;
  create(data: { title: string; content: string; authorId: number }): Promise<PostRecord>;
  update(
    id: number,
    data: { title?: string; content?: string },
  ): Promise<(PostRecord & PostCountersRecord) | null>;
  /**
   * Troca a imagem e retorna o caminho anterior (para o arquivo antigo ser apagado).
   * Retorna `null` se o post não existir mais.
   */
  updateImagePath(
    id: number,
    imagePath: string,
  ): Promise<{ post: PostRecord & PostCountersRecord; previousImagePath: string | null } | null>;
  /** Apaga o post e retorna o caminho da imagem dele (para o arquivo ser apagado); `null` se não existia. */
  delete(id: number): Promise<{ imagePath: string | null } | null>;
}
