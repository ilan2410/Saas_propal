import { describe, expect, it } from 'vitest';
import { contactConfirmationEmail, contactNotificationEmail, resetPasswordEmail } from './templates';

const ctx = { origin: 'https://app.example.com' };
const url = 'https://app.example.com/auth/callback?token_hash=abc&type=recovery';
const data = {
  fullName: '<b>Jean</b> Dupont',
  email: 'jean@acme.fr',
  phone: '06 12 34 56 78',
  company: 'ACME',
  sectorLabel: 'Téléphonie',
  teamSizeLabel: '6 à 20 commerciaux',
  message: 'Bonjour\n<script>x</script>',
};

describe('templates email', () => {
  it('inclut logo, lien et version texte', () => {
    const mail = resetPasswordEmail(url, ctx);
    expect(mail.html).toContain('https://app.example.com/email/logo.png');
    expect(mail.html).toContain('token_hash=abc&amp;type=recovery');
    expect(mail.text).toContain(url);
  });

  it('échappe les données du formulaire de contact', () => {
    const mail = contactNotificationEmail(data, 'https://app.example.com/admin/demandes', ctx);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>Jean');
    expect(mail.html).toContain('Bonjour<br>&lt;script&gt;');
  });

  it("l'accusé de réception n'a pas de bouton", () => {
    const mail = contactConfirmationEmail(data, ctx);
    expect(mail.html).not.toContain('Le bouton ne fonctionne pas');
    expect(mail.text).toContain('ACME');
  });
});
