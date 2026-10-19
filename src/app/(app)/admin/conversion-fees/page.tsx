'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { AuditView } from '@/components/audit-view';
import { TableStateRow } from '@/components/query-state';
import { PageHead } from '@/components/page-head';
import { NumberInput } from '@/components/number-input';

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
      <PageHead
        title="ຈັດການ ຄ່າປ່ຽນ"
        subtitle="ຄ່າປ່ຽນທີ່ໃຊ້ໃນລາຍການປ່ຽນເປັນເງິນ (TOR §3.4)"
      />

      <JewelryPanel
        rows={jewelry}
        tiers={boardQuery.data?.lines ?? []}
        loading={jewelryQuery.isLoading}
        query={jewelryQuery}
        onSaved={(msg) => {
          toast.success(msg);
          refresh();
        }}
        onError={fail}
      />

      <BarPanel
        rows={bar}
        loading={barQuery.isLoading}
        query={barQuery}
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
        loading={jewelryHistory.isLoading}
        query={jewelryHistory}
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
        numericFirst
        loading={barHistory.isLoading}
        query={barHistory}
        render={(r) => [
          formatWeight(r.weightG),
          formatLak(r.barToJewelry),
          formatLak(r.barToBar),
        ]}
      />

      <AuditView entity="JewelryConversionFee" titleLo="Audit Log — ຄ່າປ່ຽນຮູບປະພັນ" />
      <AuditView entity="BarConversionFee" titleLo="Audit Log — ຄ່າປ່ຽນຄຳແທ່ງ" />

      <p data-fade className="text-sm text-muted">
        ສອງຕາຕະລາງນີ້ເປັນແບບ append-only — ການແກ້ໄຂ ຫຼື ລຶບ ຈະສ້າງແຖວໃໝ່ ແລະ
        ຮັກສາແຖວເກົ່າໄວ້ ເພື່ອໃຫ້ລາຍການປ່ຽນທີ່ຜ່ານມາຍັງກວດສອບຄືນໄດ້.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ jewelry */

