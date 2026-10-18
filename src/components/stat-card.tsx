/**
 * Headline number card. `value` containing " / " (e.g. "650 / 640") renders the
 * second half smaller and muted. The value never clips silently: it stays on one
 * line with a responsive size, and `title` carries the full text. The corner glow
 * lives in its own clipped layer so the card itself can never cut a long value.
 */
export function StatCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Gold value text instead of the default strong foreground. */
  accent?: boolean;
}) {
  const [main, rest] = value.includes(' / ') ? value.split(/ \/ (.*)/s) : [value, null];
  return (
    <div data-fade className="card relative p-5">
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <span className="stat-glow" />
      </span>
      <div className="section-label relative">{label}</div>
      <div
        title={value}
        className={`num relative mt-2 whitespace-nowrap text-[20px] font-semibold leading-snug sm:text-[22px] xl:text-[26px] ${
          accent ? 'text-gold' : 'text-fg-strong'
        }`}
      >
        {main}
        {rest !== null && rest !== undefined && (
          <span className="text-[14px] font-medium text-muted xl:text-[15px]"> / {rest}</span>
        )}
      </div>
      {sub && <div className="relative mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
