'use client';

import { useId, useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHead } from '@/components/page-head';
import { NumberInput } from '@/components/number-input';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { useChartTheme } from '@/lib/chart-theme';
import { api, ApiError } from '@/lib/api';
import { formatRate, formatDate, formatDateTime } from '@/lib/format';
import { StatCard } from '@/components/stat-card';
import { isPositive, clean } from '@/lib/validate';
import { Dialog } from '@/components/dialog';

interface Rates {
  id: string;
  thbSellRate: string;
  usdSellRate: string;
  thbBuybackRate: string;
  usdBuybackRate: string;
  effectiveAt: string;
}

interface HistoryRow extends Rates {
  updatedBy: string;
}

interface SeriesPoint {
  month: string;
  thbSell: string;
  thbBuyback: string;
  usdSell: string;
  usdBuyback: string;
}

const FIELDS = [
  { key: 'thbSellRate', labelLo: 'THB Sell Rate (THB/LAK)' },
  { key: 'usdSellRate', labelLo: 'USD Sell Rate (USD/LAK)' },
  { key: 'thbBuybackRate', labelLo: 'THB Buyback Rate (LAK/THB)' },
  { key: 'usdBuybackRate', labelLo: 'USD Buyback Rate (LAK/USD)' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

/**
 * TOR §3.3 — Module ຈັດການ Price Rate.
 *
 * All four rates are saved as one snapshot rather than independently: a
 * transaction quotes a sell rate and a buyback rate from the same moment, so
 * letting them drift apart in the database would make old receipts
 * unreproducible.
 */
export default function RatesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Record<FieldKey, string>>({
    thbSellRate: '',
    usdSellRate: '',
    thbBuybackRate: '',
    usdBuybackRate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: current, isError: currentFailedRaw, error: currentError, refetch: refetchCurrent } = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
    retry: false,
  });

  const { data: history = [], isLoading: historyLoading, isError: historyFailed, error: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['rates', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/rates/history?limit=30'),
  });

  const { data: series = [], isError: seriesFailed, error: seriesError, refetch: refetchSeries } = useQuery({
    queryKey: ['rates', 'series'],
    queryFn: () => api.get<SeriesPoint[]>('/rates/series?months=12'),
  });

  // 404 on /rates/current means "no rates set yet", not a failure.
  const currentFailed = currentFailedRaw && !(currentError instanceof ApiError && currentError.status === 404);

  /**
   * ດຶງຄ່າອັດຕາແລກປ່ຽນ: ຖ້າຜູ້ໃຊ້ປ້ອນຄ່າໃໝ່ຈະໃຊ້ຄ່ານັ້ນ,
   * ແຕ່ຖ້າປະວ່າງໄວ້ ລະບົບຈະດຶງຄ່າເດີມ (current) ມາໃຊ້ແທນ.
   */
  const getEffectiveRate = (key: FieldKey): string => {
    const val = clean(form[key] ?? '');
    if (val !== '') return val;
    if (current && current[key]) return clean(current[key]);
    return '';
  };

  const hasAnyInput = FIELDS.some((f) => clean(form[f.key] ?? '') !== '');
  const allRatesValid = FIELDS.every((f) => isPositive(getEffectiveRate(f.key)));
  const canSubmit = allRatesValid && (current ? hasAnyInput : true);

  const save = useMutation({
    mutationFn: () =>
      api.post('/rates/update', {
        thbSellRate: getEffectiveRate('thbSellRate'),
        usdSellRate: getEffectiveRate('usdSellRate'),
        thbBuybackRate: getEffectiveRate('thbBuybackRate'),
        usdBuybackRate: getEffectiveRate('usdBuybackRate'),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setForm({ thbSellRate: '', usdSellRate: '', thbBuybackRate: '', usdBuybackRate: '' });
      setError(null);
      setIsModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['rates'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const handleOpenModal = () => {
    setForm({
      thbSellRate: '',
      usdSellRate: '',
      thbBuybackRate: '',
      usdBuybackRate: '',
    });
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (save.isPending) return;
    setIsModalOpen(false);
    setError(null);
  };

  /** Prefill the form from the live rates so only what changed is retyped. */
  const prefill = () => {
    if (!current) return;
    setForm({
      thbSellRate: current.thbSellRate,
      usdSellRate: current.usdSellRate,
      thbBuybackRate: current.thbBuybackRate,
      usdBuybackRate: current.usdBuybackRate,
    });
    setError(null);
  };

  const [chartSource, setChartSource] = useState<'monthly' | 'recent'>('monthly');
  const [curveMode, setCurveMode] = useState<'monotone' | 'stepAfter'>('monotone');

  const monthlyChartData = useMemo(
    () =>
      series.map((p) => ({
        label: p.month,
        fullLabel: `ເດືອນ ${p.month}`,
        thbSell: Number(p.thbSell),
        thbBuyback: Number(p.thbBuyback),
        usdSell: Number(p.usdSell),
        usdBuyback: Number(p.usdBuyback),
      })),
    [series],
  );

  const recentChartData = useMemo(() => {
    const chronological = [...history].reverse();
    return chronological.map((row) => ({
      label: formatDate(row.effectiveAt).slice(0, 5),
      fullLabel: formatDateTime(row.effectiveAt),
      thbSell: Number(row.thbSellRate),
      thbBuyback: Number(row.thbBuybackRate),
      usdSell: Number(row.usdSellRate),
      usdBuyback: Number(row.usdBuybackRate),
    }));
  }, [history]);

  // If monthly series only has <= 1 point while recent history has multiple snapshots,
  // recent view is much more informative; user can still toggle freely.
  const activeChartData =
    chartSource === 'recent'
      ? recentChartData
      : monthlyChartData.length <= 1 && recentChartData.length > 1
        ? recentChartData
        : monthlyChartData;

  const effectiveSource: 'monthly' | 'recent' =
    chartSource === 'recent' || (monthlyChartData.length <= 1 && recentChartData.length > 1)
      ? 'recent'
      : 'monthly';

  const pager = usePagination(history);

  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການ Price Rate"
        subtitle="ອັດຕາແລກປ່ຽນ Sell ແລະ Buyback ສຳລັບ THB ແລະ USD (TOR §3.3)"
        actions={
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={handleOpenModal}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Update Price Rate
          </button>
        }
      />

      {currentFailed && <QueryErrorNotice error={currentError} onRetry={() => void refetchCurrent()} />}

      <div className="stat-grid">
        <StatCard label="THB Sell" value={current?.thbSellRate ? formatRate(current.thbSellRate) : '—'} sub="THB/LAK" />
        <StatCard label="USD Sell" value={current?.usdSellRate ? formatRate(current.usdSellRate) : '—'} sub="USD/LAK" />
        <StatCard label="THB Buyback" value={current?.thbBuybackRate ? formatRate(current.thbBuybackRate) : '—'} sub="LAK/THB" />
        <StatCard label="USD Buyback" value={current?.usdBuybackRate ? formatRate(current.usdBuybackRate) : '—'} sub="LAK/USD" />
      </div>

      <Dialog
        open={isModalOpen}
        onClose={handleCloseModal}
        size="lg"
        title="ອັບເດດ Price Rate"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary mr-auto"
              onClick={prefill}
              disabled={!current || save.isPending}
            >
              ໃສ່ຄ່າປັດຈຸບັນທັງໝົດ
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCloseModal}
              disabled={save.isPending}
            >
              ຍົກເລີກ
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canSubmit || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'Update Price Rate'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-recessed p-3.5 text-xs leading-relaxed text-muted">
            <span className="font-semibold text-fg">💡 ຄຳແນະນຳ:</span> ທ່ານສາມາດປ້ອນສະເພາະຫ້ອງທີ່ຕ້ອງການປ່ຽນແປງໄດ້. ສຳລັບຫ້ອງໃດທີ່ປະວ່າງໄວ້ ລະບົບຈະດຶງຄ່າເດີມສົ່ງໄປແທນໂດຍອັດຕະໂນມັດ.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => {
              const currentVal = current ? current[field.key] : null;
              const isCustomEntered = clean(form[field.key]) !== '';
              const isUsingFallback = !isCustomEntered && Boolean(currentVal);

              return (
                <div key={field.key} className="space-y-1.5">
                  <label className="label mb-0" htmlFor={`modal-${field.key}`}>
                    {field.labelLo}
                  </label>
                  <NumberInput
                    id={`modal-${field.key}`}
                    className="input num"
                    decimals={2}
                    value={form[field.key]}
                    placeholder={currentVal ? formatRate(currentVal) : '0.00'}
                    aria-describedby={error ? 'rates-modal-error' : undefined}
                    onValueChange={(v) => {
                      setForm((f) => ({ ...f, [field.key]: v }));
                      if (error) setError(null);
                    }}
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">
                      ຄ່າເດີມ: {currentVal ? <span className="font-mono font-medium text-fg">{formatRate(currentVal)}</span> : '—'}
                    </span>
                    {isUsingFallback ? (
                      <span className="text-gold text-[11px] font-medium">
                        (ຈະດຶງຄ່າເດີມ)
                      </span>
                    ) : isCustomEntered ? (
                      <span className="text-success text-[11px] font-medium">
                        (ກຳນົດຄ່າໃໝ່)
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div id="rates-modal-error" role="alert" className="notice status-danger">
              {error}
            </div>
          )}
        </div>
      </Dialog>

      {seriesFailed && <QueryErrorNotice error={seriesError} onRetry={() => void refetchSeries()} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <RateChart
          titleLo="ປະຫວັດອັດຕາ THB/LAK"
          unitLo="THB/LAK"
          data={activeChartData}
          source={effectiveSource}
          onSourceChange={setChartSource}
          curveMode={curveMode}
          onCurveModeChange={setCurveMode}
          series={[
            { key: 'thbSell', labelLo: 'THB Sell', idx: 0 },
            { key: 'thbBuyback', labelLo: 'THB Buyback', idx: 2 },
          ]}
        />
        <RateChart
          titleLo="ປະຫວັດອັດຕາ USD/LAK"
          unitLo="USD/LAK"
          data={activeChartData}
          source={effectiveSource}
          onSourceChange={setChartSource}
          curveMode={curveMode}
          onCurveModeChange={setCurveMode}
          series={[
            { key: 'usdSell', labelLo: 'USD Sell', idx: 0 },
            { key: 'usdBuyback', labelLo: 'USD Buyback', idx: 2 },
          ]}
        />
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ Price Rate</h2>
          <span className="text-xs text-muted">30 ແຖວລ່າສຸດ</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Price Rate">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th className="text-right">ຂາຍ THB/LAK</th>
                <th className="text-right">ຂາຍ USD/LAK</th>
                <th className="text-right">ຮັບຊື້ LAK/THB</th>
                <th className="text-right">ຮັບຊື້ LAK/USD</th>
                <th>ຜູ້ແກ້ໄຂ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={6}
                isLoading={historyLoading}
                isError={historyFailed}
                error={historyError}
                isEmpty={history.length === 0}
                emptyText="ຍັງບໍ່ມີປະຫວັດ"
                onRetry={() => void refetchHistory()}
                dense
              />
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.effectiveAt)}</td>
                  <td className="num text-right">{formatRate(row.thbSellRate)}</td>
                  <td className="num text-right">{formatRate(row.usdSellRate)}</td>
                  <td className="num text-right">{formatRate(row.thbBuybackRate)}</td>
                  <td className="num text-right">{formatRate(row.usdBuybackRate)}</td>
                  <td>{row.updatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}

interface ChartPoint {
  label: string;
  fullLabel: string;
  [key: string]: string | number | null;
}

interface EnrichedChartPoint extends ChartPoint {
  _sellDelta: number | null;
  _buyDelta: number | null;
  _spread: number;
}

/** Distinct dash + marker per series so lines read without relying on colour alone. */
const SERIES_STYLE = [
  { dash: undefined, fillStart: 0.26, fillEnd: 0.02, hollowDot: false },
  { dash: '6 4', fillStart: 0.14, fillEnd: 0.0, hollowDot: true },
] as const;

function formatSignedDelta(delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) return '0.00';
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${formatRate(String(Math.abs(delta)))}`;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || !Number.isFinite(delta)) {
    return <span className="badge num text-[11px] text-muted">—</span>;
  }
  if (Math.abs(delta) < 0.005) {
    return <span className="badge num text-[11px] text-muted">0.00</span>;
  }
  const up = delta > 0;
  return (
    <span className={`${up ? 'status-success' : 'status-danger'} num text-[11px]`}>
      {up ? '▲ ' : '▼ '}
      {formatSignedDelta(delta)}
    </span>
  );
}

function RateChart({
  titleLo,
  unitLo,
  data,
  source,
  onSourceChange,
  curveMode,
  onCurveModeChange,
  series,
}: {
  titleLo: string;
  unitLo: string;
  data: ChartPoint[];
  source: 'monthly' | 'recent';
  onSourceChange: (v: 'monthly' | 'recent') => void;
  curveMode: 'monotone' | 'stepAfter';
  onCurveModeChange: (v: 'monotone' | 'stepAfter') => void;
  series: Array<{ key: string; labelLo: string; idx: number }>;
}) {
  const theme = useChartTheme();
  const chartUid = useId().replace(/:/g, '');

  const sellSeries = series[0];
  const buybackSeries = series[1];

  // Enrich each point with step-over-step deltas and Sell-Buyback spread for the tooltip.
  const enrichedData = useMemo<EnrichedChartPoint[]>(() => {
    return data.map((point, index) => {
      const prev = index > 0 ? data[index - 1] : null;
      const sellVal = Number(point[sellSeries.key] ?? 0);
      const buyVal = Number(point[buybackSeries.key] ?? 0);
      const prevSell = prev ? Number(prev[sellSeries.key] ?? 0) : null;
      const prevBuy = prev ? Number(prev[buybackSeries.key] ?? 0) : null;
      return {
        ...point,
        _sellDelta: prevSell !== null ? sellVal - prevSell : null,
        _buyDelta: prevBuy !== null ? buyVal - prevBuy : null,
        _spread: sellVal - buyVal,
      };
    });
  }, [data, sellSeries.key, buybackSeries.key]);

  // Calculate dynamic Y-axis domain & summary metrics so small fluctuations stand out clearly.
  const metrics = useMemo(() => {
    if (enrichedData.length === 0) return null;
    const allValues: number[] = [];
    for (const pt of enrichedData) {
      for (const s of series) {
        const v = Number(pt[s.key]);
        if (Number.isFinite(v) && v > 0) allValues.push(v);
      }
    }
    if (allValues.length === 0) return null;

    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const span = maxVal - minVal;
    // Pad by 20% of the range (or 0.5% of value when flat) so lines never touch top/bottom edges.
    const pad = span > 0 ? span * 0.22 : Math.max(minVal * 0.005, 1);
    const domainMin = Math.max(0, Math.floor((minVal - pad) * 100) / 100);
    const domainMax = Math.ceil((maxVal + pad) * 100) / 100;

    const latest = enrichedData[enrichedData.length - 1];
    const latestSell = Number(latest[sellSeries.key] ?? 0);
    const latestBuy = Number(latest[buybackSeries.key] ?? 0);

    return {
      minVal,
      maxVal,
      domain: [domainMin, domainMax] as [number, number],
      latestSell,
      latestBuy,
      sellDelta: latest._sellDelta as number | null,
      buyDelta: latest._buyDelta as number | null,
      spread: latest._spread as number,
    };
  }, [enrichedData, series, sellSeries.key, buybackSeries.key]);

  return (
    <div data-fade className="card">
      <div className="card-header flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="card-title">{titleLo}</h2>
          <span className="badge num text-[11px] text-muted">{unitLo}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="tablist" aria-label={`ໄລຍະເວລາ ${titleLo}`}>
            <button
              type="button"
              role="tab"
              className="seg-btn"
              aria-selected={source === 'monthly'}
              onClick={() => onSourceChange('monthly')}
            >
              ລາຍເດືອນ
            </button>
            <button
              type="button"
              role="tab"
              className="seg-btn"
              aria-selected={source === 'recent'}
              onClick={() => onSourceChange('recent')}
            >
              ລ່າສຸດ
            </button>
          </div>

          <div className="seg" role="tablist" aria-label={`ຮູບແບບເສັ້ນ ${titleLo}`}>
            <button
              type="button"
              role="tab"
              className="seg-btn"
              aria-selected={curveMode === 'monotone'}
              onClick={() => onCurveModeChange('monotone')}
            >
              ເສັ້ນໂຄ້ງ
            </button>
            <button
              type="button"
              role="tab"
              className="seg-btn"
              aria-selected={curveMode === 'stepAfter'}
              onClick={() => onCurveModeChange('stepAfter')}
            >
              ຂັ້ນໄດ
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {enrichedData.length === 0 || !metrics ? (
          <div className="py-16 text-center text-sm text-muted">
            ຍັງບໍ່ມີຂໍ້ມູນພຽງພໍສຳລັບກຼາບ
          </div>
        ) : (
          <>
            {/* Price movement & spread summary strip */}
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="recessed rounded-xl px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-gold">{sellSeries.labelLo}</span>
                  <DeltaBadge delta={metrics.sellDelta} />
                </div>
                <div className="num mt-1 text-base font-semibold text-fg-strong">
                  {formatRate(String(metrics.latestSell))}
                </div>
              </div>

              <div className="recessed rounded-xl px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-fg">{buybackSeries.labelLo}</span>
                  <DeltaBadge delta={metrics.buyDelta} />
                </div>
                <div className="num mt-1 text-base font-semibold text-fg-strong">
                  {formatRate(String(metrics.latestBuy))}
                </div>
              </div>

              <div className="recessed rounded-xl px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-muted">ສ່ວນຕ່າງ (Spread)</span>
                  <span className="num text-[11px] font-medium text-gold">
                    {formatRate(String(metrics.spread))}
                  </span>
                </div>
                <div className="num mt-1 truncate text-xs text-muted" title={`${formatRate(String(metrics.minVal))} – ${formatRate(String(metrics.maxVal))}`}>
                  ຂອບເຂດ: <span className="font-medium text-fg">{formatRate(String(metrics.minVal))}</span> –{' '}
                  <span className="font-medium text-fg">{formatRate(String(metrics.maxVal))}</span>
                </div>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={enrichedData} margin={{ top: 10, right: 14, bottom: 4, left: 6 }}>
                <defs>
                  {series.map((s, idx) => {
                    const st = SERIES_STYLE[idx % SERIES_STYLE.length];
                    const color = theme.series[s.idx];
                    return (
                      <linearGradient
                        key={s.key}
                        id={`grad-${chartUid}-${s.key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={color} stopOpacity={st.fillStart} />
                        <stop offset="95%" stopColor={color} stopOpacity={st.fillEnd} />
                      </linearGradient>
                    );
                  })}
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: theme.axis }}
                  stroke={theme.grid}
                  tickMargin={6}
                />
                <YAxis
                  domain={metrics.domain}
                  tickFormatter={(v: number) => formatRate(String(v))}
                  tick={{ fontSize: 11, fill: theme.axis }}
                  stroke={theme.grid}
                  width={78}
                />
                <ReferenceLine
                  y={metrics.latestSell}
                  stroke={theme.series[sellSeries.idx]}
                  strokeDasharray="2 4"
                  strokeOpacity={0.45}
                />
                <Tooltip
                  cursor={{ stroke: theme.axis, strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0]?.payload as ChartPoint & {
                      _sellDelta: number | null;
                      _buyDelta: number | null;
                      _spread: number;
                    };
                    if (!row) return null;

                    return (
                      <div
                        className="rounded-xl p-3 shadow-lg"
                        style={{
                          background: theme.tooltipBg,
                          border: `1px solid ${theme.tooltipBorder}`,
                          color: theme.text,
                          minWidth: 210,
                        }}
                      >
                        <div
                          className="mb-2 border-b pb-1.5 text-xs font-semibold"
                          style={{ borderColor: theme.grid, color: theme.series[0] }}
                        >
                          {row.fullLabel}
                        </div>
                        <div className="space-y-1.5 text-xs">
                          {series.map((s, idx) => {
                            const val = Number(row[s.key] ?? 0);
                            const delta = idx === 0 ? row._sellDelta : row._buyDelta;
                            const color = theme.series[s.idx];
                            return (
                              <div key={s.key} className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                    style={{
                                      backgroundColor: idx === 0 ? color : 'transparent',
                                      border: `2px solid ${color}`,
                                    }}
                                  />
                                  <span>{s.labelLo}</span>
                                </span>
                                <span className="num flex items-center gap-1.5 font-semibold">
                                  <span>{formatRate(String(val))}</span>
                                  {delta !== null && Math.abs(delta) >= 0.005 && (
                                    <span
                                      className="text-[11px] font-medium"
                                      style={{
                                        color: delta > 0 ? theme.series[2] : theme.series[3],
                                      }}
                                    >
                                      ({formatSignedDelta(delta)})
                                    </span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                          <div
                            className="mt-1.5 flex items-center justify-between border-t pt-1.5 text-[11px]"
                            style={{ borderColor: theme.grid, color: theme.axis }}
                          >
                            <span>ສ່ວນຕ່າງ (Sell − Buyback)</span>
                            <span className="num font-semibold" style={{ color: theme.text }}>
                              {formatRate(String(row._spread))}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: theme.text, paddingTop: 6 }} />
                {series.map((s, idx) => {
                  const st = SERIES_STYLE[idx % SERIES_STYLE.length];
                  const color = theme.series[s.idx];
                  return (
                    <Area
                      key={s.key}
                      type={curveMode}
                      dataKey={s.key}
                      name={s.labelLo}
                      stroke={color}
                      strokeWidth={idx === 0 ? 2.5 : 2}
                      strokeDasharray={st.dash}
                      fill={`url(#grad-${chartUid}-${s.key})`}
                      fillOpacity={1}
                      dot={{
                        r: 3.5,
                        strokeWidth: 2,
                        stroke: color,
                        fill: st.hollowDot ? theme.tooltipBg : color,
                      }}
                      activeDot={{
                        r: 5.5,
                        strokeWidth: 2,
                        stroke: theme.tooltipBg,
                        fill: color,
                      }}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
