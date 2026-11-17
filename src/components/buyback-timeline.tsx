'use client';

import { formatDateTime } from '@/lib/format';

export interface BuybackAuditItem {
  id: string;
  action: string;
  summary: string | null;
  createdAt: string;
  actor?: { fullName: string } | null;
}

interface BuybackTimelineProps {
  status: string;
  createdAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  approvedAt?: string | null;
  confirmedAt?: string | null;
  rejectReason?: string | null;
  audits?: BuybackAuditItem[];
  isLoadingAudits?: boolean;
}

type StepState = 'done' | 'active' | 'pending' | 'cancelled';

const ACTION_BADGE: Record<string, { labelLo: string; cls: string; dotColor: string }> = {
  CREATE: {
    labelLo: 'ສ້າງລາຍການ',
    cls: 'border-[var(--border-active)] bg-[var(--gold-tint)] text-gold',
    dotColor: 'var(--gold)',
  },
  UPDATE: {
    labelLo: 'ອັບເດດ',
    cls: 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-warning',
    dotColor: 'var(--warning-dot)',
  },
  APPROVE: {
    labelLo: 'ອະນຸມັດ',
    cls: 'border-[var(--success-border)] bg-[var(--success-bg)] text-success',
    dotColor: 'var(--success-dot)',
  },
  COMPLETE: {
    labelLo: 'ສຳເລັດ',
    cls: 'border-[var(--success-border)] bg-[var(--success-bg)] text-success',
    dotColor: 'var(--success-dot)',
  },
  REJECT: {
    labelLo: 'ປະຕິເສດ',
    cls: 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-danger',
    dotColor: 'var(--danger-dot)',
  },
  DELETE: {
    labelLo: 'ລຶບ',
    cls: 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-danger',
    dotColor: 'var(--danger-dot)',
  },
};

function getAuditBadge(action: string, summary: string | null) {
  if (action === 'UPDATE' && summary?.includes('ຍົກເລີກ')) {
    return {
      labelLo: 'ຍົກເລີກ',
      cls: 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-danger',
      dotColor: 'var(--danger-dot)',
    };
  }
  if (action === 'UPDATE' && summary?.includes('ຊຳລະຄ້າງ')) {
    return {
      labelLo: 'ຊຳລະຄ້າງ',
      cls: 'border-[var(--success-border)] bg-[var(--success-bg)] text-success',
      dotColor: 'var(--success-dot)',
    };
  }
  return ACTION_BADGE[action] ?? {
    labelLo: action,
    cls: 'border-line bg-recessed text-muted',
    dotColor: 'var(--muted)',
  };
}

/**
 * ສະແດງ Timeline ການດຳເນີນງານຂອງລາຍການ Buyback (Pending -> Approved -> Completed)
 * ພ້ອມບັນທຶກປະຫວັດເຫດການ (Audit Log) ແບບອ່ານງ່າຍ.
 */
