# AGENTS.md

Guia para agentes de IA que trabalham neste repositório. Leia antes de alterar qualquer coisa.
O [README.md](README.md) documenta a API para humanos (endpoints, payloads, exemplos de curl). Este arquivo foca em **como o código está organizado e quais convenções seguir**.

## Visão geral

API REST de blog em **TypeScript + Express 5 + Drizzle ORM + PostgreSQL 17**.

- Usuários se cadastram/logam e recebem um **token de sessão opaco** (64 chars hex), salvo na coluna `users.token`. Cada login gera um novo token e invalida o anterior (um token por usuário).
- Rotas protegidas usam `Authorization: Bearer <token>`.
- Posts: listagem paginada e consulta por id são **públicas**; criar/editar/apagar exige auth, e só o dono edita/apaga.
- Likes: usuário autenticado curte/descurte posts; a contagem é pública.
- Replies: usuário autenticado responde posts e só o autor da reply a apaga; as replies são públicas e aparecem no post individual.
- Escopo fechado em **auth + posts + likes + replies** (sem logout, perfil, troca de senha, admin, thread de replies, like em reply, paginação ou edição de replies — ver `docs/api.md`).

Idioma: código (identificadores, mensagens de erro da API) e mensagens de commit em **inglês**; comentários e docs em **português**.

## Comandos

| Comando | Uso |
|---|---|
| `npm run db:up` | Sobe os dois Postgres via Docker (`db` na porta **6000**, `db_test` na porta **6001**) |
| `npm run dev` | API em watch (tsx), lê `.env`, porta padrão 3333, prefixo `/api` |
| `npm test` | Vitest (precisa do `db_test` rodando; migrations aplicadas automaticamente) |
| `npm run typecheck` | `tsc` sem emitir — rode após qualquer mudança |
| `npm run build` | `tsc` + `vite build` (SSR) → `dist/server.js` |
| `npm run db:generate` | Gera migration SQL em `drizzle/` a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica migrations no banco de dev (`db:migrate:test` para o de teste) |

Requisitos: Node ≥ 22, Docker. O shell do usuário é Windows (PowerShell / Git Bash).

## Arquitetura em camadas

```
Route → [ensureAuthenticated] → Controller → Use Case → Repository / Utils (interfaces)
                                    │                         ▲ implementados por
                              Zod (entrada)          Drizzle*Repository, BcryptPasswordHasher,
                              DTO mapper (saída)     CryptoTokenGenerator
```

| Pasta | Responsabilidade |
|---|---|
| `src/server.ts` | Sobe o servidor e faz shutdown gracioso (fecha o `pool`) |
| `src/app.ts` | `createApp()` — monta Express, rotas em `/api`, 404 e error handler. Usado pelos testes |
| `src/env.ts` | Valida `NODE_ENV`, `PORT`, `DATABASE_URL` com Zod; a app não sobe se inválido |
| `src/routes/` | Só mapeia método/caminho → middleware/controller |
| `src/controllers/` | HTTP: valida `body/params/query` com Zod, chama o use case, define status e responde via mapper de DTO. **Também é o ponto de composição (DI manual)** |
| `src/schemas/` | Schemas Zod de entrada + tipos inferidos (`RegisterInput`, `CreatePostInput`, `CreateReplyBody`…); `common.schema.ts` tem `positiveIntFromString` para ids/páginas da URL |
| `src/use-cases/` | Regras de negócio. Uma classe por operação implementando `UseCase<Input, Output>` (`execute`). Lançam `AppError` |
| `src/repositories/` | Interfaces (`PostRepository`, `LikeRepository`, `ReplyRepository`, `UserRepository`) + adapters `Drizzle*Repository`; `pg-error.ts` detecta códigos/constraints do Postgres |
| `src/utils/` | Interfaces `PasswordHasher`, `TokenGenerator` + adapters bcrypt / `node:crypto` |
| `src/dtos/` | Tipos de saída da API + mappers puros (`toPostOutputDTO`, `toPostDetailOutputDTO`, `toPostListOutputDTO`, `toLikesOutputDTO`, `toReplyOutputDTO`, `toAuthOutputDTO`) |
| `src/middlewares/` | `ensureAuthenticated` (+ `getAuthenticatedUser(req)`), `optionalAuthentication` (+ `getOptionalUser(req)`) e `errorHandler`/`notFoundHandler` |
| `src/errors/app-error.ts` | `AppError(code, message, details?)`; o status HTTP sai do `code` |
| `src/db/` | `pool`, `db` (Drizzle) e `schema.ts` (tabelas `users` e `posts`) |
| `drizzle/` | Migrations SQL geradas + `meta/` (não editar à mão) |
| `tests/` | `integration/` (por endpoint), `unit/`, `helpers/` |

