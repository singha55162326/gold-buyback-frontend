'use client';

import { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Client-side paging for a list already held in memory.
 *
 * Every table in this system is fetched whole (the API caps history at a few
 * hundred rows), so paging here costs nothing and avoids a round trip per
 * page. If a ledger ever outgrows that, the swap is to a server `?page=`
 * without touching the call sites — they only read `pageItems`.
 */
export function usePagination<T>(items: T[], initialSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(initialSize);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Deleting the last row of the last page must not strand the viewer on an
  // empty page, and a new filter must start from the top.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [items, page, pageSize],
  );

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return {
    page,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    pageCount,
    pageItems,
    total,
    from,
    to,
    reset: () => setPage(1),
  };
}

export type PaginationState = ReturnType<typeof usePagination<unknown>>;

/** Page numbers with ellipses: 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pageCount - 1) out.push('…');
  out.push(pageCount);
  return out;
}

interface Props {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  /** Hide the rows-per-page control on small embedded tables. */
  compact?: boolean;
}

/**
 * The pager strip. Sits inside the card, under the table, so it scrolls with
 * the card rather than floating over the data.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  from,
  to,
  setPage,
  setPageSize,
  compact = false,
}: Props) {
  // One page of results needs no controls — but the count still reassures.
  if (total === 0) return null;

  return (
    <div className="pager">
      <div className="num">
        {from}–{to} ຈາກ {total.toLocaleString('en-US')} ລາຍການ
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!compact && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            ຕໍ່ໜ້າ
            <select
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="ຈຳນວນແຖວຕໍ່ໜ້າ"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        {pageCount > 1 && (
          <nav className="flex items-center gap-1" aria-label="ແບ່ງໜ້າ">
            <button
              type="button"
              className="pager-btn"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              aria-label="ໜ້າກ່ອນ"
            >
              ‹
            </button>

            {pageWindow(page, pageCount).map((n, i) =>
              n === '…' ? (
                <span key={`gap-${i}`} className="px-1 text-slate-400">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={`pager-btn num ${n === page ? 'pager-btn-active' : ''}`}
                  onClick={() => setPage(n)}
                  aria-current={n === page ? 'page' : undefined}
                >
                  {n}
                </button>
              ),
            )}

            <button
              type="button"
              className="pager-btn"
              onClick={() => setPage(page + 1)}
              disabled={page >= pageCount}
              aria-label="ໜ້າຕໍ່ໄປ"
            >
              ›
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
