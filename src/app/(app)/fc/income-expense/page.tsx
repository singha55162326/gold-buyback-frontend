'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { NumberInput } from '@/components/number-input';

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

  const categoriesQuery = useQuery({
    queryKey: ['finance', 'ie-categories', kind],
    queryFn: () => api.get<Category[]>(`/finance/income-expense/categories?kind=${kind}`),
  });
  const categories = categoriesQuery.data ?? [];
  const banksQuery = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const banks = banksQuery.data ?? [];
  const rowsQuery = useQuery({
    queryKey: ['finance', 'income-expense'],
    queryFn: () => api.get<Row[]>('/finance/income-expense'),
  });
  const rows = rowsQuery.data ?? [];
  const formQuery = [categoriesQuery, banksQuery].find((q) => q.isError);

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
      <PageHead
        title="ຈັດການລາຍຮັບລາຍຈ່າຍ"
        subtitle="ບັນທຶກລາຍຮັບ / ລາຍຈ່າຍ ຜ່ານ Cash ຫຼື Bank (TOR §3.7)"
      />

      {formQuery && <QueryErrorNotice error={formQuery.error} onRetry={() => void formQuery.refetch()} />}

      <div data-fade className="card p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button" aria-pressed={kind === 'INCOME'}
            className={kind === 'INCOME' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setKind('INCOME'); setCategoryId(''); }}
          >
            ລາຍຮັບ
          </button>
          <button
            type="button" aria-pressed={kind === 'EXPENSE'}
            className={kind === 'EXPENSE' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => { setKind('EXPENSE'); setCategoryId(''); }}
          >
            ລາຍຈ່າຍ
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            <NumberInput id="amt" className="input num" decimals={currency === 'LAK' ? 0 : 2} aria-describedby={error ? 'ie-error' : undefined} value={amount}
              onValueChange={setAmount} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input" value={note}
              onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && (
          <div id="ie-error" role="alert" className="notice status-danger mt-3">{error}</div>
        )}

        <div className="mt-4">
          <button className="btn-primary min-h-[54px] w-full sm:w-auto sm:min-w-[240px]" disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : `ບັນທຶກ${kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}`}
          </button>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ">
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
              <TableStateRow
                colSpan={9}
                isLoading={rowsQuery.isLoading}
                isError={rowsQuery.isError}
                error={rowsQuery.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void rowsQuery.refetch()}
              />
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <span className={row.kind === 'INCOME' ? 'status-success' : 'status-danger'}>
                      {row.kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}
                    </span>
                  </td>
                  <td>{row.category.nameLo}</td>
                  <td className="text-muted">{row.method}</td>
                  <td className="text-muted">{row.bankAccount?.nameLo ?? '—'}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatMoney(row.amount)}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
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
