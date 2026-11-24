# API de Blog

API REST de blog com autenticação por token de sessão e gestão de posts, escrita em TypeScript com Express, Drizzle ORM e PostgreSQL.

- Cadastro e login retornam um **token de sessão**, que é persistido no banco.
- Usuários autenticados podem **criar, editar e apagar apenas os próprios posts**.
- A **listagem** (paginada) e a **consulta individual** de posts são públicas.
- Usuários autenticados podem **curtir e descurtir** posts.
- Usuários autenticados podem **responder** (reply) posts e **apagar apenas as próprias replies**.
- O autor do post **recebe um e-mail** a cada nova reply de outra pessoa.
- Usuários autenticados podem **consultar os próprios dados** (`GET /api/me`).
- Usuários autenticados podem **enviar ou trocar o próprio avatar** (imagem redimensionada para 200×200 e salva em disco).
- O dono de um post pode **enviar ou trocar a imagem do post** (reduzida para no máximo 720p e salva em disco).

## Stack

| Camada | Tecnologia |
|---|---|
| Linguagem / build | TypeScript, Vite |
| HTTP | Express 5 |
| Validação | Zod |
| ORM | Drizzle |
| Banco | PostgreSQL 17 (Docker Compose) |
| Hash de senha | bcrypt |
| Upload / imagens | Multer (multipart em memória) + Sharp (redimensiona e converte para WebP) |
| E-mail | Nodemailer (SMTP); em dev/teste, Mailpit (SMTP falso via Docker Compose) |
| Testes | Vitest + Supertest (integração com banco real) |

## Requisitos

- Node.js 22 ou superior
- Docker e Docker Compose

## Como rodar

```bash
# 1. Instalar as dependências
npm install

# 2. Criar o arquivo de ambiente
cp .env.example .env

# 3. Subir os containers: bancos (aplicação na porta 6000, testes na 6001)
#    e Mailpit (dev: SMTP 1025 / caixa em http://localhost:8025; testes: SMTP 1026 / 8026)
npm run db:up

# 4. Aplicar as migrations no banco da aplicação
npm run db:migrate

# 5. Iniciar em modo desenvolvimento (recarrega ao salvar)
npm run dev
```

A API fica disponível em `http://localhost:3333/api`. Para conferir se ela está no ar:

```bash
curl http://localhost:3333/api/health
# {"status":"ok","database":"up","timestamp":"..."}
```

### Variáveis de ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `NODE_ENV` | `development`, `test` ou `production` | `development` |
| `PORT` | Porta HTTP | `3333` |
| `DATABASE_URL` | URL de conexão do PostgreSQL | obrigatória |
| `UPLOAD_DIR` | Pasta onde as imagens enviadas são gravadas (servida em `/uploads`) | `uploads` |
| `SMTP_HOST` | Host do servidor SMTP | obrigatória |
| `SMTP_PORT` | Porta do servidor SMTP (1 a 65535) | obrigatória |
| `SMTP_FROM` | Remetente, no formato `email` ou `Nome <email>` | obrigatória |
| `SMTP_USER` / `SMTP_PASS` | Credenciais SMTP. Opcionais, mas precisam vir juntas | — |

Os valores são validados com Zod ao iniciar. Se algum for inválido, a aplicação não sobe.

Em desenvolvimento, o SMTP é o **Mailpit** do Docker Compose (`localhost:1025`, sem credenciais): nenhum e-mail sai de verdade, e todos ficam visíveis em **http://localhost:8025**.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Inicia a API com recarga automática (tsx) |
| `npm run build` | Faz o typecheck e gera o build em `dist/` |
| `npm start` | Executa o build de `dist/` |
| `npm run typecheck` | Verifica os tipos sem gerar arquivos |
| `npm test` | Roda a suíte de testes uma vez |
| `npm run test:watch` | Roda os testes em modo watch |
| `npm run db:up` / `db:down` | Sobe ou derruba os containers (Postgres e Mailpit, de dev e de teste) |
| `npm run db:generate` | Gera uma migration a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica as migrations no banco da aplicação |
| `npm run db:studio` | Abre o Drizzle Studio |

