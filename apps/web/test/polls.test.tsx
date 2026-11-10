import type { Poll, TripSnapshot, Vote } from "@hoppin/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDemoServices } from "../src/demo/demo-services";
import { fakeServices, renderApp, snapshot } from "./helpers";

const beach: Poll = {
  id: "p1", tripId: "t1", createdBy: "riya", question: "Which beach?", multiple: false, closed: false, createdAt: "2026-12-01T10:00:00.000Z",
  options: [{ id: "a", label: "Baga" }, { id: "b", label: "Palolem" }, { id: "c", label: "Anjuna" }],
};
const withPolls = (polls: Poll[], votes: Vote[] = []): TripSnapshot => snapshot({ polls, votes });
const card = (name: string) => screen.findByRole("group", { name });

describe("polls screen", () => {
  it("is reachable from More", async () => {
    const { services } = fakeServices({ snapshot: withPolls([]) });
    renderApp("/trips/t1/more", services);
    expect(await screen.findByRole("link", { name: "Polls" })).toHaveAttribute("href", "/trips/t1/polls");
  });

  it("explains an empty list", async () => {
    const { services } = fakeServices({ snapshot: withPolls([]) });
    renderApp("/trips/t1/polls", services);
    expect(await screen.findByText("No polls yet")).toBeInTheDocument();
  });

  it("shows a poll with its counts and what the person chose", async () => {
    const votes: Vote[] = [{ pollId: "p1", optionId: "b", userId: "riya" }, { pollId: "p1", optionId: "b", userId: "me" }, { pollId: "p1", optionId: "a", userId: "org" }];
    const { services } = fakeServices({ snapshot: withPolls([beach], votes) });
    renderApp("/trips/t1/polls", services);
    const poll = await card("Which beach?");
    expect(within(poll).getByText("Pick one · 3 people have voted")).toBeInTheDocument();
    expect(within(poll).getByRole("radio", { name: /Palolem/ })).toBeChecked();
    expect(within(poll).getByRole("radio", { name: /Baga/ })).not.toBeChecked();
    expect(within(poll).getByText("2 votes")).toBeInTheDocument();
    expect(within(poll).getByText("1 vote")).toBeInTheDocument();
  });

  it("voting saves the choice; choosing again replaces it", async () => {
    const { services } = fakeServices({ snapshot: withPolls([beach]) });
    renderApp("/trips/t1/polls", services);
    await userEvent.click(within(await card("Which beach?")).getByRole("radio", { name: /Anjuna/ }));
    await waitFor(() => expect(services.actions.castVote).toHaveBeenCalledWith("p1", ["c"]));
    await userEvent.click(within(await card("Which beach?")).getByRole("radio", { name: /Baga/ }));
    await waitFor(() => expect(services.actions.castVote).toHaveBeenLastCalledWith("p1", ["a"]));
  });

  it("a multiple-choice poll takes several options", async () => {
    const dinner: Poll = { ...beach, id: "p2", question: "Dinner?", multiple: true, createdBy: "me" };
    const { services } = fakeServices({ snapshot: withPolls([dinner]) });
    renderApp("/trips/t1/polls", services);
    await userEvent.click(within(await card("Dinner?")).getByRole("checkbox", { name: /Baga/ }));
    await waitFor(() => expect(services.actions.castVote).toHaveBeenLastCalledWith("p2", ["a"]));
  });

  it("shows a refusal from the server", async () => {
    const { services } = fakeServices({ snapshot: withPolls([beach]) });
    vi.mocked(services.actions.castVote).mockRejectedValueOnce(new Error("this poll is closed"));
    renderApp("/trips/t1/polls", services);
    await userEvent.click(within(await card("Which beach?")).getByRole("radio", { name: /Baga/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("this poll is closed");
  });

  it("a closed poll cannot be voted on, and shows the winner", async () => {
    const closed: Poll = { ...beach, closed: true };
    const { services } = fakeServices({ snapshot: withPolls([closed], [{ pollId: "p1", optionId: "c", userId: "riya" }]) });
    renderApp("/trips/t1/polls", services);
    const poll = await card("Which beach?");
    expect(within(poll).getByText("Closed")).toBeInTheDocument();
    expect(within(poll).getByRole("radio", { name: /Anjuna/ })).toBeDisabled();
    expect(within(poll).getByText("Winner")).toBeInTheDocument();
  });

  it("only the person who asked, or an organizer, sees close and delete", async () => {
    const asked: Poll = { ...beach, id: "p2", createdBy: "me", question: "Mine?" };
    const { services } = fakeServices({ snapshot: withPolls([beach, asked]) });
    renderApp("/trips/t1/polls", services);
    expect(within(await card("Mine?")).getByRole("button", { name: "Close poll" })).toBeInTheDocument();
    expect(within(await card("Which beach?")).queryByRole("button", { name: "Close poll" })).toBeNull();
  });

  it("closing and deleting call the server", async () => {
    const asked: Poll = { ...beach, createdBy: "me" };
    const { services } = fakeServices({ snapshot: withPolls([asked]) });
    renderApp("/trips/t1/polls", services);
    await userEvent.click(within(await card("Which beach?")).getByRole("button", { name: "Close poll" }));
    await waitFor(() => expect(services.actions.closePoll).toHaveBeenCalledWith("p1"));
    await userEvent.click(within(await card("Which beach?")).getByRole("button", { name: /Delete poll/ }));
    await waitFor(() => expect(services.actions.deletePoll).toHaveBeenCalledWith("p1"));
  });

  it("asking the group needs a question and two options, then creates the poll", async () => {
    const { services } = fakeServices({ snapshot: withPolls([]) });
    renderApp("/trips/t1/polls", services);
    await userEvent.click(await screen.findByRole("button", { name: "Ask the group" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask the group" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Ask the group" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a question");
    await userEvent.type(within(dialog).getByLabelText("Question"), "Dinner?");
    await userEvent.type(within(dialog).getByLabelText("Option 1"), "Thali");
    await userEvent.click(within(dialog).getByRole("button", { name: "Ask the group" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Add at least 2 options");
    await userEvent.type(within(dialog).getByLabelText("Option 2"), "Pizza");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add option" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "People can pick more than one" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Ask the group" }));
    await waitFor(() => expect(services.actions.createPoll).toHaveBeenCalledWith("t1", "Dinner?", true, ["Thali", "Pizza"]));
  });

  it("offline, polls can be read but not changed", async () => {
    const online = vi.spyOn(window.navigator, "onLine", "get");
    try {
      const { services } = fakeServices({ snapshot: withPolls([beach]) });
      renderApp("/trips/t1/polls", services);
      await card("Which beach?"); // loaded and kept on the device while there was a connection
      online.mockReturnValue(false);
      act(() => void window.dispatchEvent(new Event("offline")));
      const poll = await card("Which beach?");
      expect(within(poll).getByRole("radio", { name: /Baga/ })).toBeDisabled();
      expect(within(poll).getByText("Connect to the internet to vote.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ask the group" })).toBeDisabled();
    } finally {
      online.mockRestore();
    }
  });

  it("a copy saved before polls existed still opens", async () => {
    const { services } = fakeServices({ snapshot: snapshot() });
    renderApp("/trips/t1/polls", services);
    expect(await screen.findByText("No polls yet")).toBeInTheDocument();
  });
});

describe("winner becomes a plan", () => {
  it("opens the plan form with the winning option, and saves a shared group plan", async () => {
    const asked: Poll = { ...beach, createdBy: "me" };
    const { services } = fakeServices({ snapshot: withPolls([asked], [{ pollId: "p1", optionId: "b", userId: "riya" }]) });
    renderApp("/trips/t1/polls", services);
    await userEvent.click(within(await card("Which beach?")).getByRole("button", { name: /Add “Palolem” to the plan/ }));
    const dialog = await screen.findByRole("dialog", { name: "Add to the plan" });
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Palolem");
    expect(within(dialog).getByLabelText("Notes")).toHaveValue("Which beach?");
    const starts = within(dialog).getByLabelText("Starts");
    expect(starts).toHaveAttribute("min", "2026-12-01T00:00");
    expect(starts).toHaveAttribute("max", "2026-12-05T23:59");
    expect(within(dialog).getByLabelText("Ends")).toHaveAttribute("max", "2026-12-05T23:59");
    await userEvent.type(starts, "2027-01-01T10:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose a day of this trip")).toBeInTheDocument();
    expect(services.actions.createItem).not.toHaveBeenCalled();
    await userEvent.clear(starts);
    await userEvent.type(starts, "2026-12-03T10:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add to the plan" })).toBeNull());
    // it is saved on this device first and sent at once because there is a connection
    await waitFor(() =>
      expect(services.actions.createItem).toHaveBeenCalledWith("t1", "me", expect.objectContaining({ title: "Palolem", groupItem: true, visibility: "shared", notes: "Which beach?", pollId: "p1" }), expect.any(String)),
    );
  });

  it("is not offered while nobody has voted", async () => {
    const asked: Poll = { ...beach, createdBy: "me" };
    const { services } = fakeServices({ snapshot: withPolls([asked]) });
    renderApp("/trips/t1/polls", services);
    expect(within(await card("Which beach?")).queryByRole("button", { name: /to the plan/ })).toBeNull();
  });
});

describe("polls in demo mode", () => {
  const demo = () => createDemoServices({ today: "2026-12-01", timeZone: "Asia/Kolkata", dbName: `demo-polls-${Math.random()}` });

  it("has a sample poll that can be voted on", async () => {
    renderApp("/trips/demo-goa/polls", demo());
    const poll = await card("Which beach for Thursday?");
    expect(within(poll).getByText("2 votes")).toBeInTheDocument();
    await userEvent.click(within(poll).getByRole("radio", { name: /Baga/ }));
    await waitFor(async () => expect(within(await card("Which beach for Thursday?")).getByRole("radio", { name: /Baga/ })).toBeChecked());
  });

  it("a new poll appears, the organizer can close it, and then it takes no votes", async () => {
    renderApp("/trips/demo-goa/polls", demo());
    await userEvent.click(await screen.findByRole("button", { name: "Ask the group" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask the group" });
    await userEvent.type(within(dialog).getByLabelText("Question"), "Dinner?");
    await userEvent.type(within(dialog).getByLabelText("Option 1"), "Thali");
    await userEvent.type(within(dialog).getByLabelText("Option 2"), "Pizza");
    await userEvent.click(within(dialog).getByRole("button", { name: "Ask the group" }));
    await userEvent.click(within(await card("Dinner?")).getByRole("button", { name: "Close poll" }));
    await waitFor(async () => expect(within(await card("Dinner?")).getByText("Closed")).toBeInTheDocument());
    expect(within(await card("Dinner?")).getByRole("radio", { name: /Thali/ })).toBeDisabled();
  });
});
