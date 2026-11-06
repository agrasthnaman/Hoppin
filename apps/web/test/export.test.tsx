import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { downloadText } from "../src/lib/download";
import { fakeServices, renderApp, snapshot } from "./helpers";

vi.mock("../src/lib/download", async (original) => ({ ...(await original<typeof import("../src/lib/download")>()), downloadText: vi.fn() }));

const open = async (over: Parameters<typeof snapshot>[0] = {}) => {
  const { services } = fakeServices({ snapshot: snapshot(over) });
  const utils = renderApp("/trips/t1/export", services);
  await screen.findByRole("heading", { name: "Export" });
  return utils;
};

describe("export screen", () => {
  it("is reachable from More", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/more", services);
    expect(await screen.findByRole("link", { name: "Export" })).toHaveAttribute("href", "/trips/t1/export");
  });

  it("downloads a calendar file named after the trip, with only what the viewer can see", async () => {
    vi.mocked(downloadText).mockClear();
    await open({ trip: { id: "t1", name: "Goa, 2026!", startDate: "2026-12-01", endDate: "2026-12-05" } });
    expect(screen.getByText(/3 plans will be added/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download calendar file" }));
    expect(downloadText).toHaveBeenCalledOnce();
    const [filename, mime, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(filename).toBe("Goa-2026.ics");
    expect(mime).toBe("text/calendar;charset=utf-8");
    expect(text).toContain("SUMMARY:Old town tour");
    expect(text).toContain("SUMMARY:Visit ABC place"); // my own private plan
    expect(text).not.toContain("Museum"); // optional, not joined
    expect(screen.getByRole("status")).toHaveTextContent("Saved Goa-2026.ics with 3 plans.");
  });

  it("the calendar options change what goes in", async () => {
    vi.mocked(downloadText).mockClear();
    await open({ rsvps: [{ itemId: "i2", userId: "me" }] });
    expect(screen.getByText(/4 plans will be added/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Include my private plans" }));
    await userEvent.click(screen.getAllByRole("checkbox", { name: "Include optional plans I joined" })[0]!);
    expect(screen.getByText(/2 plans will be added/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download calendar file" }));
    const text = vi.mocked(downloadText).mock.calls[0]![2];
    expect(text).not.toContain("Visit ABC place");
    expect(text).not.toContain("Museum");
  });

  it("cannot download an empty calendar", async () => {
    await open({ items: [] });
    expect(screen.getByRole("button", { name: "Download calendar file" })).toBeDisabled();
    expect(screen.getByText("There are no plans to add yet.")).toBeInTheDocument();
  });

  it("the print options go into the printable plan's address; notes are off unless chosen", async () => {
    const { router } = await open();
    expect(screen.getByRole("checkbox", { name: "Include notes" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Open printable plan" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/trips/t1/print"));
    expect(router.state.location.search).toBe("?notes=0&optional=1");

    await router.navigate("/trips/t1/export");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Include notes" }));
    expect(screen.getByText(/Notes can hold booking numbers/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("checkbox", { name: "Include optional plans I joined" })[1]!); // the print card's
    await userEvent.click(screen.getByRole("button", { name: "Open printable plan" }));
    await waitFor(() => expect(router.state.location.search).toBe("?notes=1&optional=0"));
  });

  it("has no accessibility problems", async () => {
    const { container } = await open();
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