## Endpoints

Todas as rotas usam o prefixo `/api`. As rotas protegidas exigem o header:

```http
Authorization: Bearer <token>
```

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/api/auth/register` | Não | Cadastra um usuário e retorna o token |
| `POST` | `/api/auth/login` | Não | Autentica e retorna um novo token |
| `GET` | `/api/posts` | Não | Lista os posts, paginados |
| `GET` | `/api/posts/:id` | Opcional | Retorna um post com suas replies (e `likedByMe` se houver token) |
| `POST` | `/api/posts` | Sim | Cria um post |
| `PUT` | `/api/posts/:id` | Sim | Atualiza parcialmente o próprio post |
| `DELETE` | `/api/posts/:id` | Sim | Apaga o próprio post (e a imagem dele) |
| `PUT` | `/api/posts/:id/image` | Sim | Envia ou troca a imagem do próprio post |
| `POST` | `/api/posts/:id/likes` | Sim | Curte um post |
| `DELETE` | `/api/posts/:id/likes` | Sim | Descurte um post |
| `POST` | `/api/posts/:id/replies` | Sim | Responde um post (e avisa o autor por e-mail) |
| `DELETE` | `/api/posts/:id/replies/:replyId` | Sim | Apaga a própria reply |
| `GET` | `/api/me` | Sim | Retorna os dados do usuário logado |
| `PUT` | `/api/me/avatar` | Sim | Envia ou troca o próprio avatar |
| `GET` | `/api/health` | Não | Status da API e do banco |

### Autenticação

**`POST /api/auth/register`** recebe `name` (1 a 100 caracteres), `email` (válido e único) e `password` (6 a 72 bytes). Responde **201**.

**`POST /api/auth/login`** recebe `email` e `password`. Responde **200**.

```bash
curl -X POST http://localhost:3333/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Maria","email":"maria@example.com","password":"secret123"}'
```

```json
{
  "token": "3f9c...e1a0",
  "user": { "id": 1, "name": "Maria", "email": "maria@example.com", "avatarUrl": null }
}
```

- O e-mail é normalizado (sem espaços nas pontas e em minúsculas).
- `avatarUrl` vem `null` no cadastro; no login, traz o avatar atual do usuário (ou `null`).
- Cada login gera um novo token e invalida o anterior.
- O login responde com a mesma mensagem genérica, seja o e-mail inexistente ou a senha errada.

### Posts

A listagem e as respostas de criação e edição usam o formato abaixo. O autor aparece só com `id` e `name`, nunca com o e-mail. `likesCount` e `repliesCount` são os totais de likes e de replies do post.

```json
{
  "id": 1,
  "title": "Meu primeiro post",
  "content": "Olá, mundo!",
  "imageUrl": "/uploads/posts/7d1c9e4b-2a3f-4b8c-9d0e-5f6a7b8c9d0e.webp",
  "createdAt": "2026-08-07T21:00:00.000Z",
  "author": { "id": 1, "name": "Maria" },
  "likesCount": 3,
  "repliesCount": 1
}
```

`imageUrl` é `null` quando o post não tem imagem (ver [Imagem do post](#imagem-do-post)).

**`GET /api/posts/:id`** retorna o mesmo formato acrescido de `likedByMe` e da lista completa de `replies`:

```json
{
  "id": 1,
  "title": "Meu primeiro post",
  "content": "Olá, mundo!",
  "imageUrl": null,
  "createdAt": "2026-08-07T21:00:00.000Z",
  "author": { "id": 1, "name": "Maria" },
  "likesCount": 3,
  "repliesCount": 1,
  "likedByMe": true,
  "replies": [
    {
      "id": 10,
      "content": "Ótimo post!",
      "createdAt": "2026-08-07T22:00:00.000Z",
      "author": { "id": 2, "name": "João" }
    }
  ]
}
```

- `replies` vem **sem paginação**, da mais antiga para a mais nova (`createdAt` crescente, com `id` como desempate), e é `[]` quando o post não tem respostas. A listagem traz só o `repliesCount`, nunca a lista.
- `likedByMe` diz se o usuário do token curtiu o post. A rota é pública com autenticação opcional:

  - Sem o header `Authorization`, `likedByMe` vem `false`.
  - Com um token válido, `likedByMe` reflete o like desse usuário.
  - Com o header presente, mas malformado ou com token inválido, responde **401** (não cai em silêncio para anônimo).

**`POST /api/posts`** recebe `title` (1 a 200 caracteres) e `content` (pelo menos 1 caractere). Os dois campos têm os espaços das pontas removidos. O autor vem do token. Responde **201**.

```bash
curl -X POST http://localhost:3333/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Meu primeiro post","content":"Olá, mundo!"}'
```

**`PUT /api/posts/:id`** aceita só `title`, só `content` ou os dois. É obrigatório enviar pelo menos um, e campos extras são rejeitados. Responde **200**.

**`DELETE /api/posts/:id`** apaga o post de vez. Responde **204**, sem corpo.

Editar ou apagar o post de outro usuário retorna **403**. Um post inexistente retorna **404**.

**`GET /api/posts?page=2`** lista os posts do mais novo para o mais antigo, com 10 por página. Sem o parâmetro `page`, vale a página 1. Uma página além da última retorna `data: []`, não 404.

```json
{
  "data": [ { "id": 12, "title": "...", "content": "...", "createdAt": "...", "author": { "id": 1, "name": "Maria" }, "likesCount": 0, "repliesCount": 0 } ],
  "meta": { "page": 2, "limit": 10, "total": 25, "totalPages": 3 }
}
```

### Likes

**`POST /api/posts/:id/likes`** curte o post com o usuário do token e **`DELETE /api/posts/:id/likes`** remove esse like. Nenhuma das duas tem corpo. Ambas respondem **200** com a contagem de likes do post após a operação. Post inexistente retorna **404**.

```bash
curl -X POST http://localhost:3333/api/posts/1/likes \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "likes": 3 }
```

- Cada usuário curte um post no máximo uma vez. Curtir de novo não é erro: responde 200 e a contagem não muda.
- Da mesma forma, descurtir um post que o usuário não curtiu responde 200 sem mudar nada.
- O autor pode curtir o próprio post.

### Replies

**`POST /api/posts/:id/replies`** responde o post com o usuário do token. Recebe `content` (1 a 1000 caracteres, sem os espaços das pontas). Campos extras são rejeitados. Responde **201** com a reply criada. Post inexistente retorna **404**.

```bash
curl -X POST http://localhost:3333/api/posts/1/replies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Ótimo post!"}'
```

```json
{
  "id": 10,
  "content": "Ótimo post!",
  "createdAt": "2026-08-07T22:00:00.000Z",
  "author": { "id": 2, "name": "João" }
}
```

- Replies são planas: sempre respondem o post, nunca outra reply.
- O autor do post também pode responder, e o mesmo usuário pode responder várias vezes.

**E-mail de nova reply:** depois de criar a reply, a API envia um e-mail ao **autor do post**, com o assunto `New reply on "<título do post>"`, o nome de quem respondeu, o título e o texto da reply (versões texto e HTML).

- Não é enviado quando o próprio autor responde o post dele.
- Uma falha no envio **não afeta a resposta**: a reply continua criada (201) e o erro só vai para o log, sem o destinatário nem o conteúdo.
- Todo texto vindo de usuários (nomes, título e reply) é escapado no HTML. O e-mail de quem respondeu nunca aparece na mensagem.
- Em desenvolvimento, os e-mails ficam em **http://localhost:8025** (Mailpit).

**`DELETE /api/posts/:id/replies/:replyId`** apaga a reply de vez. Responde **204**, sem corpo.

- Só o **autor da reply** pode apagá-la. Qualquer outro usuário recebe **403**, inclusive o dono do post.
- Reply inexistente, ou que pertence a outro post que não o `:id` da URL, retorna **404**. A posse só é verificada depois de confirmar que a reply existe naquele post.

### Imagem do post

**`PUT /api/posts/:id/image`** recebe `multipart/form-data` com **um único arquivo** no campo `image`. Só o **dono do post** pode enviar. Responde **200** com o post no formato da listagem e o novo `imageUrl`:

```bash
curl -X PUT http://localhost:3333/api/posts/1/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@foto.jpg"
```

- Aceita JPEG, PNG ou WebP de até **5 MB**. O formato é conferido decodificando o arquivo; a extensão e o `Content-Type` enviados não bastam.
- O tamanho não é fixo: a imagem é reduzida, mantendo a proporção, para caber em **1280×720 (720p)**. Paisagem fica com até 1280 px de largura e retrato com até 720 px de altura. Imagens menores não são ampliadas.
- Também é rotacionada conforme o EXIF, convertida para **WebP** e gravada sem metadados (EXIF/GPS), com nome **UUID** gerado pelo servidor (`posts/<uuid>.webp`).
- Enviar uma nova imagem substitui a anterior e apaga o arquivo antigo. Apagar o post também apaga a imagem.
- Ordem das checagens: auth (401) → upload (400 `File too large` / `Unexpected file field`) → `id` e presença do arquivo (400) → post inexistente (404) → post de outro usuário (403 `You can only update your own posts`) → decodificação (400 `Invalid image`).
- Os erros de upload são os mesmos do [avatar](#avatar). Nenhum arquivo fica gravado quando a requisição falha.

### Usuário logado

**`GET /api/me`** retorna os dados do dono do token. Responde **200**:

```bash
curl http://localhost:3333/api/me -H "Authorization: Bearer $TOKEN"
```

```json
{
  "id": 1,
  "name": "Maria",
  "email": "maria@example.com",
  "avatarUrl": null,
  "createdAt": "2026-08-07T21:00:00.000Z"
}
```

- `avatarUrl` vem `null` enquanto o usuário não enviar um avatar.
- Hash de senha e token nunca aparecem na resposta.
- Sem token, com token inválido ou com token substituído por um novo login, responde **401**.

### Avatar

**`PUT /api/me/avatar`** recebe `multipart/form-data` com **um único arquivo** no campo `image`. Responde **200** com os dados do usuário logado:

```bash
curl -X PUT http://localhost:3333/api/me/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@foto.jpg"
```

```json
{
  "id": 1,
  "name": "Maria",
  "email": "maria@example.com",
  "avatarUrl": "/uploads/avatars/0f8e2c1a-6b3d-4e5f-9a7b-1c2d3e4f5a6b.webp",
  "createdAt": "2026-08-07T21:00:00.000Z"
}
```

- Aceita JPEG, PNG ou WebP de até **5 MB**. O formato é conferido decodificando o arquivo; a extensão e o `Content-Type` enviados não bastam.
- A imagem é rotacionada conforme o EXIF, recortada no centro para **200×200**, convertida para **WebP** e gravada sem metadados (EXIF/GPS).
- O nome do arquivo é um **UUID** gerado pelo servidor; o nome original é descartado. O banco guarda só o caminho relativo (`avatars/<uuid>.webp`).
- Enviar um novo avatar substitui o anterior e apaga o arquivo antigo do disco.
- O arquivo fica acessível em `GET /uploads/avatars/<uuid>.webp` (fora do prefixo `/api`).
- Erros (todos **400** `VALIDATION_ERROR`): `Image is required` (sem arquivo), `Unexpected file field` (campo diferente de `image` ou mais de um arquivo), `File too large` (acima de 5 MB), `Invalid image` (não é JPEG/PNG/WebP válido) e `Invalid multipart body` (corpo multipart malformado). Sem token, **401** antes de ler o arquivo.

Os parâmetros `id`, `replyId` e `page` aceitam apenas inteiros decimais positivos (`1`, `2`, `42`). Valores como `0`, `-1`, `01`, `1.5` ou `0x10` retornam 400.

### Erros

Todas as respostas de erro usam o mesmo formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [{ "path": "title", "message": "Too small: expected string to have >=1 characters" }]
  }
}
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body, parâmetro ou query inválido, JSON malformado ou upload inválido |
| 401 | `UNAUTHORIZED` | Token ausente ou inválido, ou credenciais incorretas |
| 403 | `FORBIDDEN` | Tentativa de editar ou apagar o post de outro usuário |
| 404 | `NOT_FOUND` | Post ou rota inexistente |
| 409 | `CONFLICT` | E-mail já cadastrado |
| 500 | `INTERNAL_ERROR` | Erro inesperado |

O campo `details` só aparece em erros de validação.

## Arquitetura

Cada requisição passa pelas mesmas camadas:

```
Route → (ensureAuthenticated) → (upload Multer) → Controller → Use Case → Repository / Utils (interfaces)
                                                       ↑                              ↑ implementam
                                                  Zod (input)        Drizzle*Repository → PostgreSQL
                                                                     BcryptPasswordHasher, CryptoTokenGenerator,
                                                                     SharpImageProcessor, DiskFileStorage
