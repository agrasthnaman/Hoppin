const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m: m - 1, d };
}

const full = (date: string) => {
  const { y, m, d } = parts(date);
  return `${d} ${MONTHS[m]} ${y}`;
};

/** A trip's dates for a list: "1–5 Dec 2026", "28 Nov – 2 Dec 2026", "From 1 Dec 2026" or "Dates not set". */
export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "Dates not set";
  if (!end) return `From ${full(start)}`;
  if (start === end) return full(start);
  const a = parts(start);
  const b = parts(end);
  if (a.y !== b.y) return `${full(start)} – ${full(end)}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${a.y}`;
  return `${a.d}–${b.d} ${MONTHS[a.m]} ${a.y}`;
}
