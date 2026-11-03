import { type Item, type MemberRef, type TripDocument } from "@hoppin/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { BookingDetail } from "../src/components/BookingDetail";
import { DocumentList } from "../src/components/DocumentList";
import { ItemForm } from "../src/components/ItemForm";

const IST = "Asia/Kolkata";
const people = { me: { name: "Aman", color: "#1d4ed8" }, riya: { name: "Riya", color: "#6d28d9" }, org: { name: "Neha", color: "#15803d" } };
const member = (over: Partial<MemberRef> = {}): MemberRef => ({ userId: "me", role: "member", status: "approved", canEditAll: false, ...over });

const flight: Item = {
  id: "i1",
  tripId: "t1",
  ownerId: "me",
  kind: "flight",
  visibility: "shared",
  groupItem: true,
  startsAt: "2026-12-01T04:30:00.000Z",
  endsAt: "2026-12-01T07:00:00.000Z",
  tz: IST,
  title: "DEL to GOI",
  locationUrl: "https://maps.example/airport",
  details: { notes: "Gate B12" },
  version: 1,
};
const doc = (over: Partial<TripDocument> = {}): TripDocument => ({
  id: "d1",
  tripId: "t1",
  itemId: "i1",
  ownerId: "me",
  scope: "shared",
  storagePath: "t1/me/d1-ticket.pdf",
  kind: "ticket",
  fileName: "ticket.pdf",
  ...over,
});
const pdf = () => new File(["x"], "ticket.pdf", { type: "application/pdf" });

describe("ItemForm", () => {
  function setup(props: Partial<React.ComponentProps<typeof ItemForm>> = {}) {
    const onSubmit = vi.fn();
    const utils = render(<ItemForm tz={IST} onSubmit={onSubmit} onCancel={() => {}} {...props} />);
    return { onSubmit, ...utils };
  }
  const fill = async (title = "Beach dinner", start = "2026-12-01T19:30") => {
    await userEvent.type(screen.getByLabelText("Title"), title);
    await userEvent.type(screen.getByLabelText("Starts"), start);
  };

  it("saves times in the trip's time zone as exact instants, for the whole group by default", async () => {
    const { onSubmit } = setup();
    await fill("Beach dinner", "2026-12-01T10:00");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Beach dinner",
        startsAt: "2026-12-01T04:30:00.000Z",
        endsAt: null,
        tz: IST,
        visibility: "shared",
        groupItem: true,
      }),
    );
  });

  it("'Optional' is shared but not a group item, and 'Just me' is private", async () => {
    const { onSubmit } = setup();
    await fill();
    await userEvent.click(screen.getByRole("radio", { name: /Optional/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: "shared", groupItem: false }));
    await userEvent.click(screen.getByRole("radio", { name: /Just me/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: "private", groupItem: false }));
  });

  it("keeps the location link and notes, and trims the title", async () => {
    const { onSubmit } = setup();
    await fill("  Museum  ");
    await userEvent.type(screen.getByLabelText("Location link"), "https://maps.example/museum");
    await userEvent.type(screen.getByLabelText("Notes"), "Bring tickets");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Museum", locationUrl: "https://maps.example/museum", notes: "Bring tickets" }),
    );
  });

  it("explains what is wrong and does not save", async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter a title")).toBeInTheDocument();
    expect(screen.getByText("Choose when it starts")).toBeInTheDocument();
    await fill("Dinner", "2026-12-01T19:00");
    await userEvent.type(screen.getByLabelText("Ends"), "2026-12-01T18:00");
    await userEvent.type(screen.getByLabelText("Location link"), "not a link");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("The end must be after the start")).toBeInTheDocument();
    expect(screen.getByText("Enter a link starting with http:// or https://")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows an existing item's details in the trip's time zone when editing", () => {
    setup({ initial: flight });
    expect(screen.getByLabelText("Title")).toHaveValue("DEL to GOI");
    expect(screen.getByLabelText("Starts")).toHaveValue("2026-12-01T10:00");
    expect(screen.getByLabelText("Ends")).toHaveValue("2026-12-01T12:30");
    expect(screen.getByLabelText("Notes")).toHaveValue("Gate B12");
    expect(screen.getByRole("radio", { name: /Whole group/ })).toBeChecked();
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});

