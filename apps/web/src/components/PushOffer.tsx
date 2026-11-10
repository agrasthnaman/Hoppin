import { useState } from "react";
import { PUSH_ASKED_KEY, shouldOfferPush } from "../lib/push-register";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/** One line, after a trip exists, and only on the phone. Not now and Turn on both count as asked. */
export function PushOffer({ native, onTurnOn }: { native: boolean; onTurnOn: () => void }) {
  const [asked, setAsked] = useState(() => {
    try {
      return localStorage.getItem(PUSH_ASKED_KEY) === "1";
    } catch {
      return true;
    }
  });
  if (!shouldOfferPush(native, asked)) return null;

  function dismiss() {
    try {
      localStorage.setItem(PUSH_ASKED_KEY, "1");
    } catch {
      // Private mode still hides the offer for this visit.
    }
    setAsked(true);
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm">Get a note on this phone when someone changes the plan.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            dismiss();
            onTurnOn();
          }}
        >
          Turn on notifications
        </Button>
        <Button variant="secondary" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </Card>
  );
}
