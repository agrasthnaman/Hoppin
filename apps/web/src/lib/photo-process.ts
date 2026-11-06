/** Longest side of a photo kept in memory for a poster. Bigger than any poster slot needs, small enough to keep eight in memory. */
export const LARGE_EDGE = 1600;
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type PhotoProblemCode = "not-a-photo" | "too-big" | "unsupported-format" | "cannot-read";

const MESSAGES: Record<PhotoProblemCode, string> = {
  "not-a-photo": "That file isn't a photo we can use.",
  "too-big": "That photo is very large. Try a smaller one.",
  "unsupported-format": "That photo format isn't supported here. Try a JPEG or PNG.",
  "cannot-read": "Couldn't open that photo. Try another one.",
};

/** A photo we can't use, with a message that can be shown as it is. */
export class PhotoProblem extends Error {
  constructor(readonly code: PhotoProblemCode) {
    super(MESSAGES[code]);
    this.name = "PhotoProblem";
  }
}

/**
 * Opens a photo from the gallery for a poster: turned the right way up and scaled down so its longest side is at
 * most `maxEdge`. Nothing is uploaded or stored. The caller must `close()` the bitmap when the poster is done.
 */
export async function loadForPoster(file: File, maxEdge = LARGE_EDGE): Promise<ImageBitmap> {
  if (!file.type.startsWith("image/")) throw new PhotoProblem("not-a-photo");
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoProblem("too-big");
  let full: ImageBitmap;
  try {
    full = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoProblem("unsupported-format");
  }
  const scale = Math.min(1, maxEdge / Math.max(full.width, full.height));
  if (scale === 1) return full;
  try {
    return await createImageBitmap(full, { resizeWidth: Math.round(full.width * scale), resizeHeight: Math.round(full.height * scale), resizeQuality: "high" });
  } catch {
    throw new PhotoProblem("cannot-read");
  } finally {
    full.close();
  }
}
