import type { RedeemResult } from "@hoppin/core";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { MagicLinkRequest } from "../lib/auth-api";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export interface JoinFlowProps {
  token: string;
  /** Set once the person is signed in (after clicking the emailed link). */
  signedInUserId: string | null;
  /** Where the emailed link brings them back to (this page). */
  redirectTo: string;
  sendMagicLink: (request: MagicLinkRequest) => Promise<void>;
  redeem: (token: string) => Promise<RedeemResult>;
  onContinue: (tripId: string) => void;
}

type JoinState =
  | { kind: "loading" }
  | { kind: "done"; result: RedeemResult }
  | { kind: "invalid" }
  | { kind: "error" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ label, error, ...input }: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-11 rounded-card border border-line bg-surface px-3 text-base text-fg focus-visible:outline-2 focus-visible:outline-accent"
      />
      {error && (
        <span id={`${id}-error`} className="text-sm text-danger-fg">
          {error}
        </span>
      )}
    </div>
  );
}

/** Join a trip from an invite link: sign in with an emailed link, then request to join and wait for approval. */
export function JoinFlow({ token, signedInUserId, redirectTo, sendMagicLink, redeem, onContinue }: JoinFlowProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);

  const [join, setJoin] = useState<JoinState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (!signedInUserId || started.current === attempt) return; // once per attempt, even in React strict mode
    started.current = attempt;
    setJoin({ kind: "loading" });
    redeem(token).then(
      (result) => setJoin({ kind: "done", result }),
      (err: unknown) => setJoin(/invalid or expired/.test(String((err as Error)?.message)) ? { kind: "invalid" } : { kind: "error" }),
    );
  }, [signedInUserId, token, redeem, attempt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      name: name.trim() ? undefined : "Enter your name",
      email: EMAIL.test(email.trim()) ? undefined : "Enter a valid email",
    };
    setErrors(next);
    if (next.name || next.email) return;
    setSending(true);
    setSendFailed(false);
    try {
      await sendMagicLink({ email: email.trim(), name: name.trim(), redirectTo });
      setSentTo(email.trim());
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  let body: React.ReactNode;
  if (signedInUserId) {
    if (join.kind === "loading") body = <p role="status">Joining the trip…</p>;
    else if (join.kind === "invalid")
      body = <p>This invite link isn't valid anymore. Ask the organizer for a new one.</p>;
    else if (join.kind === "error")
      body = (
        <div className="flex flex-col items-start gap-3">
          <p>Something went wrong while joining.</p>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      );
    else if (join.result.status === "approved")
      body = (
        <div className="flex flex-col items-start gap-3">
          <p className="text-lg font-semibold">You're in!</p>
          <Button onClick={() => onContinue(join.result.tripId)}>Open trip</Button>
        </div>
      );
    else if (join.result.status === "removed") body = <p>You can't join this trip.</p>;
    else
      body = (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold">Request sent</p>
          <p className="text-muted">Waiting for the organizer to approve you. You'll see the trip as soon as they do.</p>
        </div>
      );
  } else if (sentTo) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-lg font-semibold">Check your email</p>
        <p className="text-muted">We sent a sign-in link to {sentTo}. Open it on this device to join the trip.</p>
      </div>
    );
  } else {
    body = (
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Your name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        {sendFailed && <Banner kind="conflict" text="Couldn't send the link. Please try again." />}
        <Button type="submit" disabled={sending}>
          Email me a sign-in link
        </Button>
      </form>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="font-display text-4xl font-extrabold">Join the trip</h1>
      <Card>{body}</Card>
    </main>
  );
}