export function BuybackTimeline({
  status,
  createdAt,
  createdBy,
  updatedBy,
  approvedAt,
  confirmedAt,
  rejectReason,
  audits = [],
  isLoadingAudits = false,
}: BuybackTimelineProps) {
  const isRejected = status === 'REJECTED';
  const isCancelled = status === 'CANCELLED';
  const isStopped = isRejected || isCancelled;

  const findAudit = (action: string) => audits.find((a) => a.action === action);
  const approveAudit = findAudit('APPROVE');
  const rejectAudit = findAudit('REJECT');
  const completeAudit = findAudit('COMPLETE');
  const cancelAudit = audits.find((a) => a.action === 'UPDATE' && a.summary?.includes('ຍົກເລີກ'));

  const isApproved = Boolean(approvedAt || approveAudit || status === 'APPROVED' || status === 'COMPLETED');
  const isCompleted = Boolean(confirmedAt || completeAudit || status === 'COMPLETED');

  const approveActor = approveAudit?.actor?.fullName ?? (isApproved && updatedBy && updatedBy !== createdBy ? updatedBy : null);
  const approveTime = approvedAt ?? approveAudit?.createdAt ?? null;
  const completeActor = completeAudit?.actor?.fullName ?? (isCompleted ? updatedBy : null);
  const completeTime = confirmedAt ?? completeAudit?.createdAt ?? null;

  const steps: Array<{
    key: string;
    title: string;
    dateText: string;
    detail: string;
    state: StepState;
    badgeLabel?: string;
  }> = [
    {
      key: 'created',
      title: '1. ສ້າງລາຍການ (Pending)',
      dateText: createdAt ? formatDateTime(createdAt) : '—',
      detail: `ຜູ້ບັນທຶກ: ${createdBy ?? '—'}`,
      state: 'done',
      badgeLabel: 'ສຳເລັດ',
    },
    {
      key: 'approved',
      title: '2. Payment ອະນຸມັດ (Approve)',
      dateText: isRejected
        ? formatDateTime(rejectAudit?.createdAt ?? null)
        : isCancelled && !isApproved
          ? formatDateTime(cancelAudit?.createdAt ?? null)
          : formatDateTime(approveTime),
      detail: isRejected
        ? `ປະຕິເສດໂດຍ: ${rejectAudit?.actor?.fullName ?? updatedBy ?? '—'}${rejectReason ? ` · ${rejectReason}` : ''}`
        : isCancelled && !isApproved
          ? `ຍົກເລີກກ່ອນອະນຸມັດ${rejectReason ? ` · ${rejectReason}` : ''}`
          : isApproved
            ? approveActor
              ? `ອະນຸມັດໂດຍ: ${approveActor}`
              : 'Payment ອະນຸມັດລາຍການແລ້ວ'
            : 'ລໍຖ້າ Payment ກົດ Approve',
      state: isRejected
        ? 'cancelled'
        : isCancelled && !isApproved
          ? 'cancelled'
          : isApproved
            ? 'done'
            : 'active',
      badgeLabel: isRejected
        ? 'ປະຕິເສດ'
        : isCancelled && !isApproved
          ? 'ຍົກເລີກ'
          : isApproved
            ? 'ສຳເລັດ'
            : 'ຂັ້ນຕອນຕໍ່ໄປ',
    },
    {
      key: 'completed',
      title: '3. ຜູ້ປະເມີນຢືນຢັນ & ຮັບຄຳ (Completed)',
      dateText: isCancelled && isApproved
        ? formatDateTime(cancelAudit?.createdAt ?? null)
        : isCompleted
          ? formatDateTime(completeTime)
          : '—',
      detail: isStopped
        ? isCancelled && isApproved
          ? `ຍົກເລີກຫຼັງອະນຸມັດ${rejectReason ? ` · ${rejectReason}` : ''}`
          : 'ບໍ່ໄດ້ດຳເນີນການຕໍ່'
        : isCompleted
          ? `${completeActor ? `ຢືນຢັນໂດຍ: ${completeActor} · ` : ''}ຈ່າຍເງິນ & ຮັບຄຳເຂົ້າ Stock ສຳເລັດ`
          : isApproved
            ? 'ລໍຖ້າຜູ້ປະເມີນກົດຢືນຢັນການຈ່າຍ ແລະ ຮັບຄຳ'
            : 'ລໍຖ້າການອະນຸມັດກ່ອນ',
      state: isStopped
        ? 'cancelled'
        : isCompleted
          ? 'done'
          : isApproved
            ? 'active'
            : 'pending',
      badgeLabel: isStopped
        ? 'ຢຸດດຳເນີນການ'
        : isCompleted
          ? 'ສຳເລັດ'
          : isApproved
            ? 'ຂັ້ນຕອນຕໍ່ໄປ'
            : undefined,
    },
  ];

  // ຈັດລຽງປະຫວັດຈາກເກົ່າຫາໃໝ່ ເພື່ອອ່ານຕາມລຳດັບເວລາຈາກເທິງລົງລຸ່ມ.
  const chronologicalAudits = [...audits].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-gold">
          <svg
            className="h-4 w-4 shrink-0 text-[var(--gold-icon)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
          ປະຫວັດການດຳເນີນການ (Timeline)
        </div>
        {isLoadingAudits && <span className="text-[11px] text-muted">ກຳລັງໂຫຼດ...</span>}
        {!isLoadingAudits && isRejected && (
          <span className="inline-flex items-center rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-danger">
            ຖືກປະຕິເສດ
          </span>
        )}
        {!isLoadingAudits && isCancelled && (
          <span className="inline-flex items-center rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-danger">
            ຍົກເລີກແລ້ວ
          </span>
        )}
      </div>

      {/* 1. ຂັ້ນຕອນຫຼັກຂອງ Workflow */}
      <ol className="relative space-y-0">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isDone = step.state === 'done';
          const isActive = step.state === 'active';
          const isStepCancelled = step.state === 'cancelled';

          return (
            <li key={step.key} className={`relative flex gap-3 ${isLast ? '' : 'pb-3.5'}`}>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${
                    isDone ? 'bg-[var(--success-border)]' : 'bg-line'
                  }`}
                />
              )}

              <div
                aria-hidden="true"
                className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isDone
                    ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-success'
                    : isActive
                      ? 'border-[var(--gold)] bg-[var(--gold-tint)] text-gold'
                      : isStepCancelled
                        ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-danger'
                        : 'border-line bg-surface text-muted'
                }`}
              >
                {isDone ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isStepCancelled ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : isActive ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-line" />
                )}
              </div>

              <div className="flex flex-1 flex-col justify-between gap-1 rounded-lg border border-line/70 bg-surface px-3 py-2 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-semibold ${isDone || isActive ? 'text-fg-strong' : 'text-muted'}`}>
                      {step.title}
                    </span>
                    {step.badgeLabel && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isDone
                            ? 'bg-[var(--success-bg)] text-success'
                            : isActive
                              ? 'bg-[var(--gold-tint)] text-gold'
                              : 'bg-[var(--danger-bg)] text-danger'
                        }`}
                      >
                        {step.badgeLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
                </div>

                <div className="num shrink-0 text-[11px] font-medium text-muted sm:text-right">
                  {step.dateText}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* 2. ລາຍລະອຽດປະຫວັດເຫດການທັງໝົດ (ລວມການແກ້ໄຂ / ຊຳລະຄ້າງ) */}
      {chronologicalAudits.length > 0 && (
        <div className="border-t border-line pt-3">
          <div className="mb-2.5 flex items-center justify-between text-[11px] font-semibold text-muted">
            <span>ບັນທຶກການດຳເນີນການລະອຽດ (Audit Log)</span>
            <span className="num">{chronologicalAudits.length} ເຫດການ</span>
          </div>
          <ol className="relative space-y-2.5 pl-4">
            <span aria-hidden="true" className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-line" />
            {chronologicalAudits.map((a) => {
              const badge = getAuditBadge(a.action, a.summary);
              return (
                <li key={a.id} className="relative flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span
                    aria-hidden="true"
                    className="absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full border border-surface"
                    style={{ backgroundColor: badge.dotColor }}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                      {badge.labelLo}
                    </span>
                    <span className="font-medium text-fg-strong">{a.actor?.fullName ?? 'ລະບົບ'}</span>
                    <span className="text-muted">{a.summary ?? a.action}</span>
                  </div>
                  <span className="num shrink-0 text-[11px] text-muted">{formatDateTime(a.createdAt)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
