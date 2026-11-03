/** Tells screens that what is stored on this device for a trip changed (synced, edited, or wiped), so they re-read it. */
export function announceChange(tripId: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hoppin:synced", { detail: { tripId } }));
}
