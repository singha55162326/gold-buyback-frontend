'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec } from '@kpv/domain';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { MultiPayment, newPaymentLines, paymentPayload, type PaymentLine } from '@/components/multi-payment';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import type { PagedResult } from '@/components/date-range';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';

interface GoldItem { id: string; nameLo: string }
interface Cabinet { id: string; nameLo: string }
interface Bank { id: string; nameLo: string }

interface Credit {
  id: string; code: string; weightG: string; quantity: number;
  sellPrice: string; downPayment: string; outstanding: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  customer: { phone: string };
  goldItem: { nameLo: string };
}

const STATUS: Record<Credit['status'], { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ — ຕິດໜີ້' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ຊຳຣະຄົບ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

/**
 * TOR §5.3 — ລາຍການສິນເຊື່ອ (Gold Credit / Installment).
 *
 *   ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ
 *
 * The API caps LAK change from foreign notes at 1,000 THB / 100 USD (§5.3) —
 * the shop takes foreign currency as a convenience, not as an exchange desk.
 */
export default function CreditPage() {
  const queryClient = useQueryClient();
  // The history is the landing view; the form opens on demand.
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();
  const user = getStoredUser();
  const canReceive = user?.role === 'PAYMENT' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

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
  const [instalmentPayments, setInstalmentPayments] = useState<PaymentLine[]>(newPaymentLines());
  const [amount, setAmount] = useState('');
  const [instalment, setInstalment] = useState<Credit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: goldItems = [], isError: goldItemsFailed, error: goldItemsError, refetch: refetchGoldItems } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const { data: cabinets = [], isError: cabinetsFailed, error: cabinetsError, refetch: refetchCabinets } = useQuery({
    queryKey: ['catalog', 'cabinets'],
    queryFn: () => api.get<Cabinet[]>('/catalog/cabinets'),
  });
  const { data: banks = [], isError: banksFailed, error: banksError, refetch: refetchBanks } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const history = useHistoryRange<Credit>(['credit'], '/credit');
  const credits = history.rows;
  const creditsFailed = history.isError;
  const creditsError = history.error;
  const refetchCredits = history.refetch;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['credit'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/credit', {
        phone, goldItemId,
        cabinetId: cabinetId || undefined,
        weightG: weightG.trim(), quantity,
        sellPrice: sellPrice.replace(/,/g, '').trim(),
        downPayment: downPayment.replace(/,/g, '').trim(),
        receipts: paymentPayload(payments),
      }),
    onSuccess: () => {
      setShowForm(false);
      toast.success('ດຳເນີນການສຳເລັດ');
      setPhone(''); setWeightG(''); setQuantity(1); setSellPrice('');
      setDownPayment(''); setAmount(''); setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const receive = useMutation({
    mutationFn: (credit: Credit) =>
      api.post(`/credit/${credit.id}/receipts`, {
        receipts: paymentPayload(instalmentPayments),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setInstalment(null); setInstalmentPayments(newPaymentLines()); setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຮັບເງິນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  /** ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ */
  const outstanding = useMemo(() => {
    const sell = sellPrice.replace(/,/g, '').trim();
    const down = downPayment.replace(/,/g, '').trim();
    if (!/^\d+(\.\d+)?$/.test(sell)) return null;
    const downValue = /^\d+(\.\d+)?$/.test(down) ? down : '0';
    const result = dec(sell).minus(dec(downValue));
    return result.isNegative() ? null : result.toFixed();
  }, [sellPrice, downPayment]);

  // Every leg must name a bank when it is a transfer, and carry an amount.
  const legsReady = (lines: PaymentLine[]) =>
    paymentPayload(lines).length > 0 &&
    lines.every((l) => l.method === 'CASH' || !l.amount.trim() || Boolean(l.bankAccountId));

  const canSave =
    /^\d{8}$/.test(phone) && goldItemId && Number(weightG) > 0 &&
    outstanding !== null && legsReady(payments);

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການສິນເຊື່ອ"
        subtitle="ຂາຍຄຳແບບວາງດາວ — ຍອດຕິດໜີ້ບັນທຶກເປັນ AR (Cash) ຫຼັງ payment ອະນຸມັດ (TOR §5.3)"
        actions={
          <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'ປິດຟອມ' : '+ ສ້າງລາຍການສິນເຊື່ອ'}
          </button>
        }
      />
      {goldItemsFailed && <QueryErrorNotice error={goldItemsError} onRetry={() => void refetchGoldItems()} />}
      {cabinetsFailed && <QueryErrorNotice error={cabinetsError} onRetry={() => void refetchCabinets()} />}
      {banksFailed && <QueryErrorNotice error={banksError} onRetry={() => void refetchBanks()} />}

      {error && (
        <div id="credit-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {showForm && (
      <div data-fade className="card p-5">
        <h2 className="card-title mb-4">ຟອມສິນເຊື່ອ</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
            <input id="phone" className="input input-lg num" inputMode="numeric" maxLength={8}
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="label" htmlFor="goldItem">ລາຍການຄຳ</label>
            <select id="goldItem" className="input input-lg" value={goldItemId}
              onChange={(e) => setGoldItemId(e.target.value)}>
              <option value="">— ເລືອກລາຍການຄຳ —</option>
              {goldItems.map((i) => <option key={i.id} value={i.id}>{i.nameLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="weightG">ນ້ຳໜັກ (g)</label>
            <NumberInput decimals={4} id="weightG" className="input input-lg num" value={weightG}
              onValueChange={setWeightG} />
          </div>
          <div>
            <label className="label" htmlFor="qty">ຈຳນວນ</label>
            <input id="qty" className="input input-lg num" type="number" min={1} value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
          </div>
          <div>
            <label className="label" htmlFor="sellPrice">ລາຄາຂາຍ (LAK)</label>
            <NumberInput decimals={0} id="sellPrice" className="input input-lg num" value={sellPrice}
              onValueChange={setSellPrice} />
          </div>
          <div>
            <label className="label" htmlFor="downPayment">ເງິນວາງດາວ (LAK)</label>
            <NumberInput decimals={0} id="downPayment" className="input input-lg num" value={downPayment}
              onValueChange={setDownPayment} />
          </div>
          <div>
            <label className="label" htmlFor="cabinet">ຕູ້ເຄື່ອງ</label>
            <select id="cabinet" className="input input-lg" value={cabinetId}
              onChange={(e) => setCabinetId(e.target.value)}>
              <option value="">— ເລືອກຕູ້ເຄື່ອງ —</option>
              {cabinets.map((c) => <option key={c.id} value={c.id}>{c.nameLo}</option>)}
            </select>
          </div>
        </div>

        <div className="recessed mt-5 rounded-xl p-4 sm:p-5">
          <div className="section-label">
            ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ
          </div>
          <div className="num mt-1 text-[26px] font-semibold text-fg-strong">
            {outstanding === null ? '—' : `${formatLak(outstanding)} LAK`}
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <h3 className="label">Receive — ເງິນວາງດາວ</h3>
          <MultiPayment
            lines={payments}
            onChange={setPayments}
            owedLak={downPayment.replace(/,/g, '')}
            direction="in"
            labelLo="ຮັບເງິນ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ)"
          />
          <p className="mt-2 text-xs text-muted">
            ຮັບເງິນ (LAK) ຕ້ອງ ≥ ເງິນວາງດາວ · ເງິນທອນຈາກ THB ບໍ່ເກີນ 1,000 THB, ຈາກ USD ບໍ່ເກີນ 100 USD
          </p>
        </div>

        <div className="mt-4">
          <button className="btn-primary min-h-[54px] w-full sm:w-auto sm:min-w-[240px]"
            aria-describedby={error ? 'credit-error' : undefined} disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ສ້າງລາຍການສິນເຊື່ອ'}
          </button>
        </div>
      </div>
      )}

      {instalment && (
        <div data-fade className="card p-5">
          <h2 className="card-title mb-4">
            ຮັບຄ່າງວດ — {instalment.code} (ຕິດໜີ້ {formatLak(instalment.outstanding)} LAK)
          </h2>
          <MultiPayment
            lines={instalmentPayments}
            onChange={setInstalmentPayments}
            owedLak={instalment.outstanding}
            direction="in"
            labelLo="ຮັບຄ່າງວດ (ສົດ / ໂອນ, ຫຼາຍສະກຸນເງິນ)"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary min-h-[54px]"
              disabled={!legsReady(instalmentPayments) || receive.isPending}
              onClick={() => receive.mutate(instalment)}>
              {receive.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຮັບເງິນ'}
            </button>
            <button className="btn-secondary" onClick={() => setInstalment(null)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">History ສິນເຊື່ອ</h2>
          <span className="num text-xs text-muted">{credits.length} ລາຍການ</span>
        </div>
        <DateRangeFilter history={history} />
        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ສິນເຊື່ອ">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດ</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ທຸລະກຳ</th>
                <th className="text-right">ນ້ຳໜັກລວມ (g)</th>
                <th className="text-right">ຈຳນວນລວມ</th>
                <th className="text-right">ລວມຍອດສິນເຊື່ອຕິດໜີ້</th>
                <th className="text-right">ລວມເງິນວາງດາວທີ່ຮັບ</th>
                <th className="text-right">ຄ້າງຮັບ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={13} isError={creditsFailed} error={creditsError} isEmpty={credits.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={() => void refetchCredits()} />
              {credits.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td className="num">{row.customer.phone}</td>
                  <td>{row.goldItem.nameLo}</td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{row.quantity}</td>
                  <td className="num sell-price text-right">{formatLak(row.sellPrice)}</td>
                  <td className="num text-right">{formatLak(row.downPayment)}</td>
                  <td className="num text-right font-medium">{formatLak(row.outstanding)}</td>
                  <td>
                    <span className={statusClass(row.status)}>{STATUS[row.status].lo}</span>
                  </td>
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-muted">{row.updatedBy}</td>
                  <td className="text-right">
                    {row.status === 'APPROVED' && Number(row.outstanding) > 0 && canReceive ? (
                      <button className="btn-primary"
                        onClick={() => { setInstalment(row); setAmount(''); }}>
                        ຮັບຄ່າງວດ
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
