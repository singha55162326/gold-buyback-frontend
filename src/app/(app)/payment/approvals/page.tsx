'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { Dialog } from '@/components/dialog';
import { QueryErrorNotice } from '@/components/query-state';
import { StatCard } from '@/components/stat-card';
import { useRealtime } from '@/lib/realtime';
import { today, type PagedResult } from '@/components/date-range';
import { creditApi, creditKeys, type CreditRow } from '@/services/credit.service';

/**
 * ຄິວລໍຖ້າອະນຸມັດ ບໍ່ຄວນຫາຍຕອນຂຶ້ນມື້ໃໝ່.
 *
 * ລາຍການປະຫວັດຕັ້ງຕົ້ນເປັນ "ມື້ນີ້" ຕາມ TOR, ແຕ່ບິນທີ່ຍັງບໍ່ໄດ້ອະນຸມັດຈາກມື້
 * ວານ ຍັງຕ້ອງເຫັນຢູ່ — ຈຶ່ງຖາມຍ້ອນຫຼັງ 1 ປີ ແລະ ເອົາທຸກແຖວໃນຊ່ວງ.
 */
const PENDING_RANGE = (() => {
  const to = today();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  const fromIso = `${from.getFullYear()}-${p(from.getMonth() + 1)}-${p(from.getDate())}`;
  return `from_date=${fromIso}&to_date=${to}&all=true&status=PENDING`;
})();

type Currency = 'LAK' | 'THB' | 'USD';

interface WalletBalance {
  currency: Currency;
  inflow: string;
  outflow: string;
  balance: string;
  reserved?: string;
  available?: string;
}

interface Wallet {
  shiftId: string | null;
  openedAt: string | null;
  balances: WalletBalance[];
}

interface BankBalance {
  bankAccountId: string;
  bankCode: string;
  bankNameLo: string;
  currency: Currency;
  actual: string;
}

interface PaymentLeg {
  id: string;
  method: 'CASH' | 'BANK';
  bankAccountId?: string | null;
  bankAccount?: { nameLo: string } | null;
  currency: Currency;
  amount: string;
  amountLak?: string;
  changeLak?: string;
}

interface PendingBuyback {
  id: string; code: string; weightG: string; quantity: number;
  payableAmount: string; createdAt: string;
  customer: { phone: string };
  goldType: { nameLo: string };
  payments?: PaymentLeg[];
}

interface PendingExchange {
  id: string; code: string; totalPayable: string; createdAt: string;
  customer: { phone: string };
  payments?: PaymentLeg[];
}

type ApproveTarget =
  | { path: 'buyback'; label: 'Buyback'; row: PendingBuyback }
  | { path: 'exchange'; label: 'ລາຍການປ່ຽນເປັນເງິນ'; row: PendingExchange }
  | { path: 'credit'; label: 'ລາຍການສິນເຊື່ອ'; row: CreditRow };

/**
 * ກວດສອບວ່າຍອດເງິນໃນ ກະເປົ໋າເງິນສົດ (To Day) ແລະ ທະນາຄານ (Module Bank)
 * ພຽງພໍສຳລັບການ Approve ຫຼື ບໍ່ ເພື່ອປ້ອງກັນບໍ່ໃຫ້ຍອດຕິດລົບ.
 */
