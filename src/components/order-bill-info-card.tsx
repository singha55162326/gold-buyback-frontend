'use client';

import { statusClass } from '@/lib/status';

interface OrderBillInfoCardProps {
  billNo: string;
  productType: string;
  status: string;
  statusLabel: string;
  phone: string;
  staffName?: string | null;
  staffLabel?: string;
  currency: string;
  note?: string | null;
}

/**
 * ກາດສະແດງ ຂໍ້ມູນໃບບິນ (ເລກບິນ, ປະເພດ, Status Order, ເບີໂທ, ພະນັກງານ, ສະກຸນເງິນ ແລະ ໝາຍເຫດ)
 * ໃຊ້ຮ່ວມກັນເທິງສຸດຂອງ Modal ລາຍລະອຽດ Module Advance ແລະ Modal ລາຍລະອຽດ Order.
 */
export function OrderBillInfoCard({
  billNo,
  productType,
  status,
  statusLabel,
  phone,
  staffName,
  staffLabel = 'ພະນັກງານຮັບ Order',
  currency,
  note,
}: OrderBillInfoCardProps) {
  return (
    <div className="rounded-xl border border-line bg-recessed/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-fg">
        <svg
          className="w-4 h-4 text-[var(--gold-icon)] shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        ຂໍ້ມູນໃບບິນ
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
        <div>
          <div className="text-xs text-muted mb-0.5">ເລກບິນ</div>
          <div className="font-mono text-xs font-semibold text-fg-strong">{billNo || '—'}</div>
        </div>

        <div>
          <div className="text-xs text-muted mb-0.5">ປະເພດ</div>
          <div className="font-medium text-sm text-fg-strong">{productType || '—'}</div>
        </div>

        <div>
          <div className="text-xs text-muted mb-0.5">Status Order</div>
          <div>
            <span className={statusClass(status)}>{statusLabel}</span>
          </div>
        </div>

        <div>
          <div className="text-xs text-muted mb-0.5">ເບີໂທລູກຄ້າ</div>
          <div className="font-mono text-xs font-medium text-fg-strong">{phone || '—'}</div>
        </div>

        <div>
          <div className="text-xs text-muted mb-0.5">{staffLabel}</div>
          <div className="font-medium text-sm text-fg-strong">{staffName || '—'}</div>
        </div>

        <div>
          <div className="text-xs text-muted mb-0.5">ສະກຸນເງິນ Order</div>
          <div className="font-semibold text-sm text-fg-strong">{currency}</div>
        </div>
      </div>

      {note && (
        <div className="rounded-lg bg-surface border border-line/70 px-3 py-2 text-xs text-muted">
          <strong className="text-fg">ໝາຍເຫດ: </strong>
          {note}
        </div>
      )}
    </div>
  );
}
