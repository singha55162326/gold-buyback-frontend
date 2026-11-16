'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec } from '@kpv/domain';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { formatDate, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from './page-head';
import { StatCard } from './stat-card';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { TimeSearchFilterBar, useTimeSearchFilter } from '@/components/time-search-filter';
import { Pagination, usePagination } from '@/components/pagination';
import { AddApArCashModal } from './add-ap-ar-cash-modal';
import { SettleApArCashModal, type ApArPartnerRow } from './settle-ap-ar-cash-modal';
import { Dialog } from './dialog';
import { useToast } from './toast';

interface Total {
  currency: 'LAK' | 'THB' | 'USD';
  opening: string;
  increases: string;
  decreases: string;
  net: string;
}

interface HistoryRow {
  id: string;
  businessDate: string;
  createdAt?: string;
  refType: string;
  refId?: string | null;
  currency: string;
  amountIn: string;
  amountOut: string;
  balance: string;
  note: string | null;
  partnerId?: string | null;
  partner: { id?: string; nameLo: string } | null;
  category: { nameLo: string } | null;
  method?: 'CASH' | 'BANK' | null;
  bankAccountId?: string | null;
  bankAccount?: { id: string; nameLo: string; code?: string } | null;
  /** ຜູ້ບັນທຶກລາຍການນີ້. */
  createdBy: string;
}

interface Bank {
  id: string;
  nameLo: string;
}

function safeDec(value: string | number | null | undefined) {
  try {
    return dec(value ?? 0);
  } catch {
    return dec(0);
  }
}

function formatRefTypeLabel(row: Pick<HistoryRow, 'refType' | 'amountIn' | 'amountOut'>, side: 'AP' | 'AR'): string {
  switch (row.refType) {
    case 'LABOR_PAYABLE':
      return 'ຄ່າແຮງຊ່າງຄ້າງຈ່າຍ';
    case 'LABOR_PAYMENT':
      return 'ຈ່າຍຄ່າແຮງຊ່າງ';
    case 'CREDIT_ISSUED':
      return 'ຍອດສິນເຊື່ອໃໝ່';
    case 'CREDIT_RECEIPT':
      return 'ຮັບຄ່າງວດສິນເຊື່ອ';
    case 'ADJUSTMENT': {
      const isOut = safeDec(row.amountOut).gt(0) && safeDec(row.amountIn).lte(0);
      if (isOut) {
        return side === 'AP' ? 'ຊຳຣະໜີ້ AP' : 'ຮັບຊຳຣະ AR';
      }
      return `ເພີ່ມຍອດ ${side}`;
    }
    case 'OPENING':
      return 'ຍອດຕັ້ງຕົ້ນ';
    default:
      return row.refType;
  }
}

/**
 * TOR §9.3 / §9.4 — Module AR (Cash) and Module AP (Cash).
 *
 * One parameterised component for both sides: currency totals, a per-Partner
 * breakdown with modal settlement, and filterable/paginated ledger history.
 */
