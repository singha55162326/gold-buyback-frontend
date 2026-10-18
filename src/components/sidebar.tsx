'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Collapsible from '@radix-ui/react-collapsible';
import clsx from 'clsx';
import { navForRole, type NavGroup, type Role } from '@/lib/nav';
import { LogoLockup } from './logo';

const OPEN_GROUPS_KEY = 'kpv.nav.openGroups';

/** Per-viewer convenience only; a blocked store must not break the nav. */
function readOpenGroups(): string[] | null {
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeOpenGroups(groups: string[]): void {
  try {
    window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(groups));
  } catch {
    /* private mode — the nav still works, it just forgets. */
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={clsx('h-4 w-4 shrink-0 transition-transform duration-200', open && 'rotate-90')}
    >
      <path d="M7.5 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The navigation rail.
 *
 * This role sees up to 41 destinations, which is too many to scan as one flat
 * list — so groups collapse, the group holding the current page opens itself,
 * and a filter cuts straight to a screen by name or TOR section. Open/closed
 * state is remembered per person.
 *
 * Radix Collapsible handles the keyboard and ARIA wiring; this file only
 * decides what opens and when.
 */
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const groups = useMemo(() => navForRole(role), [role]);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /** The group containing the current page, so it can open itself. */
  const activeGroup = useMemo(
    () =>
      groups.find((g) =>
        g.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)),
      )?.labelLo ?? null,
    [groups, pathname],
  );

  useEffect(() => {
    const stored = readOpenGroups();
    // First visit: open only the group you are standing in, so the rail opens
    // short rather than as a 41-item wall.
    setOpenGroups(stored ?? (activeGroup ? [activeGroup] : [groups[0]?.labelLo ?? '']));
    setHydrated(true);
    // Deliberately first-mount only; later navigation is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Navigating into a collapsed group reveals it. */
  useEffect(() => {
    if (!hydrated || !activeGroup) return;
    setOpenGroups((prev) => (prev.includes(activeGroup) ? prev : [...prev, activeGroup]));
  }, [activeGroup, hydrated]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
      writeOpenGroups(next);
      return next;
    });
  };

  /** Filter by Lao label or TOR section (typing "§7" finds the Order screens). */
  const filtered: NavGroup[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.labelLo.toLowerCase().includes(q) ||
            i.section.toLowerCase().includes(q) ||
            i.href.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const searching = query.trim().length > 0;

  return (
    <nav className="rail flex h-full w-72 shrink-0 flex-col" aria-label="ເມນູຫຼັກ">
      <div className="px-5 pb-4 pt-5">
        <LogoLockup className="h-10 w-10" />

        <div className="relative mt-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ຄົ້ນຫາເມນູ ຫຼື §ຂໍ້"
            aria-label="ຄົ້ນຫາເມນູ"
            className="w-full rounded-lg border border-white/15 bg-white/10 py-2 pl-9 pr-3
                       text-sm text-white placeholder:text-white/45
                       focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <svg viewBox="0 0 20 20" aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50">
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="rail-scroll flex-1 overflow-y-auto px-3 pb-6">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-white/50">ບໍ່ພົບເມນູ</p>
        )}

        {filtered.map((group) => {
          // While filtering, every matching group is open — hiding results
          // behind a collapsed header would defeat the search.
          const open = searching || openGroups.includes(group.labelLo);

          return (
            <Collapsible.Root
              key={group.labelLo}
              open={open}
              onOpenChange={() => !searching && toggleGroup(group.labelLo)}
              className="mb-1"
            >
              <Collapsible.Trigger className="rail-group-label" disabled={searching}>
                <span className="truncate">{group.labelLo}</span>
                <span className="flex items-center gap-1.5">
                  <span className="rounded-full bg-white/10 px-1.5 text-[11px] font-medium text-white/60">
                    {group.items.length}
                  </span>
                  {!searching && <ChevronIcon open={open} />}
                </span>
              </Collapsible.Trigger>

              <Collapsible.Content
                className="overflow-hidden data-[state=closed]:animate-collapsible-up
                           data-[state=open]:animate-collapsible-down"
              >
                <ul className="mb-2 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                  {group.items.map((item) => {
                    const active =
                      pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={clsx('rail-link', active && 'rail-link-active')}
                        >
                          <span className="truncate">{item.labelLo}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-white/35">
                            {item.section}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Collapsible.Content>
            </Collapsible.Root>
          );
        })}
      </div>
    </nav>
  );
}
