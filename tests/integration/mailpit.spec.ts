import { connect } from 'node:net';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/env.ts';
import { getMessage, listMessages, markMailbox, waitForMessage } from '../helpers/mailpit.ts';

const apiUrl = process.env.MAILPIT_API_URL;

/** Lê a saudação inicial do servidor SMTP (ex.: `220 ... ESMTP Mailpit`). */
function readSmtpGreeting(host: string, port: number) {
  return new Promise<string>((resolve, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(2000, () => socket.destroy(new Error('SMTP greeting timeout')));
    socket.once('data', (data) => {
      socket.end('QUIT\r\n');
      resolve(data.toString());
    });
    socket.once('error', reject);
  });
}

/** Envia pela API HTTP do Mailpit: valida a infraestrutura e o helper sem depender do Nodemailer. */
async function sendViaApi(to: string, subject: string) {
  const response = await fetch(`${apiUrl}/api/v1/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: { Email: 'no-reply@blog.local', Name: 'Blog API' },
      To: [{ Email: to }],
      Subject: subject,
      Text: 'Plain body',
      HTML: '<p>Html body</p>',
    }),
  });
  expect(response.ok).toBe(true);
}

/** Total real da caixa (sem o filtro da marca do helper). */
async function mailboxTotal() {
  const response = await fetch(`${apiUrl}/api/v1/messages?limit=1`);
  return ((await response.json()) as { total: number }).total;
}

describe('Mailpit (test SMTP server)', () => {
  beforeEach(async () => {
    await markMailbox();
  });

  it('accepts SMTP connections at SMTP_HOST:SMTP_PORT from .env.test', async () => {
    const greeting = await readSmtpGreeting(env.SMTP_HOST, env.SMTP_PORT);

    expect(greeting).toMatch(/^220 .*Mailpit/);
  });

  it('finds a delivered message by recipient and reads its text and html', async () => {
    await sendViaApi('author@example.com', 'Hello');

    const summary = await waitForMessage({ to: 'author@example.com' });
    const message = await getMessage(summary.ID);

    expect(message.Subject).toBe('Hello');
    expect(message.From.Address).toBe('no-reply@blog.local');
    expect(message.To.map((to) => to.Address)).toEqual(['author@example.com']);
    expect(message.Text.trim()).toBe('Plain body');
    expect(message.HTML).toContain('<p>Html body</p>');
  });

  it('ignores messages sent to other recipients', async () => {
    await sendViaApi('someone-else@example.com', 'Not for you');

    await expect(waitForMessage({ to: 'author@example.com', timeoutMs: 300 })).rejects.toThrow(
      /No e-mail/,
    );
  });

  it('only sees messages sent after the mark, without deleting the older ones', async () => {
    await sendViaApi('author@example.com', 'Before the mark');
    await waitForMessage({ to: 'author@example.com' });
    const totalBefore = await mailboxTotal();

    await markMailbox();

    // As mensagens antigas continuam na caixa (visíveis na UI), mas fora do que o helper enxerga.
    expect(await listMessages()).toEqual([]);
    expect(await mailboxTotal()).toBe(totalBefore);
    await expect(waitForMessage({ to: 'author@example.com', timeoutMs: 200 })).rejects.toThrow();

    await sendViaApi('author@example.com', 'After the mark');
    const messages = await listMessages();
    expect(messages.map((m) => m.Subject)).toEqual(['After the mark']);
  });

  it('lists the messages since the mark from newest to oldest', async () => {
    await sendViaApi('a@example.com', 'First');
    await sendViaApi('b@example.com', 'Second');

    await waitForMessage({ to: 'b@example.com' });
    expect((await listMessages()).map((m) => m.Subject)).toEqual(['Second', 'First']);
  });
});
