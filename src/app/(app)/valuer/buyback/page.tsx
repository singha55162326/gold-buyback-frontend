'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime, formatByCurrency, gramsToBaht } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { useHistoryRange } from '@/components/date-range';
import { MultiPayment, newPaymentLines, paymentPayload, useInsufficientFundsError } from '@/components/multi-payment';
import type { PaymentLine } from '@/components/multi-payment';
import { Pagination, usePagination } from '@/components/pagination';
import { OrderFilterBar, useOrderSearchFilter } from '@/components/order-filter-bar';
import { BuybackTimeline, type BuybackAuditItem } from '@/components/buyback-timeline';
import { Dialog } from '@/components/dialog';
import { PrintSheet } from '@/components/print-sheet';
import { useRealtimeInvalidate } from '@/lib/realtime';

interface GoldType { id: string; code: string; nameLo: string }
interface GoldItem { id: string; nameLo: string }
interface BankAccount { id: string; code: string; nameLo: string }
interface Shift { id: string; status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED' | 'REJECTED' }

interface PreviewLine {
  goldTypeId: string;
  goldTypeNameLo: string;
  goldItemId: string | null;
  weightG: string;
  quantity: number;
  goldPercent: string | null;
  shopBuybackPrice: string;
  deduction: string;
  payableAmount: string;
  branch: string;
}

interface Preview {
  snapshotId: string;
  goldTypeCode: string;
  kind: string;
  shopBuybackPrice: string;
  deduction: string;
  /** ຍອດລວມທັງບິນ. */
  payableAmount: string;
  branch: string;
  totalWeightG: string;
  totalQuantity: number;
  lines: PreviewLine[];
}

/** ແຖວລາຍການຄຳໃນຟອມ. */
interface FormLine {
  goldTypeId: string;
  goldItemId: string;
  weightG: string;
  quantity: string;
  goldPercent: string;
  deduction: string;
}

const emptyLine = (goldTypeId = ''): FormLine => ({
  goldTypeId, goldItemId: '', weightG: '', quantity: '1', goldPercent: '', deduction: '',
});

/** ຈຳນວນທີ່ພິມຍັງບໍ່ຄົບ ນັບເປັນ 1. */
const qty = (value: string) => Math.max(1, Math.trunc(Number(value) || 0) || 1);

interface BuybackPayment {
  id: string; method: 'CASH' | 'BANK'; bankAccountId?: string | null; currency: string;
  amount: string; amountLak: string; changeLak: string;
  bankAccount?: { nameLo: string } | null;
}

/** ສົດ / ໂອນ ເປັນສອງຊ່ອງທາງແຍກກັນ, ສະນັ້ນ ປະຫວັດກໍບອກແຍກ. */
const METHOD_LABEL: Record<BuybackPayment['method'], string> = {
  CASH: 'ເງິນສົດ',
  BANK: 'ໂອນ',
};

type BuybackStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

interface BuybackLineRow {
  id: string;
  goldTypeId?: string;
  goldItemId?: string | null;
  weightG: string;
  quantity: number;
  goldPercent: string | null;
  shopBuybackPrice: string;
  deduction: string;
  payableAmount: string;
  branch?: string | null;
  goldType: { nameLo: string };
  goldItem: { nameLo: string } | null;
}

interface BuybackRow {
  id: string;
  code: string;
  source: 'KPV' | 'OTHER_SHOP';
  goldTypeId?: string;
  goldItemId?: string | null;
  goldPercent: string | null;
  paidAmount?: string;
  outstandingAmount: string;
  rejectReason?: string | null;
  approvedAt?: string | null;
  confirmedAt?: string | null;
  createdById?: string;
  createdBy?: string;
  updatedBy: string;
  payments: BuybackPayment[];
  goldItem: { nameLo: string } | null;
  /** ລາຍການຄຳໃນບິນ — ບິນດຽວມີໄດ້ຫຼາຍແຖວ. */
  lines?: BuybackLineRow[];
  status: BuybackStatus;
  weightG: string;
  quantity: number;
  payableAmount: string;
  createdAt: string;
  customer: { phone: string };
  goldType: { nameLo: string };
}

interface BuybackDetail extends BuybackRow {
  audits?: BuybackAuditItem[];
}

const STATUS_LABEL: Record<BuybackStatus, { lo: string }> = {
  DRAFT: { lo: 'ຮ່າງ' },
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ — ລໍຖ້າຢືນຢັນ' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ສຳເລັດ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

interface FilterOption<T extends string = string> {
  value: T;
  labelLo: string;
  dotColor: string;
}

const BUYBACK_STATUS_FILTER_OPTIONS: FilterOption<'' | BuybackStatus>[] = [
  { value: '', labelLo: 'ທຸກສະຖານະ', dotColor: 'var(--gold)' },
  { value: 'PENDING', labelLo: 'ລໍຖ້າອະນຸມັດ', dotColor: 'var(--warning-dot)' },
  { value: 'APPROVED', labelLo: 'ອະນຸມັດແລ້ວ', dotColor: 'var(--gold)' },
  { value: 'COMPLETED', labelLo: 'ສຳເລັດ', dotColor: 'var(--success-dot)' },
  { value: 'REJECTED', labelLo: 'ປະຕິເສດ', dotColor: 'var(--danger-dot)' },
  { value: 'CANCELLED', labelLo: 'ຍົກເລີກ', dotColor: 'var(--muted)' },
];

const BUYBACK_SOURCE_FILTER_OPTIONS: FilterOption<'' | 'KPV' | 'OTHER_SHOP'>[] = [
  { value: '', labelLo: 'ທຸກແຫຼ່ງຄຳ', dotColor: 'var(--gold)' },
  { value: 'KPV', labelLo: 'ຄຳຮ້ານ KPV', dotColor: 'var(--gold)' },
  { value: 'OTHER_SHOP', labelLo: 'ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ)', dotColor: 'var(--warning-dot)' },
];

/** ສະຫຼຸບຊ່ອງທາງການຈ່າຍແບບກະທັດຮັດສຳລັບຕາຕະລາງປະຫວັດ. */
function summarizeBuybackPayments(payments: BuybackPayment[] | undefined): string {
  if (!payments || payments.length === 0) return 'ຍັງບໍ່ລະບຸ';
  if (payments.length === 1) {
    const leg = payments[0];
    const methodLabel = METHOD_LABEL[leg.method] ?? leg.method;
    const bankLabel = leg.bankAccount?.nameLo ? ` · ${leg.bankAccount.nameLo}` : '';
    return `${methodLabel}${bankLabel} (${leg.currency})`;
  }
  const currencies = Array.from(new Set(payments.map((p) => p.currency))).join(', ');
  return `${payments.length} ຊ່ອງທາງ (${currencies})`;
}

const REALTIME_KEYS = ['buyback', 'cash', 'notifications'] as const;

const isLineReady = (l: FormLine, isBoiled: boolean) => {
  if (!l.goldTypeId || !l.weightG.trim() || !(Number(l.weightG) > 0)) return false;
  if (isBoiled) {
    const pct = Number(l.goldPercent);
    if (!l.goldPercent.trim() || !Number.isFinite(pct) || pct <= 0 || pct > 100) return false;
  }
  return true;
};

/**
 * TOR §5.1 — Buyback (ການຊື້ຄຳຄືນ).
 *
 * The preview comes from the API rather than being recomputed here: §5.1
 * depends on lookup tables and the live price snapshot, so the server is the
 * only place that can price it correctly. The response carries which branch
 * of the formula was taken, which is shown to the valuer.
 */
export default function BuybackPage() {
  const queryClient = useQueryClient();
  useRealtimeInvalidate(REALTIME_KEYS);

  // The history is the landing view; the form opens on demand.
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();
  const user = getStoredUser();
  const canConfirm = user?.role === 'VALUER' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<'KPV' | 'OTHER_SHOP'>('KPV');
  // ບິນດຽວ Add ລາຍການຄຳໄດ້ຫຼາຍແຖວ (TOR §5.1 ຕາມທີ່ລູກຄ້າແຈ້ງ).
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const linesListRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottomRef = useRef(false);
  const setLine = (i: number, patch: Partial<FormLine>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const handleAddLine = () => {
    scrollToBottomRef.current = true;
    setLines((p) => [...p, emptyLine(isBoiled && boiledGoldType ? boiledGoldType.id : '')]);
  };
  // ສົດ ແລະ ໂອນ ແຍກແຖວກັນ: one buyback may be paid part cash, part transfer,
  // and each leg carries its own currency and rate.
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [viewingRow, setViewingRow] = useState<BuybackRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // History filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const searchFilter = useOrderSearchFilter();

  // Action dialogs
  const [confirmingRow, setConfirmingRow] = useState<BuybackRow | null>(null);
  const [cancellingRow, setCancellingRow] = useState<BuybackRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deletingRow, setDeletingRow] = useState<BuybackRow | null>(null);
  const [settlingRow, setSettlingRow] = useState<BuybackRow | null>(null);
  const [settlePayments, setSettlePayments] = useState<PaymentLine[]>(newPaymentLines);
  const [printingRow, setPrintingRow] = useState<BuybackRow | null>(null);

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
  const { isError: banksFailed, error: banksError, refetch: refetchBanks } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<BankAccount[]>('/catalog/bank-accounts'),
  });

