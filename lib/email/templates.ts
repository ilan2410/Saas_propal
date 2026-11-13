const APP_NAME = 'Proboost';
const TAGLINE = 'Vos propositions commerciales, plus rapides.';

// Palette alignée sur le logo (bleu → violet).
const BLUE = '#2937e8';
const VIOLET = '#7c3aed';
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

export type RenderedEmail = { subject: string; html: string; text: string };

export type EmailContext = {
  /** URL publique de l'application (ex: https://app.proboost.fr), utilisée pour le logo. */
  origin: string;
};

export type EmailDetail = { label: string; value: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type EmailParts = {
  title: string;
  paragraphs: string[];
  details?: EmailDetail[];
  cta?: { label: string; url: string };
  notice: string;
  /** Ligne affichée sous la carte (par défaut : « ne pas répondre »). */
  footerNote?: string;
};

type LayoutInput = EmailParts & { origin: string; preheader: string };

const DEFAULT_FOOTER_NOTE = 'Cet email a été envoyé automatiquement, merci de ne pas y répondre.';

function multiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function layout(input: LayoutInput): string {
  const logoUrl = escapeHtml(new URL('/email/logo.png', input.origin).toString());
  const year = new Date().getFullYear();

  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#374151;">${escapeHtml(p)}</p>`
    )
    .join('\n');

  const details = input.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;border:1px solid ${LINE};border-radius:10px;background-color:#f8f9fc;">
${input.details
  .map(
    (d, i) => `                      <tr>
                        <td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ''}font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${MUTED};width:34%;vertical-align:top;">${escapeHtml(d.label)}</td>
                        <td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ''}font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:${INK};font-weight:600;vertical-align:top;">${multiline(d.value)}</td>
                      </tr>`
  )
  .join('\n')}
                    </table>`
    : '';

  const ctaUrl = input.cta ? escapeHtml(input.cta.url) : '';
  const button = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
                      <tr>
                        <td align="center" bgcolor="${BLUE}" style="border-radius:10px;background-color:${BLUE};background-image:linear-gradient(135deg,${BLUE},${VIOLET});">
                          <a href="${ctaUrl}" target="_blank" style="display:inline-block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(input.cta.label)}</a>
                        </td>
                      </tr>
                    </table>`
    : '';

  const fallbackLink = input.cta
    ? `<p style="margin:24px 0 6px;font-size:12px;line-height:18px;color:${MUTED};">Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :</p>
                    <p style="margin:0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${ctaUrl}" target="_blank" style="color:${BLUE};text-decoration:underline;">${ctaUrl}</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5fb;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5fb;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- En-tête -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="${logoUrl}" width="44" height="44" alt="${APP_NAME}" style="display:block;border:0;outline:none;width:44px;height:44px;">
                  </td>
                  <td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.3px;color:${INK};">${APP_NAME}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Carte -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px;border:1px solid ${LINE};overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td height="6" style="height:6px;line-height:6px;font-size:0;background-color:${BLUE};background-image:linear-gradient(90deg,${BLUE},${VIOLET});">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:40px 40px 32px;font-family:Arial,Helvetica,sans-serif;">
                    <h1 style="margin:0 0 20px;font-size:26px;line-height:34px;font-weight:700;letter-spacing:-0.4px;color:${INK};">${escapeHtml(input.title)}</h1>
                    ${paragraphs}
                    ${details}
                    ${button}
                  </td>
                </tr>

                <!-- Avis -->
                <tr>
                  <td style="padding:0 40px 40px;font-family:Arial,Helvetica,sans-serif;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color:#f8f9fc;border:1px solid ${LINE};border-radius:10px;padding:16px 18px;font-size:13px;line-height:20px;color:${MUTED};">
                          ${escapeHtml(input.notice)}
                        </td>
                      </tr>
                    </table>
                    ${fallbackLink}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pied de page -->
          <tr>
            <td align="center" style="padding:28px 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">
              <strong style="color:${MUTED};">${APP_NAME}</strong> · ${escapeHtml(TAGLINE)}<br>
              ${escapeHtml(input.footerNote ?? DEFAULT_FOOTER_NOTE)}<br>
              © ${year} ${APP_NAME}. Tous droits réservés.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function plainText(parts: EmailParts): string {
  return [
    APP_NAME,
    '',
    parts.title,
    '',
    ...parts.paragraphs.flatMap((p) => [p, '']),
    ...(parts.details?.length ? [...parts.details.map((d) => `${d.label} : ${d.value}`), ''] : []),
    ...(parts.cta ? [`${parts.cta.label} :`, parts.cta.url, ''] : []),
    parts.notice,
    '',
    `— ${APP_NAME}`,
  ].join('\n');
}

function build(subject: string, preheader: string, parts: EmailParts, ctx: EmailContext): RenderedEmail {
  return {
    subject,
    html: layout({ origin: ctx.origin, preheader, ...parts }),
    text: plainText(parts),
  };
}

export function resetPasswordEmail(actionUrl: string, ctx: EmailContext): RenderedEmail {
  return build(
    `Réinitialisation de votre mot de passe ${APP_NAME}`,
    'Choisissez un nouveau mot de passe pour votre compte.',
    {
      title: 'Réinitialisez votre mot de passe',
      paragraphs: [
        'Bonjour,',
        `Nous avons reçu une demande de réinitialisation du mot de passe de votre compte ${APP_NAME}. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.`,
      ],
      cta: { label: 'Choisir un nouveau mot de passe', url: actionUrl },
      notice:
        "Ce lien est personnel et valable pour une durée limitée. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé.",
    },
    ctx
  );
}

export type ContactEmailData = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  sectorLabel: string;
  teamSizeLabel: string;
  message?: string | null;
};

/** Notification interne : nouvelle demande de contact. */
export function contactNotificationEmail(
  data: ContactEmailData,
  adminUrl: string,
  ctx: EmailContext
): RenderedEmail {
  return build(
    `Nouvelle demande de contact : ${data.company}`,
    `${data.fullName} (${data.company}) souhaite être recontacté(e).`,
    {
      title: 'Nouvelle demande de contact',
      paragraphs: [`${data.fullName} (${data.company}) souhaite être recontacté(e) depuis la page d'accueil.`],
      details: [
        { label: 'Nom', value: data.fullName },
        { label: 'Email', value: data.email },
        { label: 'Téléphone', value: data.phone },
        { label: 'Entreprise', value: data.company },
        { label: "Secteur d'activité", value: data.sectorLabel },
        { label: 'Équipe commerciale', value: data.teamSizeLabel },
        { label: 'Message', value: data.message?.trim() || '—' },
      ],
      cta: { label: 'Ouvrir dans l’espace admin', url: adminUrl },
      notice: 'Répondez directement à cet email pour écrire au demandeur.',
      footerNote: 'Notification automatique du formulaire de contact.',
    },
    ctx
  );
}

/** Accusé de réception envoyé au demandeur (s'il l'a demandé). */
export function contactConfirmationEmail(data: ContactEmailData, ctx: EmailContext): RenderedEmail {
  return build(
    `Nous avons bien reçu votre demande`,
    'Notre équipe vous recontactera très prochainement.',
    {
      title: 'Nous avons bien reçu votre demande',
      paragraphs: [
        `Bonjour ${data.fullName},`,
        `Merci de l'intérêt que vous portez à ${APP_NAME}. Notre équipe vous recontactera très prochainement pour échanger sur vos besoins.`,
      ],
      details: [
        { label: 'Entreprise', value: data.company },
        { label: "Secteur d'activité", value: data.sectorLabel },
        { label: 'Téléphone', value: data.phone },
      ],
      notice: `Vous recevez cet email car vous avez demandé à être recontacté sur ${APP_NAME}. Si vous n'êtes pas à l'origine de cette demande, vous pouvez l'ignorer.`,
      footerNote: 'Une question ? Répondez directement à cet email.',
    },
    ctx
  );
}
