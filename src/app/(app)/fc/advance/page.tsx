'use client';

import { useState } from 'react';
import { Pagination, usePagination } from '@/components/pagination';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { formatWeight, formatDate, formatByCurrency, formatLak } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { StatCard } from '@/components/stat-card';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Dialog } from '@/components/dialog';

interface Rates {
  thbBuybackRate: string;
  thbSellRate: string;
  usdBuybackRate: string;
  usdSellRate: string;
}

interface Summary {
  totals: Array<{ currency: 'LAK' | 'THB' | 'USD'; net: string }>;
  billCount: number;
}

interface OrderLineItem {
  id: string;
  weightG: string;
  quantity: number;
  note?: string | null;
  goldItem?: { nameLo: string } | null;
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
    sentToSmithAt?: string | null;
    receivedFromSmithAt: string | null; customerPickupAt: string | null;
    completedAt?: string | null;
    customer: { phone: string };
    goldItem?: { nameLo: string } | null;
    supplier?: { nameLo: string } | null;
    note?: string | null;
    lines?: OrderLineItem[];
    receipts?: Array<{
      id: string;
      currency: string;
      amount: string;
      isRefund: boolean;
    }>;
  };
  bankAccount: { nameLo: string } | null;
}

/**
 * ດຶງຂໍ້ມູນສະກຸນເງິນ ແລະ ຍອດ Order ໃນສະກຸນເງິນທີ່ລູກຄ້າຈ່າຍຕົວຈິງ
 */
function getOrderCurrencyInfo(row: Row, rates: Rates | null) {
  const noteText = row.order.note ?? row.note ?? '';
  const match = noteText.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);

  // ສະກຸນເງິນທີ່ລູກຄ້າໃຊ້ຊຳລະ
  const orderCurrency = match
    ? match[2]
    : (row.currency && row.currency !== 'LAK' ? row.currency : 'LAK');

  const rateForCur = (cur: string): number => {
    if (cur === 'LAK') return 1;
    if (!rates) return 0;
    const key = `${cur.toLowerCase()}SellRate` as keyof Rates;
    return Number(rates[key] ?? 0);
  };

  const rate = rateForCur(orderCurrency);

  // 1. ຍອດລວມ Order
  let totalDisplay = `${formatLak(row.order.totalAmount)} LAK`;
  let totalInCur = 0;

  if (orderCurrency !== 'LAK') {
    if (match) {
      totalDisplay = `${match[1]} ${match[2]}`;
      totalInCur = Number(match[1].replace(/,/g, '')) || 0;
    } else if (rate > 0) {
      totalInCur = Math.round((Number(row.order.totalAmount) / rate) * 100) / 100;
      totalDisplay = `${formatByCurrency(totalInCur, orderCurrency)} ${orderCurrency}`;
    }
  }

  // 2. ຍອດຄົງເຫຼືອ Order
  const balanceLak = Number(row.order.balanceAmount) || 0;
  let balanceDisplay = `${formatLak(row.order.balanceAmount)} LAK`;
  const isBalanceZero = balanceLak <= 0;

  if (isBalanceZero) {
    balanceDisplay = orderCurrency !== 'LAK' ? `0.00 ${orderCurrency}` : '0 LAK';
  } else if (orderCurrency !== 'LAK') {
    if (totalInCur > 0) {
      const rcvdInCur = (row.order.receipts ?? [])
        .filter((r) => !r.isRefund && r.currency === orderCurrency)
        .reduce((s, r) => s + (Number(r.amount) || 0), 0);

      const effectiveRcvd = rcvdInCur > 0 ? rcvdInCur : (row.currency === orderCurrency ? Number(row.amountIn) || 0 : 0);
      const bal = Math.max(0, Math.round((totalInCur - effectiveRcvd) * 100) / 100);
      balanceDisplay = `${formatByCurrency(bal, orderCurrency)} ${orderCurrency}`;
    } else if (rate > 0) {
      const balInCur = Math.round((balanceLak / rate) * 100) / 100;
      balanceDisplay = `${formatByCurrency(balInCur, orderCurrency)} ${orderCurrency}`;
    }
  }

  const cleanNote = noteText
    .replace(/\[TOTAL:\s*[\d,.]+\s*(THB|USD|LAK)\]\s*/g, '')
    .trim();

  return {
    orderCurrency,
    totalDisplay,
    balanceDisplay,
    isBalanceZero,
    cleanNote,
  };
}

/**
 * TOR §7 — Module Advace.
 *
 * ເງິນມັດຈໍາ Order ຮັບລ່ວໜ້າ has its own ledger in the updated TOR, separate
 * from AP (Cash). COH Cash subtracts the net, so a deposit sitting in the
 * drawer never reads as the shop's own money.
 */
