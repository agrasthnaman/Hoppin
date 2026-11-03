import type { OfflineDb } from "./db";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_NAME = "device-key";

/** A new AES-GCM key that the browser will not let anyone read out (non-extractable). */
export function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const pending = new WeakMap<OfflineDb, Promise<CryptoKey>>();

/**
 * The key for this device, created on first use and then kept in the device's own database. It protects
 * stored personal documents from casual reading of the stored bytes. It does not protect against someone
 * who can run code in the signed-in browser profile, so the device lock still matters.
 */
export function getDeviceKey(db: OfflineDb): Promise<CryptoKey> {
  let key = pending.get(db);
  if (!key) {
    key = (async () => {
      const stored = await db.meta.get(KEY_NAME);
      if (stored?.value) return stored.value as CryptoKey;
      const created = await generateDeviceKey();
      await db.meta.put({ key: KEY_NAME, value: created });
      return created;
    })();
    pending.set(db, key);
    key.catch(() => pending.delete(db));
  }
  return key;
}

/** Encrypts data. The result is a random 12-byte start followed by the encrypted bytes. */
export async function encryptBlob(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv, 0);
  out.set(sealed, IV_BYTES);
  return out.buffer;
}

/** Reverses `encryptBlob`. Throws if the key is wrong or the stored bytes were changed. */
export async function decryptBlob(key: CryptoKey, sealed: ArrayBuffer): Promise<ArrayBuffer> {
  if (sealed.byteLength < IV_BYTES + TAG_BYTES) throw new Error("Stored data is too short to be valid");
  const iv = sealed.slice(0, IV_BYTES);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed.slice(IV_BYTES));
}
