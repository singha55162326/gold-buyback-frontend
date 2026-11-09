'use client';

import { useMemo } from 'react';
import { dec } from '@kpv/domain';
import { formatDate, formatLak, formatWeight } from '@/lib/format';
import { TableStateRow } from '@/components/query-state';
import { DateRangeFilter, type HistoryRangeState } from '@/components/date-range';
import type { LedgerRow } from '../types';

interface HistoryTableProps {
  historyRange: HistoryRangeState<LedgerRow>;
  history: LedgerRow[];
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  isAdmin: boolean;
  onView: (row: LedgerRow) => void;
  onEdit: (row: LedgerRow) => void;
  goldTypes?: Array<{ id: string; nameLo: string }>;
  selectedGoldTypeId?: string;
  onGoldTypeChange?: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
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
  goldTypes,
  selectedGoldTypeId,
  onGoldTypeChange,
  searchQuery,
  onSearchChange,
}: HistoryTableProps) {
  // Group rows that belong to the same stock movement into a single consolidated row
  const displayRows = useMemo(() => {
    const groups: Array<LedgerRow & { groupedCount: number; goldTypesSummary: string }> = [];
    const movementMap = new Map<string, LedgerRow[]>();
    const order: Array<{ key: string; isMovement: boolean; singleRow?: LedgerRow }> = [];

    for (const row of history) {
      if (row.movementId) {
        if (!movementMap.has(row.movementId)) {
          movementMap.set(row.movementId, []);
          order.push({ key: row.movementId, isMovement: true });
        }
        movementMap.get(row.movementId)!.push(row);
      } else {
        order.push({ key: row.id, isMovement: false, singleRow: row });
      }
    }

    for (const item of order) {
      if (!item.isMovement && item.singleRow) {
        groups.push({
          ...item.singleRow,
          groupedCount: 1,
          goldTypesSummary: item.singleRow.goldType?.nameLo ?? '—',
        });
      } else if (item.isMovement) {
        const rows = movementMap.get(item.key) ?? [];
        if (rows.length === 0) continue;
        if (rows.length === 1) {
          groups.push({
            ...rows[0],
            groupedCount: 1,
            goldTypesSummary: rows[0].goldType?.nameLo ?? '—',
          });
          continue;
        }

        // Multiple rows belonging to the same movement
        const first = rows[0];
        let totalGoldIn = dec(0);
        let totalGoldOut = dec(0);
        let totalPriceIn = dec(0);
        let totalPriceOut = dec(0);
        const uniqueTypes = new Set<string>();

        for (const r of rows) {
          totalGoldIn = totalGoldIn.plus(dec(r.goldInG || 0));
          totalGoldOut = totalGoldOut.plus(dec(r.goldOutG || 0));
          totalPriceIn = totalPriceIn.plus(dec(r.priceIn || 0));
          totalPriceOut = totalPriceOut.plus(dec(r.priceOut || 0));
          if (r.goldType?.nameLo) {
            uniqueTypes.add(r.goldType.nameLo);
          }
        }

        const typesList = Array.from(uniqueTypes);
        const goldTypesSummary =
          typesList.length > 0 ? typesList.join(', ') : (first.goldType?.nameLo ?? '—');

        groups.push({
          ...first,
          goldInG: totalGoldIn.toFixed(),
          goldOutG: totalGoldOut.toFixed(),
          priceIn: totalPriceIn.toFixed(),
          priceOut: totalPriceOut.toFixed(),
          goldType: {
            ...first.goldType,
            nameLo: goldTypesSummary,
          },
          groupedCount: rows.length,
          goldTypesSummary,
        });
      }
    }

    return groups;
  }, [history]);

  return (
    <div data-fade className="card">
      <div className="card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="card-title">ປະຫວັດ Stock (OLD)</h2>
        <div className="flex flex-wrap items-center gap-2">
          {goldTypes && goldTypes.length > 0 && onGoldTypeChange && (
            <select
              className="filter-date text-xs h-8 py-0"
              value={selectedGoldTypeId ?? ''}
              onChange={(e) => onGoldTypeChange(e.target.value)}
              aria-label="ກອງຕາມປະເພດຄຳ"
            >
              <option value="">— ທຸກປະເພດຄຳ —</option>
              {goldTypes.map((gt) => (
                <option key={gt.id} value={gt.id}>
                  {gt.nameLo}
                </option>
              ))}
            </select>
          )}
          {onSearchChange && (
            <input
              type="search"
              placeholder="ຄົ້ນຫາ (ແຫຼ່ງ / ປະເພດ / ລະຫັດ)..."
              className="filter-date text-xs h-8 px-2 w-44 sm:w-56"
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="ຄົ້ນຫາປະຫວັດ Stock"
            />
          )}
        </div>
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
              isEmpty={displayRows.length === 0}
              emptyText="ຍັງບໍ່ມີລາຍການ"
              onRetry={onRetry}
            />
            {displayRows.map((row) => {
              const isExternalSystemRow =
                !row.movementId &&
                (row.typeLabel.startsWith('Buyback') ||
                  row.typeLabel.startsWith('Exchange') ||
                  row.typeLabel.startsWith('Handover') ||
                  row.typeLabel.startsWith('ມອບຄຳ'));

              return (
                <tr key={row.movementId ?? row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td>{row.partnerLabel ?? '—'}</td>
                  <td>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{row.goldTypesSummary}</span>
                      {row.groupedCount > 1 && (
                        <span className="inline-flex items-center text-[10px] py-0 px-1.5 rounded-full bg-line/60 text-muted font-normal">
                          {row.groupedCount} ລາຍການ
                        </span>
                      )}
                    </div>
                  </td>
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
                        title={
                          row.groupedCount > 1
                            ? `ເບິ່ງລາຍລະອຽດທັງໝົດ (${row.groupedCount} ລາຍການ)`
                            : 'ເບິ່ງລາຍລະອຽດ'
                        }
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
                          className={`btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                            isExternalSystemRow
                              ? 'opacity-30 cursor-not-allowed text-muted'
                              : 'text-[var(--gold)] hover:bg-[var(--gold)]/10'
                          }`}
                          title={
                            isExternalSystemRow
                              ? 'ລາຍການມາຈາກລະບົບຕົ້ນທາງ (Buyback/Exchange) — ບໍ່ສາມາດແກ້ໄຂຈາກໜ້ານີ້ໄດ້'
                              : 'ແກ້ໄຂລາຍການ'
                          }
                          aria-label={`Edit ${row.typeLabel}`}
                          disabled={isExternalSystemRow}
                          onClick={() => !isExternalSystemRow && onEdit(row)}
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

