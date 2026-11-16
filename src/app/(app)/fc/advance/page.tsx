'use client';

import { useState, useMemo } from 'react';
import { Pagination, usePagination } from '@/components/pagination';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { formatDate, formatDateTime, formatByCurrency, formatLak } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { StatCard } from '@/components/stat-card';
import { useHistoryRange } from '@/components/date-range';
import { Dialog } from '@/components/dialog';
import { matchesOrderSearch } from '@/components/time-search-filter';
import { OrderFilterBar, useOrderSearchFilter } from '@/components/order-filter-bar';
import { OrderTimeline, type OrderStatusHistoryItem } from '@/components/order-timeline';
import { OrderGoldItemsCard } from '@/components/order-gold-items-card';
import { OrderBillInfoCard } from '@/components/order-bill-info-card';

const ORDER_STATUS_LABELS: Record<string, string> = {
  ORDER_PLACED: 'Order ສຳເລັດ',
  SENT_TO_SMITH: 'ສັ່ງຊ່າງ ສຳເລັດ',
  RECEIVED_FROM_SMITH: 'ຮັບເຄື່ອງຈາກຊ່າງ ສຳເລັດ',
  AWAITING_PICKUP: 'ລໍຖ້າລູກຄ້າຮັບເຄື່ອງ',
  COMPLETED: 'Completed',
  CANCELLED: 'ຍົກເລີກ',
};

interface Summary {
  totals: Array<{ currency: 'LAK' | 'THB' | 'USD'; net: string }>;
  billCount: number;
}

interface CurrencyTotal {
  currency: string;
  amountIn: number;
  amountOut: number;
  netAmount: number;
}

interface OrderLineItem {
  id: string;
  weightG: string;
  quantity: number;
  note?: string | null;
  goldItem?: { nameLo: string } | null;
}

interface OrderSummary {
  currency: string;
  totalAmount: string;
  balanceAmount: string;
  isBalanceZero: boolean;
  cleanNote: string;
}