function getApprovalBlockers(
  target: ApproveTarget,
  wallet: Wallet | undefined,
  bankBalances: BankBalance[],
): string[] {
  const cashNeeded = new Map<Currency, number>();
  const bankNeeded = new Map<string, { amount: number; bankName?: string }>();

  const addCash = (currency: Currency, amt: number) => {
    if (!(amt > 0)) return;
    cashNeeded.set(currency, (cashNeeded.get(currency) ?? 0) + amt);
  };

  if (target.path === 'credit') {
    const receipts = target.row.receipts ?? [];
    const changeTotal = receipts.reduce((sum, r) => sum + Number(r.changeLak ?? 0), 0);
    if (changeTotal > 0) addCash('LAK', changeTotal);
    if (cashNeeded.size === 0) return [];
  } else {
    const payments = target.row.payments ?? [];
    if (payments.length === 0) return [];

    if (target.path === 'buyback') {
      for (const leg of payments) {
        const amt = Number(leg.amount);
        if (!(amt > 0)) continue;
        if (leg.method === 'CASH') {
          addCash(leg.currency, amt);
        } else if (leg.method === 'BANK' && leg.bankAccountId) {
          const key = `${leg.bankAccountId}:${leg.currency}`;
          const prev = bankNeeded.get(key);
          bankNeeded.set(key, {
            amount: (prev?.amount ?? 0) + amt,
            bankName: prev?.bankName ?? leg.bankAccount?.nameLo,
          });
        }
      }
    } else {
      const payable = Number(target.row.totalPayable);
      if (payable > 0) {
        for (const leg of payments) {
          const amt = Number(leg.amount);
          if (!(amt > 0)) continue;
          if (leg.method === 'CASH') {
            addCash(leg.currency, amt);
          } else if (leg.method === 'BANK' && leg.bankAccountId) {
            const key = `${leg.bankAccountId}:${leg.currency}`;
            const prev = bankNeeded.get(key);
            bankNeeded.set(key, {
              amount: (prev?.amount ?? 0) + amt,
              bankName: prev?.bankName ?? leg.bankAccount?.nameLo,
            });
          }
        }
      } else if (payable < 0) {
        const changeTotal = payments.reduce((sum, leg) => sum + Number(leg.changeLak ?? 0), 0);
        if (changeTotal > 0) addCash('LAK', changeTotal);
      }
    }
  }

  const reasons: string[] = [];
  const walletBalances = Array.isArray(wallet?.balances) ? wallet.balances : [];

  if (cashNeeded.size > 0) {
    if (!wallet?.shiftId) {
      reasons.push('ຍັງບໍ່ໄດ້ເປີດກະ — ກະລຸນາເປີດກະ ແລະ ເບີກເງິນເຂົ້າກະເປົ໋າເງິນສົດ (To Day) ກ່ອນ');
    } else {
      for (const [currency, reqAmount] of cashNeeded) {
        const bal = walletBalances.find((b) => b.currency === currency);
        const available = Number(bal?.available ?? bal?.balance ?? '0');
        if (reqAmount > available + 0.0001) {
          const shortage = reqAmount - available;
          reasons.push(
            `ຍອດເງິນສົດ ${currency} ໃນກະເປົ໋າເງິນສົດ (To Day) ບໍ່ພໍ (ພ້ອມໃຊ້ ${formatByCurrency(String(available), currency)}, ຕ້ອງການ ${formatByCurrency(String(reqAmount), currency)}, ຍັງຂາດ ${formatByCurrency(String(shortage), currency)})`,
          );
        }
      }
    }
  }

  for (const [key, info] of bankNeeded) {
    const [bankAccountId, currency] = key.split(':') as [string, Currency];
    const bal = bankBalances.find(
      (b) => b.bankAccountId === bankAccountId && b.currency === currency,
    );
    const actual = Number(bal?.actual ?? '0');
    const bankName = bal?.bankNameLo ?? info.bankName ?? 'ທະນາຄານ';
    if (info.amount > actual + 0.0001) {
      const shortage = info.amount - actual;
      reasons.push(
        `ຍອດເງິນ ${currency} ໃນບັນຊີ ${bankName} (Module Bank) ບໍ່ພໍ (ມີ ${formatByCurrency(String(actual), currency)}, ຕ້ອງການ ${formatByCurrency(String(info.amount), currency)}, ຍັງຂາດ ${formatByCurrency(String(shortage), currency)})`,
      );
    }
  }

  return reasons;
}

