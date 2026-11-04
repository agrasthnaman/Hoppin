/** A trip-page title: light display type, an italic date when there is one, and a short line under it. */
export function PageHeading({
  title,
  date,
  lede,
  aside,
}: {
  title: string;
  date?: string;
  lede?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="page-title text-5xl">{title}</h1>
        {date && <p className="editorial mt-2 text-2xl">{date}</p>}
        {lede && <p className="mt-2 max-w-prose text-sm font-light leading-relaxed text-muted">{lede}</p>}
      </div>
      {aside}
    </div>
  );
}
