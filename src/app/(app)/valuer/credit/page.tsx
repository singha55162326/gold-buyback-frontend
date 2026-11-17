'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec } from '@kpv/domain';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime, formatByCurrency } from '@/lib/format';
import { statusClass } from '@/lib/status';
import { useRealtimeInvalidate } from '@/lib/realtime';
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
  CREDIT_CHANGE_LIMITS,
  creditApi,
  creditKeys,
  validateCreditReceipts,
  type CreditDetail,
  type CreditRow,
  type CreditStatus,
} from '@/services/credit.service';

interface GoldItem { id: string; nameLo: string }
interface Cabinet { id: string; nameLo: string }
interface Shift { id: string; status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED' | 'REJECTED' }

const STATUS_LABEL: Record<CreditStatus, { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ — ຕິດໜີ້' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ຊຳຣະຄົບ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

const REALTIME_KEYS = ['credit', 'cash', 'notifications'] as const;

const cleanDecimal = (s: string) => s.replace(/,/g, '').trim();
const isNonNegDecimal = (s: string) => /^\d+(\.\d+)?$/.test(s);

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

  // The history is the landing view; the form opens on demand.
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [goldItemId, setGoldItemId] = useState('');
  const [cabinetId, setCabinetId] = useState('');
  const [weightG, setWeightG] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [sellPrice, setSellPrice] = useState('');
  const [downPayment, setDownPayment] = useState('');
  // ເງິນວາງດາວ may arrive as several legs — ສົດ and ໂອນ, more than one
  // currency — so the form holds a list rather than one method/currency pair.
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [error, setError] = useState<string | null>(null);

  // History filters & action dialogs
  const [statusFilter, setStatusFilter] = useState<string>('');
  const searchFilter = useOrderSearchFilter();
  const [viewingRow, setViewingRow] = useState<CreditRow | null>(null);
  const [instalment, setInstalment] = useState<CreditRow | null>(null);
  const [instalmentPayments, setInstalmentPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [cancellingRow, setCancellingRow] = useState<CreditRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [deletingRow, setDeletingRow] = useState<CreditRow | null>(null);

  const { data: shift } = useQuery({
    queryKey: ['shift', 'me'],
    queryFn: () => api.get<Shift | null>('/shifts/me'),
  });
  const hasOpenShift = shift?.status === 'OPEN';

  const { data: rates } = useQuery({
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

  const historyParams = useMemo(
    () => ({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(searchFilter.debouncedSearch ? { search: searchFilter.debouncedSearch } : {}),
    }),
    [statusFilter, searchFilter.debouncedSearch],
  );

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<CreditRow>(creditKeys.all, '/credit', { params: historyParams });
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
    setGoldItemId('');
    setCabinetId('');
    setWeightG('');
    setQuantity(1);
    setSellPrice('');
    setDownPayment('');
    setPayments(newPaymentLines());
    setError(null);
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
        amount: String(Number(r.amount)),
      }));

    setEditingId(row.id);
    setPhone(row.customer.phone);
    setGoldItemId(row.goldItemId ?? row.goldItem?.id ?? '');
    setCabinetId(row.cabinetId ?? row.cabinet?.id ?? '');
    setWeightG(String(Number(row.weightG)));
    setQuantity(row.quantity);
    setSellPrice(String(Number(row.sellPrice)));
    setDownPayment(String(Number(row.downPayment)));
    setPayments(downLines.length > 0 ? downLines : newPaymentLines());
    setError(null);
    setShowForm(true);
  };

