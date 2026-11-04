import { validateDocumentFile } from "@hoppin/core";

/** Files are added together or one at a time; the same file chosen twice is kept once. */
export function mergeFiles(current: File[], added: File[]): File[] {
  const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
  return [...current, ...added.filter((file) => !current.some((existing) => same(existing, file)))];
}

/** The first problem with any of the files ("report.pdf: That file is larger than 25 MB."), or null when all are fine. */
export function firstFileProblem(files: File[]): string | null {
  for (const file of files) {
    const problem = validateDocumentFile(file);
    if (problem) return `${file.name}: ${problem}`;
  }
  return null;
}

/** Uploads the files one after another. A failure never stops the rest. Returns the names that did not upload. */
export async function uploadEach(files: File[], upload: (file: File) => Promise<void>): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await upload(file);
    } catch {
      failed.push(file.name);
    }
  }
  return failed;
}

/** "Couldn't upload a.pdf and b.pdf. Please try again." */
export function uploadFailure(names: string[]): string {
  return `Couldn't upload ${names.join(", ")}. Please try again.`;
}
