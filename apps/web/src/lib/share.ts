/** Share a link or a file. The website uses the browser share sheet. The phone shell uses the system sheet. */

export interface ShareLinkInput {
  title: string;
  url: string;
}

export interface ShareFileInput {
  filename: string;
  blob: Blob;
  text?: string;
}

export interface SharePorts {
  native: boolean;
  webShare(data: { title?: string; text?: string; url?: string; files?: File[] }): Promise<void>;
  canWebShareFile(file: File): boolean;
  /** Writes into the app cache and returns the address the share sheet can open. */
  writeTemp(filename: string, base64: string): Promise<string>;
  nativeShare(data: { title?: string; text?: string; url?: string; files?: string[] }): Promise<void>;
  deleteTemp(uri: string): Promise<void>;
}

export type ShareResult = "shared" | "cancelled" | "unavailable" | "saved";

/** A cache file name: the last path piece, with nothing but letters, numbers, dots and dashes. */
export function safeShareName(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
  return cleaned || "file";
}

function cancelled(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return name === "AbortError" || /cancel/i.test(message);
}

async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function shareLink(input: ShareLinkInput, ports: SharePorts): Promise<ShareResult> {
  try {
    if (ports.native) await ports.nativeShare({ title: input.title, url: input.url });
    else await ports.webShare({ title: input.title, url: input.url });
    return "shared";
  } catch (error) {
    if (cancelled(error)) return "cancelled";
    throw error;
  }
}

export async function shareFile(input: ShareFileInput, ports: SharePorts): Promise<ShareResult> {
  const name = safeShareName(input.filename);
  if (!ports.native) {
    const file = new File([input.blob], name, { type: input.blob.type || "application/octet-stream" });
    if (!ports.canWebShareFile(file)) return "unavailable";
    try {
      await ports.webShare({ text: input.text, files: [file] });
      return "shared";
    } catch (error) {
      if (cancelled(error)) return "cancelled";
      throw error;
    }
  }
  const uri = await ports.writeTemp(name, await blobBase64(input.blob));
  try {
    await ports.nativeShare({ text: input.text, files: [uri] });
    return "shared";
  } catch (error) {
    if (cancelled(error)) return "cancelled";
    throw error;
  } finally {
    await ports.deleteTemp(uri).catch(() => {});
  }
}

/** The website downloads the calendar file. The shell shares it, so the phone calendar can open it. No calendar permission. */
export async function deliverIcs(
  native: boolean,
  filename: string,
  ics: string,
  deps: { download(filename: string, mime: string, text: string): void; ports: SharePorts },
): Promise<ShareResult> {
  if (!native) {
    deps.download(filename, "text/calendar;charset=utf-8", ics);
    return "saved";
  }
  return shareFile({ filename, blob: new Blob([ics], { type: "text/calendar" }), text: filename }, { ...deps.ports, native: true });
}

/** Ports for the running app. Native plugins load only when a share actually uses them. */
export function browserSharePorts(native: boolean): SharePorts {
  const cachePath = new Map<string, string>();
  return {
    native,
    webShare: (data) => {
      if (typeof navigator.share !== "function") return Promise.reject(new Error("share unavailable"));
      return navigator.share(data);
    },
    canWebShareFile: (file) => typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }),
    writeTemp: async (filename, base64) => {
      const { Directory, Filesystem } = await import("@capacitor/filesystem");
      await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      cachePath.set(uri, filename);
      return uri;
    },
    nativeShare: async (data) => {
      const { Share } = await import("@capacitor/share");
      await Share.share(data);
    },
    deleteTemp: async (uri) => {
      const { Directory, Filesystem } = await import("@capacitor/filesystem");
      await Filesystem.deleteFile({ path: cachePath.get(uri) ?? uri, directory: Directory.Cache });
    },
  };
}
