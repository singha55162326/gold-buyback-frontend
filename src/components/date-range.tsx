'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, getStoredUser } from '@/lib/api';

/** What every paginated history endpoint returns. */
export interface PagedResult<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  fromDate: string;
  toDate: string;
}

/** The server's ceiling for `all=true` — keep in step with MAX_EXPORT_ROWS. */
const MAX_ROWS = 5000;

/** Today as YYYY-MM-DD in the shop's local time, never UTC. */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * A Valuer only ever sees the current day. The API enforces that — hiding a
 * control is not a permission — but showing a date picker that silently does
 * nothing is worse than showing none.
 */
export function canPickDates(): boolean {
  return getStoredUser()?.role !== 'VALUER';
}

interface Options {
  /** Extra query params merged into the request, e.g. `{ status: 'HELD' }`. */
  params?: Record<string, string | number | undefined>;
  enabled?: boolean;
}

/**
 * Loads one date range of a history endpoint, whole.
 *
 * Paging is left to the client on purpose. The range is already the limit —
 * that is the point of the ຈາກວັນທີ–ຫາວັນທີ filter — and a day of counter
 * activity is a small list. Fetching it once keeps the search box and the
 * pager instant, where server paging would make the search box filter only
 * the page you happen to be looking at, which reads as a bug.
 *
 * The server caps the response, and `truncated` says so rather than quietly
 * showing a partial ledger as if it were the whole thing.
 */
export function useHistoryRange<T>(queryKey: unknown[], path: string, options: Options = {}) {
  const { params = {}, enabled = true } = options;

  const [draftFrom, setDraftFrom] = useState(today());
  const [draftTo, setDraftTo] = useState(today());
  // Applied values lag the inputs: a range is two fields, and firing between
  // them would request a window nobody asked for.
  const [applied, setApplied] = useState({ from: today(), to: today() });

  const search = new URLSearchParams({
    from_date: applied.from,
    to_date: applied.to,
    all: 'true',
  });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }

  const query = useQuery({
    queryKey: [...queryKey, applied.from, applied.to, params],
    queryFn: () => api.get<PagedResult<T>>(`${path}?${search.toString()}`),
    enabled,
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const rows = data?.rows ?? [];

  return {
    rows,
    /**
     * The whole response. Some endpoints carry more than the page — ຝາກສິນຄ້າ
     * returns `totals` for the range alongside the rows — and those readers
     * need the envelope, not just what is inside it.
     */
    data,
    total: data?.total ?? 0,
    truncated: (data?.total ?? 0) > rows.length,
    maxRows: MAX_ROWS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    // Surfaced for <TableStateRow>, which tells a failed GET apart from
    // "no rows in this range".
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),

    from: data?.fromDate ?? applied.from,
    to: data?.toDate ?? applied.to,
    draftFrom,
    draftTo,
    setDraftFrom,
    setDraftTo,
    apply: () => setApplied({ from: draftFrom, to: draftTo }),
    reset: () => {
      setDraftFrom(today());
      setDraftTo(today());
      setApplied({ from: today(), to: today() });
    },
    isToday: applied.from === today() && applied.to === today(),
  };
}

export type HistoryRangeState<T> = ReturnType<typeof useHistoryRange<T>>;

/**
 * ຈາກວັນທີ – ຫາວັນທີ, applied with an explicit ຄົ້ນຫາ button because each
 * apply is a request.
 */
export function DateRangeFilter<T>({
  history,
  labelLo = 'ວັນທີ',
}: {
  history: HistoryRangeState<T>;
  labelLo?: string;
}) {
  if (!canPickDates()) {
    return (
      <div className="filter-bar">
        <span className="filter-select-label">ສະແດງສະເພາະລາຍການພາຍໃນມື້ນີ້</span>
      </div>
    );
  }

  const dirty = history.draftFrom !== history.from || history.draftTo !== history.to;

  return (
    <div className="filter-bar">
      <div className="filter-dates">
        <span className="filter-select-label">{labelLo}</span>
        <input
          className="filter-date"
          type="date"
          value={history.draftFrom}
          max={history.draftTo || undefined}
          onChange={(e) => history.setDraftFrom(e.target.value)}
          aria-label="ຈາກວັນທີ"
        />
        <span className="filter-sep">–</span>
        <input
          className="filter-date"
          type="date"
          value={history.draftTo}
          min={history.draftFrom || undefined}
          onChange={(e) => history.setDraftTo(e.target.value)}
          aria-label="ຫາວັນທີ"
        />
        <button
          type="button"
          className="btn-secondary h-9 py-0"
          onClick={history.apply}
          disabled={!dirty || history.isFetching}
        >
          ຄົ້ນຫາ
        </button>
        {!history.isToday && (
          <button type="button" className="filter-clear" onClick={history.reset}>
            ລ້າງ
          </button>
        )}
      </div>

      <div className="filter-tail">
        {history.truncated && (
          <span className="text-xs font-medium text-warning">
            ເກີນ {history.maxRows.toLocaleString('en-US')} ແຖວ — ແຄບຊ່ວງວັນທີລົງ
          </span>
        )}
        <span className="filter-note">
          {history.isFetching ? 'ກຳລັງໂຫຼດ...' : `${history.total.toLocaleString('en-US')} ລາຍການ`}
        </span>
      </div>
    </div>
  );
}
