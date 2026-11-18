'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec } from '@kpv/domain';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime, formatByCurrency, gramsToBaht } from '@/lib/format';
import { statusClass } from '@/lib/status';
import { useRealtimeInvalidate } from '@/lib/realtime';
import { clean, isDecimal, isPhone, isPositive } from '@/lib/validate';
import { useToast } from '@/components/toast';
import { NumberInput } from '@/components/number-input';
import {
  MultiPayment,
  newPaymentLines,
  paymentPayload,
  type PaymentLine,
  type Rates,
} from '@/components/multi-payment';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { useHistoryRange } from '@/components/date-range';
import { OrderFilterBar, useOrderSearchFilter } from '@/components/order-filter-bar';
import { Pagination, usePagination } from '@/components/pagination';
import { Dialog } from '@/components/dialog';
import {
  calcCreditReceiptSummary,
  CREDIT_CHANGE_LIMITS,
  creditApi,
  creditKeys,
  toCleanDecimalInput,
  validateCreditReceipts,
  type CreditDetail,
  type CreditLinePayload,
  type CreditRow,
  type CreditStatus,
} from '@/services/credit.service';

interface GoldItem { id: string; nameLo: string }
interface Cabinet { id: string; nameLo: string }
interface Shift { id: string; status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED' | 'REJECTED' }

interface CreditFormLine {
  goldItemId: string;
  cabinetId: string;
  weightG: string;
  quantity: number;
  sellPrice: string;
}

const emptyLine = (cabinetId = ''): CreditFormLine => ({
  goldItemId: '',
  cabinetId,
  weightG: '',
  quantity: 1,
  sellPrice: '',
});

const isLineReady = (line: CreditFormLine): boolean =>
  Boolean(line.goldItemId) &&
  Boolean(line.cabinetId) &&
  isPositive(clean(line.weightG)) &&
  Number.isInteger(line.quantity) &&
  line.quantity >= 1 &&
  isPositive(clean(line.sellPrice));

const STATUS_LABEL: Record<CreditStatus, { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ — ຕິດໜີ້' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ຊຳຣະຄົບ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

const REALTIME_KEYS = ['credit', 'cash', 'notifications'] as const;
const DOWN_PAYMENT_PRESETS = [0, 10, 20, 30, 50] as const;

function ReadinessPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`num text-[11px] ${ok ? 'status-success' : 'badge recessed text-muted'}`}>
      {label}
    </span>
  );
}

/**
 * TOR §5.3 — ລາຍການສິນເຊື່ອ (Gold Credit / Installment).
 *
 *   ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ
 *
 * The API converts receipts at Price Rate Sell and caps LAK change from
 * foreign notes at 1,000 THB / 100 USD (§5.3).
 */