export function ApArCashModule({
  side,
  titleLo,
  descriptionLo,
}: {
  side: 'AP' | 'AR';
  titleLo: string;
  descriptionLo: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [settling, setSettling] = useState<ApArPartnerRow | null>(null);
  const [viewingHistory, setViewingHistory] = useState<HistoryRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('');
  const timeSearch = useTimeSearchFilter();

  const userRole = getStoredUser()?.role;
  const canWrite =
    userRole === 'ADMIN' || userRole === 'MANAGER' || userRole === 'FINANCIAL_CONTROLLER';

  const {
    data: totals = [],
    isLoading: totalsLoading,
    isError: totalsFailed,
    error: totalsError,
    refetch: refetchTotals,
  } = useQuery({
    queryKey: ['finance', 'ap-ar', side, 'totals'],
    queryFn: () => api.get<Total[]>(`/finance/ap-ar/${side}/totals`),
  });

  const {
    data: partnerRows = [],
    isLoading: partnersLoading,
    isError: partnersFailed,
    error: partnersError,
    refetch: refetchPartners,
  } = useQuery({
    queryKey: ['finance', 'ap-ar', side, 'partners'],
    queryFn: () => api.get<ApArPartnerRow[]>(`/finance/ap-ar/${side}/partners`),
  });

  // ປະຫວັດ: ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້, ກວ້າງອອກໄດ້ຈາກແຖບ filter.
  const historyRange = useHistoryRange<HistoryRow>(
    ['finance', 'ap-ar', side, 'history'],
    `/finance/ap-ar/${side}/history`,
    {
      params: {
        partnerId: selectedPartnerId || undefined,
        currency: selectedCurrency || undefined,
        start_time: timeSearch.startTime || undefined,
        end_time: timeSearch.endTime || undefined,
        search: timeSearch.debouncedSearch || undefined,
      },
    },
  );
  const history = historyRange.rows;
  const pager = usePagination(history);

  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });

  const uniquePartners = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of partnerRows) {
      if (!map.has(r.partnerId)) map.set(r.partnerId, r.partnerNameLo);
    }
    return Array.from(map.entries()).map(([id, nameLo]) => ({ id, nameLo }));
  }, [partnerRows]);

  // Detect any unassigned AR balance (e.g. GoldCredit rows without partnerId).
  const unallocatedByCurrency = useMemo(() => {
    if (totalsLoading || partnersLoading || totals.length === 0) return [];
    const diffs: Array<{ currency: Total['currency']; amount: string }> = [];
    for (const t of totals) {
      const partnerSum = partnerRows
        .filter((p) => p.currency === t.currency)
        .reduce((acc, p) => acc.plus(safeDec(p.current)), dec(0));
      const diff = safeDec(t.net).minus(partnerSum);
      if (diff.abs().gt(0)) {
        diffs.push({ currency: t.currency, amount: diff.toFixed() });
      }
    }
    return diffs;
  }, [totals, partnerRows, totalsLoading, partnersLoading]);

  const deleteEntry = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/ap-ar/${side}/entries/${id}`),
    onSuccess: () => {
      toast.success(`ລຶບລາຍການ ${side} (Cash) ສຳເລັດ`);
      setConfirmDeleteId(null);
      setViewingHistory(null);
      void queryClient.invalidateQueries({ queryKey: ['finance', 'ap-ar', side] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ';
      toast.error('ລຶບບໍ່ສຳເລັດ', msg);
    },
  });

  const handleRefreshAll = () => {
    void refetchTotals();
    void refetchPartners();
    historyRange.refetch();
  };

  const partnerHeading = side === 'AP' ? 'ແຍກຕາມ Supplier / ຊ່າງ' : 'ແຍກຕາມແຫຼ່ງ / ຄູ່ຄ້າ';
  const partnerColLabel = side === 'AP' ? 'Supplier / ຊ່າງ' : 'ແຫຼ່ງ / ຄູ່ຄ້າ';

  const canDeleteViewing =
    Boolean(viewingHistory) &&
    canWrite &&
    viewingHistory?.refType === 'ADJUSTMENT' &&
    !viewingHistory?.refId &&
    safeDec(viewingHistory?.amountIn).gt(0);

  return (
    <div className="space-y-6">
      <PageHead
        title={titleLo}
        subtitle={descriptionLo}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm h-9 py-0 px-3 text-xs"
              onClick={handleRefreshAll}
            >
              ໂຫຼດຂໍ້ມູນຄືນ
            </button>
            <button
              type="button"
              className="btn-primary"
              aria-haspopup="dialog"
              onClick={() => {
                setShowAdd(true);
                setSettling(null);
              }}
            >
              + Add {side} Cash
            </button>
          </div>
        }
      />

      <AddApArCashModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        side={side}
      />

      <SettleApArCashModal
        row={settling}
        onClose={() => setSettling(null)}
        side={side}
      />

      {totalsFailed ? (
        <QueryErrorNotice error={totalsError} onRetry={() => void refetchTotals()} />
      ) : totalsLoading ? (
        <div className="stat-grid">
          {(['LAK', 'THB', 'USD'] as const).map((c) => (
            <StatCard key={c} label={`ຍອດລວມ ${side} (Cash) — ${c}`} value="…" sub="ກຳລັງໂຫຼດ..." />
          ))}
        </div>
      ) : (
        <div className="stat-grid">
          {totals.map((t) => (
            <StatCard
              key={t.currency}
              label={`ຍອດລວມ ${side} (Cash) — ${t.currency}`}
              value={formatByCurrency(t.net, t.currency)}
              sub={`ຍົກມາ ${formatByCurrency(t.opening, t.currency)} · (+) ${formatByCurrency(t.increases, t.currency)} · (−) ${formatByCurrency(t.decreases, t.currency)}`}
            />
          ))}
        </div>
      )}

      {side === 'AR' && unallocatedByCurrency.length > 0 && (
        <div data-fade className="notice status-info text-xs">
          <span>
            ຍອດລວມ AR (Cash) ລວມຍອດສິນເຊື່ອລູກຄ້າ (Module Credit) ທີ່ບໍ່ໄດ້ຜູກກັບແຫຼ່ງຄູ່ຄ້າ:{' '}
            <strong>
              {unallocatedByCurrency
                .map((d) => `${formatByCurrency(d.amount, d.currency)} ${d.currency}`)
                .join(' · ')}
            </strong>{' '}
            (ຊຳຣະງວດໄດ້ທີ່ໜ້າ ລາຍການສິນເຊື່ອ)
          </span>
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="card-title">{partnerHeading}</h2>
            <p className="text-xs text-muted mt-0.5">
              ຄລິກທີ່ແຖວເພື່ອກອງປະຫວັດສະເພາະຄູ່ຄ້ານັ້ນ
            </p>
          </div>
          {selectedPartnerId && (
            <button
              type="button"
              className="btn-ghost btn-sm text-xs h-7 py-0"
              onClick={() => setSelectedPartnerId('')}
            >
              ສະແດງທຸກຄູ່ຄ້າ
            </button>
          )}
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={partnerHeading}>
          <table className="table">
            <thead>
              <tr>
                <th>{partnerColLabel}</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຍອດຍົກມາ</th>
                <th className="text-right">(+)</th>
                <th className="text-right">(−)</th>
                <th className="text-right">ຍອດປັດຈຸບັນ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={7}
                isLoading={partnersLoading}
                isError={partnersFailed}
                error={partnersError}
                isEmpty={partnerRows.length === 0}
                emptyText="ຍັງບໍ່ມີຍອດຄ້າງ"
                onRetry={() => void refetchPartners()}
              />
              {partnerRows.map((row) => {
                const isSelected = selectedPartnerId === row.partnerId;
                const hasOutstanding = safeDec(row.current).gt(0);
                const hadActivity =
                  safeDec(row.broughtForward).gt(0) ||
                  safeDec(row.increases).gt(0) ||
                  safeDec(row.decreases).gt(0);
                return (
                  <tr
                    key={`${row.partnerId}-${row.currency}`}
                    className={`cursor-pointer transition-colors hover:bg-recessed/50 ${
                      isSelected ? 'bg-recessed/80 font-medium' : ''
                    }`}
                    onClick={() =>
                      setSelectedPartnerId((curr) => (curr === row.partnerId ? '' : row.partnerId))
                    }
                  >
                    <td className="font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{row.partnerNameLo}</span>
                        {row.isActive === false && (
                          <span className="badge recessed text-[10px]">ປິດນຳໃຊ້</span>
                        )}
                        {isSelected && (
                          <span className="badge status-info text-[10px]">ເລືອກຢູ່</span>
                        )}
                      </div>
                    </td>
                    <td>{row.currency}</td>
                    <td className="num text-right">{formatByCurrency(row.broughtForward, row.currency)}</td>
                    <td className="num text-right text-success">{formatByCurrency(row.increases, row.currency)}</td>
                    <td className="num text-right text-danger">{formatByCurrency(row.decreases, row.currency)}</td>
                    <td className="num text-right font-semibold">{formatByCurrency(row.current, row.currency)}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      {hasOutstanding ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          aria-haspopup="dialog"
                          onClick={() => {
                            setSettling(row);
                            setShowAdd(false);
                          }}
                        >
                          {side === 'AR' ? 'ຮັບເງິນ' : 'Payment'}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">
                          {hadActivity ? 'ຊຳຣະຄົບແລ້ວ' : 'ບໍ່ມີຍອດຄ້າງ'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <h2 className="card-title">History {side} (Cash)</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="apar-history-partner" className="text-xs font-medium text-muted">
              {partnerColLabel}:
            </label>
            <select
              id="apar-history-partner"
              className="input h-8 !w-auto text-xs py-0 px-2"
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
            >
              <option value="">ທັງໝົດ</option>
              {uniquePartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameLo}
                </option>
              ))}
              {side === 'AR' && <option value="UNASSIGNED">ສິນເຊື່ອ / ບໍ່ລະບຸແຫຼ່ງ</option>}
            </select>

            <label htmlFor="apar-history-currency" className="text-xs font-medium text-muted">
              ສະກຸນເງິນ:
            </label>
            <select
              id="apar-history-currency"
              className="input h-8 !w-auto text-xs py-0 px-2"
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
            >
              <option value="">ທັງໝົດ</option>
              <option value="LAK">LAK</option>
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <DateRangeFilter history={historyRange} />
        <TimeSearchFilterBar
          filter={timeSearch}
          fromDate={historyRange.from}
          toDate={historyRange.to}
          searchPlaceholder="ຄົ້ນຫາ ຄູ່ຄ້າ / ປະເພດ / ໝາຍເຫດ..."
        />
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`History ${side} (Cash)`}>
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>{partnerColLabel}</th>
                <th>ປະເພດລາຍການ</th>
                <th>ທຸລະກຳ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">(+)</th>
                <th className="text-right">(−)</th>
                <th className="text-right">ຍອດສະສົມ</th>
                <th>ໝາຍເຫດ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={11}
                isLoading={historyRange.isLoading}
                isError={historyRange.isError}
                error={historyRange.error}
                isEmpty={history.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => historyRange.refetch()}
              />
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{formatDate(row.businessDate)}</div>
                    {row.createdAt && (
                      <div className="text-[11px] text-muted num">
                        {formatDateTime(row.createdAt).split(' ')[1]}
                      </div>
                    )}
                  </td>
                  <td>{row.partner?.nameLo ?? (row.refType.startsWith('CREDIT') ? 'ລູກຄ້າສິນເຊື່ອ' : '—')}</td>
                  <td>{row.category?.nameLo ?? '—'}</td>
                  <td>
                    <span className="text-xs font-medium text-muted">
                      {formatRefTypeLabel(row, side)}
                    </span>
                  </td>
                  <td>{row.currency}</td>
                  <td className="num text-right text-success">{formatByCurrency(row.amountIn, row.currency)}</td>
                  <td className="num text-right text-danger">{formatByCurrency(row.amountOut, row.currency)}</td>
                  <td className="num text-right font-medium">{formatByCurrency(row.balance, row.currency)}</td>
                  <td className="text-muted max-w-[200px] truncate" title={row.note ?? undefined}>
                    {row.note ?? '—'}
                  </td>
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-ghost inline-flex items-center gap-1.5"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        setViewingHistory(row);
                      }}
                      aria-label={`View detail ${row.id}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      {/* Modal ລາຍລະອຽດປະຫວັດ (History Detail Modal) */}
      <Dialog
        open={Boolean(viewingHistory)}
        onClose={() => {
          setConfirmDeleteId(null);
          setViewingHistory(null);
        }}
        title={`ລາຍລະອຽດ ${side} (Cash)`}
        size="md"
        dismissOnScrim={true}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted font-mono">
              {viewingHistory ? `ID: ${viewingHistory.id}` : ''}
            </span>
            <div className="flex items-center gap-2">
              {canDeleteViewing && viewingHistory && (
                confirmDeleteId === viewingHistory.id ? (
                  <>
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      disabled={deleteEntry.isPending}
                      onClick={() => deleteEntry.mutate(viewingHistory.id)}
                    >
                      {deleteEntry.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={deleteEntry.isPending}
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      ບໍ່ລຶບ
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost text-danger"
                    onClick={() => setConfirmDeleteId(viewingHistory.id)}
                  >
                    ລຶບລາຍການ
                  </button>
                )
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setConfirmDeleteId(null);
                  setViewingHistory(null);
                }}
              >
                ປິດ (Close)
              </button>
            </div>
          </div>
        }
      >
        {viewingHistory && (() => {
          const resolvedMethod: 'CASH' | 'BANK' | null = viewingHistory.method ?? null;
          const resolvedBankName =
            viewingHistory.bankAccount?.nameLo ??
            banks.find((b) => b.id === viewingHistory.bankAccountId)?.nameLo ??
            null;
          const refLabel = formatRefTypeLabel(viewingHistory, side);

          return (
            <div className="space-y-4">
              {/* Header summary banner */}
              <div className="rounded-xl border border-line bg-recessed/60 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">ດ້ານ & ປະເພດທຸລະກຳ</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        side === 'AP' ? 'status-danger' : 'status-success'
                      }`}
                    >
                      {side} (Cash)
                    </span>
                    <span className="badge recessed text-xs">
                      {refLabel}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">ວັນທີ / ເວລາທຸລະກຳ</div>
                  <div className="text-sm font-semibold text-fg mt-1">
                    {viewingHistory.createdAt
                      ? formatDateTime(viewingHistory.createdAt)
                      : formatDate(viewingHistory.businessDate)}
                  </div>
                </div>
              </div>

              {/* Grid Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg border border-line bg-panel/40">
                  <div className="text-xs text-muted">{partnerColLabel}</div>
                  <div className="font-semibold text-fg mt-1">
                    {viewingHistory.partner?.nameLo ?? (viewingHistory.refType.startsWith('CREDIT') ? 'ລູກຄ້າສິນເຊື່ອ' : '—')}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-line bg-panel/40">
                  <div className="text-xs text-muted">ປະເພດລາຍການ</div>
                  <div className="font-medium text-fg mt-1">
                    {viewingHistory.category?.nameLo ?? '—'}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-line bg-panel/40">
                  <div className="text-xs text-muted">ສະກຸນເງິນ</div>
                  <div className="font-semibold text-fg mt-1">
                    {viewingHistory.currency}
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-line bg-panel/40">
                  <div className="text-xs text-muted">ຜູ້ບັນທຶກ</div>
                  <div className="font-medium text-fg mt-1">
                    {viewingHistory.createdBy || '—'}
                  </div>
                </div>
              </div>

              {/* Amounts Card */}
              <div className="rounded-xl border border-line bg-panel/30 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-gold uppercase tracking-wider">
                    ຍອດເງິນ ແລະ ການເຄື່ອນໄຫວ
                  </div>
                  {resolvedMethod && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        resolvedMethod === 'BANK'
                          ? 'bg-info/10 text-info border-info/30'
                          : 'bg-success/10 text-success border-success/30'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          resolvedMethod === 'BANK' ? 'bg-info' : 'bg-success'
                        }`}
                      />
                      {resolvedMethod === 'BANK' ? 'ເງິນໂອນ (Bank Transfer)' : 'ເງິນສົດ (Cash)'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-line text-sm">
                  <div>
                    <span className="text-xs text-muted block">ເພີ່ມ (+)</span>
                    <span className="num font-semibold text-success block text-base mt-0.5">
                      {safeDec(viewingHistory.amountIn).gt(0)
                        ? `+${formatByCurrency(viewingHistory.amountIn, viewingHistory.currency)}`
                        : '0'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block">ຫຼຸດ (−)</span>
                    <span className="num font-semibold text-danger block text-base mt-0.5">
                      {safeDec(viewingHistory.amountOut).gt(0)
                        ? `−${formatByCurrency(viewingHistory.amountOut, viewingHistory.currency)}`
                        : '0'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted block">ຍອດສະສົມ (Balance)</span>
                    <span className="num font-bold text-gold block text-base mt-0.5">
                      {formatByCurrency(viewingHistory.balance, viewingHistory.currency)} {viewingHistory.currency}
                    </span>
                  </div>
                </div>

                {/* Payment Method and Bank Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-line/60 text-xs">
                  <div className="p-2.5 rounded-lg bg-recessed/60 border border-line/60">
                    <span className="text-muted block text-[11px]">ຮູບແບບການຊຳລະ / ຮັບເງິນ</span>
                    <div className="font-medium text-fg mt-1 flex items-center gap-1.5">
                      {resolvedMethod === 'BANK' ? (
                        <span>ເງິນໂອນ (Bank Transfer)</span>
                      ) : resolvedMethod === 'CASH' ? (
                        <span>ເງິນສົດ (Cash)</span>
                      ) : (
                        <span className="text-muted">ບັນທຶກຍອດຄ້າງ (ຍັງບໍ່ເຄື່ອນໄຫວເງິນ)</span>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-recessed/60 border border-line/60">
                    <span className="text-muted block text-[11px]">
                      {resolvedMethod === 'BANK' ? 'ໂອນຈາກ / ໂອນຜ່ານ Bank' : 'ແຫຼ່ງເກັບເງິນ / ບັນຊີ'}
                    </span>
                    <div className="font-medium text-fg mt-1 flex items-center gap-1.5">
                      {resolvedMethod === 'BANK' ? (
                        <span className="font-semibold text-fg truncate">
                          {resolvedBankName ?? '— ບໍ່ໄດ້ລະບຸ Bank —'}
                        </span>
                      ) : resolvedMethod === 'CASH' ? (
                        <span className="text-muted">ລິ້ນຊັກເງິນສົດ (Cash Drawer)</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Note Section */}
              <div className="p-3 rounded-lg border border-line bg-panel/40 text-sm">
                <div className="text-xs text-muted mb-1">ໝາຍເຫດ (Note)</div>
                <div className="text-fg whitespace-pre-wrap break-words">
                  {viewingHistory.note || '— ບໍ່ມີໝາຍເຫດ —'}
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
}
