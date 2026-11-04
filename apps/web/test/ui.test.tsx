import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { Avatar } from "../src/components/ui/Avatar";
import { Banner } from "../src/components/ui/Banner";
import { Button } from "../src/components/ui/Button";
import { Card } from "../src/components/ui/Card";
import { Chip } from "../src/components/ui/Chip";
import { Sheet } from "../src/components/ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../src/components/ui/Tabs";

// jsdom cannot compute colours, so colour contrast is checked later with real browsers (issue #26).
const axeOptions = { rules: { "color-contrast": { enabled: false } } };

describe("Chip", () => {
  it("shows the initial and a truncating title, with the full title available", () => {
    render(<Chip initial="R" title="Visit the national museum of old town" color="#7c3aed" onOpen={() => {}} />);
    const chip = screen.getByRole("button", { name: /R.*Visit the national museum of old town/ });
    expect(chip).toHaveTextContent("R");
    expect(screen.getByText("Visit the national museum of old town")).toHaveClass("truncate");
  });

  it("calls onOpen when tapped", async () => {
    const onOpen = vi.fn();
    render(<Chip initial="A" title="Cafe crawl" color="#ea580c" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /Cafe crawl/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("Sheet", () => {
  it("moves focus inside when open and closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="Museum visit">
        <button>Say I'm in</button>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Museum visit" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sits above the floating navigation bar, so its buttons are never covered", () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Above the nav">
        <button>Save</button>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Above the nav" })).toHaveClass("z-[60]");
  });

  it("stays open when the file window sends a click outside", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="New trip">
        <input type="file" aria-label="Booking PDFs" />
      </Sheet>,
    );
    await userEvent.click(screen.getByLabelText("Booking PDFs"));
    const backdrop = document.querySelector(".z-\\[55\\]");
    if (!(backdrop instanceof Element)) throw new Error("missing backdrop");
    await userEvent.click(backdrop);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(
      <Sheet open={false} onOpenChange={() => {}} title="Hidden">
        <p>content</p>
      </Sheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Banner", () => {
  it("is announced politely for offline and stale", () => {
    render(<Banner kind="offline" text="You're offline. Showing saved trip." />);
    expect(screen.getByRole("status")).toHaveTextContent("You're offline. Showing saved trip.");
  });

  it("is announced as an alert for conflicts", () => {
    render(<Banner kind="conflict" text="Your edit to Lunch was overwritten." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your edit to Lunch was overwritten.");
  });
});

describe("Banner pending", () => {
  it("is a polite status", () => {
    render(<Banner kind="pending" text="2 changes waiting to send." />);
    expect(screen.getByRole("status")).toHaveTextContent("2 changes waiting to send.");
  });
});

describe("Avatar", () => {
  it("shows the first letter of the name", () => {
    render(<Avatar name="Riya Shah" color="#7c3aed" />);
    expect(screen.getByText("R")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("renders each variant and handles clicks", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button onClick={onClick}>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Primary" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});

describe("Tabs", () => {
  it("switches panels", async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Sections">
          <TabsTrigger value="a">Days</TabsTrigger>
          <TabsTrigger value="b">Docs</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Day list</TabsContent>
        <TabsContent value="b">Document list</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Day list")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Docs" }));
    expect(screen.getByText("Document list")).toBeVisible();
  });
});

describe.each(["light", "dark"] as const)("accessibility in %s theme", (theme) => {
  it("has no axe violations across components", async () => {
    const { container } = render(
      <div data-theme={theme}>
        <Banner kind="stale" text="Last synced 2 days ago" />
        <Card>
          <Avatar name="Riya Shah" color="#7c3aed" />
          <Chip initial="R" title="Museum" color="#7c3aed" onOpen={() => {}} />
          <Button>Add plan</Button>
        </Card>
        <Tabs defaultValue="a">
          <TabsList aria-label="Sections">
            <TabsTrigger value="a">Days</TabsTrigger>
            <TabsTrigger value="b">Docs</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Day list</TabsContent>
          <TabsContent value="b">Document list</TabsContent>
        </Tabs>
      </div>,
    );
    expect(await axe(container, axeOptions)).toHaveNoViolations();
  });
});
