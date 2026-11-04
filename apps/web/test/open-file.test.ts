import { describe, expect, it, vi } from "vitest";
import { openFile } from "../src/lib/open-file";

const fakeTab = () => ({ document: { write: vi.fn() }, location: { href: "" }, close: vi.fn(), opener: {} as unknown });

describe("openFile", () => {
  it("opens the tab before the address is known, so the browser still treats it as the person's tap", async () => {
    const order: string[] = [];
    const tab = fakeTab();
    const open = vi.fn(() => {
      order.push("open");
      return tab as unknown as Window;
    });
    await openFile(async () => {
      order.push("resolve");
      return "https://files.example/ticket.pdf";
    }, open, vi.fn());
    expect(order).toEqual(["open", "resolve"]);
    expect(tab.location.href).toBe("https://files.example/ticket.pdf");
    expect(tab.opener).toBeNull();
  });

  it("opens the file in this tab when the browser refuses a new one", async () => {
    const navigate = vi.fn();
    await openFile(async () => "https://files.example/ticket.pdf", () => null, navigate);
    expect(navigate).toHaveBeenCalledWith("https://files.example/ticket.pdf");
  });

  it("closes the empty tab and passes the error on when the address cannot be found", async () => {
    const tab = fakeTab();
    await expect(openFile(() => Promise.reject(new Error("offline")), () => tab as unknown as Window, vi.fn())).rejects.toThrow("offline");
    expect(tab.close).toHaveBeenCalled();
  });

  it("still works when a browser will not let the placeholder be written", async () => {
    const tab = fakeTab();
    tab.document.write.mockImplementation(() => {
      throw new Error("blocked");
    });
    await openFile(async () => "blob:x", () => tab as unknown as Window, vi.fn());
    expect(tab.location.href).toBe("blob:x");
  });
});
