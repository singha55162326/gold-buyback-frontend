'use client';

import { formatDate, formatDateTime } from '@/lib/format';

export interface OrderStatusHistoryItem {
  toStatus: string;
  createdAt: string;
}

interface OrderTimelineProps {
  status: string;
  createdAt?: string | null;
  fallbackCreatedDate?: string | null;
  sentToSmithAt?: string | null;
  receivedFromSmithAt?: string | null;
  customerPickupAt?: string | null;
  completedAt?: string | null;
  supplierName?: string | null;
  statusHistory?: OrderStatusHistoryItem[];
}

const STEP_INDEX: Record<string, number> = {
  ORDER_PLACED: 0,
  SENT_TO_SMITH: 1,
  RECEIVED_FROM_SMITH: 2,
  AWAITING_PICKUP: 2,
  COMPLETED: 3,
};

type StepState = 'done' | 'active' | 'pending' | 'cancelled';

function formatTimeOnly(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isMidnightUtc(value: string): boolean {
  return /T00:00:00(?:\.000)?Z$/i.test(value.trim());
}

/**
 * ຈັດຮູບແບບວັນທີ ແລະ ເວລາຂອງແຕ່ລະຂັ້ນຕອນ Timeline:
 * - ຖ້າມີ timestamp ຈາກ statusHistory ຫຼື field ທີ່ເກັບເວລາເຕັມ ຈະສະແດງທັງວັນທີ ແລະ ເວລາ (DD/MM/YYYY HH:mm).
 * - ຖ້າ dateVal ເປັນວັນທີລ້ວນ (T00:00:00Z) ແຕ່ມີ historyVal ຈະຈັບຄູ່ວັນທີນັ້ນກັບເວລາຈິງຈາກ historyVal.
 */
function formatStepDateTime(dateVal?: string | null, historyVal?: string | null): string {
  if (historyVal && dateVal) {
    if (!isMidnightUtc(dateVal)) return formatDateTime(dateVal);
    const timePart = formatTimeOnly(historyVal);
    return timePart ? `${formatDate(dateVal)} ${timePart}` : formatDate(dateVal);
  }
  if (historyVal) return formatDateTime(historyVal);
  if (dateVal) {
    return isMidnightUtc(dateVal) ? formatDate(dateVal) : formatDateTime(dateVal);
  }
  return '—';
}

/**
 * ສະແດງຂັ້ນຕອນການດຳເນີນງານຂອງ Order ແບບ Timeline.
 * ໃຊ້ຮ່ວມກັນລະຫວ່າງ Modal ລາຍລະອຽດ Module Advance ແລະ Modal ລາຍລະອຽດ Order.
 */
export function OrderTimeline({
  status,
  createdAt,
  fallbackCreatedDate,
  sentToSmithAt,
  receivedFromSmithAt,
  customerPickupAt,
  completedAt,
  supplierName,
  statusHistory,
}: OrderTimelineProps) {
  const isCancelled = status === 'CANCELLED';
  const currentIdx = STEP_INDEX[status] ?? 0;

  const historyTime = (targetStatus: string) =>
    statusHistory?.find((h) => h.toStatus === targetStatus)?.createdAt ?? null;

  const placedDisplay =
    createdAt || historyTime('ORDER_PLACED')
      ? formatStepDateTime(createdAt, historyTime('ORDER_PLACED'))
      : fallbackCreatedDate
        ? formatDate(fallbackCreatedDate)
        : '—';

  const smithDisplay = formatStepDateTime(sentToSmithAt, historyTime('SENT_TO_SMITH'));
  const receivedDisplay = formatStepDateTime(
    receivedFromSmithAt,
    historyTime('RECEIVED_FROM_SMITH') ?? historyTime('AWAITING_PICKUP'),
  );
  const pickupAt = customerPickupAt || completedAt;
  const pickupDisplay = isCancelled
    ? formatStepDateTime(null, historyTime('CANCELLED'))
    : formatStepDateTime(customerPickupAt ?? completedAt, completedAt ?? historyTime('COMPLETED'));

  const steps: Array<{
    key: string;
    title: string;
    dateText: string;
    detail?: string | null;
    state: StepState;
  }> = [
    {
      key: 'placed',
      title: 'ສ້າງ Order',
      dateText: placedDisplay,
      detail: 'ບັນທຶກ Order ເຂົ້າລະບົບແລ້ວ',
      state: 'done',
    },
    {
      key: 'smith',
      title: 'ສັ່ງຊ່າງ',
      dateText: smithDisplay,
      detail: supplierName
        ? `Supplier / ຊ່າງ: ${supplierName}`
        : sentToSmithAt || (!isCancelled && currentIdx >= 1)
          ? 'ສົ່ງຊ່າງແລ້ວ'
          : isCancelled
            ? 'ບໍ່ໄດ້ດຳເນີນການ'
            : 'ລໍຖ້າສົ່ງຊ່າງ',
      state: isCancelled
        ? sentToSmithAt
          ? 'done'
          : 'cancelled'
        : sentToSmithAt || currentIdx >= 1
          ? 'done'
          : currentIdx === 0
            ? 'active'
            : 'pending',
    },
    {
      key: 'received',
      title: 'ຮັບເຄື່ອງຈາກຊ່າງ',
      dateText: receivedDisplay,
      detail:
        status === 'AWAITING_PICKUP'
          ? 'ລໍຖ້າລູກຄ້າຮັບເຄື່ອງ'
          : receivedFromSmithAt || (!isCancelled && currentIdx >= 2)
            ? 'ຮັບເຄື່ອງກັບຮ້ານແລ້ວ'
            : isCancelled
              ? 'ບໍ່ໄດ້ດຳເນີນການ'
              : 'ລໍຖ້າຮັບເຄື່ອງຈາກຊ່າງ',
      state: isCancelled
        ? receivedFromSmithAt
          ? 'done'
          : 'cancelled'
        : receivedFromSmithAt || currentIdx >= 2
          ? 'done'
          : currentIdx === 1
            ? 'active'
            : 'pending',
    },
    {
      key: 'pickup',
      title: 'ລູກຄ້າມາຮັບເຄື່ອງ',
      dateText: pickupDisplay,
      detail:
        status === 'COMPLETED' || pickupAt
          ? 'ປິດ Order (Completed) ສຳເລັດ'
          : isCancelled
            ? 'ຍົກເລີກ Order'
            : 'ລໍຖ້າລູກຄ້າມາຮັບເຄື່ອງ',
      state: isCancelled
        ? 'cancelled'
        : status === 'COMPLETED' || pickupAt
          ? 'done'
          : currentIdx === 2
            ? 'active'
            : 'pending',
    },
  ];

  return (
    <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-fg">
          <svg
            className="w-4 h-4 text-[var(--gold-icon)] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
          ການດຳເນີນງານ
        </div>
        {isCancelled && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-danger">
            Order ຖືກຍົກເລີກ
          </span>
        )}
      </div>

      <ol className="relative space-y-0">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isDone = step.state === 'done';
          const isActive = step.state === 'active';
          const isStepCancelled = step.state === 'cancelled';

          return (
            <li key={step.key} className={`relative flex gap-3 ${isLast ? '' : 'pb-4'}`}>
              {/* ເສັ້ນເຊື່ອມຕໍ່ແນວຕັ້ງ */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${
                    isDone ? 'bg-[var(--success-border)]' : 'bg-line'
                  }`}
                />
              )}

              {/* ຈຸດສະຖານະ */}
              <div
                aria-hidden="true"
                className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isDone
                    ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-success'
                    : isActive
                      ? 'border-[var(--gold)] bg-[var(--gold-tint)] text-[var(--gold)]'
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

              {/* ເນື້ອຫາຂັ້ນຕອນ */}
              <div className="flex flex-1 flex-col sm:flex-row sm:items-start sm:justify-between gap-1 rounded-lg border border-line/70 bg-surface px-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        isDone || isActive ? 'text-fg-strong' : 'text-muted'
                      }`}
                    >
                      {step.title}
                    </span>
                    {isDone && (
                      <span className="rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-[10px] font-semibold text-success">
                        ສຳເລັດ
                      </span>
                    )}
                    {isActive && (
                      <span className="rounded-full bg-[var(--gold-tint)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
                        ຂັ້ນຕອນຕໍ່ໄປ
                      </span>
                    )}
                  </div>
                  {step.detail && (
                    <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
                  )}
                </div>

                <div className="num shrink-0 text-xs font-medium text-muted sm:text-right">
                  {step.dateText}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
