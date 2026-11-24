import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, Mailer } from './mailer.ts';

export type SmtpConfig = {
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
};

/** Adapter Nodemailer (SMTP). Único arquivo do projeto que importa `nodemailer`. */
export class NodemailerMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor({ host, port, from, user, pass }: SmtpConfig) {
    this.from = from;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      // 465 é SMTPS (TLS desde a conexão); nas demais portas o Nodemailer usa STARTTLS se o
      // servidor oferecer. O Mailpit de dev/teste não oferece, e o envio segue sem TLS.
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
      // O envio é aguardado dentro da requisição: um SMTP fora do ar não pode segurar a
      // resposta pelos ~2 min padrão do Nodemailer.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  async send({ to, subject, text, html }: MailMessage) {
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}
