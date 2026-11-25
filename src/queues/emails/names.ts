// Nomes da fila e dos jobs de e-mail. Arquivo sem efeitos colaterais (não lê env nem abre
// conexão): pode ser importado pelo `tests/global-setup.ts`, que roda fora do ambiente de teste.
export const EMAILS_QUEUE_NAME = 'emails';
export const NEW_REPLY_EMAIL_JOB = 'new-reply';
