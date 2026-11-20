# API de Blog

API REST de blog com autenticação por token de sessão e gestão de posts, escrita em TypeScript com Express, Drizzle ORM e PostgreSQL.

- Cadastro e login retornam um **token de sessão**, que é persistido no banco.
- Usuários autenticados podem **criar, editar e apagar apenas os próprios posts**.
- A **listagem** (paginada) e a **consulta individual** de posts são públicas.

## Stack

| Camada | Tecnologia |
|---|---|
| Linguagem / build | TypeScript, Vite |
| HTTP | Express 5 |
| Validação | Zod |
| ORM | Drizzle |
| Banco | PostgreSQL 17 (Docker Compose) |
| Hash de senha | bcrypt |
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

# 3. Subir os bancos (aplicação na porta 6000, testes na porta 6001)
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

Os valores são validados com Zod ao iniciar. Se algum for inválido, a aplicação não sobe.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Inicia a API com recarga automática (tsx) |
| `npm run build` | Faz o typecheck e gera o build em `dist/` |
| `npm start` | Executa o build de `dist/` |
| `npm run typecheck` | Verifica os tipos sem gerar arquivos |
| `npm test` | Roda a suíte de testes uma vez |
| `npm run test:watch` | Roda os testes em modo watch |
| `npm run db:up` / `db:down` | Sobe ou derruba os containers do Postgres |
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
| `GET` | `/api/posts/:id` | Não | Retorna um post |
| `POST` | `/api/posts` | Sim | Cria um post |
| `PUT` | `/api/posts/:id` | Sim | Atualiza parcialmente o próprio post |
| `DELETE` | `/api/posts/:id` | Sim | Apaga o próprio post |
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
  "user": { "id": 1, "name": "Maria", "email": "maria@example.com" }
}
```

- O e-mail é normalizado (sem espaços nas pontas e em minúsculas).
- Cada login gera um novo token e invalida o anterior.
- O login responde com a mesma mensagem genérica, seja o e-mail inexistente ou a senha errada.

### Posts

Todas as respostas de post seguem o mesmo formato. O autor aparece só com `id` e `name`, nunca com o e-mail.

```json
{
  "id": 1,
  "title": "Meu primeiro post",
  "content": "Olá, mundo!",
  "createdAt": "2026-08-07T21:00:00.000Z",
  "author": { "id": 1, "name": "Maria" }
}
```

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
  "data": [ { "id": 12, "title": "...", "content": "...", "createdAt": "...", "author": { "id": 1, "name": "Maria" } } ],
  "meta": { "page": 2, "limit": 10, "total": 25, "totalPages": 3 }
}
```

Os parâmetros `id` e `page` aceitam apenas inteiros decimais positivos (`1`, `2`, `42`). Valores como `0`, `-1`, `01`, `1.5` ou `0x10` retornam 400.

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
| 400 | `VALIDATION_ERROR` | Body, parâmetro ou query inválido, ou JSON malformado |
| 401 | `UNAUTHORIZED` | Token ausente ou inválido, ou credenciais incorretas |
| 403 | `FORBIDDEN` | Tentativa de editar ou apagar o post de outro usuário |
| 404 | `NOT_FOUND` | Post ou rota inexistente |
| 409 | `CONFLICT` | E-mail já cadastrado |
| 500 | `INTERNAL_ERROR` | Erro inesperado |

O campo `details` só aparece em erros de validação.

## Arquitetura

Cada requisição passa pelas mesmas camadas:

```
Route → (ensureAuthenticated) → Controller → Service → Drizzle / PostgreSQL
                                     ↑
                                Zod (input)
```

- **Controller:** valida `body`, `params` e `query` com Zod, chama o service e devolve o status HTTP.
- **Service:** concentra as regras de negócio (hash de senha, token, posse do post, paginação). Não conhece Express.
- **Middleware `ensureAuthenticated`:** resolve o usuário a partir do token antes do controller.
- **Error handler:** converte `ZodError` e `AppError` no formato de erro padrão e esconde detalhes de erros inesperados.

```
src/
├── app.ts               # montagem do Express
├── server.ts            # inicialização e encerramento gracioso
├── env.ts               # validação das variáveis de ambiente
├── controllers/
├── services/
├── schemas/             # schemas Zod de entrada
├── routes/
├── middlewares/         # autenticação e tratamento de erros
├── errors/              # AppError
└── db/                  # conexão e schema do Drizzle
drizzle/                 # migrations SQL
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

A configuração do banco de teste fica em `.env.test`.
