// Cliente mínimo da API HTTP do Mailpit de teste (container `mailpit_test`, UI em
// http://localhost:8026). Os testes de e-mail rodam contra o Mailpit real, sem mock do Nodemailer.
//
// A caixa é limpa só uma vez por execução (no `tests/global-setup.ts`), para os e-mails da
// última execução ficarem visíveis na UI. O isolamento entre testes vem de uma marca: cada
// teste chama `markMailbox()` no `beforeEach`, e as consultas só enxergam o que chegou depois.
const defaultApiUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8026';

// Mais do que qualquer teste envia; a marca (mensagem mais recente) fica sempre dentro disso.
const PAGE_SIZE = 200;

type MailpitAddress = { Name: string; Address: string };

/** Item de `GET /api/v1/messages` (resumo, sem corpo). */
export type MailpitMessageSummary = {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  Subject: string;
  Snippet: string;
  Created: string;
};

/** `GET /api/v1/message/{ID}` (mensagem completa). */
export type MailpitMessage = {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  Subject: string;
  Text: string;
  HTML: string;
};

async function request<T>(path: string, init?: RequestInit, apiUrl = defaultApiUrl): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`Mailpit ${init?.method ?? 'GET'} ${path} failed: ${response.status}`);
  }
  return (response.headers.get('content-type')?.includes('json')
    ? response.json()
    : undefined) as Promise<T>;
}

async function fetchNewest(limit: number) {
  const body = await request<{ messages: MailpitMessageSummary[] }>(
    `/api/v1/messages?limit=${limit}`,
  );
  return body.messages;
}

/**
 * Apaga todas as mensagens da caixa de teste. Usado só no início da execução
 * (`global-setup`, que passa a URL lida do `.env.test`), nunca entre testes.
 */
export async function clearMailbox(apiUrl = defaultApiUrl) {
  await request('/api/v1/messages', { method: 'DELETE' }, apiUrl);
}

// ID da mensagem mais recente no momento da marca (`null` = caixa vazia).
let markId: string | null = null;

/** Marca o ponto a partir do qual o teste atual enxerga mensagens (usar no `beforeEach`). */
export async function markMailbox() {
  const [newest] = await fetchNewest(1);
  markId = newest?.ID ?? null;
}

/** Mensagens que chegaram depois da marca, da mais recente para a mais antiga. */
export async function listMessages(): Promise<MailpitMessageSummary[]> {
  const messages = await fetchNewest(PAGE_SIZE);
  if (markId === null) return messages;

  // A lista vem da mais nova para a mais antiga: tudo antes da marca é deste teste.
  const index = messages.findIndex((message) => message.ID === markId);
  return index === -1 ? messages : messages.slice(0, index);
}

export function getMessage(id: string): Promise<MailpitMessage> {
  return request<MailpitMessage>(`/api/v1/message/${encodeURIComponent(id)}`);
}

/**
 * Espera chegar uma mensagem para `to` depois da marca (polling curto): o envio SMTP termina
 * um pouco depois da resposta HTTP que o disparou. Falha com erro claro se nada chegar no prazo.
 */
export async function waitForMessage({
  to,
  timeoutMs = 2000,
  intervalMs = 50,
}: {
  to: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<MailpitMessageSummary> {
  const deadline = Date.now() + timeoutMs;
  const recipient = to.toLowerCase();

  while (true) {
    const found = (await listMessages()).find((message) =>
      message.To.some((address) => address.Address.toLowerCase() === recipient),
    );
    if (found) return found;
    if (Date.now() >= deadline) throw new Error(`No e-mail to ${to} within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
