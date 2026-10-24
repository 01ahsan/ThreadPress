const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** "<site>-<title>-<YYYY-MM-DD>.<ext>", safe on Windows, macOS, Linux, Android and iOS. */
export function exportFileName(site: string, title: string, date: Date, ext: string): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
  let t = title
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '');
  // Cap by code points so multi-byte scripts are never cut mid-character.
  t = Array.from(t)
    .slice(0, 80)
    .join('')
    .replace(/[-. ]+$/g, '');
  if (!t || RESERVED.test(t)) t = t ? `${t}-chat` : 'chat';
  return `${site}-${t}-${day}.${ext}`;
}
