'use client';

import { useQuery } from '@tanstack/react-query';
import { Pagination, usePagination } from '@/components/pagination';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

interface DeletedRow {
  entity: string; labelLo: string; id: string; code: string;
  detail: string; deletedAt: string | null;
}

/** TOR §3.7 — Deleted List. */
export default function DeletedListPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', 'deleted'],
    queryFn: () => api.get<DeletedRow[]>('/admin/deleted'),
  });

  const pager = usePagination(data);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Deleted List</h1>
        <p className="mt-1 text-sm text-slate-500">
          ລາຍການທີ່ຖືກລຶບທັງໝົດ — ຂໍ້ມູນຍັງຢູ່ໃນຖານຂໍ້ມູນ (soft delete) (TOR §3.7)
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການທີ່ຖືກລຶບ</h2>
          <span className="text-xs text-slate-500">{data.length} ລາຍການ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ປະເພດລາຍການ</th>
                <th>ລະຫັດລາຍການ</th>
                <th>ລາຍລະອຽດ</th>
                <th>ວັນທີລຶບ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="py-6 text-center text-slate-400">ກຳລັງໂຫຼດ...</td></tr>}
              {!isLoading && data.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">ບໍ່ມີລາຍການທີ່ຖືກລຶບ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={`${row.entity}-${row.id}`}>
                  <td><span className="badge bg-slate-100 text-slate-700">{row.labelLo}</span></td>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td className="num text-slate-600">{row.detail || '—'}</td>
                  <td>{formatDateTime(row.deletedAt)}</td>
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
