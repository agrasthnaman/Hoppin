import { inviteUrl, type MemberInfo } from "@hoppin/core";
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { browserSharePorts, shareLink } from "../lib/share";
import { peopleFrom } from "../app/people";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Card } from "../components/ui/Card";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";

type Invite = { id: string; token: string; createdAt: string; expiresAt: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const expiry = (iso: string) => `Expires ${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** Who is in the trip. The organizer approves and removes people, grants edit rights, and manages invite links. */
export function MembersScreen() {
  const trip = useTripData();
  const { actions, invites } = useServices();
  const online = useOnline();
  const [list, setList] = useState<Invite[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MemberInfo | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const members = trip.snapshot?.members ?? [];
  const me = members.find((x) => x.userId === trip.viewerId);
  const isOrganizer = me?.role === "organizer";

  useEffect(() => {
    if (!isOrganizer || !online) return;
    let alive = true;
    actions.listInvites(trip.tripId).then(
      (found) => alive && setList(found),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [actions, trip.tripId, isOrganizer, online]);

  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const people = peopleFrom(members);

  async function run(change: () => Promise<void>, who?: string) {
    setFailed(false);
    if (who) setActing(who);
    try {
      await change();
      await trip.refresh();
    } catch {
      setFailed(true);
    } finally {
      setActing(null);
    }
  }

  async function copy(invite: Invite) {
    try {
      await navigator.clipboard.writeText(inviteUrl(window.location.origin, invite.token));
      setCopied(invite.id);
    } catch {
      setFailed(true);
    }
  }

  const waiting = members.filter((x) => x.status === "pending");
  const active = members.filter((x) => x.status === "approved");
  const gone = members.filter((x) => x.status === "removed");
  const off = !online;

  const row = (member: MemberInfo, actionsNode?: React.ReactNode, subtitle?: string) => (
    <li key={member.userId} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.displayName} color={people[member.userId]?.color ?? "#475569"} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{member.displayName}</p>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {actionsNode && <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:max-w-[60%] sm:justify-end">{actionsNode}</div>}
    </li>
  );

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-2xl font-extrabold">Members</h2>
      {isOrganizer && off && <p className="text-sm text-muted">Connect to the internet to change members or invite links.</p>}
      {failed && <p role="alert" className="text-sm text-danger-fg">Couldn't do that. Check your connection and try again.</p>}

      {isOrganizer && waiting.length > 0 && (
        <section aria-label="Waiting for approval" className="flex flex-col gap-2">
          <h3 className="font-semibold">Waiting for approval</h3>
          <ul className="flex flex-col gap-2">
            {waiting.map((member) =>
              row(
                member,
                <div className="flex gap-2">
                  <Button disabled={off} busy={acting === member.userId} aria-label={`Approve ${member.displayName}`} onClick={() => void run(() => invites.approveMember(trip.tripId, member.userId), member.userId)}>
                    Approve
                  </Button>
                  <Button variant="ghost" disabled={off} busy={acting === member.userId} aria-label={`Decline ${member.displayName}`} onClick={() => void run(() => invites.removeMember(trip.tripId, member.userId), member.userId)}>
                    Decline
                  </Button>
                </div>,
              ),
            )}
          </ul>
        </section>
      )}

      <section aria-label="People in this trip" className="flex flex-col gap-2">
        <h3 className="font-semibold">In this trip</h3>
        <ul className="flex flex-col gap-2">
          {active.map((member) => {
            const mine = member.userId === trip.viewerId;
            const organizer = member.role === "organizer";
            const subtitle = mine ? (organizer ? "You · Organizer" : "You") : organizer ? "Organizer" : undefined;
            const controls =
              isOrganizer && organizer && !mine ? (
                <Button variant="ghost" disabled={off} aria-label={`Make ${member.displayName} a member again`} onClick={() => void run(() => actions.setMemberRole(trip.tripId, member.userId, "member"))}>
                  Make member
                </Button>
              ) : isOrganizer && !organizer ? (
                <div className="flex w-full flex-col gap-2 sm:items-end">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      aria-label={`Let ${member.displayName} edit others' plans`}
                      checked={member.canEditAll}
                      disabled={off}
                      onChange={(e) => void run(() => actions.setEditRights(trip.tripId, member.userId, e.target.checked))}
                    />
                    <span aria-hidden="true">Can edit others' plans</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" disabled={off} aria-label={`Make ${member.displayName} an organizer`} onClick={() => void run(() => actions.setMemberRole(trip.tripId, member.userId, "organizer"))}>
                      Make organizer
                    </Button>
                    <Button variant="ghost" disabled={off} aria-label={`Remove ${member.displayName}`} onClick={() => setRemoving(member)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ) : undefined;
            return row(member, controls, subtitle);
          })}
        </ul>
      </section>

      {isOrganizer && gone.length > 0 && (
        <section aria-label="Removed" className="flex flex-col gap-2">
          <h3 className="font-semibold">Removed</h3>
          <ul className="flex flex-col gap-2">
            {gone.map((member) =>
              row(
                member,
                <Button variant="secondary" disabled={off} aria-label={`Let ${member.displayName} back in`} onClick={() => void run(() => invites.approveMember(trip.tripId, member.userId))}>
                  Let back in
                </Button>,
              ),
            )}
          </ul>
        </section>
      )}

      {isOrganizer && (
        <section aria-label="Invite link" className="flex flex-col gap-3">
          <h3 className="font-semibold">Invite link</h3>
          <p className="text-sm text-muted">Anyone with the link can ask to join. You approve each person before they see anything.</p>
          {online && list === null && !failed && (
            <p role="status" aria-label="Loading invite links" className="flex items-center gap-3 text-sm text-muted">
              <Spinner className="text-accent" />
              Loading invite links
            </p>
          )}
          {(list ?? []).map((invite) => (
            <Card key={invite.id} className="flex flex-col gap-2">
              <input
                readOnly
                aria-label="Invite link"
                value={inviteUrl(window.location.origin, invite.token)}
                onFocus={(e) => e.currentTarget.select()}
                className="min-h-11 w-full rounded-card border border-line bg-surface px-3 text-sm text-fg"
              />
              <p className="text-xs text-muted">{expiry(invite.expiresAt)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => void copy(invite)}>
                  Copy link
                </Button>
                {(Capacitor.isNativePlatform() || typeof navigator.share === "function") && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void shareLink(
                        { title: `Join ${trip.snapshot?.trip.name ?? "a trip"}`, url: inviteUrl(window.location.origin, invite.token) },
                        browserSharePorts(Capacitor.isNativePlatform()),
                      ).catch(() => {})
                    }
                  >
                    Share
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={off}
                  onClick={() =>
                    void run(async () => {
                      await invites.revokeInvite(invite.id);
                      setList((current) => (current ?? []).filter((i) => i.id !== invite.id));
                    })
                  }
                >
                  Stop this link
                </Button>
                {copied === invite.id && <span role="status" className="text-sm text-muted">Copied</span>}
              </div>
            </Card>
          ))}
          <div>
            <Button
              disabled={off}
              onClick={() =>
                void run(async () => {
                  const created = await invites.createInvite(trip.tripId);
                  const now = Date.now();
                  setList((current) => [
                    { id: created.id, token: created.token, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 14 * 86_400_000).toISOString() },
                    ...(current ?? []),
                  ]);
                })
              }
            >
              Create invite link
            </Button>
          </div>
        </section>
      )}

      <Sheet
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.displayName ?? ""}?`}
        description="They will lose access to this trip and its documents, and the trip will be wiped from their phone the next time it connects."
      >
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const target = removing;
              setRemoving(null);
              if (target) void run(() => invites.removeMember(trip.tripId, target.userId));
            }}
          >
            Remove
          </Button>
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
