/**
 * Sending a statement or an invoice to the customer, from the browser.
 *
 * Asked for by the fourth pump (Al Tufail, October 2026): "easy to share to the
 * credit customer by WhatsApp or message". A web page cannot attach a file to
 * WhatsApp, so this does what can be done: download the PDF, and open WhatsApp
 * on the customer's number (wa.me) with the message typed in, for the owner to
 * attach the file by hand. sms: opens the messages app.
 *
 * THE PHONE'S SHARE SHEET (Web Share with a file) WAS TRIED AND REMOVED. On the
 * pump's Android phone Chrome handed WhatsApp the PDF as an unnamed BIN file
 * that would not open, with the text, without it, and with the file rebuilt
 * from its bytes. Download always saved a good PDF, so the file was right and
 * the hand-over to WhatsApp was not.
 *
 * No server code: this runs in the browser, and every figure in the message
 * was formatted by the caller from Postgres figures.
 */

/**
 * A Pakistani mobile number as WhatsApp wants it: digits only, country code
 * first. "0300-1234567" -> "923001234567". Anything that does not look like a
 * number gives null, and the link then opens WhatsApp to pick the contact.
 */
export function whatsappNumber(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(phone, text) {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

/** `?&body=` is the form both Android and iPhone read. */
export function smsLink(phone, text) {
  const number = String(phone ?? '').replace(/[^\d+]/g, '');
  return `sms:${number}?&body=${encodeURIComponent(text)}`;
}

/**
 * Fetch the PDF from its download route. On failure the route redirects back
 * to the customer's page with `statement_error` in the URL (see the route's
 * header); that is read out and thrown, so the dialog can say why.
 */
export async function fetchPdf(href, filename) {
  const response = await fetch(href, { credentials: 'same-origin', cache: 'no-store' });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('application/pdf')) {
    const reason = new URL(response.url, window.location.href).searchParams.get('statement_error');
    throw new Error(reason || 'The PDF could not be made. Try Download instead.');
  }
  /*
   * Rebuilt from the raw bytes rather than wrapping the response's blob: a File
   * made from the blob can carry the response's own headers' idea of its type
   * and name into the share, and WhatsApp on Android then shows "Untitled", BIN.
   * The first bytes are checked for "%PDF" so a page that is not a PDF is never
   * handed to another app under a .pdf name.
   */
  const bytes = new Uint8Array(await response.arrayBuffer());
  const head = String.fromCharCode(...bytes.slice(0, 4));
  if (head !== '%PDF') throw new Error('The PDF could not be made. Try Download instead.');
  return new File([bytes], filename, { type: 'application/pdf', lastModified: Date.now() });
}

/** Save a File the way a download link would. */
export function saveFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** True where the browser can hand a PDF to another app (phones, tablets). */
export function canShareFiles() {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const probe = new File([new Uint8Array(1)], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Hand the PDF to the phone's share sheet, which lists EVERY app that takes a
 * file, so a phone with more than one WhatsApp (a clone, WhatsApp Business) lets
 * the owner pick which. Resolves to 'shared', 'cancelled' or throws. The file
 * alone, no text: with text beside it WhatsApp dropped the file's name and type.
 * It is the second button, not the first, because on one phone WhatsApp still
 * received it as an unnamed BIN file; see the changelog.
 */
export async function sharePdf(file) {
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
