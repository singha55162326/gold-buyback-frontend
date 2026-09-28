'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';

interface GoldType { id: string; nameLo: string }
interface SummaryRow {
  goldTypeId: string; goldTypeCode: string; goldTypeNameLo: string;
  weightG: string; bahtWeight: string; quantity: number; totalPaid: string;
  averagePerGram: string | null; averagePerBaht: string | null;
  averageMessageLo: string | null;
}
interface Handover {
  id: string; code: string; weightG: string; status: string;
  note: string | null; createdAt: string;
  goldType: { nameLo: string };
  shift: { user: { fullName: string } };
}

const STATUS: Record<string, { lo: string; cls: string }> = {
  PENDING: { lo: 'ລໍຖ້າ Warehouse ຮັບ', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { lo: 'ຮັບແລ້ວ', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { lo: 'ປະຕິເສດ', cls: 'bg-red-100 text-red-800' },
  COMPLETED: { lo: 'ສຳເລັດ', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { lo: 'ຍົກເລີກ', cls: 'bg-slate-100 text-slate-600' },
};

/** TOR §4.2 — ຄຳເກົ່າທັງໝົດ & ສະຫຼຸບປະເພດຄຳ. */
export default function OldGoldPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [goldTypeId, setGoldTypeId] = useState('');
  const [weightG, setWeightG] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: goldTypes = [] } = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types?stockOnly=true'),
  });
  const { data: summary = [] } = useQuery({
    queryKey: ['stock', 'old-gold-summary'],
    queryFn: () => api.get<SummaryRow[]>('/stock/old-gold-summary'),
  });
  const { data: handovers = [] } = useQuery({
    queryKey: ['stock', 'handovers'],
    queryFn: () => api.get<Handover[]>('/stock/handovers'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/stock/handovers', {
        goldTypeId, weightG: weightG.trim(), note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setWeightG(''); setNote(''); setError(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ຄຳເກົ່າທັງໝົດ & ສະຫຼຸບປະເພດຄຳ</h1>
          <p className="mt-1 text-sm text-slate-500">
            ຄຳເກົ່າທີ່ຮັບເຂົ້າໃນມື້ ແລະ ການມອບຄຳລະຫວ່າງມື້ໃຫ້ສາງ (TOR §4.2)
          </p>
        </div>
        <button className="btn-secondary" onClick={() => window.print()}>ພິມຕາຕະລາງ</button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="card">
        <div className="card-header"><h2 className="card-title">ສະຫຼຸບປະເພດຄຳ</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ປະເພດຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ບາດຄຳ (= g/15)</th>
                <th className="text-right">ຈຳນວນ</th>
                <th className="text-right">TOTAL ເງິນທີ່ຈ່າຍ</th>
                <th className="text-right">ສະເລ່ຍ / g</th>
                <th className="text-right">ສະເລ່ຍ / ບາດ</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີຂໍ້ມູນໃນມື້ນີ້</td></tr>
              )}
              {summary.map((row) => (
                <tr key={row.goldTypeId}>
                  <td className="font-medium">{row.goldTypeNameLo}</td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{formatWeight(row.bahtWeight)}</td>
                  <td className="num text-right">{row.quantity}</td>
                  <td className="num text-right font-medium">{formatLak(row.totalPaid)}</td>
                  <td className="num text-right" title={row.averageMessageLo ?? ''}>
                    {row.averagePerGram ? formatLak(row.averagePerGram) : '—'}
                  </td>
                  <td className="num text-right" title={row.averageMessageLo ?? ''}>
                    {row.averagePerBaht ? formatLak(row.averagePerBaht) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          ຄຳດີ/ຫຍຸບ/ແທ່ງ: ສະເລ່ຍ(g) = ລວມເງິນທີ່ຕ້ອງຈ່າຍ / (ລວມນ້ຳໜັກຄຳເກົ່າ − ລວມນ້ຳໜັກຄຳໃໝ່) ·
          ຄຳຕົ້ມ: ສະເລ່ຍ(g) = ລວມເງິນທີ່ຕ້ອງຈ່າຍ / ລວມນ້ຳໜັກຄຳເກົ່າ.
          ສະແດງ &quot;—&quot; ເມື່ອຕົວຫານເປັນ 0 ຫຼື ຕິດລົບ.
        </p>
      </div>

      <div className="card p-5">
        <h2 className="card-title mb-4">ມອບຄຳລະຫວ່າງມື້</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="goldType">ປະເພດຄຳ</label>
            <select id="goldType" className="input" value={goldTypeId}
              onChange={(e) => setGoldTypeId(e.target.value)}>
              <option value="">— ເລືອກປະເພດຄຳ —</option>
              {goldTypes.map((t) => <option key={t.id} value={t.id}>{t.nameLo}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="weightG">weight_g</label>
            <input id="weightG" className="input num" inputMode="decimal" value={weightG}
              onChange={(e) => setWeightG(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <button className="btn-primary"
            disabled={!goldTypeId || Number(weightG) <= 0 || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງສົ່ງ...' : 'ມອບຄຳລະຫວ່າງມື້'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">ສົ່ງໃຫ້ Warehouse ກົດ Approve</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">History ມອບຄຳ</h2>
          <span className="text-xs text-slate-500">{handovers.length} ລາຍການ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ວັນທີ</th>
                <th>ປະເພດຄຳ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th>ຜູ້ມອບ</th>
                <th>ໝາຍເຫດ</th>
                <th>ສະຖານະ</th>
              </tr>
            </thead>
            <tbody>
              {handovers.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {handovers.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.goldType.nameLo}</td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td>{row.shift.user.fullName}</td>
                  <td className="text-slate-500">{row.note ?? '—'}</td>
                  <td>
                    <span className={`badge ${STATUS[row.status]?.cls ?? 'bg-slate-100 text-slate-600'}`}>
                      {STATUS[row.status]?.lo ?? row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
