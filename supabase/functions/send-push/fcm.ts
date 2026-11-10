/** Firebase Cloud Messaging HTTP v1. The service-account JSON is a function secret, never a file in the repo. */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface PushNote {
  token: string;
  title: string;
  body: string;
  url: string;
}

export function readServiceAccount(raw: string): ServiceAccount | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  if (!("client_email" in parsed) || typeof parsed.client_email !== "string") return null;
  if (!("private_key" in parsed) || typeof parsed.private_key !== "string") return null;
  if (!("project_id" in parsed) || typeof parsed.project_id !== "string") return null;
  return { client_email: parsed.client_email, private_key: parsed.private_key, project_id: parsed.project_id };
}

export function fcmBody(note: PushNote): { message: { token: string; notification: { title: string; body: string }; data: { url: string } } } {
  return {
    message: {
      token: note.token,
      notification: { title: note.title, body: note.body },
      data: { url: note.url },
    },
  };
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/** Exchanges the service account for a one-hour access token. `fetchImpl` is injected so tests never call Google. */
export async function fcmAccessToken(account: ServiceAccount, fetchImpl: typeof fetch, now = Date.now()): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
  })));
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`)));
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${b64url(signed)}` }),
  });
  if (!response.ok) throw new Error("fcm auth failed");
  const json: unknown = await response.json();
  if (typeof json !== "object" || json === null || !("access_token" in json) || typeof json.access_token !== "string") throw new Error("fcm auth failed");
  return json.access_token;
}

export function postFcm(projectId: string, accessToken: string, note: PushNote, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(fcmBody(note)),
  });
}
