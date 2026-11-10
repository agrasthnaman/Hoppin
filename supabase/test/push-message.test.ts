import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { fcmAccessToken, fcmBody, postFcm } from "../functions/send-push/fcm";
import { sendTestPush, testPush } from "../functions/send-push/run";

function account() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    client_email: "push@hoppin.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    project_id: "hoppin-test",
  };
}

describe("test push", () => {
  it("refuses a caller who does not know the secret", async () => {
    expect(await sendTestPush({ authorized: false, configured: true, tokens: ["t"], send: async () => {} })).toEqual({ status: 401, body: "Unauthorized" });
  });

  it("says push is not configured until the owner adds the Firebase account", async () => {
    expect(await sendTestPush({ authorized: true, configured: false, tokens: ["t"], send: async () => {} })).toEqual({ status: 503, body: "Push is not configured" });
  });

  it("sends one note per token, opening the app", async () => {
    const send = vi.fn(async () => {});
    expect(await sendTestPush({ authorized: true, configured: true, tokens: ["a", "b"], send })).toEqual({ status: 200, body: "sent 2" });
    expect(send).toHaveBeenCalledWith(testPush("a"));
    expect(send).toHaveBeenCalledWith(testPush("b"));
    expect(testPush("a").url).toBe("https://hoppinclub.com/");
  });

  it("tells the owner when that person has no token", async () => {
    expect(await sendTestPush({ authorized: true, configured: true, tokens: [], send: async () => {} })).toEqual({ status: 404, body: "No tokens" });
  });
});

describe("fcm", () => {
  it("asks Google for a short-lived token, then posts the note to that project", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    const access = await fcmAccessToken(account(), fetchImpl);
    expect(access).toBe("ya29.test");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://oauth2.googleapis.com/token");
    const note = testPush("device-token");
    const sent = await postFcm("hoppin-test", access, note, fetchImpl);
    expect(sent.ok).toBe(true);
    const init = fetchImpl.mock.calls[1]?.[1];
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe("https://fcm.googleapis.com/v1/projects/hoppin-test/messages:send");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer ya29.test" });
    expect(JSON.parse(String(init?.body))).toEqual(fcmBody(note));
  });
});