export default function CreditPage() {
  const queryClient = useQueryClient();
  useRealtimeInvalidate(REALTIME_KEYS);
  const toast = useToast();
  const user = getStoredUser();

  const canCreate = user?.role === 'VALUER' || user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canReceive = user?.role === 'PAYMENT' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // Form modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState<CreditFormLine[]>([emptyLine()]);
  const [downPayment, setDownPayment] = useState('');
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [formError, setFormError] = useState<string | null>(null);

  const linesListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollNewLineRef = useRef(false);

  // History filters & action dialogs
  const [statusFilter, setStatusFilter] = useState<string>('');
  const searchFilter = useOrderSearchFilter();
  const [viewingRow, setViewingRow] = useState<CreditRow | null>(null);
  const [instalment, setInstalment] = useState<CreditRow | null>(null);
  const [instalmentPayments, setInstalmentPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [instalmentError, setInstalmentError] = useState<string | null>(null);
  const [cancellingRow, setCancellingRow] = useState<CreditRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [deletingRow, setDeletingRow] = useState<CreditRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldScrollNewLineRef.current) return;
    shouldScrollNewLineRef.current = false;
    const container = linesListRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

  const {
    data: shift,
    isError: shiftFailed,
    error: shiftError,
    refetch: refetchShift,
  } = useQuery({
    queryKey: ['shift', 'me'],
    queryFn: () => api.get<Shift | null>('/shifts/me'),
  });
  const hasOpenShift = shift?.status === 'OPEN';

  const {
    data: rates,
    isError: ratesFailed,
    error: ratesError,
    refetch: refetchRates,
  } = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
    retry: false,
  });

  const {
    data: goldItems = [],
    isError: goldItemsFailed,
    error: goldItemsError,
    refetch: refetchGoldItems,
  } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });

  const {
    data: cabinets = [],
    isError: cabinetsFailed,
    error: cabinetsError,
    refetch: refetchCabinets,
  } = useQuery({
    queryKey: ['catalog', 'cabinets'],
    queryFn: () => api.get<Cabinet[]>('/catalog/cabinets'),
  });

  // Load full range (`all=true`) once and filter client-side for instant status/search response.
  const history = useHistoryRange<CreditRow>(creditKeys.all, '/credit');
  const credits = history.rows;
  const creditsFailed = history.isError;
  const creditsError = history.error;
  const refetchCredits = history.refetch;

  const {
    data: viewedDetail,
    isFetching: detailLoading,
    isError: detailFailed,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: creditKeys.detail(viewingRow?.id),
    queryFn: () => creditApi.getOne(viewingRow!.id),
    enabled: Boolean(viewingRow),
    retry: false,
  });

  const filteredRows = useMemo(() => {
    const q = searchFilter.searchTerm.trim().toLowerCase();
    return credits.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!q) return true;
      return row.code.toLowerCase().includes(q) || row.customer.phone.toLowerCase().includes(q);
    });
  }, [credits, statusFilter, searchFilter.searchTerm]);

  const pager = usePagination(filteredRows);

  const canManageRow = (row: CreditRow) =>
    row.createdById === user?.id || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setPhone('');
    setLines([emptyLine()]);
    setDownPayment('');
    setPayments(newPaymentLines());
    setFormError(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const startEdit = (row: CreditRow) => {
    const downLines: PaymentLine[] = (row.receipts ?? [])
      .filter((r) => r.isDownPayment)
      .map((r) => ({
        method: r.method,
        bankAccountId: r.bankAccountId ?? undefined,
        currency: r.currency,
        amount: toCleanDecimalInput(r.amount),
      }));

    const editLines: CreditFormLine[] =
      row.lines && row.lines.length > 0
        ? row.lines.map((l) => ({
            goldItemId: l.goldItemId ?? l.goldItem?.id ?? '',
            cabinetId: l.cabinetId ?? l.cabinet?.id ?? row.cabinetId ?? '',
            weightG: toCleanDecimalInput(l.weightG),
            quantity: l.quantity,
            sellPrice: toCleanDecimalInput(l.sellPrice),
          }))
        : [
            {
              goldItemId: row.goldItemId ?? row.goldItem?.id ?? '',
              cabinetId: row.cabinetId ?? row.cabinet?.id ?? '',
              weightG: toCleanDecimalInput(row.weightG),
              quantity: row.quantity,
              sellPrice: toCleanDecimalInput(row.sellPrice),
            },
          ];

    setEditingId(row.id);
    setPhone(row.customer.phone);
    setLines(editLines);
    setDownPayment(toCleanDecimalInput(row.downPayment));
    setPayments(downLines.length > 0 ? downLines : newPaymentLines());
    setFormError(null);
    setShowForm(true);
  };

  const setLine = (index: number, patch: Partial<CreditFormLine>) => {
    setLines((prev) => prev.map((l, idx) => (idx === index ? { ...l, ...patch } : l)));
  };

  const handleAddLine = () => {
    const lastCabinetId = lines[lines.length - 1]?.cabinetId ?? '';
    shouldScrollNewLineRef.current = true;
    setLines((prev) => [...prev, emptyLine(lastCabinetId)]);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== index) : prev));
  };

  const invalidate = (includeLedgerAndCash = false) => {
    void queryClient.invalidateQueries({ queryKey: creditKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (includeLedgerAndCash) {
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
    }
  };

  const readyLines = useMemo(() => lines.filter(isLineReady), [lines]);
  const allLinesValid = lines.length > 0 && readyLines.length === lines.length;

  const lineTotals = useMemo(() => {
    let totalWeight = dec(0);
    let totalQty = 0;
    let totalSell = dec(0);

    for (const l of lines) {
      const w = clean(l.weightG);
      if (isPositive(w) && Number.isInteger(l.quantity) && l.quantity >= 1) {
        totalWeight = totalWeight.plus(dec(w).mul(l.quantity));
      }
      if (Number.isInteger(l.quantity) && l.quantity >= 1) {
        totalQty += l.quantity;
      }
      const sp = clean(l.sellPrice);
      if (isPositive(sp)) {
        totalSell = totalSell.plus(dec(sp));
      }
    }

    return {
      weightG: totalWeight.toFixed(),
      quantity: totalQty,
      sellPrice: totalSell.toFixed(),
      hasSellPrice: totalSell.gt(0),
    };
  }, [lines]);

  const cleanDownPayment = clean(downPayment);
  const phoneValid = isPhone(phone);
  const sellPriceValid = allLinesValid && lineTotals.hasSellPrice;
  const downPaymentValid = cleanDownPayment !== '' && isDecimal(cleanDownPayment);
  const downExceedsSell =
    lineTotals.hasSellPrice &&
    downPaymentValid &&
    dec(cleanDownPayment).gt(dec(lineTotals.sellPrice));
  const isZeroDownPayment = downPaymentValid && dec(cleanDownPayment).eq(0);

  /** ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍລວມ − ເງິນວາງດາວ */
  const outstanding = useMemo(() => {
    if (!sellPriceValid || !downPaymentValid || downExceedsSell) return null;
    return dec(lineTotals.sellPrice).minus(dec(cleanDownPayment)).toFixed();
  }, [sellPriceValid, downPaymentValid, downExceedsSell, lineTotals.sellPrice, cleanDownPayment]);

  const downPercentLabel = useMemo(() => {
    if (!lineTotals.hasSellPrice || !downPaymentValid || downExceedsSell) return null;
    const pct = dec(cleanDownPayment).div(dec(lineTotals.sellPrice)).mul(100);
    return pct.toFixed(1).replace(/\.0$/, '');
  }, [lineTotals.hasSellPrice, downPaymentValid, downExceedsSell, lineTotals.sellPrice, cleanDownPayment]);

  const downReceiptCheck = useMemo(() => {
    if (isZeroDownPayment) {
      return { ok: true, error: null };
    }
    if (!downPaymentValid) {
      return { ok: false, error: null };
    }
    return validateCreditReceipts(payments, cleanDownPayment, rates, {
      allowEmptyWhenZero: true,
      requireCoverOwed: true,
    });
  }, [isZeroDownPayment, downPaymentValid, payments, cleanDownPayment, rates]);

  const downReceiptSummary = useMemo(() => {
    if (!downPaymentValid || isZeroDownPayment) return null;
    return calcCreditReceiptSummary(payments, cleanDownPayment, rates);
  }, [downPaymentValid, isZeroDownPayment, payments, cleanDownPayment, rates]);

  const instalmentCheck = useMemo(() => {
    if (!instalment) return { ok: false, error: null };
    return validateCreditReceipts(instalmentPayments, instalment.outstanding, rates, {
      allowEmptyWhenZero: false,
      requireCoverOwed: false,
    });
  }, [instalment, instalmentPayments, rates]);

  const instalmentSummary = useMemo(() => {
    if (!instalment) return null;
    return calcCreditReceiptSummary(instalmentPayments, instalment.outstanding, rates);
  }, [instalment, instalmentPayments, rates]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const linePayloads: CreditLinePayload[] = readyLines.map((l) => ({
        goldItemId: l.goldItemId,
        cabinetId: l.cabinetId,
        weightG: clean(l.weightG),
        quantity: l.quantity,
        sellPrice: clean(l.sellPrice),
      }));
      const payload = {
        phone,
        lines: linePayloads,
        downPayment: cleanDownPayment,
        receipts: isZeroDownPayment ? [] : paymentPayload(payments),
      };
      return editingId ? creditApi.update(editingId, payload) : creditApi.create(payload);
    },
    onSuccess: () => {
      resetForm();
      toast.success('ດຳເນີນການສຳເລັດ');
      invalidate(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setFormError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
      if (e instanceof ApiError && e.status === 409) invalidate(false);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (credit: CreditRow) =>
      creditApi.addReceipt(credit.id, paymentPayload(instalmentPayments)),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setInstalment(null);
      setInstalmentPayments(newPaymentLines());
      setInstalmentError(null);
      invalidate(true);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຮັບເງິນບໍ່ສຳເລັດ';
      setInstalmentError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
      if (e instanceof ApiError && e.status === 409) invalidate(true);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => creditApi.cancel(id, reason),
    onSuccess: () => {
      setCancellingRow(null);
      setCancelReason('');
      setCancelError(null);
      toast.success('ຍົກເລີກລາຍການສຳເລັດ');
      invalidate(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຍົກເລີກບໍ່ສຳເລັດ';
      setCancelError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
      if (e instanceof ApiError && e.status === 409) invalidate(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => creditApi.remove(id),
    onSuccess: () => {
      setDeletingRow(null);
      setDeleteError(null);
      toast.success('ລຶບລາຍການສຳເລັດ');
      invalidate(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ';
      setDeleteError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
      if (e instanceof ApiError && e.status === 409) invalidate(false);
    },
  });

  const canSave =
    (editingId ? true : hasOpenShift) &&
    phoneValid &&
    allLinesValid &&
    outstanding !== null &&
    downReceiptCheck.ok;

  const detailRow: CreditDetail | CreditRow | null = viewedDetail ?? viewingRow;

  const applyDownPaymentPreset = (pct: number) => {
    if (!lineTotals.hasSellPrice) return;
    if (pct === 0) {
      setDownPayment('0');
      setPayments(newPaymentLines());
      return;
    }
    const nextDown = dec(lineTotals.sellPrice).mul(pct).div(100).toFixed(0);
    setDownPayment(nextDown);
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການສິນເຊື່ອ"
        subtitle="ຂາຍຄຳແບບວາງດາວ — ຍອດຕິດໜີ້ບັນທຶກເປັນ AR (Cash) ຫຼັງ payment ອະນຸມັດ (TOR §5.3)"
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn-primary cursor-pointer"
              onClick={openCreateForm}
            >
              + ສ້າງລາຍການສິນເຊື່ອ
            </button>
          ) : undefined
        }
      />

      {shiftFailed && <QueryErrorNotice error={shiftError} onRetry={() => void refetchShift()} />}
      {!shiftFailed && !hasOpenShift && (
        <div role="status" className="notice status-warning text-sm">
          ກະຍັງບໍ່ໄດ້ເປີດ — ກະລຸນາກົດ &quot;ເປີດກະ&quot; ກ່ອນສ້າງລາຍການສິນເຊື່ອ ຫຼື ຮັບຄ່າງວດ
        </div>
      )}

      {goldItemsFailed && <QueryErrorNotice error={goldItemsError} onRetry={() => void refetchGoldItems()} />}
      {cabinetsFailed && <QueryErrorNotice error={cabinetsError} onRetry={() => void refetchCabinets()} />}
      {ratesFailed && <QueryErrorNotice error={ratesError} onRetry={() => void refetchRates()} />}

      {/* ── Split Modal ຟອມສ້າງ / ແກ້ໄຂ ລາຍການສິນເຊື່ອ ── */}
      <Dialog
        open={showForm && canCreate}
        onClose={() => {
          if (!saveMutation.isPending) resetForm();
        }}
        title={editingId ? 'ແກ້ໄຂລາຍການສິນເຊື່ອ' : 'ສ້າງລາຍການສິນເຊື່ອ'}
        subtitle="ຂາຍຄຳແບບວາງດາວ (ຮອງຮັບຫຼາຍລາຍການຄຳ) — ຄຳນວນຍອດຕິດໜີ້ ແລະ ຮັບເງິນວາງດາວ (TOR §5.3)"
        size="2xl"
        flushBody
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" aria-label="ສະຖານະຄວາມພ້ອມ">
              <ReadinessPill
                ok={Boolean(editingId) || hasOpenShift}
                label={editingId ? 'ໂໝດແກ້ໄຂ' : hasOpenShift ? 'ກະເປີດຢູ່' : 'ຍັງບໍ່ເປີດກະ'}
              />
              <ReadinessPill ok={phoneValid} label={`ເບີໂທ ${phone.length}/8`} />
              <ReadinessPill
                ok={allLinesValid}
                label={`ຄຳ ${readyLines.length}/${lines.length} ແຖວ`}
              />
              <ReadinessPill
                ok={downPaymentValid && !downExceedsSell && downReceiptCheck.ok}
                label={isZeroDownPayment ? 'ບໍ່ດາວ (0 LAK)' : 'ຮັບເງິນວາງດາວ'}
              />
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="btn-secondary cursor-pointer"
                disabled={saveMutation.isPending}
                onClick={resetForm}
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[210px] cursor-pointer"
                aria-describedby={formError ? 'credit-modal-error' : undefined}
                disabled={!canSave || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {saveMutation.isPending
                  ? 'ກຳລັງບັນທຶກ...'
                  : editingId
                  ? 'ບັນທຶກການແກ້ໄຂ'
                  : 'ຢືນຢັນສ້າງສິນເຊື່ອ'}
              </button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
          {/* ==========================================================
               LEFT COLUMN (7 cols): Step 1 (Customer) + Step 2 (Multi-line Gold & Down Payment)
               ========================================================== */}
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:col-span-7 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-line">
            {formError && (
              <div id="credit-modal-error" role="alert" className="notice status-danger shrink-0 text-xs">
                {formError}
              </div>
            )}

            {editingId && (
              <div className="notice status-warning shrink-0 text-xs">
                ກຳລັງແກ້ໄຂລາຍການສິນເຊື່ອ (ສະຖານະ PENDING) — ອັດຕາແລກປ່ຽນຈະຖືກຄຳນວນຕາມປັດຈຸບັນ
              </div>
            )}

            {!editingId && !hasOpenShift && (
              <div role="alert" className="notice status-warning shrink-0 text-xs">
                ກະຍັງບໍ່ໄດ້ເປີດ — ກະລຸນາກົດ &quot;ເປີດກະ&quot; ກ່ອນສ້າງລາຍການສິນເຊື່ອ
              </div>
            )}

            {ratesFailed && (
              <div role="alert" className="notice status-warning flex shrink-0 items-center justify-between gap-2 text-xs">
                <span>ໂຫຼດອັດຕາແລກປ່ຽນບໍ່ສຳເລັດ — ສາມາດຮັບ LAK ໄດ້ ແຕ່ຕ້ອງໂຫຼດອັດຕາໃໝ່ຫາກຮັບ THB/USD</span>
                <button
                  type="button"
                  className="btn-secondary h-7 min-h-0 shrink-0 cursor-pointer px-2.5 text-[11px]"
                  onClick={() => void refetchRates()}
                >
                  ໂຫຼດຄືນ
                </button>
              </div>
            )}

            {/* ── ຂັ້ນຕອນ 1: ຂໍ້ມູນລູກຄ້າ ── */}
            <section className="shrink-0 space-y-3" aria-labelledby="credit-step-1">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--gold-tint)] text-xs font-bold text-gold"
                >
                  1
                </span>
                <h3 id="credit-step-1" className="text-sm font-semibold text-fg-strong">
                  ຂໍ້ມູນລູກຄ້າ
                </h3>
              </div>

              <div className="sm:max-w-xs">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="label mb-0" htmlFor="phone">
                    ເບີໂທລູກຄ້າ (8 ໂຕ) <span className="text-danger">*</span>
                  </label>
                  <span className={`num text-[11px] font-semibold ${phoneValid ? 'text-success' : 'text-muted'}`}>
                    {phone.length}/8
                  </span>
                </div>
                <div className="input-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
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
                <p className={`mt-1 text-[11px] ${phoneValid ? 'text-success' : 'text-muted'}`}>
                  {phone.length === 0
                    ? 'ຕົວຢ່າງ: 20555123 (8 ໂຕ)'
                    : phoneValid
                    ? 'ເບີໂທຖືກຕ້ອງແລ້ວ'
                    : `ຍັງຂາດອີກ ${8 - phone.length} ໂຕ`}
                </p>
              </div>
            </section>

            <div className="divider shrink-0" aria-hidden="true" />

            {/* ── ຂັ້ນຕອນ 2: ລາຍການຄຳ (ຫຼາຍແຖວ) & ເງິນວາງດາວ ── */}
            <section
              className={lines.length > 1 ? 'flex min-h-0 flex-1 flex-col gap-3.5' : 'shrink-0 space-y-3.5'}
              aria-labelledby="credit-step-2"
            >
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--gold-tint)] text-xs font-bold text-gold"
                  >
                    2
                  </span>
                  <h3 id="credit-step-2" className="text-sm font-semibold text-fg-strong">
                    ລາຍການຄຳ ແລະ ລາຄາຂາຍ
                  </h3>
                  {lines.length > 1 && (
                    <span className="num badge bg-[var(--gold-tint)] text-[11px] font-semibold text-gold">
                      {lines.length} ລາຍການ · ເລື່ອນເບິ່ງໄດ້
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-secondary h-9 min-h-[36px] shrink-0 cursor-pointer px-3 text-xs"
                  onClick={handleAddLine}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-gold"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  ເພີ່ມແຖວຄຳ
                </button>
              </div>

              <div
                ref={linesListRef}
                role={lines.length > 1 ? 'region' : undefined}
                aria-label={lines.length > 1 ? 'ລາຍການຄຳສິນເຊື່ອ' : undefined}
                className={
                  lines.length > 1
                    ? 'nav-scroll max-h-[340px] min-h-0 flex-1 space-y-3 overflow-y-auto pr-1.5 lg:min-h-[200px] lg:max-h-none'
                    : 'space-y-3'
                }
              >
                {lines.map((line, i) => {
                  const lineReady = isLineReady(line);
                  const cleanW = clean(line.weightG);
                  const bahtText = isPositive(cleanW) ? gramsToBaht(cleanW) : null;
                  const cleanSp = clean(line.sellPrice);

                  return (
                    <div
                      key={i}
                      className={`recessed rounded-2xl p-3.5 transition-colors duration-150 ${
                        lineReady ? 'border-[var(--border-hover)]' : ''
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--row-line)] pb-2">
                        <div className="flex items-center gap-2">
                          <span className="badge bg-[var(--gold-tint)] font-bold text-gold">#{i + 1}</span>
                          <span className={lineReady ? 'status-success' : 'status-warning'}>
                            {lineReady ? 'ຂໍ້ມູນຄົບ' : 'ປ້ອນໃຫ້ຄົບ'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="num text-sm font-bold text-fg-strong">
                            {isPositive(cleanSp) ? `${formatLak(cleanSp)} LAK` : '0 LAK'}
                          </span>
                          <button
                            type="button"
                            className="btn-ghost h-8 min-h-[32px] cursor-pointer px-2 text-xs text-danger disabled:cursor-not-allowed"
                            disabled={lines.length === 1}
                            aria-label={`ລຶບແຖວທີ ${i + 1}`}
                            onClick={() => handleRemoveLine(i)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Row 1: Gold Item & Cabinet (Both Required) */}
                      <div className="mb-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <label className="label text-xs" htmlFor={`line-gold-${i}`}>
                            ລາຍການຄຳ <span className="text-danger">*</span>
                          </label>
                          <select
                            id={`line-gold-${i}`}
                            required
                            className="input cursor-pointer"
                            value={line.goldItemId}
                            onChange={(e) => setLine(i, { goldItemId: e.target.value })}
                          >
                            <option value="">— ເລືອກລາຍການຄຳ —</option>
                            {goldItems.map((it) => (
                              <option key={it.id} value={it.id}>{it.nameLo}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="label text-xs" htmlFor={`line-cabinet-${i}`}>
                            ຕູ້ເຄື່ອງ <span className="text-danger">*</span>
                          </label>
                          <select
                            id={`line-cabinet-${i}`}
                            required
                            className="input cursor-pointer"
                            value={line.cabinetId}
                            onChange={(e) => setLine(i, { cabinetId: e.target.value })}
                          >
                            <option value="">— ເລືອກຕູ້ເຄື່ອງ —</option>
                            {cabinets.map((c) => (
                              <option key={c.id} value={c.id}>{c.nameLo}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Weight/piece, Qty, Line Sell Price */}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                        <div className="sm:col-span-4">
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <label className="label mb-0 text-xs" htmlFor={`line-weight-${i}`}>
                              ນ້ຳໜັກ/ຊິ້ນ (g) <span className="text-danger">*</span>
                            </label>
                            {bahtText && bahtText !== '—' && (
                              <span className="num text-[10px] font-semibold text-gold">
                                ≈ {bahtText} ບາດ
                              </span>
                            )}
                          </div>
                          <NumberInput
                            decimals={4}
                            id={`line-weight-${i}`}
                            className="input num font-semibold"
                            placeholder="0.0000"
                            value={line.weightG}
                            onValueChange={(v) => setLine(i, { weightG: v })}
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="label mb-1 text-xs" htmlFor={`line-qty-${i}`}>
                            ຈຳນວນ (ຊິ້ນ)
                          </label>
                          <input
                            id={`line-qty-${i}`}
                            className="input num font-semibold"
                            type="number"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onChange={(e) =>
                              setLine(i, { quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })
                            }
                          />
                        </div>

                        <div className="sm:col-span-5">
                          <label className="label mb-1 text-xs" htmlFor={`line-sell-${i}`}>
                            ລາຄາຂາຍແຖວນີ້ (LAK) <span className="text-danger">*</span>
                          </label>
                          <NumberInput
                            decimals={0}
                            id={`line-sell-${i}`}
                            className="input num font-semibold"
                            placeholder="0"
                            unit="LAK"
                            value={line.sellPrice}
                            onValueChange={(v) => setLine(i, { sellPrice: v })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!allLinesValid && readyLines.length > 0 && (
                <div className="notice status-warning shrink-0 text-xs">
                  ມີແຖວທີ່ຍັງປ້ອນຂໍ້ມູນບໍ່ຄົບ — ກະລຸນາເລືອກລາຍການຄຳ, ຕູ້ເຄື່ອງ, ນ້ຳໜັກ ແລະ ລາຄາຂາຍໃຫ້ຄົບທຸກແຖວ
                </div>
              )}

              {/* Down Payment Block */}
              <div className="recessed shrink-0 space-y-2.5 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="label mb-0 text-xs" htmlFor="downPayment">
                    ເງິນວາງດາວທັງໝົດ (LAK) <span className="text-danger">*</span>
                  </label>
                  {downPercentLabel !== null && (
                    <span className="num text-[11px] font-semibold text-gold">
                      {downPercentLabel}% ຂອງລາຄາຂາຍລວມ ({formatLak(lineTotals.sellPrice)} LAK)
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-12 sm:items-center">
                  <div className="sm:col-span-6">
                    <NumberInput
                      decimals={0}
                      id="downPayment"
                      className={`input input-lg num font-semibold ${downExceedsSell ? 'border-[var(--danger-border)]' : ''}`}
                      placeholder="0"
                      unit="LAK"
                      value={downPayment}
                      onValueChange={setDownPayment}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:col-span-6">
                    {DOWN_PAYMENT_PRESETS.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={!lineTotals.hasSellPrice}
                        onClick={() => applyDownPaymentPreset(pct)}
                        className="num cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--gold-tint)]/40 px-2.5 py-1 text-[11px] font-medium text-fg transition-colors duration-150 hover:border-[var(--border-active)] hover:bg-[var(--gold-tint)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {pct === 0 ? '0% (ບໍ່ດາວ)' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                {downExceedsSell && (
                  <div role="alert" className="notice status-danger text-xs">
                    ເງິນວາງດາວ ({formatLak(cleanDownPayment)} LAK) ຕ້ອງບໍ່ເກີນລາຄາຂາຍລວມ ({formatLak(lineTotals.sellPrice)} LAK)
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ==========================================================
               RIGHT COLUMN (5 cols): Live AR Summary + Step 3 (Down Payment Receipt)
               ========================================================== */}
          <div className="nav-scroll flex flex-col justify-between bg-[var(--gold-tint)]/30 p-5 sm:p-6 lg:col-span-5 lg:min-h-0 lg:overflow-y-auto">
            <div className="space-y-5">
              {/* ── ສະຫຼຸບຍອດສິນເຊື່ອ (Receipt-Style Summary Card) ── */}
              <section aria-label="ຜົນການຄຳນວນສິນເຊື່ອ" className="summary-card rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between border-b border-[var(--row-line)] pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                    ສະຫຼຸບການຄຳນວນ (§5.3)
                  </span>
                  <span className="live-dot text-[11px]">ຄຳນວນສົດ</span>
                </div>

                <div className="my-4">
                  <div className="text-xs text-muted">
                    ຍອດເງິນສິນເຊື່ອຕິດໜີ້ (AR Cash)
                  </div>
                  <div className="num mt-0.5 text-3xl font-bold tracking-tight text-gold-gradient">
                    {outstanding === null ? '—' : `${formatLak(outstanding)} LAK`}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    ສູດ: ລາຄາຂາຍລວມ − ເງິນວາງດາວ
                  </div>
                </div>

                <div className="recessed grid grid-cols-3 gap-2 rounded-xl p-3">
                  <div>
                    <div className="text-[11px] text-muted">ລາຄາຂາຍລວມ</div>
                    <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                      {lineTotals.hasSellPrice ? formatLak(lineTotals.sellPrice) : '0'}
                    </div>
                    <div className="num text-[10px] text-muted">
                      {readyLines.length}/{lines.length} ລາຍການ
                    </div>
                  </div>
                  <div className="border-l border-[var(--row-line)] pl-2.5">
                    <div className="text-[11px] text-muted">ເງິນວາງດາວ</div>
                    <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                      {downPaymentValid ? formatLak(cleanDownPayment) : '0'}
                    </div>
                    <div className="num text-[10px] text-muted">
                      {downPercentLabel !== null ? `${downPercentLabel}%` : 'LAK'}
                    </div>
                  </div>
                  <div className="border-l border-[var(--row-line)] pl-2.5">
                    <div className="text-[11px] text-muted">ນ້ຳໜັກລວມ</div>
                    <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                      {Number(lineTotals.weightG) > 0 ? `${formatWeight(lineTotals.weightG)} g` : '0 g'}
                    </div>
                    <div className="num text-[10px] text-muted">
                      {lineTotals.quantity} ຊິ້ນ
                    </div>
                  </div>
                </div>
              </section>

              {/* ── ຂັ້ນຕອນ 3: ຮັບເງິນວາງດາວ ── */}
              <section className="space-y-3" aria-labelledby="credit-step-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--gold-tint)] text-xs font-bold text-gold"
                    >
                      3
                    </span>
                    <h3 id="credit-step-3" className="text-sm font-semibold text-fg-strong">
                      Receive — ເງິນວາງດາວ
                    </h3>
                  </div>

                  {rates && (
                    <div className="num flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                      <span className="badge recessed">1 THB = {formatLak(rates.thbSellRate)}</span>
                      <span className="badge recessed">1 USD = {formatLak(rates.usdSellRate)}</span>
                    </div>
                  )}
                </div>

                {isZeroDownPayment ? (
                  <div className="notice status-success text-xs">
                    ເງິນວາງດາວ 0 LAK — ຍອດຕິດໜີ້ເຕັມ 100% ({lineTotals.hasSellPrice ? `${formatLak(lineTotals.sellPrice)} LAK` : '0 LAK'}) ບໍ່ຕ້ອງຮັບເງິນໜ້າຮ້ານ
                  </div>
                ) : (
                  <>
                    <MultiPayment
                      compact
                      lines={payments}
                      onChange={setPayments}
                      owedLak={cleanDownPayment || '0'}
                      direction="in"
                      disallowLakOverpay
                      changeLimits={CREDIT_CHANGE_LIMITS}
                      labelLo="ຊ່ອງທາງຮັບເງິນ (Price Rate Sell)"
                    />

                    {downReceiptSummary && Number(downReceiptSummary.totalLak) > 0 && (
                      <div className="recessed flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs">
                        <div>
                          <span className="block text-[11px] text-muted">ຍອດຮັບເງິນລວມ</span>
                          <span className="num font-semibold text-fg-strong">
                            {formatLak(downReceiptSummary.totalLak)} LAK
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[11px] text-muted">
                            {Number(downReceiptSummary.changeLak) > 0 ? 'ເງິນທອນ (LAK)' : 'ສະຖານະ'}
                          </span>
                          <span
                            className={`num font-semibold ${
                              downReceiptCheck.ok ? 'text-success' : 'text-warning'
                            }`}
                          >
                            {Number(downReceiptSummary.changeLak) > 0
                              ? `${formatLak(downReceiptSummary.changeLak)} LAK`
                              : Number(downReceiptSummary.remainingLak) > 0
                              ? `ຍັງຂາດ ${formatLak(downReceiptSummary.remainingLak)}`
                              : 'ຄົບຖ້ວນ'}
                          </span>
                        </div>
                      </div>
                    )}

                    {downReceiptCheck.error && (
                      <div role="alert" className="notice status-danger text-xs">
                        {downReceiptCheck.error}
                      </div>
                    )}

                    <p className="text-[11px] leading-relaxed text-muted">
                      ຍອດຮັບ (LAK) ຕ້ອງ ≥ ເງິນວາງດາວ · ຫ້າມປ້ອນ LAK ເກີນຍອດ · ເງິນທອນ THB ≤ 1,000 THB, USD ≤ 100 USD
                    </p>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </Dialog>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">History ສິນເຊື່ອ</h2>
          <span className="num text-xs text-muted">{filteredRows.length} ລາຍການ</span>
        </div>

        <OrderFilterBar
          history={history}
          search={searchFilter}
          searchPlaceholder="ຄົ້ນຫາລະຫັດ (CR-...) ຫຼື ເບີໂທ..."
          statusSlot={
            <select
              aria-label="ກອງຕາມສະຖານະ"
              className="input h-[38px] !w-auto min-w-[160px] cursor-pointer text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">ທຸກສະຖານະ</option>
              <option value="PENDING">{STATUS_LABEL.PENDING.lo}</option>
              <option value="APPROVED">{STATUS_LABEL.APPROVED.lo}</option>
              <option value="COMPLETED">{STATUS_LABEL.COMPLETED.lo}</option>
              <option value="REJECTED">{STATUS_LABEL.REJECTED.lo}</option>
              <option value="CANCELLED">{STATUS_LABEL.CANCELLED.lo}</option>
            </select>
          }
        />

        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ສິນເຊື່ອ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ລາຍການຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ຈຳນວນ</th>
                <th className="text-right">ລາຄາຂາຍ</th>
                <th className="text-right">ເງິນວາງດາວ</th>
                <th className="text-right">ຍອດຕິດໜີ້ / ຄ້າງຮັບ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={13}
                isError={creditsFailed}
                error={creditsError}
                isEmpty={filteredRows.length === 0}
                emptyText="ຍັງບໍ່ມີລາຍການ"
                onRetry={() => void refetchCredits()}
              />
              {pager.pageItems.map((row) => {
                const canAct = canManageRow(row);
                const rowLines = row.lines ?? [];
                const extraLineCount = Math.max(0, rowLines.length - 1);
                const firstItemName = rowLines[0]?.goldItem?.nameLo ?? row.goldItem.nameLo;
                const firstCabinetName = rowLines[0]?.cabinet?.nameLo ?? row.cabinet?.nameLo;

                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{firstItemName}</span>
                        {extraLineCount > 0 && (
                          <span className="num badge bg-[var(--gold-tint)] text-[10px] font-semibold text-gold">
                            +{extraLineCount} ລາຍການ
                          </span>
                        )}
                      </div>
                      {firstCabinetName && (
                        <div className="text-[11px] text-muted">{firstCabinetName}</div>
                      )}
                    </td>
                    <td className="num text-right">{formatWeight(row.weightG)}</td>
                    <td className="num text-right">{row.quantity}</td>
                    <td className="num sell-price text-right">{formatLak(row.sellPrice)}</td>
                    <td className="num text-right">{formatLak(row.downPayment)}</td>
                    <td className="num text-right font-medium">{formatLak(row.outstanding)}</td>
                    <td>
                      <span className={statusClass(row.status)}>
                        {STATUS_LABEL[row.status]?.lo ?? row.status}
                      </span>
                    </td>
                    <td className="text-muted">{row.createdBy ?? '—'}</td>
                    <td className="text-muted">{row.updatedBy ?? '—'}</td>
                    <td className="text-right">
                      <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                        {row.status === 'APPROVED' && Number(row.outstanding) > 0 && canReceive && (
                          <button
                            type="button"
                            className="btn-primary !h-8 !min-h-0 cursor-pointer !px-3 text-xs"
                            disabled={!hasOpenShift}
                            onClick={() => {
                              setInstalment(row);
                              setInstalmentPayments(newPaymentLines());
                              setInstalmentError(null);
                            }}
                          >
                            ຮັບຄ່າງວດ
                          </button>
                        )}
                        <div className="ml-0.5 flex items-center gap-0.5 border-l border-line/60 pl-1.5">
                          <button
                            type="button"
                            className="btn-ghost flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg p-1.5 text-muted transition-colors hover:bg-line/40 hover:text-fg"
                            title="ເບິ່ງລາຍລະອຽດ"
                            aria-label={`View ${row.code}`}
                            onClick={() => setViewingRow(row)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          {row.status === 'PENDING' && canCreate && canAct && (
                            <button
                              type="button"
                              className="btn-ghost flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg p-1.5 text-[var(--gold)] transition-colors hover:bg-[var(--gold-tint)]"
                              title="ແກ້ໄຂລາຍການ"
                              aria-label={`ແກ້ໄຂ ${row.code}`}
                              onClick={() => startEdit(row)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}
                          {row.status === 'PENDING' && (canAct || canReceive) && (
                            <button
                              type="button"
                              className="btn-ghost flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg p-1.5 text-danger transition-colors hover:bg-[var(--danger-bg)]"
                              title="ຍົກເລີກລາຍການ"
                              aria-label={`ຍົກເລີກ ${row.code}`}
                              onClick={() => {
                                setCancellingRow(row);
                                setCancelReason('');
                                setCancelError(null);
                              }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                              </svg>
                            </button>
                          )}
                          {(row.status === 'PENDING' || row.status === 'REJECTED' || row.status === 'CANCELLED') &&
                            canCreate &&
                            canAct && (
                              <button
                                type="button"
                                className="btn-ghost flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg p-1.5 text-danger transition-colors hover:bg-[var(--danger-bg)]"
                                title="ລຶບລາຍການ"
                                aria-label={`ລຶບ ${row.code}`}
                                onClick={() => {
                                  setDeletingRow(row);
                                  setDeleteError(null);
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            )}
                        </div>
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

      {/* ── Dialog ຮັບຄ່າງວດ ── */}
      <Dialog
        open={Boolean(instalment)}
        onClose={() => {
          if (receiveMutation.isPending) return;
          setInstalment(null);
          setInstalmentPayments(newPaymentLines());
          setInstalmentError(null);
        }}
        title={`ຮັບຄ່າງວດ — ${instalment?.code ?? ''}`}
        subtitle={
          instalment
            ? `ເບີໂທ ${instalment.customer.phone} · ຄ້າງຮັບ ${formatLak(instalment.outstanding)} LAK`
            : undefined
        }
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary cursor-pointer"
              disabled={receiveMutation.isPending}
              onClick={() => {
                setInstalment(null);
                setInstalmentPayments(newPaymentLines());
                setInstalmentError(null);
              }}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary cursor-pointer"
              disabled={!hasOpenShift || !instalmentCheck.ok || receiveMutation.isPending}
              onClick={() => instalment && receiveMutation.mutate(instalment)}
            >
              {receiveMutation.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຢືນຢັນຮັບເງິນ'}
            </button>
          </div>
        }
      >
        {instalment && (
          <div className="space-y-4">
            <MultiPayment
              lines={instalmentPayments}
              onChange={setInstalmentPayments}
              owedLak={instalment.outstanding}
              direction="in"
              disallowLakOverpay
              partialAllowed
              changeLimits={CREDIT_CHANGE_LIMITS}
              labelLo="ຮັບຄ່າງວດ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ — ຈ່າຍບາງສ່ວນ ຫຼື ປິດຍອດໄດ້)"
            />

            {instalmentSummary && Number(instalmentSummary.totalLak) > 0 && (
              <div className="recessed grid grid-cols-3 gap-2 rounded-xl p-3 text-xs">
                <div>
                  <span className="block text-[11px] text-muted">ຕັດຍອດໜີ້ງວດນີ້</span>
                  <span className="num font-semibold text-fg-strong">
                    {formatLak(instalmentSummary.appliedLak)} LAK
                  </span>
                </div>
                <div className="border-l border-[var(--row-line)] pl-2.5">
                  <span className="block text-[11px] text-muted">ເງິນທອນ (LAK)</span>
                  <span className="num font-semibold text-fg-strong">
                    {formatLak(instalmentSummary.changeLak)} LAK
                  </span>
                </div>
                <div className="border-l border-[var(--row-line)] pl-2.5">
                  <span className="block text-[11px] text-muted">ຄ້າງຫຼັງງວດນີ້</span>
                  <span
                    className={`num font-semibold ${
                      Number(instalmentSummary.remainingLak) === 0 ? 'text-success' : 'text-gold'
                    }`}
                  >
                    {Number(instalmentSummary.remainingLak) === 0
                      ? 'ຊຳຣະຄົບ (0 LAK)'
                      : `${formatLak(instalmentSummary.remainingLak)} LAK`}
                  </span>
                </div>
              </div>
            )}

            <p className="text-xs text-muted">
              ເງິນທອນຈາກ THB ບໍ່ເກີນ 1,000 THB, ຈາກ USD ບໍ່ເກີນ 100 USD
            </p>
            {instalmentCheck.error && (
              <div role="alert" className="notice status-danger text-xs">
                {instalmentCheck.error}
              </div>
            )}
            {instalmentError && (
              <div role="alert" className="notice status-danger text-xs">
                {instalmentError}
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ── Dialog ລາຍລະອຽດສິນເຊື່ອ (Pop-up Modal) ── */}
      <Dialog
        open={Boolean(detailRow)}
        onClose={() => setViewingRow(null)}
        title={`ລາຍລະອຽດສິນເຊື່ອ — ${detailRow?.code ?? ''}`}
        subtitle={detailRow ? `ເບີໂທ ${detailRow.customer.phone}` : undefined}
        size="lg"
        dismissOnScrim
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {detailRow && (
                <>
                  ສ້າງເມື່ອ: <span className="num font-medium text-fg">{formatDateTime(detailRow.createdAt)}</span>
                  {' · '}ຜູ້ບັນທຶກ: <span className="font-medium text-fg">{detailRow.createdBy ?? '—'}</span>
                  {detailRow.updatedBy && detailRow.updatedBy !== detailRow.createdBy && (
                    <> · ແກ້ໄຂ/ອະນຸມັດ: <span className="font-medium text-fg">{detailRow.updatedBy}</span></>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {detailRow && detailRow.status === 'PENDING' && canCreate && canManageRow(detailRow) && (
                <button
                  type="button"
                  className="btn-secondary cursor-pointer"
                  onClick={() => {
                    const target = detailRow;
                    setViewingRow(null);
                    startEdit(target);
                  }}
                >
                  ແກ້ໄຂ
                </button>
              )}
              {detailRow &&
                detailRow.status === 'APPROVED' &&
                Number(detailRow.outstanding) > 0 &&
                canReceive && (
                  <button
                    type="button"
                    className="btn-primary cursor-pointer"
                    disabled={!hasOpenShift}
                    onClick={() => {
                      const target = detailRow;
                      setViewingRow(null);
                      setInstalment(target);
                      setInstalmentPayments(newPaymentLines());
                      setInstalmentError(null);
                    }}
                  >
                    ຮັບຄ່າງວດ
                  </button>
                )}
              <button type="button" className="btn-secondary cursor-pointer" onClick={() => setViewingRow(null)}>
                ປິດ
              </button>
            </div>
          </div>
        }
      >
        {detailRow && (
          <div className="space-y-4 text-sm">
            {detailFailed && (
              <QueryErrorNotice error={detailError} onRetry={() => void refetchDetail()} />
            )}

            <div className="recessed grid gap-3 rounded-xl p-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-muted">ລາຍການຄຳ</div>
                <div className="font-medium text-fg">
                  {(detailRow.lines?.length ?? 0) > 1
                    ? `${detailRow.lines!.length} ລາຍການ`
                    : detailRow.goldItem.nameLo}
                </div>
                <div className="num text-xs text-muted">
                  ລວມ {formatWeight(detailRow.weightG)} g · {detailRow.quantity} ຊິ້ນ
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">ລາຄາຂາຍ / ວາງດາວ</div>
                <div className="num font-semibold text-fg">
                  {formatLak(detailRow.sellPrice)} LAK
                </div>
                <div className="num text-xs text-muted">
                  ວາງດາວ {formatLak(detailRow.downPayment)} LAK
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">ຮັບແລ້ວ / ຄ້າງຮັບ</div>
                <div className="num font-medium text-fg">
                  {formatLak(detailRow.paidAmount ?? '0')} LAK
                </div>
                <div className="num text-xs font-semibold text-fg-strong">
                  ຄ້າງ {formatLak(detailRow.outstanding)} LAK
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">ສະຖານະ</div>
                <div className="mt-1">
                  <span className={statusClass(detailRow.status)}>
                    {STATUS_LABEL[detailRow.status]?.lo ?? detailRow.status}
                  </span>
                </div>
                {detailRow.approvedAt && (
                  <div className="num mt-1 text-[11px] text-muted">
                    ອະນຸມັດ: {formatDateTime(detailRow.approvedAt)}
                  </div>
                )}
                {detailRow.settledAt && (
                  <div className="num text-[11px] text-muted">
                    ຊຳຣະຄົບ: {formatDateTime(detailRow.settledAt)}
                  </div>
                )}
              </div>
            </div>

            {detailRow.rejectReason && (
              <div className="notice status-danger text-xs">
                ເຫດຜົນ: {detailRow.rejectReason}
              </div>
            )}

            {/* Gold Items List */}
            <div>
              <h3 className="label mb-2">
                ລາຍການຄຳໃນບິນ ({(detailRow.lines?.length ?? 0) || 1} ລາຍການ)
              </h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>ລາຍການຄຳ</th>
                      <th>ຕູ້ເຄື່ອງ</th>
                      <th className="text-right">ນ້ຳໜັກ/ຊິ້ນ (g)</th>
                      <th className="text-right">ຈຳນວນ</th>
                      <th className="text-right">ລາຄາຂາຍ (LAK)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailRow.lines && detailRow.lines.length > 0
                      ? detailRow.lines
                      : [
                          {
                            id: detailRow.id,
                            goldItemId: detailRow.goldItemId ?? '',
                            cabinetId: detailRow.cabinetId,
                            weightG: detailRow.weightG,
                            quantity: detailRow.quantity,
                            sellPrice: detailRow.sellPrice,
                            sortOrder: 0,
                            goldItem: detailRow.goldItem,
                            cabinet: detailRow.cabinet,
                          },
                        ]
                    ).map((l, idx) => (
                      <tr key={l.id}>
                        <td className="num text-xs text-muted">{idx + 1}</td>
                        <td className="font-medium text-fg">{l.goldItem.nameLo}</td>
                        <td className="text-muted">{l.cabinet?.nameLo ?? '—'}</td>
                        <td className="num text-right">{formatWeight(l.weightG)}</td>
                        <td className="num text-right">{l.quantity}</td>
                        <td className="num sell-price text-right">{formatLak(l.sellPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="label mb-2">ປະຫວັດການຮັບເງິນ (ວາງດາວ ແລະ ຄ່າງວດ)</h3>
              {detailLoading && !(detailRow.receipts?.length) ? (
                <div className="text-xs text-muted">ກຳລັງໂຫຼດ...</div>
              ) : (detailRow.receipts ?? []).length === 0 ? (
                <div className="text-xs text-muted">ບໍ່ມີລາຍການຮັບເງິນ</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ປະເພດ</th>
                        <th>ຊ່ອງທາງ</th>
                        <th className="text-right">ຈຳນວນ</th>
                        <th className="text-right">ທຽບເທົ່າ LAK</th>
                        <th className="text-right">ເງິນທອນ LAK</th>
                        <th>ວັນທີ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailRow.receipts ?? []).map((r) => (
                        <tr key={r.id}>
                          <td>{r.isDownPayment ? 'ເງິນວາງດາວ' : 'ຄ່າງວດ'}</td>
                          <td>
                            {r.method === 'CASH' ? 'ເງິນສົດ' : `ໂອນ${r.bankAccount?.nameLo ? ` · ${r.bankAccount.nameLo}` : ''}`}
                          </td>
                          <td className="num text-right">
                            {formatByCurrency(r.amount, r.currency)} {r.currency}
                          </td>
                          <td className="num text-right">{formatLak(r.amountLak)}</td>
                          <td className="num text-right">
                            {Number(r.changeLak) > 0 ? formatLak(r.changeLak) : '0'}
                          </td>
                          <td className="text-xs text-muted">{formatDateTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {viewedDetail?.audits && viewedDetail.audits.length > 0 && (
              <div>
                <h3 className="label mb-2">ປະຫວັດການດຳເນີນງານ</h3>
                <div className="space-y-1.5 text-xs">
                  {viewedDetail.audits.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-recessed px-3 py-2">
                      <div>
                        <span className="font-medium text-fg">{a.summary ?? a.action}</span>
                        {a.actor?.fullName && (
                          <span className="text-muted"> · {a.actor.fullName}</span>
                        )}
                      </div>
                      <span className="num text-muted">{formatDateTime(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ── Dialog ຍົກເລີກ ── */}
      <Dialog
        open={Boolean(cancellingRow)}
        onClose={() => {
          if (cancelMutation.isPending) return;
          setCancellingRow(null);
          setCancelError(null);
        }}
        title={`ຍົກເລີກລາຍການ ${cancellingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary cursor-pointer"
              disabled={cancelMutation.isPending}
              onClick={() => {
                setCancellingRow(null);
                setCancelError(null);
              }}
            >
              ປິດ
            </button>
            <button
              type="button"
              className="btn-danger cursor-pointer"
              disabled={cancelMutation.isPending}
              onClick={() =>
                cancellingRow &&
                cancelMutation.mutate({ id: cancellingRow.id, reason: cancelReason })
              }
            >
              {cancelMutation.isPending ? 'ກຳລັງຍົກເລີກ...' : 'ຢືນຢັນຍົກເລີກ'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {cancelError && (
            <div role="alert" className="notice status-danger text-xs">
              {cancelError}
            </div>
          )}
          <div>
            <label className="label" htmlFor="cancel-reason">ເຫດຜົນ (ຖ້າມີ)</label>
            <input
              id="cancel-reason"
              className="input"
              maxLength={300}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="ລະບຸເຫດຜົນ..."
            />
          </div>
        </div>
      </Dialog>

      {/* ── Dialog ລຶບ ── */}
      <Dialog
        open={Boolean(deletingRow)}
        onClose={() => {
          if (deleteMutation.isPending) return;
          setDeletingRow(null);
          setDeleteError(null);
        }}
        title={`ຢືນຢັນລຶບ ${deletingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary cursor-pointer"
              disabled={deleteMutation.isPending}
              onClick={() => {
                setDeletingRow(null);
                setDeleteError(null);
              }}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-danger cursor-pointer"
              disabled={deleteMutation.isPending}
              onClick={() => deletingRow && deleteMutation.mutate(deletingRow.id)}
            >
              {deleteMutation.isPending ? 'ກຳລັງລຶບ...' : 'ລຶບລາຍການ'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {deleteError && (
            <div role="alert" className="notice status-danger text-xs">
              {deleteError}
            </div>
          )}
          <p className="text-sm text-fg">
            ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການ <b className="font-mono">{deletingRow?.code}</b>?
          </p>
        </div>
      </Dialog>
    </div>
  );
}
