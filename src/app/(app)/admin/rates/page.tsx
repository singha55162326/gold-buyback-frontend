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
import { api, ApiError } from '@/lib/api';
import { formatRate, formatDate } from '@/lib/format';

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

  const { data: current } = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
    retry: false,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['rates', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/rates/history?limit=30'),
  });

  const { data: series = [] } = useQuery({
    queryKey: ['rates', 'series'],
    queryFn: () => api.get<SeriesPoint[]>('/rates/series?months=12'),
  });

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຈັດການ Price Rate</h1>
        <p className="mt-1 text-sm text-slate-500">
          ອັດຕາແລກປ່ຽນ Sell ແລະ Buyback ສຳລັບ THB ແລະ USD (TOR §3.3)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat labelLo="THB Sell" value={current?.thbSellRate} hint="THB/LAK" />
        <Stat labelLo="USD Sell" value={current?.usdSellRate} hint="USD/LAK" />
        <Stat labelLo="THB Buyback" value={current?.thbBuybackRate} hint="LAK/THB" />
        <Stat labelLo="USD Buyback" value={current?.usdBuybackRate} hint="LAK/USD" />
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="card-title">ອັບເດດ Price Rate</h2>
          <button className="btn-secondary py-1 text-xs" onClick={prefill} disabled={!current}>
            ໃສ່ຄ່າປັດຈຸບັນ
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className="label" htmlFor={field.key}>
                {field.labelLo}
              </label>
              <input
                id={field.key}
                className="input num"
                inputMode="decimal"
                value={form[field.key]}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <RateChart
          titleLo="ປະຫວັດອັດຕາ THB/LAK"
          data={chartData}
          series={[
            { key: 'thbSell', labelLo: 'THB Sell', color: '#b47416' },
            { key: 'thbBuyback', labelLo: 'THB Buyback', color: '#0ea5e9' },
          ]}
        />
        <RateChart
          titleLo="ປະຫວັດອັດຕາ USD/LAK"
          data={chartData}
          series={[
            { key: 'usdSell', labelLo: 'USD Sell', color: '#b47416' },
            { key: 'usdBuyback', labelLo: 'USD Buyback', color: '#0ea5e9' },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ Price Rate</h2>
          <span className="text-xs text-slate-500">30 ແຖວລ່າສຸດ</span>
        </div>
        <div className="table-wrap">
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
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    ຍັງບໍ່ມີປະຫວັດ
                  </td>
                </tr>
              )}
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

function Stat({
  labelLo,
  value,
  hint,
}: {
  labelLo: string;
  value: string | undefined;
  hint: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelLo}</div>
      <div className="num mt-1 text-xl font-bold text-slate-900">
        {value ? formatRate(value) : '—'}
      </div>
      <div className="mt-0.5 text-xs text-slate-400">{hint}</div>
    </div>
  );
}

function RateChart({
  titleLo,
  data,
  series,
}: {
  titleLo: string;
  data: Array<Record<string, string | number>>;
  series: Array<{ key: string; labelLo: string; color: string }>;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{titleLo}</h2>
      </div>
      <div className="p-4">
        {data.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            ຍັງບໍ່ມີຂໍ້ມູນພຽງພໍສຳລັບກຼາບ
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70} />
              <Tooltip
                formatter={(value) => formatRate(value === undefined ? null : String(value))}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.labelLo}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
