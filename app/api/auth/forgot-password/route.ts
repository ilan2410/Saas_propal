import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveOrigin, sendPasswordReset } from '@/lib/email/auth-emails';
import { getClientIp, rateLimit } from '@/lib/security/rate-limit';

const schema = z.object({ email: z.string().trim().email().max(254) });

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const MAX_PER_EMAIL = 3;

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const ipLimit = rateLimit(`forgot:ip:${getClientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter) } }
    );
  }

  // Limite par adresse : on répond comme un succès sans envoyer (pas d'énumération, pas de spam de la boîte).
  const emailLimit = rateLimit(`forgot:email:${email}`, MAX_PER_EMAIL, WINDOW_MS);
  if (!emailLimit.allowed) {
    return NextResponse.json({ success: true });
  }

  try {
    await sendPasswordReset({ email, origin: resolveOrigin(request) });
  } catch (error) {
    // Réponse identique que le compte existe ou non (anti-énumération).
    console.error('Erreur forgot-password:', error);
  }

  return NextResponse.json({ success: true });
}
