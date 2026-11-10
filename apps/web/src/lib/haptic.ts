/** A light tap on a primary action. The website does nothing. A phone with no vibrator is not an error. */
export async function hapticTap(native: boolean, impact: () => Promise<void>): Promise<void> {
  if (!native) return;
  try {
    await impact();
  } catch {
    // The action still finishes. The tap is only a hint.
  }
}
