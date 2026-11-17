'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime, formatByCurrency } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { useHistoryRange } from '@/components/date-range';
import { MultiPayment, newPaymentLines, paymentPayload, useInsufficientFundsError } from '@/components/multi-payment';
import type { PaymentLine } from '@/components/multi-payment';
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

  const [phone, setPhone] = useState('');
  const [txnType, setTxnType] = useState<'EXCHANGE_TO_CASH' | 'FREE_EXCHANGE'>('EXCHANGE_TO_CASH');
  const [shapeCondition, setShapeCondition] = useState<'GOOD' | 'DAMAGED'>('GOOD');
  const [oldLines, setOldLines] = useState<OldLine[]>([emptyOld()]);
  const [newLines, setNewLines] = useState<NewLine[]>([emptyNew()]);
  const [remainingLines, setRemainingLines] = useState<RemainingLine[]>([]);
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
    queryFn: () => api.get<{ thbBuybackRate: string; usdBuybackRate: string }>('/rates/current'),
    enabled: showForm,
    retry: false,
  });

  const setOld = (i: number, patch: Partial<OldLine>) =>
    setOldLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setNew = (i: number, patch: Partial<NewLine>) =>
    setNewLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setRemaining = (i: number, patch: Partial<RemainingLine>) =>
    setRemainingLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const paymentLines = paymentPayload(payments);
  const bankLegReady = paymentLines.every((l) => l.method !== 'BANK' || Boolean(l.bankAccountId));
  const insufficientFundsError = useInsufficientFundsError(
    payments,
    showForm && payableNum > 0,
    'ປ່ຽນເປັນເງິນ (Exchange)',
  );

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

  const paymentReady = isZeroPayable
    ? true
    : paymentLines.length > 0 &&
      bankLegReady &&
      (isIncomingPayment || (!insufficientFundsError && !lakExceedsPayable && !mixedLakInvalid));

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

      {/* ── Form Dialog (Create / Edit PENDING) ── */}
      <Dialog
        open={showForm}
        onClose={resetForm}
        size="2xl"
        flushBody
        title={editingId ? 'ແກ້ໄຂລາຍການປ່ຽນເປັນເງິນ' : 'ສ້າງລາຍການປ່ຽນເປັນເງິນ'}
        subtitle="ປ້ອນຄຳເກົ່າ, ຄຳໃໝ່ ແລະ ຄຳເກົ່າຄົງເຫຼືອ — ກວດຄວາມສົມດຸນອັດຕະໂນມັດ (TOR §5.2)"
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <StatusPill ok={hasOpenShift} label={hasOpenShift ? 'ກະເປີດຢູ່' : 'ຍັງບໍ່ເປີດກະ'} />
              <StatusPill ok={phoneValid} label={`ເບີໂທ ${phone.length}/8`} />
              <StatusPill ok={allLinesValid && preview?.isBalanced === true} label="ນ້ຳໜັກສົມດຸນ" />
              <StatusPill ok={paymentReady} label="ການຈ່າຍເງິນ" />
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <button type="button" className="btn-secondary" onClick={resetForm}>
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[200px]"
                aria-describedby={error ? 'exchange-error-modal' : undefined}
                disabled={!canSave || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending
                  ? 'ກຳລັງບັນທຶກ...'
                  : editingId
                    ? 'ບັນທຶກການແກ້ໄຂ'
                    : 'ບັນທຶກລາຍການ'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5 p-5 sm:p-6">
          {error && (
            <div id="exchange-error-modal" role="alert" className="notice status-danger">{error}</div>
          )}

          {!hasOpenShift && (
            <div role="alert" className="notice status-warning text-xs">
              ຍັງບໍ່ໄດ້ເປີດກະ — ກະລຸນາກົດ &quot;ເປີດກະ&quot; ກ່ອນຈຶ່ງຈະບັນທຶກລາຍການໄດ້
            </div>
          )}

          {/* Header fields */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
              <input
                id="phone"
                className="input input-lg num"
                inputMode="numeric"
                maxLength={8}
                placeholder="20XXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="label" htmlFor="txnType">ທຸລະກຳ</label>
              <select
                id="txnType"
                className="input input-lg"
                value={txnType}
                onChange={(e) => setTxnType(e.target.value as typeof txnType)}
              >
                <option value="EXCHANGE_TO_CASH">ປ່ຽນເປັນເງິນ</option>
                <option value="FREE_EXCHANGE">ປ່ຽນຟຣີ</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="shape">ຮູບປະພັນ</label>
              <select
                id="shape"
                className="input input-lg"
                value={shapeCondition}
                onChange={(e) => setShapeCondition(e.target.value as 'GOOD' | 'DAMAGED')}
              >
                <option value="GOOD">ດີ</option>
                <option value="DAMAGED">ເສຍ</option>
              </select>
            </div>
          </div>

          {/* ---- ລາຍການຄຳເກົ່າ ---- */}
          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-fg-strong">ລາຍການຄຳເກົ່າ</h3>
              <button
                type="button"
                className="btn-secondary h-8 min-h-0 px-3 text-xs"
                onClick={() => setOldLines((p) => [...p, emptyOld()])}
              >
                + Add
              </button>
            </div>
            <div className="space-y-3 p-4">
              {oldLines.map((line, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_0.75fr_1fr_auto]">
                  <select
                    aria-label={`ລາຍການຄຳເກົ່າ — ປະເພດຄຳ ${i + 1}`}
                    className="input"
                    value={line.goldTypeId}
                    onChange={(e) => setOld(i, { goldTypeId: e.target.value })}
                  >
                    <option value="">ປະເພດຄຳ</option>
                    {selectableGoldTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.nameLo}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`ລາຍການຄຳເກົ່າ — ລາຍການຄຳ ${i + 1}`}
                    className="input"
                    value={line.goldItemId}
                    onChange={(e) => setOld(i, { goldItemId: e.target.value })}
                  >
                    <option value="">ລາຍການຄຳ</option>
                    {goldItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.nameLo}</option>
                    ))}
                  </select>
                  <NumberInput
                    decimals={4}
                    aria-label={`ລາຍການຄຳເກົ່າ — ນ້ຳໜັກ (g) ${i + 1}`}
                    className="input num"
                    placeholder="ນ້ຳໜັກ (g)"
                    value={line.weightG}
                    onValueChange={(v) => setOld(i, { weightG: v })}
                  />
                  <input
                    aria-label={`ລາຍການຄຳເກົ່າ — ຈຳນວນ ${i + 1}`}
                    className="input num"
                    type="number"
                    min={1}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => setOld(i, { quantity: e.target.value })}
                    onBlur={(e) => setOld(i, { quantity: String(qty(e.target.value)) })}
                  />
                  <NumberInput
                    decimals={4}
                    aria-label={`ລາຍການຄຳເກົ່າ — ເກນ standard (g) ${i + 1}`}
                    className="input num"
                    placeholder="ເກນ standard (g)"
                    value={line.standardWeightG}
                    onValueChange={(v) => setOld(i, { standardWeightG: v })}
                  />
                  <button
                    type="button"
                    className="btn-danger px-3"
                    disabled={oldLines.length === 1}
                    onClick={() => setOldLines((p) => p.filter((_, idx) => idx !== i))}
                  >
                    ລຶບ
                  </button>
                </div>
              ))}
              <p className="text-xs text-muted">
                ຄ່າອ່ອນຄິດສະເພາະຄຳຫຍຸບຕາມນ້ຳໜັກທີ່ຫຼຸດຈາກເກນ standard (0.1g ຕໍ່ຂັ້ນ) — ຄຳດີ ແລະ ຄຳແທ່ງບໍ່ເສຍຄ່າອ່ອນ
              </p>
            </div>
          </div>

          {/* ---- ລາຍການຄຳໃໝ່ ---- */}
          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-fg-strong">ລາຍການຄຳໃໝ່</h3>
              <button
                type="button"
                className="btn-secondary h-8 min-h-0 px-3 text-xs"
                onClick={() => setNewLines((p) => [...p, emptyNew()])}
              >
                + Add
              </button>
            </div>
            <div className="space-y-3 p-4">
              {newLines.length === 0 && (
                <p className="text-sm text-muted">ບໍ່ມີລາຍການຄຳໃໝ່ (ປ່ຽນຄຳເກົ່າເປັນເງິນທັງໝົດ)</p>
              )}
              {(() => {
                let readyIdx = -1;
                return newLines.map((line, i) => {
                  const ready = isNewLineReady(line);
                  if (ready) readyIdx += 1;
                  const linePreview = ready ? preview?.newLines?.[readyIdx] : undefined;
                  return (
                    <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_0.75fr_1fr_1.2fr_auto]">
                        <select
                          aria-label={`ລາຍການຄຳໃໝ່ — ລາຍການ (SKU) ${i + 1}`}
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
                          <option value="">ລາຍການ (SKU)</option>
                          {skus.map((s) => (
                            <option key={s.id} value={s.id}>{s.fullSkuName}</option>
                          ))}
                        </select>
                        <NumberInput
                          decimals={4}
                          aria-label={`ລາຍການຄຳໃໝ່ — ນ້ຳໜັກ (g) ${i + 1}`}
                          className="input num"
                          placeholder="ນ້ຳໜັກ (g)"
                          value={line.weightG}
                          onValueChange={(v) => setNew(i, { weightG: v })}
                        />
                        <input
                          aria-label={`ລາຍການຄຳໃໝ່ — ຈຳນວນ ${i + 1}`}
                          className="input num"
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => setNew(i, { quantity: e.target.value })}
                          onBlur={(e) => setNew(i, { quantity: String(qty(e.target.value)) })}
                        />
                        <NumberInput
                          decimals={0}
                          aria-label={`ລາຍການຄຳໃໝ່ — ຄ່າລາຍ ${i + 1}`}
                          className="input num"
                          placeholder={txnType === 'FREE_EXCHANGE' ? '0 (ຟຣີ)' : 'ຄ່າລາຍ'}
                          disabled={txnType === 'FREE_EXCHANGE'}
                          value={txnType === 'FREE_EXCHANGE' ? '0' : line.patternFee}
                          onValueChange={(v) => setNew(i, { patternFee: v })}
                        />
                        <select
                          aria-label={`ລາຍການຄຳໃໝ່ — ຕູ້ເຄື່ອງ ${i + 1}`}
                          className="input"
                          value={line.cabinetId}
                          onChange={(e) => setNew(i, { cabinetId: e.target.value })}
                        >
                          <option value="">ຕູ້ເຄື່ອງ</option>
                          {cabinets.map((c) => (
                            <option key={c.id} value={c.id}>{c.nameLo}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-danger px-3"
                          disabled={newLines.length === 1 && remainingLines.length === 0}
                          onClick={() => setNewLines((p) => p.filter((_, idx) => idx !== i))}
                        >
                          ລຶບ
                        </button>
                      </div>
                      {linePreview && (
                        <div className="flex flex-wrap gap-4 text-xs text-muted">
                          <span>ຄ່າຫຍຸບ: <strong className="num text-fg">{formatLak(linePreview.humpFee)}</strong></span>
                          <span>ຄ່າປ່ຽນຄຳແທ່ງ: <strong className="num text-fg">{formatLak(linePreview.barConvertFee)}</strong></span>
                          <span>ຄ່າລາຍ: <strong className="num text-fg">{formatLak(linePreview.patternFee)}</strong></span>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              <p className="text-xs text-muted">
                ຄ່າຫຍຸບ ແລະ ຄ່າປ່ຽນຄຳແທ່ງ ດຶງຈາກຕາຕະລາງ ຄ່າປ່ຽນ ອັດຕະໂນມັດ
                {txnType === 'FREE_EXCHANGE' && ' — ປ່ຽນຟຣີ: ຄ່າປ່ຽນທັງໝົດ = 0'}
              </p>
            </div>
          </div>

          {/* ---- ຄຳເກົ່າຄົງເຫຼືອ ---- */}
          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-fg-strong">ຄຳເກົ່າຄົງເຫຼືອ</h3>
              <button
                type="button"
                className="btn-secondary h-8 min-h-0 px-3 text-xs"
                onClick={() => setRemainingLines((p) => [...p, emptyRemaining()])}
              >
                + Add
              </button>
            </div>
            <div className="space-y-3 p-4">
              {remainingLines.length === 0 && (
                <p className="text-sm text-muted">ບໍ່ມີຄຳເກົ່າຄົງເຫຼືອ</p>
              )}
              {(() => {
                let readyIdx = -1;
                return remainingLines.map((line, i) => {
                  const ready = isRemainingLineReady(line);
                  if (ready) readyIdx += 1;
                  const remPreview = ready ? preview?.remainingLines?.[readyIdx] : undefined;
                  return (
                    <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                      <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_0.8fr_auto]">
                        <select
                          aria-label={`ຄຳເກົ່າຄົງເຫຼືອ — ປະເພດຄຳ ${i + 1}`}
                          className="input"
                          value={line.goldTypeId}
                          onChange={(e) => setRemaining(i, { goldTypeId: e.target.value })}
                        >
                          <option value="">ຕາມປະເພດຄຳເກົ່າຫຼັກ</option>
                          {selectableGoldTypes.map((t) => (
                            <option key={t.id} value={t.id}>{t.nameLo}</option>
                          ))}
                        </select>
                        <NumberInput
                          decimals={4}
                          aria-label={`ຄຳເກົ່າຄົງເຫຼືອ — ນ້ຳໜັກ (g) ${i + 1}`}
                          className="input num"
                          placeholder="ນ້ຳໜັກ (g)"
                          value={line.weightG}
                          onValueChange={(v) => setRemaining(i, { weightG: v })}
                        />
                        <input
                          aria-label={`ຄຳເກົ່າຄົງເຫຼືອ — ຈຳນວນ ${i + 1}`}
                          className="input num"
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => setRemaining(i, { quantity: e.target.value })}
                          onBlur={(e) => setRemaining(i, { quantity: String(qty(e.target.value)) })}
                        />
                        <button
                          type="button"
                          className="btn-danger px-3"
                          onClick={() => setRemainingLines((p) => p.filter((_, idx) => idx !== i))}
                        >
                          ລຶບ
                        </button>
                      </div>
                      {remPreview && (
                        <div className="text-xs text-muted">
                          ລາຄາຊື້ຄືນໜ້າຮ້ານ: <strong className="num text-fg">{formatLak(remPreview.shopBuybackPrice)} LAK</strong>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* ---- ສະຫຼຸບ + Zero-balance + ການຈ່າຍເງິນ ---- */}
          <div className="rounded-xl border border-line p-4 space-y-4">
            <div className="recessed rounded-xl p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Field labelLo="ລາຄາຊື້ຄືນໜ້າຮ້ານ" value={preview ? formatLak(preview.shopBuybackPrice) : '—'} />
                <Field labelLo="ຄ່າອ່ອນ" value={preview ? formatLak(preview.softGoldFee) : '—'} />
                <Field labelLo="ຄ່າຫຍຸບ" value={preview ? formatLak(preview.humpFee) : '—'} />
                <Field labelLo="ຄ່າປ່ຽນຄຳແທ່ງ" value={preview ? formatLak(preview.barConvertFee) : '—'} />
                <Field labelLo="ຄ່າລາຍ" value={preview ? formatLak(preview.patternFee) : '—'} />
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
                <Field
                  labelLo={isIncomingPayment ? 'ລູກຄ້າຕ້ອງຈ່າຍເພີ່ມໃຫ້ຮ້ານ' : 'ລວມເງິນຕ້ອງຈ່າຍໃຫ້ລູກຄ້າ'}
                  value={preview ? `${formatLak(String(Math.abs(payableNum)))} LAK` : '—'}
                  strong
                />
                {isPreviewing && <span className="text-xs text-muted">ກຳລັງຄຳນວນ...</span>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                labelLo="ເກນນ້ຳໜັກຄຳເກົ່າ"
                value={preview ? `${formatWeight(preview.standardOldWeightG)} g` : '—'}
              />
              <Field
                labelLo="ລວມນ້ຳໜັກຄຳໃໝ່"
                value={preview ? `${formatWeight(preview.totalNewWeightG)} g` : '—'}
              />
              <Field
                labelLo="ລວມຄຳເກົ່າຄົງເຫຼືອ"
                value={preview ? `${formatWeight(preview.totalRemainingWeightG)} g` : '—'}
              />
            </div>

            {/* ⚠ TOR §5.2 CRITICAL — the gate on saving. */}
            <div
              role="status"
              className={`notice ${
                !preview
                  ? 'recessed border border-line text-muted'
                  : preview.isBalanced
                    ? 'status-success'
                    : 'status-danger'
              }`}
            >
              {!preview
                ? 'ປ້ອນລາຍການຄຳເກົ່າເພື່ອກວດສອບຄວາມສົມດຸນ'
                : preview.isBalanced
                  ? '✓ ນ້ຳໜັກສົມດຸນ — ບັນທຶກໄດ້'
                  : preview.messageLo}
            </div>

            {isZeroPayable ? (
              <div className="notice status-success text-xs">
                ມູນຄ່າສຸດທິເທົ່າກັບ 0 LAK — ບໍ່ຕ້ອງຈ່າຍ ຫຼື ຮັບເງິນເພີ່ມ
              </div>
            ) : (
              <MultiPayment
                lines={payments}
                onChange={setPayments}
                owedLak={absOwedLak}
                direction={isIncomingPayment ? 'in' : 'out'}
                labelLo={
                  isIncomingPayment
                    ? 'ຮັບເງິນຈາກລູກຄ້າ — ສົດ / ໂອນ (ແຍກແຖວໄດ້)'
                    : 'ຈ່າຍເງິນໃຫ້ລູກຄ້າ — ສົດ / ໂອນ (ແຍກແຖວໄດ້)'
                }
              />
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
              <div className="space-y-1 text-xs">
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
                <div className="space-y-1 text-xs">
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
                <div className="space-y-1 text-xs">
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
                <div className="space-y-1 text-xs">
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

function Field({ labelLo, value, strong }: { labelLo: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="section-label">{labelLo}</div>
      <div className={`num mt-1 font-semibold text-fg-strong ${strong ? 'text-[24px]' : 'text-[18px]'}`}>
        {value}
      </div>
    </div>
  );
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
