'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatMoney, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { BankBalanceCards } from '@/components/bank-balance-cards';
import { NumberInput } from '@/components/number-input';
import type { PagedResult } from '@/components/date-range';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';

interface BankBalance {
  bankAccountId: string; bankCode: string; bankNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  inflow: string; outflow: string; actual: string;
  net: string | null; variance: string | null;
}
interface Bank { id: string; nameLo: string }
interface Row {
  id: string; type: string; currency: string; amount: string;
  note: string | null; createdAt: string; bankAccount: { nameLo: string };
}

/**
 * TOR §3.7 — Module Bank (To Day).
 *
 * ຍອດເງິນຂາດດຸນ = ຍອດຕົວຈິງ − ຍອດສຸດທິ. A non-zero variance is the shop's
 * signal that the ledger and the bank statement have diverged, so it is
 * surfaced rather than reconciled away. Only Admin/Manager may set ຍອດສຸດທິ.
 */
export default function FcBankPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const user = getStoredUser();
  const canSetNet = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [bankAccountId, setBankAccountId] = useState('');
  // INCOME / EXPENSE are posted by ຈັດການລາຍຮັບລາຍຈ່າຍ, which files them
  // against a category; entering them here produced bank rows no report
  // could account for.
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editingNet, setEditingNet] = useState<string | null>(null);
  const [netAmount, setNetAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const balancesQuery = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
  });
  const balances = balancesQuery.data ?? [];
  const banksQuery = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const banks = banksQuery.data ?? [];
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Row>(['cash', 'bank', 'history'], '/cash/bank/history');
  const rows = history.rows;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/cash/bank/transactions', {
        bankAccountId, type, currency,
        amount: amount.replace(/,/g, '').trim(), note: note || undefined,
      }),
    onSuccess: () => { setAmount(''); setNote(''); setError(null); invalidate(); },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const setNet = useMutation({
    // Only the key matters here, so the parameter asks for the key rather
    // than a whole balance row — which lets the cards pass theirs straight in.
    mutationFn: (row: Pick<BankBalance, 'bankAccountId' | 'currency'>) =>
      api.post('/cash/bank/net-balance', {
        bankAccountId: row.bankAccountId,
        currency: row.currency,
        netAmount: netAmount.replace(/,/g, '').trim(),
      }),
    onSuccess: () => { setEditingNet(null); setNetAmount(''); setError(null); invalidate(); },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="Module Bank"
        subtitle="ຍອດ Bank ຕົວຈິງ ແຍກຕາມທະນາຄານ ແລະ ສະກຸນເງິນ · ຍອດເງິນຂາດດຸນ (TOR §3.7)"
      />

      {banksQuery.isError && (
        <QueryErrorNotice error={banksQuery.error} onRetry={() => void banksQuery.refetch()} />
      )}

      {error && (
        <div id="bank-error" role="alert" className="notice status-danger">{error}</div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ຍອດ Bank (To Day)</h2>
          {!canSetNet && (
            <span className="text-xs text-muted">ເງິນ Bank ສຸດທິ ແກ້ໄຂໄດ້ສະເພາະ Admin & Manager</span>
          )}
        </div>
        {balancesQuery.isError ? (
          <QueryErrorNotice error={balancesQuery.error} onRetry={() => void balancesQuery.refetch()} />
        ) : (
          <BankBalanceCards
            rows={balances}
            renderNet={(row) => {
              const key = `${row.bankAccountId}-${row.currency}`;
              if (editingNet === key) {
                return (
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <NumberInput className="input num w-28 text-right" decimals={row.currency === 'LAK' ? 0 : 2}
                      aria-label={`ເງິນ Bank ສຸດທິ ${row.bankNameLo} ${row.currency}`}
                      aria-describedby={error ? 'bank-error' : undefined}
                      value={netAmount} onValueChange={setNetAmount} autoFocus />
                    <button className="btn-primary" onClick={() => setNet.mutate(row)} disabled={setNet.isPending}>
                      ບັນທຶກ
                    </button>
                    <button className="btn-secondary" onClick={() => setEditingNet(null)}>ຍົກເລີກ</button>
                  </span>
                );
              }
              if (!canSetNet) return formatByCurrency(row.net, row.currency);
              return (
                <button className="btn-ghost"
                  aria-label={`${row.net === null ? 'ຕັ້ງຄ່າ' : formatByCurrency(row.net, row.currency)} ${row.bankNameLo} ${row.currency}`}
                  onClick={() => { setEditingNet(key); setNetAmount(row.net ?? ''); }}>
                  {row.net === null ? 'ຕັ້ງຄ່າ' : formatByCurrency(row.net, row.currency)}
                </button>
              );
            }}
          />
        )}
      </div>

      <div data-fade className="card p-5">
        <h2 className="card-title mb-4">ບັນທຶກທຸລະກຳ Bank</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="bank">ທະນາຄານ</label>
            <select id="bank" className="input" value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">— ເລືອກ —</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="type">ປະເພດ</label>
            <select id="type" className="input" value={type}
              onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="DEPOSIT">ຝາກ (Deposit)</option>
              <option value="WITHDRAW">ຖອນ (Withdraw)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cur">ສະກຸນເງິນ</label>
            <select id="cur" className="input" value={currency}
              onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}>
              <option value="LAK">LAK</option>
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="amt">ຈຳນວນເງິນ</label>
            <NumberInput id="amt" className="input num" decimals={currency === 'LAK' ? 0 : 2} aria-describedby={error ? 'bank-error' : undefined} value={amount}
              onValueChange={setAmount} />
          </div>
          <div>
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <button className="btn-primary min-h-[54px] w-full sm:w-auto sm:min-w-[240px]" disabled={!bankAccountId || !amount.trim() || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
          </button>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Bank</h2></div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Bank">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ທະນາຄານ</th>
                <th>ປະເພດ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຈຳນວນເງິນ</th>
                <th>ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={6}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => history.refetch()}
              />
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.bankAccount.nameLo}</td>
                  <td className="text-muted">{row.type}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatByCurrency(row.amount, row.currency)}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
