import { parseInviteToken } from "@hoppin/core";
import { useState, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { inputClass } from "../lib/forms";

/** Paste an organizer's invite link and open the join page. */
export function JoinTripForm({ onJoin }: { onJoin: (token: string) => void }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const token = parseInviteToken(link);
    if (!token) {
      setError("That doesn't look like an invite link. Ask the organizer to send you theirs.");
      return;
    }
    onJoin(token);
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col items-start gap-3">
      <label className="flex w-full flex-col gap-1 text-sm font-medium">
        Invite link
        <input className={inputClass} value={link} onChange={(event) => setLink(event.target.value)} autoComplete="off" />
      </label>
      {error && <p className="text-sm">{error}</p>}
      <Button type="submit">Join the trip</Button>
    </form>
  );
}
