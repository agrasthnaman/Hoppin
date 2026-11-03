import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

/** Only follow `next` if it is an address inside this app. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** Returning members sign in with an emailed link. New people join through an organizer's invite link instead. */
export function SignIn() {
  const { auth } = useServices();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await auth.signIn({ email: email.trim(), redirectTo: `${window.location.origin}${safeNext(params.get("next"))}` });
      setSentTo(email.trim());
    } catch {
      setError("Couldn't send the link. If you're new here, ask the organizer for an invite link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <Card>
        {sentTo ? (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold">Check your email</p>
            <p className="text-muted">We sent a sign-in link to {sentTo}. Open it on this device.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="signin-email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 rounded-card border border-line bg-surface px-3 text-base text-fg focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
            {error &&
              (error.startsWith("Couldn't") ? <Banner kind="conflict" text={error} /> : <p className="text-sm text-danger-fg">{error}</p>)}
            <Button type="submit" disabled={sending}>
              Email me a sign-in link
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
