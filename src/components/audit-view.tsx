'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';
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

  const { data: rows = [], isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['admin', 'audit-log', entity],
    queryFn: () => api.get<AuditRow[]>(`/admin/audit-log/${entity}`),
    enabled: open,
  });

  // 87 audit rows on a busy day; ten at a time is what fits the card.
  const pager = usePagination(rows, 10);

  return (
    <div data-fade className="card">
      <div className="card-header">
        <h2 className="card-title">{titleLo}</h2>
        <button className="btn-secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'ເຊື່ອງ' : 'ສະແດງ'}
        </button>
      </div>

      {open && (
        <>
          <div className="table-wrap" tabIndex={0} role="region" aria-label={titleLo}>
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
              <TableStateRow
                colSpan={4}
                isLoading={isLoading}
                isError={isError}
                error={loadError}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີການປ່ຽນແປງ"
                onRetry={() => void refetch()}
              />
              {pager.pageItems.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>
                      <span className="badge recessed text-fg">
                        {ACTION_LO[row.action] ?? row.action}
                      </span>
                    </td>
                    <td>{row.actor?.fullName ?? '—'}</td>
                    <td className="text-right">
                      <button
                        className="btn-ghost"
                        aria-expanded={viewing === row.id}
                        onClick={() => setViewing(viewing === row.id ? null : row.id)}
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                  {viewing === row.id && (
                    <tr>
                      <td colSpan={4} className="recessed !whitespace-normal px-5 py-3">
                        <div className="section-label">
                          Change Details
                        </div>
                        <div className="mt-1 break-words font-mono text-xs text-fg">
                          {changeDetails(row)}
                        </div>
                        {row.summary && (
                          <div className="mt-2 text-xs text-muted">{row.summary}</div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
