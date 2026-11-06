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
