'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Pagination, usePagination } from './pagination';

interface AuditRow {
  id: string;
  action: string;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actor: { fullName: string; username: string } | null;
}

const ACTION_LO: Record<string, string> = {
  CREATE: 'ເພີ່ມ',
  UPDATE: 'ແກ້ໄຂ',
  DELETE: 'ລຶບ',
  APPROVE: 'ອະນຸມັດ',
  REJECT: 'ປະຕິເສດ',
  COMPLETE: 'ສຳເລັດ',
  LOGIN: 'ເຂົ້າລະບົບ',
  LOGOUT: 'ອອກຈາກລະບົບ',
};

/** Render a before/after pair as the changed fields only. */
function changeDetails(row: AuditRow): string {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  const changed = keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => {
      const from = before[k];
      const to = after[k];
      if (from === undefined) return `${k}: ${String(to)}`;
      if (to === undefined) return `${k}: (ລຶບ) ${String(from)}`;
      return `${k}: ${String(from)} → ${String(to)}`;
    });

  return changed.length > 0 ? changed.join(' · ') : (row.summary ?? '—');
}

/**
 * Change History & Audit Log with a VIEW button (TOR §3.2, §3.4).
 *
 * The audit rows already exist — every mutation writes one with before/after
 * JSON. This surfaces them per entity, showing only the fields that actually
 * changed rather than dumping both snapshots.
 */
export function AuditView({
  entity,
  titleLo = 'Change History & Audit Log',
}: {
  entity: string;
  titleLo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin', 'audit-log', entity],
    queryFn: () => api.get<AuditRow[]>(`/admin/audit-log/${entity}`),
    enabled: open,
  });

  // 87 audit rows on a busy day; ten at a time is what fits the card.
  const pager = usePagination(rows, 10);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{titleLo}</h2>
        <button className="btn-secondary py-1 text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? 'ເຊື່ອງ' : 'ສະແດງ'}
        </button>
      </div>

      {open && (
        <>
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ ແລະ ເວລາ</th>
                <th>ຈັດການ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
                <th className="text-right">ເບິ່ງ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">ກຳລັງໂຫຼດ...</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີການປ່ຽນແປງ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <>
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>
                      <span className="badge bg-slate-100 text-slate-700">
                        {ACTION_LO[row.action] ?? row.action}
                      </span>
                    </td>
                    <td>{row.actor?.fullName ?? '—'}</td>
                    <td className="text-right">
                      <button
                        className="text-sm text-gold-700 hover:underline"
                        onClick={() => setViewing(viewing === row.id ? null : row.id)}
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                  {viewing === row.id && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={4} className="bg-slate-50 px-5 py-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Change Details
                        </div>
                        <div className="mt-1 break-words font-mono text-xs text-slate-700">
                          {changeDetails(row)}
                        </div>
                        {row.summary && (
                          <div className="mt-2 text-xs text-slate-500">{row.summary}</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination {...pager} compact />
        </>
      )}
    </div>
  );
}
