'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { NumberInput } from '@/components/number-input';
import { MultiPayment, newPaymentLines, paymentPayload, type PaymentLine } from '@/components/multi-payment';
import type { PagedResult } from '@/components/date-range';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';

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
  // One expense may be settled part ສົດ and part ໂອນ, across currencies.
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines());
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
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Row>(['finance', 'income-expense'], '/finance/income-expense');
  const rows = history.rows;
  const formQuery = [categoriesQuery, banksQuery].find((q) => q.isError);

  const create = useMutation({
    mutationFn: () =>
      api.post('/finance/income-expense', {
        categoryId,
        payments: paymentPayload(payments),
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setPayments(newPaymentLines()); setNote(''); setError(null);
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

  // Every leg must name a bank when it is a transfer, and carry an amount.
  const canSave = Boolean(
    categoryId &&
      paymentPayload(payments).length > 0 &&
      payments.every((l) => l.method === 'CASH' || !l.amount.trim() || Boolean(l.bankAccountId)),
  );

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
          <div className="sm:col-span-2">
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input" value={note}
              onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <MultiPayment
            lines={payments}
            onChange={setPayments}
            direction={kind === 'INCOME' ? 'in' : 'out'}
            labelLo={kind === 'INCOME' ? 'ຮັບເງິນ (ສົດ / ໂອນ)' : 'ຈ່າຍເງິນ (ສົດ / ໂອນ)'}
          />
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
        <DateRangeFilter history={history} />
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
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => history.refetch()}
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
                  <td className="num text-right font-medium">{formatByCurrency(row.amount, row.currency)}</td>
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
