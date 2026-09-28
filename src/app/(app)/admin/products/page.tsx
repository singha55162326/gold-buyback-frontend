'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buildPriceBoard, TIER_META, type PriceBoard as DomainBoard } from '@kpv/domain';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDate, formatDateTime } from '@/lib/format';

interface PriceLine {
  tierCode: string;
  labelLo: string;
  category: 'JEWELRY' | 'BAR';
  displayWeightG: string;
  exchangeWeightG: string;
  sellPrice: string;
  buybackPrice: string;
  steps: { a: string; b: string; c: string; d: string } | null;
}

interface CurrentBoard {
  id: string;
  price1Baht: string;
  effectiveAt: string;
  lines: PriceLine[];
}

interface HistoryRow {
  id: string;
  date: string;
  price1Baht: string;
  updatedBy: string;
  note: string | null;
}

/**
 * TOR §3.1 — ຈັດການ Products (ຕັ້ງລາຄາ & ສູດຄິດໄລ່).
 *
 * The preview is computed locally by @kpv/domain — the same package the API
 * uses to persist the snapshot. That is deliberate: the owner sees the exact
 * numbers that will be stored, with no round trip and no chance of the
 * preview and the saved board disagreeing.
 */
export default function ProductsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [input, setInput] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: current } = useQuery({
    queryKey: ['pricing', 'current'],
    queryFn: () => api.get<CurrentBoard>('/pricing/current'),
    retry: false,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['pricing', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/pricing/history?limit=30'),
  });

  const save = useMutation({
    mutationFn: (price1Baht: string) => api.post('/pricing/set', { price1Baht }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setInput('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['pricing'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  /** Live A/B/C/D board, recomputed on every keystroke. */
  const preview: DomainBoard | null = useMemo(() => {
    const raw = input.replace(/,/g, '').trim();
    if (!raw || !/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0) return null;
    try {
      return buildPriceBoard(raw);
    } catch {
      return null;
    }
  }, [input]);

  const rows = preview
    ? preview.lines.map((line) => {
        const meta = TIER_META[line.tier as keyof typeof TIER_META];
        return {
          tierCode: line.tier,
          labelLo: meta?.labelLo ?? line.tier,
          displayWeightG: meta?.displayWeightG.toFixed() ?? '',
          exchangeWeightG: meta?.exchangeWeightG.toFixed() ?? '',
          sellPrice: line.sellPrice.toFixed(),
          buybackPrice: line.buybackPrice.toFixed(),
          steps: line.steps
            ? {
                a: line.steps.a.toFixed(),
                b: line.steps.b.toFixed(),
                c: line.steps.c.toFixed(),
                d: line.steps.d.toFixed(),
              }
            : null,
        };
      })
    : (current?.lines ?? []);

  const isPreview = preview !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຈັດການ Products</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຕັ້ງລາຄາຮູບປະພັນ 1 ບາດ — ລະບົບຄິດໄລ່ລາຄາຂາຍ ແລະ ລາຄາຊື້ຄືນ ທຸກນ້ຳໜັກອັດຕະໂນມັດ (TOR §3.1)
        </p>
      </div>

      {/* Set Pricing */}
      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="price1Baht">
              ລາຄາຂາຍ ຮູບປະພັນ 1 ບາດ (LAK)
            </label>
            <input
              id="price1Baht"
              className="input num text-lg"
              inputMode="decimal"
              placeholder={current ? formatLak(current.price1Baht) : '45,859,000'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>

          <button
            className="btn-primary"
            disabled={!isPreview || save.isPending}
            onClick={() => save.mutate(input.replace(/,/g, '').trim())}
          >
            {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'Set Pricing'}
          </button>

          <button className="btn-secondary" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? 'ເຊື່ອງສູດ A/B/C/D' : 'ສະແດງສູດ A/B/C/D'}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {isPreview && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ນີ້ແມ່ນ <strong>ຕົວຢ່າງ</strong> — ຍັງບໍ່ໄດ້ບັນທຶກ. ກົດ &quot;Set Pricing&quot; ເພື່ອບັນທຶກ.
          </div>
        )}
      </div>

      {/* Price board */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {isPreview ? 'ຕາຕະລາງລາຄາ (ຕົວຢ່າງ)' : 'ຕາຕະລາງລາຄາປັດຈຸບັນ'}
          </h2>
          {current && !isPreview && (
            <span className="text-xs text-slate-500">
              ອັບເດດລ່າສຸດ {formatDate(current.effectiveAt)}
            </span>
          )}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ໝວດ / ລາຍການ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ນ້ຳໜັກປ່ຽນເປັນເງິນ</th>
                {showSteps && (
                  <>
                    <th className="text-right">A</th>
                    <th className="text-right">B</th>
                    <th className="text-right">C</th>
                    <th className="text-right">D</th>
                  </>
                )}
                <th className="text-right">ລາຄາຂາຍ (LAK)</th>
                <th className="text-right">ລາຄາຊື້ຄືນ (LAK)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={showSteps ? 9 : 5} className="py-8 text-center text-slate-500">
                    ຍັງບໍ່ມີການຕັ້ງລາຄາ — ປ້ອນລາຄາຂາຍ 1 ບາດ ດ້ານເທິງເພື່ອເບິ່ງຕົວຢ່າງ
                  </td>
                </tr>
              )}
              {rows.map((line) => (
                <tr key={line.tierCode}>
                  <td className="font-medium">{line.labelLo}</td>
                  <td className="num text-right text-slate-500">
                    {formatWeight(line.displayWeightG)}
                  </td>
                  <td className="num text-right text-slate-500">
                    {formatWeight(line.exchangeWeightG)}
                  </td>
                  {showSteps && (
                    <>
                      <td className="num text-right text-xs text-slate-400">
                        {line.steps ? formatLak(line.steps.a) : '—'}
                      </td>
                      <td className="num text-right text-xs text-slate-400">
                        {line.steps ? formatLak(line.steps.b) : '—'}
                      </td>
                      <td className="num text-right text-xs text-slate-400">
                        {line.steps ? formatLak(line.steps.c) : '—'}
                      </td>
                      <td className="num text-right text-xs text-slate-400">
                        {line.steps ? formatLak(line.steps.d) : '—'}
                      </td>
                    </>
                  )}
                  <td className="num text-right font-semibold">{formatLak(line.sellPrice)}</td>
                  <td className="num text-right">{formatLak(line.buybackPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Products — 30 rows (TOR §3.1) */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ Products</h2>
          <span className="text-xs text-slate-500">30 ແຖວລ່າສຸດ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ ແລະ ເວລາ</th>
                <th className="text-right">ລາຄາ 1 ບາດ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th>ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    ຍັງບໍ່ມີປະຫວັດ
                  </td>
                </tr>
              )}
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.date)}</td>
                  <td className="num text-right">{formatLak(row.price1Baht)}</td>
                  <td>{row.updatedBy}</td>
                  <td className="text-slate-500">{row.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
