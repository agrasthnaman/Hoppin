import { inputClass } from "../lib/forms";
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "signup" && !name.trim()) {
      setError("Enter your name");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email");
      return;
    }
    setError(null);
    setSending(true);
    const redirectTo = `${window.location.origin}${safeNext(params.get("next"))}`;
    try {
      if (mode === "signup") await auth.sendMagicLink({ email: email.trim(), name: name.trim(), redirectTo });
      else await auth.signIn({ email: email.trim(), redirectTo });
      setSentTo(email.trim());
    } catch {
      setError(
        mode === "signup"
          ? "Couldn't send the link. Please try again."
          : "Couldn't send the link. If you're new here, create an account below or ask the organizer for an invite link.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="font-display text-4xl font-extrabold">Sign in</h1>
      <Card>
        {sentTo ? (
          <div className="flex flex-col gap-2">
            <p className="text-lg font-semibold">Check your email</p>
            <p className="text-muted">We sent a sign-in link to {sentTo}. Open it on this device.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {mode === "signup" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="signin-name" className="text-sm font-medium">
                  Your name
                </label>
                <input
                  id="signin-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
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
                className={inputClass}
              />
            </div>
            {error &&
              (error.startsWith("Couldn't") ? <Banner kind="conflict" text={error} /> : <p className="text-sm text-danger-fg">{error}</p>)}
            <Button type="submit" disabled={sending}>
              {mode === "signup" ? "Create account and email me a link" : "Email me a sign-in link"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }}>
              {mode === "signup" ? "I already have an account" : "New here? Create an account"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
