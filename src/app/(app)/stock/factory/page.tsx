'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDate } from '@/lib/format';

interface Tracking {
  id: string;
  goldOutG: string;
  factoryAssessedG: string | null;
  cost: string;
  status: 'AWAITING_ASSESSMENT' | 'COMPLETED';
  createdAt: string;
  completedAt: string | null;
  partner: { nameLo: string };
  movement: { code: string; transformType: string | null };
}

/**
 * TOR §7.3 — ຕິດຕາມ Stock Out ໄປ FACTORY.
 *
 * A FACTORY OUT does not deduct stock when approved: it waits here until the
 * factory reports the assessed weight. Once Completed only Admin/Manager may
 * edit, which the API enforces regardless of what this page allows.
 */
export default function FactoryTrackingPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const user = getStoredUser();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const { data: rows = [] } = useQuery({
    queryKey: ['stock', 'factory'],
    queryFn: () => api.get<Tracking[]>('/stock/factory'),
  });

  const save = useMutation({
    mutationFn: (id: string) =>
      api.post(`/stock/factory/${id}/assessment`, { factoryAssessedG: weight.trim() }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setEditing(null);
      setWeight('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pager = usePagination(rows);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຕິດຕາມ Stock Out ໄປ FACTORY</h1>
        <p className="mt-1 text-sm text-slate-500">
          ລາຍການທີ່ Approve ແລ້ວ ລໍຖ້າ FACTORY ປະເມີນນ້ຳໜັກ (TOR §7.3)
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        ລະບົບຍັງບໍ່ຕັດຍອດຈົນກວ່າຈະປ້ອນນ້ຳໜັກທີ່ FACTORY ປະເມີນ.
        ເມື່ອບັນທຶກແລ້ວ ສະຖານະຈະເປັນ Completed ແລະ ຕັດຍອດ Stock (OLD) ພ້ອມບັນທຶກ AP-AR (GOLD).
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="card">
        <div className="card-header"><h2 className="card-title">ລາຍການຕິດຕາມ</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ວັນທີ</th>
                <th>ແຫຼ່ງສົ່ງອອກ</th>
                <th>ແປງສະພາບ</th>
                <th className="text-right">ຄຳອອກ (g) (−)</th>
                <th className="text-right">ນໍ້າໜັກg FACTORY ປະເມີນ</th>
                <th className="text-right">ຕົ້ນທຶນຄຳ</th>
                <th>ສະຖານະ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {pager.pageItems.map((row) => {
                const locked = row.status === 'COMPLETED' && !isAdmin;
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.movement.code}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.partner.nameLo}</td>
                    <td className="text-slate-500">{row.movement.transformType ?? '—'}</td>
                    <td className="num text-right">{formatWeight(row.goldOutG)}</td>
                    <td className="num text-right">
                      {editing === row.id ? (
                        <input
                          className="input num w-32 text-right"
                          inputMode="decimal"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        formatWeight(row.factoryAssessedG)
                      )}
                    </td>
                    <td className="num text-right">{formatLak(row.cost)}</td>
                    <td>
                      <span className={row.status === 'COMPLETED' ? 'badge bg-emerald-100 text-emerald-800' : 'badge bg-amber-100 text-amber-800'}>
                        {row.status === 'COMPLETED' ? 'Completed' : 'ລໍຖ້າ FACTORY ປະເມີນ'}
                      </span>
                    </td>
                    <td className="text-right">
                      {editing === row.id ? (
                        <div className="flex justify-end gap-2">
                          <button className="text-sm text-gold-700 hover:underline"
                            onClick={() => save.mutate(row.id)} disabled={save.isPending || !weight.trim()}>
                            ບັນທຶກ
                          </button>
                          <button className="text-sm text-slate-500 hover:underline" onClick={() => setEditing(null)}>
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : locked ? (
                        <span className="text-xs text-slate-400">ສະເພາະ Admin</span>
                      ) : (
                        <button className="text-sm text-gold-700 hover:underline"
                          onClick={() => { setEditing(row.id); setWeight(row.factoryAssessedG ?? ''); }}>
                          {row.status === 'COMPLETED' ? 'ແກ້ໄຂ' : 'ອັບເດດ'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}
