/** Where customers write to. It forwards to the team's inbox (Cloudflare Email Routing). */
export const SUPPORT_EMAIL = "support@hoppinclub.com";

/**
 * A link that opens the person's email app with the support address, a subject and a short note already in place.
 * Only what helps us find the problem goes in: the trip's name when there is one. Never an email address, a plan or a document.
 */
export function supportMailto(options: { subject?: string; trip?: string } = {}): string {
  const subject = options.subject ?? "Help with Hoppin";
  const lines = ["Hi Hoppin team,", "", "(Tell us what happened and what you expected. A screenshot helps.)", "", "---"];
  if (options.trip) lines.push(`Trip: ${options.trip}`);
  lines.push("Sent from the Hoppin app");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
