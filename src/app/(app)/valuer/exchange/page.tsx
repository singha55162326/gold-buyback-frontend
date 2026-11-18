'use client';

import { type MutableRefObject, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime, formatByCurrency } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { useHistoryRange } from '@/components/date-range';
import {
  calcTotalLak,
  MultiPayment,
  newPaymentLines,
  paymentPayload,
  useInsufficientFundsError,
} from '@/components/multi-payment';
import type { PaymentLine, Rates } from '@/components/multi-payment';
import { OrderFilterBar, useOrderSearchFilter } from '@/components/order-filter-bar';
import { Pagination, usePagination } from '@/components/pagination';
import { Dialog } from '@/components/dialog';
import { useRealtimeInvalidate } from '@/lib/realtime';

interface GoldType { id: string; code: string; nameLo: string }
interface GoldItem { id: string; nameLo: string }
interface Sku { id: string; fullSkuName: string; weightG: string }
interface Cabinet { id: string; nameLo: string }
interface BankAccount { id: string; code: string; nameLo: string }
interface Shift { id: string; status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED' | 'REJECTED' }

interface OldLine {
  goldTypeId: string;
  goldItemId: string;
  weightG: string;
  quantity: string;
  standardWeightG: string;
}

interface NewLine {
  goldSkuId: string;
  cabinetId: string;
  weightG: string;
  quantity: string;
  patternFee: string;
}

interface RemainingLine {
  goldTypeId: string;
  weightG: string;
  quantity: string;
}

interface Preview {
  standardOldWeightG: string;
  actualOldWeightG: string;
  totalNewWeightG: string;
  totalRemainingWeightG: string;
  softGoldFee: string;
  humpFee: string;
  barConvertFee: string;
  patternFee: string;
  shopBuybackPrice: string;
  totalPayable: string;
  isBalanced: boolean;
  difference: string;
  messageLo: string | null;
  newLines?: Array<{ humpFee: string; barConvertFee: string; patternFee: string }>;
  remainingLines?: Array<{ shopBuybackPrice: string }>;
}

type ExchangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

interface ExchangePayment {
  id: string;
  method: 'CASH' | 'BANK';
  bankAccountId?: string | null;
  currency: string;
  amount: string;
  amountLak: string;
  changeLak: string;
  bankAccount?: { nameLo: string } | null;
}

interface ExchangeRow {
  id: string;
  code: string;
  txnType: 'EXCHANGE_TO_CASH' | 'FREE_EXCHANGE' | string;
  shapeCondition?: 'GOOD' | 'DAMAGED';
  softGoldFee?: string;
  totalPayable: string;
  paidAmount?: string;
  outstandingAmount: string;
  status: ExchangeStatus;
  rejectReason?: string | null;
  createdAt: string;
  createdById?: string;
  createdBy?: string;
  updatedBy?: string;
  customer: { phone: string };
  oldLines: Array<{
    id: string;
    goldTypeId?: string;
    goldItemId?: string | null;
    weightG: string;
    quantity: number;
    standardWeightG?: string;
    shopBuybackPrice?: string;
    goldType?: { id: string; code: string; nameLo: string };
    goldItem?: { id: string; nameLo: string } | null;
  }>;
  newLines: Array<{
    id: string;
    goldSkuId?: string;
    cabinetId?: string | null;
    weightG: string;
    quantity: number;
    humpFee?: string;
    barConvertFee?: string;
    patternFee?: string;
    goldSku?: { id: string; fullSkuName: string; weightG: string };
    cabinet?: { id: string; nameLo: string } | null;
  }>;
  remainingLines?: Array<{
    id: string;
    weightG: string;
    quantity: number;
    shopBuybackPrice: string;
  }>;
  payments?: ExchangePayment[];
}

interface ExchangeDetail extends ExchangeRow {
  audits?: Array<{
    id: string;
    action: string;
    summary: string | null;
    createdAt: string;
    actor?: { fullName: string } | null;
  }>;
}

const STATUS_LABEL: Record<ExchangeStatus, { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ສຳເລັດ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

const emptyOld = (): OldLine => ({
  goldTypeId: '', goldItemId: '', weightG: '', quantity: '1', standardWeightG: '',
});
const emptyNew = (): NewLine => ({
  goldSkuId: '', cabinetId: '', weightG: '', quantity: '1', patternFee: '',
});
const emptyRemaining = (): RemainingLine => ({
  goldTypeId: '', weightG: '', quantity: '1',
});

const qty = (value: string) => Math.max(1, Math.trunc(Number(value) || 0) || 1);

const isOldLineReady = (l: OldLine) =>
  Boolean(l.goldTypeId && Number(l.weightG) > 0 && Number(l.standardWeightG) > 0);
const isNewLineReady = (l: NewLine) => Boolean(l.goldSkuId && Number(l.weightG) > 0);
const isRemainingLineReady = (l: RemainingLine) => Number(l.weightG) > 0;

const REALTIME_KEYS = ['exchange', 'cash', 'notifications'] as const;
const STANDARD_WEIGHT_PRESETS = ['15', '7.5', '3.75', '1.875', '1.125', '0.75', '0.375'] as const;

/**
 * TOR §5.2 — ລາຍການປ່ຽນເປັນເງິນ (Gold Exchange & Trade-in).
 *
 * The totals and the ⚠ zero-balance check come from the API on every change,
 * because §5.2 depends on the ຄ່າປ່ຽນ tables and the live price snapshot. The
 * Save button enforces the same zero-balance rule plus shift and payment checks.
 */
export default function ExchangePage() {
  const queryClient = useQueryClient();
  useRealtimeInvalidate(REALTIME_KEYS);
  const toast = useToast();
  const user = getStoredUser();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [phone, setPhone] = useState('');
  const [txnType, setTxnType] = useState<'EXCHANGE_TO_CASH' | 'FREE_EXCHANGE'>('EXCHANGE_TO_CASH');
  const [shapeCondition, setShapeCondition] = useState<'GOOD' | 'DAMAGED'>('GOOD');
  const [oldLines, setOldLines] = useState<OldLine[]>([emptyOld()]);
  const [newLines, setNewLines] = useState<NewLine[]>([emptyNew()]);
  const [remainingLines, setRemainingLines] = useState<RemainingLine[]>([]);
  const oldListRef = useRef<HTMLDivElement | null>(null);
  const newListRef = useRef<HTMLDivElement | null>(null);
  const remainingListRef = useRef<HTMLDivElement | null>(null);
  const scrollOldRef = useRef(false);
  const scrollNewRef = useRef(false);
  const scrollRemainingRef = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines);
  const [error, setError] = useState<string | null>(null);

  // History filters & dialogs
  const [statusFilter, setStatusFilter] = useState('');
  const [txnTypeFilter, setTxnTypeFilter] = useState('');
  const searchFilter = useOrderSearchFilter();
  const [viewingRow, setViewingRow] = useState<ExchangeRow | null>(null);
  const [cancellingRow, setCancellingRow] = useState<ExchangeRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deletingRow, setDeletingRow] = useState<ExchangeRow | null>(null);
  const [settlingRow, setSettlingRow] = useState<ExchangeRow | null>(null);
  const [settlePayments, setSettlePayments] = useState<PaymentLine[]>(newPaymentLines);

  const { data: shift } = useQuery({
    queryKey: ['shift', 'me'],
    queryFn: () => api.get<Shift | null>('/shifts/me'),
  });
  const hasOpenShift = shift?.status === 'OPEN';

