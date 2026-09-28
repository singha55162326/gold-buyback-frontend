'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec, GRAMS_PER_BAHT } from '@kpv/domain';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight } from '@/lib/format';

export type MovementKind = 'IN' | 'OUT' | 'TRANSFER';

interface Sku { id: string; fullSkuName: string; weightG: string }
interface GoldType { id: string; nameLo: string }
interface Partner { id: string; nameLo: string; code: string; direction: string }
interface Wac { pricePerG: string; pricePerBaht: string }

interface Line { goldSkuId: string; goldTypeId: string; weightG: string; quantity: number }

const emptyLine = (): Line => ({ goldSkuId: '', goldTypeId: '', weightG: '', quantity: 1 });

/**
 * The Stock IN / OUT / Transfer dialogs (TOR §7.2, §7.3).
 *
 * All three share the same shape — a repeatable line list with an Add button,
 * running totals, and a ລາຄາ/g that drives ຕົ້ນທຶນຄຳ — so they are one
 * component parameterised by `kind` and `scope` rather than six near-copies.
 *
 * Where the price comes from differs and matters:
 *  - IN  : the user enters ຕົ້ນທຶນຄໍາ, and ລາຄາ/g = ຕົ້ນທຶນຄໍາ / GOLD(g)
 *  - OUT and TRANSFER: ລາຄາ/g comes from the latest WAC, so cost of goods
 *    leaving reflects the blended acquisition price rather than a guess.
 */
