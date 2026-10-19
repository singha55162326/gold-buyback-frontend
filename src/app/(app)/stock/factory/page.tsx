'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { formatLak, formatWeight, formatDate } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';

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

  const { data: rows = [], isError: rowsFailed, error: rowsError, refetch: refetchRows } = useQuery({
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
      <PageHead
        title="ຕິດຕາມ Stock Out ໄປ FACTORY"
        subtitle="ລາຍການທີ່ Approve ແລ້ວ ລໍຖ້າ FACTORY ປະເມີນນ້ຳໜັກ (TOR §7.3)"
      />

      <div data-fade className="notice status-warning">
        ລະບົບຍັງບໍ່ຕັດຍອດຈົນກວ່າຈະປ້ອນນ້ຳໜັກທີ່ FACTORY ປະເມີນ.
        ເມື່ອບັນທຶກແລ້ວ ສະຖານະຈະເປັນ Completed ແລະ ຕັດຍອດ Stock (OLD) ພ້ອມບັນທຶກ AP-AR (GOLD).
      </div>

      {error && (
        <div id="factory-error" role="alert" className="notice status-danger">{error}</div>
      )}

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ລາຍການຕິດຕາມ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການຕິດຕາມ">
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
              <TableStateRow colSpan={9} isError={rowsFailed} error={rowsError} isEmpty={rows.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={() => void refetchRows()} />
              {pager.pageItems.map((row) => {
                const locked = row.status === 'COMPLETED' && !isAdmin;
                return (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.movement.code}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.partner.nameLo}</td>
                    <td className="text-muted">{row.movement.transformType ?? '—'}</td>
                    <td className="num text-right">{formatWeight(row.goldOutG)}</td>
                    <td className="num text-right">
                      {editing === row.id ? (
                        <input
                          className="input num w-36 text-right"
                          aria-label={`ນໍ້າໜັກg FACTORY ປະເມີນ ${row.movement.code}`}
                          aria-describedby={error ? 'factory-error' : undefined}
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
                      <span className={statusClass(row.status, { AWAITING_ASSESSMENT: 'status-warning' })}>
                        {row.status === 'COMPLETED' ? 'Completed' : 'ລໍຖ້າ FACTORY ປະເມີນ'}
                      </span>
                    </td>
                    <td className="text-right">
                      {editing === row.id ? (
                        <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                          <button className="btn-primary"
                            onClick={() => save.mutate(row.id)} disabled={save.isPending || !weight.trim()}>
                            ບັນທຶກ
                          </button>
                          <button className="btn-secondary" onClick={() => setEditing(null)}>
                            ຍົກເລີກ
                          </button>
                        </div>
                      ) : locked ? (
                        <span className="text-xs text-muted">ສະເພາະ Admin</span>
                      ) : (
                        <button className="btn-ghost"
                          aria-label={`${row.status === 'COMPLETED' ? 'ແກ້ໄຂ' : 'ອັບເດດ'} ${row.movement.code}`}
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