  const historyParams = useMemo(
    () => ({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(sourceFilter ? { source: sourceFilter } : {}),
      ...(searchFilter.debouncedSearch ? { search: searchFilter.debouncedSearch } : {}),
    }),
    [statusFilter, sourceFilter, searchFilter.debouncedSearch],
  );

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<BuybackRow>(['buyback'], '/buyback', { params: historyParams });
  const rows = history.rows;
  const rowsFailed = history.isError;
  const rowsError = history.error;
  const refetchRows = history.refetch;

  const { data: viewedDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['buyback', 'detail', viewingRow?.id],
    queryFn: () => api.get<BuybackDetail>(`/buyback/${viewingRow!.id}`),
    enabled: Boolean(viewingRow),
    retry: false,
  });

  const filteredRows = useMemo(() => {
    const q = searchFilter.searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (sourceFilter && row.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q) ||
        row.customer.phone.toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, sourceFilter, searchFilter.searchTerm]);

  const pager = usePagination(filteredRows);

  const isBoiled = source === 'OTHER_SHOP';
  const boiledGoldType = useMemo(
    () => goldTypes.find((t) => t.code === 'BOILED'),
    [goldTypes],
  );
  const selectableGoldTypes = useMemo(() => {
    if (isBoiled) return boiledGoldType ? [boiledGoldType] : goldTypes;
    return goldTypes.filter((t) => t.code !== 'BOILED');
  }, [isBoiled, boiledGoldType, goldTypes]);

  // ຖ້າເລືອກ "ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ)" ແລະ ໂຫຼດປະເພດຄຳແລ້ວ, ຕັ້ງຄ່າ BOILED ໃຫ້ອັດຕະໂນມັດ.
  useEffect(() => {
    if (!isBoiled || !boiledGoldType) return;
    setLines((prev) =>
      prev.some((l) => l.goldTypeId !== boiledGoldType.id)
        ? prev.map((l) => ({ ...l, goldTypeId: boiledGoldType.id, deduction: '' }))
        : prev,
    );
  }, [isBoiled, boiledGoldType]);

  // ເມື່ອກົດເພີ່ມແຖວຄຳ (> 1 ລາຍການ), ເລື່ອນລາຍການໄປທີ່ແຖວໃໝ່ອັດຕະໂນມັດ.
  useEffect(() => {
    if (!scrollToBottomRef.current) return;
    scrollToBottomRef.current = false;
    const container = linesListRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      const lastIndex = lines.length - 1;
      const targetId = isBoiled && boiledGoldType ? `line-weight-${lastIndex}` : `line-type-${lastIndex}`;
      document.getElementById(targetId)?.focus({ preventScroll: true });
    });
  }, [lines.length, isBoiled, boiledGoldType]);

  const handleSourceChange = (next: 'KPV' | 'OTHER_SHOP') => {
    setSource(next);
    if (next === 'OTHER_SHOP') {
      setLines((prev) =>
        prev.map((l) => ({
          ...l,
          goldTypeId: boiledGoldType?.id ?? l.goldTypeId,
          deduction: '',
        })),
      );
    } else {
      setLines((prev) =>
        prev.map((l) => ({
          ...l,
          goldTypeId: boiledGoldType && l.goldTypeId === boiledGoldType.id ? '' : l.goldTypeId,
          goldPercent: '',
        })),
      );
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setPhone('');
    setSource('KPV');
    setLines([emptyLine()]);
    setPayments(newPaymentLines());
    setPreview(null);
    setError(null);
  };

  const startEdit = (row: BuybackRow) => {
    const nextSource = row.source;
    const rowLines = row.lines?.length
      ? row.lines.map((l) => ({
          goldTypeId: l.goldTypeId ?? row.goldTypeId ?? '',
          goldItemId: l.goldItemId ?? '',
          weightG: String(Number(l.weightG)),
          quantity: String(l.quantity),
          goldPercent: l.goldPercent ? String(Number(l.goldPercent)) : '',
          deduction: Number(l.deduction) > 0 ? String(Number(l.deduction)) : '',
        }))
      : [
          {
            goldTypeId: row.goldTypeId ?? '',
            goldItemId: row.goldItemId ?? '',
            weightG: String(Number(row.weightG)),
            quantity: String(row.quantity),
            goldPercent: row.goldPercent ? String(Number(row.goldPercent)) : '',
            deduction: '',
          },
        ];

    const rowPayments: PaymentLine[] = row.payments?.length
      ? row.payments.map((p) => ({
          method: p.method,
          bankAccountId: p.bankAccountId ?? undefined,
          currency: p.currency as PaymentLine['currency'],
          amount: String(Number(p.amount)),
        }))
      : newPaymentLines();

    setEditingId(row.id);
    setPhone(row.customer.phone);
    setSource(nextSource);
    setLines(rowLines);
    setPayments(rowPayments);
    setError(null);
    setShowForm(true);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setPhone('');
    setSource('KPV');
    setLines([emptyLine()]);
    setPayments(newPaymentLines());
    setPreview(null);
    setError(null);
    setShowForm(true);
  };

  /** ແຖວທີ່ພ້ອມຄິດລາຄາ preview ພ້ອມ mapping ກັບ index ໃນຟອມ. */
  const readyEntries = lines
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => isLineReady(l, isBoiled));
  const readyLines = readyEntries.map(({ l }) => ({
    goldTypeId: l.goldTypeId,
    goldItemId: l.goldItemId || undefined,
    weightG: l.weightG.trim(),
    quantity: qty(l.quantity),
    goldPercent: l.goldPercent.trim() || undefined,
    deduction: l.deduction.trim() || undefined,
  }));
  const previewIndexByFormLine = new Map<number, number>(
    readyEntries.map((entry, previewIdx) => [entry.idx, previewIdx]),
  );
  const allLinesValid = lines.length > 0 && lines.every((l) => isLineReady(l, isBoiled));
  const linesKey = JSON.stringify(readyLines);

  /* Re-price whenever the inputs change. */
  useEffect(() => {
    const payloadLines = JSON.parse(linesKey) as typeof readyLines;
    if (payloadLines.length === 0) {
      setPreview(null);
      setIsPreviewing(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsPreviewing(true);
    const timer = setTimeout(() => {
      api
        .post<Preview>('/buyback/preview', { source, lines: payloadLines })
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
  }, [source, linesKey]);

  const invalidateAfterMutation = (includeLedgerAndCash = false) => {
    void queryClient.invalidateQueries({ queryKey: ['buyback'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (includeLedgerAndCash) {
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        phone,
        source,
        lines: readyLines,
        payments: paymentPayload(payments),
      };
      return editingId
        ? api.patch(`/buyback/${editingId}`, body)
        : api.post('/buyback', body);
    },
    onSuccess: () => {
      resetForm();
      toast.success('ດຳເນີນການສຳເລັດ');
      invalidateAfterMutation(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.post(`/buyback/${id}/confirm`),
    onSuccess: () => {
      setConfirmingRow(null);
      setError(null);
      toast.success('ດຳເນີນການສຳເລັດ');
      invalidateAfterMutation(true);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຢືນຢັນບໍ່ສຳເລັດ';
      setConfirmingRow(null);
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`/buyback/${id}/cancel`, { reason: reason?.trim() || undefined }),
    onSuccess: () => {
      setCancellingRow(null);
      setCancelReason('');
      setError(null);
      toast.success('ຍົກເລີກລາຍການສຳເລັດ');
      invalidateAfterMutation(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຍົກເລີກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/buyback/${id}`),
    onSuccess: () => {
      setDeletingRow(null);
      setError(null);
      toast.success('ລຶບລາຍການສຳເລັດ');
      invalidateAfterMutation(false);
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
      api.post(`/buyback/${id}/payments`, { payments: paymentPayload(settlePayments) }),
    onSuccess: () => {
      setSettlingRow(null);
      setSettlePayments(newPaymentLines());
      setError(null);
      toast.success('ຊຳລະຍອດຄ້າງຈ່າຍສຳເລັດ');
      invalidateAfterMutation(true);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຊຳລະບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  // ແຕ່ລະແຖວຈ່າຍຕ້ອງຄົບ: ແຖວໂອນ ຕ້ອງເລືອກທະນາຄານ ກ່ອນບັນທຶກໄດ້.
  const paymentLines = paymentPayload(payments);
  const bankLegReady = paymentLines.every((l) => l.method !== 'BANK' || Boolean(l.bankAccountId));
  const insufficientFundsError = useInsufficientFundsError(payments, showForm, 'ຊື້ຄຳຄືນ (Buyback)');
  const settlePaymentLines = paymentPayload(settlePayments);
  const settleBankReady = settlePaymentLines.every(
    (l) => l.method !== 'BANK' || Boolean(l.bankAccountId),
  );
  const settleInsufficientError = useInsufficientFundsError(
    settlePayments,
    Boolean(settlingRow && settlingRow.status === 'COMPLETED'),
    'ຊຳລະຄ້າງ Buyback',
  );

  const lakLegsTotal = paymentLines
    .filter((l) => l.currency === 'LAK')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const lakExceedsPayable = Boolean(
    preview && lakLegsTotal > Number(preview.payableAmount) + 0.0001,
  );

  const phoneValid = /^\d{8}$/.test(phone);
  const paymentReady =
    paymentLines.length > 0 && bankLegReady && !insufficientFundsError && !lakExceedsPayable;
  const canSave =
    hasOpenShift &&
    phoneValid &&
    allLinesValid &&
    readyLines.length === lines.length &&
    preview !== null &&
    Number(preview.payableAmount) > 0 &&
    paymentReady;

  const canManageRow = (row: BuybackRow) =>
    user?.role === 'ADMIN' || user?.role === 'MANAGER' || !row.createdById || row.createdById === user?.id;

  const viewingDetail: BuybackDetail | null = viewingRow
    ? (viewedDetail && viewedDetail.id === viewingRow.id ? viewedDetail : viewingRow)
    : null;

  return (
    <div className="space-y-6">
      <PageHead
        title="Buyback — ການຊື້ຄຳຄືນ"
        subtitle="ຄຳຮ້ານ KPV ແລະ ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ) — ສ້າງລາຍການສົ່ງໃຫ້ payment ອະນຸມັດ (TOR §5.1)"
        actions={
          <button type="button" className="btn-primary" onClick={openCreateForm}>
            + ສ້າງລາຍການ Buyback
          </button>
        }
      />
      {goldTypesFailed && <QueryErrorNotice error={goldTypesError} onRetry={() => void refetchGoldTypes()} />}
      {goldItemsFailed && <QueryErrorNotice error={goldItemsError} onRetry={() => void refetchGoldItems()} />}
      {banksFailed && <QueryErrorNotice error={banksError} onRetry={() => void refetchBanks()} />}

      {error && !showForm && (
        <div id="buyback-error" role="alert" className="notice status-danger">
          {error}
        </div>
      )}

      <Dialog
        open={showForm}
        onClose={resetForm}
        size="2xl"
        flushBody
        title={editingId ? 'ແກ້ໄຂລາຍການ Buyback' : 'ສ້າງລາຍການ Buyback'}
        subtitle="ບັນທຶກການຮັບຊື້ຄຳຄືນ ແລະ ຄຳນວນລາຄາອັດຕະໂນມັດ (§5.1)"
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" aria-label="ສະຖານະຄວາມພ້ອມ">
              <ReadinessPill ok={hasOpenShift} label={hasOpenShift ? 'ກະເປີດຢູ່' : 'ຍັງບໍ່ເປີດກະ'} />
              <ReadinessPill ok={phoneValid} label={`ເບີໂທ ${phone.length}/8`} />
              <ReadinessPill
                ok={allLinesValid && Boolean(preview && Number(preview.payableAmount) > 0)}
                label={`ຄຳ ${readyLines.length}/${lines.length} ແຖວ`}
              />
              <ReadinessPill ok={paymentReady} label="ການຈ່າຍເງິນ" />
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <button type="button" className="btn-secondary cursor-pointer" onClick={resetForm}>
                ຍົກເລີກ
              </button>
              <button
                type="button"
                className="btn-primary min-w-[190px] cursor-pointer"
                aria-describedby={error ? 'buyback-error-modal' : undefined}
                disabled={!canSave || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {saveMutation.isPending
                  ? 'ກຳລັງບັນທຶກ...'
                  : editingId
                  ? 'ບັນທຶກການແກ້ໄຂ'
                  : 'ຢືນຢັນສ້າງ Buyback'}
              </button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
          {/* ==========================================================
               LEFT COLUMN (7 cols): Step 1 (Customer & Source) + Step 2 (Gold Items)
               ========================================================== */}
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:col-span-7 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-line">
            {error && (
              <div id="buyback-error-modal" role="alert" className="notice status-danger shrink-0">
                {error}
              </div>
            )}

            {editingId && (
              <div className="notice status-warning shrink-0 text-xs">
                ກຳລັງແກ້ໄຂລາຍການ Buyback (ສະຖານະ PENDING) — ລາຄາຈະຖືກຄຳນວນໃໝ່ຕາມກະດານປັດຈຸບັນ
              </div>
            )}

            {!hasOpenShift && (
              <div role="alert" className="notice status-warning shrink-0 text-xs">
                ຍັງບໍ່ໄດ້ເປີດກະ — ກະລຸນາກົດ "ເປີດກະ" ຢູ່ແຖບດ້ານເທິງກ່ອນຈຶ່ງຈະບັນທຶກລາຍການ Buyback ໄດ້
              </div>
            )}

            {/* ── ຂັ້ນຕອນ 1: ຂໍ້ມູນລູກຄ້າ & ແຫຼ່ງທີ່ມາ ── */}
            <section className="shrink-0 space-y-3.5" aria-labelledby="buyback-step-1">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--gold-tint)] text-xs font-bold text-gold">
                  1
                </span>
                <h3 id="buyback-step-1" className="text-sm font-semibold text-fg-strong">
                  ຂໍ້ມູນລູກຄ້າ ແລະ ແຫຼ່ງທີ່ມາ
                </h3>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="label mb-0" htmlFor="phone">ເບີໂທລູກຄ້າ</label>
                    <span className={`num text-[11px] font-semibold ${phoneValid ? 'text-success' : 'text-muted'}`}>
                      {phone.length}/8
                    </span>
                  </div>
                  <div className="input-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                  <p className="mt-1 text-[11px] text-muted">
                    {phone.length === 0
                      ? 'ຕົວຢ່າງ: 20555123 (8 ໂຕ)'
                      : phoneValid
                      ? 'ເບີໂທຖືກຕ້ອງແລ້ວ'
                      : `ຍັງຂາດອີກ ${8 - phone.length} ໂຕ`}
                  </p>
                </div>

                <div className="sm:col-span-7">
                  <span className="label">ແຫຼ່ງທີ່ມາຂອງຄຳ</span>
                  <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="ແຫຼ່ງທີ່ມາຂອງຄຳ">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={source === 'KPV'}
                      onClick={() => handleSourceChange('KPV')}
                      className={`cursor-pointer rounded-xl border p-2.5 text-left transition-colors duration-150 ${
                        source === 'KPV'
                          ? 'border-[var(--border-active)] bg-[var(--gold-tint)]'
                          : 'recessed hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-strong">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                          ຄຳຮ້ານ KPV
                        </span>
                        {source === 'KPV' && (
                          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--gold)]" />
                        )}
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted">ຄຳດີ · ຄຳຫຍຸບ · ຄຳແທ່ງ</p>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={source === 'OTHER_SHOP'}
                      onClick={() => handleSourceChange('OTHER_SHOP')}
                      className={`cursor-pointer rounded-xl border p-2.5 text-left transition-colors duration-150 ${
                        source === 'OTHER_SHOP'
                          ? 'border-[var(--border-active)] bg-[var(--gold-tint)]'
                          : 'recessed hover:border-[var(--border-hover)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-strong">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                          </svg>
                          ຄຳຮ້ານອື່ນ
                        </span>
                        {source === 'OTHER_SHOP' && (
                          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--gold)]" />
                        )}
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted">ຄຳຕົ້ມ · ຄິດຕາມ %ຄຳ</p>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div className="divider shrink-0" aria-hidden="true" />

            {/* ── ຂັ້ນຕອນ 2: ລາຍການຄຳ ── */}
            <section
              className={lines.length > 1 ? 'flex min-h-0 flex-1 flex-col gap-3.5' : 'shrink-0 space-y-3.5'}
              aria-labelledby="buyback-step-2"
            >
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--gold-tint)] text-xs font-bold text-gold">
                    2
                  </span>
                  <h3 id="buyback-step-2" className="text-sm font-semibold text-fg-strong">
                    ລາຍການຄຳທີ່ຮັບຊື້
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
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  ເພີ່ມແຖວຄຳ
                </button>
              </div>

              <div
                ref={linesListRef}
                data-testid="buyback-lines-list"
                role={lines.length > 1 ? 'region' : undefined}
                aria-label={lines.length > 1 ? 'ລາຍການຄຳທີ່ຮັບຊື້' : undefined}
                className={
                  lines.length > 1
                    ? 'nav-scroll max-h-[380px] min-h-0 flex-1 space-y-3 overflow-y-auto pr-1.5 lg:min-h-[220px] lg:max-h-none'
                    : 'space-y-3'
                }
              >
                {lines.map((line, i) => {
                  const lineReady = isLineReady(line, isBoiled);
                  const pIdx = previewIndexByFormLine.get(i);
                  const linePreview = pIdx !== undefined ? preview?.lines?.[pIdx] : undefined;
                  const weightNum = Number(line.weightG);
                  const bahtText = weightNum > 0 ? gramsToBaht(line.weightG) : null;

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
                            {lineReady ? 'ພ້ອມຄຳນວນ' : 'ປ້ອນນ້ຳໜັກ'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="num text-sm font-bold text-fg-strong">
                            {linePreview ? `${formatLak(linePreview.payableAmount)} LAK` : '0 LAK'}
                          </span>
                          <button
                            type="button"
                            className="btn-ghost h-8 min-h-[32px] cursor-pointer px-2 text-xs text-danger"
                            disabled={lines.length === 1}
                            aria-label={`ລຶບແຖວທີ ${i + 1}`}
                            onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Row 1: Type & Item */}
                      <div className="mb-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <label className="label text-xs" htmlFor={`line-type-${i}`}>ປະເພດຄຳ</label>
                          <select
                            id={`line-type-${i}`}
                            className="input"
                            value={line.goldTypeId}
                            disabled={isBoiled && Boolean(boiledGoldType)}
                            onChange={(e) => setLine(i, { goldTypeId: e.target.value })}
                          >
                            {(!isBoiled || !boiledGoldType) && <option value="">— ເລືອກປະເພດຄຳ —</option>}
                            {selectableGoldTypes.map((t) => (
                              <option key={t.id} value={t.id}>
                                {isBoiled && t.code === 'BOILED' ? `${t.nameLo} (ອັດຕະໂນມັດ)` : t.nameLo}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="label text-xs" htmlFor={`line-item-${i}`}>ຮູບປະພັນ (ທາງເລືອກ)</label>
                          <select
                            id={`line-item-${i}`}
                            className="input"
                            value={line.goldItemId}
                            onChange={(e) => setLine(i, { goldItemId: e.target.value })}
                          >
                            <option value="">— ບໍ່ລະບຸ —</option>
                            {goldItems.map((it) => (
                              <option key={it.id} value={it.id}>{it.nameLo}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Weight, Qty, Deduction / % */}
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <div>
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <label className="label mb-0 text-xs" htmlFor={`line-weight-${i}`}>ນ້ຳໜັກ (g)</label>
                            {bahtText && bahtText !== '—' && (
                              <span className="num text-[10px] font-medium text-gold">≈ {bahtText} ບາດ</span>
                            )}
                          </div>
                          <NumberInput
                            id={`line-weight-${i}`}
                            decimals={4}
                            className="input num font-semibold"
                            placeholder="0.00"
                            value={line.weightG}
                            onValueChange={(v) => setLine(i, { weightG: v })}
                          />
                        </div>

                        <div>
                          <label className="label mb-1 text-xs" htmlFor={`line-qty-${i}`}>ຈຳນວນ (ຊິ້ນ)</label>
                          <input
                            id={`line-qty-${i}`}
                            className="input num"
                            type="number"
                            min={1}
                            placeholder="1"
                            value={line.quantity}
                            onChange={(e) => setLine(i, { quantity: e.target.value })}
                          />
                        </div>

                        {isBoiled ? (
                          <div>
                            <label className="label mb-1 text-xs" htmlFor={`line-pct-${i}`}>%ຄຳ (0-100)</label>
                            <NumberInput
                              id={`line-pct-${i}`}
                              decimals={2}
                              max={100}
                              className="input num"
                              placeholder="96.5"
                              value={line.goldPercent}
                              onValueChange={(v) => setLine(i, { goldPercent: v })}
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="label mb-1 text-xs" htmlFor={`line-ded-${i}`}>ຄ່າຫັກ/ຊິ້ນ</label>
                            <NumberInput
                              id={`line-ded-${i}`}
                              decimals={0}
                              className="input num"
                              placeholder="0"
                              value={line.deduction}
                              onValueChange={(v) => setLine(i, { deduction: v })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!allLinesValid && readyLines.length > 0 && (
                <div className="notice status-warning shrink-0 text-xs">
                  ມີແຖວທີ່ຍັງປ້ອນຂໍ້ມູນບໍ່ຄົບ — ກະລຸນາປ້ອນໃຫ້ຄົບທຸກແຖວ ຫຼື ລຶບແຖວທີ່ບໍ່ໃຊ້ອອກກ່ອນບັນທຶກ
                </div>
              )}
            </section>
          </div>

          {/* ==========================================================
               RIGHT COLUMN (5 cols): Receipt-Style Summary + Step 3 (Payment)
               ========================================================== */}
          <div className="nav-scroll flex flex-col justify-between bg-[var(--gold-tint)]/30 p-5 sm:p-6 lg:col-span-5 lg:min-h-0 lg:overflow-y-auto">
            <div className="space-y-5">
              {/* ── ສະຫຼຸບຍອດສຸດທິ (Receipt-Style Summary Card) ── */}
              <section aria-label="ຜົນການຄຳນວນ" className="summary-card rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between border-b border-[var(--row-line)] pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                    ສະຫຼຸບການຄຳນວນ (§5.1)
                  </span>
                  <span className="live-dot text-[11px]">
                    {isPreviewing ? 'ກຳລັງຄຳນວນ...' : 'ຄຳນວນສົດ'}
                  </span>
                </div>

                {/* Hero Payable Amount */}
                <div className="my-4">
                  <div className="text-xs text-muted">ລວມເງິນທີ່ຕ້ອງຈ່າຍໃຫ້ລູກຄ້າ</div>
                  <div className="num mt-0.5 text-3xl font-bold tracking-tight text-gold-gradient">
                    {preview ? `${formatLak(preview.payableAmount)} LAK` : '0 LAK'}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {preview
                      ? preview.lines.length === 1
                        ? preview.branch
                        : `ລວມທັງໝົດ ${preview.lines.length} ລາຍການ`
                      : 'ລໍຖ້າປ້ອນຂໍ້ມູນຄຳ'}
                  </div>
                </div>

                {/* Compact Metrics Grid */}
                <div className="recessed grid grid-cols-3 gap-2 rounded-xl p-3">
                  <div>
                    <div className="text-[11px] text-muted">ນ້ຳໜັກລວມ</div>
                    <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                      {preview ? `${formatWeight(preview.totalWeightG)} g` : '0 g'}
                    </div>
                    <div className="num text-[10px] text-muted">
                      {preview ? `≈ ${gramsToBaht(preview.totalWeightG)} ບາດ` : '0 ບາດ'}
                    </div>
                  </div>
                  <div className="border-l border-[var(--row-line)] pl-2.5">
                    <div className="text-[11px] text-muted">ຈຳນວນ</div>
                    <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                      {preview ? `${preview.totalQuantity} ຊິ້ນ` : '0 ຊິ້ນ'}
                    </div>
                    <div className="num text-[10px] text-muted">
                      {readyLines.length}/{lines.length} ແຖວ
                    </div>
                  </div>
                  <div className="border-l border-[var(--row-line)] pl-2.5">
                    <div className="text-[11px] text-muted">ຄ່າຫັກລວມ</div>
                    <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                      {preview
                        ? formatLak(
                            preview.lines.reduce(
                              (sum, l) => sum + Number(l.deduction) * l.quantity,
                              0,
                            ),
                          )
                        : '0'}
                    </div>
                    <div className="num text-[10px] text-muted">LAK</div>
                  </div>
                </div>
              </section>

              {/* ── ຂັ້ນຕອນ 3: ການຈ່າຍເງິນ ── */}
              <section className="space-y-3" aria-labelledby="buyback-step-3">
                <MultiPayment
                  compact
                  lines={payments}
                  onChange={setPayments}
                  owedLak={preview?.payableAmount}
                  direction="out"
                  headerSlot={
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-active)] bg-[var(--gold-tint)] text-xs font-bold text-gold">
                        3
                      </span>
                      <h3 id="buyback-step-3" className="text-sm font-semibold text-fg-strong">ການຈ່າຍເງິນ</h3>
                    </div>
                  }
                />
              </section>
            </div>
          </div>
        </div>
      </Dialog>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ Buyback</h2>
          <span className="num text-xs text-muted">
            {filteredRows.length === rows.length
              ? `${rows.length} ລາຍການ`
              : `${filteredRows.length} / ${rows.length} ລາຍການ`}
          </span>
        </div>
        <OrderFilterBar
          history={history}
          search={searchFilter}
          searchPlaceholder="ຄົ້ນຫາ ລະຫັດລາຍການ (BB-...) / ເບີໂທລູກຄ້າ..."
          statusSlot={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <BuybackFilterDropdown
                id="buyback-status-filter"
                label="ສະຖານະ"
                value={statusFilter}
                options={BUYBACK_STATUS_FILTER_OPTIONS}
                onChange={setStatusFilter}
                minWidthClass="min-w-[175px]"
              />
              <BuybackFilterDropdown
                id="buyback-source-filter"
                label="ແຫຼ່ງຄຳ"
                value={sourceFilter}
                options={BUYBACK_SOURCE_FILTER_OPTIONS}
                onChange={setSourceFilter}
                minWidthClass="min-w-[185px]"
              />
              {(statusFilter || sourceFilter) && (
                <button
                  type="button"
                  className="filter-clear cursor-pointer text-xs"
                  onClick={() => {
                    setStatusFilter('');
                    setSourceFilter('');
                  }}
                >
                  ລ້າງຕົວກອງ
                </button>
              )}
            </div>
          }
        />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Buyback">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ / ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ແຫຼ່ງຄຳ / ປະເພດຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ / ຈຳນວນ</th>
                <th className="text-right">ຍອດຕ້ອງຈ່າຍ (LAK)</th>
                <th className="text-right">ຄ້າງຈ່າຍ (LAK)</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={9}
                isLoading={history.isLoading}
                isError={rowsFailed}
                error={rowsError}
                isEmpty={filteredRows.length === 0}
                emptyText={
                  searchFilter.hasActiveFilter || statusFilter || sourceFilter
                    ? 'ບໍ່ພົບລາຍການທີ່ກອງ'
                    : 'ຍັງບໍ່ມີລາຍການ'
                }
                onRetry={() => void refetchRows()}
              />
              {pager.pageItems.map((row) => {
                const canAct = canManageRow(row);
                const hasOutstanding = Number(row.outstandingAmount) > 0;
                const extraLineCount = (row.lines?.length ?? 0) > 1 ? row.lines!.length - 1 : 0;
                const bahtText = gramsToBaht(row.weightG);
                const paymentSummary = summarizeBuybackPayments(row.payments);
                const showUpdatedBy = Boolean(row.updatedBy && row.updatedBy !== row.createdBy);

                return (
                <tr key={row.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-fg-strong">{row.code}</span>
                      {extraLineCount > 0 && (
                        <span className="rounded-full border border-line bg-recessed px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {row.lines!.length} ລາຍການ
                        </span>
                      )}
                    </div>
                    <div className="num mt-0.5 text-[11px] text-muted">{formatDateTime(row.createdAt)}</div>
                  </td>
                  <td className="num font-medium text-fg">{row.customer.phone}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                          row.source === 'KPV'
                            ? 'border-[var(--border-active)] bg-[var(--gold-tint)] text-gold'
                            : 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-warning'
                        }`}
                      >
                        {row.source === 'KPV' ? 'ຄຳຮ້ານ KPV' : 'ຄຳຮ້ານອື່ນ'}
                      </span>
                      {row.goldPercent && (
                        <span className="num rounded bg-recessed px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {Number(row.goldPercent)}%
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-fg">
                      <span className="font-medium">{row.goldType.nameLo}</span>
                      {extraLineCount === 0 && row.goldItem?.nameLo && (
                        <span className="text-muted">· {row.goldItem.nameLo}</span>
                      )}
                      {extraLineCount > 0 && (
                        <span className="text-[11px] text-muted">+{extraLineCount} ອື່ນໆ</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="num font-semibold text-fg-strong">{formatWeight(row.weightG)} g</div>
                    <div className="num mt-0.5 text-[11px] text-muted">
                      {bahtText} ບາດ · {row.quantity} ຊິ້ນ
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="num font-semibold text-fg-strong">{formatLak(row.payableAmount)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{paymentSummary}</div>
                  </td>
                  <td className="text-right">
                    {hasOutstanding ? (
                      <span className="num inline-flex items-center rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2 py-0.5 text-xs font-semibold text-danger">
                        {formatLak(row.outstandingAmount)}
                      </span>
                    ) : (
                      <span className="num text-xs text-muted">0</span>
                    )}
                  </td>
                  <td>
                    <span className={statusClass(row.status)}>
                      {STATUS_LABEL[row.status]?.lo ?? row.status}
                    </span>
                  </td>
                  <td>
                    <div className="text-xs font-medium text-fg">{row.createdBy ?? '—'}</div>
                    {showUpdatedBy && (
                      <div className="mt-0.5 text-[11px] text-muted">ແກ້ໄຂ: {row.updatedBy}</div>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                      {row.status === 'APPROVED' && canConfirm && (
                        <button
                          type="button"
                          className="btn-primary !h-8 !min-h-0 !px-3 text-xs"
                          onClick={() => setConfirmingRow(row)}
                          disabled={confirmMutation.isPending || !hasOpenShift}
                        >
                          ຢືນຢັນ
                        </button>
                      )}
                      {(row.status === 'APPROVED' || row.status === 'COMPLETED') && hasOutstanding && (
                        <button
                          type="button"
                          className="btn-secondary !h-8 !min-h-0 !px-2.5 text-xs"
                          onClick={() => {
                            setSettlingRow(row);
                            setSettlePayments(newPaymentLines());
                          }}
                        >
                          ຈ່າຍຄ້າງ
                        </button>
                      )}
                      <div className="ml-0.5 flex items-center gap-0.5 border-l border-line/60 pl-1.5">
                        <button
                          type="button"
                          className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-1.5 text-muted transition-colors hover:bg-line/40 hover:text-fg"
                          title="ເບິ່ງລາຍລະອຽດ"
                          aria-label={`View ${row.code}`}
                          onClick={() => setViewingRow(row)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        {row.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-1.5 text-muted transition-colors hover:bg-line/40 hover:text-fg"
                            title="ພິມໃບບິນ"
                            aria-label={`ພິມ ${row.code}`}
                            onClick={() => setPrintingRow(row)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="6 9 6 2 18 2 18 9" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <rect x="6" y="14" width="12" height="8" />
                            </svg>
                          </button>
                        )}
                        {row.status === 'PENDING' && canAct && (
                          <button
                            type="button"
                            className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-1.5 text-[var(--gold)] transition-colors hover:bg-[var(--gold-tint)]"
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
                        {(row.status === 'PENDING' || row.status === 'APPROVED') && canAct && (
                          <button
                            type="button"
                            className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-1.5 text-danger transition-colors hover:bg-[var(--danger-bg)]"
                            title="ຍົກເລີກລາຍການ"
                            aria-label={`ຍົກເລີກ ${row.code}`}
                            onClick={() => {
                              setCancellingRow(row);
                              setCancelReason('');
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="15" y1="9" x2="9" y2="15" />
                              <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                          </button>
                        )}
                        {(row.status === 'PENDING' || row.status === 'REJECTED' || row.status === 'CANCELLED') && canAct && (
                          <button
                            type="button"
                            className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-1.5 text-danger transition-colors hover:bg-[var(--danger-bg)]"
                            title="ລຶບລາຍການ"
                            aria-label={`ລຶບ ${row.code}`}
                            onClick={() => setDeletingRow(row)}
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

      {/* ── Dialog ລາຍລະອຽດ Buyback (View Detail) ── */}
      <Dialog
        open={Boolean(viewingDetail)}
        onClose={() => setViewingRow(null)}
        title={`ລາຍລະອຽດ Buyback — ${viewingDetail?.code ?? ''}`}
        subtitle={
          viewingDetail
            ? `${viewingDetail.source === 'KPV' ? 'ຄຳຮ້ານ KPV' : 'ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ)'} · ເບີໂທ ${viewingDetail.customer.phone}`
            : undefined
        }
        size="lg"
        dismissOnScrim
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted">
              {viewingDetail && (
                <>
                  ສ້າງເມື່ອ: <span className="num font-medium text-fg">{formatDateTime(viewingDetail.createdAt)}</span>
                  {' · '}ບັນທຶກໂດຍ: <span className="font-medium text-fg">{viewingDetail.createdBy ?? '—'}</span>
                  {viewingDetail.updatedBy && viewingDetail.updatedBy !== viewingDetail.createdBy && (
                    <> · ແກ້ໄຂ: <span className="font-medium text-fg">{viewingDetail.updatedBy}</span></>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {viewingDetail && viewingDetail.status !== 'CANCELLED' && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setPrintingRow(viewingDetail)}
                >
                  ພິມໃບບິນ
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => setViewingRow(null)}
              >
                ປິດ
              </button>
            </div>
          </div>
        }
      >
        {viewingDetail && (() => {
          const detailLines = viewingDetail.lines ?? [];
          const detailPayments = viewingDetail.payments ?? [];
          const payableNum = Number(viewingDetail.payableAmount) || 0;
          const outstandingNum = Number(viewingDetail.outstandingAmount) || 0;
          const paidVal = viewingDetail.paidAmount ?? String(Math.max(0, payableNum - outstandingNum));
          const detailHasOutstanding = outstandingNum > 0;
          const detailBaht = gramsToBaht(viewingDetail.weightG);

          return (
            <div className="space-y-4">
              {viewingDetail.rejectReason && (
                <div className="notice status-danger text-xs">
                  ເຫດຜົນປະຕິເສດ / ຍົກເລີກ: <b>{viewingDetail.rejectReason}</b>
                </div>
              )}

              {/* 1. ຂໍ້ມູນທົ່ວໄປ */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-recessed p-3.5 sm:grid-cols-4">
                <div>
                  <div className="text-[11px] text-muted">ເບີໂທລູກຄ້າ</div>
                  <div className="num mt-0.5 text-sm font-semibold text-fg-strong">{viewingDetail.customer.phone}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">ແຫຼ່ງຄຳ</div>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                        viewingDetail.source === 'KPV'
                          ? 'border-[var(--border-active)] bg-[var(--gold-tint)] text-gold'
                          : 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-warning'
                      }`}
                    >
                      {viewingDetail.source === 'KPV' ? 'ຄຳຮ້ານ KPV' : 'ຄຳຮ້ານອື່ນ'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">ນ້ຳໜັກ / ຈຳນວນລວມ</div>
                  <div className="num mt-0.5 text-sm font-semibold text-fg-strong">
                    {formatWeight(viewingDetail.weightG)} g
                  </div>
                  <div className="num text-[11px] text-muted">
                    {detailBaht} ບາດ · {viewingDetail.quantity} ຊິ້ນ
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">ສະຖານະ</div>
                  <div className="mt-1">
                    <span className={statusClass(viewingDetail.status)}>
                      {STATUS_LABEL[viewingDetail.status]?.lo ?? viewingDetail.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. ສະຫຼຸບຍອດເງິນ */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-recessed/60 p-3.5">
                  <div className="text-xs text-muted">ລວມເງິນທີ່ຕ້ອງຈ່າຍ</div>
                  <div className="num mt-1 text-lg font-bold text-fg-strong">
                    {formatLak(viewingDetail.payableAmount)} LAK
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-recessed/60 p-3.5">
                  <div className="text-xs text-muted">ຈ່າຍແລ້ວ</div>
                  <div className="num mt-1 text-lg font-bold text-success">
                    {formatLak(paidVal)} LAK
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-recessed/60 p-3.5">
                  <div className="text-xs text-muted">ຍອດຄ້າງຈ່າຍ</div>
                  <div className={`num mt-1 text-lg font-bold ${detailHasOutstanding ? 'text-danger' : 'text-fg-strong'}`}>
                    {formatLak(viewingDetail.outstandingAmount)} LAK
                  </div>
                </div>
              </div>

              {/* 3. ລາຍການຄຳໃນບິນ */}
              <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gold">ລາຍການຄຳໃນບິນ</div>
                  <span className="num text-xs text-muted">
                    {Math.max(1, detailLines.length)} ລາຍການ
                  </span>
                </div>
                <div className="table-wrap rounded-lg border border-line bg-surface">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>ປະເພດຄຳ</th>
                        <th>ລາຍການຄຳ</th>
                        <th className="text-right">ນ້ຳໜັກ (g)</th>
                        <th className="text-right">ຈຳນວນ</th>
                        <th className="text-right">%ຄຳ</th>
                        <th className="text-right">ລາຄາທີ່ຕ້ອງຈ່າຍ</th>
                        <th>ສູດທີ່ໃຊ້</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailLines.length === 0 ? (
                        <tr>
                          {/* ບິນເກົ່າກ່ອນມີຕາຕະລາງແຖວ — ສະແດງຈາກຫົວບິນ. */}
                          <td>{viewingDetail.goldType.nameLo}</td>
                          <td>{viewingDetail.goldItem?.nameLo ?? '—'}</td>
                          <td className="num text-right">{formatWeight(viewingDetail.weightG)}</td>
                          <td className="num text-right">{viewingDetail.quantity}</td>
                          <td className="num text-right">
                            {viewingDetail.goldPercent ? `${Number(viewingDetail.goldPercent)}%` : '—'}
                          </td>
                          <td className="num text-right font-medium">{formatLak(viewingDetail.payableAmount)}</td>
                          <td className="text-muted">—</td>
                        </tr>
                      ) : (
                        detailLines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.goldType.nameLo}</td>
                            <td>{line.goldItem?.nameLo ?? '—'}</td>
                            <td className="num text-right">{formatWeight(line.weightG)}</td>
                            <td className="num text-right">{line.quantity}</td>
                            <td className="num text-right">
                              {line.goldPercent ? `${Number(line.goldPercent)}%` : '—'}
                            </td>
                            <td className="num text-right font-medium">{formatLak(line.payableAmount)}</td>
                            <td className="text-muted">{line.branch ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. ລາຍລະອຽດ payment */}
              <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gold">ລາຍລະອຽດ payment</div>
                  <span className="num text-xs text-muted">{detailPayments.length} ຊ່ອງທາງ</span>
                </div>
                <div className="table-wrap rounded-lg border border-line bg-surface">
                  <table className="table text-xs">
                    <thead>
                      <tr>
                        <th>ຮູບແບບຈ່າຍ</th>
                        <th>ສະກຸນເງິນ</th>
                        <th className="text-right">ຈຳນວນ</th>
                        <th className="text-right">= LAK</th>
                        <th className="text-right">ເງິນທອນ (LAK)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailPayments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-muted">
                            ຍັງບໍ່ມີຂໍ້ມູນການຊຳລະ
                          </td>
                        </tr>
                      ) : (
                        detailPayments.map((pmt) => (
                          <tr key={pmt.id}>
                            <td>
                              {METHOD_LABEL[pmt.method] ?? pmt.method}
                              {pmt.method === 'BANK' && (
                                <span className="text-muted"> — {pmt.bankAccount?.nameLo ?? '—'}</span>
                              )}
                            </td>
                            <td>
                              <span className="rounded border border-line bg-recessed px-2 py-0.5 text-[11px] font-semibold text-fg">
                                {pmt.currency}
                              </span>
                            </td>
                            <td className="num text-right font-medium">{formatByCurrency(pmt.amount, pmt.currency)}</td>
                            <td className="num text-right">{formatLak(pmt.amountLak)}</td>
                            <td className="num text-right">{formatLak(pmt.changeLak)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 5. ປະຫວັດການດຳເນີນການ (Timeline) */}
              <BuybackTimeline
                status={viewingDetail.status}
                createdAt={viewingDetail.createdAt}
                createdBy={viewingDetail.createdBy}
                updatedBy={viewingDetail.updatedBy}
                approvedAt={viewingDetail.approvedAt}
                confirmedAt={viewingDetail.confirmedAt}
                rejectReason={viewingDetail.rejectReason}
                audits={viewingDetail.audits}
                isLoadingAudits={detailLoading}
              />
            </div>
          );
        })()}
      </Dialog>

      {/* ── Dialog ຢືນຢັນ Buyback (COMPLETED) ── */}
      <Dialog
        open={Boolean(confirmingRow)}
        onClose={() => setConfirmingRow(null)}
        title={`ຢືນຢັນລາຍການ Buyback ${confirmingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConfirmingRow(null)}>
              ປິດ
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={confirmMutation.isPending || !hasOpenShift}
              onClick={() => confirmingRow && confirmMutation.mutate(confirmingRow.id)}
            >
              {confirmMutation.isPending ? 'ກຳລັງຢືນຢັນ...' : 'ຢືນຢັນການຈ່າຍ ແລະ ຮັບຄຳ'}
            </button>
          </div>
        }
      >
        {confirmingRow && (
          <div className="space-y-3 text-sm">
            {!hasOpenShift && (
              <div className="notice status-warning text-xs">
                ຕ້ອງເປີດກະກ່ອນຈຶ່ງຈະຢືນຢັນລາຍການໄດ້
              </div>
            )}
            <p>
              ການຢືນຢັນຈະຕັດຍອດເງິນອອກຈາກລະບົບ ແລະ ບັນທຶກຄຳເຂົ້າ Stock (OLD) ທັນທີ:
            </p>
            <div className="recessed rounded-lg p-3 space-y-1 text-xs">
              <div>ເບີໂທລູກຄ້າ: <b className="num">{confirmingRow.customer.phone}</b></div>
              <div>ນ້ຳໜັກລວມ: <b className="num">{formatWeight(confirmingRow.weightG)} g</b></div>
              <div>ລວມເງິນທີ່ຕ້ອງຈ່າຍ: <b className="num">{formatLak(confirmingRow.payableAmount)} LAK</b></div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ── Dialog ຍົກເລີກ Buyback ── */}
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
          <label className="label" htmlFor="cancel-reason">ເຫດຜົນການຍົກເລີກ (ຖ້ามี)</label>
          <input
            id="cancel-reason"
            className="input"
            maxLength={300}
            placeholder="ເຊັ່ນ: ປ້ອນນ້ຳໜັກຜິດ ຫຼື ລູກຄ້າປ່ຽນໃຈ"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </div>
      </Dialog>

      {/* ── Dialog ລຶບ Buyback ── */}
      <Dialog
        open={Boolean(deletingRow)}
        onClose={() => setDeletingRow(null)}
        title={`ລຶບລາຍການ ${deletingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDeletingRow(null)}>
              ປິດ
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
        <p className="text-sm">
          ທ່ານຕ້ອງການລຶບລາຍການ <b className="font-mono">{deletingRow?.code}</b> ຫຼື ບໍ່? (ສາມາດກວດຄືນໄດ້ໃນ Deleted List)
        </p>
      </Dialog>

      {/* ── Dialog ຊຳລະຍອດຄ້າງຈ່າຍ ── */}
      <Dialog
        open={Boolean(settlingRow)}
        onClose={() => setSettlingRow(null)}
        size="lg"
        title={`ຊຳລະຍອດຄ້າງຈ່າຍ — ${settlingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSettlingRow(null)}>
              ປິດ
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={
                settleMutation.isPending ||
                !hasOpenShift ||
                settlePaymentLines.length === 0 ||
                !settleBankReady ||
                Boolean(settleInsufficientError)
              }
              onClick={() => settlingRow && settleMutation.mutate(settlingRow.id)}
            >
              {settleMutation.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກການຊຳລະ'}
            </button>
          </div>
        }
      >
        {settlingRow && (
          <div className="space-y-4">
            <div className="recessed rounded-lg p-3 text-sm">
              ຍອດຄ້າງຈ່າຍ: <b className="num">{formatLak(settlingRow.outstandingAmount)} LAK</b>
            </div>
            <MultiPayment
              lines={settlePayments}
              onChange={setSettlePayments}
              owedLak={settlingRow.outstandingAmount}
              direction="out"
              labelLo="ຊຳລະເພີ່ມ — ສົດ / ໂອນ"
            />
          </div>
        )}
      </Dialog>

      {/* ── ຕົວຢ່າງໃບພິມ Buyback ── */}
      <PrintSheet open={Boolean(printingRow)} onClose={() => setPrintingRow(null)}>
        {printingRow && (
          <div className="space-y-4">
            <div className="sheet-head">
              <div>
                <h2>ໃບຮັບຊື້ຄຳຄືນ (Buyback)</h2>
                <div className="text-xs">ຮ້ານຄຳພູວົງ · KHAMPHOUVONG</div>
              </div>
              <div className="text-right text-xs">
                ລະຫັດ: <b className="font-mono">{printingRow.code}</b>
                <br />
                ວັນທີ: <b>{formatDateTime(printingRow.createdAt)}</b>
                <br />
                ເບີໂທລູກຄ້າ: <b className="num">{printingRow.customer.phone}</b>
              </div>
            </div>

            <div className="text-xs">
              ປະເພດທຸລະກຳ: <b>{printingRow.source === 'KPV' ? 'ຄຳຮ້ານ KPV' : 'ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ)'}</b> ·
              ສະຖານະ: <b>{STATUS_LABEL[printingRow.status]?.lo ?? printingRow.status}</b>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ປະເພດຄຳ</th>
                  <th>ລາຍການຄຳ</th>
                  <th className="text-right">ນ້ຳໜັກ (g)</th>
                  <th className="text-right">ຈຳນວນ</th>
                  <th className="text-right">%ຄຳ</th>
                  <th className="text-right">ລາຄາທີ່ຕ້ອງຈ່າຍ (LAK)</th>
                </tr>
              </thead>
              <tbody>
                {(printingRow.lines ?? []).length === 0 ? (
                  <tr>
                    <td>1</td>
                    <td>{printingRow.goldType.nameLo}</td>
                    <td>{printingRow.goldItem?.nameLo ?? '—'}</td>
                    <td className="num text-right">{formatWeight(printingRow.weightG)}</td>
                    <td className="num text-right">{printingRow.quantity}</td>
                    <td className="num text-right">
                      {printingRow.goldPercent ? `${Number(printingRow.goldPercent)}%` : '—'}
                    </td>
                    <td className="num text-right">{formatLak(printingRow.payableAmount)}</td>
                  </tr>
                ) : (
                  (printingRow.lines ?? []).map((l, idx) => (
                    <tr key={l.id}>
                      <td>{idx + 1}</td>
                      <td>{l.goldType.nameLo}</td>
                      <td>{l.goldItem?.nameLo ?? '—'}</td>
                      <td className="num text-right">{formatWeight(l.weightG)}</td>
                      <td className="num text-right">{l.quantity}</td>
                      <td className="num text-right">
                        {l.goldPercent ? `${Number(l.goldPercent)}%` : '—'}
                      </td>
                      <td className="num text-right">{formatLak(l.payableAmount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="font-medium">ລວມທັງໝົດ</td>
                  <td className="num text-right font-medium">{formatWeight(printingRow.weightG)}</td>
                  <td className="num text-right font-medium">{printingRow.quantity}</td>
                  <td className="text-right">—</td>
                  <td className="num text-right font-medium">{formatLak(printingRow.payableAmount)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="text-xs">
              ການຊຳລະ: {(printingRow.payments ?? []).map((p) =>
                `${METHOD_LABEL[p.method] ?? p.method}${p.bankAccount ? ` (${p.bankAccount.nameLo})` : ''}: ${formatByCurrency(p.amount, p.currency)} ${p.currency}`
              ).join(' · ') || '—'}
            </div>

            <div className="sheet-sign">
              <div>ຜູ້ປະເມີນ ({printingRow.createdBy ?? '—'})</div>
              <div>ຜູ້ອະນຸມັດ ({printingRow.updatedBy})</div>
              <div>ລູກຄ້າ ({printingRow.customer.phone})</div>
            </div>
          </div>
        )}
      </PrintSheet>
    </div>
  );
}

function ReadinessPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`num text-[11px] ${ok ? 'status-success' : 'badge recessed text-muted'}`}>
      {label}
    </span>
  );
}

/** Dropdown ກອງຂໍ້ມູນແບບ Radix ສຳລັບແຖບກອງປະຫວັດ Buyback. */
function BuybackFilterDropdown({
  id,
  label,
  value,
  options,
  onChange,
  minWidthClass = 'min-w-[180px]',
}: {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (next: string) => void;
  minWidthClass?: string;
}) {
  const labelId = `${id}-label`;
  const activeOption = options.find((opt) => opt.value === value) ?? options[0];
  const isFiltered = value !== '';

  return (
    <div className="flex items-center gap-2">
      <span className="filter-select-label" id={labelId}>
        {label}
      </span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            id={id}
            aria-labelledby={labelId}
            className={`filter-date group inline-flex ${minWidthClass} items-center justify-between gap-2.5 pr-3 text-left cursor-pointer transition-colors ${
              isFiltered ? '!border-[var(--border-active)] !bg-[var(--gold-tint)]' : ''
            }`}
          >
            <span className="inline-flex items-center gap-2 truncate">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: activeOption.dotColor }}
              />
              <span className={`truncate font-medium ${isFiltered ? 'text-gold' : 'text-fg'}`}>
                {activeOption.labelLo}
              </span>
            </span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-[var(--gold-icon)] transition-transform duration-150 group-data-[state=open]:rotate-180"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="menu-panel z-50 min-w-[220px] p-1.5"
          >
            <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
              {options.map((opt) => {
                const active = value === opt.value;
                return (
                  <DropdownMenu.RadioItem
                    key={opt.value || 'ALL'}
                    value={opt.value}
                    className={`flex min-h-[38px] cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-1.5 text-sm outline-none transition-colors ${
                      active
                        ? 'bg-[var(--gold-tint)] font-semibold text-[var(--gold)]'
                        : 'text-fg data-[highlighted]:bg-[var(--row-hover)] data-[highlighted]:text-fg-strong'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2.5 truncate">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: opt.dotColor }}
                      />
                      <span className="truncate">{opt.labelLo}</span>
                    </span>
                    {active && (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 text-[var(--gold)]"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </DropdownMenu.RadioItem>
                );
              })}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
