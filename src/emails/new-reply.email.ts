import { escapeHtml } from './escape-html.ts';

export type NewReplyEmailData = {
  /** Nome do autor do post (destinatário). */
  recipientName: string;
  replierName: string;
  postTitle: string;
  replyContent: string;
};

export type EmailContent = { subject: string; text: string; html: string };

/** Quebras de linha num cabeçalho permitiriam injetar outros cabeçalhos (ex.: `Bcc:`). */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}

/**
 * Monta o e-mail de nova reply (função pura). Todo texto vindo de usuários (nomes, título e
 * reply) é escapado no HTML; a versão `text` vai sem escape, porque não é interpretada.
 */
export function buildNewReplyEmail({
  recipientName,
  replierName,
  postTitle,
  replyContent,
}: NewReplyEmailData): EmailContent {
  const subject = `New reply on "${singleLine(postTitle)}"`;

  const text = [
    `Hi ${recipientName},`,
    '',
    `${replierName} replied to your post "${postTitle}":`,
    '',
    replyContent,
    '',
    '— Blog API',
  ].join('\n');

  const safe = {
    recipientName: escapeHtml(recipientName),
    replierName: escapeHtml(replierName),
    postTitle: escapeHtml(postTitle),
    // Escapa primeiro e só depois converte as quebras de linha em <br>.
    replyContent: escapeHtml(replyContent).replace(/\r?\n/g, '<br>'),
  };

  const html = `<!doctype html>
<html>
  <body style="font-family: sans-serif; line-height: 1.5;">
    <p>Hi ${safe.recipientName},</p>
    <p><strong>${safe.replierName}</strong> replied to your post <strong>"${safe.postTitle}"</strong>:</p>
    <blockquote style="margin: 0; padding: 8px 12px; border-left: 4px solid #ccc;">${safe.replyContent}</blockquote>
    <p>— Blog API</p>
  </body>
</html>`;

  return { subject, text, html };
}