export default function AdvancePage() {
  const [viewingRow, setViewingRow] = useState<Row | null>(null);

  const ratesQuery = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
  });
  const rates = ratesQuery.data ?? null;

  const summaryQuery = useQuery({
    queryKey: ['finance', 'advance'],
    queryFn: () => api.get<Summary>('/finance/advance'),
  });
  const summary = summaryQuery.data;
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; ກວ້າງອອກໄດ້ຈາກແຖບ filter.
  const history = useHistoryRange<Row>(['finance', 'advance', 'history'], '/finance/advance/history');
  const rows = history.rows;

  const pager = usePagination(rows);

  const viewingOrderInfo = viewingRow ? getOrderCurrencyInfo(viewingRow, rates) : null;

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
                <th className="text-right">ຍອດເງິນຕັດຊຳລະ</th>
                <th className="text-right">ຍອດເງິນສຸດທິ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={11}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void history.refetch()}
              />
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.order.code}</td>
                  <td>{formatDate(row.businessDate)}</td>
                  <td className="num">{row.order.customer.phone}</td>
                  <td className="font-mono text-xs">{row.order.billNo}</td>
                  <td>
                    {row.order.productType}
                    {(row.order.lines?.length ?? 0) > 1 && (
                      <span className="ml-1.5 text-xs text-muted">({row.order.lines?.length} ລາຍການ)</span>
                    )}
                  </td>
                  <td className="num text-right text-success whitespace-nowrap font-medium">
                    {formatByCurrency(row.amountIn, row.currency)} {row.currency}
                  </td>
                  <td className="num text-right text-danger whitespace-nowrap font-medium">
                    {formatByCurrency(row.amountOut, row.currency)} {row.currency}
                  </td>
                  <td className="num text-right font-medium">{formatLak(row.netAmount)}</td>
                  <td>
                    <span className={statusClass(row.order.status)}>{row.order.status}</span>
                  </td>
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-right">
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      {Number(row.order.balanceAmount) > 0 && (
                        <Link href="/fc/orders" className="btn-ghost text-success" aria-label={`Payment ${row.order.code}`}>
                          Payment
                        </Link>
                      )}
                      <button
                        type="button"
                        className="btn-ghost cursor-pointer"
                        aria-label={`View ${row.order.code}`}
                        onClick={() => setViewingRow(row)}
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      {/* Modal ລາຍລະອຽດ View (ui-ux-pro-max) */}
      <Dialog
        open={Boolean(viewingRow)}
        onClose={() => setViewingRow(null)}
        title={`ລາຍລະອຽດ Module Advance — ${viewingRow?.order.code ?? ''}`}
        size="lg"
        dismissOnScrim
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted">
              ວັນທີທຸລະກຳ: <span className="text-fg font-medium">{viewingRow ? formatDate(viewingRow.businessDate) : ''}</span>
              {viewingRow?.createdBy && <> · ບັນທຶກໂດຍ: <span className="text-fg font-medium">{viewingRow.createdBy}</span></>}
            </div>
            <div className="flex items-center gap-2">
              {viewingRow && Number(viewingRow.order.balanceAmount) > 0 && (
                <Link
                  href="/fc/orders"
                  className="btn-primary"
                  aria-label={`ໄປໜ້າຊຳລະເງິນ Order ${viewingRow.order.code}`}
                >
                  ໄປໜ້າ Payment
                </Link>
              )}
              <button
                type="button"
                className="btn-secondary cursor-pointer"
                onClick={() => setViewingRow(null)}
              >
                ປິດ
              </button>
            </div>
          </div>
        }
      >
        {viewingRow && viewingOrderInfo && (
          <div className="space-y-4">
            {/* ແຖບສະຖານະ & ເລກບິນ */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-recessed border border-line text-fg font-semibold">
                  ເລກບິນ: {viewingRow.order.billNo}
                </span>
                <span className={statusClass(viewingRow.order.status)}>
                  {viewingRow.order.status}
                </span>
              </div>
              <div className="text-xs text-muted">
                ສະກຸນເງິນ Order: <span className="font-semibold text-fg">{viewingOrderInfo.orderCurrency}</span>
              </div>
            </div>

            {/* ກຸ່ມຍອດເງິນ Advance (Financial Highlights) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* ຍອດເງິນທີ່ໄດ້ຮັບ */}
              <div className="rounded-xl border border-line bg-recessed/60 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>ຍອດເງິນທີ່ໄດ້ຮັບ</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                    IN
                  </span>
                </div>
                <div className="num text-lg font-bold text-success">
                  {formatByCurrency(viewingRow.amountIn, viewingRow.currency)} {viewingRow.currency}
                </div>
                <div className="text-[11px] text-muted mt-1 truncate">
                  {viewingRow.method ?? '—'}{viewingRow.bankAccount?.nameLo ? ` · ${viewingRow.bankAccount.nameLo}` : ''}
                </div>
              </div>

              {/* ຍອດເງິນຕັດຊຳລະ */}
              <div className="rounded-xl border border-line bg-recessed/60 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>ຍອດເງິນຕັດຊຳລະ</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold">
                    OUT
                  </span>
                </div>
                <div className={`num text-lg font-bold ${Number(viewingRow.amountOut) > 0 ? 'text-danger' : 'text-muted'}`}>
                  {formatByCurrency(viewingRow.amountOut, viewingRow.currency)} {viewingRow.currency}
                </div>
                <div className="text-[11px] text-muted mt-1">
                  {Number(viewingRow.amountOut) > 0 ? 'ຕັດຊຳລະອອກແລ້ວ' : 'ບໍ່ມີການຕັດຊຳລະ'}
                </div>
              </div>

              {/* ຍອດສະສົມ Advance */}
              <div className="rounded-xl border border-line bg-recessed/60 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>ຍອດສະສົມ Advance</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold">
                    NET
                  </span>
                </div>
                <div className="num text-lg font-bold text-fg-strong">
                  {formatByCurrency(viewingRow.balance, viewingRow.currency)} {viewingRow.currency}
                </div>
                <div className="text-[11px] text-muted mt-1">
                  ຍອດເຫຼືອ Advance ({viewingRow.currency})
                </div>
              </div>
            </div>

            {/* ຂໍ້ມູນຫຼັກຂອງ Order */}
            <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-fg uppercase tracking-wider">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                ຂໍ້ມູນ Order
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <DetailItem labelLo="ລະຫັດ Order" value={viewingRow.order.code} mono />
                <DetailItem labelLo="ເລກບິນ (BILL ID)" value={viewingRow.order.billNo} mono />
                <DetailItem labelLo="ປະເພດສິນຄ້າ" value={viewingRow.order.productType} />
                <DetailItem
                  labelLo="ຍອດລວມ Order"
                  value={viewingOrderInfo.totalDisplay}
                />
                <DetailItem
                  labelLo="ຍອດຄົງເຫຼືອ Order"
                  value={viewingOrderInfo.balanceDisplay}
                  highlight={!viewingOrderInfo.isBalanceZero ? 'warning' : 'success'}
                />
                <DetailItem labelLo="ລວມນ້ຳໜັກ" value={`${formatWeight(viewingRow.order.weightG)} g`} />
                <DetailItem labelLo="ລວມຈຳນວນ" value={`${viewingRow.order.quantity} ອັນ`} />
              </div>
            </div>

            {/* ລາຍການຄຳໃນ Order (Item Details Table) */}
            <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-fg uppercase tracking-wider">
                  <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  ລາຍການຄຳໃນບິນ
                </div>
                <span className="text-xs text-muted font-medium">
                  {((viewingRow.order.lines?.length ?? 0) > 0) ? `${viewingRow.order.lines?.length} ລາຍການ` : '1 ລາຍການ'}
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
                    {(!viewingRow.order.lines || viewingRow.order.lines.length === 0) ? (
                      <tr>
                        <td className="font-medium text-fg">{viewingRow.order.goldItem?.nameLo ?? '—'}</td>
                        <td className="num text-right">{formatWeight(viewingRow.order.weightG)}</td>
                        <td className="num text-right">{viewingRow.order.quantity}</td>
                      </tr>
                    ) : (
                      viewingRow.order.lines.map((line) => (
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
                </table>
              </div>
            </div>

            {/* ຂໍ້ມູນຕິດຕໍ່ & ການດຳເນີນງານ */}
            <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-fg uppercase tracking-wider">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                ຂໍ້ມູນຕິດຕໍ່ & ການດຳເນີນງານ
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <DetailItem labelLo="ເບີໂທລູກຄ້າ" value={viewingRow.order.customer.phone} mono />
                <DetailItem labelLo="ພະນັກງານຮັບ Order" value={viewingRow.order.staffName} />
                <DetailItem labelLo="ຜູ້ບັນທຶກ Advance" value={viewingRow.createdBy} />
                <DetailItem labelLo="Supplier / ຊ່າງ" value={viewingRow.order.supplier?.nameLo ?? '—'} />
                <DetailItem labelLo="ວັນທີສັ່ງຊ່າງ" value={formatDate(viewingRow.order.sentToSmithAt)} />
                <DetailItem labelLo="ວັນທີຮັບເຄື່ອງຈາກຊ່າງ" value={formatDate(viewingRow.order.receivedFromSmithAt)} />
                <DetailItem labelLo="ວັນທີລູກຄ້າມາຮັບເຄື່ອງ" value={formatDate(viewingRow.order.customerPickupAt || viewingRow.order.completedAt)} />
              </div>
            </div>

            {/* ໝາຍເຫດ (ຖ້າມີ) */}
            {viewingOrderInfo.cleanNote && (
              <div className="rounded-lg bg-recessed/60 border border-line p-3 text-xs text-muted">
                <strong className="text-fg">ໝາຍເຫດ: </strong> {viewingOrderInfo.cleanNote}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function DetailItem({
  labelLo,
  value,
  sub,
  mono = false,
  highlight,
}: {
  labelLo: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  mono?: boolean;
  highlight?: 'warning' | 'success';
}) {
  return (
    <div>
      <div className="text-xs text-muted mb-0.5">{labelLo}</div>
      <div
        className={`font-medium ${mono ? 'font-mono text-xs' : 'text-sm'} ${
          highlight === 'warning'
            ? 'text-warning font-semibold'
            : highlight === 'success'
              ? 'text-success font-semibold'
              : 'text-fg-strong'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
