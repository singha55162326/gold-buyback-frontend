'use client';

import { Fragment, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import type { PagedResult } from '@/components/date-range';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { MultiPayment, newPaymentLines, paymentPayload } from '@/components/multi-payment';
import type { PaymentLine } from '@/components/multi-payment';

interface GoldType { id: string; code: string; nameLo: string }
interface GoldItem { id: string; nameLo: string }
interface BankAccount { id: string; code: string; nameLo: string }

interface PreviewLine {
  goldTypeId: string;
  goldTypeNameLo: string;
  weightG: string;
  quantity: number;
  shopBuybackPrice: string;
  deduction: string;
  payableAmount: string;
  branch: string;
}

interface Preview {
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

const emptyLine = (): FormLine => ({
  goldTypeId: '', goldItemId: '', weightG: '', quantity: '1', goldPercent: '', deduction: '',
});

/** ຈຳນວນທີ່ພິມຍັງບໍ່ຄົບ ນັບເປັນ 1. */
const qty = (value: string) => Math.max(1, Math.trunc(Number(value) || 0) || 1);

interface BuybackPayment {
  id: string; method: 'CASH' | 'BANK'; currency: string;
  amount: string; amountLak: string; changeLak: string;
  bankAccount: { nameLo: string } | null;
}

/** ສົດ / ໂອນ ເປັນສອງຊ່ອງທາງແຍກກັນ, ສະນັ້ນ ປະຫວັດກໍບອກແຍກ. */
const METHOD_LABEL: Record<BuybackPayment['method'], string> = {
  CASH: 'ເງິນສົດ',
  BANK: 'ໂອນ',
};

interface BuybackRow {
  id: string;
  code: string;
  source: 'KPV' | 'OTHER_SHOP';
  goldPercent: string | null;
  outstandingAmount: string;
  updatedBy: string;
  payments: BuybackPayment[];
  goldItem: { nameLo: string } | null;
  /** ລາຍການຄຳໃນບິນ — ບິນດຽວມີໄດ້ຫຼາຍແຖວ. */
  lines: Array<{
    id: string;
    weightG: string;
    quantity: number;
    goldPercent: string | null;
    shopBuybackPrice: string;
    deduction: string;
    payableAmount: string;
    goldType: { nameLo: string };
    goldItem: { nameLo: string } | null;
  }>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  weightG: string;
  quantity: number;
  payableAmount: string;
  createdAt: string;
  customer: { phone: string };
  goldType: { nameLo: string };
}

const STATUS_LABEL: Record<BuybackRow['status'], { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ — ລໍຖ້າຢືນຢັນ' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ສຳເລັດ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
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
  // The history is the landing view; the form opens on demand.
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();
  const user = getStoredUser();
  const canConfirm = user?.role === 'VALUER' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<'KPV' | 'OTHER_SHOP'>('KPV');
  // ບິນດຽວ Add ລາຍການຄຳໄດ້ຫຼາຍແຖວ (TOR §5.1 ຕາມທີ່ລູກຄ້າແຈ້ງ).
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const setLine = (i: number, patch: Partial<FormLine>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  // ສົດ ແລະ ໂອນ ແຍກແຖວກັນ: one buyback may be paid part cash, part transfer,
  // and each leg carries its own currency and rate.
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<BuybackRow>(['buyback'], '/buyback');
  const rows = history.rows;
  const rowsFailed = history.isError;
  const rowsError = history.error;
  const refetchRows = history.refetch;

  /** ແຖວທີ່ພ້ອມຄິດລາຄາ — ຕ້ອງມີ ປະເພດຄຳ ແລະ ນ້ຳໜັກ. */
  const readyLines = lines
    .filter((l) => l.goldTypeId && l.weightG.trim() && Number(l.weightG) > 0)
    .map((l) => ({
      goldTypeId: l.goldTypeId,
      goldItemId: l.goldItemId || undefined,
      weightG: l.weightG.trim(),
      quantity: qty(l.quantity),
      goldPercent: l.goldPercent.trim() || undefined,
      deduction: l.deduction.trim() || undefined,
    }));
  const linesKey = JSON.stringify(readyLines);

  /* Re-price whenever the inputs change. */
  useEffect(() => {
    const payloadLines = JSON.parse(linesKey) as typeof readyLines;
    if (payloadLines.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .post<Preview>('/buyback/preview', { source, lines: payloadLines })
        .then((result) => {
          if (!cancelled) {
            setPreview(result);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setPreview(null);
            setError(e instanceof ApiError ? e.message : null);
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, linesKey]);

  const create = useMutation({
    mutationFn: () =>
      api.post('/buyback', {
        phone,
        source,
        lines: readyLines,
        payments: paymentPayload(payments),
      }),
    onSuccess: () => {
      setShowForm(false);
      toast.success('ດຳເນີນການສຳເລັດ');
      setPhone(''); setLines([emptyLine()]);
      setPayments(newPaymentLines()); setPreview(null); setError(null);
      void queryClient.invalidateQueries({ queryKey: ['buyback'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/buyback/${id}/confirm`),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      void queryClient.invalidateQueries({ queryKey: ['buyback'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຢືນຢັນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const isBoiled = source === 'OTHER_SHOP';
  // ແຕ່ລະແຖວຈ່າຍຕ້ອງຄົບ: ແຖວໂອນ ຕ້ອງເລືອກທະນາຄານ ກ່ອນບັນທຶກໄດ້.
  const paymentLines = paymentPayload(payments);
  const bankLegReady = paymentLines.every((l) => l.method !== 'BANK' || Boolean(l.bankAccountId));
  const canSave =
    /^\d{8}$/.test(phone) &&
    readyLines.length > 0 &&
    preview !== null &&
    Number(preview.payableAmount) > 0 &&
    paymentLines.length > 0 &&
    bankLegReady;

  return (
    <div className="space-y-6">
      <PageHead
        title="Buyback — ການຊື້ຄຳຄືນ"
        subtitle="ຄຳຮ້ານ KPV ແລະ ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ) — ສ້າງລາຍການສົ່ງໃຫ້ payment ອະນຸມັດ (TOR §5.1)"
        actions={
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'ປິດຟອມ' : '+ ສ້າງລາຍການ Buyback'}
          </button>
        }
      />
      {goldTypesFailed && <QueryErrorNotice error={goldTypesError} onRetry={() => void refetchGoldTypes()} />}
      {goldItemsFailed && <QueryErrorNotice error={goldItemsError} onRetry={() => void refetchGoldItems()} />}
      {banksFailed && <QueryErrorNotice error={banksError} onRetry={() => void refetchBanks()} />}

      {showForm && (
      <div data-fade className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="phone">ເບີໂທລູກຄ້າ (8 ໂຕ)</label>
            <input id="phone" className="input input-lg num" inputMode="numeric" maxLength={8}
              placeholder="20123456" value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          </div>

          <div>
            <label className="label" htmlFor="source">ແຫຼ່ງທີ່ມາ</label>
            <select id="source" className="input input-lg" value={source}
              onChange={(e) => setSource(e.target.value as 'KPV' | 'OTHER_SHOP')}>
              <option value="KPV">ຄຳຮ້ານ KPV</option>
              <option value="OTHER_SHOP">ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ)</option>
            </select>
          </div>

        </div>

        {/* ລາຍການຄຳ — Add ໄດ້ຫຼາຍແຖວໃນບິນດຽວ (TOR §5.1 ຕາມທີ່ລູກຄ້າແຈ້ງ).
            ແຕ່ລະແຖວຄິດລາຄາແຍກກັນຢູ່ server ແລ້ວລວມເປັນຍອດບິນ. */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="label mb-0">ລາຍການຄຳ</span>
            <button type="button" className="btn-secondary"
              onClick={() => setLines((p) => [...p, emptyLine()])}>
              + ເພີ່ມແຖວ
            </button>
          </div>

          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className={`grid gap-2 ${isBoiled
                ? 'md:grid-cols-[1.2fr_1.2fr_1fr_0.7fr_0.8fr_auto]'
                : 'md:grid-cols-[1.2fr_1.2fr_1fr_0.7fr_1fr_auto]'}`}>
                <select className="input" aria-label={`ປະເພດຄຳ ແຖວທີ ${i + 1}`}
                  value={line.goldTypeId}
                  onChange={(e) => setLine(i, { goldTypeId: e.target.value })}>
                  <option value="">— ປະເພດຄຳ —</option>
                  {goldTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
                </select>

                <select className="input" aria-label={`ລາຍການຄຳ ແຖວທີ ${i + 1}`}
                  value={line.goldItemId}
                  onChange={(e) => setLine(i, { goldItemId: e.target.value })}>
                  <option value="">— ລາຍການຄຳ —</option>
                  {goldItems.map((it) => <option key={it.id} value={it.id}>{it.nameLo}</option>)}
                </select>

                <NumberInput decimals={4} className="input num" placeholder="ນ້ຳໜັກ (g)"
                  aria-label={`ນ້ຳໜັກ ແຖວທີ ${i + 1}`}
                  value={line.weightG} onValueChange={(v) => setLine(i, { weightG: v })} />

                <input className="input num" type="number" min={1} placeholder="1"
                  aria-label={`ຈຳນວນ ແຖວທີ ${i + 1}`}
                  value={line.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })} />

                {isBoiled ? (
                  <NumberInput decimals={2} className="input num" placeholder="%ຄຳ"
                    aria-label={`%ຄຳ ແຖວທີ ${i + 1}`}
                    value={line.goldPercent} onValueChange={(v) => setLine(i, { goldPercent: v })} />
                ) : (
                  <NumberInput decimals={0} className="input num" placeholder="ຄ່າອ່ອນ/ຄ່າຫັກ"
                    aria-label={`ຄ່າອ່ອນ ຄ່າຫັກ ແຖວທີ ${i + 1}`}
                    value={line.deduction} onValueChange={(v) => setLine(i, { deduction: v })} />
                )}

                <button type="button" className="btn-secondary" disabled={lines.length === 1}
                  aria-label={`ລຶບແຖວທີ ${i + 1}`}
                  onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                  ລຶບ
                </button>
              </div>
            ))}
          </div>

          {/* ລາຄາຕໍ່ແຖວ ຈາກ server — ຜູ້ປະເມີນຕ້ອງເຫັນວ່າແຖວໃດໄດ້ເທົ່າໃດ. */}
          {preview && preview.lines?.length > 1 && (
            <div className="table-wrap mt-3" tabIndex={0} role="region" aria-label="ລາຄາຕໍ່ແຖວ">
              <table className="table">
                <thead>
                  <tr>
                    <th>ປະເພດຄຳ</th>
                    <th className="text-right">ນ້ຳໜັກ (g)</th>
                    <th className="text-right">ຈຳນວນ</th>
                    <th className="text-right">ລາຄາຊື້ຄືນໜ້າຮ້ານ</th>
                    <th className="text-right">ຄ່າອ່ອນ / ຄ່າຫັກ</th>
                    <th className="text-right">ລາຄາທີ່ຕ້ອງຈ່າຍ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line, i) => (
                    <tr key={i}>
                      <td>{line.goldTypeNameLo}</td>
                      <td className="num text-right">{formatWeight(line.weightG)}</td>
                      <td className="num text-right">{line.quantity}</td>
                      <td className="num text-right">{formatLak(line.shopBuybackPrice)}</td>
                      <td className="num text-right">{formatLak(line.deduction)}</td>
                      <td className="num text-right font-medium">{formatLak(line.payableAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Live §5.1 result — ຍອດລວມທັງບິນ */}
        <div className="recessed mt-5 grid gap-4 rounded-xl p-4 sm:grid-cols-4 sm:p-5">
          <Field labelLo="ລວມນ້ຳໜັກ (g)"
            value={preview ? formatWeight(preview.totalWeightG) : '—'} />
          <Field labelLo="ລວມຈຳນວນ" value={preview ? String(preview.totalQuantity) : '—'} />
          <Field labelLo="ລວມລາຍການ" value={preview ? `${preview.lines.length} ແຖວ` : '—'} />
          <Field labelLo="ລວມເງິນທີ່ຕ້ອງຈ່າຍ"
            value={preview ? formatLak(preview.payableAmount) : '—'} strong />
          {preview && preview.lines.length === 1 && (
            <div className="text-xs text-muted sm:col-span-4">
              ລາຄາຊື້ຄືນໜ້າຮ້ານ {formatLak(preview.shopBuybackPrice)} ·
              ຄ່າອ່ອນ / ຄ່າຫັກ {formatLak(preview.deduction)} ·
              ສູດທີ່ໃຊ້: <span className="font-medium text-fg">{preview.branch}</span>
            </div>
          )}
        </div>

        {/* ການຈ່າຍເງິນ — ຮ້ານຈ່າຍອອກ, ສະນັ້ນ ໃຊ້ເຣດຊື້ຄືນ. */}
        <MultiPayment
          lines={payments}
          onChange={setPayments}
          owedLak={preview?.payableAmount}
          direction="out"
          labelLo="ການຈ່າຍເງິນ — ສົດ / ໂອນ (ແຍກແຖວໄດ້)"
        />

        {error && (
          <div id="buyback-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}

        <div className="mt-4">
          <button className="btn-primary min-h-[54px] w-full sm:w-auto sm:min-w-[240px]"
            aria-describedby={error ? 'buyback-error' : undefined} disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ສ້າງລາຍການ Buyback'}
          </button>
        </div>
      </div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ Buyback</h2>
          <span className="num text-xs text-muted">{rows.length} ລາຍການ</span>
        </div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Buyback">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ທຸລະກຳ</th>
                <th>ປະເພດຄຳ</th>
                <th className="text-right">ນ້ຳໜັກລວມ (g)</th>
                <th className="text-right">%ຄຳ</th>
                <th className="text-right">ຈຳນວນລວມ</th>
                <th className="text-right">ລວມເງິນທີ່ຕ້ອງຈ່າຍ</th>
                <th className="text-right">ຍອດເງິນຄ້າງຈ່າຍ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={12} isError={rowsFailed} error={rowsError} isEmpty={rows.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={() => void refetchRows()} />
              {rows.map((row) => (
                <Fragment key={row.id}>
                <tr>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td className="num">{row.customer.phone}</td>
                  <td>{row.source === 'KPV' ? 'ຄຳຮ້ານ KPV' : 'ຄຳຮ້ານອື່ນ'}</td>
                  <td>
                    {row.goldType.nameLo}
                    {row.lines?.length > 1 && (
                      <span className="text-muted"> +{row.lines.length - 1}</span>
                    )}
                  </td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{row.goldPercent ? `${Number(row.goldPercent)}%` : '—'}</td>
                  <td className="num text-right">{row.quantity}</td>
                  <td className="num text-right font-medium">{formatLak(row.payableAmount)}</td>
                  <td className="num text-right">{formatLak(row.outstandingAmount)}</td>
                  <td>
                    <span className={statusClass(row.status)}>
                      {STATUS_LABEL[row.status].lo}
                    </span>
                  </td>
                  <td className="text-muted">{row.updatedBy}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-ghost" aria-expanded={viewing === row.id}
                        onClick={() => setViewing(viewing === row.id ? null : row.id)}>
                        View
                      </button>
                      {row.status === 'APPROVED' && canConfirm && (
                        <button className="btn-primary"
                          onClick={() => confirm.mutate(row.id)} disabled={confirm.isPending}>
                          ຢືນຢັນ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {viewing === row.id && (
                  <tr>
                    <td colSpan={12} className="bg-recessed p-4">
                      <div className="section-label">ລາຍການຄຳໃນບິນ</div>
                      <table className="table mt-1">
                        <thead>
                          <tr>
                            <th>ປະເພດຄຳ</th>
                            <th>ລາຍການຄຳ</th>
                            <th className="text-right">ນ້ຳໜັກ (g)</th>
                            <th className="text-right">ຈຳນວນ</th>
                            <th className="text-right">%ຄຳ</th>
                            <th className="text-right">ລາຄາທີ່ຕ້ອງຈ່າຍ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(row.lines ?? []).length === 0 && (
                            <tr>
                              {/* ບິນເກົ່າກ່ອນມີຕາຕະລາງແຖວ — ສະແດງຈາກຫົວບິນ. */}
                              <td>{row.goldType.nameLo}</td>
                              <td>{row.goldItem?.nameLo ?? '—'}</td>
                              <td className="num text-right">{formatWeight(row.weightG)}</td>
                              <td className="num text-right">{row.quantity}</td>
                              <td className="num text-right">
                                {row.goldPercent ? `${Number(row.goldPercent)}%` : '—'}
                              </td>
                              <td className="num text-right">{formatLak(row.payableAmount)}</td>
                            </tr>
                          )}
                          {(row.lines ?? []).map((line) => (
                            <tr key={line.id}>
                              <td>{line.goldType.nameLo}</td>
                              <td>{line.goldItem?.nameLo ?? '—'}</td>
                              <td className="num text-right">{formatWeight(line.weightG)}</td>
                              <td className="num text-right">{line.quantity}</td>
                              <td className="num text-right">
                                {line.goldPercent ? `${Number(line.goldPercent)}%` : '—'}
                              </td>
                              <td className="num text-right font-medium">{formatLak(line.payableAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="section-label mt-4">
                        ລາຍລະອຽດ payment
                      </div>
                      <table className="table mt-1">
                        <thead>
                          <tr>
                            <th>ຮູບແບບຈ່າຍ</th><th>ສະກຸນເງິນ</th>
                            <th className="text-right">ຈຳນວນ</th>
                            <th className="text-right">= LAK</th>
                            <th className="text-right">ການປ່ຽນແປງ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.payments.length === 0 && (
                            <tr><td colSpan={5} className="py-3 text-center text-muted">—</td></tr>
                          )}
                          {row.payments.map((pmt) => (
                            <tr key={pmt.id}>
                              <td>
                                {METHOD_LABEL[pmt.method] ?? pmt.method}
                                {pmt.method === 'BANK' && (
                                  <span className="text-muted"> — {pmt.bankAccount?.nameLo ?? '—'}</span>
                                )}
                              </td>
                              <td>{pmt.currency}</td>
                              <td className="num text-right">{formatLak(pmt.amount)}</td>
                              <td className="num text-right">{formatLak(pmt.amountLak)}</td>
                              <td className="num text-right">{formatLak(pmt.changeLak)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ labelLo, value, strong }: { labelLo: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="section-label">{labelLo}</div>
      <div className={`num mt-1 font-semibold text-fg-strong ${strong ? 'text-[26px]' : 'text-[20px]'}`}>
        {value}
      </div>
    </div>
  );
}
