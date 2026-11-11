import type { RedeemResult } from "@hoppin/core";
import { useState } from "react";
import { AuthForm, type AuthFormApi } from "../components/AuthForm";
import { Button } from "../components/ui/Button";
import { AuthStage } from "./AuthStage";

export interface JoinFlowProps {
  token: string;
  /** Set once the person is signed in (after clicking the emailed link). */
  signedInUserId: string | null;
  /** Where the confirmation link brings them back to (this page). */
  redirectTo: string;
  /** Where a password-reset link brings them. */
  resetRedirectTo: string;
  auth: AuthFormApi;
  redeem: (token: string) => Promise<RedeemResult>;
  onContinue: (tripId: string) => void;
}

type JoinState =
  | { kind: "ready" }
  | { kind: "joining" }
  | { kind: "done"; result: RedeemResult }
  | { kind: "invalid" }
  | { kind: "error" };

/**
 * Join a trip from an invite link: create an account or sign in, then request to join and wait for approval.
 * Nothing is sent until the person presses the button: opening a link alone must never put someone in a trip (any page
 * can send a signed-in visitor here).
 */
export function JoinFlow({ token, signedInUserId, redirectTo, resetRedirectTo, auth, redeem, onContinue }: JoinFlowProps) {
  const [join, setJoin] = useState<JoinState>({ kind: "ready" });

  function requestToJoin() {
    setJoin({ kind: "joining" });
    redeem(token).then(
      (result) => setJoin({ kind: "done", result }),
      (err: unknown) => setJoin(/invalid or expired/.test(String((err as Error)?.message)) ? { kind: "invalid" } : { kind: "error" }),
    );
  }

  let body: React.ReactNode;
  if (signedInUserId) {
    if (join.kind === "ready" || join.kind === "joining")
      body = (
        <div className="flex flex-col items-start gap-3">
          <p>You've been invited to a trip. Ask to join and the organizer will see your name and can let you in.</p>
          <Button busy={join.kind === "joining"} onClick={requestToJoin}>
            Request to join
          </Button>
        </div>
      );
    else if (join.kind === "invalid")
      body = <p>This invite link isn't valid anymore. Ask the organizer for a new one.</p>;
    else if (join.kind === "error")
      body = (
        <div className="flex flex-col items-start gap-3">
          <p>We couldn't finish joining just now. Please try again.</p>
          <Button onClick={requestToJoin}>Try again</Button>
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
  } else {
    body = <AuthForm api={auth} initialMode="signup" confirmRedirectTo={redirectTo} resetRedirectTo={resetRedirectTo} />;
  }

  return (
    <AuthStage>
      <h1 className="auth-title" data-silk-anchor>
        Join the trip
      </h1>
      <p className="auth-lede" data-silk-anchor>
        An invite got you this far. Make an account, or hop in if you already have one.
      </p>
      <div className="auth-card on-cream" data-silk-anchor>
        {body}
      </div>
    </AuthStage>
  );
}
