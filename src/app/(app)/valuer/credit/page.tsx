'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec } from '@kpv/domain';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';

interface GoldItem { id: string; nameLo: string }
interface Cabinet { id: string; nameLo: string }
interface Bank { id: string; nameLo: string }

interface Credit {
  id: string; code: string; weightG: string; quantity: number;
  sellPrice: string; downPayment: string; outstanding: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  updatedBy: string;
  createdAt: string;
  customer: { phone: string };
  goldItem: { nameLo: string };
}

const STATUS: Record<Credit['status'], { lo: string; cls: string }> = {
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ — ຕິດໜີ້', cls: 'bg-blue-100 text-blue-800' },
  REJECTED: { lo: 'ປະຕິເສດ', cls: 'bg-red-100 text-red-800' },
  COMPLETED: { lo: 'ຊຳຣະຄົບ', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { lo: 'ຍົກເລີກ', cls: 'bg-slate-100 text-slate-600' },
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
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [instalment, setInstalment] = useState<Credit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: goldItems = [] } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const { data: cabinets = [] } = useQuery({
    queryKey: ['catalog', 'cabinets'],
    queryFn: () => api.get<Cabinet[]>('/catalog/cabinets'),
  });
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });
  const { data: credits = [] } = useQuery({
    queryKey: ['credit'],
    queryFn: () => api.get<Credit[]>('/credit'),
  });

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
        receipt: {
          method,
          bankAccountId: method === 'BANK' ? bankAccountId : undefined,
          currency,
          amount: amount.replace(/,/g, '').trim(),
        },
      }),
    onSuccess: () => {
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
        method,
        bankAccountId: method === 'BANK' ? bankAccountId : undefined,
        currency,
        amount: amount.replace(/,/g, '').trim(),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setInstalment(null); setAmount(''); setError(null); invalidate();
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

  const canSave =
    /^\d{8}$/.test(phone) && goldItemId && Number(weightG) > 0 &&
    outstanding !== null && Number(amount.replace(/,/g, '')) > 0 &&
    (method === 'CASH' || bankAccountId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ລາຍການສິນເຊື່ອ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຂາຍຄຳແບບວາງດາວ — ຍອດຕິດໜີ້ບັນທຶກເປັນ AR (Cash) ຫຼັງ payment ອະນຸມັດ (TOR §5.3)
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="card p-5">
        <h2 className="card-title mb-4">ຟອມສິນເຊື່ອ</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
            <input id="phone" className="input num" inputMode="numeric" maxLength={8}
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="label" htmlFor="goldItem">ລາຍການຄຳ</label>
            <select id="goldItem" className="input" value={goldItemId}
              onChange={(e) => setGoldItemId(e.target.value)}>
              <option value="">— ເລືອກລາຍການຄຳ —</option>
              {goldItems.map((i) => <option key={i.id} value={i.id}>{i.nameLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="weightG">ນ້ຳໜັກ (g)</label>
            <input id="weightG" className="input num" inputMode="decimal" value={weightG}
              onChange={(e) => setWeightG(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="qty">ຈຳນວນ</label>
            <input id="qty" className="input num" type="number" min={1} value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
          </div>
          <div>
            <label className="label" htmlFor="sellPrice">ລາຄາຂາຍ (LAK)</label>
            <input id="sellPrice" className="input num" inputMode="decimal" value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="downPayment">ເງິນວາງດາວ (LAK)</label>
            <input id="downPayment" className="input num" inputMode="decimal" value={downPayment}
              onChange={(e) => setDownPayment(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="cabinet">ຕູ້ເຄື່ອງ</label>
            <select id="cabinet" className="input" value={cabinetId}
              onChange={(e) => setCabinetId(e.target.value)}>
              <option value="">— ເລືອກຕູ້ເຄື່ອງ —</option>
              {cabinets.map((c) => <option key={c.id} value={c.id}>{c.nameLo}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 rounded-md bg-slate-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            ຍອດເງິນສິນເຊື່ອຕິດໜີ້ = ລາຄາຂາຍ − ເງິນວາງດາວ
          </div>
          <div className="num mt-0.5 text-xl font-bold text-gold-700">
            {outstanding === null ? '—' : `${formatLak(outstanding)} LAK`}
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-5">
          <h3 className="label">Receive — ເງິນວາງດາວ</h3>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="label" htmlFor="method">Cash / Bank</label>
              <select id="method" className="input" value={method}
                onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
              </select>
            </div>
            {method === 'BANK' && (
              <div>
                <label className="label" htmlFor="bank">ທະນາຄານ</label>
                <select id="bank" className="input" value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}>
                  <option value="">— ເລືອກ —</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="cur">Currency (Price Rate Sell)</label>
              <select id="cur" className="input" value={currency}
                onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}>
                <option value="LAK">LAK</option>
                <option value="THB">THB</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="amt">ຈຳນວນເງິນ</label>
              <input id="amt" className="input num" inputMode="decimal"
                placeholder={downPayment || '0'} value={amount}
                onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            ຮັບເງິນ (LAK) ຕ້ອງ ≥ ເງິນວາງດາວ · ເງິນທອນຈາກ THB ບໍ່ເກີນ 1,000 THB, ຈາກ USD ບໍ່ເກີນ 100 USD
          </p>
        </div>

        <div className="mt-4">
          <button className="btn-primary" disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ສ້າງລາຍການສິນເຊື່ອ'}
          </button>
        </div>
      </div>

      {instalment && (
        <div className="card p-5">
          <h2 className="card-title mb-4">
            ຮັບຄ່າງວດ — {instalment.code} (ຕິດໜີ້ {formatLak(instalment.outstanding)} LAK)
          </h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="label" htmlFor="imethod">Cash / Bank</label>
              <select id="imethod" className="input" value={method}
                onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')}>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
              </select>
            </div>
            {method === 'BANK' && (
              <div>
                <label className="label" htmlFor="ibank">ທະນາຄານ</label>
                <select id="ibank" className="input" value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}>
                  <option value="">— ເລືອກ —</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="icur">Currency</label>
              <select id="icur" className="input" value={currency}
                onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}>
                <option value="LAK">LAK</option>
                <option value="THB">THB</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="iamt">ຈຳນວນເງິນ</label>
              <input id="iamt" className="input num" inputMode="decimal"
                placeholder={instalment.outstanding} value={amount}
                onChange={(e) => setAmount(e.target.value)} />
            </div>
            <button className="btn-primary" disabled={!amount.trim() || receive.isPending}
              onClick={() => receive.mutate(instalment)}>
              {receive.isPending ? 'ກຳລັງບັນທຶກ...' : 'ຮັບເງິນ'}
            </button>
            <button className="btn-secondary" onClick={() => setInstalment(null)}>ຍົກເລີກ</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">History ສິນເຊື່ອ</h2>
          <span className="text-xs text-slate-500">{credits.length} ລາຍການ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ລາຍການຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ</th>
                <th className="text-right">ຈຳນວນ</th>
                <th className="text-right">ລາຄາຂາຍ</th>
                <th className="text-right">ເງິນວາງດາວ</th>
                <th className="text-right">ຍອດຄ້າງຈ່າຍ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {credits.length === 0 && (
                <tr><td colSpan={12} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {credits.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td className="num">{row.customer.phone}</td>
                  <td>{row.goldItem.nameLo}</td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{row.quantity}</td>
                  <td className="num text-right">{formatLak(row.sellPrice)}</td>
                  <td className="num text-right">{formatLak(row.downPayment)}</td>
                  <td className="num text-right font-medium">{formatLak(row.outstanding)}</td>
                  <td>
                    <span className={`badge ${STATUS[row.status].cls}`}>{STATUS[row.status].lo}</span>
                  </td>
                  <td className="text-slate-500">{row.updatedBy}</td>
                  <td className="text-right">
                    {row.status === 'APPROVED' && Number(row.outstanding) > 0 && canReceive ? (
                      <button className="text-sm text-gold-700 hover:underline"
                        onClick={() => { setInstalment(row); setAmount(''); }}>
                        ຮັບຄ່າງວດ
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
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
