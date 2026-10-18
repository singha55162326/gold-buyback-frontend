'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { statusClass } from '@/lib/status';

interface GoldType { id: string; nameLo: string }
interface GoldItem { id: string; nameLo: string }
interface Sku { id: string; fullSkuName: string; weightG: string }
interface Cabinet { id: string; nameLo: string }

interface OldLine {
  goldTypeId: string; goldItemId: string;
  weightG: string; quantity: number; standardWeightG: string;
}
interface NewLine {
  goldSkuId: string; cabinetId: string;
  weightG: string; quantity: number; patternFee: string;
}
interface RemainingLine { weightG: string; quantity: number }

interface Preview {
  standardOldWeightG: string; actualOldWeightG: string;
  totalNewWeightG: string; totalRemainingWeightG: string;
  softGoldFee: string; humpFee: string; barConvertFee: string; patternFee: string;
  shopBuybackPrice: string; totalPayable: string;
  isBalanced: boolean; difference: string; messageLo: string | null;
}

interface ExchangeRow {
  id: string; code: string; txnType: string; totalPayable: string;
  outstandingAmount: string; status: string; createdAt: string;
  updatedBy: string;
  customer: { phone: string };
  oldLines: Array<{ id: string; weightG: string; quantity: number }>;
  newLines: Array<{ id: string; weightG: string; quantity: number }>;
}

const emptyOld = (): OldLine => ({
  goldTypeId: '', goldItemId: '', weightG: '', quantity: 1, standardWeightG: '',
});
const emptyNew = (): NewLine => ({
  goldSkuId: '', cabinetId: '', weightG: '', quantity: 1, patternFee: '',
});

/**
 * TOR §5.2 — ລາຍການປ່ຽນເປັນເງິນ.
 *
 * The totals and the ⚠ zero-balance check come from the API on every change,
 * because §5.2 depends on the ຄ່າປ່ຽນ tables and the live price snapshot. The
 * Save button mirrors exactly the rule the API enforces, so the user sees the
 * same verdict the server will give.
 */
