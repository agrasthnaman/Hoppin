import { describe, expect, it } from "vitest";
import { decryptBlob, encryptBlob, generateDeviceKey, getDeviceKey } from "../src/offline/crypto";
import { openOfflineDb } from "../src/offline/db";

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = (data: ArrayBuffer) => new TextDecoder().decode(data);
let n = 0;
const freshDb = () => openOfflineDb(`crypto-${(n += 1)}`);

describe("encryptBlob and decryptBlob", () => {
  it("round-trips data", async () => {
    const key = await generateDeviceKey();
    expect(text(await decryptBlob(key, await encryptBlob(key, bytes("passport 12345"))))).toBe("passport 12345");
  });

  it("hides the content and uses a fresh random start each time", async () => {
    const key = await generateDeviceKey();
    const a = await encryptBlob(key, bytes("passport 12345"));
    const b = await encryptBlob(key, bytes("passport 12345"));
    expect(text(a)).not.toContain("passport");
    expect(Array.from(new Uint8Array(a))).not.toEqual(Array.from(new Uint8Array(b)));
  });

  it("cannot be read with a different key", async () => {
    const sealed = await encryptBlob(await generateDeviceKey(), bytes("secret"));
    await expect(decryptBlob(await generateDeviceKey(), sealed)).rejects.toThrow();
  });

  it("notices when stored bytes have been changed", async () => {
    const key = await generateDeviceKey();
    const sealed = new Uint8Array(await encryptBlob(key, bytes("secret")));
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 1;
    await expect(decryptBlob(key, sealed.buffer)).rejects.toThrow();
  });

  it("rejects data that is too short to be valid", async () => {
    await expect(decryptBlob(await generateDeviceKey(), new ArrayBuffer(5))).rejects.toThrow();
  });
});

describe("device key", () => {
  it("cannot be exported from the browser", async () => {
    const key = await generateDeviceKey();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("is created once per device and then reused", async () => {
    const db = freshDb();
    const first = await getDeviceKey(db);
    const second = await getDeviceKey(db);
    const sealed = await encryptBlob(first, bytes("hello"));
    expect(text(await decryptBlob(second, sealed))).toBe("hello");
  });

  it("is different on a different device", async () => {
    const sealed = await encryptBlob(await getDeviceKey(freshDb()), bytes("hello"));
    await expect(decryptBlob(await getDeviceKey(freshDb()), sealed)).rejects.toThrow();
  });
});