function PaymentLegsSummary({
  payments,
  blockers,
}: {
  payments?: PaymentLeg[];
  blockers: string[];
}) {
  const legs = payments ?? [];
  return (
    <div className="space-y-1">
      {legs.length === 0 ? (
        <span className="text-xs text-muted">—</span>
      ) : (
        <div className="flex flex-col gap-0.5 text-xs">
          {legs.map((leg) => (
            <span key={leg.id} className="num whitespace-nowrap">
              {leg.method === 'CASH' ? 'ສົດ' : `ໂອນ ${leg.bankAccount?.nameLo ?? ''}`.trim()}{' '}
              {formatByCurrency(leg.amount, leg.currency)}
            </span>
          ))}
        </div>
      )}
      {blockers.length > 0 && (
        <div className="space-y-0.5">
          <span className="badge status-danger text-xs">ຍອດເງິນບໍ່ພໍ Approve</span>
          {blockers.map((msg, idx) => (
            <div key={idx} className="text-xs text-danger">
              {msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * TOR §4.2 — payment reviews what the Valuer created.
 *
 * All three transaction types share one approve/reject shape, so they share
 * one screen rather than three near-identical ones.
 */
export default function PaymentApprovalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [approving, setApproving] = useState<ApproveTarget | null>(null);

  const walletQuery = useQuery({
    queryKey: ['cash', 'wallet'],
    queryFn: () => api.get<Wallet>('/cash/wallet'),
  });
  const bankBalancesQuery = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
  });
  const buybacks = useQuery({
    queryKey: ['buyback', 'PENDING'],
    queryFn: () => api.get<PagedResult<PendingBuyback>>(`/buyback?${PENDING_RANGE}`),
  });
  const exchanges = useQuery({
    queryKey: ['exchange', 'PENDING'],
    queryFn: () => api.get<PagedResult<PendingExchange>>(`/exchange?${PENDING_RANGE}`),
  });
  const pendingFromDate = (() => {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${from.getFullYear()}-${p(from.getMonth() + 1)}-${p(from.getDate())}`;
  })();

  const credits = useQuery({
    queryKey: creditKeys.list({ status: 'PENDING', from_date: pendingFromDate, to_date: today(), all: true }),
    queryFn: () =>
      creditApi.list({ status: 'PENDING', from_date: pendingFromDate, to_date: today(), all: true }),
  });

  const wallet = walletQuery.data;
  const walletBalances = Array.isArray(wallet?.balances) ? wallet.balances : [];
  const bankBalances = Array.isArray(bankBalancesQuery.data) ? bankBalancesQuery.data : [];
  const balancesPending = walletQuery.isPending || bankBalancesQuery.isPending;

  const buybackRows = buybacks.data?.rows ?? [];
  const exchangeRows = exchanges.data?.rows ?? [];
  const creditRows = credits.data?.rows ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['buyback'] });
    void queryClient.invalidateQueries({ queryKey: ['exchange'] });
    void queryClient.invalidateQueries({ queryKey: ['credit'] });
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  useRealtime(() => {
    invalidate();
  });

  const review = useMutation({
    mutationFn: (input: {
      path: string;
      id: string;
      decision: 'APPROVED' | 'REJECTED';
      reason?: string;
    }) =>
      input.path === 'credit'
        ? creditApi.review(input.id, { decision: input.decision, reason: input.reason })
        : api.post(`/${input.path}/${input.id}/review`, {
            decision: input.decision,
            reason: input.reason,
          }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setApproving(null);
      setRejecting(null);
      setReason('');
      setError(null);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const closeApproveModal = () => {
    if (review.isPending) return;
    setApproving(null);
    setError(null);
  };

  const actions = (target: ApproveTarget, blockers: string[]) => {
    const { path, row } = target;
    const isBlocked = blockers.length > 0;
    return rejecting === row.id ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input
          className="input w-44"
          aria-label="ເຫດຜົນ"
          aria-describedby={error ? 'approvals-error' : undefined}
          placeholder="ເຫດຜົນ"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <button
          className="btn-danger"
          onClick={() => review.mutate({ path, id: row.id, decision: 'REJECTED', reason })}
          disabled={review.isPending}
        >
          ຢືນຢັນ Reject
        </button>
        <button className="btn-secondary" onClick={() => setRejecting(null)}>
          ຍົກເລີກ
        </button>
      </div>
    ) : (
      <div className="flex justify-end gap-6">
        <button
          type="button"
          className="btn-primary"
          aria-describedby={error ? 'approvals-error' : undefined}
          title={isBlocked ? blockers.join(' · ') : undefined}
          onClick={() => {
            if (isBlocked) return;
            setError(null);
            setRejecting(null);
            setReason('');
            setApproving(target);
          }}
          disabled={review.isPending || balancesPending || isBlocked}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn-danger"
          aria-describedby={error ? 'approvals-error' : undefined}
          onClick={() => setRejecting(row.id)}
        >
          Reject
        </button>
      </div>
    );
  };

  const total = buybackRows.length + exchangeRows.length + creditRows.length;
  const approvingBlockers = approving ? getApprovalBlockers(approving, wallet, bankBalances) : [];

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການລໍຖ້າ Approve"
        subtitle="Buyback, ປ່ຽນເປັນເງິນ ແລະ ສິນເຊື່ອ ທີ່ຜູ້ປະເມີນສ້າງໄວ້ (TOR §4.2)"
      />

      {walletQuery.isError && <QueryErrorNotice error={walletQuery.error} onRetry={() => void walletQuery.refetch()} />}
      {bankBalancesQuery.isError && (
        <QueryErrorNotice error={bankBalancesQuery.error} onRetry={() => void bankBalancesQuery.refetch()} />
      )}
      {buybacks.isError && <QueryErrorNotice error={buybacks.error} onRetry={() => void buybacks.refetch()} />}
      {exchanges.isError && <QueryErrorNotice error={exchanges.error} onRetry={() => void exchanges.refetch()} />}
      {credits.isError && <QueryErrorNotice error={credits.error} onRetry={() => void credits.refetch()} />}

      {!walletQuery.isPending && !walletQuery.isError && wallet && !wallet.shiftId && (
        <div data-fade className="notice status-warning">
          ຍັງບໍ່ໄດ້ເປີດກະ — ລາຍການທີ່ມີການຈ່າຍເງິນສົດຈະບໍ່ສາມາດ Approve ໄດ້ຈົນກວ່າຈະເປີດກະ ແລະ ເບີກເງິນເຂົ້າກະເປົ໋າເງິນສົດ (To Day)
        </div>
      )}

      {walletBalances.length > 0 && (
        <div className="stat-grid">
          {walletBalances.map((b) => {
            const reservedNum = Number(b.reserved ?? '0');
            const availableVal = b.available ?? b.balance;
            return (
              <StatCard
                key={b.currency}
                label={`ກະເປົ໋າເງິນສົດ ${b.currency}`}
                value={formatByCurrency(availableVal, b.currency)}
                sub={
                  reservedNum > 0
                    ? `ຄົງເຫຼືອ ${formatByCurrency(b.balance, b.currency)} · ຈອງລໍຖ້າຢືນຢັນ ${formatByCurrency(b.reserved!, b.currency)}`
                    : `(+) ${formatByCurrency(b.inflow, b.currency)} · (−) ${formatByCurrency(b.outflow, b.currency)}`
                }
              />
            );
          })}
        </div>
      )}

      {error && !approving && (
        <div id="approvals-error" role="alert" className="notice status-danger">
          {error}
        </div>
      )}

      {total === 0 && !buybacks.isError && !exchanges.isError && !credits.isError && (
        <div data-fade className="card p-10 text-center text-muted">ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ</div>
      )}

      {buybackRows.length > 0 && (
        <div data-fade className="card">
          <div className="card-header">
            <h2 className="card-title">Buyback</h2>
            <span className="num text-xs text-muted">{buybackRows.length} ລາຍການ</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Buyback">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th>ວັນທີ</th>
                  <th>ເບີໂທ</th>
                  <th>ປະເພດຄຳ</th>
                  <th className="text-right">ນ້ຳໜັກ (g)</th>
                  <th className="text-right">ຈຳນວນ</th>
                  <th className="text-right">ລາຄາຈ່າຍ</th>
                  <th>ຊ່ອງທາງຈ່າຍ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {buybackRows.map((row) => {
                  const target: ApproveTarget = { path: 'buyback', label: 'Buyback', row };
                  const blockers = getApprovalBlockers(target, wallet, bankBalances);
                  return (
                    <tr key={row.id}>
                      <td className="font-mono text-xs">{row.code}</td>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td className="num">{row.customer.phone}</td>
                      <td>{row.goldType.nameLo}</td>
                      <td className="num text-right">{formatWeight(row.weightG)}</td>
                      <td className="num text-right">{row.quantity}</td>
                      <td className="num text-right font-medium">{formatLak(row.payableAmount)}</td>
                      <td><PaymentLegsSummary payments={row.payments} blockers={blockers} /></td>
                      <td className="text-right">{actions(target, blockers)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {exchangeRows.length > 0 && (
        <div data-fade className="card">
          <div className="card-header">
            <h2 className="card-title">ລາຍການປ່ຽນເປັນເງິນ</h2>
            <span className="num text-xs text-muted">{exchangeRows.length} ລາຍການ</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການປ່ຽນເປັນເງິນ">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th>ວັນທີ</th>
                  <th>ເບີໂທ</th>
                  <th className="text-right">ລວມເງິນຕ້ອງຈ່າຍ</th>
                  <th>ຊ່ອງທາງຈ່າຍ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {exchangeRows.map((row) => {
                  const target: ApproveTarget = { path: 'exchange', label: 'ລາຍການປ່ຽນເປັນເງິນ', row };
                  const blockers = getApprovalBlockers(target, wallet, bankBalances);
                  return (
                    <tr key={row.id}>
                      <td className="font-mono text-xs">{row.code}</td>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td className="num">{row.customer.phone}</td>
                      <td className="num text-right font-medium">{formatLak(row.totalPayable)}</td>
                      <td><PaymentLegsSummary payments={row.payments} blockers={blockers} /></td>
                      <td className="text-right">{actions(target, blockers)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creditRows.length > 0 && (
        <div data-fade className="card">
          <div className="card-header">
            <h2 className="card-title">ລາຍການສິນເຊື່ອ</h2>
            <span className="num text-xs text-muted">{creditRows.length} ລາຍການ</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການສິນເຊື່ອ">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th>ວັນທີ</th>
                  <th>ເບີໂທ</th>
                  <th className="text-right">ລາຄາຂາຍ</th>
                  <th className="text-right">ເງິນວາງດາວ</th>
                  <th className="text-right">ຍອດຕິດໜີ້</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {creditRows.map((row) => {
                  const target: ApproveTarget = { path: 'credit', label: 'ລາຍການສິນເຊື່ອ', row };
                  return (
                    <tr key={row.id}>
                      <td className="font-mono text-xs">{row.code}</td>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td className="num">{row.customer.phone}</td>
                      <td className="num sell-price text-right">{formatLak(row.sellPrice)}</td>
                      <td className="num text-right">{formatLak(row.downPayment)}</td>
                      <td className="num text-right font-medium">{formatLak(row.outstanding)}</td>
                      <td className="text-right">{actions(target, getApprovalBlockers(target, wallet, bankBalances))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(approving)}
        onClose={closeApproveModal}
        title={`ຢືນຢັນ Approve ${approving?.row.code ?? ''}`}
        subtitle={approving?.label}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={review.isPending}
              onClick={closeApproveModal}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={review.isPending || balancesPending || approvingBlockers.length > 0}
              onClick={() =>
                approving &&
                approvingBlockers.length === 0 &&
                review.mutate({
                  path: approving.path,
                  id: approving.row.id,
                  decision: 'APPROVED',
                })
              }
            >
              {review.isPending ? 'ກຳລັງດຳເນີນການ...' : 'Confirm'}
            </button>
          </div>
        }
      >
        {approving && (
          <div className="space-y-3 text-sm">
            <p>
              ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການ Approve ລາຍການ{' '}
              <b className="font-mono text-fg">{approving.row.code}</b>?
            </p>
            <div className="recessed rounded-lg p-3 space-y-1 text-xs">
              <div>ປະເພດ: <b className="text-fg">{approving.label}</b></div>
              <div>ວັນທີ: <b className="text-fg">{formatDateTime(approving.row.createdAt)}</b></div>
              <div>ເບີໂທລູກຄ້າ: <b className="num text-fg">{approving.row.customer.phone}</b></div>
              {approving.path === 'buyback' && (
                <>
                  <div>ປະເພດຄຳ: <b className="text-fg">{approving.row.goldType.nameLo}</b></div>
                  <div>
                    ນ້ຳໜັກ / ຈຳນວນ:{' '}
                    <b className="num text-fg">
                      {formatWeight(approving.row.weightG)} g · {approving.row.quantity}
                    </b>
                  </div>
                  <div>ລາຄາຈ່າຍ: <b className="num text-fg">{formatLak(approving.row.payableAmount)} ກີບ</b></div>
                </>
              )}
              {approving.path === 'exchange' && (
                <div>ລວມເງິນຕ້ອງຈ່າຍ: <b className="num text-fg">{formatLak(approving.row.totalPayable)} ກີບ</b></div>
              )}
              {approving.path !== 'credit' && (approving.row.payments?.length ?? 0) > 0 && (
                <div className="pt-1">
                  ການຈ່າຍເງິນ:{' '}
                  <b className="num text-fg">
                    {approving.row.payments!
                      .map((leg) =>
                        `${leg.method === 'CASH' ? 'ສົດ' : `ໂອນ ${leg.bankAccount?.nameLo ?? ''}`.trim()} ${formatByCurrency(leg.amount, leg.currency)}`,
                      )
                      .join(' + ')}
                  </b>
                </div>
              )}
              {approving.path === 'credit' && (
                <>
                  <div>ລາຄາຂາຍ: <b className="num text-fg">{formatLak(approving.row.sellPrice)} ກີບ</b></div>
                  <div>ເງິນວາງດາວ: <b className="num text-fg">{formatLak(approving.row.downPayment)} ກີບ</b></div>
                  <div>ຍອດຕິດໜີ້: <b className="num text-fg">{formatLak(approving.row.outstanding)} ກີບ</b></div>
                </>
              )}
            </div>
            {approvingBlockers.length > 0 && (
              <div role="alert" className="notice status-danger text-xs space-y-1">
                {approvingBlockers.map((msg, idx) => (
                  <div key={idx}>{msg}</div>
                ))}
              </div>
            )}
            {error && (
              <div role="alert" className="notice status-danger text-xs">
                {error}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
