'use client';

import { useQuery } from '@tanstack/react-query';
import { Pagination, usePagination } from '@/components/pagination';
import { api } from '@/lib/api';
import { PageHead } from '@/components/page-head';
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
      <PageHead
        title="Deleted List"
        subtitle="ລາຍການທີ່ຖືກລຶບທັງໝົດ — ຂໍ້ມູນຍັງຢູ່ໃນຖານຂໍ້ມູນ (soft delete) (TOR §3.7)"
      />

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ລາຍການທີ່ຖືກລຶບ</h2>
          <span className="num text-xs text-muted">{data.length} ລາຍການ</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍການທີ່ຖືກລຶບ">
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
              {isLoading && <tr><td colSpan={4} className="py-6 text-center text-muted">ກຳລັງໂຫຼດ...</td></tr>}
              {!isLoading && data.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-muted">ບໍ່ມີລາຍການທີ່ຖືກລຶບ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={`${row.entity}-${row.id}`}>
                  <td><span className="badge recessed text-fg">{row.labelLo}</span></td>
                  <td className="font-mono text-xs">{row.code}</td>
                  <td className="num text-muted">{row.detail || '—'}</td>
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
