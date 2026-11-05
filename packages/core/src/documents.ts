/** Largest file we accept (tickets and passport scans are far smaller). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"]);

/** Returns a plain-language problem with the file, or null if it can be uploaded. */
export function validateDocumentFile(file: { name: string; size: number; type: string }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  // Some browsers report no type for HEIC photos, so the extension counts too.
  if (!ALLOWED_TYPES.has(file.type.toLowerCase()) && !ALLOWED_EXTENSIONS.has(ext)) {
    return "Please choose a PDF or an image (JPEG, PNG, WebP or HEIC).";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "That file is larger than 25 MB.";
  return null;
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