interface Row {
  id: string;
  businessDate: string;
  createdAt: string;
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
  orderSummary?: OrderSummary;
  order: {
    id: string; code: string; billNo: string; productType: string;
    staffName: string; weightG: string; quantity: number;
    totalAmount: string; balanceAmount: string; status: string;
    currency?: string;
    originalTotalAmount?: string | null;
    exchangeRate?: string | null;
    sentToSmithAt?: string | null;
    receivedFromSmithAt: string | null; customerPickupAt: string | null;
    completedAt?: string | null;
    createdAt?: string | null;
    customer: { phone: string };
    goldItem?: { nameLo: string } | null;
    supplier?: { nameLo: string } | null;
    note?: string | null;
    lines?: OrderLineItem[];
    statusHistory?: OrderStatusHistoryItem[];
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
function getOrderCurrencyInfo(row: Row) {
  // 1. ບຸລິມະສິດທີ 1: ຖ້າ server ຄຳນວນ orderSummary ມາໃຫ້ແລ້ວ ໃຊ້ອັນນັ້ນໂດຍກົງ (Financial Consistency)
  if (row.orderSummary) {
    const cur = row.orderSummary.currency;
    const isZero = row.orderSummary.isBalanceZero;
    const totalDisplay = cur === 'LAK'
      ? `${formatLak(row.orderSummary.totalAmount)} LAK`
      : `${formatByCurrency(row.orderSummary.totalAmount, cur)} ${cur}`;
    const balanceDisplay = isZero
      ? (cur !== 'LAK' ? `0.00 ${cur}` : '0 LAK')
      : (cur !== 'LAK'
          ? `${formatByCurrency(row.orderSummary.balanceAmount, cur)} ${cur}`
          : `${formatLak(row.orderSummary.balanceAmount)} LAK`);

    return {
      orderCurrency: cur,
      totalDisplay,
      balanceDisplay,
      isBalanceZero: isZero,
      cleanNote: row.orderSummary.cleanNote,
    };
  }

  // 2. Fallback ສຳລັບຂໍ້ມູນທີ່ບໍ່ມີ orderSummary (ເຊັ່ນ mock ຫຼື legacy)
  const noteText = row.order.note ?? row.note ?? '';
  const match = noteText.match(/\[TOTAL:\s*([\d,.]+)\s*(THB|USD|LAK)\]/);
  const orderCurrency = row.order.currency && row.order.currency !== 'LAK'
    ? row.order.currency
    : match
      ? match[2]
      : 'LAK';

  const rawTotal = orderCurrency !== 'LAK' && row.order.originalTotalAmount
    ? row.order.originalTotalAmount
    : match && orderCurrency !== 'LAK'
      ? match[1].replace(/,/g, '')
      : row.order.totalAmount;

  const totalDisplay = orderCurrency === 'LAK'
    ? `${formatLak(rawTotal)} LAK`
    : `${formatByCurrency(rawTotal, orderCurrency)} ${orderCurrency}`;

  const balanceLak = Number(row.order.balanceAmount) || 0;
  const isBalanceZero = balanceLak <= 0;
  const balanceDisplay = isBalanceZero
    ? (orderCurrency !== 'LAK' ? `0.00 ${orderCurrency}` : '0 LAK')
    : `${formatLak(row.order.balanceAmount)} LAK`;

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
 * ລວມຍອດຮັບເຂົ້າ / ຕັດຊຳລະ / ສຸດທິ ແຍກຕາມສະກຸນເງິນ ເພື່ອປ້ອງກັນການບວກຂ້າມສະກຸນເງິນ
 */
function summarizeByCurrency(entries: Row[], fallbackCurrency = 'LAK'): CurrencyTotal[] {
  const nonZero = entries.filter(
    (e) => (Number(e.amountIn) || 0) > 0 || (Number(e.amountOut) || 0) > 0,
  );
  const source = nonZero.length > 0 ? nonZero : entries;
  const map = new Map<string, CurrencyTotal>();

  for (const e of source) {
    const cur = e.currency || fallbackCurrency;
    const inAmt = Number(e.amountIn) || 0;
    const outAmt = Number(e.amountOut) || 0;
    const prev = map.get(cur);
    if (!prev) {
      map.set(cur, {
        currency: cur,
        amountIn: inAmt,
        amountOut: outAmt,
        netAmount: Math.round((inAmt - outAmt) * 100) / 100,
      });
    } else {
      prev.amountIn = Math.round((prev.amountIn + inAmt) * 100) / 100;
      prev.amountOut = Math.round((prev.amountOut + outAmt) * 100) / 100;
      prev.netAmount = Math.round((prev.amountIn - prev.amountOut) * 100) / 100;
    }
  }

  if (map.size === 0) {
    return [{ currency: fallbackCurrency, amountIn: 0, amountOut: 0, netAmount: 0 }];
  }
  return Array.from(map.values());
}

/** Query Key Factories for standardized cache keys */
const advanceKeys = {
  all: ['finance', 'advance'] as const,
  summary: () => [...advanceKeys.all, 'summary'] as const,
  history: () => ['finance', 'advance', 'history'],
};

/**
 * ປ້າຍກຳກັບວິທີຊຳລະ / ປະເພດທຸລະກຳ ເພື່ອໃຫ້ຜູ້ກວດສອບແຍກແຍະໄດ້ງ່າຍ
 */
function getTransactionTypeBadge(row: Row) {
  const isOut = Number(row.amountOut) > 0;
  const isIn = Number(row.amountIn) > 0;

  if (isOut) {
    if (row.method === 'CASH') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap">
          <span aria-hidden="true">💵</span>
          <span>ຄືນເງິນສົດ</span>
        </span>
      );
    }
    if (row.method === 'BANK') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap">
          <span aria-hidden="true">🏦</span>
          <span>ຄືນເງິນໂອນ{row.bankAccount?.nameLo ? ` (${row.bankAccount.nameLo})` : ''}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
        <span aria-hidden="true">📦</span>
        <span>ຕັດມັດຈຳ (ຮັບຄຳແລ້ວ)</span>
      </span>
    );
  }

