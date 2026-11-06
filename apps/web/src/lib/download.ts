/** A file name from a trip name: letters (with their accents and vowel signs), numbers and dashes only (never empty). */
export function safeFileName(name: string, fallback = "trip"): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^[-\p{M}]+|-+$/gu, "")
    .slice(0, 80);
  return cleaned || fallback;
}

/** Saves text as a file on the device. No server is involved; on iOS Safari a calendar file opens "Add to Calendar". */
export function downloadText(filename: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start the download after the click returns, so the address is freed a little later.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
