/** Render untrusted documents in a script-disabled document, never in the app DOM. */
export async function renderSandboxedDocx(
  buffer: ArrayBuffer,
  host: HTMLElement,
  render: (data: ArrayBuffer, body: HTMLElement, styles: HTMLElement, options: Record<string, unknown>) => Promise<unknown>,
) {
  const frame = host.ownerDocument.createElement('iframe');
  frame.title = 'Aperçu du document Word';
  // Same-origin allows the parent renderer to write the DOM; scripts, forms,
  // popups, downloads and top-level navigation remain disabled by the sandbox.
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.style.cssText = 'width:100%;height:800px;border:0;display:block';
  host.replaceChildren(frame);
  const doc = frame.contentDocument;
  if (!doc) throw new Error('Aperçu isolé indisponible');
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; font-src data: blob:; script-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri \'none\'"></head><body></body></html>');
  doc.close();
  // The preview is passive, including links produced during asynchronous rendering.
  doc.addEventListener('click', (event) => event.preventDefault(), true);
  await render(buffer, doc.body, doc.head, {
    className: 'docx', inWrapper: false, ignoreWidth: false,
    renderAltChunks: false, renderComments: false,
  });
  frame.style.height = `${Math.min(30000, Math.max(400, doc.documentElement.scrollHeight + 20))}px`;
}
