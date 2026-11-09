'use client';

import { formatLak, formatWeight } from '@/lib/format';
import { TableStateRow } from '@/components/query-state';
import type { TypeBalance } from '../types';

interface TypeBalanceTableProps {
  balances: TypeBalance[];
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  isAdmin: boolean;
  onView: (balance: TypeBalance) => void;
  onEdit: (balance: TypeBalance) => void;
}

export function TypeBalanceTable({
  balances,
  isError,
  error,
  onRetry,
  isAdmin,
  onView,
  onEdit,
}: TypeBalanceTableProps) {
  return (
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">ຍອດແຍກຕາມປະເພດຄຳ</h2>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="ຍອດແຍກຕາມປະເພດຄຳ">
        <table className="table">
          <thead>
            <tr>
              <th>ປະເພດຄຳ</th>
              <th className="text-right">ຕົ້ນທຶນຕັ້ງຕົ້ນ</th>
              <th className="text-right">ນໍ້າໜັກ (g) ຕັ້ງຕົ້ນ</th>
              <th className="text-right">ຄຳເຂົ້າ (g)</th>
              <th className="text-right">ຄຳອອກ (g)</th>
              <th className="text-right">ຕົ້ນທຶນເຂົ້າ</th>
              <th className="text-right">ຕົ້ນທຶนອອກ</th>
              <th className="text-right">ນໍ້າໜັກ (g) ຄົງເຫຼືອ</th>
              <th className="text-right">ຕົ້ນທຶນຄົງເຫຼືອ</th>
              <th className="text-right">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            <TableStateRow
              colSpan={10}
              isError={isError}
              error={error}
              isEmpty={balances.length === 0}
              emptyText="ຍັງບໍ່ມີຍອດໃນມື້ນີ້"
              onRetry={onRetry}
            />
            {balances.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.goldType.nameLo}</td>
                <td className="num text-right">{formatLak(row.openingCost)}</td>
                <td className="num text-right">{formatWeight(row.openingWeightG)}</td>
                <td className="num text-right text-success">{formatWeight(row.inG)}</td>
                <td className="num text-right text-danger">{formatWeight(row.outG)}</td>
                <td className="num text-right">{formatLak(row.priceIn)}</td>
                <td className="num text-right">{formatLak(row.priceOut)}</td>
                <td className="num text-right font-semibold">{formatWeight(row.closingWeightG)}</td>
                <td className="num text-right font-semibold">{formatLak(row.closingCost)}</td>
                <td className="text-right">
                  <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                    {/* View Button */}
                    <button
                      type="button"
                      className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/40 transition-colors"
                      title="ເບິ່ງລາຍລະອຽດຍອດປະເພດຄຳ"
                      aria-label={`View ${row.goldType.nameLo}`}
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
                        title="ແກ້ໄຂຍອດຕັ້ງຕົ້ນ (Opening Weight & Cost)"
                        aria-label={`Edit ${row.goldType.nameLo}`}
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        ນໍ້າໜັກ(g) ຄົງເຫຼືອ = ຕັ້ງຕົ້ນ + GOLD(g) IN − GOLD(g) OUT · ຕົ້ນທຶນຄົງເຫຼືອ =
        ຕົ້ນທຶນຕັ້ງຕົ້ນ + PRICE (IN) − PRICE (OUT) · ມື້ໃໝ່ຄົງເຫຼືອຈະກາຍເປັນຕັ້ງຕົ້ນ
      </p>
    </div>
  );
}

