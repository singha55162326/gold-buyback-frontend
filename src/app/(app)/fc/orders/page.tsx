'use client';

import { useState } from 'react';
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

interface Order {
  id: string; code: string; billNo: string; productType: 'IT' | 'ITP';
  staffName: string; weightG: string; quantity: number;
  totalAmount: string; receivedAmount: string; balanceAmount: string;
  status: OrderStatus; note: string | null; createdAt: string;
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
  const [error, setError] = useState<string | null>(null);

  // create form
  const [phone, setPhone] = useState('');
  const [billNo, setBillNo] = useState('');
  const [productType, setProductType] = useState<'IT' | 'ITP'>('IT');
  const [staffName, setStaffName] = useState('');
  const [goldItemId, setGoldItemId] = useState('');
  const [weightG, setWeightG] = useState('');
  const [quantity, setQuantity] = useState(1);
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

  const create = useMutation({
    mutationFn: () =>
      api.post('/orders', {
        phone, billNo, productType, staffName, goldItemId,
        weightG: weightG.trim(), quantity,
        totalAmount: totalAmount.replace(/,/g, '').trim(),
        note: note || undefined,
        receipts: paymentPayload(payments),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setShowAdd(false);
      setPhone(''); setBillNo(''); setStaffName(''); setWeightG('');
      setQuantity(1); setTotalAmount(''); setPayments(newPaymentLines()); setNote('');
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
    goldItemId && Number(weightG) > 0 && Number(totalAmount.replace(/,/g, '')) > 0 &&
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
              <label className="label" htmlFor="goldItem">ລາຍການ</label>
              <select id="goldItem" className="input" value={goldItemId}
                onChange={(e) => setGoldItemId(e.target.value)}>
                <option value="">— ເລືອກລາຍການ —</option>
                {goldItems.map((i) => <option key={i.id} value={i.id}>{i.nameLo}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="weightG">ນ້ຳໜັກ (g)</label>
              <NumberInput id="weightG" className="input num" decimals={4} value={weightG}
                onValueChange={setWeightG} />
            </div>
            <div>
              <label className="label" htmlFor="qty">ຈຳນວນ</label>
              <input id="qty" className="input num" type="number" min={1} value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label" htmlFor="total">TOTAL (LAK)</label>
              <NumberInput id="total" className="input num" decimals={0} value={totalAmount}
                onValueChange={setTotalAmount} />
            </div>
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
                <tr key={row.id}>
                  {/* ລາຍການ / Supplier / ຍອດລວມ ບໍ່ຢູ່ໃນຖັນທີ່ລູກຄ້າຂໍ ແຕ່ຍັງ
                      ຕ້ອງເຂົ້າເຖິງໄດ້ — ວາງໄວ້ເປັນ tooltip ຂອງລະຫັດ Order. */}
                  <td className="font-mono text-xs"
                    title={`ລາຍການ: ${row.goldItem.nameLo} · ແຫຼ່ງທີ່ມາ: ${row.supplier?.nameLo ?? '—'} · ຍອດ Order: ${formatLak(row.totalAmount)}`}>
                    {row.code}
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
                      {!NEXT[row.status] && Number(row.balanceAmount) === 0 && (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </div>
                  </td>
                </tr>
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
