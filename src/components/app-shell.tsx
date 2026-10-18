'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { api, clearSession, getStoredUser, type SessionUser } from '@/lib/api';
import { findNavItem } from '@/lib/nav';
import { useFadeIn } from '@/lib/use-fade-in';
import { Sidebar } from './sidebar';
import { ShiftBanner } from './shift-banner';
import { NotificationBell } from './notification-bell';
import { LogoMark } from './logo';
import { ThemeToggle } from './theme-toggle';

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

  useFadeIn(user ? pathname : null);

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
      <div className="flex h-screen items-center justify-center text-sm text-muted">
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
    <div className="shell-grid min-h-screen p-4 lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-4">
      {/* Sidebar: off-canvas drawer below lg, sticky full-height column from lg up.
          The wrapper only positions; the glass (and data-fade) live on the nav. */}
      <div
        data-surface="dark"
        className={`no-print fixed bottom-4 left-4 top-4 z-40 w-[min(288px,calc(100vw-32px))]
                    transition-[transform,visibility] duration-200
                    lg:sticky lg:top-4 lg:z-10 lg:h-[calc(100vh-32px)] lg:w-auto lg:translate-x-0
                    lg:visible ${
                      railOpen ? 'visible translate-x-0' : 'invisible -translate-x-[calc(100%+16px)]'
                    }`}
      >
        <Sidebar role={user.role} />
      </div>

      {railOpen && (
        <button
          type="button"
          aria-label="ປິດເມນູ"
          className="fixed inset-0 z-30 bg-[var(--scrim)] backdrop-blur-[4px] lg:hidden"
          onClick={() => setRailOpen(false)}
        />
      )}

      <div className="min-w-0">
        <header
          data-surface="dark"
          data-fade
          className="shell-header no-print sticky top-4 z-20 flex items-center justify-between gap-3"
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="ເປີດເມນູ"
              className="chrome-btn lg:hidden"
              onClick={() => setRailOpen(true)}
            >
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" />
              </svg>
            </button>

            {/* Below `lg` the sidebar is hidden, so the mark anchors the brand. */}
            <LogoMark className="hidden h-7 w-7 shrink-0 sm:block lg:hidden" />

            {/* The page you are on, so the title is not only in the sidebar. */}
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-fg-strong">
                {current?.labelLo ?? 'ລະບົບບໍລິຫານຈັດການຮ້ານຄຳພູວົງ'}
              </div>
              {/* The manual has no TOR section; a bare "TOR" would read as a bug. */}
              {current?.section && (
                <div className="text-[11px] text-gold">TOR {current.section}</div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <NotificationBell />

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="recessed flex h-[42px] items-center gap-2.5 rounded-[12px] pl-[5px] pr-[5px]
                             text-left transition-colors hover:border-[var(--border-hover)] sm:pr-3"
                  aria-label="ເມນູຜູ້ໃຊ້"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]
                                   bg-[image:var(--gold-fill)] text-xs font-bold text-[var(--on-gold)]">
                    {initials(user.fullName)}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-[160px] truncate text-xs font-medium leading-snug text-fg-strong">
                      {user.fullName}
                    </span>
                    <span className="block max-w-[160px] truncate text-[11px] leading-snug text-muted">
                      {ROLE_LABEL_LO[user.role]}
                    </span>
                  </span>
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="menu-panel z-50 w-60 p-1.5"
                >
                  <div className="px-2.5 py-2">
                    <div className="truncate text-sm font-medium text-fg-strong">
                      {user.fullName}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {user.username} · {ROLE_LABEL_LO[user.role]}
                    </div>
                  </div>
                  <DropdownMenu.Separator className="divider my-1" />
                  <DropdownMenu.Item
                    onSelect={() => void logout()}
                    className="flex min-h-[42px] cursor-pointer items-center rounded-[12px] px-2.5 text-sm
                               text-danger outline-none data-[highlighted]:bg-[var(--danger-bg)] data-[highlighted]:outline data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-[var(--gold)]"
                  >
                    ອອກຈາກລະບົບ
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* Content sits straight on the page background. The shift banner rides
            at its top so it is seen before any transaction starts. */}
        <div className="mt-6">
          <ShiftBanner role={user.role} />
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
