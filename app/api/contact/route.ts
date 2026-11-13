import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveOrigin } from '@/lib/email/auth-emails';
import { sendEmail } from '@/lib/email/resend';
import { contactConfirmationEmail, contactNotificationEmail } from '@/lib/email/templates';
import { contactSchema, sectorLabel, teamSizeLabel } from '@/lib/contact/schema';
import { getClientIp, rateLimit } from '@/lib/security/rate-limit';

const DEFAULT_RECEIVER = 'contact@livenot.net';
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 5;
const MAX_PER_EMAIL = 2;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  // Honeypot : un robot remplit ce champ. On répond « succès » sans rien enregistrer.
  if (body && typeof body === 'object' && typeof body.website === 'string' && body.website.length > 0) {
    return NextResponse.json({ success: true });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const email = data.email.toLowerCase();

  const ipLimit = rateLimit(`contact:ip:${getClientIp(request)}`, MAX_PER_IP, WINDOW_MS);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'Trop de demandes. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter) } }
    );
  }

  // Même adresse déjà utilisée récemment : succès silencieux (évite le spam d'une boîte mail).
  if (!rateLimit(`contact:email:${email}`, MAX_PER_EMAIL, WINDOW_MS).allowed) {
    return NextResponse.json({ success: true });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: insertError } = await supabaseAdmin.from('contact_requests').insert({
    full_name: data.full_name,
    email,
    phone: data.phone,
    company: data.company,
    sector: data.sector,
    team_size: data.team_size ?? null,
    message: data.message || null,
    confirmation_requested: data.send_confirmation,
  });

  if (insertError) {
    console.error('Erreur enregistrement contact:', insertError);
    return NextResponse.json({ error: "Impossible d'enregistrer votre demande." }, { status: 500 });
  }

  // La demande est enregistrée : un échec d'envoi d'email ne doit pas la faire échouer.
  const origin = resolveOrigin(request);
  const receiver = process.env.CONTACT_RECEIVER_EMAIL || DEFAULT_RECEIVER;
  const emailData = {
    fullName: data.full_name,
    email,
    phone: data.phone,
    company: data.company,
    sectorLabel: sectorLabel(data.sector),
    teamSizeLabel: teamSizeLabel(data.team_size),
    message: data.message,
  };

  const tasks: Promise<unknown>[] = [
    sendEmail({
      to: receiver,
      replyTo: email,
      ...contactNotificationEmail(emailData, new URL('/admin/demandes', origin).toString(), { origin }),
    }),
  ];
  if (data.send_confirmation) {
    tasks.push(
      sendEmail({
        to: email,
        replyTo: receiver,
        ...contactConfirmationEmail(emailData, { origin }),
      })
    );
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((r) => {
    if (r.status === 'rejected') console.error('Erreur envoi email contact:', r.reason);
  });

  return NextResponse.json({ success: true });
}
