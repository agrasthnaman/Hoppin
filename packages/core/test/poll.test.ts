import { describe, expect, it } from "vitest";
import { applyVote, canManagePoll, castVote, PollError, pollWinner, tallyPoll, validatePollDraft, voterCount, votesOf, winnerPlanDefaults } from "../src/poll";
import type { Poll, Vote } from "../src/types";

const poll = (over: Partial<Poll> = {}): Poll => ({
  id: "p1",
  tripId: "t1",
  createdBy: "riya",
  question: "Which beach?",
  multiple: false,
  closed: false,
  createdAt: "2026-12-01T00:00:00.000Z",
  options: [
    { id: "a", label: "Baga" },
    { id: "b", label: "Palolem" },
    { id: "c", label: "Anjuna" },
  ],
  ...over,
});
const vote = (userId: string, optionId: string, pollId = "p1"): Vote => ({ pollId, optionId, userId });

describe("castVote", () => {
  it("takes one vote per member on a single-choice poll", () => {
    expect(castVote(poll(), "me", ["a"])).toEqual([vote("me", "a")]);
    expect(() => castVote(poll(), "me", ["a", "b"])).toThrow("Choose one option");
  });

  it("takes several options on a multiple-choice poll, once each", () => {
    expect(castVote(poll({ multiple: true }), "me", ["a", "b", "a"])).toEqual([vote("me", "a"), vote("me", "b")]);
  });

  it("rejects votes on a closed poll", () => {
    expect(() => castVote(poll({ closed: true }), "me", ["a"])).toThrow(PollError);
    expect(() => castVote(poll({ closed: true }), "me", ["a"])).toThrow("This poll is closed");
  });

  it("rejects an option that is not in the poll", () => {
    expect(() => castVote(poll(), "me", ["zzz"])).toThrow("That option is not in this poll");
  });

  it("choosing nothing withdraws the vote", () => {
    expect(castVote(poll(), "me", [])).toEqual([]);
  });
});

describe("applyVote", () => {
  it("changing a vote replaces it and leaves everyone else's alone", () => {
    const before = [vote("me", "a"), vote("riya", "b"), vote("me", "a", "other-poll")];
    const after = applyVote(before, poll(), "me", ["c"]);
    expect(votesOf(poll(), after, "me")).toEqual(["c"]);
    expect(votesOf(poll(), after, "riya")).toEqual(["b"]);
    expect(after).toContainEqual(vote("me", "a", "other-poll"));
  });

  it("changes nothing when the poll is closed", () => {
    const before = [vote("me", "a")];
    expect(() => applyVote(before, poll({ closed: true }), "me", ["b"])).toThrow(PollError);
    expect(before).toEqual([vote("me", "a")]);
  });
});

describe("tallyPoll", () => {
  it("sorts by count, most first", () => {
    const votes = [vote("1", "b"), vote("2", "b"), vote("3", "a")];
    expect(tallyPoll(poll(), votes).map((l) => [l.label, l.count])).toEqual([["Palolem", 2], ["Baga", 1], ["Anjuna", 0]]);
  });

  it("breaks ties by the order the options were written", () => {
    const votes = [vote("1", "c"), vote("2", "b")];
    expect(tallyPoll(poll(), votes).map((l) => l.option)).toEqual(["b", "c", "a"]);
  });

  it("with no votes keeps the written order and counts zero", () => {
    expect(tallyPoll(poll(), []).map((l) => [l.option, l.count])).toEqual([["a", 0], ["b", 0], ["c", 0]]);
  });

  it("ignores votes of other polls", () => {
    expect(tallyPoll(poll(), [vote("1", "a", "other")]).every((l) => l.count === 0)).toBe(true);
  });
});

describe("winner, voters and rights", () => {
  it("has no winner until someone votes, then the option in front", () => {
    expect(pollWinner(poll(), [])).toBeNull();
    expect(pollWinner(poll(), [vote("1", "c")])?.label).toBe("Anjuna");
  });

  it("a tie goes to the option written first", () => {
    expect(pollWinner(poll(), [vote("1", "b"), vote("2", "a")])?.label).toBe("Baga");
  });

  it("counts people, not votes", () => {
    expect(voterCount(poll({ multiple: true }), [vote("1", "a"), vote("1", "b"), vote("2", "a")])).toBe(2);
  });

  it("the creator or an organizer can manage a poll; another member cannot", () => {
    expect(canManagePoll(poll(), "riya", "member")).toBe(true);
    expect(canManagePoll(poll(), "neha", "organizer")).toBe(true);
    expect(canManagePoll(poll(), "neha", "member")).toBe(false);
  });

  it("the winner becomes a shared group plan titled with the option", () => {
    const winner = tallyPoll(poll(), [vote("1", "b")])[0]!;
    expect(winnerPlanDefaults(poll(), winner)).toEqual({ title: "Palolem", kind: "activity", groupItem: true, visibility: "shared", notes: "Which beach?" });
  });
});

describe("validatePollDraft", () => {
  it("needs a question and two different options", () => {
    expect(validatePollDraft("", ["a", "b"])).toBe("Enter a question");
    expect(validatePollDraft("Where?", ["a", ""])).toBe("Add at least 2 options");
    expect(validatePollDraft("Where?", ["Goa", "goa "])).toBe("Each option must be different");
    expect(validatePollDraft("Where?", ["Goa", "Hampi"])).toBeNull();
  });

  it("allows at most 10 options", () => {
    expect(validatePollDraft("Where?", Array.from({ length: 11 }, (_, i) => `o${i}`))).toBe("Use at most 10 options");
  });
});
