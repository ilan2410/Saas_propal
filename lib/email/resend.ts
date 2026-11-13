import 'server-only';
import { Resend } from 'resend';

let client: Resend | null = null;

function getClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY manquante');
  }
  client ??= new Resend(apiKey);
  return client;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

/**
 * Envoie un email transactionnel via Resend.
 * Expéditeur : RESEND_FROM_EMAIL (ex: `PropoBoost <no-reply@mail.mondomaine.fr>`),
 * sur un domaine vérifié dans Resend.
 */
export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailInput) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error('RESEND_FROM_EMAIL manquante');
  }

  const { data, error } = await getClient().emails.send({
    from,
    to,
    subject,
    html,
    text,
    replyTo: replyTo ?? process.env.RESEND_REPLY_TO ?? undefined,
  });

  if (error) {
    throw new Error(`Resend: ${error.message}`);
  }
  return data;
}
