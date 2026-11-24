import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/env.ts';
import { NodemailerMailer } from '../../src/utils/nodemailer-mailer.ts';
import { getMessage, markMailbox, waitForMessage } from '../helpers/mailpit.ts';

const smtpConfig = {
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  from: env.SMTP_FROM,
  user: env.SMTP_USER,
  pass: env.SMTP_PASS,
};

describe('NodemailerMailer (against Mailpit)', () => {
  beforeEach(async () => {
    await markMailbox();
  });

  it('delivers the message with SMTP_FROM as sender and both text and html', async () => {
    const mailer = new NodemailerMailer(smtpConfig);

    await mailer.send({
      to: 'author@example.com',
      subject: 'Hello',
      text: 'Plain body',
      html: '<p>Html body</p>',
    });

    const message = await getMessage((await waitForMessage({ to: 'author@example.com' })).ID);
    expect(message.Subject).toBe('Hello');
    expect(message.From).toEqual({ Name: 'Blog API', Address: 'no-reply@blog.local' });
    expect(message.Text.trim()).toBe('Plain body');
    expect(message.HTML).toContain('<p>Html body</p>');
  });

  it('authenticates when SMTP_USER and SMTP_PASS are set', async () => {
    const mailer = new NodemailerMailer({ ...smtpConfig, user: 'mailer', pass: 'secret' });

    await mailer.send({ to: 'author@example.com', subject: 'Auth', text: 'x', html: '<p>x</p>' });

    expect((await waitForMessage({ to: 'author@example.com' })).Subject).toBe('Auth');
  });

  it('rejects quickly when the SMTP server is unreachable', async () => {
    // Porta sem nada escutando: a conexão é recusada.
    const mailer = new NodemailerMailer({ ...smtpConfig, port: 1 });
    const startedAt = Date.now();

    await expect(
      mailer.send({ to: 'author@example.com', subject: 'x', text: 'x', html: '<p>x</p>' }),
    ).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
});
