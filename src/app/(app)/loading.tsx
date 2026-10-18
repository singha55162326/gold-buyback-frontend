/**
 * Shown while a route's code and data are still on the way.
 *
 * Skeleton rows rather than a spinner: the shape tells the reader a table is
 * coming and stops the page from flashing empty, which on a slow shop
 * connection reads as a page that failed.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="ກຳລັງໂຫຼດ">
      <div className="space-y-2">
        <div className="recessed h-8 w-56 rounded-lg" />
        <div className="recessed h-4 w-80 max-w-full rounded-lg" />
      </div>

      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="recessed h-3 w-24 rounded" />
            <div className="recessed mt-2 h-6 w-32 rounded" />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="recessed h-4 w-40 rounded" />
        </div>
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="recessed h-4 w-full rounded" />
          ))}
        </div>
      </div>

      <div className="flex justify-center" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--gold-icon)]" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
