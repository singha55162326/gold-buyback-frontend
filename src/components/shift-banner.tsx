'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { Role } from '@/lib/nav';
import { Dialog } from './dialog';
import { NumberInput } from './number-input';

type Currency = 'LAK' | 'THB' | 'USD';
const CURRENCIES: Currency[] = ['LAK', 'THB', 'USD'];

interface Shift {
  id: string;
  status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED' | 'REJECTED';
  openedAt: string;
  closedAt: string | null;
}

// Admin/Manager ບໍ່ຖືກບັງຄັບໃຫ້ເປີດກະ ແຕ່ຕ້ອງເປີດໄດ້ ຖ້າຢາກເຮັດທຸລະກຳເອງ.
const SHIFT_ROLES: Role[] = ['PAYMENT', 'VALUER', 'ADMIN', 'MANAGER'];

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

  /*
   * ປິດກະ ຕ້ອງຢູ່ບ່ອນດຽວກັນກັບ ເປີດກະ.
   *
   * ແຕ່ກ່ອນມີແຕ່ປຸ່ມເປີດ ສ່ວນການປິດຢູ່ຝັ່ງ API ຢ່າງດຽວ — ພະນັກງານຈຶ່ງປິດກະ
   * ບໍ່ໄດ້ ແລະ ເງິນທ້າຍກະບໍ່ເຄີຍຖືກສົ່ງໃຫ້ Financial Controller ອະນຸມັດ.
   */
  const [closing, setClosing] = useState(false);
  const [counts, setCounts] = useState<Record<Currency, string>>({ LAK: '', THB: '', USD: '' });
  const [note, setNote] = useState('');

  const close = useMutation({
    mutationFn: () =>
      api.post('/shifts/close', {
        balances: CURRENCIES.filter((c) => counts[c].trim() !== '').map((currency) => ({
          currency,
          amount: counts[currency].replace(/,/g, '').trim(),
        })),
        note: note || undefined,
      }),
    onSuccess: () => {
      setClosing(false);
      setCounts({ LAK: '', THB: '', USD: '' });
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['shift', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
    },
  });

  if (!enabled || isLoading) return null;

  if (!shift) {
    return (
      <Banner tone="warn">
        <span>ຍັງບໍ່ໄດ້ເປີດກະ — ບໍ່ສາມາດເຮັດທຸລະກຳໄດ້</span>
        <button
          className="btn-primary text-xs"
          onClick={() => open.mutate()}
          disabled={open.isPending}
        >
          {open.isPending ? 'ກຳລັງເປີດ...' : 'ເປີດກະ'}
        </button>
        {open.error instanceof ApiError && (
          <span className="text-xs text-danger">{open.error.message}</span>
        )}
      </Banner>
    );
  }

  if (shift.status === 'OPEN') {
    return (
      <>
        <Banner tone="ok">
          <span>ກະເປີດຢູ່ — ສາມາດເຮັດທຸລະກຳໄດ້</span>
          <button className="btn-secondary text-xs" onClick={() => setClosing(true)}>
            ປິດກະ
          </button>
        </Banner>

        <Dialog
          open={closing}
          onClose={() => setClosing(false)}
          title="ປິດກະ — ນັບເງິນທ້າຍກະ"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setClosing(false)}>ຍົກເລີກ</button>
              <button className="btn-primary" disabled={close.isPending}
                onClick={() => close.mutate()}>
                {close.isPending ? 'ກຳລັງສົ່ງ...' : 'ສົ່ງໃຫ້ FC ອະນຸມັດ'}
              </button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {CURRENCIES.map((currency) => (
              <div key={currency}>
                <label className="label" htmlFor={`close-${currency}`}>ຍອດນັບໄດ້ ({currency})</label>
                <NumberInput id={`close-${currency}`} className="input num"
                  decimals={currency === 'LAK' ? 0 : 2}
                  value={counts[currency]}
                  onValueChange={(v) => setCounts((p) => ({ ...p, [currency]: v }))} />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="close-note">ໝາຍເຫດ</label>
            <input id="close-note" className="input" value={note}
              onChange={(e) => setNote(e.target.value)} />
          </div>
          {close.error instanceof ApiError && (
            <div role="alert" className="notice status-danger mt-3">{close.error.message}</div>
          )}
          <p className="mt-2 text-xs text-muted">
            ປິດກະແລ້ວ ເຮັດທຸລະກຳຕໍ່ບໍ່ໄດ້ຈົນກວ່າມື້ໃໝ່ · ຍອດເງິນທີ່ນັບໄດ້ຈະສົ່ງໃຫ້
            Financial Controller ກວດ ແລະ ອະນຸມັດ
          </p>
        </Dialog>
      </>
    );
  }

  if (shift.status === 'PENDING_APPROVAL') {
    return <Banner tone="warn">ປິດກະແລ້ວ — ລໍຖ້າ Financial Controller ອະນຸມັດ</Banner>;
  }

  return <Banner tone="muted">ກະຂອງມື້ນີ້ຖືກປິດແລ້ວ — ເຮັດທຸລະກຳໄດ້ໃນມື້ໃໝ່</Banner>;
}

function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  // Each tone leads with an icon so state never rests on colour alone
  // (the notice's own status dot is hidden: the icon is the marker).
  const styles = {
    ok: 'status-success',
    warn: 'status-warning',
    muted: 'recessed border border-[var(--line)] text-muted',
  }[tone];
  const icon = {
    ok: <path d="M5 10.5l3.2 3.2L15 6.8" />,
    warn: <path d="M10 6v5M10 14h.01" />,
    muted: <path d="M10 6.5V10l2.5 1.5" />,
  }[tone];

  return (
    <div
      data-fade
      className={`notice mb-4 flex-wrap items-center gap-3 before:hidden ${styles}`}
    >
      <svg
        viewBox="0 0 20 20"
        className="h-[18px] w-[18px] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.5" />
        {icon}
      </svg>
      {children}
    </div>
  );
}
