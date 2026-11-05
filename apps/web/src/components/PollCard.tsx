import { canManagePoll, tallyPoll, voterCount, type Poll, type TallyLine, type Vote } from "@hoppin/core";
import { CalendarPlus, Check, Lock, Trash2 } from "lucide-react";
import { useId } from "react";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";
import { Card } from "./ui/Card";

export interface PollCardProps {
  poll: Poll;
  votes: Vote[];
  viewerId: string;
  role: "organizer" | "member";
  /** Voting, closing and deleting need a connection. */
  online: boolean;
  /** A change is being saved. */
  busy: boolean;
  onVote: (optionIds: string[]) => void;
  onClose: () => void;
  onDelete: () => void;
  /** Turn the option in front into a plan. Shown to whoever may manage the poll once someone has voted. */
  onAddWinner: (winner: TallyLine) => void;
}

/** One question with its options, who is ahead, and what this person chose. */
export function PollCard({ poll, votes, viewerId, role, online, busy, onVote, onClose, onDelete, onAddWinner }: PollCardProps) {
  const name = useId();
  const tally = tallyPoll(poll, votes);
  const mine = new Set(votes.filter((v) => v.pollId === poll.id && v.userId === viewerId).map((v) => v.optionId));
  const people = voterCount(poll, votes);
  const top = tally[0];
  const leader = top && top.count > 0 ? top : null;
  const manage = canManagePoll(poll, viewerId, role);
  const canVote = online && !poll.closed && !busy;

  function choose(optionId: string) {
    if (poll.multiple) {
      const next = new Set(mine);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      onVote([...next]);
    } else {
      onVote(mine.has(optionId) ? [] : [optionId]); // choosing the same option again takes the vote back
    }
  }

  return (
    <Card className="flex flex-col gap-3" aria-labelledby={`${name}-q`} role="group">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`${name}-q`} className="font-display text-lg font-bold">
            {poll.question}
          </h3>
          <p className="flex items-center gap-2 text-sm text-muted">
            {busy && <Spinner className="text-accent" />}
            {poll.multiple ? "Pick any number" : "Pick one"} · {people} {people === 1 ? "person has" : "people have"} voted
          </p>
        </div>
        {poll.closed && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-xs font-semibold text-muted">
            <Lock aria-hidden="true" className="size-3" />
            Closed
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {poll.options.map((option) => {
          const line = tally.find((l) => l.option === option.id)!;
          const share = people > 0 ? Math.round((line.count / people) * 100) : 0;
          const chosen = mine.has(option.id);
          const inFront = poll.closed && leader?.option === option.id;
          return (
            <li key={option.id}>
              <label
                className={`relative flex min-h-12 cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border px-4 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                  chosen ? "border-accent" : "border-line"
                } ${canVote ? "" : "cursor-default"}`}
              >
                <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-accent-soft" style={{ width: `${share}%` }} />
                <input
                  type={poll.multiple ? "checkbox" : "radio"}
                  name={name}
                  className="sr-only"
                  checked={chosen}
                  disabled={!canVote}
                  onChange={() => choose(option.id)}
                  onClick={poll.multiple ? undefined : () => chosen && choose(option.id)}
                />
                <span aria-hidden="true" className={`relative flex size-5 shrink-0 items-center justify-center border ${poll.multiple ? "rounded-md" : "rounded-full"} ${chosen ? "border-accent bg-accent text-accent-fg" : "border-line"}`}>
                  {chosen && <Check className="size-3" />}
                </span>
                <span className="relative flex-1 font-semibold">{option.label}</span>
                {inFront && <span className="relative rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">Winner</span>}
                <span className="relative text-sm tabular-nums text-muted">
                  {line.count} {line.count === 1 ? "vote" : "votes"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {!online && !poll.closed && <p className="text-sm text-muted">Connect to the internet to vote.</p>}

      {manage && (
        <div className="flex flex-wrap gap-2">
          {leader && (
            <Button variant="secondary" onClick={() => onAddWinner(leader)}>
              <CalendarPlus aria-hidden="true" className="size-4" />
              Add “{leader.label}” to the plan
            </Button>
          )}
          {!poll.closed && (
            <Button variant="ghost" disabled={!online || busy} onClick={onClose}>
              Close poll
            </Button>
          )}
          <Button variant="ghost" disabled={!online || busy} onClick={onDelete} aria-label={`Delete poll: ${poll.question}`}>
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}
