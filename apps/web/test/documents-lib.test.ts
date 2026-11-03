import { describe, expect, it, vi } from "vitest";
import { getDocumentUrl, uploadDocument, type DocumentClient } from "../src/lib/documents";

const ok = { error: null };

function fakeClient(over: { upload?: unknown; insert?: unknown; signed?: unknown } = {}) {
  const upload = vi.fn().mockResolvedValue(over.upload ?? ok);
  const remove = vi.fn().mockResolvedValue(ok);
  const createSignedUrl = vi.fn().mockResolvedValue(over.signed ?? { data: { signedUrl: "https://signed.example/x" }, error: null });
  const single = vi.fn().mockImplementation(async () => over.insert ?? { data: {}, error: null });
  const insert = vi.fn().mockReturnValue({ select: () => ({ single }) });
  const client: DocumentClient = { storage: { from: () => ({ upload, remove, createSignedUrl }) }, from: () => ({ insert }) };
  return { client, upload, remove, createSignedUrl, insert };
}

const pdf = () => new File(["hello"], "Flight ticket.pdf", { type: "application/pdf" });
const meta = { tripId: "t1", ownerId: "u1", itemId: "i1", scope: "shared" as const, kind: "ticket" };

describe("uploadDocument", () => {
  it("uploads the file into the uploader's folder and saves a document record", async () => {
    const { client, upload, insert } = fakeClient();
    const doc = await uploadDocument(client, pdf(), meta, () => "doc1");
    expect(upload).toHaveBeenCalledWith("t1/u1/doc1-Flight-ticket.pdf", expect.any(File), { contentType: "application/pdf" });
    expect(insert).toHaveBeenCalledWith({
      id: "doc1",
      trip_id: "t1",
      item_id: "i1",
      owner_id: "u1",
      scope: "shared",
      storage_path: "t1/u1/doc1-Flight-ticket.pdf",
      kind: "ticket",
    });
    expect(doc).toEqual({
      id: "doc1",
      tripId: "t1",
      itemId: "i1",
      ownerId: "u1",
      scope: "shared",
      storagePath: "t1/u1/doc1-Flight-ticket.pdf",
      kind: "ticket",
      fileName: "doc1-Flight-ticket.pdf",
    });
  });

  it("saves a personal document with no item", async () => {
    const { client, insert } = fakeClient();
    await uploadDocument(client, pdf(), { ...meta, itemId: null, scope: "personal", kind: "passport" }, () => "doc2");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ item_id: null, scope: "personal", kind: "passport" }));
  });

  it("rejects a bad file before uploading anything", async () => {
    const { client, upload, insert } = fakeClient();
    const exe = new File(["x"], "virus.exe", { type: "application/x-msdownload" });
    await expect(uploadDocument(client, exe, meta, () => "d")).rejects.toThrow(/PDF or an image/);
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("saves no record when the upload fails", async () => {
    const { client, insert } = fakeClient({ upload: { error: { message: "storage down" } } });
    await expect(uploadDocument(client, pdf(), meta, () => "d")).rejects.toThrow("storage down");
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes the uploaded file when the record cannot be saved, so nothing is left behind", async () => {
    const { client, remove } = fakeClient({ insert: { data: null, error: { message: "permission denied" } } });
    await expect(uploadDocument(client, pdf(), meta, () => "doc3")).rejects.toThrow("permission denied");
    expect(remove).toHaveBeenCalledWith(["t1/u1/doc3-Flight-ticket.pdf"]);
  });
});

describe("getDocumentUrl", () => {
  const doc = { id: "d", tripId: "t1", itemId: null, ownerId: "u1", scope: "shared" as const, storagePath: "t1/u1/d-x.pdf", kind: "ticket", fileName: "x.pdf" };

  it("asks for a short-lived signed link", async () => {
    const { client, createSignedUrl } = fakeClient();
    expect(await getDocumentUrl(client, doc)).toBe("https://signed.example/x");
    expect(createSignedUrl).toHaveBeenCalledWith("t1/u1/d-x.pdf", 300);
  });

  it("throws a clear error when the link cannot be made", async () => {
    const { client } = fakeClient({ signed: { data: null, error: { message: "not found" } } });
    await expect(getDocumentUrl(client, doc)).rejects.toThrow("not found");
  });
});
