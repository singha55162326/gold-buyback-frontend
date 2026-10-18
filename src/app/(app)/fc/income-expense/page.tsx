'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';

interface Category { id: string; code: string; nameLo: string; kind: 'INCOME' | 'EXPENSE' }
interface Bank { id: string; nameLo: string }
interface Row {
  id: string; code: string; kind: 'INCOME' | 'EXPENSE'; currency: string;
  amount: string; method: string; note: string | null; createdAt: string;
  category: { nameLo: string }; bankAccount: { nameLo: string } | null;
}

/** TOR §3.7 — Module ຈັດການລາຍຮັບລາຍຈ່າຍ. */
export default function IncomeExpensePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['finance', 'ie-categories', kind],
    queryFn: () => api.get<Category[]>(`/finance/income-expense/categories?kind=${kind}`),
  });
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['finance', 'income-expense'],
    queryFn: () => api.get<Row[]>('/finance/income-expense'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/finance/income-expense', {
        categoryId, method,
        bankAccountId: method === 'BANK' ? bankAccountId : undefined,
        currency, amount: amount.replace(/,/g, '').trim(), note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setAmount(''); setNote(''); setError(null);
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const canSave = Boolean(categoryId && amount.trim() && (method === 'CASH' || bankAccountId));

  const pager = usePagination(rows);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຈັດການລາຍຮັບລາຍຈ່າຍ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ບັນທຶກລາຍຮັບ / ລາຍຈ່າຍ ຜ່ານ Cash ຫຼື Bank (TOR §3.7)
        </p>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex gap-2">
          <button
            className={kind === 'INCOME' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setKind('INCOME'); setCategoryId(''); }}
          >
            ລາຍຮັບ
          </button>
          <button
            className={kind === 'EXPENSE' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setKind('EXPENSE'); setCategoryId(''); }}
          >
            ລາຍຈ່າຍ
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="cat">ລາຍການ</label>
            <select id="cat" className="input" value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">— ເລືອກລາຍການ —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nameLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="method">Cash / Bank</label>
            <select id="method" className="input" value={method}
              onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')}>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
            </select>
          </div>
          {method === 'BANK' && (
            <div>
              <label className="label" htmlFor="bank">ທະນາຄານ</label>
              <select id="bank" className="input" value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">— ເລືອກທະນາຄານ —</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
              </select>
            </div>
          )}
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
            <input id="amt" className="input num" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input" value={note}
              onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-4">
          <button className="btn-primary" disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : `ບັນທຶກ${kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}`}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ວັນທີ</th>
                <th>ໝວດ</th>
                <th>ລາຍການ</th>
                <th>ຮູບແບບຈ່າຍ</th>
                <th>ທະນາຄານ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຈຳນວນເງິນ</th>
                <th>ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <span className={row.kind === 'INCOME' ? 'badge bg-emerald-100 text-emerald-800' : 'badge bg-red-100 text-red-800'}>
                      {row.kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}
                    </span>
                  </td>
                  <td>{row.category.nameLo}</td>
                  <td className="text-slate-500">{row.method}</td>
                  <td className="text-slate-500">{row.bankAccount?.nameLo ?? '—'}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatMoney(row.amount)}</td>
                  <td className="text-slate-500">{row.note ?? '—'}</td>
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
