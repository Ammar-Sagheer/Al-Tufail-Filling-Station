/**
 * Sending a statement or an invoice to the customer, from the browser.
 *
 * Asked for by the fourth pump (Al Tufail, October 2026): "easy to share to the
 * credit customer by WhatsApp or message". There is no WhatsApp API to call
 * from a web page that attaches a file, so this uses the two things that do
 * exist:
 *
 *   1. THE SHARE SHEET (Web Share, with a file). On an Android phone or tablet,
 *      which is what the pump office holds, `navigator.share({ files })` opens
 *      the phone's own share sheet with the PDF attached, and WhatsApp is the
 *      first thing on it. The PDF is fetched from the same download route the
 *      Download button uses, so it is the same document.
 *   2. A LINK WITH THE MESSAGE IN IT, where a file cannot be shared (a laptop
 *      browser): wa.me opens WhatsApp on the customer's number with the text
 *      typed in, and sms: opens the messages app. The PDF is downloaded at the
 *      same time, to be attached by hand.
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

/** True where the browser can hand THIS file to another app (phones, tablets). */
export function canShareFiles(file) {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
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

/**
 * Share the PDF through the share sheet. Resolves to 'shared', 'cancelled'
 * (the reader closed the sheet, which is not an error) or throws.
 *
 * THE FILE ALONE, NO `title` AND NO `text`. The first build sent all three, and
 * on the pump's Android phone WhatsApp received a file called "Untitled", type
 * BIN, which would not open as a PDF: WhatsApp (and some other targets) treat a
 * share that carries text beside a file badly and drop its name and type. The
 * figure and the customer are in the PDF itself, so nothing is lost; the
 * message-only route stays on SMS.
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
