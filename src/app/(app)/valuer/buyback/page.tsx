'use client';

import { Fragment, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { statusClass } from '@/lib/status';

interface GoldType { id: string; code: string; nameLo: string }
interface GoldItem { id: string; nameLo: string }
interface BankAccount { id: string; code: string; nameLo: string }

interface Preview {
  kind: string;
  shopBuybackPrice: string;
  deduction: string;
  payableAmount: string;
  branch: string;
}

interface BuybackPayment {
  id: string; method: string; currency: string;
  amount: string; amountLak: string; changeLak: string;
}

interface BuybackRow {
  id: string;
  code: string;
  source: 'KPV' | 'OTHER_SHOP';
  goldPercent: string | null;
  outstandingAmount: string;
  updatedBy: string;
  payments: BuybackPayment[];
  goldItem: { nameLo: string } | null;
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
  const toast = useToast();
  const user = getStoredUser();
  const canConfirm = user?.role === 'VALUER' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<'KPV' | 'OTHER_SHOP'>('KPV');
  const [goldTypeId, setGoldTypeId] = useState('');
  const [goldItemId, setGoldItemId] = useState('');
  const [weightG, setWeightG] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [goldPercent, setGoldPercent] = useState('');
  const [deduction, setDeduction] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: goldTypes = [] } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types?stockOnly=true'),
  });
  const { data: goldItems = [] } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<BankAccount[]>('/catalog/bank-accounts'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['buyback'],
    queryFn: () => api.get<BuybackRow[]>('/buyback'),
  });

  /* Re-price whenever the inputs change. */
  useEffect(() => {
    const ready = goldTypeId && weightG.trim() && Number(weightG) > 0;
    if (!ready) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .post<Preview>('/buyback/preview', {
          source,
          goldTypeId,
          weightG: weightG.trim(),
          quantity,
          goldPercent: goldPercent.trim() || undefined,
          deduction: deduction.trim() || undefined,
        })
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
  }, [source, goldTypeId, weightG, quantity, goldPercent, deduction]);

  const create = useMutation({
    mutationFn: () =>
      api.post('/buyback', {
        phone,
        source,
        goldTypeId,
        goldItemId: goldItemId || undefined,
        weightG: weightG.trim(),
        quantity,
        goldPercent: goldPercent.trim() || undefined,
        deduction: deduction.trim() || undefined,
        payments: [
          {
            method,
            bankAccountId: method === 'BANK' ? bankAccountId : undefined,
            currency,
            amount: amount.trim() || preview?.payableAmount || '0',
          },
        ],
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setPhone(''); setWeightG(''); setQuantity(1); setGoldPercent('');
      setDeduction(''); setAmount(''); setPreview(null); setError(null);
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
  const canSave =
    /^\d{8}$/.test(phone) && preview !== null && Number(preview.payableAmount) > 0;

  return (
    <div className="space-y-6">
      <PageHead
        title="Buyback — ການຊື້ຄຳຄືນ"
        subtitle="ຄຳຮ້ານ KPV ແລະ ຄຳຮ້ານອື່ນ (ຄຳຕົ້ມ) — ສ້າງລາຍການສົ່ງໃຫ້ payment ອະນຸມັດ (TOR §5.1)"
      />

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

          <div>
            <label className="label" htmlFor="goldType">ປະເພດຄຳ</label>
            <select id="goldType" className="input input-lg" value={goldTypeId}
              onChange={(e) => setGoldTypeId(e.target.value)}>
              <option value="">— ເລືອກປະເພດຄຳ —</option>
              {goldTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
            </select>
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
            <input id="weightG" className="input input-lg num" inputMode="decimal" placeholder="15"
              value={weightG} onChange={(e) => setWeightG(e.target.value)} />
          </div>

          <div>
            <label className="label" htmlFor="quantity">ຈຳນວນ</label>
            <input id="quantity" className="input input-lg num" type="number" min={1}
              value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
          </div>

          {isBoiled && (
            <div>
              <label className="label" htmlFor="goldPercent">%ຄຳ</label>
              <input id="goldPercent" className="input input-lg num" inputMode="decimal" placeholder="96"
                value={goldPercent} onChange={(e) => setGoldPercent(e.target.value)} />
            </div>
          )}

          {!isBoiled && (
            <div>
              <label className="label" htmlFor="deduction">ຄ່າອ່ອນ / ຄ່າຫັກ (ຕໍ່ຊິ້ນ)</label>
              <input id="deduction" className="input input-lg num" inputMode="decimal" placeholder="0"
                value={deduction} onChange={(e) => setDeduction(e.target.value)} />
            </div>
          )}
        </div>

        {/* Live §5.1 result */}
        <div className="recessed mt-5 grid gap-4 rounded-xl p-4 sm:grid-cols-3 sm:p-5">
          <Field labelLo="ລາຄາຊື້ຄືນໜ້າຮ້ານ" value={preview ? formatLak(preview.shopBuybackPrice) : '—'} />
          <Field labelLo="ຄ່າອ່ອນ / ຄ່າຫັກ" value={preview ? formatLak(preview.deduction) : '—'} />
          <Field labelLo="ລາຄາທີ່ຕ້ອງຈ່າຍ" value={preview ? formatLak(preview.payableAmount) : '—'} strong />
          {preview && (
            <div className="text-xs text-muted sm:col-span-3">
              ສູດທີ່ໃຊ້: <span className="font-medium text-fg">{preview.branch}</span>
            </div>
          )}
        </div>

        {/* Payment */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="method">Payment Method</label>
            <select id="method" className="input input-lg" value={method}
              onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')}>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
            </select>
          </div>

          {method === 'BANK' && (
            <div>
              <label className="label" htmlFor="bank">Select Bank</label>
              <select id="bank" className="input input-lg" value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">— ເລືອກທະນາຄານ —</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.nameLo}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="currency">Currency</label>
            <select id="currency" className="input input-lg" value={currency}
              onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}>
              <option value="LAK">LAK</option>
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="amount">Amount</label>
            <input id="amount" className="input input-lg num" inputMode="decimal"
              placeholder={preview?.payableAmount ?? '0'} value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>

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

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ Buyback</h2>
          <span className="num text-xs text-muted">{rows.length} ລາຍການ</span>
        </div>
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
              {rows.length === 0 && (
                <tr><td colSpan={12} className="py-8 text-center text-muted">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {rows.map((row) => (
                <Fragment key={row.id}>
                <tr>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td className="num">{row.customer.phone}</td>
                  <td>{row.source === 'KPV' ? 'ຄຳຮ້ານ KPV' : 'ຄຳຮ້ານອື່ນ'}</td>
                  <td>{row.goldType.nameLo}</td>
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
                      <div className="grid gap-4 sm:grid-cols-4">
                        <Field labelLo="ລາຍການຄຳ" value={row.goldItem?.nameLo ?? '—'} />
                        <Field labelLo="ນ້ຳໜັກ (g)" value={formatWeight(row.weightG)} />
                        <Field labelLo="ຈຳນວນ" value={String(row.quantity)} />
                        <Field labelLo="%ຄຳ" value={row.goldPercent ? `${Number(row.goldPercent)}%` : '—'} />
                      </div>
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
                              <td>{pmt.method}</td>
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
