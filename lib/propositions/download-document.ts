/** Download through the authenticated application route without navigating or opening a tab. */
export async function downloadPropositionDocument(propositionId: string, options: { variantId?: string; annexId?: string } = {}) {
  const query = new URLSearchParams();
  if (options.variantId) query.set('variant', options.variantId);
  if (options.annexId) query.set('annex', options.annexId);
  const response = await fetch(`/api/propositions/${encodeURIComponent(propositionId)}/download${query.size ? '?' + query : ''}`, {
    credentials: 'same-origin', cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'Téléchargement impossible. Veuillez réessayer.');
  }
  const disposition = response.headers.get('content-disposition') || '';
  if (!/^attachment(?:;|$)/i.test(disposition)) throw new Error('Réponse de téléchargement invalide. Veuillez réessayer.');
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let filename = disposition.match(/filename="([^"]+)"/i)?.[1] || 'proposition';
  if (encoded) { try { filename = decodeURIComponent(encoded); } catch { /* Use the ASCII fallback. */ } }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