  if (isIn) {
    if (row.method === 'CASH') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
          <span aria-hidden="true">💵</span>
          <span>ເງິນສົດ</span>
        </span>
      );
    }
    if (row.method === 'BANK') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap">
          <span aria-hidden="true">🏦</span>
          <span>ເງິນໂອນ{row.bankAccount?.nameLo ? ` (${row.bankAccount.nameLo})` : ''}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
        <span aria-hidden="true">📥</span>
        <span>ຮັບມັດຈຳ</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/10 text-muted border border-line whitespace-nowrap">
      <span aria-hidden="true">📝</span>
      <span>ສ້າງ Order (ບໍ່ມີມັດຈຳ)</span>
    </span>
  );
}

interface GroupedRow extends Row {
  isGrouped: true;
  methods: string[];
  bankNames: string[];
  refundMethods: string[];
  hasSettlement: boolean;
  entries: Row[];
  primaryRow: Row;
  currencyTotals: CurrencyTotal[];
}

/**
 * ປ້າຍກຳກັບວິທີຊຳລະແບບລວມຕາມ Order (ສະແດງທຸກຊ່ອງທາງທີ່ Order ນັ້ນໃຊ້)
 */
function getGroupedPaymentBadge(group: GroupedRow) {
  const badges = [];

  if (group.methods.includes('CASH')) {
    badges.push(
      <span
        key="cash"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap"
      >
        <span aria-hidden="true">💵</span>
        <span>ເງິນສົດ</span>
      </span>
    );
  }

  if (group.methods.includes('BANK')) {
    const bankDesc = group.bankNames.length > 0 ? ` (${group.bankNames.join(', ')})` : '';
    badges.push(
      <span
        key="bank"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap"
      >
        <span aria-hidden="true">🏦</span>
        <span>ເງິນໂອນ{bankDesc}</span>
      </span>
    );
  }

  const hasAnyMovement = group.currencyTotals.some((t) => t.amountIn > 0 || t.amountOut > 0);
  if (!hasAnyMovement) {
    badges.push(
      <span
        key="zero"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted/10 text-muted border border-line whitespace-nowrap"
      >
        <span aria-hidden="true">📝</span>
        <span>ບໍ່ມີມັດຈຳ</span>
      </span>
    );
  }

  if (group.refundMethods.includes('CASH')) {
    badges.push(
      <span
        key="ref-cash"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap"
      >
        <span aria-hidden="true">💵</span>
        <span>ຄືນເງິນສົດ</span>
      </span>
    );
  }

  if (group.refundMethods.includes('BANK')) {
    badges.push(
      <span
        key="ref-bank"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap"
      >
        <span aria-hidden="true">🏦</span>
        <span>ຄືນເງິນໂອນ</span>
      </span>
    );
  }

  if (group.hasSettlement) {
    badges.push(
      <span
        key="settle"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap"
      >
        <span aria-hidden="true">📦</span>
        <span>ຕັດມັດຈຳ (ຮັບຄຳແລ້ວ)</span>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges}
    </div>
  );
}

/**
 * TOR §7 — Module Advance.
 *
 * ເງິນມັດຈໍາ Order ຮັບລ່ວໜ້າ has its own ledger in the updated TOR, separate
 * from AP (Cash). COH Cash subtracts the net, so a deposit sitting in the
 * drawer never reads as the shop's own money.
 */
