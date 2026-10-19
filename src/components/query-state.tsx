import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

/**
 * Query state helpers: tell a failed GET apart from "no data".
 *
 * Usage:
 *  - Table backed by useQuery: put it first inside <tbody>, replacing the old
 *    loading/empty rows:
 *      <TableStateRow colSpan={n} isLoading={q.isLoading} isError={q.isError}
 *        error={q.error} isEmpty={rows.length === 0}
 *        emptyText="<existing empty text>" onRetry={() => void q.refetch()} />
 *  - Precedence is error, then loading, then empty; it renders null otherwise.
 *  - Keep the page's own emptyText and colSpan unchanged; pass `dense` where
 *    the old empty row used py-6 instead of py-8.
 *  - Non-table areas (stat cards, panels): render <QueryErrorNotice error onRetry />
 *    when isError.
 *  - Mutation errors stay on toast.error('ບໍ່ສຳເລັດ', detail); do not use this for them.
 */

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : ((error as Error | null | undefined)?.message ?? '');
}

export function QueryErrorNotice({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const message = messageOf(error);
  return (
    <div role="alert" className="notice status-danger flex-wrap items-center justify-between gap-3">
      <span>ບໍ່ສຳເລັດ{message ? ` — ${message}` : ''}</span>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          ລອງໃໝ່
        </button>
      )}
    </div>
  );
}

export function TableStateRow({
  colSpan,
  isLoading,
  isError,
  error,
  isEmpty,
  emptyText,
  onRetry,
  dense = false,
}: {
  colSpan: number;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty: boolean;
  emptyText: ReactNode;
  onRetry?: () => void;
  /** Use py-6 (compact tables) instead of py-8 for the empty row. */
  dense?: boolean;
}) {
  if (isError) {
    return (
      <tr>
        <td colSpan={colSpan} className="py-6">
          <QueryErrorNotice error={error} onRetry={onRetry} />
        </td>
      </tr>
    );
  }
  if (isLoading) {
    return (
      <tr>
        <td colSpan={colSpan} className="py-6 text-center text-muted">
          ກຳລັງໂຫຼດ...
        </td>
      </tr>
    );
  }
  if (isEmpty) {
    return (
      <tr>
        <td colSpan={colSpan} className={`${dense ? 'py-6' : 'py-8'} text-center text-muted`}>
          {emptyText}
        </td>
      </tr>
    );
  }
  return null;
}
