import type { ItemValues, Poll, Vote } from "./types";

/** Something the person tried to do with a poll that is not allowed. The message can be shown as it is. */
export class PollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollError";
  }
}

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 10;

/** Why a new poll cannot be created yet, or null when it is fine. Blank options are ignored. */
export function validatePollDraft(question: string, options: readonly string[]): string | null {
  if (!question.trim()) return "Enter a question";
  const labels = options.map((o) => o.trim()).filter(Boolean);
  if (labels.length < MIN_POLL_OPTIONS) return `Add at least ${MIN_POLL_OPTIONS} options`;
  if (labels.length > MAX_POLL_OPTIONS) return `Use at most ${MAX_POLL_OPTIONS} options`;
  const lower = labels.map((l) => l.toLowerCase());
  if (new Set(lower).size !== lower.length) return "Each option must be different";
  return null;
}

export interface TallyLine {
  /** The option's id. */
  option: string;
  label: string;
  count: number;
}

/** Votes per option, most votes first. Options with the same count stay in the order they were written. */
export function tallyPoll(poll: Poll, votes: readonly Vote[]): TallyLine[] {
  const mine = votes.filter((v) => v.pollId === poll.id);
  return poll.options
    .map((o, index) => ({ option: o.id, label: o.label, count: mine.filter((v) => v.optionId === o.id).length, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ index: _index, ...line }) => line);
}

/**
 * The votes one person ends up with after choosing `optionIds`. Choosing again replaces the earlier choice, and
 * choosing nothing withdraws it. A single-choice poll takes one option. A closed poll takes no changes.
 */
export function castVote(poll: Poll, userId: string, optionIds: readonly string[]): Vote[] {
  if (poll.closed) throw new PollError("This poll is closed");
  const chosen = [...new Set(optionIds)];
  if (!poll.multiple && chosen.length > 1) throw new PollError("Choose one option");
  const known = new Set(poll.options.map((o) => o.id));
  if (chosen.some((id) => !known.has(id))) throw new PollError("That option is not in this poll");
  return chosen.map((optionId) => ({ pollId: poll.id, optionId, userId }));
}

/** All the votes after one person chooses: everyone else's stay, theirs are replaced. */
export function applyVote(votes: readonly Vote[], poll: Poll, userId: string, optionIds: readonly string[]): Vote[] {
  const next = castVote(poll, userId, optionIds);
  return [...votes.filter((v) => !(v.pollId === poll.id && v.userId === userId)), ...next];
}

/** The option ids this person has chosen. */
export function votesOf(poll: Poll, votes: readonly Vote[], userId: string): string[] {
  return votes.filter((v) => v.pollId === poll.id && v.userId === userId).map((v) => v.optionId);
}

/** How many different people have voted. */
export function voterCount(poll: Poll, votes: readonly Vote[]): number {
  return new Set(votes.filter((v) => v.pollId === poll.id).map((v) => v.userId)).size;
}

/** The option in front, or null while nobody has voted. A tie goes to the option written first. */
export function pollWinner(poll: Poll, votes: readonly Vote[]): TallyLine | null {
  const top = tallyPoll(poll, votes)[0];
  return top && top.count > 0 ? top : null;
}

/** Who may close or delete a poll: the person who asked it, or an organizer. */
export function canManagePoll(poll: Poll, userId: string, role: "organizer" | "member"): boolean {
  return poll.createdBy === userId || role === "organizer";
}

/**
 * Starting values for the plan that a poll's winner becomes: a shared group plan with the winning option as its
 * title. The time is chosen in the plan form, so only the parts a poll can know are filled in here.
 */
export function winnerPlanDefaults(poll: Poll, winner: TallyLine): Pick<ItemValues, "title" | "kind" | "groupItem" | "visibility" | "notes"> {
  return { title: winner.label, kind: "activity", groupItem: true, visibility: "shared", notes: poll.question };
}