export function StockMovementDialog({
  kind,
  scope,
  onClose,
}: {
  kind: MovementKind;
  scope: 'NEW' | 'OLD';
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [partnerId, setPartnerId] = useState('');
  const [goldTypeId, setGoldTypeId] = useState('');
  const [transferDirection, setTransferDirection] = useState<'NEW_TO_OLD' | 'OLD_TO_NEW'>(
    scope === 'NEW' ? 'NEW_TO_OLD' : 'OLD_TO_NEW',
  );
  const [transformType, setTransformType] = useState<'' | 'DYE' | 'ETCH' | 'MELT'>('');
  const [goldPercent, setGoldPercent] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [totalCost, setTotalCost] = useState('');
  const [laborFeeThb, setLaborFeeThb] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: skus = [] } = useQuery({
    queryKey: ['skus'],
    queryFn: () => api.get<Sku[]>('/skus'),
  });
  const { data: goldTypes = [] } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types?stockOnly=true'),
  });
  const { data: partners = [] } = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
  });
  const { data: wac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });

  /** IN sources vs OUT destinations differ (TOR §7.2). */
  const partnerOptions = useMemo(() => {
    if (kind === 'IN') {
      const codes =
        scope === 'NEW'
          ? ['EASY', 'FACTORY', 'OUTSOURCE_SMITH', 'OTHER']
          : ['CASHIER'];
      return partners.filter((p) => codes.includes(p.code));
    }
    const codes =
      scope === 'NEW'
        ? ['CABINET', 'WHOLESALES', 'WITHDRAW']
        : ['OUTSOURCE_SMITH', 'OTHER', 'FACTORY'];
    return partners.filter((p) => codes.includes(p.code));
  }, [partners, kind, scope]);

  const selectedPartner = partners.find((p) => p.id === partnerId);
  const isFactoryOut = kind === 'OUT' && selectedPartner?.code === 'FACTORY';
  const isSmithOut =
    kind === 'OUT' &&
    scope === 'OLD' &&
    (selectedPartner?.code === 'OUTSOURCE_SMITH' || selectedPartner?.code === 'OTHER');

  /** Lines reference a SKU in the NEW warehouse and a ປະເພດຄຳ in OLD. */
  const usesSku = scope === 'NEW' || kind === 'TRANSFER';

  const totals = useMemo(() => {
    const goldG = lines.reduce((sum, l) => {
      const w = l.weightG.trim();
      if (!/^\d+(\.\d+)?$/.test(w)) return sum;
      return sum.plus(dec(w).mul(l.quantity));
    }, dec(0));
    const quantity = lines.reduce((sum, l) => sum + l.quantity, 0);

    // IN derives the rate from what was paid; OUT/TRANSFER use WAC.
    const cost = totalCost.replace(/,/g, '').trim();
    const perG =
      kind === 'IN'
        ? goldG.gt(0) && /^\d+(\.\d+)?$/.test(cost)
          ? dec(cost).div(goldG)
          : dec(0)
        : dec(wac?.pricePerG ?? 0);

    return {
      goldG,
      quantity,
      pricePerG: perG,
      pricePerBaht: perG.mul(GRAMS_PER_BAHT),
      goldCost: kind === 'IN' && /^\d+(\.\d+)?$/.test(cost) ? dec(cost) : goldG.mul(perG),
      expectedReturnG:
        isSmithOut && /^\d+(\.\d+)?$/.test(goldPercent.trim())
          ? goldG.mul(dec(goldPercent).div(100)).ceil()
          : null,
    };
  }, [lines, totalCost, wac, kind, isSmithOut, goldPercent]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = useMutation({
    mutationFn: () => {
      const payloadLines = lines
        .filter((l) => Number(l.weightG) > 0 && (usesSku ? l.goldSkuId : true))
        .map((l) => ({
          goldSkuId: usesSku ? l.goldSkuId : undefined,
          goldTypeId: usesSku ? undefined : goldTypeId || l.goldTypeId,
          weightG: l.weightG.trim(),
          quantity: l.quantity,
        }));

      if (kind === 'TRANSFER') {
        return api.post('/stock/transfer', {
          direction: transferDirection,
          goldTypeId,
          lines: payloadLines,
          note: note || undefined,
        });
      }
      if (kind === 'IN') {
        return api.post('/stock/in', {
          scope,
          partnerId,
          lines: payloadLines,
          totalCost: totalCost.replace(/,/g, '').trim(),
          laborFeeThb: laborFeeThb.trim() || undefined,
          note: note || undefined,
        });
      }
      return api.post('/stock/out', {
        scope,
        partnerId,
        transformType: transformType || undefined,
        goldPercent: goldPercent.trim() || undefined,
        lines: payloadLines,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ'),
  });

  const titleLo =
    kind === 'IN'
      ? `Stock IN — ${scope === 'NEW' ? 'ສາງຄຳໃໝ່' : 'ສາງຄຳເກົ່າ'}`
      : kind === 'OUT'
        ? `Stock OUT — ${scope === 'NEW' ? 'ສາງຄຳໃໝ່' : 'ສາງຄຳເກົ່າ'}`
        : `Transfer ${transferDirection === 'NEW_TO_OLD' ? '(NEW) ເປັນ (OLD)' : '(OLD) ເປັນ (NEW)'}`;

  const canSubmit =
    totals.goldG.gt(0) &&
    (kind === 'TRANSFER' ? Boolean(goldTypeId) : Boolean(partnerId)) &&
    (kind !== 'IN' || Number(totalCost.replace(/,/g, '')) > 0) &&
    (usesSku ? lines.some((l) => l.goldSkuId) : Boolean(goldTypeId));

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="card-title">{titleLo}</h2>
        <button className="btn-secondary py-1 text-xs" onClick={onClose}>ປິດ</button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {kind === 'TRANSFER' ? (
          <div>
            <label className="label" htmlFor="dir">ທິດທາງ</label>
            <select id="dir" className="input" value={transferDirection}
              onChange={(e) => setTransferDirection(e.target.value as typeof transferDirection)}>
              <option value="NEW_TO_OLD">(NEW) ເປັນ (OLD)</option>
              <option value="OLD_TO_NEW">(OLD) ເປັນ (NEW)</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="partner">
              {kind === 'IN' ? 'ແຫຼ່ງທີ່ມາ' : 'ແຫຼ່ງສົ່ງມອບ'}
            </label>
            <select id="partner" className="input" value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">— ເລືອກ —</option>
              {partnerOptions.map((p) => <option key={p.id} value={p.id}>{p.nameLo}</option>)}
            </select>
          </div>
        )}

        {(!usesSku || kind === 'TRANSFER') && (
          <div>
            <label className="label" htmlFor="goldType">ປະເພດຄຳ</label>
            <select id="goldType" className="input" value={goldTypeId}
              onChange={(e) => setGoldTypeId(e.target.value)}>
              <option value="">— ເລືອກປະເພດຄຳ —</option>
              {goldTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
            </select>
          </div>
        )}

        {kind === 'OUT' && scope === 'OLD' && (
          <div>
            <label className="label" htmlFor="transform">ແປງສະພາບ</label>
            <select id="transform" className="input" value={transformType}
              onChange={(e) => setTransformType(e.target.value as typeof transformType)}>
              <option value="">— ເລືອກ —</option>
              <option value="DYE">ຍ້ອມ</option>
              <option value="ETCH">ກັດ</option>
              <option value="MELT">ຫຼອມ</option>
            </select>
          </div>
        )}

        {isSmithOut && (
          <div>
            <label className="label" htmlFor="pct">%ຄຳ</label>
            <input id="pct" className="input num" inputMode="decimal" placeholder="96"
              value={goldPercent} onChange={(e) => setGoldPercent(e.target.value)} />
          </div>
        )}
      </div>

      {/* Repeatable lines with the TOR's Add button */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">ລາຍການ</span>
          <button className="btn-secondary py-1 text-xs"
            onClick={() => setLines((p) => [...p, emptyLine()])}>
            + Add
          </button>
        </div>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 lg:grid-cols-[2fr_1fr_0.8fr_1fr_auto]">
              {usesSku ? (
                <select className="input" value={line.goldSkuId}
                  onChange={(e) => {
                    const sku = skus.find((s) => s.id === e.target.value);
                    setLine(i, {
                      goldSkuId: e.target.value,
                      weightG: sku ? String(Number(sku.weightG)) : line.weightG,
                    });
                  }}>
                  <option value="">full_sku_name</option>
                  {skus.map((s) => <option key={s.id} value={s.id}>{s.fullSkuName}</option>)}
                </select>
              ) : (
                <select className="input" value={line.goldTypeId || goldTypeId}
                  onChange={(e) => setLine(i, { goldTypeId: e.target.value })}>
                  <option value="">ປະເພດຄຳ</option>
                  {goldTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
                </select>
              )}
              <input className="input num" inputMode="decimal" placeholder="weight_g"
                value={line.weightG} onChange={(e) => setLine(i, { weightG: e.target.value })} />
              <input className="input num" type="number" min={1} value={line.quantity}
                onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 1 })} />
              <div className="input num bg-slate-50 text-right text-slate-500">
                {/^\d+(\.\d+)?$/.test(line.weightG)
                  ? formatWeight(dec(line.weightG).mul(line.quantity).toFixed())
                  : '—'}
              </div>
              <button className="btn-secondary px-3 text-xs" disabled={lines.length === 1}
                onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                ລຶບ
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">GOLD (g) = weight_g × ຈຳນວນ</p>
      </div>

      {kind === 'IN' && (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="cost">ຕົ້ນທຶນຄໍາ (LAK)</label>
            <input id="cost" className="input num" inputMode="decimal" value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="labor">ຄ່າແຮງ (THB)</label>
            <input id="labor" className="input num" inputMode="decimal" value={laborFeeThb}
              onChange={(e) => setLaborFeeThb(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">ບັນທຶກເປັນ +AP (Cash) ຄ່າແຮງຄ້າງຈ່າຍ</p>
          </div>
        </div>
      )}

      {/* Running totals */}
      <div className="mt-5 grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Field labelLo="ລວມຈຳນວນ" value={String(totals.quantity)} />
        <Field labelLo="ລວມ GOLD (g)" value={formatWeight(totals.goldG.toFixed())} />
        <Field labelLo="ລາຄາ/g" value={formatLak(totals.pricePerG.toFixed())} />
        <Field labelLo="ລາຄາ/ບາດ" value={formatLak(totals.pricePerBaht.toFixed())} />
        <Field labelLo="ຕົ້ນທຶນຄຳ" value={formatLak(totals.goldCost.toFixed())} strong />
        {totals.expectedReturnG && (
          <Field labelLo="ນ້ຳໜັກ(g) ທີ່ໄດ້ຮັບ"
            value={formatWeight(totals.expectedReturnG.toFixed())} />
        )}
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="note">Note</label>
        <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {kind === 'OUT' && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {isFactoryOut
            ? 'OUT ໄປ FACTORY: ຕ້ອງລໍຖ້າ Admin/Manager Approve ແລ້ວ ລະບົບຍັງບໍ່ຕັດຍອດ — ຈະໄປຢູ່ Module ຕິດຕາມ Stock Out ໄປ FACTORY ຈົນກວ່າຈະປ້ອນນ້ຳໜັກທີ່ FACTORY ປະເມີນ.'
            : 'Stock OUT ຕ້ອງລໍຖ້າ Admin/Manager Approve ກ່ອນຈຶ່ງຕັດຍອດ.'}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button className="btn-primary" disabled={!canSubmit || submit.isPending}
          onClick={() => submit.mutate()}>
          {submit.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
        </button>
        <button className="btn-secondary" onClick={onClose}>ຍົກເລີກ</button>
      </div>
    </div>
  );
}

function Field({ labelLo, value, strong }: { labelLo: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelLo}</div>
      <div className={`num mt-0.5 ${strong ? 'text-lg font-bold text-gold-700' : 'font-semibold text-slate-800'}`}>
        {value}
      </div>
    </div>
  );
}