### Regras de dependência (respeite ao adicionar código)

- **Use cases dependem só de interfaces** (repositories/utils), nunca de Express, Drizzle, bcrypt ou `node:crypto`. Recebem dependências pelo construtor (campos `private readonly`, atribuídos no corpo do construtor — não use parameter properties, pois `erasableSyntaxOnly` está ligado).
- **Composição fica no topo do módulo do controller** (fora dos handlers): instancia `Drizzle*Repository`, adapters e use cases uma vez, tipando as variáveis com a abstração (`const getPost: UseCase<GetPostInput, PostWithAuthorRecord> = new GetPostUseCase(repo)`). O middleware `ensureAuthenticated` faz o mesmo com `FindUserByTokenUseCase`.
- **Use cases retornam dados de domínio** (`PostWithAuthorRecord`, `AuthSession`), não JSON da API. O controller converte com o mapper de DTO. Mappers escolhem campos explicitamente (hash de senha e e-mail do autor nunca saem) e convertem `Date` → ISO string.
- **Detalhes de banco ficam no adapter Drizzle** (ex.: código Postgres `23505` de unicidade é traduzido para `null` em `DrizzleUserRepository.create`; `23503` na FK do post vira "post não existe" em like e reply). Use `isPgError(error, code, constraint?)` de `pg-error.ts`.
- Controllers não têm try/catch: Express 5 encaminha rejeições de handlers async ao `errorHandler`.

### Fluxo típico para uma nova funcionalidade

1. Schema Zod de entrada em `src/schemas/`.
2. Se precisar de persistência nova: método na interface do repository + implementação no adapter Drizzle (e migration, se mudar o schema).
3. Use case em `src/use-cases/<domínio>/<nome>.use-case.ts` implementando `UseCase<I, O>`.
4. DTO/mapper de saída em `src/dtos/` se o formato for novo.
5. Composição + handler no controller; rota em `src/routes/`.
6. Testes de integração em `tests/integration/<domínio>/`.

## Convenções de código

- ESM com **extensão `.ts` explícita nos imports** (`import { db } from '../db/index.ts'`). `verbatimModuleSyntax`: use `import type` para tipos.
- TS estrito, `noUnusedLocals/Parameters` (prefixe com `_` parâmetros não usados), `erasableSyntaxOnly` (sem `enum`, `namespace` de runtime ou parameter properties).
- Nomes de arquivo em kebab-case com sufixo de papel: `*.controller.ts`, `*.use-case.ts`, `*.repository.ts`, `*.schema.ts`, `*-output.dto.ts`, `*.routes.ts`, `*.spec.ts`.
- Aspas simples, ponto e vírgula, vírgula final, indentação de 2 espaços (não há linter/formatter configurado — siga o estilo existente).
- Comentários explicam o *porquê* (segurança, corridas, limites), em português.

## Banco de dados

- `users`: `id` (identity), `name` varchar(100), `email` varchar(255) **unique**, `password` (hash bcrypt), `token` varchar(64) unique nullable, `created_at` timestamptz.
- `posts`: `id`, `title` varchar(200), `content` text, `created_at`, `author_id` → `users.id` **on delete cascade**; índices em `author_id` e `created_at`.
- `post_likes`: `post_id`, `user_id`, `created_at`; **PK composta** (`post_id`, `user_id`) = 1 like por usuário por post; FKs com cascade para `posts` e `users`; índice em `user_id`.
- `replies`: `id`, `content` varchar(1000), `created_at`, `post_id`, `author_id`; FKs com cascade; índices em (`post_id`, `created_at`, `id`) e `author_id`.
- Colunas em snake_case no banco, camelCase no TS.
- Para mudar o schema: edite `src/db/schema.ts` → `npm run db:generate` → revise o SQL gerado → `npm run db:migrate`. Não edite migrations já commitadas.

## Regras de negócio e detalhes importantes

- **Erros**: sempre `{ error: { code, message, details? } }`. Códigos: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `INTERNAL_ERROR` 500. `ZodError` vira 400 com `details` (`path`, `message`); JSON malformado vira 400; erros inesperados viram 500 genérico.
- **Logs seguros**: `errorHandler` loga `DrizzleQueryError` sem os params (que contêm hash, token, e-mail). Mantenha isso — há teste unitário cobrindo.
- **Auth**:
  - E-mail normalizado (trim + lowercase) no schema.
  - Senha 6..72 **bytes** UTF-8 (limite do bcrypt).
  - Login responde a mesma mensagem para e-mail inexistente ou senha errada e roda `bcrypt.compare` contra um hash fictício quando o usuário não existe (proteção contra timing attack).
  - bcrypt usa 4 rounds em `NODE_ENV=test`, 10 nos demais.
  - Token: `randomBytes(32).toString('hex')`. O middleware rejeita sem ir ao banco qualquer header fora de `^Bearer [a-f0-9]{64}$` (case-insensitive, normalizado para minúsculas).
  - Registro checa `existsByEmail` e também trata a corrida via violação de unicidade → 409.