```

Cada camada tem uma responsabilidade só (SRP):

- **Controller:** cuida do HTTP. Valida `body`, `params` e `query` com Zod, chama o use case e **delega a montagem do corpo da resposta** aos mappers de DTO de saída.
- **DTOs de saída:** descrevem o JSON da API em `src/dtos/`: `PostOutputDTO`, `PostDetailOutputDTO` e `PostListOutputDTO` (posts), `LikesOutputDTO` (likes), `ReplyOutputDTO` (replies), `AuthOutputDTO` (cadastro e login) e `MeOutputDTO` (usuário logado). Os mappers (`toPostOutputDTO`, `toPostDetailOutputDTO`, `toPostListOutputDTO`, `toLikesOutputDTO`, `toReplyOutputDTO`, `toAuthOutputDTO`, `toMeOutputDTO`) são funções puras que escolhem os campos expostos (o hash da senha nunca sai), convertem datas para ISO e montam o envelope `{ data, meta }` da listagem.
- **Use cases:** cada operação é uma classe própria que implementa a interface `UseCase<Input, Output>`, com um único método `execute`. Posts: `ListPostsUseCase`, `GetPostUseCase`, `CreatePostUseCase`, `UpdatePostUseCase`, `UpdatePostImageUseCase` e `DeletePostUseCase`. Likes: `LikePostUseCase` e `UnlikePostUseCase`. Replies: `CreateReplyUseCase` e `DeleteReplyUseCase`. Auth: `RegisterUseCase`, `LoginUseCase` e `FindUserByTokenUseCase`. Usuário: `GetMeUseCase` e `UpdateAvatarUseCase`. Concentram as regras de negócio (posse do post e da reply, paginação, cadastro e login, erros 401/403/404/409), devolvem dados de domínio e não conhecem Express, ORM nem bibliotecas de criptografia.
- **Repository:** é a interface de persistência que os use cases usam (`PostRepository`, `LikeRepository`, `ReplyRepository`, `UserRepository`).
- **Adapter Drizzle:** implementa o repository com Drizzle (`DrizzlePostRepository`, `DrizzleLikeRepository`, `DrizzleReplyRepository`, `DrizzleUserRepository`). Detalhes do banco ficam só aqui, como os códigos de erro do Postgres `23505` (unicidade, e-mail duplicado) e `23503` (chave estrangeira, like ou reply em post inexistente) e o `ON CONFLICT DO NOTHING` que torna o like idempotente.
- **Utils:** interfaces de funções auxiliares usadas pelos use cases (`PasswordHasher`, `TokenGenerator`, `ImageProcessor`, `FileStorage`, `Mailer`) e seus adapters (`BcryptPasswordHasher`, `CryptoTokenGenerator`, `SharpImageProcessor`, `DiskFileStorage`, `NodemailerMailer`). O conteúdo dos e-mails é montado por funções puras em `src/emails/`. O custo do bcrypt e o hash fictício que protege o login contra timing attack ficam no adapter, assim como as dimensões das imagens e a geração do nome do arquivo (UUID).
- **Upload:** o Multer só aparece em `middlewares/upload.ts`, guarda o arquivo em memória e traduz seus erros para `AppError`. O controller entrega ao use case apenas o `Buffer`; o use case processa a imagem, grava no disco e só então atualiza o banco (apagando o arquivo novo se a escrita no banco falhar).
- **Middlewares de autenticação:** `ensureAuthenticated` resolve o usuário a partir do token antes do controller e exige o token. `optionalAuthentication` (usado em `GET /api/posts/:id`) deixa a requisição seguir anônima sem o header, mas responde 401 se o header vier inválido.
- **Error handler:** converte `ZodError` e `AppError` no formato de erro padrão e esconde detalhes de erros inesperados.

### Inversão de dependência (DIP)

Os use cases recebem repositories e utils pelo construtor e dependem só das interfaces, nunca do Drizzle, do bcrypt ou do `node:crypto`. O controller é o ponto de composição: instancia as implementações concretas uma única vez, no topo do módulo (fora dos handlers), e os handlers só enxergam a abstração `UseCase`:

```ts
// src/controllers/post.controller.ts
const postRepository: PostRepository = new DrizzlePostRepository();
const likeRepository: LikeRepository = new DrizzleLikeRepository();
const replyRepository: ReplyRepository = new DrizzleReplyRepository();
const getPost: UseCase<GetPostInput, PostDetailRecord> = new GetPostUseCase(
  postRepository,
  likeRepository,
  replyRepository,
);

