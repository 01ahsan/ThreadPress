/** Saves a file through a temporary link. No permissions, no network. */
export function downloadFile(doc: Document, name: string, data: string | Uint8Array, mime: string): void {
  const type = typeof data === 'string' ? `${mime};charset=utf-8` : mime;
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
