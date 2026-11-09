'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';
import { formatMoney, formatDate, formatByCurrency } from '@/lib/format';
import { NumberInput } from './number-input';
import { PageHead } from './page-head';
import { StatCard } from './stat-card';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { isPositive } from '@/lib/validate';
import { AddApArCashModal } from './add-ap-ar-cash-modal';
import { Dialog } from './dialog';
import type { CashBalance, BankBalance } from './multi-payment';

interface Total { currency: 'LAK' | 'THB' | 'USD'; opening: string; increases: string; decreases: string; net: string }
interface PartnerRow {
  partnerId: string; partnerCode: string; partnerNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  broughtForward: string; increases: string; decreases: string; current: string;
}
interface HistoryRow {
  id: string; businessDate: string; refType: string; currency: string;
  amountIn: string; amountOut: string; balance: string; note: string | null;
  partner: { nameLo: string } | null;
  category: { nameLo: string } | null;
  method?: 'CASH' | 'BANK' | null;
  bankAccountId?: string | null;
  bankAccount?: { id: string; nameLo: string; code?: string } | null;
  /** ຜູ້ບັນທຶກລາຍການນີ້. */
  createdBy: string;
}
interface Partner { id: string; nameLo: string }
interface Category { id: string; nameLo: string }
interface Bank { id: string; nameLo: string }

