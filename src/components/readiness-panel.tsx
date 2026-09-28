'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type CheckLevel = 'ok' | 'warn' | 'blocked';

interface ReadinessCheck {
  key: string;
  labelLo: string;
  level: CheckLevel;
  detailLo: string;
  actionLo: string | null;
  href: string | null;
}

interface Readiness {
  level: CheckLevel;
  checks: ReadinessCheck[];
  checkedAt: string;
}

const TONE: Record<CheckLevel, { dot: string; badge: string; lo: string }> = {
  ok: { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800', lo: 'ພ້ອມ' },
  warn: { dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-900', lo: 'ຄວນຕັ້ງເພີ່ມ' },
  blocked: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800', lo: 'ຍັງໃຊ້ງານບໍ່ໄດ້' },
};

/**
 * "ຄວາມພ້ອມຂອງລະບົບ" — the setup checklist, on the Dashboard.
 *
 * Every item here is something that fails silently at the counter if unset: a
 * price board nobody entered, an exchange rate from last month, a WhatsApp
 * channel with no recipients. Each line carries the screen that fixes it, so
 * finding the problem and fixing it are one click apart.
 *
 * When everything passes it collapses to a single green line — a healthy shop
 * should not have to read a checklist every morning.
 */
export function ReadinessPanel() {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: () => api.get<Readiness>('/system/readiness'),
    refetchInterval: 120_000,
    retry: false,
  });

  if (isLoading || !data) return null;

  const problems = data.checks.filter((c) => c.level !== 'ok');
  const allGood = problems.length === 0;
  // A clean system shows one line; anything unresolved opens itself.
  const open = expanded || !allGood;
  const tone = TONE[data.level];

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
          <span className="truncate text-base font-semibold text-slate-900">ຄວາມພ້ອມຂອງລະບົບ</span>
          <span className={`badge shrink-0 ${tone.badge}`}>
            {allGood ? 'ພ້ອມໃຊ້ງານຄົບ' : `${problems.length} ລາຍການຕ້ອງເບິ່ງ`}
          </span>
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-200/80">
          {data.checks.map((check) => {
            const t = TONE[check.level];
            return (
              <li key={check.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800">{check.labelLo}</span>
                  <span className="block text-xs text-slate-500">{check.detailLo}</span>
                </span>

                {check.actionLo && check.href ? (
                  <Link href={check.href} className="btn-secondary shrink-0 py-1 text-xs">
                    {check.actionLo}
                  </Link>
                ) : check.actionLo ? (
                  <span className="shrink-0 text-xs text-slate-500">{check.actionLo}</span>
                ) : (
                  <span className={`badge shrink-0 ${t.badge}`}>{t.lo}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
