'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { AuditView } from '@/components/audit-view';

interface Tier {
  labelLo: string;
  sortOrder: number;
}

interface JewelryFee {
  id: string;
  tierCode: string;
  weightG: string;
  feeGoodShape: string;
  feeDamagedShape: string;
  tier: Tier;
}

interface BarFee {
  id: string;
  weightG: string;
  barToJewelry: string;
  barToBar: string;
}

/**
 * There is no dedicated tiers endpoint; the price board already carries every
 * tier with both weights, in sortOrder, so the "add" picker reads it from
 * there rather than adding a route for the same rows.
 */
interface BoardLine {
  tierCode: string;
  labelLo: string;
  category: string;
  exchangeWeightG: string;
}
interface PriceBoard {
  lines: BoardLine[];
}

type JewelryHistory = JewelryFee & { effectiveAt: string; deletedAt: string | null; updatedBy: string };
type BarHistory = BarFee & { effectiveAt: string; deletedAt: string | null; updatedBy: string };

/** Strip the grouping commas a staff member types out of habit. */
const clean = (s: string) => s.replace(/,/g, '').trim();

/** Both fee tables are append-only, so "edit" means appending a new version. */
export default function ConversionFeesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const jewelryQuery = useQuery({
    queryKey: ['fees', 'conversion', 'jewelry'],
    queryFn: () => api.get<JewelryFee[]>('/fees/conversion/jewelry'),
  });
  const barQuery = useQuery({
    queryKey: ['fees', 'conversion', 'bar'],
    queryFn: () => api.get<BarFee[]>('/fees/conversion/bar'),
  });
  const jewelryHistory = useQuery({
    queryKey: ['fees', 'conversion', 'jewelry', 'history'],
    queryFn: () => api.get<JewelryHistory[]>('/fees/conversion/jewelry/history?limit=200'),
  });
  const barHistory = useQuery({
    queryKey: ['fees', 'conversion', 'bar', 'history'],
    queryFn: () => api.get<BarHistory[]>('/fees/conversion/bar/history?limit=200'),
  });
  const boardQuery = useQuery({
    queryKey: ['pricing', 'current'],
    queryFn: () => api.get<PriceBoard>('/pricing/current'),
    retry: false,
  });

  const jewelry = jewelryQuery.data ?? [];
  const bar = barQuery.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['fees', 'conversion'] });
    // ຄ່າຫຍຸບ / ຄ່າປ່ຽນຄຳແທ່ງ feed the exchange quote, so a stale cached
    // estimate must not survive a fee change.
    void queryClient.invalidateQueries({ queryKey: ['exchange'] });
  };

  const fail = (e: unknown, fallback: string) => {
    const detail = e instanceof ApiError ? e.message : fallback;
    toast.error('ບໍ່ສຳເລັດ', detail);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຈັດການ ຄ່າປ່ຽນ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຄ່າປ່ຽນທີ່ໃຊ້ໃນລາຍການປ່ຽນເປັນເງິນ (TOR §3.4)
        </p>
      </div>

      <JewelryPanel
        rows={jewelry}
        tiers={boardQuery.data?.lines ?? []}
        loading={jewelryQuery.isLoading}
        onSaved={(msg) => {
          toast.success(msg);
          refresh();
        }}
        onError={fail}
      />

      <BarPanel
        rows={bar}
        loading={barQuery.isLoading}
        onSaved={(msg) => {
          toast.success(msg);
          refresh();
        }}
        onError={fail}
      />

      <HistoryPanel
        titleLo="ປະຫວັດ ຄ່າປ່ຽນຮູບປະພັນ"
        rows={jewelryHistory.data ?? []}
        columns={['SKU / ຫົວໜ່ວຍ', 'ຄ່າປ່ຽນຮູບປະພັນດີ', 'ຄ່າປ່ຽນເສຍຮູບ']}
        render={(r) => [
          r.tier?.labelLo ?? r.tierCode,
          formatLak(r.feeGoodShape),
          formatLak(r.feeDamagedShape),
        ]}
      />

      <HistoryPanel
        titleLo="ປະຫວັດ ຄ່າປ່ຽນຄຳແທ່ງ"
        rows={barHistory.data ?? []}
        columns={['ນ້ຳໜັກ / g', 'ຄຳແທ່ງ-ຮູບປະພັນ', 'ຄຳແທ່ງ-ຄຳແທ່ງ']}
        render={(r) => [
          formatWeight(r.weightG),
          formatLak(r.barToJewelry),
          formatLak(r.barToBar),
        ]}
      />

      <AuditView entity="JewelryConversionFee" titleLo="Audit Log — ຄ່າປ່ຽນຮູບປະພັນ" />
      <AuditView entity="BarConversionFee" titleLo="Audit Log — ຄ່າປ່ຽນຄຳແທ່ງ" />

      <p className="text-sm text-slate-500">
        ສອງຕາຕະລາງນີ້ເປັນແບບ append-only — ການແກ້ໄຂ ຫຼື ລຶບ ຈະສ້າງແຖວໃໝ່ ແລະ
        ຮັກສາແຖວເກົ່າໄວ້ ເພື່ອໃຫ້ລາຍການປ່ຽນທີ່ຜ່ານມາຍັງກວດສອບຄືນໄດ້.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ jewelry */

interface JewelryPanelProps {
  rows: JewelryFee[];
  tiers: BoardLine[];
  loading: boolean;
  onSaved: (msg: string) => void;
  onError: (e: unknown, fallback: string) => void;
}

function JewelryPanel({ rows, tiers, loading, onSaved, onError }: JewelryPanelProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [good, setGood] = useState('');
  const [damaged, setDamaged] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTier, setNewTier] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const pager = usePagination(rows, 10);

  const reset = () => {
    setEditing(null);
    setAdding(false);
    setNewTier('');
    setGood('');
    setDamaged('');
  };

  const save = useMutation({
    mutationFn: (p: { tierCode: string; weightG: string }) =>
      api.post('/fees/conversion/jewelry', {
        tierCode: p.tierCode,
        weightG: clean(p.weightG),
        feeGoodShape: clean(good),
        feeDamagedShape: clean(damaged),
      }),
    onSuccess: () => {
      onSaved('ບັນທຶກຄ່າປ່ຽນຮູບປະພັນແລ້ວ');
      reset();
    },
    onError: (e) => onError(e, 'ບັນທຶກບໍ່ສຳເລັດ'),
  });

  const remove = useMutation({
    mutationFn: (tierCode: string) =>
      api.delete(`/fees/conversion/jewelry/${encodeURIComponent(tierCode)}`),
    onSuccess: () => {
      onSaved('ລຶບແລ້ວ');
      setConfirming(null);
    },
    onError: (e) => onError(e, 'ລຶບບໍ່ສຳເລັດ'),
  });

  // Only jewellery tiers, and only ones with no live row — the TOR fixes the
  // seven, so "add" exists to restore one that was retired, not to invent new.
  const available = tiers
    .filter((t) => t.category === 'JEWELRY' && !rows.some((r) => r.tierCode === t.tierCode));

  const busy = save.isPending || remove.isPending;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">ຄ່າປ່ຽນຮູບປະພັນ</h2>
        {available.length > 0 && !adding && (
          <button className="btn-secondary" onClick={() => setAdding(true)}>
            + ເພີ່ມນ້ຳໜັກ
          </button>
        )}
      </div>

      {adding && (
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-44">
              <label className="label" htmlFor="jw-tier">SKU / ຫົວໜ່ວຍ</label>
              <select
                id="jw-tier"
                className="input"
                value={newTier}
                onChange={(e) => setNewTier(e.target.value)}
              >
                <option value="">— ເລືອກ —</option>
                {available.map((t) => (
                  <option key={t.tierCode} value={t.tierCode}>
                    {t.labelLo} ({formatWeight(t.exchangeWeightG)} g)
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-40">
              <label className="label" htmlFor="jw-good">ຄ່າປ່ຽນຮູບປະພັນດີ (LAK)</label>
              <input
                id="jw-good"
                className="input num"
                inputMode="decimal"
                placeholder="269,000"
                value={good}
                onChange={(e) => setGood(e.target.value)}
              />
            </div>
            <div className="min-w-40">
              <label className="label" htmlFor="jw-dmg">ຄ່າປ່ຽນເສຍຮູບ (LAK)</label>
              <input
                id="jw-dmg"
                className="input num"
                inputMode="decimal"
                placeholder="1,029,000"
                value={damaged}
                onChange={(e) => setDamaged(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              disabled={!newTier || !good.trim() || !damaged.trim() || busy}
              onClick={() => {
                const tier = available.find((t) => t.tierCode === newTier);
                if (tier) save.mutate({ tierCode: tier.tierCode, weightG: tier.exchangeWeightG });
              }}
            >
              {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
            </button>
            <button className="btn-secondary" onClick={reset} disabled={busy}>
              ຍົກເລີກ
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>SKU / ຫົວໜ່ວຍ</th>
              <th className="text-right">ນ້ຳໜັກ / g</th>
              <th className="text-right">ຄ່າປ່ຽນຮູບປະພັນດີ (LAK)</th>
              <th className="text-right">ຄ່າປ່ຽນເສຍຮູບ (LAK)</th>
              <th className="text-right">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  ຍັງບໍ່ມີຄ່າປ່ຽນຮູບປະພັນ
                </td>
              </tr>
            )}
            {pager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.tier.labelLo}</td>
                <td className="num text-right">{formatWeight(row.weightG)}</td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <input
                      className="input num w-32 text-right"
                      inputMode="decimal"
                      value={good}
                      onChange={(e) => setGood(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    formatLak(row.feeGoodShape)
                  )}
                </td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <input
                      className="input num w-32 text-right"
                      inputMode="decimal"
                      value={damaged}
                      onChange={(e) => setDamaged(e.target.value)}
                    />
                  ) : (
                    formatLak(row.feeDamagedShape)
                  )}
                </td>
                <td className="text-right">
                  {editing === row.id ? (
                    <div className="flex justify-end gap-2">
                      <button
                        className="text-sm text-gold-700 hover:underline"
                        disabled={!good.trim() || !damaged.trim() || busy}
                        onClick={() =>
                          save.mutate({ tierCode: row.tierCode, weightG: row.weightG })
                        }
                      >
                        ບັນທຶກ
                      </button>
                      <button className="text-sm text-slate-500 hover:underline" onClick={reset}>
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : confirming === row.id ? (
                    <div className="flex justify-end gap-2">
                      <button
                        className="text-sm font-medium text-red-700 hover:underline"
                        disabled={busy}
                        onClick={() => remove.mutate(row.tierCode)}
                      >
                        ຢືນຢັນລຶບ
                      </button>
                      <button
                        className="text-sm text-slate-500 hover:underline"
                        onClick={() => setConfirming(null)}
                      >
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3">
                      <button
                        className="text-sm text-gold-700 hover:underline"
                        onClick={() => {
                          reset();
                          setEditing(row.id);
                          setGood(row.feeGoodShape);
                          setDamaged(row.feeDamagedShape);
                        }}
                      >
                        ແກ້ໄຂ
                      </button>
                      <button
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => {
                          reset();
                          setConfirming(row.id);
                        }}
                      >
                        ລຶບ
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pager} />

      {confirming && (
        <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          ເມື່ອລຶບແລ້ວ ການປ່ຽນຂອງນ້ຳໜັກນີ້ຈະຄິດຄ່າຫຍຸບເປັນ 0 — ບໍ່ແມ່ນຫ້າມການປ່ຽນ.
          ຖ້າຕ້ອງການພຽງແກ້ຕົວເລກ ໃຫ້ກົດ ແກ້ໄຂ ແທນ.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- bar */

interface BarPanelProps {
  rows: BarFee[];
  loading: boolean;
  onSaved: (msg: string) => void;
  onError: (e: unknown, fallback: string) => void;
}

function BarPanel({ rows, loading, onSaved, onError }: BarPanelProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [weight, setWeight] = useState('');
  const [toJewelry, setToJewelry] = useState('');
  const [toBar, setToBar] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const pager = usePagination(rows, 10);

  const reset = () => {
    setEditing(null);
    setAdding(false);
    setWeight('');
    setToJewelry('');
    setToBar('');
  };

  const save = useMutation({
    mutationFn: (weightG: string) =>
      api.post('/fees/conversion/bar', {
        weightG: clean(weightG),
        barToJewelry: clean(toJewelry),
        barToBar: clean(toBar),
      }),
    onSuccess: () => {
      onSaved('ບັນທຶກຄ່າປ່ຽນຄຳແທ່ງແລ້ວ');
      reset();
    },
    onError: (e) => onError(e, 'ບັນທຶກບໍ່ສຳເລັດ'),
  });

  const remove = useMutation({
    mutationFn: (weightG: string) =>
      api.delete(`/fees/conversion/bar?weightG=${encodeURIComponent(weightG)}`),
    onSuccess: () => {
      onSaved('ລຶບແລ້ວ');
      setConfirming(null);
    },
    onError: (e) => onError(e, 'ລຶບບໍ່ສຳເລັດ'),
  });

  const duplicate =
    adding && weight.trim() !== '' && rows.some((r) => Number(r.weightG) === Number(clean(weight)));

  const busy = save.isPending || remove.isPending;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">ຄ່າປ່ຽນຄຳແທ່ງ</h2>
        {!adding && (
          <button className="btn-secondary" onClick={() => setAdding(true)}>
            + ເພີ່ມນ້ຳໜັກ
          </button>
        )}
      </div>

      {adding && (
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-32">
              <label className="label" htmlFor="bar-w">ນ້ຳໜັກ / g</label>
              <input
                id="bar-w"
                className="input num"
                inputMode="decimal"
                placeholder="15"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div className="min-w-40">
              <label className="label" htmlFor="bar-j">ຄຳແທ່ງ-ຮູບປະພັນ (LAK)</label>
              <input
                id="bar-j"
                className="input num"
                inputMode="decimal"
                placeholder="329,000"
                value={toJewelry}
                onChange={(e) => setToJewelry(e.target.value)}
              />
            </div>
            <div className="min-w-40">
              <label className="label" htmlFor="bar-b">ຄຳແທ່ງ-ຄຳແທ່ງ (LAK)</label>
              <input
                id="bar-b"
                className="input num"
                inputMode="decimal"
                placeholder="169,000"
                value={toBar}
                onChange={(e) => setToBar(e.target.value)}
              />
            </div>
            <button
              className="btn-primary"
              disabled={
                !weight.trim() || !toJewelry.trim() || !toBar.trim() || duplicate || busy
              }
              onClick={() => save.mutate(weight)}
            >
              {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
            </button>
            <button className="btn-secondary" onClick={reset} disabled={busy}>
              ຍົກເລີກ
            </button>
          </div>
          {duplicate && (
            <p className="mt-2 text-sm text-amber-700">
              ນ້ຳໜັກນີ້ມີຢູ່ແລ້ວ — ໃຫ້ກົດ ແກ້ໄຂ ຢູ່ແຖວນັ້ນແທນ.
            </p>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="text-right">ນ້ຳໜັກ / g</th>
              <th className="text-right">ຄຳແທ່ງ-ຮູບປະພັນ (LAK)</th>
              <th className="text-right">ຄຳແທ່ງ-ຄຳແທ່ງ (LAK)</th>
              <th className="text-right">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-500">
                  ຍັງບໍ່ມີຄ່າປ່ຽນຄຳແທ່ງ
                </td>
              </tr>
            )}
            {pager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="num text-right font-medium">{formatWeight(row.weightG)}</td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <input
                      className="input num w-32 text-right"
                      inputMode="decimal"
                      value={toJewelry}
                      onChange={(e) => setToJewelry(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    formatLak(row.barToJewelry)
                  )}
                </td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <input
                      className="input num w-32 text-right"
                      inputMode="decimal"
                      value={toBar}
                      onChange={(e) => setToBar(e.target.value)}
                    />
                  ) : (
                    formatLak(row.barToBar)
                  )}
                </td>
                <td className="text-right">
                  {editing === row.id ? (
                    <div className="flex justify-end gap-2">
                      <button
                        className="text-sm text-gold-700 hover:underline"
                        disabled={!toJewelry.trim() || !toBar.trim() || busy}
                        onClick={() => save.mutate(row.weightG)}
                      >
                        ບັນທຶກ
                      </button>
                      <button className="text-sm text-slate-500 hover:underline" onClick={reset}>
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : confirming === row.id ? (
                    <div className="flex justify-end gap-2">
                      <button
                        className="text-sm font-medium text-red-700 hover:underline"
                        disabled={busy}
                        onClick={() => remove.mutate(row.weightG)}
                      >
                        ຢືນຢັນລຶບ
                      </button>
                      <button
                        className="text-sm text-slate-500 hover:underline"
                        onClick={() => setConfirming(null)}
                      >
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3">
                      <button
                        className="text-sm text-gold-700 hover:underline"
                        onClick={() => {
                          reset();
                          setEditing(row.id);
                          setToJewelry(row.barToJewelry);
                          setToBar(row.barToBar);
                        }}
                      >
                        ແກ້ໄຂ
                      </button>
                      <button
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => {
                          reset();
                          setConfirming(row.id);
                        }}
                      >
                        ລຶບ
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pager} />

      {confirming && (
        <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          ເມື່ອລຶບແລ້ວ ການປ່ຽນຄຳແທ່ງຂອງນ້ຳໜັກນີ້ຈະຄິດຄ່າປ່ຽນເປັນ 0.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ history */

interface HistoryPanelProps<T> {
  titleLo: string;
  rows: T[];
  columns: string[];
  render: (row: T) => (string | number)[];
}

/**
 * The append-only trail. Every version is a row, including the tombstones a
 * delete leaves behind, so the table shows what changed and who changed it.
 */
function HistoryPanel<T extends { id: string; effectiveAt: string; deletedAt: string | null; updatedBy: string }>({
  titleLo,
  rows,
  columns,
  render,
}: HistoryPanelProps<T>) {
  const pager = usePagination(rows, 10);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{titleLo}</h2>
        <span className="text-xs text-slate-500">ທຸກລຸ້ນ ລ່າສຸດກ່ອນ</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ວັນທີ ແລະ ເວລາ</th>
              {columns.map((c, i) => (
                <th key={c} className={i === 0 ? undefined : 'text-right'}>
                  {c}
                </th>
              ))}
              <th>ສະຖານະ</th>
              <th>ຜູ້ແກ້ໄຂ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 3} className="py-6 text-center text-slate-500">
                  ຍັງບໍ່ມີປະຫວັດ
                </td>
              </tr>
            )}
            {pager.pageItems.map((row) => {
              const cells = render(row);
              return (
                <tr key={row.id}>
                  <td>{formatDateTime(row.effectiveAt)}</td>
                  {cells.map((v, i) => (
                    <td key={i} className={i === 0 ? 'font-medium' : 'num text-right'}>
                      {v}
                    </td>
                  ))}
                  <td>
                    {row.deletedAt ? (
                      <span className="badge bg-red-100 text-red-800">ລຶບແລ້ວ</span>
                    ) : (
                      <span className="badge bg-emerald-100 text-emerald-800">ໃຊ້ງານ</span>
                    )}
                  </td>
                  <td>{row.updatedBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...pager} />
    </div>
  );
}
