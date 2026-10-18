'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { api, clearSession, getStoredUser, type SessionUser } from '@/lib/api';
import { findNavItem } from '@/lib/nav';
import { Sidebar } from './sidebar';
import { ShiftBanner } from './shift-banner';
import { NotificationBell } from './notification-bell';
import { LogoMark } from './logo';

const ROLE_LABEL_LO: Record<SessionUser['role'], string> = {
  ADMIN: 'Admin',
  MANAGER: 'ຜູ້ຈັດການ',
  PAYMENT: 'ພະນັກງານການເງິນ',
  VALUER: 'ຜູ້ປະເມີນລາຄາ',
  FINANCIAL_CONTROLLER: 'Financial Controller',
  WAREHOUSE: 'ຜູ້ຈັດການສາງ',
};

/** First letters of the name, for the avatar. */
function initials(name: string): string {
  return name.trim().slice(0, 2);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace('/login');
      return;
    }
    setUser(stored);
  }, [router]);

  /** Close the mobile rail on navigation, or it covers the page you opened. */
  useEffect(() => setRailOpen(false), [pathname]);

  /** Escape closes the drawer — the scrim is not the only way out. */
  useEffect(() => {
    if (!railOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [railOpen]);

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-white/70">
        ກຳລັງໂຫຼດ...
      </div>
    );
  }

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    clearSession();
    router.replace('/login');
  };

  const current = findNavItem(pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Rail: fixed drawer on small screens, static column from lg up. */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:static lg:translate-x-0 ${
          railOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar role={user.role} />
      </div>

      {railOpen && (
        <button
          type="button"
          aria-label="ປິດເມນູ"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setRailOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbar flex items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="ເປີດເມນູ"
              className="btn-on-dark px-2 py-1.5 lg:hidden"
              onClick={() => setRailOpen(true)}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" />
              </svg>
            </button>

            {/* Below `lg` the rail is hidden, so the mark anchors the brand. */}
            <LogoMark className="h-7 w-7 shrink-0 text-gold-400 lg:hidden" />

            {/* The page you are on, so the title is not only in the rail. */}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {current?.labelLo ?? 'ລະບົບບໍລິຫານຈັດການຮ້ານຄຳພູວົງ'}
              </div>
              {/* The manual has no TOR section; a bare "TOR" would read as a bug. */}
              {current?.section && (
                <div className="text-xs text-white/50">TOR {current.section}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10
                             px-2 py-1.5 text-left transition-colors hover:bg-white/20
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-label="ເມນູຜູ້ໃຊ້"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gold-400/90
                                   text-xs font-bold text-brand-900">
                    {initials(user.fullName)}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block truncate text-xs font-medium text-white">
                      {user.fullName}
                    </span>
                    <span className="block truncate text-[11px] text-white/55">
                      {ROLE_LABEL_LO[user.role]}
                    </span>
                  </span>
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                >
                  <div className="px-2.5 py-2">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {user.fullName}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {user.username} · {ROLE_LABEL_LO[user.role]}
                    </div>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />
                  <DropdownMenu.Item
                    onSelect={() => void logout()}
                    className="cursor-pointer rounded-lg px-2.5 py-2 text-sm text-red-600 outline-none
                               data-[highlighted]:bg-red-50"
                  >
                    ອອກຈາກລະບົບ
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* The light working surface. The gradient frames it on the top and
            left; the shift banner rides at its top edge so it never scrolls
            out of view mid-transaction. */}
        <div className="canvas flex min-h-0 flex-1 flex-col overflow-hidden">
          <ShiftBanner role={user.role} />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