describe("DocumentList", () => {
  const docs = [doc({ id: "a", fileName: "ticket.pdf" }), doc({ id: "b", scope: "personal", ownerId: "riya", kind: "passport", fileName: "riya-passport.pdf" })];

  it("lists shared documents for every member and opens one on request", async () => {
    const onOpen = vi.fn();
    render(<DocumentList documents={docs} member={member()} people={people} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Open ticket.pdf" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("does not list a personal document to another member", () => {
    render(<DocumentList documents={docs} member={member()} people={people} onOpen={() => {}} />);
    expect(screen.queryByText("riya-passport.pdf")).toBeNull();
  });

  it("shows a personal document to its owner and to the organizer, marked personal", () => {
    const { unmount } = render(<DocumentList documents={docs} member={member({ userId: "riya" })} people={people} onOpen={() => {}} />);
    expect(screen.getByText("riya-passport.pdf")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    unmount();
    render(<DocumentList documents={docs} member={member({ userId: "org", role: "organizer" })} people={people} onOpen={() => {}} />);
    expect(screen.getByText(/Personal · Riya/)).toBeInTheDocument();
  });

  it("says when there is nothing yet, and when opening fails", async () => {
    const { unmount } = render(<DocumentList documents={[]} member={member()} people={people} onOpen={() => {}} />);
    expect(screen.getByText("No documents yet.")).toBeInTheDocument();
    unmount();
    render(<DocumentList documents={docs} member={member()} people={people} onOpen={() => Promise.reject(new Error("offline"))} />);
    await userEvent.click(screen.getByRole("button", { name: "Open ticket.pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't open ticket.pdf");
  });
});

describe("BookingDetail", () => {
  function setup(props: Partial<React.ComponentProps<typeof BookingDetail>> = {}) {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const onOpenDocument = vi.fn();
    const utils = render(
      <BookingDetail item={flight} member={member()} documents={[doc()]} people={people} onSave={onSave} onUpload={onUpload} onOpenDocument={onOpenDocument} {...props} />,
    );
    return { onSave, onUpload, onOpenDocument, ...utils };
  }

  it("shows the booking's details, location link and documents", () => {
    setup();
    expect(screen.getByRole("heading", { name: "DEL to GOI" })).toBeInTheDocument();
    expect(screen.getByText("10:00 – 12:30")).toBeInTheDocument();
    expect(screen.getByText("Gate B12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open location/ })).toHaveAttribute("href", "https://maps.example/airport");
    expect(screen.getByRole("button", { name: "Open ticket.pdf" })).toBeInTheDocument();
  });

  it("lets the booker edit their own booking and attach a document", async () => {
    const { onSave, onUpload } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "DEL to GOI (moved)");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "DEL to GOI (moved)", tz: IST }));

    await userEvent.upload(screen.getByLabelText("Add a document"), pdf());
    expect(onUpload).toHaveBeenCalledWith(expect.any(File), "shared");
  });

  it("attaches a personal document when chosen", async () => {
    const { onUpload } = setup();
    await userEvent.click(screen.getByRole("radio", { name: /Only me and the organizer/ }));
    await userEvent.upload(screen.getByLabelText("Add a document"), pdf());
    expect(onUpload).toHaveBeenCalledWith(expect.any(File), "personal");
  });

  it("hides edit and upload controls from a member who may not edit", () => {
    setup({ item: { ...flight, ownerId: "riya" } });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByLabelText("Add a document")).toBeNull();
    expect(screen.getByRole("heading", { name: "DEL to GOI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open ticket.pdf" })).toBeInTheDocument();
  });

  it("shows edit controls to the organizer and to a member the organizer granted edit rights", () => {
    const { unmount } = setup({ item: { ...flight, ownerId: "riya" }, member: member({ role: "organizer" }) });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    unmount();
    setup({ item: { ...flight, ownerId: "riya" }, member: member({ canEditAll: true }) });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("refuses a file that is not a PDF or image, and says why", async () => {
    const { onUpload } = setup();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText("Add a document"), new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
    expect(screen.getByRole("alert")).toHaveTextContent("PDF or an image");
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("tells the user when the upload fails", async () => {
    setup({ onUpload: vi.fn().mockRejectedValue(new Error("storage down")) });
    await userEvent.upload(screen.getByLabelText("Add a document"), pdf());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't upload");
  });

  it("only lists documents attached to this booking", () => {
    setup({ documents: [doc({ id: "a", fileName: "mine.pdf" }), doc({ id: "b", itemId: "other", fileName: "other-booking.pdf" }), doc({ id: "c", itemId: null, fileName: "general.pdf" })] });
    expect(screen.getByText("mine.pdf")).toBeInTheDocument();
    expect(screen.queryByText("other-booking.pdf")).toBeNull();
    expect(screen.queryByText("general.pdf")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
