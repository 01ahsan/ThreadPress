const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** "<site>-<title>-<YYYY-MM-DD>.<ext>", safe on Windows, macOS, Linux, Android and iOS. */
export function exportFileName(site: string, title: string, date: Date, ext: string): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
  let t = title
    .normalize('NFC')
    // Invisible format characters (bidi overrides, zero-width marks) can disguise a file's real
    // extension: a right-to-left override can make "...fdp.exe" display as "...exe.pdf".
    // Control characters break file systems. Tabs and line breaks become separators first.
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]+/gu, '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
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
