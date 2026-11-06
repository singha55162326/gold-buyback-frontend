'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TableStateRow } from '@/components/query-state';
import { formatDateTime, formatLak } from '@/lib/format';
import { Dialog } from '@/components/dialog';
import { Pagination, usePagination } from './pagination';

export interface AuditRow {
  id: string;
  action: string;
  summary: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actor: { fullName: string; username: string } | null;
}

export type ResolvedAuditRow = AuditRow & {
  weightLabel: string;
  beforeVal: unknown;
  beforeFormatted: string;
  afterVal: unknown;
  afterFormatted: string;
  kind: unknown;
};

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

const TIER_LABELS: Record<string, string> = {
  JW_BAHT_1: 'ຮູບປະພັນ - 1 ບາດ',
  JW_SALEUNG_2: 'ຮູບປະພັນ - 2 ສະຫຼຶງ',
  JW_SALEUNG_1: 'ຮູບປະພັນ - 1 ສະຫຼຶງ',
  JW_HUN_5: 'ຮູບປະພັນ - 5 ຫຸນ',
  JW_HUN_3: 'ຮູບປະພັນ - 3 ຫຸນ',
  JW_HUN_2: 'ຮູບປະພັນ - 2 ຫຸນ',
  JW_HUN_1: 'ຮູບປະພັນ - 1 ຫຸນ',
  BAR_BAHT_1: 'ຄຳແທ່ງ - 1 ບາດ',
  BAR_SALEUNG_2: 'ຄຳແທ່ງ - 2 ສະຫຼຶງ',
  BAR_SALEUNG_1: 'ຄຳແທ່ງ - 1 ສະຫຼຶງ',
  BAR_GRAM_1: 'ຄຳແທ່ງ - 1g',
};

/** Fields that are technical/internal and not meaningful for general users */
const HIDDEN_FIELDS = new Set([
  'id',
  '_id',
  'createdById',
  'updatedById',
  'approvedById',
  'actorId',
  'entityId',
  'password',
  'hash',
  'token',
]);

/** User-friendly field labels in Lao */
const FRIENDLY_FIELD_LABELS: Record<string, string> = {
  value: 'ລາຄາ',
  kind: 'ຮູບແບບ',
  tierCode: 'ນ້ຳໜັກ SKU',
  tierLabel: 'ຊື້ນ້ຳໜັກ',
  effectiveAt: 'ວັນທີມີຜົນບັງຄັບໃຊ້',
  createdAt: 'ວັນທີສ້າງ',
  updatedAt: 'ວັນທີອັບເດດ',
  status: 'ສະຖານະ',
  price: 'ລາຄາ',
  fee: 'ຄ່າທຳນຽມ',
  amount: 'ຈຳນວນເງິນ',
  weight: 'ນ້ຳໜັກ',
  note: 'ໝາຍເຫດ',
  summary: 'ສະຫຼຸບ',
  fullName: 'ຊື່ເຕັມ',
  username: 'ຊື່ຜູ້ໃຊ້',
  category: 'ໝວດໝູ່',
  rate: 'ອັດຕາແລກປ່ຽນ',
  cost: 'ຕົ້ນທຶນ',
};

export function getFriendlyFieldLabel(key: string): string {
  if (FRIENDLY_FIELD_LABELS[key]) return FRIENDLY_FIELD_LABELS[key];
  return key.replace(/([A-Z])/g, ' $1').toLowerCase();
}

