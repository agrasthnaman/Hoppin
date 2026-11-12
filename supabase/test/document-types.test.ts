import { readFileSync } from "node:fs";
import { DOCUMENT_TYPES } from "@hoppin/core";
import { describe, expect, it } from "vitest";

describe("the trip-documents bucket", () => {
  it("allows exactly the document types the app accepts", () => {
    const sql = readFileSync(new URL("../migrations/027_document_types.sql", import.meta.url), "utf8");
    const listed = [...(sql.match(/array\[([^\]]+)\]/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...DOCUMENT_TYPES].sort());
  });
});
