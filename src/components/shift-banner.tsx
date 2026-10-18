'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Role } from '@/lib/nav';

interface Shift {
  id: string;
  status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED' | 'REJECTED';
  openedAt: string;
  closedAt: string | null;
}

const SHIFT_ROLES: Role[] = ['PAYMENT', 'VALUER'];

/**
 * TOR §4 / §5: PAYMENT and VALUER must open a shift before transacting, and
 * cannot transact after closing until the next day. Showing that state at the
 * top of every page is what stops staff hitting a 409 halfway through a sale.
 */
export function ShiftBanner({ role }: { role: Role }) {
  const queryClient = useQueryClient();
  const enabled = SHIFT_ROLES.includes(role);

  const { data: shift, isLoading } = useQuery({
    queryKey: ['shift', 'me'],
    queryFn: () => api.get<Shift | null>('/shifts/me'),
    enabled,
  });

  const open = useMutation({
    mutationFn: () => api.post<Shift>('/shifts/open'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shift', 'me'] }),
  });

  if (!enabled || isLoading) return null;

  if (!shift) {
    return (
      <Banner tone="warn">
        <span>ຍັງບໍ່ໄດ້ເປີດກະ — ບໍ່ສາມາດເຮັດທຸລະກຳໄດ້</span>
        <button
          className="btn-primary py-1 text-xs"
          onClick={() => open.mutate()}
          disabled={open.isPending}
        >
          {open.isPending ? 'ກຳລັງເປີດ...' : 'ເປີດກະ'}
        </button>
        {open.error instanceof ApiError && (
          <span className="text-xs text-red-700">{open.error.message}</span>
        )}
      </Banner>
    );
  }

  if (shift.status === 'OPEN') {
    return (
      <Banner tone="ok">
        <span>ກະເປີດຢູ່ — ສາມາດເຮັດທຸລະກຳໄດ້</span>
      </Banner>
    );
  }

  if (shift.status === 'PENDING_APPROVAL') {
    return <Banner tone="warn">ປິດກະແລ້ວ — ລໍຖ້າ Financial Controller ອະນຸມັດ</Banner>;
  }

  return <Banner tone="muted">ກະຂອງມື້ນີ້ຖືກປິດແລ້ວ — ເຮັດທຸລະກຳໄດ້ໃນມື້ໃໝ່</Banner>;
}

function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  const styles = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    muted: 'border-slate-200 bg-slate-100 text-slate-600',
  }[tone];

  return (
    <div className={`flex items-center gap-3 border-b px-6 py-2 text-sm ${styles}`}>{children}</div>
  );
}
