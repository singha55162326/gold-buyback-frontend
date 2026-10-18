'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatDateTime } from '@/lib/format';
import { AuditView } from '@/components/audit-view';

interface SoftGoldFee {
  id: string;
  value: string;
  effectiveAt: string;
}

interface HistoryRow extends SoftGoldFee {
  updatedBy: string;
}

/** TOR §3.4 — ຈັດການ ຄ່າອ່ອນ. */
export default function SoftGoldFeePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: current } = useQuery({
    queryKey: ['fees', 'soft-gold'],
    queryFn: () => api.get<SoftGoldFee>('/fees/soft-gold'),
    retry: false,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['fees', 'soft-gold', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/fees/soft-gold/history?limit=30'),
  });

  const save = useMutation({
    mutationFn: () => api.post('/fees/soft-gold', { value: value.replace(/,/g, '').trim() }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setValue('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['fees', 'soft-gold'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pager = usePagination(history);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຈັດການ ຄ່າອ່ອນ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຄ່າຫັກຕໍ່ຫົວໜ່ວຍສຳລັບຄຳທີ່ນ້ຳໜັກຫຼຸດຈາກເກນ standard (TOR §3.4)
        </p>
      </div>

      <div className="card p-5">
        <div className="mb-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            ຄ່າຄຳອ່ອນປັດຈຸບັນ
          </div>
          <div className="num mt-1 text-2xl font-bold text-gold-700">
            {current ? `${formatLak(current.value)} LAK` : '—'}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="value">
              ຄ່າຄຳອ່ອນໃໝ່ (LAK)
            </label>
            <input
              id="value"
              className="input num"
              inputMode="decimal"
              placeholder="400,000"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!value.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'ອັບເດດຄ່າອ່ອນ'}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ</h2>
          <span className="text-xs text-slate-500">30 ແຖວລ່າສຸດ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ ແລະ ເວລາ</th>
                <th className="text-right">ຄ່າຄຳອ່ອນ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-500">
                    ຍັງບໍ່ມີປະຫວັດ
                  </td>
                </tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.effectiveAt)}</td>
                  <td className="num text-right">{formatLak(row.value)}</td>
                  <td>{row.updatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      <AuditView entity="SoftGoldFeeSnapshot" titleLo="ການປ່ຽນແປງລ່າສຸດ ແລະ Audit Log" />
    </div>
  );
}
