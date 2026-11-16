'use client';

import { useMemo, useState } from 'react';
import { dec } from '@kpv/domain';
import { Pagination, usePagination } from '@/components/pagination';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime, formatDate, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Dialog } from '@/components/dialog';
import { PrintSheet } from '@/components/print-sheet';

interface Balance {
  currency: 'LAK' | 'THB' | 'USD';
  inflow: string;
  outflow: string;
  balance: string;
}

interface Row {
  /** ຜູ້ລົງລາຍການ — ມາຈາກ API. */
  createdBy: string;
  id: string;
  type: string;
  currency: string;
  amount: string;
  refType: string | null;
  refId?: string | null;
  note: string | null;
  createdAt: string;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; isInflow: boolean; badgeClass: string }
> = {
  IN: { label: 'ຮັບເຂົ້າ', isInflow: true, badgeClass: 'status-success' },
  OTHER_INCOME: { label: 'ລາຍຮັບອື່ນ', isInflow: true, badgeClass: 'status-success' },
  OUT: { label: 'ຈ່າຍອອກ', isInflow: false, badgeClass: 'status-danger' },
  OTHER_EXPENSE: { label: 'ລາຍຈ່າຍອື່ນ', isInflow: false, badgeClass: 'status-danger' },
};

const REF_CONFIG: Record<string, { label: string }> = {
  Buyback: { label: 'ຮັບຊື້ຄືນ' },
  GoldExchange: { label: 'ປ່ຽນຄຳ' },
  GoldCredit: { label: 'ສິນເຊື່ອຄຳ' },
  CashRequest: { label: 'ເບີກ/ມອບເງິນ' },
  IncomeExpenseTransaction: { label: 'ລາຍຮັບ-ລາຍຈ່າຍ' },
  Order: { label: 'ສັ່ງສິນຄ້າ' },
  MANUAL: { label: 'ບັນທຶກເອງ' },
};

function isRowInflow(row: Row): boolean {
  return row.type === 'IN' || row.type === 'OTHER_INCOME';
}

function formatTimeOnly(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const csvField = (value: string) => `"${value.replace(/"/g, '""')}"`;

/* ── Inline SVG Icons (consistent styling, no emoji, accessible) ── */

function SearchIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m17.5 17.5-4.5-4.5m1.5-4a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
    </svg>
  );
}

function CloseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

function ClockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6v4.5l3 1.5" />
    </svg>
  );
}

function EyeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 10s3-5.5 7.5-5.5 7.5 5.5 7.5 5.5-3 5.5-7.5 5.5S2.5 10 2.5 10Z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function PrinterIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5V3.5h10v4M5 14.5H3.5a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 3.5 7.5h13a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H15M5 12h10v5.5H5V12Z" />
    </svg>
  );
}

function DownloadIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 14.5v1.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-1.5M6 9l4 4m0 0 4-4m-4 4V3" />
    </svg>
  );
}

function ArrowDownInflowIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.5v10m0 0l-3.5-3.5M8 12.5l3.5-3.5" />
    </svg>
  );
}

function ArrowUpOutflowIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 13.5v-10m0 0l-3.5 3.5M8 3.5l3.5 3.5" />
    </svg>
  );
}

