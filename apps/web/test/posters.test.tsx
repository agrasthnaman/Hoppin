import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { downloadBlob } from "../src/lib/download";
import { loadForPoster, PhotoProblem } from "../src/lib/photo-process";
import { renderPosterBlob } from "../src/poster/render";
import { fakeServices, renderApp } from "./helpers";

vi.mock("../src/lib/download", async (original) => ({ ...(await original<typeof import("../src/lib/download")>()), downloadBlob: vi.fn() }));
vi.mock("../src/lib/photo-process", async (original) => ({ ...(await original<typeof import("../src/lib/photo-process")>()), loadForPoster: vi.fn() }));
vi.mock("../src/poster/render", async (original) => ({ ...(await original<typeof import("../src/poster/render")>()), renderPosterBlob: vi.fn(async () => new Blob(["png"], { type: "image/png" })) }));

type FakeBitmap = { width: number; height: number; close: ReturnType<typeof vi.fn> };
let made: FakeBitmap[] = [];

beforeEach(() => {
  made = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.mocked(loadForPoster).mockReset().mockImplementation(async () => {
    const bitmap = { width: 1200, height: 900, close: vi.fn() };
    made.push(bitmap);
    return bitmap as unknown as ImageBitmap;
  });
  vi.mocked(downloadBlob).mockClear();
  vi.mocked(renderPosterBlob).mockClear();
});
afterEach(() => vi.restoreAllMocks());

const photoFile = (name: string) => new File(["x"], name, { type: "image/jpeg" });

async function openStudio() {
  const { services } = fakeServices();
  const utils = renderApp("/trips/t1/posters", services);
  await screen.findByRole("heading", { name: "Make a poster" });
  return { ...utils, services };
}

async function pickTemplateWithPhotos(name: string, count: number) {
  await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
  const sheet = await screen.findByRole("dialog");
  const input = document.querySelector<HTMLInputElement>('[data-testid="poster-photos"]')!;
  fireEvent.change(input, { target: { files: Array.from({ length: count }, (_, i) => photoFile(`p${i}.jpg`)) } });
  await waitFor(() => expect(loadForPoster).toHaveBeenCalledTimes(count));
  return sheet;
}

describe("posters studio", () => {
  it("is opened from More", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/more", services);
    expect(await screen.findByRole("link", { name: "Make a poster" })).toHaveAttribute("href", "/trips/t1/posters");
  });

  it("offers a trip poster and a day card, and nothing about uploading photos", async () => {
    await openStudio();
    const kinds = screen.getByRole("radiogroup", { name: "Kind of poster" });
    expect(within(kinds).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Trip poster", "Day card"]);
    const sheet = await pickTemplateWithPhotos("Route Poster", 1);
    expect(within(sheet).queryByText(/Add my photos|group poster|coming soon/i)).toBeNull();
    expect(within(sheet).getByText(/Nothing is uploaded/)).toBeInTheDocument();
  });

  it("lists every template and filters by photo count and style", async () => {
    await openStudio();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("button")).toHaveLength(14);
    await userEvent.click(screen.getByRole("button", { name: "8 photos" }));
    expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("Cork Board"), expect.stringContaining("Photo Dump")]);
    await userEvent.click(screen.getByRole("button", { name: "Aesthetic" }));
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it("loads picked photos on the phone and never uploads them", async () => {
    const { services } = await openStudio();
    const sheet = await pickTemplateWithPhotos("Hop Stickers", 3);
    expect(within(sheet).getByRole("button", { name: "Continue with 3 of 6" })).toBeInTheDocument();
    expect(services.actions.uploadDocument).not.toHaveBeenCalled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Continue with 3 of 6" }));
    expect(await screen.findByRole("heading", { name: "Hop Stickers" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Edit photo/ })).toHaveLength(3);
    expect(screen.getByText("3 empty frames. Tap + on the poster to fill it.")).toBeInTheDocument();
  });

  it("explains a file that isn't a photo", async () => {
    vi.mocked(loadForPoster).mockRejectedValueOnce(new PhotoProblem("not-a-photo"));
    await openStudio();
    const sheet = await pickTemplateWithPhotos("Postcard", 1);
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("That file isn't a photo we can use.");
  });

  it("saves the picture, then Done lets go of every photo", async () => {
    const { router } = await openStudio();
    const sheet = await pickTemplateWithPhotos("Ticket Stub", 3);
    await userEvent.click(within(sheet).getByRole("button", { name: "Make my poster" }));
    await userEvent.click(await screen.findByRole("tab", { name: "Share" }));
    await userEvent.click(screen.getByRole("button", { name: "Save picture" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(vi.mocked(downloadBlob).mock.calls[0]![0]).toBe("Goa-ticket.png");
    expect(vi.mocked(renderPosterBlob).mock.calls[0]![3]).toBe("story");
    const done = await screen.findByRole("dialog", { name: "Your poster is ready" });
    expect(made.every((b) => b.close.mock.calls.length === 0)).toBe(true);
    await userEvent.click(within(done).getByRole("button", { name: "Done" }));
    expect(made).toHaveLength(3);
    for (const bitmap of made) expect(bitmap.close).toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.pathname).toBe("/trips/t1/more"));
  });

  it("frees the photos when you leave the studio", async () => {
    const { router } = await openStudio();
    const sheet = await pickTemplateWithPhotos("Postcard", 2);
    await userEvent.click(within(sheet).getByRole("button", { name: "Make my poster" }));
    await screen.findByRole("heading", { name: "Postcard" });
    await router.navigate("/trips/t1/days");
    await waitFor(() => made.forEach((b) => expect(b.close).toHaveBeenCalled()));
  });

  it("shares the picture through the phone's share sheet when it can", async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    await openStudio();
    const sheet = await pickTemplateWithPhotos("Plane Windows", 3);
    await userEvent.click(within(sheet).getByRole("button", { name: "Make my poster" }));
    await userEvent.click((await screen.findAllByRole("button", { name: "Share" }))[0]!);
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    const arg = (share.mock.calls[0] as unknown as [{ files: File[]; text: string }])[0];
    expect(arg.files[0]!.type).toBe("image/png");
    expect(arg.text).toContain("Planned with Hoppin hoppinclub.com");
    expect(downloadBlob).not.toHaveBeenCalled();
    Object.assign(navigator, { share: undefined, canShare: undefined });
  });

  it("selecting a photo shows its edit tools; Done goes back to the tabs", async () => {
    await openStudio();
    const sheet = await pickTemplateWithPhotos("Clean Grid", 4);
    await userEvent.click(within(sheet).getByRole("button", { name: "Make my poster" }));
    await userEvent.click(await screen.findByRole("button", { name: "Edit photo 2" }));
    expect(screen.getByRole("heading", { name: "Photo 2" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Move and turn" })).toBeChecked();
    fireEvent.change(screen.getByRole("slider", { name: /Turn/ }), { target: { value: "45" } });
    expect(screen.getByText("45°")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("tab", { name: "Photos" })).toBeInTheDocument();
  });

  it("has no accessibility problems", async () => {
    const { container } = await openStudio();
    expect(await axe(container)).toHaveNoViolations();
  });
});