export function getAuditItemLabel(row: AuditRow): string {
  const after = row.after as Record<string, unknown> | null;
  const before = row.before as Record<string, unknown> | null;

  if (typeof after?.tierLabel === 'string' && after.tierLabel) return after.tierLabel;
  if (typeof before?.tierLabel === 'string' && before.tierLabel) return before.tierLabel;

  const tierCode = (after?.tierCode ?? before?.tierCode) as string | undefined;
  if (tierCode && TIER_LABELS[tierCode]) {
    return TIER_LABELS[tierCode];
  }

  if (row.summary) {
    const match = row.summary.match(/(?:ອັບເດດຄ່າຫັກຊື້ຄືນ|ຄ່າຫັກ|ລາຄາລົບອອກ)\s*(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return '—';
}

export function formatDeductionAuditValue(val: unknown, kind?: unknown): string {
  if (val === undefined || val === null || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  if (kind === 'PERCENT') {
    return `${num} %`;
  }
  if (kind === 'AMOUNT') {
    return `${formatLak(num)} ກີບ`;
  }
  if (num > 0 && num <= 100) {
    return `${num} %`;
  }
  return `${formatLak(num)} ກີບ`;
}

/** Formats values in changed fields table into human-readable text */
export function formatFriendlyFieldValue(
  key: string,
  val: unknown,
  context?: Record<string, unknown>,
): string {
  if (val === undefined || val === null || val === '') return '—';

  // Value / Price / Fees
  if (key === 'value' || key === 'price' || key === 'fee' || key === 'amount') {
    const kind = context?.kind;
    return formatDeductionAuditValue(val, kind);
  }

  // Kind / Calculation method
  if (key === 'kind') {
    if (val === 'PERCENT') return 'ຫັກອອກ (%)';
    if (val === 'AMOUNT') return 'ລາຄາລົບອອກ (ກີບ)';
    return String(val);
  }

  // Tier code
  if (key === 'tierCode' && typeof val === 'string' && TIER_LABELS[val]) {
    return TIER_LABELS[val];
  }

  // Dates
  if ((key.endsWith('At') || key.endsWith('Date')) && typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return formatDateTime(val);
    }
  }

  if (typeof val === 'boolean') {
    return val ? 'ແມ່ນ / ເປີດໃຊ້' : 'ບໍ່ແມ່ນ / ປິດ';
  }

  if (typeof val === 'object') {
    return JSON.stringify(val);
  }

  return String(val);
}

interface ChangedField {
  key: string;
  label: string;
  from: unknown;
  to: unknown;
  fromFormatted: string;
  toFormatted: string;
}

function getFriendlyChangedFieldsList(row: ResolvedAuditRow): ChangedField[] {
  const before = (row.before ? { ...row.before } : {}) as Record<string, unknown>;
  const after = (row.after ? { ...row.after } : {}) as Record<string, unknown>;

  // If before.value was missing or null in older logs, use resolved predecessor value
  if (before.value === undefined && row.beforeVal !== undefined && row.beforeVal !== null) {
    before.value = row.beforeVal;
  }

  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const keys = allKeys.filter(
    (k) => !HIDDEN_FIELDS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );

  return keys.map((key) => {
    const fromVal = before[key];
    const toVal = after[key];
    const context = {
      kind: after.kind ?? before.kind ?? row.kind,
    };

    return {
      key,
      label: getFriendlyFieldLabel(key),
      from: fromVal,
      to: toVal,
      fromFormatted: formatFriendlyFieldValue(key, fromVal, context),
      toFormatted: formatFriendlyFieldValue(key, toVal, context),
    };
  });
}

/** Render a before/after pair as the changed fields only. */
function changeDetails(row: ResolvedAuditRow): string {
  const changed = getFriendlyChangedFieldsList(row).map(
    ({ label, fromFormatted, toFormatted }) => `${label}: ${fromFormatted} → ${toFormatted}`,
  );

  return changed.length > 0 ? changed.join(' · ') : (row.summary ?? '—');
}

/**
 * Change History & Audit Log with View Details Modal (TOR §3.2, §3.4).
 */
export function AuditView({
  entity,
  titleLo = 'Change History & Audit Log',
  showDeductionColumns,
}: {
  entity: string;
  titleLo?: string;
  showDeductionColumns?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewingRow, setViewingRow] = useState<ResolvedAuditRow | null>(null);

  const { data: rows = [], isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['admin', 'audit-log', entity],
    queryFn: () => api.get<AuditRow[]>(`/admin/audit-log/${entity}`),
    enabled: open,
  });

  const isDeduction = showDeductionColumns ?? entity === 'BuybackDeductionRule';

  // Compute resolved before/after and weight tier info for all rows
  const resolvedRows = useMemo<ResolvedAuditRow[]>(() => {
    return rows.map((row, index) => {
      const weightLabel = getAuditItemLabel(row);
      const afterObj = row.after as Record<string, unknown> | null;
      const beforeObj = row.before as Record<string, unknown> | null;

      const afterVal = afterObj?.value;
      const afterKind = afterObj?.kind;

      let beforeVal = beforeObj?.value;
      let beforeKind = beforeObj?.kind;

      // If beforeVal is missing, look for chronologically older record of the same tier/item
      if (beforeVal === undefined || beforeVal === null) {
        const tierCode = (afterObj?.tierCode ?? beforeObj?.tierCode) as string | undefined;
        for (let j = index + 1; j < rows.length; j++) {
          const prevRow = rows[j];
          const prevAfter = prevRow.after as Record<string, unknown> | null;
          const prevTierCode = prevAfter?.tierCode as string | undefined;
          const prevWeightLabel = getAuditItemLabel(prevRow);

          if ((tierCode && prevTierCode === tierCode) || (weightLabel !== '—' && prevWeightLabel === weightLabel)) {
            if (prevAfter?.value !== undefined && prevAfter?.value !== null) {
              beforeVal = prevAfter.value;
              beforeKind = prevAfter.kind ?? afterKind;
              break;
            }
          }
        }
      }

      const beforeFormatted = beforeVal !== undefined && beforeVal !== null
        ? formatDeductionAuditValue(beforeVal, beforeKind)
        : '—';

      const afterFormatted = afterVal !== undefined && afterVal !== null
        ? formatDeductionAuditValue(afterVal, afterKind)
        : '—';

      return {
        ...row,
        weightLabel,
        beforeVal,
        beforeFormatted,
        afterVal,
        afterFormatted,
        kind: afterKind ?? beforeKind,
      };
    });
  }, [rows]);

  // Paging: 10 items at a time
  const pager = usePagination(resolvedRows, 10);

  // Selected row resolution for the modal
  const modalRow = useMemo<ResolvedAuditRow | null>(() => {
    if (!viewingRow) return null;
    return resolvedRows.find((r) => r.id === viewingRow.id) ?? viewingRow;
  }, [viewingRow, resolvedRows]);

  const changedFields = useMemo(() => {
    return modalRow ? getFriendlyChangedFieldsList(modalRow) : [];
  }, [modalRow]);

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
                  {isDeduction && <th>ນ້ຳໜັກ</th>}
                  <th>ຈັດການ</th>
                  {isDeduction && (
                    <>
                      <th className="text-right">ຄ່າກ່ອນ</th>
                      <th className="text-right">ຄ່າຫຼັງແກ້</th>
                    </>
                  )}
                  <th>ຜູ້ແກ້ໄຂ</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                <TableStateRow
                  colSpan={isDeduction ? 7 : 4}
                  isLoading={isLoading}
                  isError={isError}
                  error={loadError}
                  isEmpty={rows.length === 0}
                  emptyText="ຍັງບໍ່ມີການປ່ຽນແປງ"
                  onRetry={() => void refetch()}
                />
                {pager.pageItems.map((row) => (
                  <tr key={row.id}>
                    <td className="text-muted">{formatDateTime(row.createdAt)}</td>
                    {isDeduction && (
                      <td className="font-medium text-fg">
                        {row.weightLabel !== '—' ? (
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            {row.weightLabel}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td>
                      <span className="badge recessed text-fg">
                        {ACTION_LO[row.action] ?? row.action}
                      </span>
                    </td>
                    {isDeduction && (
                      <>
                        <td className="num text-right text-muted">{row.beforeFormatted}</td>
                        <td className="num text-right font-semibold text-gold">
                          {row.afterFormatted}
                        </td>
                      </>
                    )}
                    <td className="text-muted">{row.actor?.fullName ?? '—'}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setViewingRow(row)}
                        aria-label={`ເບິ່ງລາຍລະອຽດ ${row.id}`}
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pager} compact />
        </>
      )}

      {/* Modal Dialog for Change Details (Task 2) */}
      <Dialog
        open={Boolean(viewingRow)}
        onClose={() => setViewingRow(null)}
        title="ລາຍລະອຽດການປ່ຽນແປງ"
        size="lg"
        dismissOnScrim={true}
        footer={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setViewingRow(null)}
          >
            ປິດ (Close)
          </button>
        }
      >
        {modalRow && (
          <div className="space-y-4">
            {/* Meta summary card */}
            <div className="rounded-lg border border-line bg-panel/40 p-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <div className="text-muted">ການດຳເນີນການ</div>
                  <div className="mt-1 font-semibold text-fg">
                    <span className="badge recessed text-fg">
                      {ACTION_LO[modalRow.action] ?? modalRow.action}
                    </span>
                  </div>
                </div>
                {isDeduction && (
                  <div>
                    <div className="text-muted">ນ້ຳໜັກ / ລາຍການ</div>
                    <div className="mt-1 font-semibold text-gold">
                      {modalRow.weightLabel}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-muted">ວັນທີ & ເວລາ</div>
                  <div className="mt-1 font-medium text-fg">
                    {formatDateTime(modalRow.createdAt)}
                  </div>
                </div>
                <div>
                  <div className="text-muted">ຜູ້ແກ້ໄຂ</div>
                  <div className="mt-1 font-medium text-fg">
                    {modalRow.actor?.fullName ?? '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Before vs After Visual Comparison Card */}
            {isDeduction && (
              <div className="rounded-xl border border-line bg-card/60 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                  ປຽບທຽບລາຄາ / ຄ່າ (Before vs After)
                </div>
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr,auto,1fr]">
                  {/* Before */}
                  <div className="rounded-lg border border-line/60 bg-panel/60 p-3.5 text-center">
                    <div className="text-xs text-muted mb-1 font-medium">ຄ່າກ່ອນແກ້ໄຂ (Before)</div>
                    <div className="num text-lg font-semibold text-muted line-through">
                      {modalRow.beforeFormatted}
                    </div>
                  </div>

                  {/* Arrow Indicator */}
                  <div className="flex justify-center text-gold">
                    <span className="hidden text-xl font-bold sm:inline">➔</span>
                    <span className="text-xl font-bold sm:hidden">⬇</span>
                  </div>

                  {/* After */}
                  <div className="rounded-lg border border-gold/40 bg-gold/10 p-3.5 text-center">
                    <div className="text-xs text-gold mb-1 font-medium">ຄ່າຫຼັງແກ້ໄຂ (After)</div>
                    <div className="num text-xl font-bold text-gold">
                      {modalRow.afterFormatted}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Note / Summary */}
            {modalRow.summary && (
              <div className="rounded-lg border border-line/80 bg-panel/30 px-3.5 py-2.5 text-xs text-muted">
                <span className="font-medium text-fg">ຄຳອະທິບາຍ:</span> {modalRow.summary}
              </div>
            )}

            {/* Changed Fields breakdown (Friendly and readable for general users) */}
            {changedFields.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                  ລາຍການຂໍ້ມູນທີ່ມີການປ່ຽນແປງ (Changed Details)
                </div>
                <div className="overflow-hidden rounded-lg border border-line text-xs">
                  <table className="table w-full">
                    <thead>
                      <tr className="bg-panel/50">
                        <th>ລາຍການ / ຂໍ້ມູນ</th>
                        <th>ຄ່າກ່ອນໜ້າ (Before)</th>
                        <th>ຄ່າໃໝ່ (After)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedFields.map(({ key, label, fromFormatted, toFormatted }) => (
                        <tr key={key}>
                          <td className="font-medium text-fg">{label}</td>
                          <td className="text-muted">{fromFormatted}</td>
                          <td className="font-medium text-gold">{toFormatted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              !isDeduction && (
                <div className="rounded-lg border border-line bg-panel/30 p-3 text-xs text-muted">
                  {changeDetails(modalRow)}
                </div>
              )
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