  const { data: goldTypes = [], isError: goldTypesFailed, error: goldTypesError, refetch: refetchGoldTypes } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types?stockOnly=true'),
  });
  const { data: goldItems = [], isError: goldItemsFailed, error: goldItemsError, refetch: refetchGoldItems } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const { data: skus = [], isError: skusFailed, error: skusError, refetch: refetchSkus } = useQuery({
    queryKey: ['skus'],
    queryFn: () => api.get<Sku[]>('/skus'),
  });
  const { data: cabinets = [], isError: cabinetsFailed, error: cabinetsError, refetch: refetchCabinets } = useQuery({
    queryKey: ['catalog', 'cabinets'],
    queryFn: () => api.get<Cabinet[]>('/catalog/cabinets'),
  });
  const { isError: banksFailed, error: banksError, refetch: refetchBanks } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<BankAccount[]>('/catalog/bank-accounts'),
  });

  // ຄຳຕົ້ມ (BOILED) ບໍ່ຮອງຮັບໃນ §5.2 — ກອງອອກຈາກລາຍການເລືອກໃຫ້ກົງກັບ API.
  const selectableGoldTypes = useMemo(
    () => goldTypes.filter((t) => t.code !== 'BOILED'),
    [goldTypes],
  );

  const historyParams = useMemo(
    () => ({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(txnTypeFilter ? { txnType: txnTypeFilter } : {}),
      ...(searchFilter.debouncedSearch ? { search: searchFilter.debouncedSearch } : {}),
    }),
    [statusFilter, txnTypeFilter, searchFilter.debouncedSearch],
  );

  const history = useHistoryRange<ExchangeRow>(['exchange'], '/exchange', { params: historyParams });
  const rows = history.rows;
  const rowsFailed = history.isError;
  const rowsError = history.error;
  const refetchRows = history.refetch;

  const { data: viewedDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['exchange', 'detail', viewingRow?.id],
    queryFn: () => api.get<ExchangeDetail>(`/exchange/${viewingRow!.id}`),
    enabled: Boolean(viewingRow),
    retry: false,
  });

  const filteredRows = useMemo(() => {
    const q = searchFilter.searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (txnTypeFilter && row.txnType !== txnTypeFilter) return false;
      if (!q) return true;
      return row.code.toLowerCase().includes(q) || row.customer.phone.toLowerCase().includes(q);
    });
  }, [rows, statusFilter, txnTypeFilter, searchFilter.searchTerm]);

  const pager = usePagination(filteredRows);

  const allOldValid = oldLines.length > 0 && oldLines.every(isOldLineReady);
  const allNewValid = newLines.every(isNewLineReady);
  const allRemainingValid = remainingLines.every(isRemainingLineReady);
  const allLinesValid = allOldValid && allNewValid && allRemainingValid;

  /** Request body for preview & save (without `phone`/`payments` so typing phone never triggers preview). */
  const previewPayload = useMemo(
    () => ({
      txnType,
      shapeCondition,
      oldLines: oldLines.filter(isOldLineReady).map((l) => ({
        goldTypeId: l.goldTypeId,
        goldItemId: l.goldItemId || undefined,
        weightG: l.weightG.trim(),
        quantity: qty(l.quantity),
        standardWeightG: l.standardWeightG.trim(),
      })),
      newLines: newLines.filter(isNewLineReady).map((l) => ({
        goldSkuId: l.goldSkuId,
        cabinetId: l.cabinetId || undefined,
        weightG: l.weightG.trim(),
        quantity: qty(l.quantity),
        patternFee: txnType === 'FREE_EXCHANGE' ? undefined : (l.patternFee.trim() || undefined),
      })),
      remainingLines: remainingLines.filter(isRemainingLineReady).map((l) => ({
        goldTypeId: l.goldTypeId || undefined,
        weightG: l.weightG.trim(),
        quantity: qty(l.quantity),
      })),
    }),
    [txnType, shapeCondition, oldLines, newLines, remainingLines],
  );
  const previewKey = JSON.stringify(previewPayload);

  /* Re-price and re-check the balance when gold lines or txn options change. */
  useEffect(() => {
    const parsed = JSON.parse(previewKey) as typeof previewPayload;
    if (!showForm || parsed.oldLines.length === 0) {
      setPreview(null);
      setIsPreviewing(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsPreviewing(true);
    const timer = setTimeout(() => {
      api
        .post<Preview>('/exchange/preview', parsed)
        .then((result) => {
          if (!cancelled) {
            setPreview(result);
            setIsPreviewing(false);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setPreview(null);
            setIsPreviewing(false);
            setError(e instanceof ApiError ? e.message : null);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showForm, previewKey]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setStep(1);
    setPhone('');
    setTxnType('EXCHANGE_TO_CASH');
    setShapeCondition('GOOD');
    setOldLines([emptyOld()]);
    setNewLines([emptyNew()]);
    setRemainingLines([]);
    setPreview(null);
    setIsPreviewing(false);
    setError(null);
    setPayments(newPaymentLines());
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (row: ExchangeRow) => {
    setEditingId(row.id);
    setPhone(row.customer.phone);
    setTxnType(row.txnType === 'FREE_EXCHANGE' ? 'FREE_EXCHANGE' : 'EXCHANGE_TO_CASH');
    setShapeCondition(row.shapeCondition === 'DAMAGED' ? 'DAMAGED' : 'GOOD');
    setOldLines(
      row.oldLines.length
        ? row.oldLines.map((l) => ({
            goldTypeId: l.goldTypeId ?? l.goldType?.id ?? '',
            goldItemId: l.goldItemId ?? l.goldItem?.id ?? '',
            weightG: String(Number(l.weightG)),
            quantity: String(l.quantity),
            standardWeightG: l.standardWeightG ? String(Number(l.standardWeightG)) : String(Number(l.weightG)),
          }))
        : [emptyOld()],
    );
    setNewLines(
      row.newLines.length
        ? row.newLines.map((l) => ({
            goldSkuId: l.goldSkuId ?? l.goldSku?.id ?? '',
            cabinetId: l.cabinetId ?? l.cabinet?.id ?? '',
            weightG: String(Number(l.weightG)),
            quantity: String(l.quantity),
            patternFee: l.patternFee && Number(l.patternFee) > 0 ? String(Number(l.patternFee)) : '',
          }))
        : [],
    );
    setRemainingLines(
      (row.remainingLines ?? []).map((l) => ({
        goldTypeId: '',
        weightG: String(Number(l.weightG)),
        quantity: String(l.quantity),
      })),
    );
    setPayments(
      row.payments?.length
        ? row.payments.map((p) => ({
            method: p.method,
            bankAccountId: p.bankAccountId ?? undefined,
            currency: p.currency as PaymentLine['currency'],
            amount: String(Number(p.amount)),
          }))
        : newPaymentLines(),
    );
    setError(null);
    setShowForm(true);
  };

  const invalidateExchangeQueries = (includeLedger = false) => {
    void queryClient.invalidateQueries({ queryKey: ['exchange'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (includeLedger) {
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    }
  };

  const payableNum = preview ? Number(preview.totalPayable) : 0;
  const isIncomingPayment = payableNum < 0;
  const isZeroPayable = preview !== null && Math.abs(payableNum) < 0.0001;
  const absOwedLak = preview ? String(Math.abs(payableNum)) : undefined;

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...previewPayload,
        phone,
        payments: isZeroPayable ? [] : paymentPayload(payments),
      };
      return editingId
        ? api.patch(`/exchange/${editingId}`, body)
        : api.post('/exchange', body);
    },
    onSuccess: () => {
      resetForm();
      toast.success('ດຳເນີນການສຳເລັດ');
      invalidateExchangeQueries(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`/exchange/${id}/cancel`, { reason: reason?.trim() || undefined }),
    onSuccess: () => {
      setCancellingRow(null);
      setCancelReason('');
      setError(null);
      toast.success('ຍົກເລີກລາຍການສຳເລັດ');
      invalidateExchangeQueries(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຍົກເລີກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/exchange/${id}`),
    onSuccess: () => {
      setDeletingRow(null);
      setError(null);
      toast.success('ລຶບລາຍການສຳເລັດ');
      invalidateExchangeQueries(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ';
      setDeletingRow(null);
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const settleMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/exchange/${id}/payments`, { payments: paymentPayload(settlePayments) }),
    onSuccess: () => {
      setSettlingRow(null);
      setSettlePayments(newPaymentLines());
      setError(null);
      toast.success('ຊຳລະຍອດຄ້າງສຳເລັດ');
      invalidateExchangeQueries(true);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຊຳລະບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const { data: rates } = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
    enabled: showForm,
    retry: false,
  });

  const setOld = (i: number, patch: Partial<OldLine>) =>
    setOldLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setNew = (i: number, patch: Partial<NewLine>) =>
    setNewLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setRemaining = (i: number, patch: Partial<RemainingLine>) =>
    setRemainingLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const handleAddOld = () => {
    setStep(1);
    scrollOldRef.current = true;
    setOldLines((p) => [...p, emptyOld()]);
  };
  const handleAddNew = () => {
    setStep(2);
    scrollNewRef.current = true;
    setNewLines((p) => [...p, emptyNew()]);
  };
  const handleAddRemaining = () => {
    setStep(3);
    scrollRemainingRef.current = true;
    setRemainingLines((p) => [...p, emptyRemaining()]);
  };

  const fillRemainingDifference = () => {
    if (!preview) return;
    const diff = Number(preview.difference);
    if (!Number.isFinite(diff) || diff <= 0) return;
    const diffStr = formatWeight(preview.difference);
    setStep(3);
    setRemainingLines((prev) => {
      const emptyIdx = prev.findIndex((l) => !l.weightG.trim() || Number(l.weightG) <= 0);
      if (emptyIdx !== -1) {
        return prev.map((l, idx) => (idx === emptyIdx ? { ...l, weightG: diffStr, quantity: '1' } : l));
      }
      scrollRemainingRef.current = true;
      return [...prev, { goldTypeId: '', weightG: diffStr, quantity: '1' }];
    });
  };

  const oldStdWeightSum = useMemo(
    () => oldLines.reduce((s, l) => s + (Number(l.standardWeightG) || 0) * qty(l.quantity), 0),
    [oldLines],
  );
  const newWeightSum = useMemo(
    () => newLines.reduce((s, l) => s + (Number(l.weightG) || 0) * qty(l.quantity), 0),
    [newLines],
  );
  const remainingWeightSum = useMemo(
    () => remainingLines.reduce((s, l) => s + (Number(l.weightG) || 0) * qty(l.quantity), 0),
    [remainingLines],
  );
  const differenceNum = preview ? Number(preview.difference) : 0;

  useScrollOnAdd(oldLines.length, scrollOldRef, oldListRef, 'old-type');
  useScrollOnAdd(newLines.length, scrollNewRef, newListRef, 'new-sku');
  useScrollOnAdd(remainingLines.length, scrollRemainingRef, remainingListRef, 'rem-type');

  const paymentLines = paymentPayload(payments);
  const bankLegReady = paymentLines.every((l) => l.method !== 'BANK' || Boolean(l.bankAccountId));
  const insufficientFundsError = useInsufficientFundsError(
    payments,
    showForm && payableNum > 0,
    'ປ່ຽນເປັນເງິນ (Exchange)',
  );

  const paymentDirection = isIncomingPayment ? 'in' : 'out';
  const paymentTotalLak = calcTotalLak(payments, rates, paymentDirection);
  const paymentRemaining =
    preview !== null && !isZeroPayable ? Math.round(Math.abs(payableNum) - paymentTotalLak) : 0;
  // ກົງກັບ MultiPayment: ຖ້າຍອດ "ຍັງຂາດ" > 0 ຫ້າມ submit ລາຍການ.
  const hasPaymentShortfall = paymentRemaining > 0;

  const lakLegsTotal = paymentLines
    .filter((l) => l.currency === 'LAK')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const foreignLakTotal = paymentLines
    .filter((l) => l.currency !== 'LAK')
    .reduce((sum, l) => {
      const rate = l.currency === 'THB' ? Number(rates?.thbBuybackRate ?? 0) : Number(rates?.usdBuybackRate ?? 0);
      return sum + (Number(l.amount) || 0) * rate;
    }, 0);

  const lakExceedsPayable = payableNum > 0 && lakLegsTotal > payableNum + 0.0001;
  const mixedLakInvalid =
    payableNum > 0 && lakLegsTotal > 0 && foreignLakTotal >= payableNum - 0.0001;

  const paymentReady =
    preview !== null &&
    (isZeroPayable ||
      (paymentLines.length > 0 &&
        bankLegReady &&
        !hasPaymentShortfall &&
        (isIncomingPayment || (!insufficientFundsError && !lakExceedsPayable && !mixedLakInvalid))));

  const phoneValid = /^\d{8}$/.test(phone);
  const canSave =
    hasOpenShift &&
    phoneValid &&
    allLinesValid &&
    !isPreviewing &&
    preview?.isBalanced === true &&
    paymentReady;

  const settlePaymentLines = paymentPayload(settlePayments);
  const settleBankReady = settlePaymentLines.every(
    (l) => l.method !== 'BANK' || Boolean(l.bankAccountId),
  );
  const settleIsIncoming = settlingRow ? Number(settlingRow.totalPayable) < 0 : false;
  const settleInsufficientError = useInsufficientFundsError(
    settlePayments,
    Boolean(settlingRow && !settleIsIncoming),
    'ຊຳລະຄ້າງປ່ຽນເປັນເງິນ',
  );

  const canManageRow = (row: ExchangeRow) =>
    user?.role === 'ADMIN' || user?.role === 'MANAGER' || !row.createdById || row.createdById === user?.id;

  const viewingDetail: ExchangeDetail | null = viewingRow
    ? (viewedDetail && viewedDetail.id === viewingRow.id ? viewedDetail : viewingRow)
    : null;

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການປ່ຽນເປັນເງິນ"
        subtitle="Gold Exchange & Trade-in — ນ້ຳໜັກຕ້ອງສົມດຸນພໍດີຈຶ່ງບັນທຶກໄດ້ (TOR §5.2)"
        actions={
          <button type="button" className="btn-primary" onClick={openCreateForm}>
            + ສ້າງລາຍການປ່ຽນເປັນເງິນ
          </button>
        }
      />
      {goldTypesFailed && <QueryErrorNotice error={goldTypesError} onRetry={() => void refetchGoldTypes()} />}
      {goldItemsFailed && <QueryErrorNotice error={goldItemsError} onRetry={() => void refetchGoldItems()} />}
      {skusFailed && <QueryErrorNotice error={skusError} onRetry={() => void refetchSkus()} />}
      {cabinetsFailed && <QueryErrorNotice error={cabinetsError} onRetry={() => void refetchCabinets()} />}
      {banksFailed && <QueryErrorNotice error={banksError} onRetry={() => void refetchBanks()} />}

      {error && !showForm && (
        <div id="exchange-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {/* ── Form Dialog (4-Step Full-Width Wizard) ── */}
      <Dialog
        open={showForm}
        onClose={resetForm}
        size="xl"
        flushBody
        title={editingId ? 'ແກ້ໄຂລາຍການປ່ຽນເປັນເງິນ' : 'ສ້າງລາຍການປ່ຽນເປັນເງິນ'}
        subtitle="ດຳເນີນການຕາມ 4 ຂັ້ນຕອນ — ກວດສອບຄວາມສົມດຸນອັດຕະໂນມັດ (TOR §5.2)"
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <StatusPill ok={hasOpenShift} label={hasOpenShift ? 'ກະເປີດຢູ່' : 'ຍັງບໍ່ເປີດກະ'} />
              <StatusPill ok={phoneValid} label={`ເບີໂທ ${phone.length}/8`} />
              <StatusPill ok={allLinesValid && preview?.isBalanced === true} label="ນ້ຳໜັກສົມດຸນ" />
              <StatusPill ok={paymentReady} label="ການຈ່າຍເງິນ" />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary cursor-pointer" onClick={resetForm}>
                ຍົກເລີກ
              </button>
              {step > 1 && (
                <button
                  type="button"
                  className="btn-secondary cursor-pointer"
                  onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
                >
                  ← ກັບຄືນ
                </button>
              )}
              {step < 4 ? (
                <button
                  type="button"
                  className="btn-primary min-w-[150px] cursor-pointer"
                  onClick={() => setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))}
                >
                  ຖັດໄປ →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary min-w-[190px] cursor-pointer"
                  aria-describedby={error ? 'exchange-error-modal' : undefined}
                  disabled={!canSave || saveMutation.isPending}
                  onClick={() => {
                    if (!canSave) return;
                    saveMutation.mutate();
                  }}
                >
                  {saveMutation.isPending
                    ? 'ກຳລັງບັນທຶກ...'
                    : editingId
                      ? 'ບັນທຶກການແກ້ໄຂ'
                      : 'ບັນທຶກລາຍການ'}
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* ── Sticky Top: 4-Step Bar + Live Mini-Summary Strip ── */}
          <div className="shrink-0 space-y-3 border-b border-line bg-recessed px-5 py-3.5 sm:px-6">
            <nav aria-label="ຂັ້ນຕອນການປ່ຽນເປັນເງິນ">
              <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {(
                  [
                    {
                      num: 1 as const,
                      title: 'ລູກຄ້າ & ຄຳເກົ່າ',
                      meta: `${oldLines.length} ແຖວ · ${formatWeight(String(oldStdWeightSum))} g`,
                      done: phoneValid && allOldValid,
                      warn: false,
                    },
                    {
                      num: 2 as const,
                      title: 'ລາຍການຄຳໃໝ່',
                      meta: `${newLines.length} ແຖວ · ${formatWeight(String(newWeightSum))} g`,
                      done: allNewValid && (newLines.length > 0 || remainingLines.length > 0),
                      warn: false,
                    },
                    {
                      num: 3 as const,
                      title: 'ຄຳເກົ່າຄົງເຫຼືອ',
                      meta: `${remainingLines.length} ແຖວ · ${formatWeight(String(remainingWeightSum))} g`,
                      done: preview?.isBalanced === true && (remainingLines.length > 0 || differenceNum === 0),
                      warn: differenceNum > 0,
                    },
                    {
                      num: 4 as const,
                      title: 'ສະຫຼຸບ & ຈ່າຍເງິນ',
                      meta: preview ? `${formatLak(String(Math.abs(payableNum)))} LAK` : 'ລໍຖ້າຄຳນວນ',
                      done: preview?.isBalanced === true && paymentReady,
                      warn: false,
                    },
                  ] as const
                ).map((s) => {
                  const active = step === s.num;
                  return (
                    <li key={s.num}>
                      <button
                        type="button"
                        aria-current={active ? 'step' : undefined}
                        onClick={() => setStep(s.num)}
                        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors duration-150 ${
                          active
                            ? 'border-[var(--border-active)] bg-[var(--gold-tint)]'
                            : s.done
                              ? 'border-[var(--success-border)] bg-[var(--success-bg)]/40 hover:border-[var(--border-hover)]'
                              : 'border-line bg-surface hover:border-[var(--border-hover)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            active
                              ? 'bg-[var(--gold)] text-canvas'
                              : s.done
                                ? 'border border-[var(--success-border)] bg-[var(--success-bg)] text-success'
                                : 'border border-line bg-recessed text-muted'
                          }`}
                        >
                          {s.done && !active ? (
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            s.num
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`truncate text-xs font-bold ${active ? 'text-gold' : 'text-fg-strong'}`}>
                              {s.title}
                            </span>
                            {s.warn && !active && (
                              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--gold)]" />
                            )}
                          </div>
                          <div className="num truncate text-[11px] text-muted">{s.meta}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Compact Live Mini-Summary Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-muted">
                  ເກນເກົ່າ: <strong className="num text-fg-strong">{preview ? `${formatWeight(preview.standardOldWeightG)} g` : `${formatWeight(String(oldStdWeightSum))} g`}</strong>
                </span>
                <span className="text-muted">
                  ຄຳໃໝ່: <strong className="num text-fg-strong">{preview ? `${formatWeight(preview.totalNewWeightG)} g` : `${formatWeight(String(newWeightSum))} g`}</strong>
                </span>
                <span className="text-muted">
                  ຄົງເຫຼືອ: <strong className="num text-fg-strong">{preview ? `${formatWeight(preview.totalRemainingWeightG)} g` : `${formatWeight(String(remainingWeightSum))} g`}</strong>
                </span>
                {preview && (
                  <span className={preview.isBalanced ? 'status-success' : 'status-danger'}>
                    {preview.isBalanced
                      ? 'ສົມດຸນ'
                      : differenceNum > 0
                        ? `ຂາດ ${formatWeight(preview.difference)} g`
                        : `ເກີນ ${formatWeight(String(Math.abs(differenceNum)))} g`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isPreviewing && <span className="live-dot text-[11px]">ກຳລັງຄຳນວນ...</span>}
                <span className="text-muted">
                  {isIncomingPayment ? 'ລູກຄ້າຈ່າຍເພີ່ມ:' : 'ຍອດສຸດທິ:'}{' '}
                  <strong className="num text-sm font-bold text-gold">
                    {preview ? `${formatLak(String(Math.abs(payableNum)))} LAK` : '0 LAK'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* ── Scrollable Step Body ── */}
          <div className="nav-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {error && (
              <div id="exchange-error-modal" role="alert" className="notice status-danger mb-4 text-xs">
                {error}
              </div>
            )}

            {!hasOpenShift && (
              <div role="alert" className="notice status-warning mb-4 text-xs">
                ຍັງບໍ່ໄດ້ເປີດກະ — ກະລຸນາກົດ &quot;ເປີດກະ&quot; ກ່ອນຈຶ່ງຈະບັນທຶກລາຍການໄດ້
              </div>
            )}

            {/* ── Step 1: ຂໍ້ມູນລູກຄ້າ & ຄຳເກົ່າ ── */}
            {step === 1 && (
              <div className="space-y-5">
                <section className="space-y-2.5" aria-label="ຂໍ້ມູນລູກຄ້າ ແລະ ທຸລະກຳ">
                  <div className="grid gap-3.5 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <div className="mb-1 flex items-center justify-between">
                        <label className="label mb-0 text-xs" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
                        <span className={`num text-[11px] font-semibold ${phoneValid ? 'text-success' : 'text-muted'}`}>
                          {phone.length}/8
                        </span>
                      </div>
                      <input
                        id="phone"
                        className="input num font-medium tracking-wide"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="20XXXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <span className="label mb-1 text-xs">ທຸລະກຳ</span>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ທຸລະກຳ">
                        {(
                          [
                            ['EXCHANGE_TO_CASH', 'ປ່ຽນເປັນເງິນ'],
                            ['FREE_EXCHANGE', 'ປ່ຽນຟຣີ'],
                          ] as const
                        ).map(([val, labelLo]) => {
                          const active = txnType === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setTxnType(val)}
                              className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition-colors duration-150 ${
                                active
                                  ? 'border-[var(--border-active)] bg-[var(--gold-tint)] text-gold'
                                  : 'recessed text-fg hover:border-[var(--border-hover)]'
                              }`}
                            >
                              {labelLo}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="sm:col-span-3">
                      <span className="label mb-1 text-xs">ຮູບປະພັນ</span>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ຮູບປະພັນ">
                        {(
                          [
                            ['GOOD', 'ດີ'],
                            ['DAMAGED', 'ເສຍ'],
                          ] as const
                        ).map(([val, labelLo]) => {
                          const active = shapeCondition === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setShapeCondition(val)}
                              className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition-colors duration-150 ${
                                active
                                  ? 'border-[var(--border-active)] bg-[var(--gold-tint)] text-gold'
                                  : 'recessed text-fg hover:border-[var(--border-hover)]'
                              }`}
                            >
                              {labelLo}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="divider" aria-hidden="true" />

                <section className="space-y-3" aria-label="ລາຍການຄຳເກົ່າ">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-fg-strong">ລາຍການຄຳເກົ່າ</h3>
                      {oldLines.length > 1 && (
                        <span className="num badge bg-[var(--gold-tint)] text-[11px] font-semibold text-gold">
                          {oldLines.length} ລາຍການ
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary h-8 min-h-[32px] shrink-0 cursor-pointer px-3 text-xs"
                      onClick={handleAddOld}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      ເພີ່ມຄຳເກົ່າ
                    </button>
                  </div>

                  <div ref={oldListRef} className="space-y-3">
                    {oldLines.map((line, i) => {
                      const ready = isOldLineReady(line);
                      return (
                        <div
                          key={i}
                          className={`recessed space-y-3 rounded-2xl p-4 transition-colors duration-150 ${
                            ready ? 'border-[var(--border-hover)]' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-[var(--row-line)] pb-2">
                            <div className="flex items-center gap-2">
                              <span className="badge bg-[var(--gold-tint)] font-bold text-gold">#{i + 1}</span>
                              <span className={ready ? 'status-success' : 'status-warning'}>
                                {ready ? 'ພ້ອມຄຳນວນ' : 'ປ້ອນໃຫ້ຄົບ'}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn-ghost h-7 min-h-[28px] cursor-pointer px-2 text-xs text-danger"
                              disabled={oldLines.length === 1}
                              aria-label={`ລຶບຄຳເກົ່າແຖວທີ ${i + 1}`}
                              onClick={() => setOldLines((p) => p.filter((_, idx) => idx !== i))}
                            >
                              ✕
                            </button>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="min-w-0">
                              <label className="label mb-1 text-xs" htmlFor={`old-type-${i}`}>ປະເພດຄຳ</label>
                              <select
                                id={`old-type-${i}`}
                                className="input"
                                value={line.goldTypeId}
                                onChange={(e) => setOld(i, { goldTypeId: e.target.value })}
                              >
                                <option value="">— ເລືອກປະເພດຄຳ —</option>
                                {selectableGoldTypes.map((t) => (
                                  <option key={t.id} value={t.id}>{t.nameLo}</option>
                                ))}
                              </select>
                            </div>
                            <div className="min-w-0">
                              <label className="label mb-1 text-xs" htmlFor={`old-item-${i}`}>ລາຍການຄຳ</label>
                              <select
                                id={`old-item-${i}`}
                                className="input"
                                value={line.goldItemId}
                                onChange={(e) => setOld(i, { goldItemId: e.target.value })}
                              >
                                <option value="">— ບໍ່ລະບຸ —</option>
                                {goldItems.map((it) => (
                                  <option key={it.id} value={it.id}>{it.nameLo}</option>
                                ))}
                              </select>
                            </div>
                            <div className="min-w-0">
                              <label className="label mb-1 text-xs" htmlFor={`old-weight-${i}`}>ນ້ຳໜັກຈິງ (g)</label>
                              <NumberInput
                                id={`old-weight-${i}`}
                                decimals={4}
                                className="input num font-semibold"
                                placeholder="0.00"
                                value={line.weightG}
                                onValueChange={(v) => setOld(i, { weightG: v })}
                              />
                            </div>
                            <div className="min-w-0">
                              <label className="label mb-1 text-xs" htmlFor={`old-qty-${i}`}>ຈຳນວນ</label>
                              <input
                                id={`old-qty-${i}`}
                                className="input num"
                                type="number"
                                min={1}
                                step={1}
                                value={line.quantity}
                                onChange={(e) => setOld(i, { quantity: e.target.value })}
                                onBlur={(e) => setOld(i, { quantity: String(qty(e.target.value)) })}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                                <label className="label mb-0 text-xs" htmlFor={`old-std-${i}`}>ເກນ standard (g)</label>
                                {Number(line.weightG) > 0 && line.standardWeightG !== line.weightG && (
                                  <button
                                    type="button"
                                    className="cursor-pointer whitespace-nowrap text-[10px] font-semibold text-gold hover:underline"
                                    onClick={() => setOld(i, { standardWeightG: line.weightG })}
                                  >
                                    ເທົ່ານ້ຳໜັກຈິງ
                                  </button>
                                )}
                              </div>
                              <NumberInput
                                id={`old-std-${i}`}
                                decimals={4}
                                className="input num font-semibold"
                                placeholder="15"
                                value={line.standardWeightG}
                                onValueChange={(v) => setOld(i, { standardWeightG: v })}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-muted">ເກນດ່ວນ:</span>
                            {STANDARD_WEIGHT_PRESETS.map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setOld(i, { standardWeightG: preset })}
                                className={`cursor-pointer rounded-md border px-2 py-0.5 text-[11px] num transition-colors duration-150 ${
                                  line.standardWeightG === preset
                                    ? 'border-[var(--border-active)] bg-[var(--gold-tint)] font-semibold text-gold'
                                    : 'border-line bg-transparent text-muted hover:border-[var(--border-hover)] hover:text-fg'
                                }`}
                              >
                                {preset}g
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted">
                    ຄ່າອ່ອນຄິດສະເພາະຄຳຫຍຸບຕາມນ້ຳໜັກທີ່ຫຼຸດຈາກເກນ standard (0.1g ຕໍ່ຂັ້ນ) — ຄຳດີ ແລະ ຄຳແທ່ງບໍ່ເສຍຄ່າອ່ອນ
                  </p>
                </section>
              </div>
            )}

            {/* ── Step 2: ລາຍການຄຳໃໝ່ ── */}
            {step === 2 && (
              <section className="space-y-3" aria-label="ລາຍການຄຳໃໝ່">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-fg-strong">ລາຍການຄຳໃໝ່</h3>
                    {newLines.length > 1 && (
                      <span className="num badge bg-[var(--gold-tint)] text-[11px] font-semibold text-gold">
                        {newLines.length} ລາຍການ
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary h-8 min-h-[32px] shrink-0 cursor-pointer px-3 text-xs"
                    onClick={handleAddNew}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    ເພີ່ມຄຳໃໝ່
                  </button>
                </div>

                {newLines.length === 0 ? (
                  <div className="recessed flex flex-col items-center justify-center gap-2 rounded-2xl p-8 text-center">
                    <p className="text-sm text-muted">ບໍ່ມີລາຍການຄຳໃໝ່ (ປ່ຽນຄຳເກົ່າເປັນເງິນທັງໝົດ)</p>
                    <button type="button" className="btn-secondary cursor-pointer text-xs" onClick={handleAddNew}>
                      + ເພີ່ມລາຍການຄຳໃໝ່
                    </button>
                  </div>
                ) : (
                  <div ref={newListRef} className="space-y-3">
                    {(() => {
                      let readyIdx = -1;
                      return newLines.map((line, i) => {
                        const ready = isNewLineReady(line);
                        if (ready) readyIdx += 1;
                        const linePreview = ready ? preview?.newLines?.[readyIdx] : undefined;
                        const lineFeeTotal = linePreview
                          ? Number(linePreview.humpFee) +
                            Number(linePreview.barConvertFee) +
                            Number(linePreview.patternFee)
                          : 0;
                        return (
                          <div
                            key={i}
                            className={`recessed space-y-3 rounded-2xl p-4 transition-colors duration-150 ${
                              ready ? 'border-[var(--border-hover)]' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-[var(--row-line)] pb-2">
                              <div className="flex items-center gap-2">
                                <span className="badge bg-[var(--gold-tint)] font-bold text-gold">#{i + 1}</span>
                                <span className={ready ? 'status-success' : 'status-warning'}>
                                  {ready ? 'ພ້ອມຄຳນວນ' : 'ເລືອກ SKU'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {linePreview && (
                                  <span className="num text-xs font-bold text-fg-strong">
                                    ຄ່າປ່ຽນ {formatLak(String(lineFeeTotal))} LAK
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="btn-ghost h-7 min-h-[28px] cursor-pointer px-2 text-xs text-danger"
                                  disabled={newLines.length === 1 && remainingLines.length === 0}
                                  aria-label={`ລຶບຄຳໃໝ່ແຖວທີ ${i + 1}`}
                                  onClick={() => setNewLines((p) => p.filter((_, idx) => idx !== i))}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                              <div className="min-w-0 lg:col-span-2">
                                <label className="label mb-1 text-xs" htmlFor={`new-sku-${i}`}>ລາຍການ (SKU)</label>
                                <select
                                  id={`new-sku-${i}`}
                                  className="input"
                                  value={line.goldSkuId}
                                  onChange={(e) => {
                                    const sku = skus.find((s) => s.id === e.target.value);
                                    setNew(i, {
                                      goldSkuId: e.target.value,
                                      weightG: sku ? String(Number(sku.weightG)) : line.weightG,
                                    });
                                  }}
                                >
                                  <option value="">— ເລືອກ SKU —</option>
                                  {skus.map((s) => (
                                    <option key={s.id} value={s.id}>{s.fullSkuName}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="min-w-0">
                                <label className="label mb-1 text-xs" htmlFor={`new-weight-${i}`}>ນ້ຳໜັກ (g)</label>
                                <NumberInput
                                  id={`new-weight-${i}`}
                                  decimals={4}
                                  className="input num font-semibold"
                                  placeholder="0.00"
                                  value={line.weightG}
                                  onValueChange={(v) => setNew(i, { weightG: v })}
                                />
                              </div>
                              <div className="min-w-0">
                                <label className="label mb-1 text-xs" htmlFor={`new-qty-${i}`}>ຈຳນວນ</label>
                                <input
                                  id={`new-qty-${i}`}
                                  className="input num"
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={line.quantity}
                                  onChange={(e) => setNew(i, { quantity: e.target.value })}
                                  onBlur={(e) => setNew(i, { quantity: String(qty(e.target.value)) })}
                                />
                              </div>
                              <div className="min-w-0">
                                <label className="label mb-1 text-xs" htmlFor={`new-cabinet-${i}`}>ຕູ້ເຄື່ອງ</label>
                                <select
                                  id={`new-cabinet-${i}`}
                                  className="input"
                                  value={line.cabinetId}
                                  onChange={(e) => setNew(i, { cabinetId: e.target.value })}
                                >
                                  <option value="">— ເລືອກຕູ້ —</option>
                                  {cabinets.map((c) => (
                                    <option key={c.id} value={c.id}>{c.nameLo}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
                              {txnType === 'FREE_EXCHANGE' ? (
                                <div className="sm:col-span-1">
                                  <span className="label mb-1 text-xs">ຄ່າລາຍ</span>
                                  <div className="input flex items-center text-xs font-semibold text-success select-none">
                                    ປ່ຽນຟຣີ (0 LAK)
                                  </div>
                                </div>
                              ) : (
                                <div className="min-w-0 sm:col-span-1">
                                  <label className="label mb-1 text-xs" htmlFor={`new-pattern-${i}`}>ຄ່າລາຍ (LAK)</label>
                                  <NumberInput
                                    id={`new-pattern-${i}`}
                                    decimals={0}
                                    className="input num"
                                    placeholder="0"
                                    value={line.patternFee}
                                    onValueChange={(v) => setNew(i, { patternFee: v })}
                                  />
                                </div>
                              )}
                              {linePreview && (
                                <div className="flex flex-wrap gap-5 pb-2 text-xs text-muted sm:col-span-3">
                                  <span>ຄ່າຫຍຸບ: <strong className="num text-fg">{formatLak(linePreview.humpFee)} LAK</strong></span>
                                  <span>ຄ່າປ່ຽນຄຳແທ່ງ: <strong className="num text-fg">{formatLak(linePreview.barConvertFee)} LAK</strong></span>
                                  <span>ຄ່າລາຍ: <strong className="num text-fg">{formatLak(linePreview.patternFee)} LAK</strong></span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
                <p className="text-xs text-muted">
                  ຄ່າຫຍຸບ ແລະ ຄ່າປ່ຽນຄຳແທ່ງ ດຶງຈາກຕາຕະລາງ ຄ່າປ່ຽນ ອັດຕະໂນມັດ
                  {txnType === 'FREE_EXCHANGE' && ' — ປ່ຽນຟຣີ: ຄ່າປ່ຽນທັງໝົດ = 0'}
                </p>
              </section>
            )}

            {/* ── Step 3: ຄຳເກົ່າຄົງເຫຼືອ ── */}
            {step === 3 && (
              <section className="space-y-3" aria-label="ຄຳເກົ່າຄົງເຫຼືອ">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-fg-strong">ຄຳເກົ່າຄົງເຫຼືອ</h3>
                    {remainingLines.length > 1 && (
                      <span className="num badge bg-[var(--gold-tint)] text-[11px] font-semibold text-gold">
                        {remainingLines.length} ລາຍການ
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-secondary h-8 min-h-[32px] shrink-0 cursor-pointer px-3 text-xs"
                    onClick={handleAddRemaining}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    ເພີ່ມຄົງເຫຼືອ
                  </button>
                </div>

                {differenceNum > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-active)] bg-[var(--gold-tint)] px-4 py-3 text-xs">
                    <span className="text-fg">
                      ຍັງມີນ້ຳໜັກຄົງເຫຼືອ <strong className="num text-gold">{formatWeight(preview!.difference)} g</strong> ທີ່ຍັງບໍ່ທັນໄດ້ບັນທຶກ
                    </span>
                    <button
                      type="button"
                      onClick={fillRemainingDifference}
                      className="btn-primary !h-8 !min-h-0 cursor-pointer !px-3 text-xs"
                    >
                      + ຕື່ມ {formatWeight(preview!.difference)} g ໃຫ້ສົມດຸນ
                    </button>
                  </div>
                )}

                {remainingLines.length === 0 ? (
                  <div className="recessed flex flex-col items-center justify-center gap-2 rounded-2xl p-8 text-center">
                    <p className="text-sm text-muted">
                      ບໍ່ມີຄຳເກົ່າຄົງເຫຼືອ — ຖ້າປ່ຽນຄົບຕາມເກນແລ້ວ ສາມາດກົດ &quot;ຖັດໄປ&quot; ໄປຂັ້ນຕອນສະຫຼຸບໄດ້ເລີຍ
                    </p>
                    <button type="button" className="btn-secondary cursor-pointer text-xs" onClick={handleAddRemaining}>
                      + ເພີ່ມຄຳເກົ່າຄົງເຫຼືອ
                    </button>
                  </div>
                ) : (
                  <div ref={remainingListRef} className="space-y-3">
                    {(() => {
                      let readyIdx = -1;
                      return remainingLines.map((line, i) => {
                        const ready = isRemainingLineReady(line);
                        if (ready) readyIdx += 1;
                        const remPreview = ready ? preview?.remainingLines?.[readyIdx] : undefined;
                        return (
                          <div
                            key={i}
                            className={`recessed space-y-3 rounded-2xl p-4 transition-colors duration-150 ${
                              ready ? 'border-[var(--border-hover)]' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-[var(--row-line)] pb-2">
                              <div className="flex items-center gap-2">
                                <span className="badge bg-[var(--gold-tint)] font-bold text-gold">#{i + 1}</span>
                                <span className={ready ? 'status-success' : 'status-warning'}>
                                  {ready ? 'ພ້ອມຄຳນວນ' : 'ປ້ອນນ້ຳໜັກ'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {remPreview && (
                                  <span className="num text-xs font-bold text-fg-strong">
                                    ລາຄາຊື້ຄືນ: {formatLak(remPreview.shopBuybackPrice)} LAK
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="btn-ghost h-7 min-h-[28px] cursor-pointer px-2 text-xs text-danger"
                                  aria-label={`ລຶບຄົງເຫຼືອແຖວທີ ${i + 1}`}
                                  onClick={() => setRemainingLines((p) => p.filter((_, idx) => idx !== i))}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                              <div className="min-w-0">
                                <label className="label mb-1 text-xs" htmlFor={`rem-type-${i}`}>ປະເພດຄຳ</label>
                                <select
                                  id={`rem-type-${i}`}
                                  className="input"
                                  value={line.goldTypeId}
                                  onChange={(e) => setRemaining(i, { goldTypeId: e.target.value })}
                                >
                                  <option value="">ຕາມຄຳເກົ່າຫຼັກ</option>
                                  {selectableGoldTypes.map((t) => (
                                    <option key={t.id} value={t.id}>{t.nameLo}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="min-w-0">
                                <label className="label mb-1 text-xs" htmlFor={`rem-weight-${i}`}>ນ້ຳໜັກ (g)</label>
                                <NumberInput
                                  id={`rem-weight-${i}`}
                                  decimals={4}
                                  className="input num font-semibold"
                                  placeholder="0.00"
                                  value={line.weightG}
                                  onValueChange={(v) => setRemaining(i, { weightG: v })}
                                />
                              </div>
                              <div className="min-w-0">
                                <label className="label mb-1 text-xs" htmlFor={`rem-qty-${i}`}>ຈຳນວນ</label>
                                <input
                                  id={`rem-qty-${i}`}
                                  className="input num"
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={line.quantity}
                                  onChange={(e) => setRemaining(i, { quantity: e.target.value })}
                                  onBlur={(e) => setRemaining(i, { quantity: String(qty(e.target.value)) })}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </section>
            )}

            {/* ── Step 4: ການຈ່າຍເງິນ & ສະຫຼຸບ ── */}
            {step === 4 && (
              <div className="space-y-5">
                <section aria-label="ການຈ່າຍເງິນ">
                  {isZeroPayable ? (
                    <div className="notice status-success flex items-center gap-2 text-xs">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span>ມູນຄ່າສຸດທິເທົ່າກັບ 0 LAK — ບໍ່ຕ້ອງຈ່າຍ ຫຼື ຮັບເງິນເພີ່ມ</span>
                    </div>
                  ) : (
                    <>
                      <MultiPayment
                        lines={payments}
                        onChange={setPayments}
                        owedLak={absOwedLak}
                        direction={paymentDirection}
                        labelLo={
                          isIncomingPayment
                            ? 'ຮັບເງິນຈາກລູກຄ້າ — ສົດ / ໂອນ (ແຍກແຖວໄດ້)'
                            : 'ຈ່າຍເງິນໃຫ້ລູກຄ້າ — ສົດ / ໂອນ (ແຍກແຖວໄດ້)'
                        }
                      />
                      {preview !== null && hasPaymentShortfall && paymentLines.length > 0 && (
                        <div role="alert" className="notice status-warning mt-3 text-xs">
                          ຍອດຍັງຂາດ <strong className="num">{formatLak(String(paymentRemaining))} LAK</strong> — ກະລຸນາປ້ອນຈຳນວນເງິນໃຫ້ຄົບກ່ອນບັນທຶກ
                        </div>
                      )}
                    </>
                  )}
                </section>

                <section aria-label="ສະຫຼຸບການຄຳນວນ" className="summary-card rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between border-b border-[var(--row-line)] pb-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                      ສະຫຼຸບການຄຳນວນ (§5.2)
                    </span>
                    <span className="live-dot text-[11px]">
                      {isPreviewing ? 'ກຳລັງຄຳນວນ...' : 'ຄຳນວນສົດ'}
                    </span>
                  </div>

                  <div className="my-4 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="text-xs text-muted">
                        {isIncomingPayment
                          ? 'ລູກຄ້າຕ້ອງຈ່າຍເພີ່ມໃຫ້ຮ້ານ'
                          : isZeroPayable
                            ? 'ມູນຄ່າສຸດທິ'
                            : 'ລວມເງິນຕ້ອງຈ່າຍໃຫ້ລູກຄ້າ'}
                      </div>
                      <div className="num mt-0.5 text-3xl font-bold tracking-tight text-gold-gradient">
                        {preview ? `${formatLak(String(Math.abs(payableNum)))} LAK` : '0 LAK'}
                      </div>
                    </div>
                  </div>

                  <div className="recessed grid grid-cols-2 gap-3 rounded-xl p-3 sm:grid-cols-5">
                    <div>
                      <div className="text-[11px] text-muted">ລາຄາຊື້ຄືນໜ້າຮ້ານ</div>
                      <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                        {preview ? formatLak(preview.shopBuybackPrice) : '0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">ຄ່າອ່ອນ</div>
                      <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                        {preview ? formatLak(preview.softGoldFee) : '0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">ຄ່າຫຍຸບ</div>
                      <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                        {preview ? formatLak(preview.humpFee) : '0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">ຄ່າປ່ຽນຄຳແທ່ງ</div>
                      <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                        {preview ? formatLak(preview.barConvertFee) : '0'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted">ຄ່າລາຍ</div>
                      <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                        {preview ? formatLak(preview.patternFee) : '0'}
                      </div>
                    </div>
                  </div>
                </section>

                <div
                  role="status"
                  className={`notice flex flex-wrap items-center justify-between gap-2 text-xs ${
                    !preview
                      ? 'recessed border border-line text-muted'
                      : preview.isBalanced
                        ? 'status-success'
                        : 'status-danger'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {preview?.isBalanced && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                    {!preview
                      ? 'ກະລຸນາປ້ອນລາຍການຄຳເກົ່າໃນຂັ້ນຕອນທີ 1'
                      : preview.isBalanced
                        ? 'ນ້ຳໜັກສົມດຸນ — ບັນທຶກໄດ້'
                        : preview.messageLo}
                  </span>
                  {differenceNum > 0 && (
                    <button
                      type="button"
                      onClick={fillRemainingDifference}
                      className="btn-secondary !h-7 !min-h-0 cursor-pointer !px-2.5 text-[11px]"
                    >
                      + ຕື່ມຄົງເຫຼືອ {formatWeight(preview!.difference)} g
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* ── History Table ── */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">History ປ່ຽນເປັນເງິນ</h2>
          <span className="num text-xs text-muted">
            {filteredRows.length === rows.length
              ? `${rows.length} ລາຍການ`
              : `${filteredRows.length} / ${rows.length} ລາຍການ`}
          </span>
        </div>
        <OrderFilterBar
          history={history}
          search={searchFilter}
          searchPlaceholder="ຄົ້ນຫາ ລະຫັດ (EX-...) / ເບີໂທລູກຄ້າ..."
          statusSlot={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="ກອງຕາມສະຖານະ"
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">ທຸກສະຖານະ</option>
                <option value="PENDING">ລໍຖ້າອະນຸມັດ</option>
                <option value="APPROVED">ອະນຸມັດແລ້ວ</option>
                <option value="REJECTED">ປະຕິເສດ</option>
                <option value="CANCELLED">ຍົກເລີກ</option>
              </select>
              <select
                aria-label="ກອງຕາມທຸລະກຳ"
                className="filter-select"
                value={txnTypeFilter}
                onChange={(e) => setTxnTypeFilter(e.target.value)}
              >
                <option value="">ທຸກທຸລະກຳ</option>
                <option value="EXCHANGE_TO_CASH">ປ່ຽນເປັນເງິນ</option>
                <option value="FREE_EXCHANGE">ປ່ຽນຟຣີ</option>
              </select>
              {(statusFilter || txnTypeFilter) && (
                <button
                  type="button"
                  className="filter-clear text-xs"
                  onClick={() => {
                    setStatusFilter('');
                    setTxnTypeFilter('');
                  }}
                >
                  ລ້າງຕົວກອງ
                </button>
              )}
            </div>
          }
        />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ປ່ຽນເປັນເງິນ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ທຸລະກຳ</th>
                <th className="text-right">ນ້ຳໜັກເກົ່າ</th>
                <th className="text-right">ນ້ຳໜັກໃໝ່</th>
                <th className="text-right">ລວມເງິນທີ່ຕ້ອງຈ່າຍ</th>
                <th className="text-right">ຍອດຄ້າງຈ່າຍ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={11}
                isLoading={history.isLoading}
                isError={rowsFailed}
                error={rowsError}
                isEmpty={filteredRows.length === 0}
                emptyText={
                  searchFilter.hasActiveFilter || statusFilter || txnTypeFilter
                    ? 'ບໍ່ພົບລາຍການທີ່ກອງ'
                    : 'ຍັງບໍ່ມີລາຍການ'
                }
                onRetry={() => void refetchRows()}
              />
              {pager.pageItems.map((row) => {
                const oldG = row.oldLines.reduce((s, l) => s + Number(l.weightG) * l.quantity, 0);
                const newG = row.newLines.reduce((s, l) => s + Number(l.weightG) * l.quantity, 0);
                const canAct = canManageRow(row);
                const hasOutstanding = Number(row.outstandingAmount) > 0;
                const showUpdated = Boolean(row.updatedBy && row.updatedBy !== row.createdBy);

                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs font-semibold text-fg-strong">{row.code}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td>{row.txnType === 'FREE_EXCHANGE' ? 'ປ່ຽນຟຣີ' : 'ປ່ຽນເປັນເງິນ'}</td>
                    <td className="num text-right">{formatWeight(String(oldG))}</td>
                    <td className="num text-right">{formatWeight(String(newG))}</td>
                    <td className="num text-right font-medium">{formatLak(row.totalPayable)}</td>
                    <td className="num text-right">{formatLak(row.outstandingAmount)}</td>
                    <td>
                      <span className={statusClass(row.status)}>
                        {STATUS_LABEL[row.status]?.lo ?? row.status}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs font-medium text-fg">{row.createdBy ?? '—'}</div>
                      {showUpdated && (
                        <div className="mt-0.5 text-[11px] text-muted">ແກ້ໄຂ: {row.updatedBy}</div>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                        {row.status === 'APPROVED' && hasOutstanding && (
                          <button
                            type="button"
                            className="btn-secondary !h-8 !min-h-0 !px-2.5 text-xs"
                            onClick={() => {
                              setSettlingRow(row);
                              setSettlePayments(newPaymentLines());
                            }}
                          >
                            ຊຳລະຄ້າງ
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={() => setViewingRow(row)}
                        >
                          ເບິ່ງ
                        </button>
                        {row.status === 'PENDING' && canAct && (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1 text-xs text-gold"
                            onClick={() => startEdit(row)}
                          >
                            ແກ້ໄຂ
                          </button>
                        )}
                        {row.status === 'PENDING' && canAct && (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1 text-xs text-danger"
                            onClick={() => {
                              setCancellingRow(row);
                              setCancelReason('');
                            }}
                          >
                            ຍົກເລີກ
                          </button>
                        )}
                        {(row.status === 'PENDING' || row.status === 'REJECTED' || row.status === 'CANCELLED') && canAct && (
                          <button
                            type="button"
                            className="btn-ghost px-2 py-1 text-xs text-danger"
                            onClick={() => setDeletingRow(row)}
                          >
                            ລຶບ
                          </button>
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

      {/* ── View Detail Dialog ── */}
      <Dialog
        open={Boolean(viewingDetail)}
        onClose={() => setViewingRow(null)}
        title={`ລາຍລະອຽດປ່ຽນເປັນເງິນ — ${viewingDetail?.code ?? ''}`}
        subtitle={
          viewingDetail
            ? `${viewingDetail.txnType === 'FREE_EXCHANGE' ? 'ປ່ຽນຟຣີ' : 'ປ່ຽນເປັນເງິນ'} · ເບີໂທ ${viewingDetail.customer.phone}`
            : undefined
        }
        size="lg"
        dismissOnScrim
        footer={
          <button type="button" className="btn-primary" onClick={() => setViewingRow(null)}>
            ປິດ
          </button>
        }
      >
        {viewingDetail && (
          <div className="space-y-4 text-sm">
            {detailLoading && <p className="text-xs text-muted">ກຳລັງໂຫຼດລາຍລະອຽດ...</p>}
            {viewingDetail.rejectReason && (
              <div className="notice status-danger text-xs">
                ເຫດຜົນປະຕິເສດ / ຍົກເລີກ: <b>{viewingDetail.rejectReason}</b>
              </div>
            )}

            <div className="recessed rounded-xl p-3.5 grid gap-3 sm:grid-cols-3 text-xs">
              <div>
                <span className="text-muted block">ລວມເງິນຕ້ອງຈ່າຍ</span>
                <strong className="num text-base text-fg-strong">{formatLak(viewingDetail.totalPayable)} LAK</strong>
              </div>
              <div>
                <span className="text-muted block">ຄ່າອ່ອນ</span>
                <strong className="num text-base text-fg-strong">{formatLak(viewingDetail.softGoldFee ?? '0')} LAK</strong>
              </div>
              <div>
                <span className="text-muted block">ຍອດຄ້າງ</span>
                <strong className="num text-base text-fg-strong">{formatLak(viewingDetail.outstandingAmount)} LAK</strong>
              </div>
            </div>

            <div>
              <h4 className="section-label mb-1.5">ລາຍການຄຳເກົ່າ</h4>
              <div className={viewingDetail.oldLines.length > 1 ? 'nav-scroll max-h-[200px] space-y-1 overflow-y-auto pr-1 text-xs' : 'space-y-1 text-xs'}>
                {viewingDetail.oldLines.map((l) => (
                  <div key={l.id} className="flex justify-between rounded-lg border border-line px-3 py-2">
                    <span>{l.goldType?.nameLo ?? 'ຄຳເກົ່າ'}{l.goldItem?.nameLo ? ` · ${l.goldItem.nameLo}` : ''}</span>
                    <span className="num">{formatWeight(l.weightG)} g (standard {formatWeight(l.standardWeightG ?? l.weightG)} g) × {l.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            {viewingDetail.newLines.length > 0 && (
              <div>
                <h4 className="section-label mb-1.5">ລາຍການຄຳໃໝ່</h4>
                <div className={viewingDetail.newLines.length > 1 ? 'nav-scroll max-h-[200px] space-y-1 overflow-y-auto pr-1 text-xs' : 'space-y-1 text-xs'}>
                  {viewingDetail.newLines.map((l) => (
                    <div key={l.id} className="flex justify-between rounded-lg border border-line px-3 py-2">
                      <span>{l.goldSku?.fullSkuName ?? 'SKU'}{l.cabinet?.nameLo ? ` · ${l.cabinet.nameLo}` : ''}</span>
                      <span className="num">{formatWeight(l.weightG)} g × {l.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(viewingDetail.remainingLines?.length ?? 0) > 0 && (
              <div>
                <h4 className="section-label mb-1.5">ຄຳເກົ່າຄົງເຫຼືອ</h4>
                <div className={(viewingDetail.remainingLines?.length ?? 0) > 1 ? 'nav-scroll max-h-[200px] space-y-1 overflow-y-auto pr-1 text-xs' : 'space-y-1 text-xs'}>
                  {viewingDetail.remainingLines!.map((l) => (
                    <div key={l.id} className="flex justify-between rounded-lg border border-line px-3 py-2">
                      <span>{formatWeight(l.weightG)} g × {l.quantity}</span>
                      <span className="num font-medium">{formatLak(l.shopBuybackPrice)} LAK</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(viewingDetail.payments?.length ?? 0) > 0 && (
              <div>
                <h4 className="section-label mb-1.5">ການຈ່າຍເງິນ</h4>
                <div className={(viewingDetail.payments?.length ?? 0) > 1 ? 'nav-scroll max-h-[200px] space-y-1 overflow-y-auto pr-1 text-xs' : 'space-y-1 text-xs'}>
                  {viewingDetail.payments!.map((p) => (
                    <div key={p.id} className="flex justify-between rounded-lg border border-line px-3 py-2">
                      <span>{p.method === 'BANK' ? `ໂອນ · ${p.bankAccount?.nameLo ?? ''}` : 'ເງິນສົດ'} ({p.currency})</span>
                      <span className="num font-medium">{formatByCurrency(p.amount, p.currency)} {p.currency}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ── Cancel Dialog ── */}
      <Dialog
        open={Boolean(cancellingRow)}
        onClose={() => setCancellingRow(null)}
        title={`ຍົກເລີກລາຍການ ${cancellingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCancellingRow(null)}>
              ປິດ
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={cancelMutation.isPending}
              onClick={() =>
                cancellingRow && cancelMutation.mutate({ id: cancellingRow.id, reason: cancelReason })
              }
            >
              {cancelMutation.isPending ? 'ກຳລັງຍົກເລີກ...' : 'ຢືນຢັນຍົກເລີກ'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            ຕ້ອງການຍົກເລີກລາຍການ <b className="font-mono text-fg">{cancellingRow?.code}</b> ແທ້ບໍ່?
          </p>
          <div>
            <label className="label" htmlFor="exchange-cancel-reason">ເຫດຜົນ (ທາງເລືອກ)</label>
            <input
              id="exchange-cancel-reason"
              className="input"
              maxLength={300}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
        </div>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog
        open={Boolean(deletingRow)}
        onClose={() => setDeletingRow(null)}
        title={`ລຶບລາຍການ ${deletingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDeletingRow(null)}>
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={deleteMutation.isPending}
              onClick={() => deletingRow && deleteMutation.mutate(deletingRow.id)}
            >
              {deleteMutation.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          ຕ້ອງການລຶບລາຍການ <b className="font-mono text-fg">{deletingRow?.code}</b> ແທ້ບໍ່?
        </p>
      </Dialog>

      {/* ── Settle Outstanding Dialog ── */}
      <Dialog
        open={Boolean(settlingRow)}
        onClose={() => setSettlingRow(null)}
        title={`ຊຳລະຍອດຄ້າງ — ${settlingRow?.code ?? ''}`}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSettlingRow(null)}>
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={
                settleMutation.isPending ||
                !hasOpenShift ||
                settlePaymentLines.length === 0 ||
                !settleBankReady ||
                (!settleIsIncoming && Boolean(settleInsufficientError))
              }
              onClick={() => settlingRow && settleMutation.mutate(settlingRow.id)}
            >
              {settleMutation.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຢືນຢັນຊຳລະ'}
            </button>
          </div>
        }
      >
        {settlingRow && (
          <div className="space-y-4">
            <div className="recessed rounded-xl p-3 text-sm">
              ຍອດຄ້າງຊຳລະ: <strong className="num text-fg-strong">{formatLak(settlingRow.outstandingAmount)} LAK</strong>
            </div>
            <MultiPayment
              lines={settlePayments}
              onChange={setSettlePayments}
              owedLak={settlingRow.outstandingAmount}
              direction={settleIsIncoming ? 'in' : 'out'}
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}

function useScrollOnAdd(
  length: number,
  flagRef: MutableRefObject<boolean>,
  listRef: RefObject<HTMLDivElement | null>,
  focusIdPrefix: string,
) {
  useEffect(() => {
    if (!flagRef.current) return;
    flagRef.current = false;
    const container = listRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      const lastIndex = length - 1;
      document.getElementById(`${focusIdPrefix}-${lastIndex}`)?.focus({ preventScroll: true });
    });
  }, [length, flagRef, listRef, focusIdPrefix]);
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
        ok
          ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-success'
          : 'border-line bg-recessed text-muted'
      }`}
    >
      <span aria-hidden="true">{ok ? '✓' : '•'}</span>
      {label}
    </span>
  );
}
