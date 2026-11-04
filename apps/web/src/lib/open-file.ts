/**
 * Opens a file in a new tab. The tab is opened straight away, while the tap still counts as the person's own action.
 * Phones (iPhone Safari above all) quietly block a tab opened later, after a download or a lookup has finished, so
 * the old way did nothing for people who had to fetch the file. The tab then goes to the file once its address is
 * known. If the browser still refuses a new tab, the file opens in this one. A failure closes the empty tab and
 * is passed on so the screen can say so.
 */
export async function openFile(
  resolveUrl: () => Promise<string>,
  open: typeof window.open = (...args) => window.open(...args),
  navigate: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  const tab = open("", "_blank");
  try {
    if (tab) {
      try {
        tab.document.write("<p style=\"font:16px system-ui,sans-serif;padding:24px\">Opening your document…</p>");
      } catch {
        // some browsers do not let a fresh tab be written to; it is only a placeholder
      }
    }
    const url = await resolveUrl();
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      navigate(url);
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
