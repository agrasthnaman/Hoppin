import {
  documentContentType,
  documentPath,
  fileNameFromPath,
  validateDocumentFile,
  type DocumentScope,
  type TripDocument,
} from "@hoppin/core";

type Failure = { message: string } | null;

/** The slice of the Supabase client used for documents, so it can be faked in tests. */
export interface DocumentClient {
  storage: {
    from(bucket: string): {
      upload(path: string, file: Blob, options?: { contentType?: string }): PromiseLike<{ error: Failure }>;
      remove(paths: string[]): PromiseLike<{ error: Failure }>;
      createSignedUrl(path: string, expiresInSeconds: number): PromiseLike<{ data: { signedUrl: string } | null; error: Failure }>;
    };
  };
  from(table: "documents"): {
    insert(row: Record<string, unknown>): {
      select(): { single(): PromiseLike<{ data: Record<string, unknown> | null; error: Failure }> };
    };
    delete(): {
      eq(column: string, value: string): {
        select(): PromiseLike<{ data: unknown[] | null; error: Failure }>;
      };
    };
  };
}

export interface UploadMeta {
  tripId: string;
  ownerId: string;
  itemId: string | null;
  scope: DocumentScope;
  kind: string;
}

const BUCKET = "trip-documents";

/**
 * Uploads a file and saves its document record. If saving the record fails, the uploaded file is removed
 * again so nothing is left behind.
 */
export async function uploadDocument(
  client: DocumentClient,
  file: File,
  meta: UploadMeta,
  newId: () => string = () => crypto.randomUUID(),
): Promise<TripDocument> {
  const problem = validateDocumentFile(file);
  if (problem) throw new Error(problem);

  const id = newId();
  const storagePath = documentPath({ tripId: meta.tripId, ownerId: meta.ownerId, docId: id, fileName: file.name });
  const bucket = client.storage.from(BUCKET);

  const uploaded = await bucket.upload(storagePath, file, { contentType: documentContentType(file) });
  if (uploaded.error) throw new Error(uploaded.error.message);

  const saved = await client
    .from("documents")
    .insert({
      id,
      trip_id: meta.tripId,
      item_id: meta.itemId,
      owner_id: meta.ownerId,
      scope: meta.scope,
      storage_path: storagePath,
      kind: meta.kind,
    })
    .select()
    .single();
  if (saved.error) {
    await bucket.remove([storagePath]); // best effort; the uploader may delete their own files
    throw new Error(saved.error.message);
  }

  return {
    id,
    tripId: meta.tripId,
    itemId: meta.itemId,
    ownerId: meta.ownerId,
    scope: meta.scope,
    storagePath,
    kind: meta.kind,
    fileName: fileNameFromPath(storagePath),
  };
}

/** Removes a document the person is allowed to delete: the file, then its record. */
export async function deleteDocument(client: DocumentClient, doc: TripDocument): Promise<void> {
  const removed = await client.storage.from(BUCKET).remove([doc.storagePath]);
  if (removed.error) throw new Error(removed.error.message);
  const deleted = await client.from("documents").delete().eq("id", doc.id).select();
  if (deleted.error) throw new Error(deleted.error.message);
  if (!deleted.data || deleted.data.length === 0) throw new Error("Could not remove the document");
}

/** A short-lived link to open a document (the storage rules decide whether this person may). */
export async function getDocumentUrl(client: DocumentClient, doc: TripDocument, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(doc.storagePath, expiresInSeconds);
  if (error || !data) throw new Error(error?.message ?? "Could not create a link");
  return data.signedUrl;
}
