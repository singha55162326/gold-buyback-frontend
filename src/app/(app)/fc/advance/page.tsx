'use client';

import { Fragment, useState } from 'react';
import { Pagination, usePagination } from '@/components/pagination';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { formatMoney, formatWeight, formatDate, formatByCurrency, formatLak } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { StatCard } from '@/components/stat-card';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';

interface Summary {
  totals: Array<{ currency: 'LAK' | 'THB' | 'USD'; net: string }>;
  billCount: number;
}

interface Row {
  id: string;
  businessDate: string;
  currency: string;
  amountIn: string;
  amountOut: string;
  balance: string;
  /** ຍອດຄົງເຫຼືອຮັບ ຂອງ Order ທີ່ແຖວນີ້ຜູກຢູ່. */
  outstandingAmount: string;
  /** ຍອດເງິນສຸດທິ = ໄດ້ຮັບ − ຄົງເຫຼືອຮັບ − ຕັດຊຳລະ (ຄຳນວນຢູ່ server). */
  netAmount: string;
  method: string | null;
  note: string | null;
  /** ຜູ້ບັນທຶກລາຍການນີ້. */
  createdBy: string;
  order: {
    id: string; code: string; billNo: string; productType: string;
    staffName: string; weightG: string; quantity: number;
    totalAmount: string; balanceAmount: string; status: string;
    receivedFromSmithAt: string | null; customerPickupAt: string | null;
    customer: { phone: string };
    goldItem?: { nameLo: string } | null;
    supplier?: { nameLo: string } | null;
  };
  bankAccount: { nameLo: string } | null;
}

/**
 * TOR §7 — Module Advace.
 *
 * ເງິນມັດຈໍາ Order ຮັບລ່ວງໜ້າ has its own ledger in the updated TOR, separate
 * from AP (Cash). COH Cash subtracts the net, so a deposit sitting in the
 * drawer never reads as the shop's own money.
 */
export default function AdvancePage() {
  const [viewing, setViewing] = useState<string | null>(null);
  const summaryQuery = useQuery({
    queryKey: ['finance', 'advance'],
    queryFn: () => api.get<Summary>('/finance/advance'),
  });
  const summary = summaryQuery.data;
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; ກວ້າງອອກໄດ້ຈາກແຖບ filter.
  const history = useHistoryRange<Row>(['finance', 'advance', 'history'], '/finance/advance/history');
  const rows = history.rows;

  const pager = usePagination(rows);


  return (
    <div className="space-y-6">
      <PageHead
        title="Module Advace"
        subtitle="ເງິນມັດຈໍາ Order ຮັບລ່ວງໜ້າ — ຫັກອອກຈາກ COH Cash ຈົນກວ່າລູກຄ້າຮັບເຄື່ອງ (TOR §7)"
      />

      {summaryQuery.isError && (
        <QueryErrorNotice error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
      )}

      <div className="stat-grid">
        {(summary?.totals ?? []).map((t) => (
          <StatCard key={t.currency} label={`ລວມຍອດເງິນ Advace (${t.currency})`} value={formatByCurrency(t.net, t.currency)} />
        ))}
        <StatCard
          label="ລວມຈຳນວນບິນ"
          value={String(summary?.billCount ?? '—')}
          sub="Order ທີ່ຍັງບໍ່ Completed"
        />
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Module Advace</h2></div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Module Advace">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ Order</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ເລກບິນ</th>
                <th>ປະເພດສິນຄ້າ</th>
                <th className="text-right">ຍອດເງິນທີ່ໄດ້ຮັບ</th>
                <th className="text-right">ຍອດຄົງເຫຼືອຮັບ</th>
                <th className="text-right">ຍອດເງິນຕັດຊຳລະ</th>
                <th className="text-right">ຍອດເງິນສຸດທິ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={12}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void history.refetch()}
              />
              {pager.pageItems.map((row) => (
                <Fragment key={row.id}>
                <tr>
                  <td className="font-mono text-xs">{row.order.code}</td>
                  <td>{formatDate(row.businessDate)}</td>
                  <td className="num">{row.order.customer.phone}</td>
                  <td className="font-mono text-xs">{row.order.billNo}</td>
                  <td>{row.order.productType}</td>
                  <td className="num text-right text-success">{formatByCurrency(row.amountIn, row.currency)}</td>
                  <td className="num text-right">{formatLak(row.outstandingAmount)}</td>
                  <td className="num text-right text-danger">{formatByCurrency(row.amountOut, row.currency)}</td>
                  <td className="num text-right font-medium">{formatLak(row.netAmount)}</td>
                  <td>
                    <span className={
                      statusClass(row.order.status)
                    }>{row.order.status}</span>
                  </td>
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-right">
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      {Number(row.order.balanceAmount) > 0 && (
                        <Link href="/fc/orders" className="btn-ghost text-success" aria-label={`Payment ${row.order.code}`}>
                          Payment
                        </Link>
                      )}
                      <button className="btn-ghost" aria-expanded={viewing === row.id}
                        aria-label={`View ${row.order.code}`}
                        onClick={() => setViewing(viewing === row.id ? null : row.id)}>
                        View
                      </button>
                    </div>
                  </td>
                </tr>
                {viewing === row.id && (
                  <tr>
                    <td colSpan={12} className="bg-recessed p-4">
                      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                        <F labelLo="ຊື່ພະນັກງານທີ່ຮັບ Order" value={row.order.staffName} />
                        <F labelLo="ສະກຸນເງິນ" value={row.currency} />
                        <F labelLo="ຮູບແບບຈ່າຍ" value={row.method ?? '—'} />
                        <F labelLo="ທະນາຄານ" value={row.bankAccount?.nameLo ?? '—'} />
                        <F labelLo="ຍອດສະສົມ Advance" value={formatByCurrency(row.balance, row.currency)} />
                        <F labelLo="ລາຍການ" value={row.order.goldItem?.nameLo ?? '—'} />
                        <F labelLo="ນ້ຳໜັກ (g)" value={formatWeight(row.order.weightG)} />
                        <F labelLo="ຈຳນວນ" value={String(row.order.quantity)} />
                        <F labelLo="Supplier" value={row.order.supplier?.nameLo ?? '—'} />
                        <F labelLo="ວັນທີຮັບເຄື່ອງຈາກຊ່າງ" value={formatDate(row.order.receivedFromSmithAt)} />
                        <F labelLo="ວັນທີລູກຄ້າມາຮັບເຄື່ອງ" value={formatDate(row.order.customerPickupAt)} />
                        <F labelLo="ຍອດຄົງເຫຼືອ" value={`${formatLak(row.order.balanceAmount)} LAK`} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}

function F({ labelLo, value }: { labelLo: string; value: string }) {
  return (
    <div>
      <div className="section-label">{labelLo}</div>
      <div className="num mt-0.5 font-semibold text-fg-strong">{value}</div>
    </div>
  );
}

