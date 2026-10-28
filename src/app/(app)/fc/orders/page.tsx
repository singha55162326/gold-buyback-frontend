'use client';

import { Fragment, useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDate, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { NumberInput } from '@/components/number-input';
import { MultiPayment, newPaymentLines, paymentPayload, type PaymentLine } from '@/components/multi-payment';
import { statusClass } from '@/lib/status';
import type { PagedResult } from '@/components/date-range';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';

interface GoldItem { id: string; nameLo: string }
interface Partner { id: string; nameLo: string }
interface Bank { id: string; nameLo: string }

type OrderStatus =
  | 'ORDER_PLACED'
  | 'SENT_TO_SMITH'
  | 'RECEIVED_FROM_SMITH'
  | 'AWAITING_PICKUP'
  | 'COMPLETED'
  | 'CANCELLED';

/** ແຖວລາຍການໃນຟອມສ້າງ Order. */
interface FormLine {
  goldItemId: string;
  weightG: string;
  quantity: string;
  amount: string;
}

const emptyLine = (): FormLine => ({ goldItemId: '', weightG: '', quantity: '1', amount: '' });

/** ຈຳນວນທີ່ພິມຍັງບໍ່ຄົບ ນັບເປັນ 1. */
const qty = (value: string) => Math.max(1, Math.trunc(Number(value) || 0) || 1);

interface Order {
  id: string; code: string; billNo: string; productType: 'IT' | 'ITP';
  staffName: string; weightG: string; quantity: number;
  totalAmount: string; receivedAmount: string; balanceAmount: string;
  status: OrderStatus; note: string | null; createdAt: string;
  sentToSmithAt: string | null;
  /** ລາຍການໃນບິນ — ບິນດຽວມີໄດ້ຫຼາຍແຖວ. */
  lines: Array<{
    id: string;
    weightG: string;
    quantity: number;
    amount: string | null;
    goldItem: { nameLo: string };
  }>;
  receivedFromSmithAt: string | null; customerPickupAt: string | null;
  customer: { phone: string };
  goldItem: { nameLo: string };
  supplier: { nameLo: string } | null;
}

const STATUS: Record<OrderStatus, { lo: string }> = {
  ORDER_PLACED: { lo: 'Order ສຳເລັດ' },
  SENT_TO_SMITH: { lo: 'ສັ່ງຊ່າງ ສຳເລັດ' },
  RECEIVED_FROM_SMITH: { lo: 'ຮັບເຄື່ອງຈາກຊ່າງ ສຳເລັດ' },
  AWAITING_PICKUP: { lo: 'ລໍຖ້າລູກຄ້າຮັບເຄື່ອງ' },
  COMPLETED: { lo: 'Completed' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

/** The one step each status may advance to (TOR §7). */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  ORDER_PLACED: 'SENT_TO_SMITH',
  SENT_TO_SMITH: 'RECEIVED_FROM_SMITH',
  RECEIVED_FROM_SMITH: 'AWAITING_PICKUP',
  AWAITING_PICKUP: 'COMPLETED',
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * TOR §7 — ລາຍການ Order.
 *
 * Each transition captures the fact that makes it true: a Supplier for
 * ສັ່ງຊ່າງ, a date for ຮັບເຄື່ອງຈາກຊ່າງ, a date for ລູກຄ້າມາຮັບເຄື່ອງ. The API
 * rejects the transition without them, so this form collects them rather than
 * letting a status be set on trust.
 */
export default function OrdersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [advancing, setAdvancing] = useState<Order | null>(null);
  const [paying, setPaying] = useState<Order | null>(null);
  // ຈ່າຍເງິນຄືນທີ່ຮັບຈາກລູກຄ້າ (ຕອນມາຮັບເຄື່ອງ) ແລະ ລາຍລະອຽດ Order.
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [refundPayments, setRefundPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [phone, setPhone] = useState('');
  const [billNo, setBillNo] = useState('');
  const [productType, setProductType] = useState<'IT' | 'ITP'>('IT');
  const [staffName, setStaffName] = useState('');
  // ບິນດຽວ Add ລາຍການໄດ້ຫຼາຍແຖວ (TOR §7 ຕາມທີ່ລູກຄ້າແຈ້ງ).
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const setLine = (i: number, patch: Partial<FormLine>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const [totalAmount, setTotalAmount] = useState('');
  const [note, setNote] = useState('');

  // shared receipt fields
  const [payments, setPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [payPayments, setPayPayments] = useState<PaymentLine[]>(newPaymentLines());

  // transition fields
  const [supplierId, setSupplierId] = useState('');
  const [transitionDate, setTransitionDate] = useState(today());

  const goldItemsQuery = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const goldItems = goldItemsQuery.data ?? [];
  const partnersQuery = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
  });
  const partners = partnersQuery.data ?? [];
  const banksQuery = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const banks = banksQuery.data ?? [];
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Order>(['orders'], '/orders');
  const orders = history.rows;
  const catalogQuery = [goldItemsQuery, partnersQuery, banksQuery].find((q) => q.isError);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
  };

  /** ແຖວທີ່ຄົບພໍຈະສົ່ງໄປ server — ຕ້ອງມີລາຍການ ແລະ ນ້ຳໜັກ. */
  const orderLines = lines
    .filter((l) => l.goldItemId && Number(l.weightG) > 0)
    .map((l) => ({
      goldItemId: l.goldItemId,
      weightG: l.weightG.trim(),
      quantity: qty(l.quantity),
      amount: l.amount.replace(/,/g, '').trim() || undefined,
    }));

  const create = useMutation({
    mutationFn: () =>
      api.post('/orders', {
        phone, billNo, productType, staffName,
        lines: orderLines,
        totalAmount: totalAmount.replace(/,/g, '').trim(),
        note: note || undefined,
        receipts: paymentPayload(payments),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setShowAdd(false); setLines([emptyLine()]);
      setPhone(''); setBillNo(''); setStaffName('');
      setTotalAmount(''); setPayments(newPaymentLines()); setNote('');
      setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const advance = useMutation({
    mutationFn: (order: Order) => {
      const status = NEXT[order.status]!;
      const body: Record<string, unknown> = { status };
      if (status === 'SENT_TO_SMITH') body.supplierId = supplierId;
      if (status === 'RECEIVED_FROM_SMITH') body.receivedFromSmithAt = transitionDate;
      if (status === 'COMPLETED') body.customerPickupAt = transitionDate;
      return api.patch(`/orders/${order.id}/status`, body);
    },
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setAdvancing(null); setSupplierId(''); setTransitionDate(today());
      setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ປ່ຽນສະຖານະບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const refund = useMutation({
    mutationFn: (row: Order) =>
      api.post(`/orders/${row.id}/refund`, { receipts: paymentPayload(refundPayments) }),
    onSuccess: () => {
      toast.success('ຈ່າຍເງິນຄືນແລ້ວ');
      setRefunding(null); setRefundPayments(newPaymentLines()); setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຈ່າຍເງິນຄືນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pay = useMutation({
    mutationFn: (order: Order) =>
      api.post(`/orders/${order.id}/receipts`, {
        receipts: paymentPayload(payPayments),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setPaying(null); setPayPayments(newPaymentLines()); setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຮັບເງິນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  // Every leg must name a bank when it is a transfer, and carry an amount.
  const legsReady = (lines: PaymentLine[]) =>
    paymentPayload(lines).length > 0 &&
    lines.every((l) => l.method === 'CASH' || !l.amount.trim() || Boolean(l.bankAccountId));

  const canSave =
    /^\d{8}$/.test(phone) && /^\d{4}$/.test(billNo) && staffName.trim() &&
    orderLines.length > 0 && Number(totalAmount.replace(/,/g, '')) > 0 &&
    legsReady(payments);

  const pager = usePagination(orders);


  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການ Order"
        subtitle="ສັ່ງເຮັດຄຳຕາມສັ່ງ — ເງິນມັດຈໍາເຂົ້າ Module Advace ຈົນກວ່າລູກຄ້າຮັບເຄື່ອງ (TOR §7)"
        actions={
          <button className="btn-primary" onClick={() => { setShowAdd((v) => !v); setPaying(null); setAdvancing(null); }}>
            ສ້າງ Order
          </button>
        }
      />

      {error && (
        <div id="orders-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {catalogQuery && (
        <QueryErrorNotice error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
      )}

      {showAdd && (
        <div data-fade className="card p-5">
          <h2 className="card-title mb-4">ຟອມ Order</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
              <input id="phone" className="input num" inputMode="numeric" maxLength={8}
                value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label className="label" htmlFor="billNo">ເລກບິນ (4 ຕົວ)</label>
              <input id="billNo" className="input num" inputMode="numeric" maxLength={4}
                value={billNo} onChange={(e) => setBillNo(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div>
              <label className="label" htmlFor="productType">ປະເພດສິນຄ້າ</label>
              <select id="productType" className="input" value={productType}
                onChange={(e) => setProductType(e.target.value as 'IT' | 'ITP')}>
                <option value="IT">IT</option>
                <option value="ITP">ITP</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="staffName">ຊື່ພະນັກງານທີ່ຮັບ Order</label>
              <input id="staffName" className="input" value={staffName}
                onChange={(e) => setStaffName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="total">TOTAL (LAK)</label>
              <NumberInput id="total" className="input num" decimals={0} value={totalAmount}
                onValueChange={setTotalAmount} />
            </div>
          </div>

          {/* ລາຍການໃນບິນ — Add ໄດ້ຫຼາຍແຖວ. ຍອດລວມບິນຍັງປ້ອນບ່ອນດຽວ
              ເພາະລູກຄ້າຕົກລົງລາຄາລວມກັບຮ້ານ; ຊ່ອງຍອດຕໍ່ແຖວເປັນທາງເລືອກ. */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="label mb-0">ລາຍການ</span>
              <button type="button" className="btn-secondary"
                onClick={() => setLines((p) => [...p, emptyLine()])}>
                + ເພີ່ມແຖວ
              </button>
            </div>
            <div className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-[2fr_1fr_0.7fr_1fr_auto]">
                  <select className="input" aria-label={`ລາຍການ ແຖວທີ ${i + 1}`}
                    value={line.goldItemId}
                    onChange={(e) => setLine(i, { goldItemId: e.target.value })}>
                    <option value="">— ເລືອກລາຍການ —</option>
                    {goldItems.map((it) => <option key={it.id} value={it.id}>{it.nameLo}</option>)}
                  </select>
                  <NumberInput className="input num" decimals={4} placeholder="ນ້ຳໜັກ (g)"
                    aria-label={`ນ້ຳໜັກ ແຖວທີ ${i + 1}`}
                    value={line.weightG} onValueChange={(v) => setLine(i, { weightG: v })} />
                  <input className="input num" type="number" min={1} placeholder="1"
                    aria-label={`ຈຳນວນ ແຖວທີ ${i + 1}`}
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <NumberInput className="input num" decimals={0} placeholder="ຍອດແຖວ (ບໍ່ບັງຄັບ)"
                    aria-label={`ຍອດເງິນ ແຖວທີ ${i + 1}`}
                    value={line.amount} onValueChange={(v) => setLine(i, { amount: v })} />
                  <button type="button" className="btn-secondary" disabled={lines.length === 1}
                    aria-label={`ລຶບແຖວທີ ${i + 1}`}
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                    ລຶບ
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              ລວມ {formatWeight(String(orderLines.reduce((s, l) => s + Number(l.weightG) * l.quantity, 0)))} g ·
              {' '}{orderLines.reduce((s, l) => s + l.quantity, 0)} ອັນ
            </p>
          </div>

          <div className="mt-5 border-t border-line pt-5">
            <h3 className="section-label mb-3">Receive — ເງິນຮັບຈາກລູກຄ້າ</h3>
            <MultiPayment
              lines={payments}
              onChange={setPayments}
              owedLak={totalAmount.replace(/,/g, '')}
              direction="in"
              labelLo="ຮັບເງິນ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ)"
            />
            <div className="mt-4">
              <label className="label" htmlFor="note">Note</label>
              <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary min-h-[54px]" aria-describedby={error ? 'orders-error' : undefined} disabled={!canSave || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ສ້າງ Order'}
            </button>
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      {advancing && (
        <div data-fade className="card p-5">
          <h2 className="card-title mb-4">
            {advancing.code} → {STATUS[NEXT[advancing.status]!].lo}
          </h2>
          <div className="flex flex-wrap items-end gap-4">
            {NEXT[advancing.status] === 'SENT_TO_SMITH' && (
              <div className="min-w-56">
                <label className="label" htmlFor="supplier">Supplier</label>
                <select id="supplier" className="input" value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">— ເລືອກ Supplier —</option>
                  {partners.map((p) => <option key={p.id} value={p.id}>{p.nameLo}</option>)}
                </select>
              </div>
            )}
            {(NEXT[advancing.status] === 'RECEIVED_FROM_SMITH' ||
              NEXT[advancing.status] === 'COMPLETED') && (
              <div className="min-w-56">
                <label className="label" htmlFor="tdate">
                  {NEXT[advancing.status] === 'COMPLETED'
                    ? 'ວັນທີລູກຄ້າມາຮັບເຄື່ອງ'
                    : 'ວັນທີຮັບເຄື່ອງຈາກຊ່າງ'}
                </label>
                <input id="tdate" type="date" className="input" value={transitionDate}
                  onChange={(e) => setTransitionDate(e.target.value)} />
              </div>
            )}
            <button className="btn-primary" aria-describedby={error ? 'orders-error' : undefined}
              disabled={
                advance.isPending ||
                (NEXT[advancing.status] === 'SENT_TO_SMITH' && !supplierId)
              }
              onClick={() => advance.mutate(advancing)}>
              {advance.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຢືນຢັນ'}
            </button>
            <button className="btn-secondary" onClick={() => setAdvancing(null)}>ຍົກເລີກ</button>
          </div>
          {NEXT[advancing.status] === 'COMPLETED' && Number(advancing.balanceAmount) > 0 && (
            <div className="notice status-warning mt-3">
              ຍັງມີຍອດຄົງເຫຼືອ {formatLak(advancing.balanceAmount)} LAK — ຕ້ອງຊຳຣະໃຫ້ຄົບກ່ອນ.
              ໃຊ້ປຸ່ມ &quot;ຊຳຣະເພີ່ມ&quot; ແລ້ວລະບົບຈະປິດ Order ໃຫ້ອັດຕະໂນມັດ.
            </div>
          )}
        </div>
      )}

      {paying && (
        <div data-fade className="card p-5">
          <h2 className="card-title mb-4">
            ຊຳຣະເພີ່ມ — {paying.code} (ຄົງເຫຼືອ {formatLak(paying.balanceAmount)} LAK)
          </h2>
          <MultiPayment
            lines={payPayments}
            onChange={setPayPayments}
            owedLak={paying.balanceAmount}
            direction="in"
            labelLo="ຮັບເງິນ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ)"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" aria-describedby={error ? 'orders-error' : undefined}
              disabled={!legsReady(payPayments) || pay.isPending}
              onClick={() => pay.mutate(paying)}>
              {pay.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຮັບເງິນ'}
            </button>
            <button className="btn-secondary" onClick={() => setPaying(null)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      {refunding && (
        <div data-fade className="card p-5">
          <h2 className="card-title mb-4">
            ຈ່າຍເງິນຄືນ — {refunding.code} (ຮັບມາແລ້ວ {formatLak(refunding.receivedAmount)} LAK)
          </h2>
          <MultiPayment
            lines={refundPayments}
            onChange={setRefundPayments}
            owedLak={refunding.receivedAmount}
            direction="out"
            labelLo="ຈ່າຍເງິນຄືນ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ)"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" aria-describedby={error ? 'orders-error' : undefined}
              disabled={!legsReady(refundPayments) || refund.isPending}
              onClick={() => refund.mutate(refunding)}>
              {refund.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຈ່າຍເງິນຄືນ'}
            </button>
            <button className="btn-secondary" onClick={() => setRefunding(null)}>ຍົກເລີກ</button>
          </div>
          <p className="mt-2 text-xs text-muted">
            ເງິນອອກຈາກລີ້ນຊັກ/ບັນຊີຈິງ ແລະ ຍອດ Advance ທີ່ຖືແທນລູກຄ້າຈະຫຼຸດລົງຕາມຈຳນວນນີ້
          </p>
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການ Order</h2>
          <span className="num text-xs text-muted">{orders.length} ລາຍການ</span>
        </div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການ Order">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ Order</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ເລກບິນ</th>
                <th>ປະເພດສິນຄ້າ</th>
                <th className="text-right">ນ້ຳໜັກລວມ (g)</th>
                <th className="text-right">ຈຳນວນລວມ</th>
                <th className="text-right">ຍອດເງິນທີ່ໄດ້ຮັບ</th>
                <th className="text-right">ຍອດຄົງເຫຼືອ</th>
                <th>ສະຖານະ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={11}
                isLoading={history.isLoading}
                isError={history.isError}
                error={history.error}
                isEmpty={orders.length === 0}
                emptyText="ຍັງບໍ່ມີ Order"
                onRetry={() => history.refetch()}
              />
              {pager.pageItems.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                  {/* ລາຍການ / Supplier / ຍອດລວມ ບໍ່ຢູ່ໃນຖັນທີ່ລູກຄ້າຂໍ ແຕ່ຍັງ
                      ຕ້ອງເຂົ້າເຖິງໄດ້ — ວາງໄວ້ເປັນ tooltip ຂອງລະຫັດ Order. */}
                  <td className="font-mono text-xs"
                    title={`ລາຍການ: ${row.goldItem.nameLo} · ແຫຼ່ງທີ່ມາ: ${row.supplier?.nameLo ?? '—'} · ຍອດ Order: ${formatLak(row.totalAmount)}`}>
                    {row.code}
                    {row.lines?.length > 1 && (
                      <span className="ml-1 text-muted">({row.lines.length} ລາຍການ)</span>
                    )}
                  </td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td className="num">{row.customer.phone}</td>
                  <td className="font-mono text-xs">{row.billNo}</td>
                  <td>{row.productType}</td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{row.quantity}</td>
                  <td className="num text-right text-success">{formatLak(row.receivedAmount)}</td>
                  <td className="num text-right font-medium">{formatLak(row.balanceAmount)}</td>
                  <td>
                    <span className={statusClass(row.status)}>{STATUS[row.status].lo}</span>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      {NEXT[row.status] && (
                        <button className="btn-ghost"
                          aria-label={`${STATUS[NEXT[row.status]!].lo} ${row.code}`}
                          onClick={() => {
                            setAdvancing(row); setPaying(null); setShowAdd(false);
                            setSupplierId(''); setTransitionDate(today());
                          }}>
                          {STATUS[NEXT[row.status]!].lo}
                        </button>
                      )}
                      {Number(row.balanceAmount) > 0 && row.status !== 'CANCELLED' && (
                        <button className="btn-ghost text-success"
                          aria-label={`ຊຳຣະເພີ່ມ ${row.code}`}
                          onClick={() => {
                            setPaying(row); setAdvancing(null); setShowAdd(false); setPayPayments(newPaymentLines());
                          }}>
                          ຊຳຣະເພີ່ມ
                        </button>
                      )}
                      {/* ຈ່າຍເງິນຄືນໄດ້ ເມື່ອເຄີຍຮັບເງິນມາແລ້ວ ແລະ ລູກຄ້າມາຮັບເຄື່ອງ. */}
                      {Number(row.receivedAmount) > 0 &&
                        (row.status === 'AWAITING_PICKUP' || row.status === 'COMPLETED') && (
                        <button className="btn-ghost text-danger"
                          aria-label={`ຈ່າຍເງິນຄືນ ${row.code}`}
                          onClick={() => {
                            setRefunding(row); setPaying(null); setAdvancing(null);
                            setShowAdd(false); setRefundPayments(newPaymentLines());
                          }}>
                          Payment ຈ່າຍຄືນ
                        </button>
                      )}
                      <button className="btn-ghost" aria-expanded={viewing === row.id}
                        aria-label={`View ${row.code}`}
                        onClick={() => setViewing(viewing === row.id ? null : row.id)}>
                        View
                      </button>
                    </div>
                  </td>
                  </tr>
                  {viewing === row.id && (
                    <tr>
                      <td colSpan={11} className="bg-recessed p-4">
                        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                          <Detail labelLo="ຊື່ພະນັກງານທີ່ຮັບ Order" value={row.staffName} />
                          <Detail labelLo="ລວມນ້ຳໜັກ (g)" value={formatWeight(row.weightG)} />
                          <Detail labelLo="ລວມຈຳນວນ" value={String(row.quantity)} />
                          <Detail labelLo="Supplier" value={row.supplier?.nameLo ?? '—'} />
                          <Detail labelLo="ວັນທີສັ່ງຊ່າງ" value={formatDate(row.sentToSmithAt)} />
                          <Detail labelLo="ວັນທີຮັບເຄື່ອງຈາກຊ່າງ" value={formatDate(row.receivedFromSmithAt)} />
                          <Detail labelLo="ວັນທີລູກຄ້າມາຮັບເຄື່ອງ" value={formatDate(row.customerPickupAt)} />
                          <Detail labelLo="ຍອດ Order" value={`${formatLak(row.totalAmount)} LAK`} />
                          <Detail labelLo="ຮັບມາແລ້ວ" value={`${formatLak(row.receivedAmount)} LAK`} />
                          <Detail labelLo="ຍອດຄົງເຫຼືອ" value={`${formatLak(row.balanceAmount)} LAK`} />
                          <Detail labelLo="ສະຖານະ" value={STATUS[row.status].lo} />
                        </div>

                        <div className="section-label mt-4">ລາຍການໃນບິນ</div>
                        <table className="table mt-1">
                          <thead>
                            <tr>
                              <th>ລາຍການ</th>
                              <th className="text-right">ນ້ຳໜັກ (g)</th>
                              <th className="text-right">ຈຳນວນ</th>
                              <th className="text-right">ຍອດແຖວ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(row.lines ?? []).length === 0 && (
                              <tr>
                                {/* ບິນເກົ່າກ່ອນມີຕາຕະລາງແຖວ. */}
                                <td>{row.goldItem.nameLo}</td>
                                <td className="num text-right">{formatWeight(row.weightG)}</td>
                                <td className="num text-right">{row.quantity}</td>
                                <td className="num text-right">{formatLak(row.totalAmount)}</td>
                              </tr>
                            )}
                            {(row.lines ?? []).map((line) => (
                              <tr key={line.id}>
                                <td>{line.goldItem.nameLo}</td>
                                <td className="num text-right">{formatWeight(line.weightG)}</td>
                                <td className="num text-right">{line.quantity}</td>
                                <td className="num text-right">
                                  {line.amount ? formatLak(line.amount) : '—'}
                                </td>
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
        <Pagination {...pager} />
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          ★ ເງິນມັດຈໍາບັນທຶກເປັນ +Advance · ເມື່ອຢືນຢັນລູກຄ້າຮັບເຄື່ອງ ຈະຕັດ −Advance.
          ເມື່ອຍອດຄົງເຫຼືອ = 0 ລະບົບປ່ຽນສະຖານະເປັນ Completed ອັດຕະໂນມັດ.
        </p>
      </div>
    </div>
  );
}

/** ຊ່ອງລາຍລະອຽດໃນແຖວ View. */
function Detail({ labelLo, value }: { labelLo: string; value: string }) {
  return (
    <div>
      <div className="section-label">{labelLo}</div>
      <div className="num mt-0.5 font-semibold text-fg-strong">{value}</div>
    </div>
  );
}