  const invalidate = (includeLedgerAndCash = false) => {
    void queryClient.invalidateQueries({ queryKey: creditKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (includeLedgerAndCash) {
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
    }
  };

  const cleanSellPrice = cleanDecimal(sellPrice);
  const cleanDownPayment = cleanDecimal(downPayment);
  const cleanWeightG = cleanDecimal(weightG);

  /** ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ */
  const outstanding = useMemo(() => {
    if (!isNonNegDecimal(cleanSellPrice) || Number(cleanSellPrice) <= 0) return null;
    if (!isNonNegDecimal(cleanDownPayment)) return null;
    const result = dec(cleanSellPrice).minus(dec(cleanDownPayment));
    return result.isNegative() ? null : result.toFixed();
  }, [cleanSellPrice, cleanDownPayment]);

  const downReceiptCheck = useMemo(() => {
    const owed = isNonNegDecimal(cleanDownPayment) ? Number(cleanDownPayment) : 0;
    return validateCreditReceipts(payments, owed, rates, {
      allowEmptyWhenZero: true,
      requireCoverOwed: true,
    });
  }, [payments, cleanDownPayment, rates]);

  const instalmentCheck = useMemo(() => {
    if (!instalment) return { ok: false, error: null };
    return validateCreditReceipts(instalmentPayments, Number(instalment.outstanding), rates, {
      allowEmptyWhenZero: false,
      requireCoverOwed: false,
    });
  }, [instalment, instalmentPayments, rates]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        phone,
        goldItemId,
        cabinetId: cabinetId || undefined,
        weightG: cleanWeightG,
        quantity,
        sellPrice: cleanSellPrice,
        downPayment: cleanDownPayment,
        receipts: paymentPayload(payments),
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
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (credit: CreditRow) =>
      creditApi.addReceipt(credit.id, paymentPayload(instalmentPayments)),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setInstalment(null);
      setInstalmentPayments(newPaymentLines());
      setError(null);
      invalidate(true);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຮັບເງິນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => creditApi.cancel(id, reason),
    onSuccess: () => {
      setCancellingRow(null);
      setCancelReason('');
      setError(null);
      toast.success('ຍົກເລີກລາຍການສຳເລັດ');
      invalidate(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຍົກເລີກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => creditApi.remove(id),
    onSuccess: () => {
      setDeletingRow(null);
      setError(null);
      toast.success('ລຶບລາຍການສຳເລັດ');
      invalidate(false);
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ລຶບບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const canSave =
    (editingId ? true : hasOpenShift) &&
    /^\d{8}$/.test(phone) &&
    Boolean(goldItemId) &&
    isNonNegDecimal(cleanWeightG) &&
    Number(cleanWeightG) > 0 &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    outstanding !== null &&
    downReceiptCheck.ok;

  const detailRow: CreditDetail | CreditRow | null = viewedDetail ?? viewingRow;

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການສິນເຊື່ອ"
        subtitle="ຂາຍຄຳແບບວາງດາວ — ຍອດຕິດໜີ້ບັນທຶກເປັນ AR (Cash) ຫຼັງ payment ອະນຸມັດ (TOR §5.3)"
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn-primary"
              onClick={openCreateForm}
            >
              + ສ້າງລາຍການສິນເຊື່ອ
            </button>
          ) : undefined
        }
      />

      {!hasOpenShift && (
        <div role="status" className="notice status-warning text-sm">
          ກະຍັງບໍ່ໄດ້ເປີດ — ກະລຸນາກົດ "ເປີດກະ" ກ່ອນສ້າງລາຍການສິນເຊື່ອ ຫຼື ຮັບຄ່າງວດ
        </div>
      )}

      {goldItemsFailed && <QueryErrorNotice error={goldItemsError} onRetry={() => void refetchGoldItems()} />}
      {cabinetsFailed && <QueryErrorNotice error={cabinetsError} onRetry={() => void refetchCabinets()} />}

      {error && !showForm && !instalment && !cancellingRow && !deletingRow && (
        <div id="credit-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {/* ── Modal ຟອມສ້າງ / ແກ້ໄຂ ລາຍການສິນເຊື່ອ ── */}
      <Dialog
        open={showForm && canCreate}
        onClose={() => {
          if (!saveMutation.isPending) resetForm();
        }}
        title={editingId ? 'ແກ້ໄຂລາຍການສິນເຊື່ອ' : 'ສ້າງລາຍການສິນເຊື່ອ'}
        subtitle="ຂາຍຄຳແບບວາງດາວ — ຄິດໄລ່ຍອດຕິດໜີ້ ແລະ ຮັບເງິນວາງດາວ (TOR §5.3)"
        size="xl"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={saveMutation.isPending}
              onClick={resetForm}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary min-w-[200px]"
              aria-describedby={error ? 'credit-modal-error' : undefined}
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending
                ? 'ກຳລັງບັນທຶກ...'
                : editingId
                ? 'ບັນທຶກການແກ້ໄຂ'
                : 'ສ້າງລາຍການສິນເຊື່ອ'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {!editingId && !hasOpenShift && (
            <div role="status" className="notice status-warning text-xs">
              ກະຍັງບໍ່ໄດ້ເປີດ — ກະລຸນາກົດ "ເປີດກະ" ກ່ອນສ້າງລາຍການສິນເຊື່ອ
            </div>
          )}

          {error && (
            <div id="credit-modal-error" role="alert" className="notice status-danger text-xs">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
              <input
                id="phone"
                className="input input-lg num"
                inputMode="numeric"
                maxLength={8}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="label" htmlFor="goldItem">ລາຍການຄຳ</label>
              <select
                id="goldItem"
                className="input input-lg"
                value={goldItemId}
                onChange={(e) => setGoldItemId(e.target.value)}
              >
                <option value="">— ເລືອກລາຍການຄຳ —</option>
                {goldItems.map((i) => <option key={i.id} value={i.id}>{i.nameLo}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="weightG">ນ້ຳໜັກ (g)</label>
              <NumberInput
                decimals={4}
                id="weightG"
                className="input input-lg num"
                value={weightG}
                onValueChange={setWeightG}
              />
            </div>
            <div>
              <label className="label" htmlFor="qty">ຈຳນວນ</label>
              <input
                id="qty"
                className="input input-lg num"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
              />
            </div>
            <div>
              <label className="label" htmlFor="sellPrice">ລາຄາຂາຍ (LAK)</label>
              <NumberInput
                decimals={0}
                id="sellPrice"
                className="input input-lg num"
                value={sellPrice}
                onValueChange={setSellPrice}
              />
            </div>
            <div>
              <label className="label" htmlFor="downPayment">ເງິນວາງດາວ (LAK)</label>
              <NumberInput
                decimals={0}
                id="downPayment"
                className="input input-lg num"
                value={downPayment}
                onValueChange={setDownPayment}
              />
            </div>
            <div>
              <label className="label" htmlFor="cabinet">ຕູ້ເຄື່ອງ</label>
              <select
                id="cabinet"
                className="input input-lg"
                value={cabinetId}
                onChange={(e) => setCabinetId(e.target.value)}
              >
                <option value="">— ເລືອກຕູ້ເຄື່ອງ —</option>
                {cabinets.map((c) => <option key={c.id} value={c.id}>{c.nameLo}</option>)}
              </select>
            </div>
          </div>

          <div className="recessed rounded-xl p-4 sm:p-5">
            <div className="section-label">
              ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ
            </div>
            <div className="num mt-1 text-[26px] font-semibold text-fg-strong">
              {outstanding === null ? '—' : `${formatLak(outstanding)} LAK`}
            </div>
            {isNonNegDecimal(cleanSellPrice) &&
              isNonNegDecimal(cleanDownPayment) &&
              dec(cleanDownPayment).gt(dec(cleanSellPrice)) && (
                <p className="mt-1 text-xs font-medium text-danger">
                  ເງິນວາງດາວຕ້ອງບໍ່ເກີນລາຄາຂາຍ
                </p>
              )}
          </div>

          <div className="border-t border-line pt-5">
            <h3 className="label">Receive — ເງິນວາງດາວ</h3>
            <MultiPayment
              lines={payments}
              onChange={setPayments}
              owedLak={cleanDownPayment || '0'}
              direction="in"
              disallowLakOverpay
              changeLimits={CREDIT_CHANGE_LIMITS}
              labelLo="ຮັບເງິນ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ — ໃຊ້ Price Rate Sell)"
            />
            <p className="mt-2 text-xs text-muted">
              ຮັບເງິນ (LAK) ຕ້ອງ ≥ ເງິນວາງດາວ · ເງິນທອນຈາກ THB ບໍ່ເກີນ 1,000 THB, ຈາກ USD ບໍ່ເກີນ 100 USD
            </p>
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
              className="input h-[38px] !w-auto min-w-[160px] text-xs"
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
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td>
                      <div>{row.goldItem.nameLo}</div>
                      {row.cabinet?.nameLo && (
                        <div className="text-[11px] text-muted">{row.cabinet.nameLo}</div>
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
                            className="btn-primary !h-8 !min-h-0 !px-3 text-xs"
                            disabled={!hasOpenShift}
                            onClick={() => {
                              setInstalment(row);
                              setInstalmentPayments(newPaymentLines());
                              setError(null);
                            }}
                          >
                            ຮັບຄ່າງວດ
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
                          {row.status === 'PENDING' && canCreate && canAct && (
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
                          {row.status === 'PENDING' && (canAct || canReceive) && (
                            <button
                              type="button"
                              className="btn-ghost flex h-8 w-8 items-center justify-center rounded-lg p-1.5 text-danger transition-colors hover:bg-[var(--danger-bg)]"
                              title="ຍົກເລີກລາຍການ"
                              aria-label={`ຍົກເລີກ ${row.code}`}
                              onClick={() => {
                                setCancellingRow(row);
                                setCancelReason('');
                                setError(null);
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

      {/* ── Dialog ຮັບຄ່າງວດ ── */}
      <Dialog
        open={Boolean(instalment)}
        onClose={() => {
          if (receiveMutation.isPending) return;
          setInstalment(null);
          setInstalmentPayments(newPaymentLines());
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
              className="btn-secondary"
              disabled={receiveMutation.isPending}
              onClick={() => {
                setInstalment(null);
                setInstalmentPayments(newPaymentLines());
              }}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary"
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
              changeLimits={CREDIT_CHANGE_LIMITS}
              labelLo="ຮັບຄ່າງວດ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ)"
            />
            <p className="text-xs text-muted">
              ເງິນທອນຈາກ THB ບໍ່ເກີນ 1,000 THB, ຈາກ USD ບໍ່ເກີນ 100 USD
            </p>
            {error && (
              <div role="alert" className="notice status-danger text-xs">
                {error}
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
                  className="btn-secondary"
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
                    className="btn-primary"
                    disabled={!hasOpenShift}
                    onClick={() => {
                      const target = detailRow;
                      setViewingRow(null);
                      setInstalment(target);
                      setInstalmentPayments(newPaymentLines());
                      setError(null);
                    }}
                  >
                    ຮັບຄ່າງວດ
                  </button>
                )}
              <button type="button" className="btn-secondary" onClick={() => setViewingRow(null)}>
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
                <div className="text-xs text-muted">ລາຍການຄຳ / ຕູ້</div>
                <div className="font-medium text-fg">
                  {detailRow.goldItem.nameLo}
                  {detailRow.cabinet?.nameLo ? ` · ${detailRow.cabinet.nameLo}` : ''}
                </div>
                <div className="num text-xs text-muted">
                  {formatWeight(detailRow.weightG)} g · {detailRow.quantity} ຊິ້ນ
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
        onClose={() => !cancelMutation.isPending && setCancellingRow(null)}
        title={`ຍົກເລີກລາຍການ ${cancellingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={cancelMutation.isPending}
              onClick={() => setCancellingRow(null)}
            >
              ປິດ
            </button>
            <button
              type="button"
              className="btn-danger"
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
          {error && (
            <div role="alert" className="notice status-danger text-xs">
              {error}
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
        onClose={() => !deleteMutation.isPending && setDeletingRow(null)}
        title={`ຢືນຢັນລຶບ ${deletingRow?.code ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={deleteMutation.isPending}
              onClick={() => setDeletingRow(null)}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={deleteMutation.isPending}
              onClick={() => deletingRow && deleteMutation.mutate(deletingRow.id)}
            >
              {deleteMutation.isPending ? 'ກຳລັງລຶບ...' : 'ລຶບລາຍການ'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {error && (
            <div role="alert" className="notice status-danger text-xs">
              {error}
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
