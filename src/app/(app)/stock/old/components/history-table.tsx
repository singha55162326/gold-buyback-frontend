'use client';

import { formatDate, formatLak, formatWeight } from '@/lib/format';
import { TableStateRow } from '@/components/query-state';
import { DateRangeFilter } from '@/components/date-range';
import type { LedgerRow } from '../types';

interface HistoryTableProps {
  historyRange: any;
  history: LedgerRow[];
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  isAdmin: boolean;
  onView: (row: LedgerRow) => void;
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
}

export function HistoryTable({
  historyRange,
  history,
  isError,
  error,
  onRetry,
  isAdmin,
  onView,
  onEdit,
  onDelete,
}: HistoryTableProps) {
  return (
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">ປະຫວັດ Stock (OLD)</h2>
      </div>
      <DateRangeFilter history={historyRange} />
      <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Stock (OLD)">
        <table className="table">
          <thead>
            <tr>
              <th>ວັນທີ</th>
              <th>ແຫຼ່ງ</th>
              <th>ປະເພດຄຳ</th>
              <th>ປະເພດ</th>
              <th className="text-right">ຄຳເຂົ້າ (g)</th>
              <th className="text-right">ຄຳອອກ (g)</th>
              <th className="text-right">ນ້ຳໜັກ</th>
              <th className="text-right">ຕົ້ນທຶນເຂົ້າ</th>
              <th className="text-right">ຕົ້ນທຶນອອກ</th>
              <th className="text-right">ຕົ້ນທຶນ</th>
              <th>ຜູ້ບັນທຶກ</th>
              <th className="text-right">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            <TableStateRow
              colSpan={12}
              isError={isError}
              error={error}
              isEmpty={history.length === 0}
              emptyText="ຍັງບໍ່ມີລາຍການ"
              onRetry={onRetry}
            />
            {history.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.businessDate)}</td>
                <td>{row.partnerLabel ?? '—'}</td>
                <td>{row.goldType.nameLo}</td>
                <td className="text-muted">{row.typeLabel}</td>
                <td className="num text-right text-success">{formatWeight(row.goldInG)}</td>
                <td className="num text-right text-danger">{formatWeight(row.goldOutG)}</td>
                <td className="num text-right font-medium">{formatWeight(row.weightG)}</td>
                <td className="num text-right">{formatLak(row.priceIn)}</td>
                <td className="num text-right">{formatLak(row.priceOut)}</td>
                <td className="num text-right font-medium">{formatLak(row.cost)}</td>
                <td className="text-muted">{row.createdBy}</td>
                <td className="text-right">
                  <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                    {/* View Button */}
                    <button
                      type="button"
                      className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/40 transition-colors"
                      title="ເບິ່ງລາຍລະອຽດ"
                      aria-label={`View ${row.typeLabel}`}
                      onClick={() => onView(row)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                    {/* Edit Button */}
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--gold)] hover:bg-[var(--gold)]/10 transition-colors"
                        title="ແກ້ໄຂລາຍການ"
                        aria-label={`Edit ${row.typeLabel}`}
                        onClick={() => onEdit(row)}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}

                    {/* Delete Button */}
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-danger hover:bg-danger/10 transition-colors"
                        title="ລຶບລາຍການ"
                        aria-label={`Delete ${row.typeLabel}`}
                        onClick={() => onDelete(row)}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

