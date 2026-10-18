'use client';

import { useQuery } from '@tanstack/react-query';
import { Pagination, usePagination } from '@/components/pagination';
import { PageHead } from '@/components/page-head';
import { api } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/format';

interface ApArRow {
  side: 'AP' | 'AR';
  currency: 'LAK' | 'THB' | 'USD';
  opening: string; increases: string; decreases: string; net: string;
}

interface HistoryRow {
  id: string; side: 'AP' | 'AR'; refType: string; businessDate: string;
  currency: string; amountIn: string; amountOut: string; balance: string; note: string | null;
}

const SIDE_LABEL = {
  AP: 'AP (Cash) — ໜີ້ຕ້ອງສົ່ງ / ມັດຈໍາຮັບລ່ວງໜ້າ',
  AR: 'AR (Cash) — ໜີ້ຕ້ອງຮັບ',
} as const;

/** TOR §9 — AP/AR (Cash). */
export default function ApArCashPage() {
  const { data = [] } = useQuery({
    queryKey: ['ledger', 'ap-ar', 'cash'],
    queryFn: () => api.get<ApArRow[]>('/ledger/ap-ar/cash'),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['ledger', 'ap-ar', 'cash', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/ledger/ap-ar/cash/history'),
  });

  const pager = usePagination(history);


  return (
    <div className="space-y-6">
      <PageHead
        title="AP-AR (Cash)"
        subtitle="ໜີ້ຕ້ອງສົ່ງ / ໜີ້ຕ້ອງຮັບ ເປັນເງິນສົດ ແຍກຕາມສະກຸນເງິນ (TOR §9)"
      />

      {(['AP', 'AR'] as const).map((side) => (
        <div key={side} data-fade className="card">
          <div className="card-header"><h2 className="card-title">{SIDE_LABEL[side]}</h2></div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={SIDE_LABEL[side]}>
            <table className="table">
              <thead>
                <tr>
                  <th>ສະກຸນເງິນ</th>
                  <th className="text-right">ຍອດຕັ້ງຕົ້ນ</th>
                  <th className="text-right">ຍອດເພີ່ມ (+)</th>
                  <th className="text-right">ຍອດຫຼຸດ (−)</th>
                  <th className="text-right">ຍອດສຸດທິ</th>
                </tr>
              </thead>
              <tbody>
                {data.filter((r) => r.side === side).map((row) => (
                  <tr key={row.currency}>
                    <td className="font-medium">{row.currency}</td>
                    <td className="num text-right">{formatMoney(row.opening)}</td>
                    <td className="num text-right text-success">{formatMoney(row.increases)}</td>
                    <td className="num text-right text-danger">{formatMoney(row.decreases)}</td>
                    <td className="num text-right font-semibold">{formatMoney(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ AP-AR (Cash)</h2>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ AP-AR (Cash)">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ດ້ານ</th>
                <th>ປະເພດ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ເພີ່ມ (+)</th>
                <th className="text-right">ຫຼຸດ (−)</th>
                <th className="text-right">ຍອດສະສົມ</th>
                <th>ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td><span className={row.side === 'AP' ? 'status-danger' : 'status-success'}>{row.side}</span></td>
                  <td className="text-muted">{row.refType}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right">{formatMoney(row.amountIn)}</td>
                  <td className="num text-right">{formatMoney(row.amountOut)}</td>
                  <td className="num text-right font-medium">{formatMoney(row.balance)}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}
