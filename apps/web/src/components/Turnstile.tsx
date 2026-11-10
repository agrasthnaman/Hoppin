import { useEffect, useRef } from "react";
import { loadTurnstile } from "../lib/turnstile";

export interface TurnstileProps {
  siteKey: string;
  /** Called with a fresh single-use token, or null when it expired or failed. */
  onToken: (token: string | null) => void;
  /** The check could not run at all (the script is blocked, no network). */
  onFail?: () => void;
  /** Change this number to get a new token (a token works once). */
  resetKey: number;
}

/**
 * Cloudflare Turnstile: an invisible check that you are a person. It only shows something when it is not sure.
 * Renders nothing without a site key.
 */
export function Turnstile({ siteKey, onToken, onFail, resetKey }: TurnstileProps) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const api = useRef<Awaited<ReturnType<typeof loadTurnstile>> | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const failed = useRef(onFail);
  failed.current = onFail;

  useEffect(() => {
    if (!siteKey || !host.current) return;
    let cancelled = false;
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !host.current) return;
        api.current = turnstile;
        widget.current = turnstile.render(host.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          theme: "auto",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => {
            callback.current(null);
            failed.current?.();
          },
        });
      },
      () => {
        callback.current(null);
        failed.current?.(); // could not load: the form stops waiting and lets the server decide
      },
    );
    return () => {
      cancelled = true;
      if (widget.current && api.current) api.current.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widget.current && api.current) api.current.reset(widget.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={host} data-testid="turnstile" className="flex justify-center empty:hidden" />;
}