- **Posts**:
  - Posse verificada por `ensurePostOwnership` (`use-cases/posts/post-ownership.ts`): 404 se não existe, 403 se não é dono. Update/delete tratam o post sumir entre a checagem e a escrita (404).
  - `PUT` é update parcial com `strictObject` (campos extras → 400) e exige `title` ou `content`.
  - `title`/`content` sofrem trim. `title` 1..200, `content` ≥ 1.
  - `id` e `page` aceitam só `^[1-9]\d*$` e ≤ 2147483647 (int do Postgres). `0`, `01`, `1.5`, `0x10` → 400.
  - Listagem: 10 por página (`POSTS_PER_PAGE`), ordem `created_at DESC, id DESC`; página e `count` lidos na mesma transação `repeatable read`. Página além da última → `data: []`, não 404. Resposta `{ data, meta: { page, limit, total, totalPages } }`.
  - Autor exposto só como `{ id, name }`.
  - Formatos: `PostSummary` (listagem, criação, edição) com `likesCount` e `repliesCount`, calculados por subconsultas correlacionadas no `DrizzlePostRepository`; `PostDetail` (`GET /:id`) acrescenta `likedByMe` e `replies`.
  - `GET /posts/:id` usa `optionalAuthentication`: sem header → anônimo (`likedByMe: false`); header presente e inválido → 401. A listagem ignora o header.
- **Likes** (`POST`/`DELETE /posts/:id/likes`):
  - Idempotentes: like repetido usa `ON CONFLICT DO NOTHING`; unlike sem like não é erro. Ambos respondem `200 { likes }`.
  - Post inexistente → 404 (no like, via FK `23503`; no unlike, checagem só quando nada foi apagado).
- **Replies**:
  - `POST /posts/:id/replies`: `content` trim, 1..1000, `strictObject`; 201 com `{ id, content, createdAt, author }`; post inexistente → 404 via FK.
  - `DELETE /posts/:id/replies/:replyId`: só o autor da reply (403 até para o dono do post, mensagem `You can only delete your own replies`). Reply é buscada **dentro do post da URL**: inexistente ou de outro post → 404 `Reply not found`, antes da checagem de posse.
  - No `GET /posts/:id`, `replies` vem completa, sem paginação, em `created_at ASC, id ASC`; `repliesCount` é `replies.length` para não divergir da lista.
- **Health**: `GET /api/health` faz `select 1`; 200 `{status:'ok',database:'up'}` ou 503.

## Testes

- Vitest + Supertest, **contra Postgres real** (`db_test`, porta 6001, config em `.env.test`). Sem mocks de banco.
- `tests/global-setup.ts` aplica as migrations de `drizzle/` antes da suíte.
- `fileParallelism: false` — arquivos rodam em série porque compartilham o banco.
- Padrão dos specs de integração: `const app = createApp()`, `beforeEach(resetDatabase)` (TRUNCATE com `RESTART IDENTITY`), `afterAll(() => pool.end())`. Helpers em `tests/helpers/api.ts` (`registerUser`, `createPost`, `likePost`, `createReply`, `defaultUser`).
- Testes descrevem comportamento em inglês. O projeto foi construído com **TDD**: ao adicionar/alterar comportamento, escreva ou atualize o teste de integração correspondente.
- Antes de concluir uma tarefa: `npm run typecheck` e `npm test` (com `npm run db:up` se os containers não estiverem rodando).

## Arquivos e contexto extra

- `.env` (gitignored) para dev; `.env.example` é o modelo; `.env.test` **é commitado** de propósito.
- `docs/` é **gitignored** e contém material de planejamento local: `project-prd.md` (requisitos), `braindump.md` (ideia original), `api.md` (especificação da API). Consulte se existir, mas não dependa dele.
- `dist/` é saída de build (gitignored).

## Git

- Branch principal: `main`. Commits no estilo Conventional Commits em inglês, com escopo: `feat(posts): ...`, `refactor(auth): ...`, `docs: ...`, `chore: ...`.
- Ao mudar arquitetura, endpoints ou comportamento visível, atualize também o `README.md` (e este arquivo, se as convenções mudarem).
