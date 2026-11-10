/**
 * A link that is safe to put in `href`: only a web address (http or https). Anything else, such as `javascript:` or
 * `data:` addresses, gives null, so a link saved by a hand-made request can never run code when someone taps it.
 */
export function safeWebUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text.length > 2000) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? text : null;
  } catch {
    return null;
  }
}