export const getPostController: RequestHandler = async (req, res) => {
  const { id } = postIdParamsSchema.parse(req.params);
  const viewer = getOptionalUser(req);
  const post = await getPost.execute({ postId: id, viewerId: viewer?.id ?? null });
  res.status(200).json(toPostDetailOutputDTO(post));
};
```

Para trocar o ORM ou usar um repository em memória nos testes, basta outra classe que implemente a mesma interface. Os use cases não mudam.

```
src/
├── app.ts               # montagem do Express
├── server.ts            # inicialização e encerramento gracioso
├── env.ts               # validação das variáveis de ambiente
├── controllers/         # HTTP: entrada, status e chamada aos use cases
├── dtos/                # DTOs de saída + mappers (formato do JSON da API)
├── use-cases/           # regras de negócio, um use case por operação (posts/, likes/, replies/, auth/, users/)
├── repositories/        # interfaces de persistência + adapters Drizzle
├── utils/               # interfaces de hash, token, imagem, arquivos e e-mail + adapters
├── emails/              # montagem do conteúdo dos e-mails (funções puras)
├── schemas/             # schemas Zod de entrada
├── routes/
├── middlewares/         # autenticação, upload (Multer) e tratamento de erros
├── errors/              # AppError
└── db/                  # conexão e schema do Drizzle
drizzle/                 # migrations SQL
uploads/                 # imagens enviadas (conteúdo fora do git)
tests/
├── integration/         # testes HTTP por endpoint
├── unit/
└── helpers/
```

## Testes

Os testes de integração rodam contra um **PostgreSQL real** (o container `db_test`, na porta 6001), sem mocks. As migrations são aplicadas automaticamente antes da suíte, e as tabelas são limpas entre os testes.

```bash
npm run db:up   # se os containers ainda não estiverem rodando
npm test
```

Os e-mails dos testes vão para um **Mailpit separado** (`mailpit_test`, SMTP na porta 1026 e API HTTP na 8026), consultado pela API dele em `tests/helpers/mailpit.ts`. Assim a suíte nunca mexe nos e-mails do Mailpit de desenvolvimento.

A caixa de teste é limpa **uma vez, no início de cada execução**, e não entre os testes. Depois de `npm test`, os e-mails enviados pela suíte ficam visíveis em **http://localhost:8026** até a próxima execução. Cada teste só enxerga as mensagens que chegaram depois do seu `beforeEach` (`markMailbox()`), então os testes continuam isolados.

A configuração do banco e do SMTP de teste fica em `.env.test`. Os uploads dos testes vão para `tmp/uploads-test` (limpo entre os testes), e as imagens de teste são geradas em memória com Sharp.
