'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser, type SessionUser } from '@/lib/api';
import { formatMoney, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { NumberInput } from '@/components/number-input';
import { MultiPayment, newPaymentLines, paymentPayload, type PaymentLine } from '@/components/multi-payment';
import type { PagedResult } from '@/components/date-range';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Dialog } from '@/components/dialog';
import { clean, isPositive } from '@/lib/validate';
import {
  IncomeExpenseSummaryCards,
  type DailyIncomeExpenseSummary,
} from '@/components/income-expense-summary-cards';

interface Category { id: string; code: string; nameLo: string; kind: 'INCOME' | 'EXPENSE' }
interface Bank { id: string; nameLo: string }
interface Row {
  /** ຜູ້ລົງລາຍການ — ມາຈາກ API. */
  createdBy: string;
  id: string; code: string; kind: 'INCOME' | 'EXPENSE'; currency: string;
  amount: string; method: string; note: string | null; createdAt: string;
  categoryId?: string;
  category: { id?: string; nameLo: string };
  bankAccountId?: string | null;
  bankAccount: { id?: string; nameLo: string } | null;
}

/** TOR §3.7 — Module ຈັດການລາຍຮັບລາຍຈ່າຍ. */
export default function IncomeExpensePage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    setUser(getStoredUser());
  }, []);
  const isAdmin = user?.role === 'ADMIN';

  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  // One expense may be settled part ສົດ and part ໂອນ, across currencies.
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Edit and Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [editKind, setEditKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editMethod, setEditMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [editBankAccountId, setEditBankAccountId] = useState('');
  const [editCurrency, setEditCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['finance', 'ie-categories', kind],
    queryFn: () => api.get<Category[]>(`/finance/income-expense/categories?kind=${kind}`),
  });
  const categories = categoriesQuery.data ?? [];

  const editCategoriesQuery = useQuery({
    queryKey: ['finance', 'ie-categories', editKind],
    queryFn: () => api.get<Category[]>(`/finance/income-expense/categories?kind=${editKind}`),
    enabled: Boolean(editingRow),
  });
  const editCategories = editCategoriesQuery.data ?? [];

  const banksQuery = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const banks = banksQuery.data ?? [];

  const cashBalancesQuery = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<{ currency: 'LAK' | 'THB' | 'USD'; balance: string }[]>('/cash/balances'),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const cashBalances = cashBalancesQuery.data ?? [];

  const bankBalancesQuery = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () =>
      api.get<{ bankAccountId: string; currency: 'LAK' | 'THB' | 'USD'; actual: string; bankNameLo: string }[]>(
        '/cash/bank/balances',
      ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const bankBalances = bankBalancesQuery.data ?? [];

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Row>(['finance', 'income-expense'], '/finance/income-expense');
  const rows = history.rows;

  const summaryQuery = useQuery({
    queryKey: ['finance', 'income-expense', 'summary', history.from, history.to],
    queryFn: () =>
      api.get<DailyIncomeExpenseSummary>(
        `/finance/income-expense/summary?from_date=${history.from}&to_date=${history.to}`,
      ),
  });

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
      setPayments(newPaymentLines()); setNote(''); setCategoryId(''); setError(null);
      setIsCreateOpen(false);
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

  const update = useMutation({
    mutationFn: () => {
      if (!editingRow) throw new Error('No row selected');
      return api.patch(`/finance/income-expense/${editingRow.id}`, {
        categoryId: editCategoryId,
        method: editMethod,
        bankAccountId: editMethod === 'BANK' ? editBankAccountId : null,
        currency: editCurrency,
        amount: editAmount,
        note: editNote || undefined,
      });
    },
    onSuccess: () => {
      toast.success('ແກ້ໄຂສຳເລັດ');
      setEditingRow(null);
      setEditError(null);
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ';
      setEditError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/income-expense/${id}`),
    onSuccess: () => {
      toast.success('ລຶບສຳເລັດ');
      setDeletingId(null);
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deleted'] });
    },
    onError: (e) => {
      setDeletingId(null);
      toast.error('ລຶບບໍ່ສຳເລັດ', e instanceof ApiError ? e.message : 'ເກີດຂໍ້ຜິດພາດ');
    },
  });

  function startEdit(row: Row) {
    setEditingRow(row);
    setEditKind(row.kind);
    setEditCategoryId(row.categoryId || row.category?.id || '');
    setEditMethod((row.method as 'CASH' | 'BANK') || 'CASH');
    setEditBankAccountId(row.bankAccountId || row.bankAccount?.id || '');
    setEditCurrency((row.currency as 'LAK' | 'THB' | 'USD') || 'LAK');
    setEditAmount(row.amount);
    setEditNote(row.note || '');
    setEditError(null);
  }

  // Check sufficient funds if kind === 'EXPENSE'
  let insufficientExpenseError: string | null = null;
  if (kind === 'EXPENSE') {
    const cashTotals: Record<string, number> = {};
    const bankTotals: Record<string, number> = {};

    for (const p of payments) {
      const amt = Number(clean(p.amount));
      if (Number.isFinite(amt) && amt > 0) {
        if (p.method === 'CASH') {
          cashTotals[p.currency] = (cashTotals[p.currency] ?? 0) + amt;
        } else if (p.method === 'BANK' && p.bankAccountId) {
          const key = `${p.bankAccountId}:${p.currency}`;
          bankTotals[key] = (bankTotals[key] ?? 0) + amt;
        }
      }
    }

    for (const [cur, total] of Object.entries(cashTotals)) {
      const cb = cashBalances.find((c) => c.currency === cur);
      const avail = Number(cb?.balance ?? 0);
      if (total > avail) {
        insufficientExpenseError = `ເງິນສົດ ${cur} ໃນຮ້ານ (Module Cash) ບໍ່ພໍສຳລັບລາຍຈ່າຍ (ມີເຫຼືອ ${formatByCurrency(avail, cur)} ${cur}, ຕ້ອງການຈ່າຍ ${formatByCurrency(total, cur)} ${cur})`;
        break;
      }
    }

    if (!insufficientExpenseError) {
      for (const [key, total] of Object.entries(bankTotals)) {
        const [bankAccountId, cur] = key.split(':');
        const bb = bankBalances.find((b) => b.bankAccountId === bankAccountId && b.currency === cur);
        const avail = Number(bb?.actual ?? 0);
        const bankName = bb?.bankNameLo ?? banks.find((b) => b.id === bankAccountId)?.nameLo ?? 'ທະນາຄານ';
        if (total > avail) {
          insufficientExpenseError = `ຍອດເງິນ ${cur} ໃນບັນຊີ ${bankName} (Module Bank) ບໍ່ພໍສຳລັບລາຍຈ່າຍ (ມີເຫຼືອ ${formatByCurrency(avail, cur)} ${cur}, ຕ້ອງການຈ່າຍ ${formatByCurrency(total, cur)} ${cur})`;
          break;
        }
      }
    }
  }

  // Every leg must name a bank when it is a transfer, and carry an amount.
  const canSave = Boolean(
    categoryId &&
      paymentPayload(payments).length > 0 &&
      payments.every((l) => l.method === 'CASH' || !l.amount.trim() || Boolean(l.bankAccountId)) &&
      !insufficientExpenseError,
  );

  let editInsufficientError: string | null = null;
  if (editKind === 'EXPENSE' && isPositive(editAmount)) {
    const amt = Number(clean(editAmount));
    if (editMethod === 'CASH') {
      const cb = cashBalances.find((c) => c.currency === editCurrency);
      let avail = Number(cb?.balance ?? 0);
      if (
        editingRow?.kind === 'EXPENSE' &&
        editingRow.method === 'CASH' &&
        editingRow.currency === editCurrency
      ) {
        avail += Number(clean(editingRow.amount));
      }
      if (amt > avail) {
        editInsufficientError = `ເງິນສົດ ${editCurrency} ໃນຮ້ານ (Module Cash) ບໍ່ພໍສຳລັບລາຍຈ່າຍ (ມີເຫຼືອ ${formatByCurrency(avail, editCurrency)} ${editCurrency}, ຕ້ອງການຈ່າຍ ${formatByCurrency(amt, editCurrency)} ${editCurrency})`;
      }
    } else if (editMethod === 'BANK' && editBankAccountId) {
      const bb = bankBalances.find(
        (b) => b.bankAccountId === editBankAccountId && b.currency === editCurrency,
      );
      let avail = Number(bb?.actual ?? 0);
      const bankName =
        bb?.bankNameLo ?? banks.find((b) => b.id === editBankAccountId)?.nameLo ?? 'ທະນາຄານ';
      if (
        editingRow?.kind === 'EXPENSE' &&
        editingRow.method === 'BANK' &&
        editingRow.bankAccountId === editBankAccountId &&
        editingRow.currency === editCurrency
      ) {
        avail += Number(clean(editingRow.amount));
      }
      if (amt > avail) {
        editInsufficientError = `ຍອດເງິນ ${editCurrency} ໃນບັນຊີ ${bankName} (Module Bank) ບໍ່ພໍສຳລັບລາຍຈ່າຍ (ມີເຫຼືອ ${formatByCurrency(avail, editCurrency)} ${editCurrency}, ຕ້ອງການຈ່າຍ ${formatByCurrency(amt, editCurrency)} ${editCurrency})`;
      }
    }
  }

  const canSaveEdit = Boolean(
    editCategoryId &&
      isPositive(editAmount) &&
      (editMethod === 'CASH' || editBankAccountId) &&
      !editInsufficientError,
  );

  const pager = usePagination(rows);

  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການລາຍຮັບລາຍຈ່າຍ"
        subtitle="ບັນທຶກລາຍຮັບ / ລາຍຈ່າຍ ຜ່ານ Cash ຫຼື Bank (TOR §3.7)"
        actions={
          <button
            type="button"
            className="btn-primary flex items-center gap-2 cursor-pointer transition-colors duration-200"
            onClick={() => {
              setError(null);
              setIsCreateOpen(true);
            }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>+ ເພີ່ມລາຍຮັບ-ລາຍຈ່າຍ</span>
          </button>
        }
      />

      {formQuery && <QueryErrorNotice error={formQuery.error} onRetry={() => void formQuery.refetch()} />}

      <IncomeExpenseSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        onRefresh={() => void summaryQuery.refetch()}
        isToday={history.isToday}
        fromDate={history.from}
        toDate={history.to}
      />

      <Dialog
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setError(null);
        }}
        title={`ບັນທຶກ${kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}`}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary cursor-pointer transition-colors duration-200"
              onClick={() => {
                setIsCreateOpen(false);
                setError(null);
              }}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary cursor-pointer transition-colors duration-200"
              disabled={!canSave || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : `ບັນທຶກ${kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={kind === 'INCOME'}
              className={`cursor-pointer transition-colors duration-200 ${
                kind === 'INCOME' ? 'btn-primary' : 'btn-secondary'
              }`}
              onClick={() => {
                setKind('INCOME');
                setCategoryId('');
              }}
            >
              ລາຍຮັບ
            </button>
            <button
              type="button"
              aria-pressed={kind === 'EXPENSE'}
              className={`cursor-pointer transition-colors duration-200 ${
                kind === 'EXPENSE' ? 'btn-primary' : 'btn-secondary'
              }`}
              onClick={() => {
                setKind('EXPENSE');
                setCategoryId('');
              }}
            >
              ລາຍຈ່າຍ
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cat">ລາຍການ</label>
              <select
                id="cat"
                className="input cursor-pointer"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— ເລືອກລາຍການ —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameLo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="note">Note</label>
              <input
                id="note"
                className="input"
                placeholder="ໝາຍເຫດເພີ່ມເຕີມ..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {kind === 'EXPENSE' && (
            <div className="rounded-lg border border-line bg-surface/50 p-3 text-xs space-y-2">
              <div className="font-semibold text-fg-muted">ຍອດເງິນຄົງເຫຼືອປັດຈຸບັນ (ທີ່ໃຊ້ຈ່າຍໄດ້):</div>
              <div className="space-y-2">
                <div>
                  <span className="text-muted block font-medium mb-1">💵 ເງິນສົດ (Module Cash):</span>
                  <div className="flex flex-wrap gap-2">
                    {(['LAK', 'THB', 'USD'] as const).map((cur) => {
                      const bal = cashBalances.find((c) => c.currency === cur)?.balance ?? '0';
                      return (
                        <span
                          key={cur}
                          className="inline-flex items-center gap-1.5 rounded bg-surface px-2.5 py-1 text-xs border border-line"
                        >
                          <span className="text-muted font-medium">{cur}:</span>
                          <strong className="num text-fg-strong">
                            {formatByCurrency(bal, cur)} {cur}
                          </strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <span className="text-muted block font-medium mb-1">🏦 ເງິນໃນ Bank (Module Bank):</span>
                  <div className="space-y-1.5">
                    {banks.length > 0 ? (
                      banks.map((b) => (
                        <div key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-fg-strong min-w-[70px]">{b.nameLo}:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {(['LAK', 'THB', 'USD'] as const).map((cur) => {
                              const row = bankBalances.find(
                                (bb) => bb.bankAccountId === b.id && bb.currency === cur,
                              );
                              const actual = row?.actual ?? '0';
                              return (
                                <span
                                  key={cur}
                                  className="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 border border-line text-[11px]"
                                >
                                  <span className="text-muted">{cur}:</span>
                                  <strong className="num text-fg-strong">
                                    {formatByCurrency(actual, cur)} {cur}
                                  </strong>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-line pt-4">
            <MultiPayment
              lines={payments}
              onChange={setPayments}
              direction={kind === 'INCOME' ? 'in' : 'out'}
              labelLo={kind === 'INCOME' ? 'ຮັບເງິນ (ສົດ / ໂອນ)' : 'ຈ່າຍເງິນ (ສົດ / ໂອນ)'}
            />
          </div>

          {insufficientExpenseError && (
            <div role="alert" className="notice status-danger mt-3">
              {insufficientExpenseError}
            </div>
          )}

          {error && (
            <div id="ie-error" role="alert" className="notice status-danger">
              {error}
            </div>
          )}
        </div>
      </Dialog>

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
                <th>ຜູ້ບັນທຶກ</th>
                {isAdmin && <th className="text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={isAdmin ? 11 : 10}
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
                  <td className="text-muted">{row.createdBy}</td>
                  {isAdmin && (
                    <td className="text-right">
                      {deletingId === row.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="btn-danger text-xs px-2.5 py-1"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(row.id)}
                          >
                            {remove.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-xs px-2.5 py-1"
                            disabled={remove.isPending}
                            onClick={() => setDeletingId(null)}
                          >
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="btn-ghost text-xs px-2.5 py-1"
                            onClick={() => startEdit(row)}
                          >
                            ແກ້ໄຂ
                          </button>
                          <button
                            type="button"
                            className="btn-ghost text-danger text-xs px-2.5 py-1"
                            onClick={() => setDeletingId(row.id)}
                          >
                            ລຶບ
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      <Dialog
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        title="ແກ້ໄຂລາຍການຮັບຈ່າຍ"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditingRow(null)}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canSaveEdit || update.isPending}
              onClick={() => update.mutate()}
            >
              {update.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={editKind === 'INCOME'}
              className={editKind === 'INCOME' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => {
                setEditKind('INCOME');
                setEditCategoryId('');
              }}
            >
              ລາຍຮັບ
            </button>
            <button
              type="button"
              aria-pressed={editKind === 'EXPENSE'}
              className={editKind === 'EXPENSE' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => {
                setEditKind('EXPENSE');
                setEditCategoryId('');
              }}
            >
              ລາຍຈ່າຍ
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-cat">ລາຍການ</label>
              <select
                id="edit-cat"
                className="input"
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
              >
                <option value="">— ເລືອກລາຍການ —</option>
                {editingRow && editCategoryId && !editCategories.some((c) => c.id === editCategoryId) && (
                  <option value={editCategoryId}>{editingRow.category.nameLo}</option>
                )}
                {editCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.nameLo}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="edit-method">ຮູບແບບຈ່າຍ</label>
              <select
                id="edit-method"
                className="input"
                value={editMethod}
                onChange={(e) => {
                  const m = e.target.value as 'CASH' | 'BANK';
                  setEditMethod(m);
                  if (m === 'CASH') {
                    setEditBankAccountId('');
                  } else if (!editBankAccountId && banks.length > 0) {
                    setEditBankAccountId(banks[0].id);
                  }
                }}
              >
                <option value="CASH">CASH (ເງິນສົດ)</option>
                <option value="BANK">BANK (ເງິນໂອນ)</option>
              </select>
            </div>

            {editMethod === 'BANK' && (
              <div>
                <label className="label" htmlFor="edit-bank">ທະນາຄານ</label>
                <select
                  id="edit-bank"
                  className="input"
                  value={editBankAccountId}
                  onChange={(e) => setEditBankAccountId(e.target.value)}
                >
                  <option value="">— ເລືອກທະນາຄານ —</option>
                  {editingRow && editBankAccountId && !banks.some((b) => b.id === editBankAccountId) && editingRow.bankAccount && (
                    <option value={editBankAccountId}>{editingRow.bankAccount.nameLo}</option>
                  )}
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>{b.nameLo}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label" htmlFor="edit-cur">ສະກຸນເງິນ</label>
              <select
                id="edit-cur"
                className="input"
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}
              >
                <option value="LAK">LAK</option>
                <option value="THB">THB</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="edit-amt">ຈຳນວນເງິນ</label>
                {editKind === 'EXPENSE' && (
                  <span className="text-xs text-muted">
                    ຍອດຄົງເຫຼືອ:{' '}
                    <strong className="num text-fg-strong">
                      {editMethod === 'CASH'
                        ? `${formatByCurrency(
                            cashBalances.find((c) => c.currency === editCurrency)?.balance ?? '0',
                            editCurrency,
                          )} ${editCurrency}`
                        : `${formatByCurrency(
                            bankBalances.find(
                              (b) => b.bankAccountId === editBankAccountId && b.currency === editCurrency,
                            )?.actual ?? '0',
                            editCurrency,
                          )} ${editCurrency}`}
                    </strong>
                  </span>
                )}
              </div>
              <NumberInput
                id="edit-amt"
                className="input num"
                decimals={editCurrency === 'LAK' ? 0 : 2}
                value={editAmount}
                onValueChange={setEditAmount}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="edit-note">Note</label>
              <input
                id="edit-note"
                className="input"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
              />
            </div>
          </div>

          {editInsufficientError && (
            <div role="alert" className="notice status-danger mt-3">
              {editInsufficientError}
            </div>
          )}

          {editError && (
            <div role="alert" className="notice status-danger">{editError}</div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
