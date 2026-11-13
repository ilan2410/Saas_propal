import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/resend';
import { resetPasswordEmail } from '@/lib/email/templates';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Lien vers /auth/callback, qui vérifie le token_hash côté navigateur (verifyOtp). */
function callbackUrl(origin: string, tokenHash: string, type: 'recovery'): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  return url.toString();
}

export function resolveOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_URL || new URL(request.url).origin;
}

/** Génère un lien de récupération et l'envoie via Resend. */
export async function sendPasswordReset(params: { email: string; origin: string }) {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'recovery',
    email: params.email,
  });
  if (error) throw error;

  const hashedToken = data.properties?.hashed_token;
  if (!hashedToken) throw new Error('Token de récupération introuvable');

  const mail = resetPasswordEmail(callbackUrl(params.origin, hashedToken, 'recovery'), {
    origin: params.origin,
  });
  await sendEmail({ to: params.email, ...mail });
}