/** The slice of a useQuery result the panels need to tell a failed load from an empty one. */
interface QueryFailure {
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface JewelryPanelProps {
  rows: JewelryFee[];
  tiers: BoardLine[];
  loading: boolean;
  query: QueryFailure;
  onSaved: (msg: string) => void;
  onError: (e: unknown, fallback: string) => void;
}

function JewelryPanel({ rows, tiers, loading, query, onSaved, onError }: JewelryPanelProps) {
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
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">ຄ່າປ່ຽນຮູບປະພັນ</h2>
        {available.length > 0 && !adding && (
          <button className="btn-secondary inline-flex items-center gap-2" onClick={() => setAdding(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            ເພີ່ມນ້ຳໜັກ
          </button>
        )}
      </div>

      {adding && (
        <div className="border-b border-line bg-recessed px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-44">
              <label className="label" htmlFor="jw-tier">SKU / ຫົວໜ່ວຍ</label>
              <select
                id="jw-tier"
                className="input input-lg"
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
              <NumberInput
                id="jw-good"
                className="input input-lg num"
                decimals={0}
                placeholder="269,000"
                value={good}
                onValueChange={setGood}
              />
            </div>
            <div className="min-w-40">
              <label className="label" htmlFor="jw-dmg">ຄ່າປ່ຽນເສຍຮູບ (LAK)</label>
              <NumberInput
                id="jw-dmg"
                className="input input-lg num"
                decimals={0}
                placeholder="1,029,000"
                value={damaged}
                onValueChange={setDamaged}
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

      <div className="table-wrap" tabIndex={0} role="region" aria-label="ຄ່າປ່ຽນຮູບປະພັນ">
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
            <TableStateRow
              colSpan={5}
              dense
              isError={query.isError}
              error={query.error}
              isEmpty={!loading && rows.length === 0}
              emptyText="ຍັງບໍ່ມີຄ່າປ່ຽນຮູບປະພັນ"
              onRetry={() => void query.refetch()}
            />
            {pager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.tier.labelLo}</td>
                <td className="num text-right">{formatWeight(row.weightG)}</td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <NumberInput
                      className="input num w-32 text-right"
                      decimals={0}
                      aria-label={`${row.tier.labelLo} — ຄ່າປ່ຽນຮູບປະພັນດີ (LAK)`}
                      value={good}
                      onValueChange={setGood}
                      autoFocus
                    />
                  ) : (
                    formatLak(row.feeGoodShape)
                  )}
                </td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <NumberInput
                      className="input num w-32 text-right"
                      decimals={0}
                      aria-label={`${row.tier.labelLo} — ຄ່າປ່ຽນເສຍຮູບ (LAK)`}
                      value={damaged}
                      onValueChange={setDamaged}
                    />
                  ) : (
                    formatLak(row.feeDamagedShape)
                  )}
                </td>
                <td className="text-right">
                  {editing === row.id ? (
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      <button
                        className="btn-primary"
                        aria-label={`ບັນທຶກ ${row.tier.labelLo}`}
                        disabled={!good.trim() || !damaged.trim() || busy}
                        onClick={() =>
                          save.mutate({ tierCode: row.tierCode, weightG: row.weightG })
                        }
                      >
                        ບັນທຶກ
                      </button>
                      <button
                        className="btn-secondary"
                        aria-label={`ຍົກເລີກ ${row.tier.labelLo}`}
                        onClick={reset}
                      >
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : confirming === row.id ? (
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      <button
                        className="btn-danger"
                        aria-label={`ຢືນຢັນລຶບ ${row.tier.labelLo}`}
                        disabled={busy}
                        onClick={() => remove.mutate(row.tierCode)}
                      >
                        ຢືນຢັນລຶບ
                      </button>
                      <button
                        className="btn-secondary"
                        aria-label={`ຍົກເລີກ ${row.tier.labelLo}`}
                        onClick={() => setConfirming(null)}
                      >
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      <button
                        className="btn-ghost"
                        aria-label={`ແກ້ໄຂ ${row.tier.labelLo}`}
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
                        className="btn-danger"
                        aria-label={`ລຶບ ${row.tier.labelLo}`}
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
        <p role="status" className="notice status-warning m-4">
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
  query: QueryFailure;
  onSaved: (msg: string) => void;
  onError: (e: unknown, fallback: string) => void;
}

function BarPanel({ rows, loading, query, onSaved, onError }: BarPanelProps) {
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
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">ຄ່າປ່ຽນຄຳແທ່ງ</h2>
        {!adding && (
          <button className="btn-secondary inline-flex items-center gap-2" onClick={() => setAdding(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            ເພີ່ມນ້ຳໜັກ
          </button>
        )}
      </div>

      {adding && (
        <div className="border-b border-line bg-recessed px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-32">
              <label className="label" htmlFor="bar-w">ນ້ຳໜັກ / g</label>
              <NumberInput
                id="bar-w"
                className="input input-lg num"
                decimals={4}
                placeholder="15"
                value={weight}
                onValueChange={setWeight}
              />
            </div>
            <div className="min-w-40">
              <label className="label" htmlFor="bar-j">ຄຳແທ່ງ-ຮູບປະພັນ (LAK)</label>
              <NumberInput
                id="bar-j"
                className="input input-lg num"
                decimals={0}
                placeholder="329,000"
                value={toJewelry}
                onValueChange={setToJewelry}
              />
            </div>
            <div className="min-w-40">
              <label className="label" htmlFor="bar-b">ຄຳແທ່ງ-ຄຳແທ່ງ (LAK)</label>
              <NumberInput
                id="bar-b"
                className="input input-lg num"
                decimals={0}
                placeholder="169,000"
                value={toBar}
                onValueChange={setToBar}
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
            <p className="mt-2 text-sm text-warning">
              ນ້ຳໜັກນີ້ມີຢູ່ແລ້ວ — ໃຫ້ກົດ ແກ້ໄຂ ຢູ່ແຖວນັ້ນແທນ.
            </p>
          )}
        </div>
      )}

      <div className="table-wrap" tabIndex={0} role="region" aria-label="ຄ່າປ່ຽນຄຳແທ່ງ">
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
            <TableStateRow
              colSpan={4}
              dense
              isError={query.isError}
              error={query.error}
              isEmpty={!loading && rows.length === 0}
              emptyText="ຍັງບໍ່ມີຄ່າປ່ຽນຄຳແທ່ງ"
              onRetry={() => void query.refetch()}
            />
            {pager.pageItems.map((row) => (
              <tr key={row.id}>
                <td className="num text-right font-medium">{formatWeight(row.weightG)}</td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <NumberInput
                      className="input num w-32 text-right"
                      decimals={0}
                      aria-label={`${formatWeight(row.weightG)} g — ຄຳແທ່ງ-ຮູບປະພັນ (LAK)`}
                      value={toJewelry}
                      onValueChange={setToJewelry}
                      autoFocus
                    />
                  ) : (
                    formatLak(row.barToJewelry)
                  )}
                </td>
                <td className="num text-right">
                  {editing === row.id ? (
                    <NumberInput
                      className="input num w-32 text-right"
                      decimals={0}
                      aria-label={`${formatWeight(row.weightG)} g — ຄຳແທ່ງ-ຄຳແທ່ງ (LAK)`}
                      value={toBar}
                      onValueChange={setToBar}
                    />
                  ) : (
                    formatLak(row.barToBar)
                  )}
                </td>
                <td className="text-right">
                  {editing === row.id ? (
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      <button
                        className="btn-primary"
                        aria-label={`ບັນທຶກ ${formatWeight(row.weightG)}`}
                        disabled={!toJewelry.trim() || !toBar.trim() || busy}
                        onClick={() => save.mutate(row.weightG)}
                      >
                        ບັນທຶກ
                      </button>
                      <button
                        className="btn-secondary"
                        aria-label={`ຍົກເລີກ ${formatWeight(row.weightG)}`}
                        onClick={reset}
                      >
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : confirming === row.id ? (
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      <button
                        className="btn-danger"
                        aria-label={`ຢືນຢັນລຶບ ${formatWeight(row.weightG)}`}
                        disabled={busy}
                        onClick={() => remove.mutate(row.weightG)}
                      >
                        ຢືນຢັນລຶບ
                      </button>
                      <button
                        className="btn-secondary"
                        aria-label={`ຍົກເລີກ ${formatWeight(row.weightG)}`}
                        onClick={() => setConfirming(null)}
                      >
                        ຍົກເລີກ
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      <button
                        className="btn-ghost"
                        aria-label={`ແກ້ໄຂ ${formatWeight(row.weightG)}`}
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
                        className="btn-danger"
                        aria-label={`ລຶບ ${formatWeight(row.weightG)}`}
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
        <p role="status" className="notice status-warning m-4">
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
  /** First rendered column is numeric (bar side: weight), so right-align it. */
  numericFirst?: boolean;
  loading?: boolean;
  query?: QueryFailure;
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
  numericFirst = false,
  loading = false,
  query,
}: HistoryPanelProps<T>) {
  const pager = usePagination(rows, 10);

  return (
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">{titleLo}</h2>
        <span className="text-xs text-muted">ທຸກລຸ້ນ ລ່າສຸດກ່ອນ</span>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={titleLo}>
        <table className="table">
          <thead>
            <tr>
              <th>ວັນທີ ແລະ ເວລາ</th>
              {columns.map((c, i) => (
                <th key={c} className={i === 0 && !numericFirst ? undefined : 'text-right'}>
                  {c}
                </th>
              ))}
              <th>ສະຖານະ</th>
              <th>ຜູ້ແກ້ໄຂ</th>
            </tr>
          </thead>
          <tbody>
            <TableStateRow
              colSpan={columns.length + 3}
              dense
              isLoading={loading && rows.length === 0}
              isError={query?.isError}
              error={query?.error}
              isEmpty={!loading && rows.length === 0}
              emptyText="ຍັງບໍ່ມີປະຫວັດ"
              onRetry={query ? () => void query.refetch() : undefined}
            />
            {pager.pageItems.map((row) => {
              const cells = render(row);
              return (
                <tr key={row.id}>
                  <td>{formatDateTime(row.effectiveAt)}</td>
                  {cells.map((v, i) => (
                    <td key={i} className={i === 0 && !numericFirst ? 'font-medium' : 'num text-right'}>
                      {v}
                    </td>
                  ))}
                  <td>
                    {row.deletedAt ? (
                      <span className="badge status-danger">ລຶບແລ້ວ</span>
                    ) : (
                      <span className="badge status-success">ໃຊ້ງານ</span>
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
