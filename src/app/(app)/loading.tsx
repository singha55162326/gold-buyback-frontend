/**
 * Shown while a route's code and data are still on the way.
 *
 * Skeleton rows rather than a spinner: the shape tells the reader a table is
 * coming and stops the canvas from flashing empty, which on a slow shop
 * connection reads as a page that failed.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="ກຳລັງໂຫຼດ">
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded-md bg-slate-200" />
        <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-6 w-32 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