export default function ExchangePage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [phone, setPhone] = useState('');
  const [txnType, setTxnType] = useState<'EXCHANGE_TO_CASH' | 'FREE_EXCHANGE'>('EXCHANGE_TO_CASH');
  const [shapeCondition, setShapeCondition] = useState<'GOOD' | 'DAMAGED'>('GOOD');
  const [oldLines, setOldLines] = useState<OldLine[]>([emptyOld()]);
  const [newLines, setNewLines] = useState<NewLine[]>([emptyNew()]);
  const [remainingLines, setRemainingLines] = useState<RemainingLine[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: goldTypes = [] } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types?stockOnly=true'),
  });
  const { data: goldItems = [] } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const { data: skus = [] } = useQuery({
    queryKey: ['skus'],
    queryFn: () => api.get<Sku[]>('/skus'),
  });
  const { data: cabinets = [] } = useQuery({
    queryKey: ['catalog', 'cabinets'],
    queryFn: () => api.get<Cabinet[]>('/catalog/cabinets'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['exchange'],
    queryFn: () => api.get<ExchangeRow[]>('/exchange'),
  });

  /** The request body, shared by preview and save so they cannot diverge. */
  const payload = useMemo(
    () => ({
      phone: phone || '00000000',
      txnType,
      shapeCondition,
      oldLines: oldLines
        .filter((l) => l.goldTypeId && Number(l.weightG) > 0 && Number(l.standardWeightG) > 0)
        .map((l) => ({
          goldTypeId: l.goldTypeId,
          goldItemId: l.goldItemId || undefined,
          weightG: l.weightG.trim(),
          quantity: l.quantity,
          standardWeightG: l.standardWeightG.trim(),
        })),
      newLines: newLines
        .filter((l) => l.goldSkuId && Number(l.weightG) > 0)
        .map((l) => ({
          goldSkuId: l.goldSkuId,
          cabinetId: l.cabinetId || undefined,
          weightG: l.weightG.trim(),
          quantity: l.quantity,
          patternFee: l.patternFee.trim() || undefined,
        })),
      remainingLines: remainingLines
        .filter((l) => Number(l.weightG) > 0)
        .map((l) => ({ weightG: l.weightG.trim(), quantity: l.quantity })),
    }),
    [phone, txnType, shapeCondition, oldLines, newLines, remainingLines],
  );

  /* Re-price and re-check the balance on every change. */
  useEffect(() => {
    if (payload.oldLines.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .post<Preview>('/exchange/preview', payload)
        .then((result) => {
          if (!cancelled) { setPreview(result); setError(null); }
        })
        .catch((e) => {
          if (!cancelled) {
            setPreview(null);
            setError(e instanceof ApiError ? e.message : null);
          }
        });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [payload]);

  const create = useMutation({
    mutationFn: () => api.post('/exchange', { ...payload, phone }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setPhone(''); setOldLines([emptyOld()]); setNewLines([emptyNew()]);
      setRemainingLines([]); setPreview(null); setError(null);
      void queryClient.invalidateQueries({ queryKey: ['exchange'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const setOld = (i: number, patch: Partial<OldLine>) =>
    setOldLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setNew = (i: number, patch: Partial<NewLine>) =>
    setNewLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setRemaining = (i: number, patch: Partial<RemainingLine>) =>
    setRemainingLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const canSave = /^\d{8}$/.test(phone) && preview?.isBalanced === true;

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຍການປ່ຽນເປັນເງິນ"
        subtitle="Gold Exchange & Trade-in — ນ້ຳໜັກຕ້ອງສົມດຸນພໍດີຈຶ່ງບັນທຶກໄດ້ (TOR §5.2)"
      />

      {error && (
        <div id="exchange-error" role="alert" className="notice status-danger">{error}</div>
      )}

      <div data-fade className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="phone">ເບີໂທ (8 ໂຕ)</label>
            <input id="phone" className="input input-lg num" inputMode="numeric" maxLength={8}
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label className="label" htmlFor="txnType">ທຸລະກຳ</label>
            <select id="txnType" className="input input-lg" value={txnType}
              onChange={(e) => setTxnType(e.target.value as typeof txnType)}>
              <option value="EXCHANGE_TO_CASH">ປ່ຽນເປັນເງິນ</option>
              <option value="FREE_EXCHANGE">ປ່ຽນຟຣີ</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="shape">ຮູບປະພັນ</label>
            <select id="shape" className="input input-lg" value={shapeCondition}
              onChange={(e) => setShapeCondition(e.target.value as 'GOOD' | 'DAMAGED')}>
              <option value="GOOD">ດີ</option>
              <option value="DAMAGED">ເສຍ</option>
            </select>
          </div>
        </div>
      </div>

      {/* ---- ລາຍການຄຳເກົ່າ ---- */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການຄຳເກົ່າ</h2>
          <button className="btn-secondary"
            onClick={() => setOldLines((p) => [...p, emptyOld()])}>
            + Add
          </button>
        </div>
        <div className="space-y-3 p-5">
          {oldLines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_0.8fr_1fr_auto]">
              <select aria-label={`ລາຍການຄຳເກົ່າ — ປະເພດຄຳ ${i + 1}`} className="input" value={line.goldTypeId}
                onChange={(e) => setOld(i, { goldTypeId: e.target.value })}>
                <option value="">ປະເພດຄຳ</option>
                {goldTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
              </select>
              <select aria-label={`ລາຍການຄຳເກົ່າ — ລາຍການຄຳ ${i + 1}`} className="input" value={line.goldItemId}
                onChange={(e) => setOld(i, { goldItemId: e.target.value })}>
                <option value="">ລາຍການຄຳ</option>
                {goldItems.map((it) => <option key={it.id} value={it.id}>{it.nameLo}</option>)}
              </select>
              <input aria-label={`ລາຍການຄຳເກົ່າ — ນ້ຳໜັກ (g) ${i + 1}`} className="input num" inputMode="decimal" placeholder="ນ້ຳໜັກ (g)"
                value={line.weightG} onChange={(e) => setOld(i, { weightG: e.target.value })} />
              <input aria-label={`ລາຍການຄຳເກົ່າ — ຈຳນວນ ${i + 1}`} className="input num" type="number" min={1} value={line.quantity}
                onChange={(e) => setOld(i, { quantity: Number(e.target.value) || 1 })} />
              <input aria-label={`ລາຍການຄຳເກົ່າ — ເກນ standard (g) ${i + 1}`} className="input num" inputMode="decimal" placeholder="ເກນ standard (g)"
                value={line.standardWeightG}
                onChange={(e) => setOld(i, { standardWeightG: e.target.value })} />
              <button className="btn-danger px-3" disabled={oldLines.length === 1}
                onClick={() => setOldLines((p) => p.filter((_, idx) => idx !== i))}>
                ລຶບ
              </button>
            </div>
          ))}
          <p className="text-xs text-muted">
            ຄ່າອ່ອນຄິດຈາກນ້ຳໜັກທີ່ຫຼຸດຈາກເກນ standard — ຄຳທີ່ຄົບເກນບໍ່ເສຍຄ່າອ່ອນ
          </p>
        </div>
      </div>

      {/* ---- ລາຍການຄຳໃໝ່ ---- */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການຄຳໃໝ່</h2>
          <button className="btn-secondary"
            onClick={() => setNewLines((p) => [...p, emptyNew()])}>
            + Add
          </button>
        </div>
        <div className="space-y-3 p-5">
          {newLines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_0.8fr_1fr_1.2fr_auto]">
              <select aria-label={`ລາຍການຄຳໃໝ່ — ລາຍການ (SKU) ${i + 1}`} className="input" value={line.goldSkuId}
                onChange={(e) => {
                  const sku = skus.find((s) => s.id === e.target.value);
                  setNew(i, {
                    goldSkuId: e.target.value,
                    // Default the weight to the SKU's own, which is what it
                    // will almost always be.
                    weightG: sku ? String(Number(sku.weightG)) : line.weightG,
                  });
                }}>
                <option value="">ລາຍການ (SKU)</option>
                {skus.map((s) => <option key={s.id} value={s.id}>{s.fullSkuName}</option>)}
              </select>
              <input aria-label={`ລາຍການຄຳໃໝ່ — ນ້ຳໜັກ (g) ${i + 1}`} className="input num" inputMode="decimal" placeholder="ນ້ຳໜັກ (g)"
                value={line.weightG} onChange={(e) => setNew(i, { weightG: e.target.value })} />
              <input aria-label={`ລາຍການຄຳໃໝ່ — ຈຳນວນ ${i + 1}`} className="input num" type="number" min={1} value={line.quantity}
                onChange={(e) => setNew(i, { quantity: Number(e.target.value) || 1 })} />
              <input aria-label={`ລາຍການຄຳໃໝ່ — ຄ່າລາຍ ${i + 1}`} className="input num" inputMode="decimal" placeholder="ຄ່າລາຍ"
                value={line.patternFee} onChange={(e) => setNew(i, { patternFee: e.target.value })} />
              <select aria-label={`ລາຍການຄຳໃໝ່ — ຕູ້ເຄື່ອງ ${i + 1}`} className="input" value={line.cabinetId}
                onChange={(e) => setNew(i, { cabinetId: e.target.value })}>
                <option value="">ຕູ້ເຄື່ອງ</option>
                {cabinets.map((c) => <option key={c.id} value={c.id}>{c.nameLo}</option>)}
              </select>
              <button className="btn-danger px-3" disabled={newLines.length === 1}
                onClick={() => setNewLines((p) => p.filter((_, idx) => idx !== i))}>
                ລຶບ
              </button>
            </div>
          ))}
          <p className="text-xs text-muted">
            ຄ່າຫຍຸບ ແລະ ຄ່າປ່ຽນຄຳແທ່ງ ດຶງຈາກຕາຕະລາງ ຄ່າປ່ຽນ ອັດຕະໂນມັດ
            {txnType === 'FREE_EXCHANGE' && ' — ປ່ຽນຟຣີ: ຄ່າປ່ຽນທັງໝົດ = 0'}
          </p>
        </div>
      </div>

      {/* ---- ຄຳເກົ່າຄົງເຫຼືອ ---- */}
      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ຄຳເກົ່າຄົງເຫຼືອ</h2>
          <button className="btn-secondary"
            onClick={() => setRemainingLines((p) => [...p, { weightG: '', quantity: 1 }])}>
            + Add
          </button>
        </div>
        <div className="space-y-3 p-5">
          {remainingLines.length === 0 && (
            <p className="text-sm text-muted">ບໍ່ມີຄຳເກົ່າຄົງເຫຼືອ</p>
          )}
          {remainingLines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input aria-label={`ຄຳເກົ່າຄົງເຫຼືອ — ນ້ຳໜັກ (g) ${i + 1}`} className="input num" inputMode="decimal" placeholder="ນ້ຳໜັກ (g)"
                value={line.weightG} onChange={(e) => setRemaining(i, { weightG: e.target.value })} />
              <input aria-label={`ຄຳເກົ່າຄົງເຫຼືອ — ຈຳນວນ ${i + 1}`} className="input num" type="number" min={1} value={line.quantity}
                onChange={(e) => setRemaining(i, { quantity: Number(e.target.value) || 1 })} />
              <button className="btn-danger px-3"
                onClick={() => setRemainingLines((p) => p.filter((_, idx) => idx !== i))}>
                ລຶບ
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ---- ສະຫຼຸບ + the save gate ---- */}
      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ສະຫຼຸບ</h2></div>
        <div className="p-5 pb-0">
          <div className="recessed rounded-xl p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field labelLo="ລາຄາຊື້ຄືນໜ້າຮ້ານ" value={preview ? formatLak(preview.shopBuybackPrice) : '—'} />
              <Field labelLo="ຄ່າອ່ອນ" value={preview ? formatLak(preview.softGoldFee) : '—'} />
              <Field labelLo="ຄ່າຫຍຸບ" value={preview ? formatLak(preview.humpFee) : '—'} />
              <Field labelLo="ຄ່າປ່ຽນຄຳແທ່ງ" value={preview ? formatLak(preview.barConvertFee) : '—'} />
              <Field labelLo="ຄ່າລາຍ" value={preview ? formatLak(preview.patternFee) : '—'} />
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <Field labelLo="ລວມເງິນຕ້ອງຈ່າຍ"
                value={preview ? formatLak(preview.totalPayable) : '—'} strong />
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field labelLo="ເກນນ້ຳໜັກຄຳເກົ່າ"
              value={preview ? `${formatWeight(preview.standardOldWeightG)} g` : '—'} />
            <Field labelLo="ລວມນ້ຳໜັກຄຳໃໝ່"
              value={preview ? `${formatWeight(preview.totalNewWeightG)} g` : '—'} />
            <Field labelLo="ລວມຄຳເກົ່າຄົງເຫຼືອ"
              value={preview ? `${formatWeight(preview.totalRemainingWeightG)} g` : '—'} />
          </div>

          {/* ⚠ TOR §5.2 CRITICAL — the gate on saving. */}
          <div
            role="status"
            className={`notice mt-4 ${
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

          <div className="mt-4">
            <button className="btn-primary min-h-[54px] w-full sm:w-auto sm:min-w-[240px]"
              aria-describedby={error ? 'exchange-error' : undefined} disabled={!canSave || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກລາຍການ'}
            </button>
          </div>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">History ປ່ຽນເປັນເງິນ</h2>
          <span className="num text-xs text-muted">{rows.length} ລາຍການ</span>
        </div>
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
                <th>ຜູ້ແກ້ໄຂ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-muted">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {rows.map((row) => {
                const oldG = row.oldLines.reduce((s, l) => s + Number(l.weightG) * l.quantity, 0);
                const newG = row.newLines.reduce((s, l) => s + Number(l.weightG) * l.quantity, 0);
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td>{row.txnType === 'FREE_EXCHANGE' ? 'ປ່ຽນຟຣີ' : 'ປ່ຽນເປັນເງິນ'}</td>
                    <td className="num text-right">{formatWeight(String(oldG))}</td>
                    <td className="num text-right">{formatWeight(String(newG))}</td>
                    <td className="num text-right font-medium">{formatLak(row.totalPayable)}</td>
                    <td className="num text-right">{formatLak(row.outstandingAmount)}</td>
                    <td><span className={statusClass(row.status)}>{row.status}</span></td>
                    <td className="text-muted">{row.updatedBy}</td>
                  </tr>
                );
              })}
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
