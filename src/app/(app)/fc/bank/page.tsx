'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';

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
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW' | 'INCOME' | 'EXPENSE'>('DEPOSIT');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editingNet, setEditingNet] = useState<string | null>(null);
  const [netAmount, setNetAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: balances = [] } = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
  });
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['cash', 'bank', 'history'],
    queryFn: () => api.get<Row[]>('/cash/bank/history'),
  });

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
    mutationFn: (row: BankBalance) =>
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
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ຍອດ Bank (To Day)">
          <table className="table">
            <thead>
              <tr>
                <th>ທະນາຄານ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">(+)</th>
                <th className="text-right">(−)</th>
                <th className="text-right">ຍອດຕົວຈິງ</th>
                <th className="text-right">ເງິນ Bank ສຸດທິ</th>
                <th className="text-right">ຍອດເງິນຂາດດຸນ</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((row) => {
                const key = `${row.bankAccountId}-${row.currency}`;
                const variance = row.variance === null ? null : Number(row.variance);
                return (
                  <tr key={key}>
                    <td className="font-medium">{row.bankNameLo}</td>
                    <td>{row.currency}</td>
                    <td className="num text-right text-success">{formatMoney(row.inflow)}</td>
                    <td className="num text-right text-danger">{formatMoney(row.outflow)}</td>
                    <td className="num text-right font-semibold">{formatMoney(row.actual)}</td>
                    <td className="num text-right">
                      {editingNet === key ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <input className="input num w-36 text-right" inputMode="decimal"
                            aria-label={`ເງິນ Bank ສຸດທິ ${row.bankNameLo} ${row.currency}`}
                            aria-describedby={error ? 'bank-error' : undefined}
                            value={netAmount} onChange={(e) => setNetAmount(e.target.value)} autoFocus />
                          <button className="btn-primary"
                            onClick={() => setNet.mutate(row)} disabled={setNet.isPending}>
                            ບັນທຶກ
                          </button>
                          <button className="btn-secondary"
                            onClick={() => setEditingNet(null)}>
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : canSetNet ? (
                        <button className="btn-ghost"
                          aria-label={`${row.net === null ? 'ຕັ້ງຄ່າ' : formatMoney(row.net)} ${row.bankNameLo} ${row.currency}`}
                          onClick={() => { setEditingNet(key); setNetAmount(row.net ?? ''); }}>
                          {row.net === null ? 'ຕັ້ງຄ່າ' : formatMoney(row.net)}
                        </button>
                      ) : (
                        formatMoney(row.net)
                      )}
                    </td>
                    <td className={`num text-right ${variance === null ? '' : variance === 0 ? 'text-success' : 'font-semibold text-danger'}`}>
                      {row.variance === null ? '—' : formatMoney(row.variance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
              <option value="DEPOSIT">Deposit</option>
              <option value="WITHDRAW">Withdraw</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
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
            <input id="amt" className="input num" inputMode="decimal" aria-describedby={error ? 'bank-error' : undefined} value={amount}
              onChange={(e) => setAmount(e.target.value)} />
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
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.bankAccount.nameLo}</td>
                  <td className="text-muted">{row.type}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatMoney(row.amount)}</td>
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
