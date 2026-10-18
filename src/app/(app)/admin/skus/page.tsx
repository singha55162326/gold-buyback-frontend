'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec, GRAMS_PER_BAHT, trimTrailingZeros } from '@kpv/domain';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { formatWeight } from '@/lib/format';

interface GoldItem {
  id: string;
  code: string;
  nameLo: string;
}

interface Sku {
  id: string;
  nameLo: string;
  weightG: string;
  bahtWeight: string;
  fullSkuName: string;
  isActive: boolean;
  goldItem: GoldItem;
}

/**
 * Mirrors SkusService.buildFullSkuName on the server so the name previews as
 * the user types. The server still derives the stored name itself — this is a
 * display convenience, never the source of truth.
 */
function previewSkuName(nameLo: string, weightG: string): string | null {
  const raw = weightG.trim();
  if (!nameLo.trim() || !raw || !/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0) return null;
  const baht = trimTrailingZeros(dec(raw).div(GRAMS_PER_BAHT).toDecimalPlaces(2).toFixed());
  return `${nameLo.trim()} ${baht} ບາດ`;
}

/** TOR §3.6 — ລະບົບຈັດການ SKU ນ້ຳໜັກຂອງຄຳ. */
export default function SkusPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [goldItemId, setGoldItemId] = useState('');
  const [nameLo, setNameLo] = useState('');
  const [weightG, setWeightG] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: goldItems = [] } = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });

  const { data: skus = [] } = useQuery({
    queryKey: ['skus'],
    queryFn: () => api.get<Sku[]>('/skus'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/skus', { goldItemId, nameLo, weightG: weightG.trim() }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setNameLo('');
      setWeightG('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['skus'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/skus/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['skus'] }),
  });

  const fullSkuName = useMemo(() => previewSkuName(nameLo, weightG), [nameLo, weightG]);
  const bahtWeight = useMemo(() => {
    const raw = weightG.trim();
    if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return null;
    return dec(raw).div(GRAMS_PER_BAHT).toDecimalPlaces(4).toFixed();
  }, [weightG]);

  const canSave = Boolean(goldItemId && fullSkuName);

  const pager = usePagination(skus);

  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການ SKU ນ້ຳໜັກຂອງຄຳ"
        subtitle="ປ້ອນຊື່ສິນຄ້າ ແລະ ນ້ຳໜັກ (g) — ລະບົບຄິດໄລ່ບາດຄຳ ແລະ ຕັ້ງຊື່ SKU ອັດຕະໂນມັດ (TOR §3.6)"
      />

      <div data-fade className="card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="goldItem">
              ລາຍການຄຳ
            </label>
            <select
              id="goldItem"
              className="input"
              aria-describedby={error ? 'sku-error' : undefined}
              value={goldItemId}
              onChange={(e) => {
                const id = e.target.value;
                setGoldItemId(id);
                // Default the SKU name to the item name, as the TOR example does.
                const item = goldItems.find((g) => g.id === id);
                if (item && !nameLo) setNameLo(item.nameLo);
              }}
            >
              <option value="">— ເລືອກລາຍການຄຳ —</option>
              {goldItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nameLo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="skuName">
              ຊື່ສິນຄ້າ
            </label>
            <input
              id="skuName"
              className="input"
              aria-describedby={error ? 'sku-error' : undefined}
              placeholder="ສາຍແຂນ"
              value={nameLo}
              onChange={(e) => setNameLo(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="weightG">
              ນ້ຳໜັກ (g)
            </label>
            <input
              id="weightG"
              className="input num"
              aria-describedby={error ? 'sku-error' : undefined}
              inputMode="decimal"
              placeholder="15"
              value={weightG}
              // TOR 3.6: weight is entered to 3 decimal places.
              onChange={(e) => {
                const next = e.target.value;
                if (next === '' || /^\d*\.?\d{0,3}$/.test(next)) setWeightG(next);
              }}
            />
          </div>
        </div>

        {/* Real-time derivation, exactly as the TOR describes the workflow. */}
        <div className="mt-4 grid gap-3 rounded-xl recessed p-4 sm:grid-cols-2">
          <div>
            <div className="label">
              ບາດຄຳ = ນ້ຳໜັກ / 15
            </div>
            <div className="num mt-0.5 text-lg font-semibold text-fg-strong">
              {bahtWeight ? formatWeight(bahtWeight) : '—'}
            </div>
          </div>
          <div>
            <div className="label">
              full_sku_name
            </div>
            <div className="mt-0.5 text-lg font-semibold text-gold">{fullSkuName ?? '—'}</div>
          </div>
        </div>

        {error && (
          <div id="sku-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}

        <div className="mt-4">
          <button
            className="btn-primary"
            disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ເພີ່ມ SKU'}
          </button>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການ SKU</h2>
          <span className="text-xs text-muted">{skus.length} ລາຍການ</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການ SKU">
          <table className="table">
            <thead>
              <tr>
                <th>ຊື່ SKU ເຕັມ</th>
                <th>ລາຍການຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ບາດຄຳ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {skus.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    ຍັງບໍ່ມີ SKU
                  </td>
                </tr>
              )}
              {pager.pageItems.map((sku) => (
                <tr key={sku.id}>
                  <td className="font-medium">{sku.fullSkuName}</td>
                  <td className="text-muted">{sku.goldItem.nameLo}</td>
                  <td className="num text-right">{formatWeight(sku.weightG)}</td>
                  <td className="num text-right">{formatWeight(sku.bahtWeight)}</td>
                  <td className="text-right">
                    <button
                      className="btn-danger"
                      onClick={() => remove.mutate(sku.id)}
                      disabled={remove.isPending}
                    >
                      ລຶບ
                    </button>
                  </td>
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
