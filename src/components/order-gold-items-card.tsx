'use client';

import { formatWeight } from '@/lib/format';

export interface GoldBillLine {
  id: string;
  weightG: string;
  quantity: number;
  note?: string | null;
  goldItem?: { nameLo: string } | null;
}

interface OrderGoldItemsCardProps {
  lines?: GoldBillLine[];
  fallbackItemName?: string | null;
  totalWeightG: string;
  totalQuantity: number;
}

/**
 * ຕາຕະລາງ ລາຍການຄຳໃນບິນ ພ້ອມແຖວສະຫຼຸບ ລວມນ້ຳໜັກ ແລະ ລວມຈຳນວນ.
 */
export function OrderGoldItemsCard({
  lines,
  fallbackItemName,
  totalWeightG,
  totalQuantity,
}: OrderGoldItemsCardProps) {
  const hasLines = Boolean(lines && lines.length > 0);
  const itemCount = hasLines ? lines!.length : 1;

  return (
    <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-fg">
          <svg
            className="w-4 h-4 text-[var(--gold-icon)] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          ລາຍການຄຳໃນບິນ
        </div>
        <span className="text-xs text-muted font-medium">
          {itemCount} ລາຍການ
        </span>
      </div>

      <div className="table-wrap rounded-lg border border-line bg-surface">
        <table className="table text-sm">
          <thead>
            <tr>
              <th>ລາຍການ</th>
              <th className="text-right">ນ້ຳໜັກ (g)</th>
              <th className="text-right">ຈຳນວນ</th>
            </tr>
          </thead>
          <tbody>
            {!hasLines ? (
              <tr>
                <td className="font-medium text-fg">{fallbackItemName ?? '—'}</td>
                <td className="num text-right">{formatWeight(totalWeightG)}</td>
                <td className="num text-right">{totalQuantity}</td>
              </tr>
            ) : (
              lines!.map((line) => (
                <tr key={line.id}>
                  <td>
                    <span className="font-medium text-fg">{line.goldItem?.nameLo ?? '—'}</span>
                    {line.note && <span className="block text-xs text-muted">{line.note}</span>}
                  </td>
                  <td className="num text-right">{formatWeight(line.weightG)}</td>
                  <td className="num text-right">{line.quantity}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-recessed/60 font-semibold text-fg-strong">
              <td className="border-b-0">ລວມທັງໝົດ</td>
              <td className="num text-right border-b-0">
                <span className="text-xs font-normal text-muted mr-1.5">ລວມນ້ຳໜັກ:</span>
                {formatWeight(totalWeightG)} g
              </td>
              <td className="num text-right border-b-0">
                <span className="text-xs font-normal text-muted mr-1.5">ລວມຈຳນວນ:</span>
                {totalQuantity} ອັນ
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
