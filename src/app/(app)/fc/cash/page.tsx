'use client';

import { Pagination, usePagination } from '@/components/pagination';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';

interface Balance { currency: 'LAK' | 'THB' | 'USD'; inflow: string; outflow: string; balance: string }
interface Row {
  /** ຜູ້ລົງລາຍການ — ມາຈາກ API. */
  createdBy: string;
  id: string; type: string; currency: string; amount: string;
  refType: string | null; note: string | null; createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  IN: 'ຮັບເຂົ້າ',
  OUT: 'ຈ່າຍອອກ',
  OTHER_INCOME: 'ລາຍຮັບອື່ນ',
  OTHER_EXPENSE: 'ລາຍຈ່າຍອື່ນ',
};

/** TOR §3.7 — Module Cash. */
export default function FcCashPage() {
  const balancesQuery = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<Balance[]>('/cash/balances'),
  });
  const balances = balancesQuery.data ?? [];
  const history = useHistoryRange<Row>(['cash', 'history'], '/cash/history');
  const rows = history.rows;

  const pager = usePagination(rows);


  return (
    <div className="space-y-6">
      <PageHead
        title="Module Cash"
        subtitle="ຍອດເງິນສົດຄົງເຫຼືອ ແລະ ການເຄື່ອນໄຫວເງິນສົດໃນມື້ (TOR §3.7)"
      />

      {balancesQuery.isError && (
        <QueryErrorNotice error={balancesQuery.error} onRetry={() => void balancesQuery.refetch()} />
      )}

      <div className="stat-grid">
        {balances.map((b) => (
          <StatCard
            key={b.currency}
            label={`ຍອດຄົງເຫຼືອ ${b.currency}`}
            value={formatByCurrency(b.balance, b.currency)}
            sub={`(+) ${formatByCurrency(b.inflow, b.currency)} · (−) ${formatByCurrency(b.outflow, b.currency)}`}
          />
        ))}
      </div>

      {/* ຕັດຫ້ອງບັນທຶກເງິນສົດອອກ: cash now only moves as a side effect of a
          real transaction — buyback, exchange, ລາຍຮັບລາຍຈ່າຍ, ເບີກ/ມອບເງິນ —
          so every row here can be traced back to what caused it. */}

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Cash</h2></div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Cash">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ປະເພດ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຈຳນວນເງິນ</th>
                <th>ອ້າງອີງ</th>
                <th>ໝາຍເຫດ</th>
                <th>ຜູ້ບັນທຶກ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={7}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={history.refetch}
              />
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{TYPE_LABEL[row.type] ?? row.type}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatByCurrency(row.amount, row.currency)}</td>
                  <td className="text-muted">{row.refType ?? '—'}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
                  <td className="text-muted">{row.createdBy}</td>
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

