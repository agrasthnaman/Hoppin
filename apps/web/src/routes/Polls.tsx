import { applyVote, localDate, planZone, PollError, winnerPlanDefaults, type Poll, type TallyLine, type Vote } from "@hoppin/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { ItemForm } from "../components/ItemForm";
import { PollCard } from "../components/PollCard";
import { PollForm } from "../components/PollForm";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";

/** The trip's polls: ask the group something, vote, close a poll, and turn the winner into a plan. */
export default function Polls() {
  const trip = useTripData();
  const { actions, clock } = useServices();
  const online = useOnline();
  const [asking, setAsking] = useState(false);
  const [winner, setWinner] = useState<{ poll: Poll; line: TallyLine } | null>(null);
  // What this person just chose, shown at once while it is being saved.
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;
  const me = snapshot.members.find((m) => m.userId === trip.viewerId);
  const polls = snapshot.polls ?? [];
  const open = polls.filter((p) => !p.closed).reverse();
  const closed = polls.filter((p) => p.closed).reverse();

  const votesFor = (poll: Poll): Vote[] => {
    const saved = snapshot.votes ?? [];
    const chosen = choices[poll.id];
    return chosen ? applyVote(saved, { ...poll, closed: false }, trip.viewerId, chosen) : saved;
  };

  async function run(pollId: string, change: () => Promise<void>) {
    setBusy(pollId);
    setFailure(null);
    try {
      await change();
      await trip.refresh();
    } catch (error) {
      setFailure(error instanceof Error && error.message ? error.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setChoices((current) => {
        const { [pollId]: _done, ...rest } = current;
        return rest;
      });
      setBusy(null);
    }
  }

  function vote(poll: Poll, optionIds: string[]) {
    try {
      applyVote([], poll, trip.viewerId, optionIds);
    } catch (error) {
      if (error instanceof PollError) return setFailure(error.message);
      throw error;
    }
    setChoices((current) => ({ ...current, [poll.id]: optionIds }));
    void run(poll.id, () => actions.castVote(poll.id, optionIds));
  }

  const card = (poll: Poll) => (
    <PollCard
      key={poll.id}
      poll={poll}
      votes={votesFor(poll)}
      viewerId={trip.viewerId}
      role={me?.role ?? "member"}
      online={online}
      busy={busy === poll.id}
      onVote={(ids) => vote(poll, ids)}
      onClose={() => void run(poll.id, () => actions.closePoll(poll.id))}
      onDelete={() => void run(poll.id, () => actions.deletePoll(poll.id))}
      onAddWinner={(line) => setWinner({ poll, line })}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/trips/${trip.tripId}/more`} className="w-fit text-sm font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
        Back to More
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h2 className="page-title text-5xl">Polls</h2>
        <Button disabled={!online} onClick={() => setAsking(true)}>
          <Plus aria-hidden="true" className="size-4" />
          Ask the group
        </Button>
      </div>
      {!online && <p className="text-sm text-muted">You can read polls offline. Connect to the internet to ask a question or vote.</p>}
      {failure && (
        <p role="alert" className="text-sm text-danger-fg">
          {failure}
        </p>
      )}

      {polls.length === 0 ? (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">No polls yet</p>
          <p className="text-sm text-muted">Can't decide where to eat or which beach? Ask the group and the winner can become a plan.</p>
        </Card>
      ) : (
        <>
          {open.map(card)}
          {closed.length > 0 && (
            <>
              <h3 className="mt-2 text-sm font-semibold text-muted">Closed</h3>
              {closed.map(card)}
            </>
          )}
        </>
      )}

      <Sheet open={asking} onOpenChange={setAsking} title="Ask the group">
        <PollForm
          onCancel={() => setAsking(false)}
          onSubmit={async (question, multiple, options) => {
            await actions.createPoll(trip.tripId, question, multiple, options);
            await trip.refresh();
            setAsking(false);
          }}
        />
      </Sheet>

      <Sheet open={winner !== null} onOpenChange={(next) => !next && setWinner(null)} title="Add to the plan" description="Choose when it happens. The whole group will see it.">
        {winner && (
          <ItemForm
            tz={planZone(snapshot.items, localDate(clock.now(), clock.timeZone), clock.timeZone)}
            near={snapshot.trip.destination}
            dates={snapshot.trip.startDate && snapshot.trip.endDate ? { start: snapshot.trip.startDate, end: snapshot.trip.endDate } : null}
            prefill={winnerPlanDefaults(winner.poll, winner.line)}
            onCancel={() => setWinner(null)}
            onSubmit={async (values) => {
              await trip.addItem(values); // saved on this device first, like any other plan
              setWinner(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