/**
 * TOR §9.3 / §9.4 — Module AR (Cash) and Module AP (Cash).
 *
 * The updated TOR gives each side its own window, but they are structurally
 * identical: totals, a per-Supplier table with a Payment button, and history.
 * One parameterised component rather than two near-copies.
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
  const [showAdd, setShowAdd] = useState(false);
  const [settling, setSettling] = useState<PartnerRow | null>(null);
  const [viewingHistory, setViewingHistory] = useState<HistoryRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [settleAmount, setSettleAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');

  const { data: totals = [] } = useQuery({
    queryKey: ['finance', 'ap-ar', side, 'totals'],
    queryFn: () => api.get<Total[]>(`/finance/ap-ar/${side}/totals`),
  });
  const { data: partnerRows = [], isError: partnersFailed, error: partnersError, refetch: refetchPartners } = useQuery({
    queryKey: ['finance', 'ap-ar', side, 'partners'],
    queryFn: () => api.get<PartnerRow[]>(`/finance/ap-ar/${side}/partners`),
  });
  // ປະຫວັດ: ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້, ກວ້າງອອກໄດ້ຈາກແຖບ filter.
  const historyRange = useHistoryRange<HistoryRow>(
    ['finance', 'ap-ar', side, 'history'],
    `/finance/ap-ar/${side}/history`,
  );
  const history = historyRange.rows;
  const historyFailed = historyRange.isError;
  const historyError = historyRange.error;
  const refetchHistory = historyRange.refetch;
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });

  const isApSettling = side === 'AP' && Boolean(settling);
  const { data: cashBalances = [] } = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<CashBalance[]>('/cash/balances'),
    enabled: isApSettling,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const { data: bankBalances = [] } = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
    enabled: isApSettling,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const settleValidationError = (() => {
    if (!settling) return null;
    const amt = Number(settleAmount.replace(/,/g, '').trim());
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const maxCurrent = Number(settling.current) || 0;
    if (amt > maxCurrent + 0.0001) {
      return `ຈຳນວນເງິນທີ່ຊຳຣະເກີນຍອດຄ້າງປັດຈຸບັນ (${formatByCurrency(maxCurrent, settling.currency)} ${settling.currency})`;
    }
    if (side === 'AP') {
      if (method === 'CASH') {
        const cb = cashBalances.find((c) => c.currency === settling.currency);
        const avail = Number(cb?.balance ?? 0);
        if (amt > avail + 0.0001) {
          return `ເງິນສົດ ${settling.currency} ໃນຮ້ານ (Module Cash) ບໍ່ພໍສຳລັບຊຳຣະໜີ້ AP (ມີເຫຼືອ ${formatByCurrency(avail, settling.currency)} ${settling.currency}, ຕ້ອງການຈ່າຍ ${formatByCurrency(amt, settling.currency)} ${settling.currency})`;
        }
      } else if (method === 'BANK' && bankAccountId) {
        const bb = bankBalances.find(
          (b) => b.bankAccountId === bankAccountId && b.currency === settling.currency,
        );
        const avail = Number(bb?.actual ?? 0);
        const bankName =
          bb?.bankNameLo ?? banks.find((b) => b.id === bankAccountId)?.nameLo ?? 'ທະນາຄານ';
        if (amt > avail + 0.0001) {
          return `ຍອດເງິນ ${settling.currency} ໃນບັນຊີ ${bankName} (Module Bank) ບໍ່ພໍສຳລັບຊຳຣະໜີ້ AP (ມີເຫຼືອ ${formatByCurrency(avail, settling.currency)} ${settling.currency}, ຕ້ອງການຈ່າຍ ${formatByCurrency(amt, settling.currency)} ${settling.currency})`;
        }
      }
    }
    return null;
  })();

  const canConfirmSettle =
    Boolean(settling) &&
    isPositive(settleAmount) &&
    (method === 'CASH' || Boolean(bankAccountId)) &&
    !settleValidationError;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['finance', 'ap-ar', side] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
  };

  const settle = useMutation({
    mutationFn: (row: PartnerRow) =>
      api.post(`/finance/ap-ar/${side}/settle`, {
        partnerId: row.partnerId,
        currency: row.currency,
        method,
        bankAccountId: method === 'BANK' ? bankAccountId : undefined,
        amount: settleAmount.replace(/,/g, '').trim(),
      }),
    onSuccess: () => {
      setSettling(null);
      setSettleAmount('');
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : side === 'AR' ? 'ຮັບເງິນບໍ່ສຳເລັດ' : 'ຊຳຣະບໍ່ສຳເລັດ'),
  });

  return (
    <div className="space-y-6">
      <PageHead
        title={titleLo}
        subtitle={descriptionLo}
        actions={
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
        }
      />

      <AddApArCashModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        side={side}
      />

      {error && (
        <div id="apar-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {settleValidationError && (
        <div role="alert" className="notice status-danger text-xs">{settleValidationError}</div>
      )}

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

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ແຍກຕາມ Supplier</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ແຍກຕາມ Supplier">
          <table className="table">
            <thead>
              <tr>
                <th>ແຫຼ່ງ Supplier</th>
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
                isError={partnersFailed}
                error={partnersError}
                isEmpty={partnerRows.length === 0}
                emptyText="ຍັງບໍ່ມີຍອດຄ້າງ"
                onRetry={() => void refetchPartners()}
              />
              {partnerRows.map((row) => (
                <tr key={`${row.partnerId}-${row.currency}`}>
                  <td className="font-medium">{row.partnerNameLo}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right">{formatByCurrency(row.broughtForward, row.currency)}</td>
                  <td className="num text-right text-success">{formatByCurrency(row.increases, row.currency)}</td>
                  <td className="num text-right text-danger">{formatByCurrency(row.decreases, row.currency)}</td>
                  <td className="num text-right font-semibold">{formatByCurrency(row.current, row.currency)}</td>
                  <td className="text-right">
                    {settling?.partnerId === row.partnerId && settling.currency === row.currency ? (
                      <div className="flex items-center justify-end gap-2">
                        <select className="input w-24" aria-label={side === 'AR' ? 'ຮັບເງິນ' : 'Payment'} value={method}
                          onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')}>
                          <option value="CASH">Cash</option>
                          <option value="BANK">Bank</option>
                        </select>
                        {method === 'BANK' && (
                          <select className="input w-32" aria-label="ທະນາຄານ" value={bankAccountId}
                            onChange={(e) => setBankAccountId(e.target.value)}>
                            <option value="">ທະນາຄານ</option>
                            {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
                          </select>
                        )}
                        <NumberInput className="input num w-32 text-right" decimals={row.currency === 'LAK' ? 0 : 2} aria-label="ຈຳນວນເງິນ" aria-describedby={error ? 'apar-error' : undefined}
                          placeholder={row.current} value={settleAmount}
                          onValueChange={setSettleAmount} autoFocus />
                        <button className="btn-ghost"
                          onClick={() => settle.mutate(row)} disabled={settle.isPending || !canConfirmSettle}>
                          ຢືນຢັນ
                        </button>
                        <button className="btn-ghost !text-muted"
                          onClick={() => setSettling(null)}>
                          ຍົກເລີກ
                        </button>
                      </div>
                    ) : (
                      <button className="btn-ghost"
                        onClick={() => { setSettling(row); setSettleAmount(''); setShowAdd(false); }}>
                        {side === 'AR' ? 'ຮັບເງິນ' : 'Payment'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">History {side} (Cash)</h2></div>
        <DateRangeFilter history={historyRange} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label={`History ${side} (Cash)`}>
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ແຫຼ່ງ Supplier</th>
                <th>ປະເພດລາຍການ</th>
                <th>ປະເພດ</th>
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
                isError={historyFailed}
                error={historyError}
                isEmpty={history.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void refetchHistory()}
              />
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td>{row.partner?.nameLo ?? '—'}</td>
                  <td>{row.category?.nameLo ?? '—'}</td>
                  <td className="text-muted">{row.refType}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right text-success">{formatByCurrency(row.amountIn, row.currency)}</td>
                  <td className="num text-right text-danger">{formatByCurrency(row.amountOut, row.currency)}</td>
                  <td className="num text-right font-medium">{formatByCurrency(row.balance, row.currency)}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn-ghost inline-flex items-center gap-1.5"
                      onClick={() => setViewingHistory(row)}
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
      </div>

      {/* Modal ລາຍລະອຽດປະຫວັດ (History Detail Modal) */}
      <Dialog
        open={Boolean(viewingHistory)}
        onClose={() => setViewingHistory(null)}
        title={`ລາຍລະອຽດ ${side} (Cash)`}
        size="md"
        dismissOnScrim={true}
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted font-mono">
              {viewingHistory ? `ID: ${viewingHistory.id}` : ''}
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setViewingHistory(null)}
            >
              ປິດ (Close)
            </button>
          </div>
        }
      >
        {viewingHistory && (() => {
          const resolvedMethod: 'CASH' | 'BANK' | null =
            viewingHistory.method ??
            (viewingHistory.bankAccount || viewingHistory.bankAccountId
              ? 'BANK'
              : (viewingHistory.note || '').toLowerCase().includes('ໂອນ') ||
                (viewingHistory.note || '').toLowerCase().includes('bank') ||
                (viewingHistory.note || '').toLowerCase().includes('bcel') ||
                (viewingHistory.note || '').toLowerCase().includes('jdb') ||
                (viewingHistory.note || '').toLowerCase().includes('ldb')
                ? 'BANK'
                : viewingHistory.refType === 'SETTLEMENT' || (viewingHistory.note && viewingHistory.note.includes('ຊຳຣະ'))
                  ? 'CASH'
                  : null);

          const resolvedBankName =
            viewingHistory.bankAccount?.nameLo ??
            banks.find((b) => b.id === viewingHistory.bankAccountId)?.nameLo ??
            banks.find((b) => viewingHistory.note?.toLowerCase().includes(b.nameLo.toLowerCase()))?.nameLo ??
            null;

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
                    <span className="badge recessed font-mono text-xs">
                      {viewingHistory.refType}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">ວັນທີທຸລະກຳ</div>
                  <div className="text-sm font-semibold text-fg mt-1">
                    {formatDate(viewingHistory.businessDate)}
                  </div>
                </div>
              </div>

              {/* Grid Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg border border-line bg-panel/40">
                  <div className="text-xs text-muted">ແຫຼ່ງ Supplier / ຄູ່ຄ້າ</div>
                  <div className="font-semibold text-fg mt-1">
                    {viewingHistory.partner?.nameLo ?? '—'}
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
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-[var(--gold)] uppercase tracking-wider">
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
                      {Number(viewingHistory.amountIn) > 0
                        ? `+${formatByCurrency(viewingHistory.amountIn, viewingHistory.currency)}`
                        : '0'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block">ຫຼຸດ (−)</span>
                    <span className="num font-semibold text-danger block text-base mt-0.5">
                      {Number(viewingHistory.amountOut) > 0
                        ? `−${formatByCurrency(viewingHistory.amountOut, viewingHistory.currency)}`
                        : '0'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted block">ຍອດສະສົມ (Balance)</span>
                    <span className="num font-bold text-[var(--gold)] block text-base mt-0.5">
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
                        <>
                          <svg className="w-4 h-4 text-info shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="5" width="20" height="14" rx="2" />
                            <line x1="2" y1="10" x2="22" y2="10" />
                          </svg>
                          <span>ເງິນໂອນ (Bank Transfer)</span>
                        </>
                      ) : resolvedMethod === 'CASH' ? (
                        <>
                          <svg className="w-4 h-4 text-success shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="6" width="20" height="12" rx="2" />
                            <circle cx="12" cy="12" r="2" />
                            <path d="M6 12h.01M18 12h.01" />
                          </svg>
                          <span>ເງິນສົດ (Cash)</span>
                        </>
                      ) : (
                        <span className="text-muted">— ບໍ່ໄດ້ລະບຸ —</span>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-recessed/60 border border-line/60">
                    <span className="text-muted block text-[11px]">
                      {resolvedMethod === 'BANK' ? 'ໂອນຈາກ / ໂອນຜ່ານ Bank' : 'ແຫຼ່ງເກັບເງິນ / ບັນຊີ'}
                    </span>
                    <div className="font-medium text-fg mt-1 flex items-center gap-1.5">
                      {resolvedMethod === 'BANK' ? (
                        <>
                          <svg className="w-4 h-4 text-[var(--gold)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                          </svg>
                          <span className="font-semibold text-fg truncate">
                            {resolvedBankName ? resolvedBankName : '— ບໍ່ໄດ້ລະບຸ Bank —'}
                          </span>
                        </>
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
