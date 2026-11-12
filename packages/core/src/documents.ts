/** Largest file we accept (tickets and passport scans are far smaller). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
/** The only types a document may have (the storage bucket allows exactly these). */
export const DOCUMENT_TYPES: readonly string[] = [...new Set(Object.values(TYPE_BY_EXTENSION))];

const extensionOf = (name: string) => (name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "");

/** Returns a plain-language problem with the file, or null if it can be uploaded. */
export function validateDocumentFile(file: { name: string; size: number; type: string }): string | null {
  // Some browsers report no type for HEIC photos, so the extension counts too.
  if (!DOCUMENT_TYPES.includes(file.type.toLowerCase()) && !(extensionOf(file.name) in TYPE_BY_EXTENSION)) {
    return "Please choose a PDF or an image (JPEG, PNG, WebP or HEIC).";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "That file is larger than 25 MB.";
  return null;
}

/** The type a valid file is stored with: its own if that is a document type, otherwise the one its extension means. */
export function documentContentType(file: { name: string; type: string }): string {
  const own = file.type.toLowerCase();
  return DOCUMENT_TYPES.includes(own) ? own : (TYPE_BY_EXTENSION[extensionOf(file.name)] ?? "application/octet-stream");
}

/**
 * The type to open a stored file with. Anything that is not a document type opens as a plain download, so a file that
 * claims to be a web page (HTML, SVG) can never run inside the app.
 */
export function safeDocumentType(type: string): string {
  const lower = type.toLowerCase();
  return DOCUMENT_TYPES.includes(lower) ? lower : "application/octet-stream";
}

/**
 * Storage path for an upload: `<trip>/<uploader>/<document id>-<safe file name>`. The uploader folder is
 * what the storage rules check, so people can only write into their own folder.
 */
export function documentPath(args: { tripId: string; ownerId: string; docId: string; fileName: string }): string {
  const last = args.fileName.split(/[\\/]/).pop() ?? "";
  const clean = last.replace(/^\.+/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+\./g, ".").replace(/-{2,}/g, "-");
  const dot = clean.lastIndexOf(".");
  const rawExt = dot > 0 ? clean.slice(dot) : "";
  const ext = rawExt.length <= 11 ? rawExt : "";
  const base = (dot > 0 ? clean.slice(0, dot) : clean).replace(/^-+|-+$/g, "").slice(0, 80);
  return `${args.tripId}/${args.ownerId}/${args.docId}-${base || "file"}${ext}`;
}

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/** The readable file name inside a storage path (drops folders and the document id prefix). */
export function fileNameFromPath(path: string): string {
  const last = path.split("/").pop() ?? path;
  return last.replace(UUID_PREFIX, "");
}

/** PDF or image, from the file name, so a list can say what the file is. */
export function documentFileKind(fileName: string): "PDF" | "Image" {
  return fileName.toLowerCase().endsWith(".pdf") ? "PDF" : "Image";
}

/**
 * The name to show for a personal document. A name the person typed is kept in `kind`.
 * Older rows only have the file name, so that is cleaned up instead.
 */
export function documentTitle(doc: { kind: string; fileName: string }): string {
  const kind = doc.kind.trim();
  const source = kind && kind.toLowerCase() !== "document" ? kind : doc.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const name = source.trim();
  if (!name) return doc.fileName;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
