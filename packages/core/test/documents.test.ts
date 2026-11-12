import { describe, expect, it } from "vitest";
import { documentContentType, documentFileKind, documentPath, documentTitle, fileNameFromPath, MAX_DOCUMENT_BYTES, safeDocumentType, validateDocumentFile } from "../src/documents";

describe("documentPath", () => {
  it("puts the file under the trip and the uploader", () => {
    expect(documentPath({ tripId: "t1", ownerId: "u1", docId: "d1", fileName: "Flight ticket.pdf" })).toBe(
      "t1/u1/d1-Flight-ticket.pdf",
    );
  });

  it("strips folders and unsafe characters from the file name", () => {
    const path = documentPath({ tripId: "t1", ownerId: "u1", docId: "d1", fileName: "../../etc/pass wd?.pdf" });
    expect(path).toBe("t1/u1/d1-pass-wd.pdf");
    expect(path.split("/")).toHaveLength(3);
  });

  it("keeps the extension when the name is very long, and falls back to 'file' for an empty name", () => {
    const long = documentPath({ tripId: "t1", ownerId: "u1", docId: "d1", fileName: `${"a".repeat(300)}.pdf` });
    expect(long.endsWith(".pdf")).toBe(true);
    expect(long.length).toBeLessThan(140);
    expect(documentPath({ tripId: "t1", ownerId: "u1", docId: "d1", fileName: "???" })).toBe("t1/u1/d1-file");
  });
});

describe("validateDocumentFile", () => {
  it("accepts PDFs and common images", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(validateDocumentFile({ name: "x", size: 1000, type }), type).toBeNull();
    }
  });

  it("rejects other types, empty files and files over the limit, with a plain message", () => {
    expect(validateDocumentFile({ name: "x.exe", size: 10, type: "application/x-msdownload" })).toMatch(/PDF or an image/);
    expect(validateDocumentFile({ name: "x.pdf", size: 0, type: "application/pdf" })).toMatch(/empty/);
    expect(validateDocumentFile({ name: "x.pdf", size: MAX_DOCUMENT_BYTES + 1, type: "application/pdf" })).toMatch(/25 MB/);
    expect(validateDocumentFile({ name: "x.pdf", size: MAX_DOCUMENT_BYTES, type: "application/pdf" })).toBeNull();
  });
});

describe("fileNameFromPath", () => {
  it("recovers the file name from a storage path", () => {
    expect(fileNameFromPath("t1/u1/d1-ticket.pdf")).toBe("d1-ticket.pdf");
    expect(fileNameFromPath("t1/u1/0b1a2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d-Flight-ticket.pdf")).toBe("Flight-ticket.pdf");
    expect(fileNameFromPath("plain.pdf")).toBe("plain.pdf");
  });
});

describe("document presentation", () => {
  it("shows a typed name and whether the file is a PDF or an image", () => {
    expect(documentTitle({ kind: "passport", fileName: "scan.pdf" })).toBe("Passport");
    expect(documentFileKind("scan.pdf")).toBe("PDF");
    expect(documentTitle({ kind: "Beach photo", fileName: "IMG_4521.jpg" })).toBe("Beach photo");
    expect(documentFileKind("IMG_4521.jpg")).toBe("Image");
  });

  it("cleans an older file name when no name was typed", () => {
    expect(documentTitle({ kind: "document", fileName: "riya-visa.pdf" })).toBe("Riya visa");
  });
});

describe("document types", () => {
  it("stores a valid file with its own type, or the one its extension means when the browser gives none or a wrong one", () => {
    expect(documentContentType({ name: "ticket.pdf", type: "application/pdf" })).toBe("application/pdf");
    expect(documentContentType({ name: "IMG_0001.HEIC", type: "" })).toBe("image/heic");
    expect(documentContentType({ name: "ticket.pdf", type: "text/html" })).toBe("application/pdf");
  });

  it("opens only document types as themselves; a web page or anything else becomes a plain download", () => {
    expect(safeDocumentType("image/PNG")).toBe("image/png");
    for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", ""]) {
      expect(safeDocumentType(type), type).toBe("application/octet-stream");
    }
  });
});
