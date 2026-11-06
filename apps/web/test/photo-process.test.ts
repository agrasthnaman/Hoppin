import { afterEach, describe, expect, it, vi } from "vitest";
import { loadForPoster, MAX_SOURCE_BYTES, PhotoProblem } from "../src/lib/photo-process";

type Fake = { width: number; height: number; close: ReturnType<typeof vi.fn> };
const bitmap = (width: number, height: number): Fake => ({ width, height, close: vi.fn() });
const photo = (name = "a.jpg", type = "image/jpeg", size = 1000) => new File([new Uint8Array(size)], name, { type });

afterEach(() => vi.unstubAllGlobals());

describe("loadForPoster", () => {
  it("returns a bitmap no larger than 1600 px on its longest side, and frees the full-size one", async () => {
    const original = bitmap(4000, 3000);
    const resized = bitmap(1600, 1200);
    const create = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(resized);
    vi.stubGlobal("createImageBitmap", create);
    const out = await loadForPoster(photo());
    expect(out).toBe(resized);
    expect(create.mock.calls[0]![1]).toEqual({ imageOrientation: "from-image" });
    expect(create.mock.calls[1]![1]).toMatchObject({ resizeWidth: 1600, resizeHeight: 1200 });
    expect(original.close).toHaveBeenCalledOnce();
  });

  it("keeps a small photo as it is (never enlarged)", async () => {
    const small = bitmap(800, 600);
    const create = vi.fn().mockResolvedValue(small);
    vi.stubGlobal("createImageBitmap", create);
    expect(await loadForPoster(photo())).toBe(small);
    expect(create).toHaveBeenCalledOnce();
    expect(small.close).not.toHaveBeenCalled();
  });

  it("refuses something that isn't a photo, without decoding it", async () => {
    const create = vi.fn();
    vi.stubGlobal("createImageBitmap", create);
    await expect(loadForPoster(photo("notes.pdf", "application/pdf"))).rejects.toMatchObject({ code: "not-a-photo", message: "That file isn't a photo we can use." });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a very large file", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn());
    await expect(loadForPoster(photo("big.jpg", "image/jpeg", MAX_SOURCE_BYTES + 1))).rejects.toMatchObject({ code: "too-big" });
  });

  it("explains when the browser can't read the format", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode")));
    const error = await loadForPoster(photo("a.heic", "image/heic")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PhotoProblem);
    expect((error as PhotoProblem).code).toBe("unsupported-format");
    expect((error as PhotoProblem).message).toBe("That photo format isn't supported here. Try a JPEG or PNG.");
  });

  it("never touches the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap(10, 10)));
    await loadForPoster(photo());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
