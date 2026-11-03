import type { DocumentSource } from "@hoppin/core";

/** The slice of the Supabase storage client used for downloads, so it can be faked in tests. */
export interface DownloadClient {
  storage: {
    from(bucket: string): {
      download(path: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
}

export function createDocumentSource(client: DownloadClient): DocumentSource {
  return {
    async download(doc) {
      const { data, error } = await client.storage.from("trip-documents").download(doc.storagePath);
      if (error || !data) throw new Error(error?.message ?? "Download failed");
      return { data: await data.arrayBuffer(), contentType: data.type || "application/octet-stream" };
    },
  };
}
