import { describe, expect, it, vi } from "vitest";
import { deliverIcs, shareFile, shareLink, type SharePorts } from "../src/lib/share";

function ports(over: Partial<SharePorts> = {}): SharePorts {
  return {
    native: false,
    webShare: vi.fn(async () => {}),
    canWebShareFile: () => true,
    writeTemp: vi.fn(async () => "file:///cache/trip.png"),
    nativeShare: vi.fn(async () => {}),
    deleteTemp: vi.fn(async () => {}),
    ...over,
  };
}

const abort = () => Object.assign(new Error("The user aborted a request."), { name: "AbortError" });

describe("shareLink", () => {
  it("uses the website share sheet", async () => {
    const p = ports();
    await expect(shareLink({ title: "Join Goa", url: "https://hoppinclub.com/join/abc" }, p)).resolves.toBe("shared");
    expect(p.webShare).toHaveBeenCalledWith({ title: "Join Goa", url: "https://hoppinclub.com/join/abc" });
    expect(p.nativeShare).not.toHaveBeenCalled();
  });

  it("uses the phone share sheet in the shell", async () => {
    const p = ports({ native: true });
    await shareLink({ title: "Join Goa", url: "https://hoppinclub.com/join/abc" }, p);
    expect(p.nativeShare).toHaveBeenCalledWith({ title: "Join Goa", url: "https://hoppinclub.com/join/abc" });
    expect(p.webShare).not.toHaveBeenCalled();
    expect(p.writeTemp).not.toHaveBeenCalled();
  });

  it("treats a dismissed sheet as cancelled", async () => {
    const p = ports({ webShare: vi.fn(async () => { throw abort(); }) });
    await expect(shareLink({ title: "Join", url: "https://hoppinclub.com/join/a" }, p)).resolves.toBe("cancelled");
  });
});

describe("shareFile", () => {
  const blob = new Blob(["png"], { type: "image/png" });

  it("shares a file through the website share sheet", async () => {
    const p = ports();
    await expect(shareFile({ filename: "Goa.png", blob, text: "Goa" }, p)).resolves.toBe("shared");
    const arg = vi.mocked(p.webShare).mock.calls[0]?.[0];
    expect(arg?.text).toBe("Goa");
    expect(arg?.files?.[0]).toBeInstanceOf(File);
    expect(arg?.files?.[0]?.name).toBe("Goa.png");
    expect(p.writeTemp).not.toHaveBeenCalled();
  });

  it("writes a temp file, shares its address, then deletes it", async () => {
    const p = ports({ native: true });
    await shareFile({ filename: "Goa.png", blob, text: "Goa" }, p);
    expect(p.writeTemp).toHaveBeenCalledWith("Goa.png", expect.any(String));
    expect(p.nativeShare).toHaveBeenCalledWith({ text: "Goa", files: ["file:///cache/trip.png"] });
    expect(p.deleteTemp).toHaveBeenCalledWith("file:///cache/trip.png");
  });

  it("deletes the temp file when the person dismisses the sheet", async () => {
    const p = ports({ native: true, nativeShare: vi.fn(async () => { throw abort(); }) });
    await expect(shareFile({ filename: "a.ics", blob }, p)).resolves.toBe("cancelled");
    expect(p.deleteTemp).toHaveBeenCalledWith("file:///cache/trip.png");
  });

  it("refuses a file name that tries to leave the cache folder", async () => {
    const p = ports({ native: true });
    await shareFile({ filename: "../../etc/passwd", blob }, p);
    expect(p.writeTemp).toHaveBeenCalledWith("passwd", expect.any(String));
  });

  it("says so when the website cannot share a file", async () => {
    const p = ports({ canWebShareFile: () => false });
    await expect(shareFile({ filename: "a.png", blob }, p)).resolves.toBe("unavailable");
    expect(p.webShare).not.toHaveBeenCalled();
  });
});

describe("deliverIcs", () => {
  it("downloads the calendar file on the website", async () => {
    const download = vi.fn();
    await expect(deliverIcs(false, "Goa.ics", "BEGIN:VCALENDAR", { download, ports: ports() })).resolves.toBe("saved");
    expect(download).toHaveBeenCalledWith("Goa.ics", "text/calendar;charset=utf-8", "BEGIN:VCALENDAR");
  });

  it("shares the calendar file in the shell", async () => {
    const p = ports({ native: true });
    const download = vi.fn();
    await expect(deliverIcs(true, "Goa.ics", "BEGIN:VCALENDAR", { download, ports: p })).resolves.toBe("shared");
    expect(download).not.toHaveBeenCalled();
    expect(p.nativeShare).toHaveBeenCalledWith({ text: "Goa.ics", files: ["file:///cache/trip.png"] });
    expect(p.deleteTemp).toHaveBeenCalled();
  });
});
