'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/page-head';
import { api } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';
import { formatMoney, formatWeight, formatByCurrency } from '@/lib/format';
import { canPickDates, today } from '@/components/date-range';

interface Coh {
  cash: Array<{
    currency: 'LAK' | 'THB' | 'USD';
    cash: string; bcel: string; ldb: string; otherBank: string;
    ap: string; ar: string; coh: string;
  }>;
  gold: { newG: string; oldG: string; apG: string; arG: string; cohG: string; cohBaht: string };
}

/** TOR §3.7 — COH Cash ແລະ COH Gold. */
export default function CohPage() {
  /*
   * COH ເປັນຍອດ "ຢູ່ເວລາໜຶ່ງ" ບໍ່ແມ່ນປະຫວັດ, ສະນັ້ນ filter ຈຶ່ງເປັນວັນທີດຽວ
   * (ຢູ່ວັນທີ...) ບໍ່ແມ່ນ ຈາກ–ຫາ: ຊ່ວງວັນທີຂອງຍອດຄົງເຫຼືອ ບໍ່ມີຄວາມໝາຍ.
   */
  const [draft, setDraft] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const isToday = asOf === today();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['ledger', 'coh', asOf],
    queryFn: () => api.get<Coh>(isToday ? '/ledger/coh' : `/ledger/coh?as_of=${asOf}`),
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="COH — Cash & Gold On Hand"
        subtitle="ຍອດເງິນ ແລະ ຄຳທີ່ຖືຢູ່ຈິງ ຫຼັງຫັກ AP ແລະ ບວກ AR (TOR §3.7)"
      />

      {canPickDates() && (
        <div className="filter-bar">
          <div className="filter-dates">
            <span className="filter-select-label">ຢູ່ວັນທີ</span>
            <input className="filter-date" type="date" aria-label="ຢູ່ວັນທີ"
              value={draft} max={today()} onChange={(e) => setDraft(e.target.value)} />
            <button type="button" className="btn-secondary h-9 py-0"
              disabled={!draft || draft === asOf || isFetching}
              onClick={() => setAsOf(draft)}>
              ຄົ້ນຫາ
            </button>
            {!isToday && (
              <button type="button" className="filter-clear"
                onClick={() => { setDraft(today()); setAsOf(today()); }}>
                ລ້າງ
              </button>
            )}
          </div>
          <div className="filter-tail">
            <span className="num text-xs text-slate-500">
              {isFetching ? 'ກຳລັງໂຫຼດ...' : isToday ? 'ຍອດມື້ນີ້' : `ຍອດ ຢູ່ ${asOf}`}
            </span>
          </div>
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">COH Cash</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="COH Cash">
          <table className="table">
            <thead>
              <tr>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ເງິນສົດ</th>
                <th className="text-right">BCEL</th>
                <th className="text-right">LDB</th>
                <th className="text-right">ທະນາຄານອື່ນ</th>
                <th className="text-right">AP (−)</th>
                <th className="text-right">AR (+)</th>
                <th className="text-right">COH Cash</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={8} isLoading={isLoading} isError={isError} error={error} isEmpty={false} emptyText="" onRetry={() => void refetch()} />
              {data?.cash.map((row) => (
                <tr key={row.currency}>
                  <td className="font-medium">{row.currency}</td>
                  <td className="num text-right">{formatByCurrency(row.cash, row.currency)}</td>
                  <td className="num text-right">{formatByCurrency(row.bcel, row.currency)}</td>
                  <td className="num text-right">{formatByCurrency(row.ldb, row.currency)}</td>
                  <td className="num text-right">{formatByCurrency(row.otherBank, row.currency)}</td>
                  <td className="num text-right text-danger">{formatByCurrency(row.ap, row.currency)}</td>
                  <td className="num text-right text-success">{formatByCurrency(row.ar, row.currency)}</td>
                  <td className="num text-right font-semibold">{formatByCurrency(row.coh, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          COH Cash = Cash + BCEL + LDB + Other Bank − AP + AR
        </p>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">COH Gold</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="COH Gold">
          <table className="table">
            <thead>
              <tr>
                <th className="text-right">ຄຳໃໝ່ (g)</th>
                <th className="text-right">ຄຳເກົ່າ (g)</th>
                <th className="text-right">AP (g)</th>
                <th className="text-right">AR (g)</th>
                <th className="text-right">COH Gold (g)</th>
                <th className="text-right">ບາດຄຳ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={6} isError={isError} error={error} isEmpty={false} emptyText="" onRetry={() => void refetch()} />
              {data && (
                <tr>
                  <td className="num text-right">{formatWeight(data.gold.newG)}</td>
                  <td className="num text-right">{formatWeight(data.gold.oldG)}</td>
                  <td className="num text-right text-danger">{formatWeight(data.gold.apG)}</td>
                  <td className="num text-right text-success">{formatWeight(data.gold.arG)}</td>
                  <td className="num text-right font-semibold">{formatWeight(data.gold.cohG)}</td>
                  <td className="num text-right">{formatWeight(data.gold.cohBaht)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          COH Gold = Gold NEW(g) + Gold OLD(g) − AP + AR
        </p>
      </div>
    </div>
  );
}
