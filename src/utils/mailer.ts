export type MailMessage = { to: string; subject: string; text: string; html: string };

/**
 * Abstração de envio de e-mail: os use cases dependem só disto, nunca do Nodemailer.
 * O remetente é fixo na configuração do adapter, não vem de quem chama.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
