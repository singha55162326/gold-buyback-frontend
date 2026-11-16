'use client';

import { useMemo, useState, useEffect } from 'react';
import { dec } from '@kpv/domain';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser, type SessionUser } from '@/lib/api';
import { formatDate, formatDateTime, formatByCurrency } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { NumberInput } from '@/components/number-input';
import { MultiPayment, newPaymentLines, paymentPayload, type PaymentLine } from '@/components/multi-payment';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Dialog } from '@/components/dialog';
import { PrintSheet } from '@/components/print-sheet';
import { clean, isPositive } from '@/lib/validate';
import { sanitizeNumeric } from '@/lib/number-input';
import {
  IncomeExpenseSummaryCards,
  type DailyIncomeExpenseSummary,
} from '@/components/income-expense-summary-cards';

interface Category {
  id: string;
  code: string;
  nameLo: string;
  kind: 'INCOME' | 'EXPENSE';
}
interface Bank {
  id: string;
  nameLo: string;
}
interface Row {
  /** ຜູ້ລົງລາຍການ — ມາຈາກ API. */
  createdBy: string;
  id: string;
  code: string;
  kind: 'INCOME' | 'EXPENSE';
  currency: string;
  amount: string;
  method: string;
  note: string | null;
  createdAt: string;
  categoryId?: string;
  category: { id?: string; nameLo: string };
  bankAccountId?: string | null;
  bankAccount: { id?: string; nameLo: string } | null;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'ເງິນສົດ',
  BANK: 'ເງິນໂອນ',
};

function formatTimeOnly(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const csvField = (value: string) => `"${value.replace(/"/g, '""')}"`;

/* ── Inline SVG Icons ── */

function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 4v12M4 10h12" />
    </svg>
  );
}

function ArrowDownInflowIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 3.5v13m0 0-4.5-4.5M10 16.5l4.5-4.5" />
    </svg>
  );
}

function ArrowUpOutflowIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 16.5v-13m0 0-4.5 4.5M10 3.5l4.5 4.5" />
    </svg>
  );
}

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

function ClockIcon({ className = 'h-3 w-3' }: { className?: string }) {
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

function EditIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m13.8 3.6 2.6 2.6-9.6 9.6H4.2v-2.6l9.6-9.6Z" />
    </svg>
  );
}

function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 5.5h13m-11 0 .8 10a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-10M7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
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

function PrinterIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5V3.5h10v4M5 14.5H3.5a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 3.5 7.5h13a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H15M5 12h10v5.5H5V12Z" />
    </svg>
  );
}

function RefreshIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 4.5v4h4M16.5 15.5v-4h-4M4.8 8A6 6 0 0 1 15 6.2l1.5 1.3M15.2 12A6 6 0 0 1 5 13.8L3.5 12.5" />
    </svg>
  );
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

  // Create form state
  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  // One expense may be settled part ສົດ and part ໂອນ, across currencies.
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Table filter & search state
  const [kindFilter, setKindFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'LAK' | 'THB' | 'USD'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Detail, Print, Edit & Delete modal state
  const [viewingRow, setViewingRow] = useState<Row | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<Row | null>(null);
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

  /* ── Filtered Rows & Aggregations ── */
  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) {
      if (r.category?.nameLo) names.add(r.category.nameLo);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (kindFilter !== 'ALL' && row.kind !== kindFilter) return false;
      if (methodFilter !== 'ALL' && row.method !== methodFilter) return false;
      if (currencyFilter !== 'ALL' && row.currency !== currencyFilter) return false;
      if (categoryFilter !== 'ALL' && row.category?.nameLo !== categoryFilter) return false;
      if (q) {
        const haystack = [
          row.code,
          row.category?.nameLo ?? '',
          row.bankAccount?.nameLo ?? '',
          row.note ?? '',
          row.createdBy ?? '',
          row.amount ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, kindFilter, methodFilter, currencyFilter, categoryFilter, searchQuery]);

  const incomeCount = useMemo(() => rows.filter((r) => r.kind === 'INCOME').length, [rows]);
  const expenseCount = useMemo(() => rows.filter((r) => r.kind === 'EXPENSE').length, [rows]);
  const isFilterActive =
    kindFilter !== 'ALL' ||
    methodFilter !== 'ALL' ||
    currencyFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    searchQuery.trim() !== '';

  const filteredTotals = useMemo(() => {
    const inc: Record<string, ReturnType<typeof dec>> = {};
    const exp: Record<string, ReturnType<typeof dec>> = {};
    for (const r of filteredRows) {
      const cur = r.currency || 'LAK';
      const amt = dec(r.amount || '0');
      if (r.kind === 'INCOME') {
        inc[cur] = (inc[cur] ?? dec('0')).plus(amt);
      } else {
        exp[cur] = (exp[cur] ?? dec('0')).plus(amt);
      }
    }
    return {
      incomes: Object.entries(inc).map(([currency, sum]) => ({ currency, amount: sum.toFixed() })),
      expenses: Object.entries(exp).map(([currency, sum]) => ({ currency, amount: sum.toFixed() })),
    };
  }, [filteredRows]);

  const pager = usePagination(filteredRows);

  const handleResetFilters = () => {
    setKindFilter('ALL');
    setMethodFilter('ALL');
    setCurrencyFilter('ALL');
    setCategoryFilter('ALL');
    setSearchQuery('');
    pager.reset();
  };

  /* ── Create Form Validation & Mutation ── */
  let insufficientExpenseError: string | null = null;
  if (kind === 'EXPENSE') {
    const cashTotals: Record<string, ReturnType<typeof dec>> = {};
    const bankTotals: Record<string, ReturnType<typeof dec>> = {};

    for (const p of payments) {
      const cleaned = clean(p.amount);
      if (!cleaned) continue;
      try {
        const amt = dec(cleaned);
        if (amt.isFinite() && amt.gt(0)) {
          if (p.method === 'CASH') {
            cashTotals[p.currency] = (cashTotals[p.currency] ?? dec(0)).plus(amt);
          } else if (p.method === 'BANK' && p.bankAccountId) {
            const key = `${p.bankAccountId}:${p.currency}`;
            bankTotals[key] = (bankTotals[key] ?? dec(0)).plus(amt);
          }
        }
      } catch {
        // Ignore invalid partial numeric input while typing
      }
    }

    for (const [cur, total] of Object.entries(cashTotals)) {
      const cb = cashBalances.find((c) => c.currency === cur);
      const avail = dec(cb?.balance ?? '0');
      if (total.gt(avail)) {
        insufficientExpenseError = `ເງິນສົດ ${cur} ໃນຮ້ານ (Module Cash) ບໍ່ພໍສຳລັບລາຍຈ່າຍ (ມີເຫຼືອ ${formatByCurrency(avail, cur)} ${cur}, ຕ້ອງການຈ່າຍ ${formatByCurrency(total, cur)} ${cur})`;
        break;
      }
    }

    if (!insufficientExpenseError) {
      for (const [key, total] of Object.entries(bankTotals)) {
        const [bankAccountId, cur] = key.split(':');
        const bb = bankBalances.find((b) => b.bankAccountId === bankAccountId && b.currency === cur);
        const avail = dec(bb?.actual ?? '0');
        const bankName = bb?.bankNameLo ?? banks.find((b) => b.id === bankAccountId)?.nameLo ?? 'ທະນາຄານ';
        if (total.gt(avail)) {
          insufficientExpenseError = `ຍອດເງິນ ${cur} ໃນບັນຊີ ${bankName} (Module Bank) ບໍ່ພໍສຳລັບລາຍຈ່າຍ (ມີເຫຼືອ ${formatByCurrency(avail, cur)} ${cur}, ຕ້ອງການຈ່າຍ ${formatByCurrency(total, cur)} ${cur})`;
          break;
        }
      }
    }
  }

  const hasAnyAmount = paymentPayload(payments).length > 0;
  const missingBankLeg = payments.some((l) => l.method === 'BANK' && Boolean(clean(l.amount)) && !l.bankAccountId);
  const canSave = Boolean(categoryId && hasAnyAmount && !missingBankLeg && !insufficientExpenseError);

  const createMissingHints: string[] = [];
  if (!categoryId) createMissingHints.push('ເລືອກລາຍການ');
  if (!hasAnyAmount) createMissingHints.push('ປ້ອນຈຳນວນເງິນໃຫຍ່ກວ່າ 0');
  if (missingBankLeg) createMissingHints.push('ເລືອກທະນາຄານສຳລັບແຖວໂອນ');

  const createTotalsByCurrency = useMemo(() => {
    const sums: Record<string, ReturnType<typeof dec>> = {};
    for (const p of payments) {
      const cleaned = clean(p.amount);
      if (!cleaned) continue;
      try {
        const amt = dec(cleaned);
        if (amt.isFinite() && amt.gt(0)) {
          sums[p.currency] = (sums[p.currency] ?? dec(0)).plus(amt);
        }
      } catch {
        // Ignore partial input
      }
    }
    return Object.entries(sums).map(([currency, sum]) => ({ currency, amount: sum.toFixed() }));
  }, [payments]);

  const openCreate = (targetKind: 'INCOME' | 'EXPENSE') => {
    setKind(targetKind);
    setCategoryId('');
    setPayments(newPaymentLines());
    setNote('');
    setError(null);
    setIsCreateOpen(true);
  };

  const create = useMutation({
    mutationFn: () => {
      if (!canSave || insufficientExpenseError) {
        throw new Error(insufficientExpenseError || 'ບໍ່ສາມາດບັນທຶກໄດ້ (ຂໍ້ມູນບໍ່ຖືກຕ້ອງ ຫຼື ເງິນບໍ່ພໍ)');
      }
      return api.post('/finance/income-expense', {
        categoryId,
        payments: paymentPayload(payments),
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setPayments(newPaymentLines());
      setNote('');
      setCategoryId('');
      setError(null);
      setIsCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  /* ── Edit Validation & Mutation ── */
  const editAvailableBalance = useMemo(() => {
    if (editKind !== 'EXPENSE') return null;
    if (editMethod === 'CASH') {
      const cb = cashBalances.find((c) => c.currency === editCurrency);
      let avail = dec(cb?.balance ?? '0');
      if (
        editingRow?.kind === 'EXPENSE' &&
        editingRow.method === 'CASH' &&
        editingRow.currency === editCurrency
      ) {
        avail = avail.plus(dec(clean(editingRow.amount) || '0'));
      }
      return { label: `ເງິນສົດຄົງເຫຼືອ (${editCurrency})`, amount: avail.toFixed() };
    }
    if (editMethod === 'BANK' && editBankAccountId) {
      const bb = bankBalances.find(
        (b) => b.bankAccountId === editBankAccountId && b.currency === editCurrency,
      );
      let avail = dec(bb?.actual ?? '0');
      if (
        editingRow?.kind === 'EXPENSE' &&
        editingRow.method === 'BANK' &&
        editingRow.bankAccountId === editBankAccountId &&
        editingRow.currency === editCurrency
      ) {
        avail = avail.plus(dec(clean(editingRow.amount) || '0'));
      }
      const bankName = bb?.bankNameLo ?? banks.find((b) => b.id === editBankAccountId)?.nameLo ?? 'ທະນາຄານ';
      return { label: `ຍອດບັນຊີ ${bankName} (${editCurrency})`, amount: avail.toFixed() };
    }
    return null;
  }, [editKind, editMethod, editCurrency, editBankAccountId, cashBalances, bankBalances, banks, editingRow]);

  let editInsufficientError: string | null = null;
  if (editKind === 'EXPENSE' && isPositive(editAmount) && editAvailableBalance) {
    const amt = dec(clean(editAmount));
    const avail = dec(editAvailableBalance.amount);
    if (amt.gt(avail)) {
      if (editMethod === 'CASH') {
        editInsufficientError = `ເງິນສົດ ${editCurrency} ໃນຮ້ານ (Module Cash) ບໍ່ພໍສຳລັບລາຍຈ່າຍ (ມີເຫຼືອ ${formatByCurrency(avail, editCurrency)} ${editCurrency}, ຕ້ອງການຈ່າຍ ${formatByCurrency(amt, editCurrency)} ${editCurrency})`;
      } else {
        const bankName =
          banks.find((b) => b.id === editBankAccountId)?.nameLo ??
          bankBalances.find((b) => b.bankAccountId === editBankAccountId)?.bankNameLo ??
          'ທະນາຄານ';
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

  const editMissingHints: string[] = [];
  if (!editCategoryId) editMissingHints.push('ເລືອກລາຍການ');
  if (editMethod === 'BANK' && !editBankAccountId) editMissingHints.push('ເລືອກທະນາຄານ');
  if (!isPositive(editAmount)) editMissingHints.push('ປ້ອນຈຳນວນເງິນ > 0');

  const update = useMutation({
    mutationFn: () => {
      if (!editingRow) throw new Error('No row selected');
      if (!canSaveEdit || editInsufficientError) {
        throw new Error(editInsufficientError || 'ບໍ່ສາມາດບັນທຶກໄດ້ (ຂໍ້ມູນບໍ່ຖືກຕ້ອງ ຫຼື ເງິນບໍ່ພໍ)');
      }
      return api.patch(`/finance/income-expense/${editingRow.id}`, {
        categoryId: editCategoryId,
        method: editMethod,
        bankAccountId: editMethod === 'BANK' ? editBankAccountId : null,
        currency: editCurrency,
        amount: clean(editAmount),
        note: editNote.trim() || undefined,
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
      const detail = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ';
      setEditError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/income-expense/${id}`),
    onSuccess: () => {
      toast.success('ລຶບສຳເລັດ');
      setDeletingRow(null);
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'deleted'] });
    },
    onError: (e) => {
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

  /* ── CSV Export ── */
  const exportCsv = () => {
    const header = [
      'ລ/ດ',
      'ລະຫັດລາຍການ',
      'ວັນທີ',
      'ເວລາ',
      'ໝວດ',
      'ລາຍການ',
      'ຮູບແບບຈ່າຍ',
      'ທະນາຄານ',
      'ສະກຸນເງິນ',
      'ຈຳນວນເງິນ',
      'ໝາຍເຫດ',
      'ຜູ້ບັນທຶກ',
    ]
      .map(csvField)
      .join(',');

    const body = filteredRows
      .map((row, idx) =>
        [
          String(idx + 1),
          row.code,
          formatDate(row.createdAt),
          formatTimeOnly(row.createdAt),
          row.kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ',
          row.category.nameLo,
          METHOD_LABEL[row.method] ?? row.method,
          row.bankAccount?.nameLo ?? '—',
          row.currency,
          row.amount,
          row.note ?? '',
          row.createdBy,
        ]
          .map(csvField)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kpv-income-expense-${history.from}_${history.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການລາຍຮັບລາຍຈ່າຍ"
        subtitle="ບັນທຶກລາຍຮັບ / ລາຍຈ່າຍ ຜ່ານ Cash ຫຼື Bank (TOR §3.7)"
        actions={
          <>
            <button
              type="button"
              className="btn-secondary cursor-pointer"
              onClick={() => openCreate('INCOME')}
            >
              <ArrowDownInflowIcon className="h-4 w-4 text-success" />
              <span>ບັນທຶກລາຍຮັບ</span>
            </button>
            <button
              type="button"
              className="btn-primary cursor-pointer"
              onClick={() => openCreate('EXPENSE')}
            >
              <PlusIcon className="h-4 w-4" />
              <span>ບັນທຶກລາຍຈ່າຍ</span>
            </button>
          </>
        }
      />

      {formQuery && <QueryErrorNotice error={formQuery.error} onRetry={() => void formQuery.refetch()} />}

      <IncomeExpenseSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        onRefresh={() => {
          void summaryQuery.refetch();
          history.refetch();
        }}
        isToday={history.isToday}
        fromDate={history.from}
        toDate={history.to}
      />

      {/* ── History Ledger Card ── */}
      <div data-fade className="card">
        <div className="card-header flex-wrap">
          <div className="flex items-center gap-2.5">
            <h2 className="card-title">ປະຫວັດລາຍຮັບ-ລາຍຈ່າຍ</h2>
            <button
              type="button"
              className="rounded-md p-1 text-muted hover:text-fg cursor-pointer transition-colors duration-200"
              title="ໂຫຼດຂໍ້ມູນໃໝ່"
              aria-label="ໂຫຼດຂໍ້ມູນໃໝ່"
              onClick={() => {
                history.refetch();
                void summaryQuery.refetch();
              }}
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${history.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs h-9 min-h-[36px] py-0 px-3 cursor-pointer"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
              title="ສົ່ງອອກຂໍ້ມູນຕາຕະລາງເປັນ CSV (UTF-8 Excel)"
            >
              <DownloadIcon className="h-3.5 w-3.5 text-gold" />
              <span>ສົ່ງອອກ CSV</span>
            </button>
            <button
              type="button"
              className="btn-secondary text-xs h-9 min-h-[36px] py-0 px-3 cursor-pointer"
              onClick={() => setIsPrintOpen(true)}
              disabled={filteredRows.length === 0}
              title="ພິມໃບລາຍງານລາຍຮັບ-ລາຍຈ່າຍ"
            >
              <PrinterIcon className="h-3.5 w-3.5 text-gold" />
              <span>ພິມລາຍງານ</span>
            </button>
          </div>
        </div>

        <DateRangeFilter history={history} />

        {/* ── Interactive Filter & Search Bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line bg-surface">
          <div className="seg flex-wrap max-w-full" role="tablist" aria-label="ກັ່ນຕອງປະເພດລາຍການ">
            <button
              type="button"
              role="tab"
              className="seg-btn whitespace-nowrap cursor-pointer"
              aria-selected={kindFilter === 'ALL'}
              onClick={() => {
                setKindFilter('ALL');
                pager.reset();
              }}
            >
              <span>ທັງໝົດ</span>
              <span className="seg-count">{rows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="seg-btn whitespace-nowrap cursor-pointer"
              aria-selected={kindFilter === 'INCOME'}
              onClick={() => {
                setKindFilter('INCOME');
                pager.reset();
              }}
            >
              <ArrowDownInflowIcon className="text-success h-3 w-3 shrink-0" />
              <span>ລາຍຮັບ (+)</span>
              <span className="seg-count">{incomeCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="seg-btn whitespace-nowrap cursor-pointer"
              aria-selected={kindFilter === 'EXPENSE'}
              onClick={() => {
                setKindFilter('EXPENSE');
                pager.reset();
              }}
            >
              <ArrowUpOutflowIcon className="text-danger h-3 w-3 shrink-0" />
              <span>ລາຍຈ່າຍ (−)</span>
              <span className="seg-count">{expenseCount}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {categoryOptions.length > 0 && (
              <select
                className="filter-date cursor-pointer text-xs h-9"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  pager.reset();
                }}
                aria-label="ກັ່ນຕອງລາຍການ"
              >
                <option value="ALL">ທຸກໝວດລາຍການ</option>
                {categoryOptions.map((catName) => (
                  <option key={catName} value={catName}>
                    {catName}
                  </option>
                ))}
              </select>
            )}

            <select
              className="filter-date cursor-pointer text-xs h-9"
              value={methodFilter}
              onChange={(e) => {
                setMethodFilter(e.target.value as 'ALL' | 'CASH' | 'BANK');
                pager.reset();
              }}
              aria-label="ກັ່ນຕອງຊ່ອງທາງຊຳລະ"
            >
              <option value="ALL">ທຸກຊ່ອງທາງ</option>
              <option value="CASH">ເງິນສົດ</option>
              <option value="BANK">ເງິນໂອນ</option>
            </select>

            <select
              className="filter-date cursor-pointer text-xs h-9"
              value={currencyFilter}
              onChange={(e) => {
                setCurrencyFilter(e.target.value as 'ALL' | 'LAK' | 'THB' | 'USD');
                pager.reset();
              }}
              aria-label="ເລືອກສະກຸນເງິນ"
            >
              <option value="ALL">ທຸກສະກຸນເງິນ</option>
              <option value="LAK">LAK (ກີບ)</option>
              <option value="THB">THB (ບາດ)</option>
              <option value="USD">USD (ໂດລາ)</option>
            </select>

            <div className="relative flex items-center flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                className="filter-date w-full pr-8 text-xs h-9"
                placeholder="ຄົ້ນຫາ ລະຫັດ, ລາຍການ, ໝາຍເຫດ..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  pager.reset();
                }}
                aria-label="ຄົ້ນຫາລາຍການ"
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

        {/* ── Filtered Totals Strip ── */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 px-5 py-2.5 bg-recessed border-b border-line text-xs">
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-muted">ລາຍຮັບລວມ:</span>
              {filteredTotals.incomes.length > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  {filteredTotals.incomes.map((inc) => (
                    <span key={inc.currency} className="num font-semibold text-success">
                      (+) {formatByCurrency(inc.amount, inc.currency)}{' '}
                      <span className="text-[10px] opacity-80">{inc.currency}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="num text-muted">0</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 border-l border-line pl-4">
              <span className="text-muted">ລາຍຈ່າຍລວມ:</span>
              {filteredTotals.expenses.length > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  {filteredTotals.expenses.map((exp) => (
                    <span key={exp.currency} className="num font-semibold text-danger">
                      (−) {formatByCurrency(exp.amount, exp.currency)}{' '}
                      <span className="text-[10px] opacity-80">{exp.currency}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="num text-muted">0</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Data Table ── */}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດລາຍຮັບ-ລາຍຈ່າຍ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ</th>
                <th>ວັນທີ &amp; ເວລາ</th>
                <th>ປະເພດ</th>
                <th>ລາຍການ</th>
                <th>ຊ່ອງທາງ / ທະນາຄານ</th>
                <th>ສະກຸນ</th>
                <th className="text-right">ຈຳນວນເງິນ</th>
                <th>ໝາຍເຫດ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={10}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການໃນຊ່ວງວັນທີນີ້"
                onRetry={() => history.refetch()}
              />

              {rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <SearchIcon className="h-7 w-7 text-muted opacity-40" />
                      <span className="text-sm font-medium text-fg">ບໍ່ພົບຂໍ້ມູນທີ່ກົງກັບເງື່ອນໄຂ</span>
                      <span className="text-xs text-muted">
                        ລອງປ່ຽນຄຳຄົ້ນຫາ ຫຼື ປັບປ່ຽນຕົວກັ່ນຕອງ
                      </span>
                      <button
                        type="button"
                        className="btn-secondary text-xs h-8 min-h-[32px] mt-1 cursor-pointer"
                        onClick={handleResetFilters}
                      >
                        ລ້າງຕົວກັ່ນຕອງ
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {pager.pageItems.map((row) => {
                const isIncome = row.kind === 'INCOME';
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors duration-150"
                    onClick={() => setViewingRow(row)}
                  >
                    <td className="font-mono text-xs text-fg-strong">{row.code}</td>
                    <td>
                      <div className="font-medium text-fg-strong">{formatDate(row.createdAt)}</div>
                      <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                        <ClockIcon className="h-3 w-3 opacity-60" />
                        <span>{formatTimeOnly(row.createdAt)}</span>
                      </div>
                    </td>
                    <td>
                      <span className={isIncome ? 'status-success' : 'status-danger'}>
                        {isIncome ? '+ ລາຍຮັບ' : '− ລາຍຈ່າຍ'}
                      </span>
                    </td>
                    <td className="font-medium text-fg-strong">{row.category.nameLo}</td>
                    <td>
                      <span className="badge text-xs font-normal">
                        {METHOD_LABEL[row.method] ?? row.method}
                      </span>
                      {row.bankAccount?.nameLo && (
                        <span className="block text-xs text-muted mt-0.5">
                          {row.bankAccount.nameLo}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge font-mono text-[11px] font-semibold">
                        {row.currency}
                      </span>
                    </td>
                    <td className={`num text-right font-semibold ${isIncome ? 'text-success' : 'text-danger'}`}>
                      {isIncome ? '(+) ' : '(−) '}
                      {formatByCurrency(row.amount, row.currency)}
                    </td>
                    <td className="text-muted max-w-[200px] truncate" title={row.note ?? ''}>
                      {row.note ?? '—'}
                    </td>
                    <td className="text-muted text-xs">{row.createdBy || '—'}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost text-xs px-2 py-1 min-h-[32px] cursor-pointer"
                          title="ເບິ່ງລາຍລະອຽດ"
                          aria-label={`ເບິ່ງລາຍລະອຽດ ${row.code}`}
                          onClick={() => setViewingRow(row)}
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              className="btn-ghost text-xs px-2 py-1 min-h-[32px] cursor-pointer"
                              title="ແກ້ໄຂ"
                              aria-label={`ແກ້ໄຂ ${row.code}`}
                              onClick={() => startEdit(row)}
                            >
                              <EditIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="btn-ghost text-danger text-xs px-2 py-1 min-h-[32px] cursor-pointer"
                              title="ລຶບ"
                              aria-label={`ລຶບ ${row.code}`}
                              onClick={() => setDeletingRow(row)}
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      {/* ── Create Dialog ── */}
      <Dialog
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setError(null);
        }}
        title={kind === 'INCOME' ? 'ບັນທຶກລາຍຮັບ (ເງິນເຂົ້າ)' : 'ບັນທຶກລາຍຈ່າຍ (ເງິນອອກ)'}
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
          {/* Kind Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-recessed p-3">
            <div className="seg" role="tablist" aria-label="ເລືອກປະເພດລາຍການ">
              <button
                type="button"
                role="tab"
                aria-selected={kind === 'INCOME'}
                className="seg-btn cursor-pointer"
                onClick={() => {
                  setKind('INCOME');
                  setCategoryId('');
                  setError(null);
                }}
              >
                <ArrowDownInflowIcon className="h-3.5 w-3.5 text-success" />
                <span>ລາຍຮັບ (ເງິນເຂົ້າ)</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={kind === 'EXPENSE'}
                className="seg-btn cursor-pointer"
                onClick={() => {
                  setKind('EXPENSE');
                  setCategoryId('');
                  setError(null);
                }}
              >
                <ArrowUpOutflowIcon className="h-3.5 w-3.5 text-danger" />
                <span>ລາຍຈ່າຍ (ເງິນອອກ)</span>
              </button>
            </div>
            <span className={kind === 'INCOME' ? 'status-success' : 'status-danger'}>
              {kind === 'INCOME' ? '+ ເພີ່ມຍອດເງິນ' : '− ຫັກຍອດເງິນ'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cat">
                ລາຍການ <span className="text-danger">*</span>
              </label>
              <select
                id="cat"
                className="input cursor-pointer"
                value={categoryId}
                disabled={categoriesQuery.isLoading}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">
                  {categoriesQuery.isLoading ? 'ກຳລັງໂຫຼດລາຍການ...' : '— ເລືອກລາຍການ —'}
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameLo}
                  </option>
                ))}
              </select>
              {!categoriesQuery.isLoading && categories.length === 0 && (
                <p className="mt-1 text-xs text-warning">
                  ຍັງບໍ່ມີໝວດລາຍການສຳລັບ{kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'} — ກະລຸນາເພີ່ມໃນເມນູຕັ້ງຄ່າກ່ອນ
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="note">ໝາຍເຫດ</label>
              <input
                id="note"
                className="input"
                placeholder="ລະບຸລາຍລະອຽດເພີ່ມເຕີມ (ຖ້າມີ)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <MultiPayment
              lines={payments}
              onChange={setPayments}
              direction={kind === 'INCOME' ? 'in' : 'out'}
              labelLo={kind === 'INCOME' ? 'ຮັບເງິນ (ສົດ / ໂອນ)' : 'ຈ່າຍເງິນ (ສົດ / ໂອນ)'}
              hideInsufficientNotice
              hideEquivalent
            />

            {createTotalsByCurrency.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-recessed px-3.5 py-2.5 text-xs">
                <span className="text-muted">
                  ຍອດລວມທີ່ຈະບັນທຶກ ({paymentPayload(payments).length} ລາຍການ):
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {createTotalsByCurrency.map((t) => (
                    <span
                      key={t.currency}
                      className={`num font-semibold ${kind === 'INCOME' ? 'text-success' : 'text-danger'}`}
                    >
                      {kind === 'INCOME' ? '(+) ' : '(−) '}
                      {formatByCurrency(t.amount, t.currency)} {t.currency}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {insufficientExpenseError && (
            <div role="alert" className="notice status-danger">
              {insufficientExpenseError}
            </div>
          )}

          {!insufficientExpenseError && createMissingHints.length > 0 && (
            <div className="text-xs text-muted">
              ຂໍ້ມູນທີ່ຕ້ອງການ: {createMissingHints.join(' · ')}
            </div>
          )}

          {error && (
            <div id="ie-error" role="alert" className="notice status-danger">
              {error}
            </div>
          )}
        </div>
      </Dialog>

      {/* ── Detail Dialog ── */}
      <Dialog
        open={Boolean(viewingRow)}
        onClose={() => setViewingRow(null)}
        title="ລາຍລະອຽດລາຍການຮັບ-ຈ່າຍ"
        size="md"
        footer={
          <>
            {isAdmin && viewingRow && (
              <div className="flex items-center gap-2 mr-auto">
                <button
                  type="button"
                  className="btn-secondary text-xs cursor-pointer"
                  onClick={() => {
                    const row = viewingRow;
                    setViewingRow(null);
                    startEdit(row);
                  }}
                >
                  <EditIcon className="h-3.5 w-3.5" />
                  <span>ແກ້ໄຂ</span>
                </button>
                <button
                  type="button"
                  className="btn-danger text-xs cursor-pointer"
                  onClick={() => {
                    const row = viewingRow;
                    setViewingRow(null);
                    setDeletingRow(row);
                  }}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  <span>ລຶບ</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className="btn-secondary cursor-pointer"
              onClick={() => setViewingRow(null)}
            >
              ປິດ
            </button>
          </>
        }
      >
        {viewingRow && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-line bg-recessed flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs text-muted block mb-1">ຈຳນວນເງິນ</span>
                <div
                  className={`num text-2xl font-bold ${
                    viewingRow.kind === 'INCOME' ? 'text-success' : 'text-danger'
                  }`}
                >
                  {viewingRow.kind === 'INCOME' ? '(+) ' : '(−) '}
                  {formatByCurrency(viewingRow.amount, viewingRow.currency)}{' '}
                  <span className="text-sm font-semibold">{viewingRow.currency}</span>
                </div>
              </div>
              <span className={viewingRow.kind === 'INCOME' ? 'status-success' : 'status-danger'}>
                {viewingRow.kind === 'INCOME' ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg border border-line bg-surface">
                <span className="text-xs text-muted block mb-1">ລະຫັດລາຍການ</span>
                <span className="font-mono text-xs font-semibold text-fg-strong select-all">
                  {viewingRow.code}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-line bg-surface">
                <span className="text-xs text-muted block mb-1">ວັນທີ &amp; ເວລາ</span>
                <span className="font-medium text-fg-strong">{formatDateTime(viewingRow.createdAt)}</span>
              </div>
              <div className="p-3 rounded-lg border border-line bg-surface">
                <span className="text-xs text-muted block mb-1">ລາຍການ (ໝວດ)</span>
                <span className="font-medium text-fg-strong">{viewingRow.category.nameLo}</span>
              </div>
              <div className="p-3 rounded-lg border border-line bg-surface">
                <span className="text-xs text-muted block mb-1">ຊ່ອງທາງການຊຳລະ</span>
                <span className="font-medium text-fg-strong">
                  {METHOD_LABEL[viewingRow.method] ?? viewingRow.method}
                  {viewingRow.bankAccount?.nameLo ? ` · ${viewingRow.bankAccount.nameLo}` : ''}
                </span>
              </div>
              <div className="p-3 rounded-lg border border-line bg-surface sm:col-span-2">
                <span className="text-xs text-muted block mb-1">ຜູ້ບັນທຶກ</span>
                <span className="font-medium text-fg-strong">{viewingRow.createdBy || '—'}</span>
              </div>
            </div>

            <div>
              <span className="label">ໝາຍເຫດ</span>
              <div className="p-3 rounded-lg border border-line bg-surface text-sm whitespace-pre-wrap min-h-[52px]">
                {viewingRow.note || <span className="text-muted italic">ບໍ່ມີໝາຍເຫດ</span>}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog
        open={Boolean(editingRow)}
        onClose={() => {
          setEditingRow(null);
          setEditError(null);
        }}
        title={editingRow ? `ແກ້ໄຂລາຍການ ${editingRow.code}` : 'ແກ້ໄຂລາຍການຮັບຈ່າຍ'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary cursor-pointer"
              onClick={() => {
                setEditingRow(null);
                setEditError(null);
              }}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary cursor-pointer"
              disabled={!canSaveEdit || update.isPending}
              onClick={() => update.mutate()}
            >
              {update.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກການແກ້ໄຂ'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-recessed p-3">
            <div className="seg" role="tablist" aria-label="ປະເພດລາຍການແກ້ໄຂ">
              <button
                type="button"
                role="tab"
                aria-selected={editKind === 'INCOME'}
                className="seg-btn cursor-pointer"
                onClick={() => {
                  setEditKind('INCOME');
                  setEditCategoryId('');
                  setEditError(null);
                }}
              >
                <ArrowDownInflowIcon className="h-3.5 w-3.5 text-success" />
                <span>ລາຍຮັບ</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editKind === 'EXPENSE'}
                className="seg-btn cursor-pointer"
                onClick={() => {
                  setEditKind('EXPENSE');
                  setEditCategoryId('');
                  setEditError(null);
                }}
              >
                <ArrowUpOutflowIcon className="h-3.5 w-3.5 text-danger" />
                <span>ລາຍຈ່າຍ</span>
              </button>
            </div>
            <span className={editKind === 'INCOME' ? 'status-success' : 'status-danger'}>
              {editKind === 'INCOME' ? '+ ເງິນເຂົ້າ' : '− ເງິນອອກ'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-cat">
                ລາຍການ <span className="text-danger">*</span>
              </label>
              <select
                id="edit-cat"
                className="input cursor-pointer"
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
              >
                <option value="">— ເລືອກລາຍການ —</option>
                {editingRow &&
                  editCategoryId &&
                  !editCategories.some((c) => c.id === editCategoryId) && (
                    <option value={editCategoryId}>{editingRow.category.nameLo}</option>
                  )}
                {editCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameLo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="edit-method">ຮູບແບບຊຳລະ</label>
              <select
                id="edit-method"
                className="input cursor-pointer"
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
                <option value="CASH">ເງິນສົດ (CASH)</option>
                <option value="BANK">ເງິນໂອນ (BANK)</option>
              </select>
            </div>

            {editMethod === 'BANK' && (
              <div>
                <label className="label" htmlFor="edit-bank">
                  ທະນາຄານ <span className="text-danger">*</span>
                </label>
                <select
                  id="edit-bank"
                  className="input cursor-pointer"
                  value={editBankAccountId}
                  onChange={(e) => setEditBankAccountId(e.target.value)}
                >
                  <option value="">— ເລືອກທະນາຄານ —</option>
                  {editingRow &&
                    editBankAccountId &&
                    !banks.some((b) => b.id === editBankAccountId) &&
                    editingRow.bankAccount && (
                      <option value={editBankAccountId}>{editingRow.bankAccount.nameLo}</option>
                    )}
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameLo}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label" htmlFor="edit-cur">ສະກຸນເງິນ</label>
              <select
                id="edit-cur"
                className="input cursor-pointer"
                value={editCurrency}
                onChange={(e) => {
                  const nextCur = e.target.value as 'LAK' | 'THB' | 'USD';
                  setEditCurrency(nextCur);
                  if (nextCur === 'LAK' && editAmount) {
                    setEditAmount(sanitizeNumeric(editAmount, { decimals: 0 }));
                  }
                }}
              >
                <option value="LAK">LAK (ກີບ)</option>
                <option value="THB">THB (ບາດ)</option>
                <option value="USD">USD (ໂດລາ)</option>
              </select>
            </div>

            <div className={editMethod === 'BANK' ? '' : 'sm:col-span-2'}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <label className="label" htmlFor="edit-amt">
                  ຈຳນວນເງິນ <span className="text-danger">*</span>
                </label>
                {editAvailableBalance && (
                  <span className="text-xs text-muted mb-1">
                    {editAvailableBalance.label}:{' '}
                    <strong className="num text-fg-strong">
                      {formatByCurrency(editAvailableBalance.amount, editCurrency)} {editCurrency}
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
              <label className="label" htmlFor="edit-note">ໝາຍເຫດ</label>
              <input
                id="edit-note"
                className="input"
                placeholder="ລະບຸລາຍລະອຽດເພີ່ມເຕີມ..."
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
              />
            </div>
          </div>

          {editInsufficientError && (
            <div role="alert" className="notice status-danger">
              {editInsufficientError}
            </div>
          )}

          {!editInsufficientError && editMissingHints.length > 0 && (
            <div className="text-xs text-muted">
              ຂໍ້ມູນທີ່ຕ້ອງການ: {editMissingHints.join(' · ')}
            </div>
          )}

          {editError && (
            <div role="alert" className="notice status-danger">
              {editError}
            </div>
          )}
        </div>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog
        open={Boolean(deletingRow)}
        onClose={() => {
          if (!remove.isPending) setDeletingRow(null);
        }}
        title="ຢືນຢັນການລຶບລາຍການ"
        size="md"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary cursor-pointer"
              disabled={remove.isPending}
              onClick={() => setDeletingRow(null)}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-danger cursor-pointer"
              disabled={remove.isPending || !deletingRow}
              onClick={() => deletingRow && remove.mutate(deletingRow.id)}
            >
              {remove.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
            </button>
          </>
        }
      >
        {deletingRow && (
          <div className="space-y-3 text-sm">
            <p className="text-fg">
              ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການນີ້? ລະບົບຈະປັບປຸງຍອດເງິນໃນ{' '}
              <strong>{deletingRow.method === 'BANK' ? 'Module Bank' : 'Module Cash'}</strong>{' '}
              ຄືນອັດຕະໂນມັດ.
            </p>
            <div className="rounded-xl border border-line bg-recessed p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">ລະຫັດ:</span>
                <span className="font-mono font-semibold text-fg-strong">{deletingRow.code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">ລາຍການ:</span>
                <span className="font-medium text-fg-strong">{deletingRow.category.nameLo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">ຊ່ອງທາງ:</span>
                <span className="text-fg-strong">
                  {METHOD_LABEL[deletingRow.method] ?? deletingRow.method}
                  {deletingRow.bankAccount?.nameLo ? ` · ${deletingRow.bankAccount.nameLo}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-1.5">
                <span className="text-muted">ຈຳນວນເງິນ:</span>
                <span
                  className={`num font-bold ${
                    deletingRow.kind === 'INCOME' ? 'text-success' : 'text-danger'
                  }`}
                >
                  {deletingRow.kind === 'INCOME' ? '(+) ' : '(−) '}
                  {formatByCurrency(deletingRow.amount, deletingRow.currency)} {deletingRow.currency}
                </span>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ── Printable Report Preview ── */}
      <PrintSheet open={isPrintOpen} onClose={() => setIsPrintOpen(false)}>
        <div className="sheet-head">
          <div>
            <h2>ໃບລາຍງານລາຍຮັບ-ລາຍຈ່າຍ (Income &amp; Expense)</h2>
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

        <div className="my-4 p-3 rounded border border-current/20 text-xs flex flex-wrap items-center justify-between gap-2">
          <div>
            <b>ຈຳນວນລາຍການ: </b>
            {filteredRows.length.toLocaleString('en-US')} ລາຍການ
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <b>ລາຍຮັບລວມ: </b>
              {filteredTotals.incomes.length > 0
                ? filteredTotals.incomes
                    .map((inc) => `${formatByCurrency(inc.amount, inc.currency)} ${inc.currency}`)
                    .join(' · ')
                : '0'}
            </div>
            <div>
              <b>ລາຍຈ່າຍລວມ: </b>
              {filteredTotals.expenses.length > 0
                ? filteredTotals.expenses
                    .map((exp) => `${formatByCurrency(exp.amount, exp.currency)} ${exp.currency}`)
                    .join(' · ')
                : '0'}
            </div>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th className="w-10">ລ/ດ</th>
              <th>ລະຫັດ</th>
              <th>ວັນທີ-ເວລາ</th>
              <th>ປະເພດ</th>
              <th>ລາຍການ</th>
              <th>ຊ່ອງທາງ</th>
              <th>ສະກຸນ</th>
              <th className="text-right">ຈຳນວນເງິນ</th>
              <th>ໝາຍເຫດ</th>
              <th>ຜູ້ບັນທຶກ</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => {
              const isIncome = row.kind === 'INCOME';
              return (
                <tr key={row.id}>
                  <td>{idx + 1}</td>
                  <td className="font-mono">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{isIncome ? 'ລາຍຮັບ' : 'ລາຍຈ່າຍ'}</td>
                  <td>{row.category.nameLo}</td>
                  <td>
                    {METHOD_LABEL[row.method] ?? row.method}
                    {row.bankAccount?.nameLo ? ` (${row.bankAccount.nameLo})` : ''}
                  </td>
                  <td>{row.currency}</td>
                  <td className="text-right num font-semibold">
                    {isIncome ? '(+) ' : '(−) '}
                    {formatByCurrency(row.amount, row.currency)}
                  </td>
                  <td>{row.note ?? '—'}</td>
                  <td>{row.createdBy || '—'}</td>
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