/** TOR §3.7 — Module Cash. */
export default function FcCashPage() {
  const balancesQuery = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<Balance[]>('/cash/balances'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const balances = balancesQuery.data ?? [];

  const history = useHistoryRange<Row>(['cash', 'history'], '/cash/history', {
    refetchInterval: 30_000,
  });
  const rows = history.rows;

  /* ── Client-side Filter & Search State ── */
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  /* ── Modal & Print Preview State ── */
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  /* ── Filter Logic ── */
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      // 1. Direction Filter
      if (directionFilter === 'IN' && !isRowInflow(row)) return false;
      if (directionFilter === 'OUT' && isRowInflow(row)) return false;

      // 2. Currency Filter
      if (currencyFilter !== 'ALL' && row.currency !== currencyFilter) return false;

      // 3. Search Query
      if (q) {
        const typeLabel = TYPE_CONFIG[row.type]?.label.toLowerCase() ?? '';
        const refLabel = (REF_CONFIG[row.refType ?? '']?.label ?? row.refType ?? '').toLowerCase();
        const note = (row.note ?? '').toLowerCase();
        const createdBy = (row.createdBy ?? '').toLowerCase();
        const amount = row.amount.toLowerCase();
        const refId = (row.refId ?? '').toLowerCase();

        const matches =
          typeLabel.includes(q) ||
          refLabel.includes(q) ||
          note.includes(q) ||
          createdBy.includes(q) ||
          amount.includes(q) ||
          refId.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [rows, directionFilter, currencyFilter, searchQuery]);

  const pager = usePagination(filteredRows);

  /* ── Summary Calculation for Filtered Set ── */
  const summary = useMemo(() => {
    const inflowSums: Record<string, ReturnType<typeof dec>> = {};
    const outflowSums: Record<string, ReturnType<typeof dec>> = {};

    for (const row of filteredRows) {
      const cur = row.currency || 'LAK';
      const amountDec = dec(row.amount || '0');
      if (isRowInflow(row)) {
        inflowSums[cur] = (inflowSums[cur] || dec('0')).plus(amountDec);
      } else {
        outflowSums[cur] = (outflowSums[cur] || dec('0')).plus(amountDec);
      }
    }

    return {
      inflows: Object.entries(inflowSums).map(([currency, sum]) => ({
        currency,
        amount: sum.toFixed(),
      })),
      outflows: Object.entries(outflowSums).map(([currency, sum]) => ({
        currency,
        amount: sum.toFixed(),
      })),
    };
  }, [filteredRows]);

  /* ── Counts for Segments ── */
  const inflowCount = useMemo(() => rows.filter(isRowInflow).length, [rows]);
  const outflowCount = useMemo(() => rows.filter((r) => !isRowInflow(r)).length, [rows]);
  const isFilterActive = directionFilter !== 'ALL' || currencyFilter !== 'ALL' || searchQuery.trim() !== '';

  const handleResetFilters = () => {
    setDirectionFilter('ALL');
    setCurrencyFilter('ALL');
    setSearchQuery('');
    pager.reset();
  };

  /* ── CSV Export ── */
  const exportCsv = () => {
    const header = [
      'ລ/ດ',
      'ວັນທີ',
      'ເວລາ',
      'ປະເພດ',
      'ທີ່ມາ_ອ້າງອີງ',
      'ສະກຸນເງິນ',
      'ຈຳນວນເງິນ',
      'ທິດທາງ',
      'ໝາຍເຫດ',
      'ຜູ້ບັນທຶກ',
      'ລະຫັດທຸລະກຳ',
    ]
      .map(csvField)
      .join(',');

    const body = filteredRows
      .map((row, idx) => {
        const isInflow = isRowInflow(row);
        const fields = [
          String(idx + 1),
          formatDate(row.createdAt),
          formatTimeOnly(row.createdAt),
          TYPE_CONFIG[row.type]?.label ?? row.type,
          REF_CONFIG[row.refType ?? '']?.label ?? row.refType ?? '—',
          row.currency,
          row.amount,
          isInflow ? 'IN' : 'OUT',
          row.note ?? '',
          row.createdBy,
          row.id,
        ];
        return fields.map(csvField).join(',');
      })
      .join('\n');

    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kpv-cash-ledger-${history.from}_${history.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Module Cash"
        subtitle="ຍອດເງິນສົດຄົງເຫຼືອ ແລະ ການເຄື່ອນໄຫວເງິນສົດໃນມື້ (TOR §3.7)"
      />

      {balancesQuery.isError && (
        <QueryErrorNotice error={balancesQuery.error} onRetry={() => void balancesQuery.refetch()} />
      )}

      {/* ── Stat Cards ── */}
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

      {/* ── Cash History Card ── */}
      <div data-fade className="card">
        <div className="card-header">
          <div className="flex items-center gap-3">
            <h2 className="card-title">ປະຫວັດ Cash</h2>
            <span className="live-dot" title="ໂຫຼດຂໍ້ມູນອັດຕະໂນມັດທຸກ 30 ວິນາທີ">
              ອັບເດດສົດ
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs h-9 py-0 px-3 cursor-pointer"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
              title="ສົ່ງອອກຂໍ້ມູນຕາຕະລາງເປັນ CSV (UTF-8 Excel)"
            >
              <DownloadIcon className="h-3.5 w-3.5 text-gold" />
              <span>ສົ່ງອອກ CSV</span>
            </button>
            <button
              type="button"
              className="btn-secondary text-xs h-9 py-0 px-3 cursor-pointer"
              onClick={() => setIsPrintOpen(true)}
              disabled={filteredRows.length === 0}
              title="ພິມໃບລາຍງານການເຄື່ອນໄຫວເງິນສົດ"
            >
              <PrinterIcon className="h-3.5 w-3.5 text-gold" />
              <span>ພິມລາຍງານ</span>
            </button>
          </div>
        </div>

        {/* ── Range Picker ── */}
        <DateRangeFilter history={history} />

        {/* ── Interactive Filter & Search Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[var(--line)] bg-[var(--surface-solid)]">
          {/* Direction Filter Segment */}
          <div className="seg" role="tablist" aria-label="ກັ່ນຕອງທິດທາງເງິນສົດ">
            <button
              type="button"
              role="tab"
              className="seg-btn cursor-pointer"
              aria-selected={directionFilter === 'ALL'}
              onClick={() => {
                setDirectionFilter('ALL');
                pager.reset();
              }}
            >
              ທັງໝົດ
              <span className="seg-count">{rows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="seg-btn cursor-pointer"
              aria-selected={directionFilter === 'IN'}
              onClick={() => {
                setDirectionFilter('IN');
                pager.reset();
              }}
            >
              <ArrowDownInflowIcon className="text-success h-3 w-3" />
              <span>ຮັບເຂົ້າ (+)</span>
              <span className="seg-count">{inflowCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="seg-btn cursor-pointer"
              aria-selected={directionFilter === 'OUT'}
              onClick={() => {
                setDirectionFilter('OUT');
                pager.reset();
              }}
            >
              <ArrowUpOutflowIcon className="text-danger h-3 w-3" />
              <span>ຈ່າຍອອກ (−)</span>
              <span className="seg-count">{outflowCount}</span>
            </button>
          </div>

          {/* Currency + Search Box */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="filter-date cursor-pointer text-xs h-9 min-w-[110px]"
              value={currencyFilter}
              onChange={(e) => {
                setCurrencyFilter(e.target.value);
                pager.reset();
              }}
              aria-label="ເລືອກສະກຸນເງິນ"
            >
              <option value="ALL">ທຸກສະກຸນເງິນ</option>
              <option value="LAK">LAK (ກີບ)</option>
              <option value="THB">THB (ບາດ)</option>
              <option value="USD">USD (ໂດລາ)</option>
            </select>

            <div className="relative flex items-center min-w-[200px] max-w-xs">
              <input
                type="text"
                className="filter-date w-full pr-8 text-xs h-9"
                placeholder="ຄົ້ນຫາ ໝາຍເຫດ, ຜູ້ບັນທຶກ..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  pager.reset();
                }}
                aria-label="ຄົ້ນຫາທຸລະກຳ"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    pager.reset();
                  }}
                  className="absolute right-2 text-muted hover:text-fg p-0.5 cursor-pointer"
                  aria-label="ລ້າງຄຳຄົ້ນຫາ"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="absolute right-2.5 text-muted pointer-events-none">
                  <SearchIcon className="h-3.5 w-3.5 opacity-60" />
                </span>
              )}
            </div>

            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="filter-clear text-xs h-9 cursor-pointer"
                title="ລ້າງຕົວກັ່ນຕອງທັງໝົດ"
              >
                ລ້າງຕົວກັ່ນຕອງ
              </button>
            )}
          </div>
        </div>

        {/* ── Period Summary Strip ── */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 px-5 py-2.5 bg-[var(--recessed)] border-b border-[var(--line)] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted">ລາຍການທີ່ສະແດງ:</span>
            <span className="num font-semibold text-fg-strong">
              {filteredRows.length.toLocaleString('en-US')}
            </span>
            {isFilterActive && (
              <span className="text-muted text-[11px]">
                (ຈາກທັງໝົດ {rows.length.toLocaleString('en-US')})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-muted">ຮັບເຂົ້າລວມ:</span>
              {summary.inflows.length > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  {summary.inflows.map((inf) => (
                    <span key={inf.currency} className="num font-semibold text-success">
                      (+) {formatByCurrency(inf.amount, inf.currency)}{' '}
                      <span className="text-[10px] opacity-80">{inf.currency}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="num text-muted">0</span>
              )}
            </div>

            <span className="text-muted opacity-40">·</span>

            <div className="flex items-center gap-1.5">
              <span className="text-muted">ຈ່າຍອອກລວມ:</span>
              {summary.outflows.length > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  {summary.outflows.map((out) => (
                    <span key={out.currency} className="num font-semibold text-danger">
                      (−) {formatByCurrency(out.amount, out.currency)}{' '}
                      <span className="text-[10px] opacity-80">{out.currency}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="num text-muted">0</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Main Data Table ── */}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Cash">
          <table className="table">
            <thead>
              <tr>
                <th className="w-[140px]">ວັນທີ & ເວລາ</th>
                <th className="w-[130px]">ປະເພດ</th>
                <th className="w-[150px]">ທີ່ມາ / ອ້າງອີງ</th>
                <th className="w-[90px]">ສະກຸນເງິນ</th>
                <th className="text-right w-[160px]">ຈຳນວນເງິນ</th>
                <th>ໝາຍເຫດ</th>
                <th className="w-[120px]">ຜູ້ບັນທຶກ</th>
                <th className="text-right w-[70px]">ລາຍລະອຽດ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={8}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການໃນຊ່ວງວັນທີນີ້"
                onRetry={history.refetch}
              />

              {/* Zero search results state */}
              {rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <SearchIcon className="h-8 w-8 text-muted opacity-40" />
                      <span className="text-sm font-medium text-fg">ບໍ່ພົບຂໍ້ມູນທີ່ກົງກັບເງື່ອນໄຂ</span>
                      <span className="text-xs text-muted">
                        ລອງປ່ຽນຄຳຄົ້ນຫາ ຫຼື ປັບປ່ຽນຕົວກັ່ນຕອງ
                      </span>
                      <button
                        type="button"
                        className="btn-secondary text-xs h-8 mt-2 cursor-pointer"
                        onClick={handleResetFilters}
                      >
                        ລ້າງຕົວກັ່ນຕອງ
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {pager.pageItems.map((row) => {
                const isInflow = isRowInflow(row);
                const typeInfo = TYPE_CONFIG[row.type] ?? {
                  label: row.type,
                  isInflow,
                  badgeClass: isInflow ? 'status-success' : 'status-danger',
                };
                const refLabel = REF_CONFIG[row.refType ?? '']?.label ?? row.refType ?? '—';

                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors duration-150"
                    onClick={() => setSelectedRow(row)}
                  >
                    <td>
                      <div className="font-medium text-fg-strong">
                        {formatDate(row.createdAt)}
                      </div>
                      <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                        <ClockIcon className="h-3 w-3 opacity-60" />
                        <span>{formatTimeOnly(row.createdAt)}</span>
                      </div>
                    </td>

                    <td>
                      <span className={typeInfo.badgeClass}>
                        {isInflow ? '+' : '−'} {typeInfo.label}
                      </span>
                    </td>

                    <td>
                      <span className="badge text-xs font-normal">
                        {refLabel}
                      </span>
                      {row.refId && (
                        <span
                          className="block font-mono text-[10px] text-muted mt-0.5 max-w-[130px] truncate"
                          title={row.refId}
                        >
                          #{row.refId.slice(-6)}
                        </span>
                      )}
                    </td>

                    <td>
                      <span className="badge font-mono text-[11px] font-semibold">
                        {row.currency}
                      </span>
                    </td>

                    <td
                      className={`num text-right font-semibold ${
                        isInflow ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {isInflow ? '(+) ' : '(−) '}
                      {formatByCurrency(row.amount, row.currency)}
                    </td>

                    <td className="text-muted max-w-xs truncate" title={row.note ?? ''}>
                      {row.note ?? '—'}
                    </td>

                    <td className="text-muted text-xs">{row.createdBy}</td>

                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-ghost text-xs px-2 py-1 h-8 cursor-pointer"
                        title="ເບິ່ງລາຍລະອຽດ"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRow(row);
                        }}
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <Pagination {...pager} />
      </div>

      {/* ── Transaction Details Dialog ── */}
      <Dialog
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        title="ລາຍລະອຽດທຸລະກຳເງິນສົດ"
        size="md"
        footer={
          <button
            type="button"
            className="btn-secondary cursor-pointer"
            onClick={() => setSelectedRow(null)}
          >
            ປິດ
          </button>
        }
      >
        {selectedRow && (
          <div className="space-y-4">
            {/* Top Summary Banner */}
            <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--recessed)] flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs text-muted block mb-1">ຍອດເງິນເຄື່ອນໄຫວ</span>
                <div
                  className={`num text-2xl font-bold ${
                    isRowInflow(selectedRow) ? 'text-success' : 'text-danger'
                  }`}
                >
                  {isRowInflow(selectedRow) ? '(+) ' : '(−) '}
                  {formatByCurrency(selectedRow.amount, selectedRow.currency)}{' '}
                  <span className="text-sm font-semibold">{selectedRow.currency}</span>
                </div>
              </div>
              <div>
                <span
                  className={
                    TYPE_CONFIG[selectedRow.type]?.badgeClass ??
                    (isRowInflow(selectedRow) ? 'status-success' : 'status-danger')
                  }
                >
                  {TYPE_CONFIG[selectedRow.type]?.label ?? selectedRow.type}
                </span>
              </div>
            </div>

            {/* Field Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-solid)]">
                <span className="text-xs text-muted block mb-1">ວັນທີ & ເວລາ</span>
                <span className="font-medium text-fg-strong">
                  {formatDateTime(selectedRow.createdAt)}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-solid)]">
                <span className="text-xs text-muted block mb-1">ຜູ້ລົງບັນທຶກ</span>
                <span className="font-medium text-fg-strong">
                  {selectedRow.createdBy || '—'}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-solid)]">
                <span className="text-xs text-muted block mb-1">ທີ່ມາ / ອ້າງອີງ</span>
                <span className="font-medium text-fg-strong">
                  {REF_CONFIG[selectedRow.refType ?? '']?.label ?? selectedRow.refType ?? '—'}
                </span>
                {selectedRow.refId && (
                  <span
                    className="block font-mono text-xs text-muted mt-1 break-all"
                    title={selectedRow.refId}
                  >
                    Ref ID: {selectedRow.refId}
                  </span>
                )}
              </div>

              <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-solid)]">
                <span className="text-xs text-muted block mb-1">ລະຫັດທຸລະກຳ (ID)</span>
                <span className="font-mono text-xs text-fg-strong break-all select-all">
                  {selectedRow.id}
                </span>
              </div>
            </div>

            {/* Note Box */}
            <div>
              <span className="label">ໝາຍເຫດ</span>
              <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-solid)] text-sm whitespace-pre-wrap min-h-[50px]">
                {selectedRow.note || <span className="text-muted italic">ບໍ່ມີໝາຍເຫດ</span>}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ── Printable Cash Sheet Preview ── */}
      <PrintSheet open={isPrintOpen} onClose={() => setIsPrintOpen(false)}>
        <div className="sheet-head">
          <div>
            <h2>ໃບລາຍງານການເຄື່ອນໄຫວເງິນສົດ (Cash Ledger)</h2>
            <div className="text-xs">ຮ້ານຄຳພູວົງ · KHAMPHOUVONG</div>
          </div>
          <div className="text-right text-xs">
            ຊ່ວງວັນທີ:{' '}
            <b>
              {history.from === history.to ? history.from : `${history.from} – ${history.to}`}
            </b>
            <br />
            ພິມເມື່ອ: {formatDateTime(new Date())}
          </div>
        </div>

        {/* Summary box in print */}
        <div className="my-4 p-3 rounded border border-current/20 text-xs flex flex-wrap items-center justify-between gap-2">
          <div>
            <b>ຈຳນວນລາຍການ: </b>
            {filteredRows.length.toLocaleString('en-US')} ລາຍການ
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <b>ຮັບເຂົ້າລວມ: </b>
              {summary.inflows.length > 0
                ? summary.inflows
                    .map((inf) => `${formatByCurrency(inf.amount, inf.currency)} ${inf.currency}`)
                    .join(' · ')
                : '0'}
            </div>
            <div>
              <b>ຈ່າຍອອກລວມ: </b>
              {summary.outflows.length > 0
                ? summary.outflows
                    .map((out) => `${formatByCurrency(out.amount, out.currency)} ${out.currency}`)
                    .join(' · ')
                : '0'}
            </div>
          </div>
        </div>

        {/* Printable Table */}
        <table className="table">
          <thead>
            <tr>
              <th className="w-10">ລ/ດ</th>
              <th>ວັນທີ-ເວລາ</th>
              <th>ປະເພດ</th>
              <th>ທີ່ມາ/ອ້າງອີງ</th>
              <th>ສະກຸນເງິນ</th>
              <th className="text-right">ຈຳນວນເງິນ</th>
              <th>ໝາຍເຫດ</th>
              <th>ຜູ້ບັນທຶກ</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => {
              const isInflow = isRowInflow(row);
              return (
                <tr key={row.id}>
                  <td>{idx + 1}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{TYPE_CONFIG[row.type]?.label ?? row.type}</td>
                  <td>{REF_CONFIG[row.refType ?? '']?.label ?? row.refType ?? '—'}</td>
                  <td>{row.currency}</td>
                  <td className="text-right num font-semibold">
                    {isInflow ? '(+) ' : '(−) '}
                    {formatByCurrency(row.amount, row.currency)}
                  </td>
                  <td>{row.note ?? '—'}</td>
                  <td>{row.createdBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="sheet-sign">
          <div>ຜູ້ລາຍງານ / Cashier</div>
          <div>ຜູ້ກວດກາບັນຊີ / Accountant</div>
          <div>ຜູ້ຈັດການຮ້ານ / Manager</div>
        </div>
      </PrintSheet>
    </div>
  );
}
