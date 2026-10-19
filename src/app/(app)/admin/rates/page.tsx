'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { formatRate, formatDate } from '@/lib/format';
import { StatCard } from '@/components/stat-card';

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

  const save = useMutation({
    mutationFn: () =>
      api.post('/rates/update', {
        thbSellRate: clean(form.thbSellRate),
        usdSellRate: clean(form.usdSellRate),
        thbBuybackRate: clean(form.thbBuybackRate),
        usdBuybackRate: clean(form.usdBuybackRate),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setForm({ thbSellRate: '', usdSellRate: '', thbBuybackRate: '', usdBuybackRate: '' });
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['rates'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  /** Prefill the form from the live rates so only what changed is retyped. */
  const prefill = () => {
    if (!current) return;
    setForm({
      thbSellRate: current.thbSellRate,
      usdSellRate: current.usdSellRate,
      thbBuybackRate: current.thbBuybackRate,
      usdBuybackRate: current.usdBuybackRate,
    });
  };

  const complete = FIELDS.every((f) => clean(form[f.key]).length > 0);

  const chartData = series.map((p) => ({
    month: p.month,
    thbSell: Number(p.thbSell),
    thbBuyback: Number(p.thbBuyback),
    usdSell: Number(p.usdSell),
    usdBuyback: Number(p.usdBuyback),
  }));

  const pager = usePagination(history);


  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການ Price Rate"
        subtitle="ອັດຕາແລກປ່ຽນ Sell ແລະ Buyback ສຳລັບ THB ແລະ USD (TOR §3.3)"
      />

      {currentFailed && <QueryErrorNotice error={currentError} onRetry={() => void refetchCurrent()} />}

      <div className="stat-grid">
        <StatCard label="THB Sell" value={current?.thbSellRate ? formatRate(current.thbSellRate) : '—'} sub="THB/LAK" />
        <StatCard label="USD Sell" value={current?.usdSellRate ? formatRate(current.usdSellRate) : '—'} sub="USD/LAK" />
        <StatCard label="THB Buyback" value={current?.thbBuybackRate ? formatRate(current.thbBuybackRate) : '—'} sub="LAK/THB" />
        <StatCard label="USD Buyback" value={current?.usdBuybackRate ? formatRate(current.usdBuybackRate) : '—'} sub="LAK/USD" />
      </div>

      <div data-fade className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="card-title">ອັບເດດ Price Rate</h2>
          <button className="btn-secondary" onClick={prefill} disabled={!current}>
            ໃສ່ຄ່າປັດຈຸບັນ
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className="label" htmlFor={field.key}>
                {field.labelLo}
              </label>
              <NumberInput
                id={field.key}
                className="input num"
                decimals={2}
                value={form[field.key]}
                aria-describedby={error ? 'rates-error' : undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
              />
            </div>
          ))}
        </div>

        {error && (
          <div id="rates-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}

        <div className="mt-4">
          <button
            className="btn-primary"
            disabled={!complete || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'Update Price Rate'}
          </button>
        </div>
      </div>

      {seriesFailed && <QueryErrorNotice error={seriesError} onRetry={() => void refetchSeries()} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <RateChart
          titleLo="ປະຫວັດອັດຕາ THB/LAK"
          data={chartData}
          series={[
            { key: 'thbSell', labelLo: 'THB Sell', idx: 0 },
            { key: 'thbBuyback', labelLo: 'THB Buyback', idx: 1 },
          ]}
        />
        <RateChart
          titleLo="ປະຫວັດອັດຕາ USD/LAK"
          data={chartData}
          series={[
            { key: 'usdSell', labelLo: 'USD Sell', idx: 0 },
            { key: 'usdBuyback', labelLo: 'USD Buyback', idx: 1 },
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

function clean(value: string): string {
  return value.replace(/,/g, '').trim();
}


/** Distinct dash + marker per series so lines read without relying on colour. */
const SERIES_STYLE = [
  { dash: undefined, dot: { r: 3 } },
  { dash: '6 4', dot: { r: 3, strokeWidth: 2, fill: 'transparent' } },
] as const;

function RateChart({
  titleLo,
  data,
  series,
}: {
  titleLo: string;
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; labelLo: string; idx: number }>;
}) {
  const theme = useChartTheme();
  return (
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">{titleLo}</h2>
      </div>
      <div className="p-4">
        {data.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted">
            ຍັງບໍ່ມີຂໍ້ມູນພຽງພໍສຳລັບກຼາບ
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.axis }} stroke={theme.grid} />
              <YAxis tick={{ fontSize: 11, fill: theme.axis }} stroke={theme.grid} width={70} />
              <Tooltip
                formatter={(value) => formatRate(value === undefined ? null : String(value))}
                contentStyle={{
                  fontSize: 12,
                  background: theme.tooltipBg,
                  border: `1px solid ${theme.tooltipBorder}`,
                  borderRadius: 12,
                  color: theme.text,
                }}
                labelStyle={{ color: theme.text }}
                itemStyle={{ color: theme.text }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: theme.text }} />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.labelLo}
                  stroke={theme.series[s.idx]}
                  strokeWidth={2}
                  strokeDasharray={SERIES_STYLE[s.idx % SERIES_STYLE.length].dash}
                  dot={{ fill: theme.series[s.idx], ...SERIES_STYLE[s.idx % SERIES_STYLE.length].dot, stroke: theme.series[s.idx] }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