export default function AdvancePage() {
  const [viewingRow, setViewingRow] = useState<Row | null>(null);
  const [viewingEntries, setViewingEntries] = useState<Row[]>([]);
  const [groupByOrder, setGroupByOrder] = useState(true);
  const searchFilter = useOrderSearchFilter();

  const summaryQuery = useQuery({
    queryKey: advanceKeys.summary(),
    queryFn: () => api.get<Summary>('/finance/advance'),
    staleTime: 30 * 1000,
  });
  const summary = summaryQuery.data;
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; ກວ້າງອອກໄດ້ຈາກແຖບ filter.
  const history = useHistoryRange<Row>(advanceKeys.history(), '/finance/advance/history', {
    params: {
      search: searchFilter.debouncedSearch || undefined,
    },
  });
  const rows = history.rows;

  const filteredRows = useMemo(() => {
    if (!searchFilter.searchTerm.trim()) return rows;
    return rows.filter((r) =>
      matchesOrderSearch(
        {
          code: r.order.code,
          billNo: r.order.billNo,
          phone: r.order.customer.phone,
          staffName: r.order.staffName,
        },
        searchFilter.searchTerm,
      ),
    );
  }, [rows, searchFilter.searchTerm]);

  // ຈັດກຸ່ມຕາມ Order: 1 Order = 1 ແຖວ ພ້ອມລວມຍອດຮັບ, ຕັດຊຳລະ ແລະ ສຸດທິ ແຍກຕາມສະກຸນເງິນ
  const groupedRows = useMemo<GroupedRow[]>(() => {
    const map = new Map<string, GroupedRow>();

    for (const row of filteredRows) {
      const orderId = row.order?.id || row.id;
      const existing = map.get(orderId);
      const inAmt = Number(row.amountIn) || 0;
      const outAmt = Number(row.amountOut) || 0;

      if (!existing) {
        map.set(orderId, {
          ...row,
          isGrouped: true,
          amountIn: String(inAmt),
          amountOut: String(outAmt),
          netAmount: String(inAmt - outAmt),
          methods: inAmt > 0 && row.method ? [row.method] : [],
          bankNames: inAmt > 0 && row.bankAccount?.nameLo ? [row.bankAccount.nameLo] : [],
          refundMethods: outAmt > 0 && row.method ? [row.method] : [],
          hasSettlement: outAmt > 0 && !row.method,
          entries: [row],
          primaryRow: row,
          currencyTotals: [],
        });
      } else {
        if (inAmt > 0 && row.method && !existing.methods.includes(row.method)) {
          existing.methods.push(row.method);
        }
        if (inAmt > 0 && row.bankAccount?.nameLo && !existing.bankNames.includes(row.bankAccount.nameLo)) {
          existing.bankNames.push(row.bankAccount.nameLo);
        }
        if (outAmt > 0 && row.method && !existing.refundMethods.includes(row.method)) {
          existing.refundMethods.push(row.method);
        }
        if (outAmt > 0 && !row.method) {
          existing.hasSettlement = true;
        }
        existing.entries.push(row);
        if (!existing.orderSummary && row.orderSummary) {
          existing.orderSummary = row.orderSummary;
          existing.primaryRow = row;
        }
      }
    }

    for (const group of map.values()) {
      const totals = summarizeByCurrency(group.entries, group.currency);
      group.currencyTotals = totals;
      const first = totals[0];
      if (first) {
        group.currency = first.currency;
        group.amountIn = String(first.amountIn);
        group.amountOut = String(first.amountOut);
        group.netAmount = String(first.netAmount);
      }
    }

    return Array.from(map.values());
  }, [filteredRows]);

  const displayRows = groupByOrder ? groupedRows : filteredRows;
  const pager = usePagination(displayRows);

  const viewingOrderInfo = viewingRow ? getOrderCurrencyInfo(viewingRow) : null;
  const modalCurrencyTotals = useMemo(
    () =>
      viewingRow
        ? summarizeByCurrency(
            viewingEntries.length > 0 ? viewingEntries : [viewingRow],
            viewingRow.currency,
          )
        : [],
    [viewingEntries, viewingRow],
  );
  const modalHasOut = modalCurrencyTotals.some((t) => t.amountOut > 0);

  return (
    <div className="space-y-6">
      <PageHead
        title="Module Advance"
        subtitle="ເງິນມັດຈໍາ Order ຮັບລ່ວງໜ້າ — ຫັກອອກຈາກ COH Cash ຈົນກວ່າລູກຄ້າຮັບເຄື່ອງ (TOR §7)"
      />

      {summaryQuery.isError && (
        <QueryErrorNotice error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
      )}

      <div className="stat-grid">
        {summaryQuery.isLoading ? (
          <>
            <div className="card p-4 animate-pulse"><div className="h-4 bg-line rounded w-24 mb-2" /><div className="h-7 bg-line rounded w-32" /></div>
            <div className="card p-4 animate-pulse"><div className="h-4 bg-line rounded w-24 mb-2" /><div className="h-7 bg-line rounded w-32" /></div>
            <div className="card p-4 animate-pulse"><div className="h-4 bg-line rounded w-24 mb-2" /><div className="h-7 bg-line rounded w-32" /></div>
            <div className="card p-4 animate-pulse"><div className="h-4 bg-line rounded w-24 mb-2" /><div className="h-7 bg-line rounded w-16" /></div>
          </>
        ) : (
          <>
            {(summary?.totals ?? []).map((t) => (
              <StatCard key={t.currency} label={`ລວມຍອດເງິນ Advance (${t.currency})`} value={formatByCurrency(t.net, t.currency)} />
            ))}
            <StatCard
              label="ລວມຈຳນວນບິນ"
              value={String(summary?.billCount ?? '—')}
              sub="Order ທີ່ຍັງບໍ່ Completed"
            />
          </>
        )}
      </div>

      <div data-fade className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="card-title">ປະຫວັດ Module Advance</h2>
            <span className="text-xs text-muted">
              ({displayRows.length} {groupByOrder ? 'Order' : 'ລາຍການ'})
            </span>
          </div>
          <div className="flex items-center gap-1 bg-recessed p-0.5 rounded-lg border border-line text-xs">
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md transition-colors ${groupByOrder ? 'bg-surface font-semibold text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
              onClick={() => setGroupByOrder(true)}
            >
              ສະຫຼຸບຕາມ Order
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md transition-colors ${!groupByOrder ? 'bg-surface font-semibold text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
              onClick={() => setGroupByOrder(false)}
            >
              ແຍກລາຍການເຄື່ອນໄຫວ
            </button>
          </div>
        </div>
        <OrderFilterBar history={history} search={searchFilter} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Module Advance">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ Order</th>
                <th>ວັນທີ / ເວລາ</th>
                <th>ເບີໂທ</th>
                <th>ເລກບິນ</th>
                <th>ພະນັກງານຮັບ</th>
                <th>ປະເພດສິນຄ້າ</th>
                <th>ວິທີຊຳລະ / ທຸລະກຳ</th>
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
                colSpan={13}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={displayRows.length === 0}
                emptyText={
                  searchFilter.hasActiveFilter ? 'ບໍ່ພົບລາຍການທີ່ຄົ້ນຫາ' : 'ຍັງບໍ່ມີລາຍການ'
                }
                onRetry={() => void history.refetch()}
              />
              {pager.pageItems.map((row) => {
                const isGroupedRow = 'isGrouped' in row && row.isGrouped;
                const grouped = isGroupedRow ? (row as GroupedRow) : null;
                const dateTimeText = row.createdAt
                  ? formatDateTime(row.createdAt)
                  : formatDate(row.businessDate);

                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.order.code}</td>
                    <td className="num whitespace-nowrap">{dateTimeText}</td>
                    <td className="num">{row.order.customer.phone}</td>
                    <td className="font-mono text-xs">{row.order.billNo}</td>
                    <td>{row.order.staffName || '—'}</td>
                    <td>
                      {row.order.productType}
                      {(row.order.lines?.length ?? 0) > 1 && (
                        <span className="ml-1.5 text-xs text-muted">({row.order.lines?.length} ລາຍການ)</span>
                      )}
                    </td>
                    <td>{grouped ? getGroupedPaymentBadge(grouped) : getTransactionTypeBadge(row)}</td>
                    <td className="num text-right text-success whitespace-nowrap font-medium">
                      {grouped && grouped.currencyTotals.length > 1 ? (
                        <div className="space-y-0.5">
                          {grouped.currencyTotals.map((t) => (
                            <div key={t.currency}>
                              {formatByCurrency(t.amountIn, t.currency)} {t.currency}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {formatByCurrency(row.amountIn, row.currency)} {row.currency}
                        </>
                      )}
                    </td>
                    <td className="num text-right text-danger whitespace-nowrap font-medium">
                      {grouped && grouped.currencyTotals.length > 1 ? (
                        <div className="space-y-0.5">
                          {grouped.currencyTotals.map((t) => (
                            <div key={t.currency}>
                              {formatByCurrency(t.amountOut, t.currency)} {t.currency}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {formatByCurrency(row.amountOut, row.currency)} {row.currency}
                        </>
                      )}
                    </td>
                    <td className="num text-right font-medium whitespace-nowrap">
                      {grouped && grouped.currencyTotals.length > 1 ? (
                        <div className="space-y-0.5">
                          {grouped.currencyTotals.map((t) => (
                            <div
                              key={t.currency}
                              className={t.netAmount < 0 ? 'text-danger' : t.netAmount > 0 ? 'text-success' : 'text-muted'}
                            >
                              {formatByCurrency(t.netAmount, t.currency)} {t.currency}
                            </div>
                          ))}
                        </div>
                      ) : (
                        (() => {
                          const rowNet = row.netAmount !== undefined
                            ? Number(row.netAmount)
                            : (Number(row.amountIn) || 0) - (Number(row.amountOut) || 0);
                          return (
                            <span className={rowNet < 0 ? 'text-danger' : rowNet > 0 ? 'text-success' : 'text-muted'}>
                              {formatByCurrency(rowNet, row.currency)} {row.currency}
                            </span>
                          );
                        })()
                      )}
                    </td>
                    <td>
                      <span className={statusClass(row.order.status)}>{row.order.status}</span>
                    </td>
                    <td className="text-muted">{row.createdBy}</td>
                    <td className="text-right">
                      <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                        {Number(row.order.balanceAmount) > 0 && (
                          <Link
                            href={`/fc/orders?search=${encodeURIComponent(row.order.billNo || row.order.code)}`}
                            className="btn-ghost text-success"
                            aria-label={`Payment ${row.order.code}`}
                          >
                            Payment
                          </Link>
                        )}
                        <button
                          type="button"
                          className="btn-ghost cursor-pointer"
                          aria-label={`View ${row.order.code}`}
                          onClick={() => {
                            setViewingRow(row);
                            setViewingEntries('entries' in row ? (row as GroupedRow).entries : [row]);
                          }}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      {/* Modal ລາຍລະອຽດ Module Advance */}
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
                  href={`/fc/orders?search=${encodeURIComponent(viewingRow.order.billNo || viewingRow.order.code)}`}
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
            {/* 1. ຂໍ້ມູນໃບບິນ (ເລກບິນ, ປະເພດ, Status Order, ເບີໂທ, ພະນັກງານ, ສະກຸນເງິນ, ໝາຍເຫດ) */}
            <OrderBillInfoCard
              billNo={viewingRow.order.billNo}
              productType={viewingRow.order.productType}
              status={viewingRow.order.status}
              statusLabel={ORDER_STATUS_LABELS[viewingRow.order.status] ?? viewingRow.order.status}
              phone={viewingRow.order.customer.phone}
              staffName={viewingRow.order.staffName}
              currency={viewingOrderInfo.orderCurrency}
              note={viewingOrderInfo.cleanNote}
            />

            {/* 2. ສະຫຼຸບຍອດເງິນ Advance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* ຍອດເງິນທີ່ໄດ້ຮັບ */}
              <div className="rounded-xl border border-line bg-recessed/60 p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>ຍອດເງິນທີ່ໄດ້ຮັບ</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                    IN
                  </span>
                </div>
                <div className="num text-lg font-bold text-success space-y-0.5">
                  {modalCurrencyTotals.map((t) => (
                    <div key={t.currency}>
                      {formatByCurrency(t.amountIn, t.currency)} {t.currency}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted mt-1 truncate">
                  {viewingEntries.length > 1
                    ? `${viewingEntries.filter((e) => Number(e.amountIn) > 0).length} ລາຍການຮັບ`
                    : (viewingRow.method ?? '—')}
                  {viewingRow.bankAccount?.nameLo ? ` · ${viewingRow.bankAccount.nameLo}` : ''}
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
                <div className="num text-lg font-bold space-y-0.5">
                  {modalCurrencyTotals.map((t) => (
                    <div key={t.currency} className={t.amountOut > 0 ? 'text-danger' : 'text-muted'}>
                      {formatByCurrency(t.amountOut, t.currency)} {t.currency}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted mt-1">
                  {modalHasOut ? 'ຕັດຊຳລະອອກແລ້ວ' : 'ບໍ່ມີການຕັດຊຳລະ'}
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
                <div className="num text-lg font-bold text-fg-strong space-y-0.5">
                  {modalCurrencyTotals.map((t) => (
                    <div key={t.currency}>
                      {formatByCurrency(t.netAmount, t.currency)} {t.currency}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted mt-1">
                  ຍອດເຫຼືອ Advance ({modalCurrencyTotals.map((t) => t.currency).join(', ')})
                </div>
              </div>
            </div>

            {/* 3. ລາຍການຄຳໃນບິນ (ພ້ອມ ລວມນ້ຳໜັກ ແລະ ລວມຈຳນວນ) */}
            <OrderGoldItemsCard
              lines={viewingRow.order.lines}
              fallbackItemName={viewingRow.order.goldItem?.nameLo}
              totalWeightG={viewingRow.order.weightG}
              totalQuantity={viewingRow.order.quantity}
            />

            {/* 4. ການດຳເນີນງານ (Timeline) */}
            <OrderTimeline
              status={viewingRow.order.status}
              createdAt={viewingRow.order.createdAt}
              fallbackCreatedDate={viewingRow.businessDate}
              sentToSmithAt={viewingRow.order.sentToSmithAt}
              receivedFromSmithAt={viewingRow.order.receivedFromSmithAt}
              customerPickupAt={viewingRow.order.customerPickupAt}
              completedAt={viewingRow.order.completedAt}
              supplierName={viewingRow.order.supplier?.nameLo}
              statusHistory={viewingRow.order.statusHistory}
            />

            {/* 5. ປະຫວັດການເຄື່ອນໄຫວ Advance ໃນບິນນີ້ */}
            {viewingEntries.length > 0 && (
              <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                    <svg className="w-4 h-4 text-[var(--gold-icon)] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    ປະຫວັດການເຄື່ອນໄຫວ Advance ໃນບິນນີ້
                  </div>
                  <span className="text-xs text-muted font-medium">
                    {viewingEntries.length} ລາຍການ
                  </span>
                </div>

                <div className="table-wrap rounded-lg border border-line bg-surface">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>ປະເພດ / ວິທີຊຳລະ</th>
                        <th className="text-right">ຍອດເງິນ</th>
                        <th>ວັນທີທຸລະກຳ</th>
                        <th>ຜູ້ບັນທຶກ</th>
                        <th>ໝາຍເຫດ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{getTransactionTypeBadge(entry)}</td>
                          <td className="num text-right font-medium">
                            {Number(entry.amountOut) > 0 ? (
                              <span className="text-danger font-semibold">
                                −{formatByCurrency(entry.amountOut, entry.currency)} {entry.currency}
                              </span>
                            ) : Number(entry.amountIn) > 0 ? (
                              <span className="text-success font-semibold">
                                +{formatByCurrency(entry.amountIn, entry.currency)} {entry.currency}
                              </span>
                            ) : (
                              <span className="text-muted">0 {entry.currency}</span>
                            )}
                          </td>
                          <td>{formatDate(entry.businessDate)}</td>
                          <td className="text-muted">{entry.createdBy}</td>
                          <td className="text-muted truncate max-w-[200px]">{entry.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
