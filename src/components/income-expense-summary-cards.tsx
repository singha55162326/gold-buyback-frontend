'use client';

import { useState } from 'react';
import { formatByCurrency } from '@/lib/format';

export interface CurrencySummary {
  currency: 'LAK' | 'THB' | 'USD';
  income: string;
  expense: string;
  net: string;
  incomeCount: number;
  expenseCount: number;
}

export interface MethodCurrencySummary {
  currency: 'LAK' | 'THB' | 'USD';
  income: string;
  expense: string;
  net: string;
  incomeCount: number;
  expenseCount: number;
}

export interface MethodSummary {
  method: 'CASH' | 'BANK';
  currencies: MethodCurrencySummary[];
}

export interface DailyIncomeExpenseSummary {
  date?: string;
  fromDate: string;
  toDate: string;
  totalTransactions: number;
  totalIncomeCount: number;
  totalExpenseCount: number;
  currencies: CurrencySummary[];
  byCurrency: Record<'LAK' | 'THB' | 'USD', CurrencySummary>;
  byMethod: MethodSummary[];
}

export function IncomeExpenseSummaryCards({
  summary,
  isLoading,
  onRefresh,
  isToday,
  fromDate,
  toDate,
}: {
  summary?: DailyIncomeExpenseSummary;
  isLoading?: boolean;
  onRefresh?: () => void;
  isToday?: boolean;
  fromDate?: string;
  toDate?: string;
}) {
  const [activeCurrency, setActiveCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');

  if (isLoading && !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-5 animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded bg-line" />
              <div className="h-4 w-12 rounded bg-line" />
            </div>
            <div className="h-8 w-44 rounded bg-line" />
            <div className="h-4 w-full rounded bg-line" />
          </div>
        ))}
      </div>
    );
  }

  const currentSummary = summary?.byCurrency?.[activeCurrency] ?? {
    currency: activeCurrency,
    income: '0',
    expense: '0',
    net: '0',
    incomeCount: 0,
    expenseCount: 0,
  };

  const cashData = summary?.byMethod
    ?.find((m) => m.method === 'CASH')
    ?.currencies.find((c) => c.currency === activeCurrency);
  const bankData = summary?.byMethod
    ?.find((m) => m.method === 'BANK')
    ?.currencies.find((c) => c.currency === activeCurrency);

  const lakData = summary?.byCurrency?.['LAK'] ?? { income: '0', expense: '0', net: '0' };
  const thbData = summary?.byCurrency?.['THB'] ?? { income: '0', expense: '0', net: '0' };
  const usdData = summary?.byCurrency?.['USD'] ?? { income: '0', expense: '0', net: '0' };

  const netNumber = Number(currentSummary.net || 0);

  const displayDate =
    fromDate && toDate
      ? fromDate === toDate
        ? isToday
          ? `ມື້ນີ້ (${fromDate})`
          : `ວັນທີ ${fromDate}`
        : `${fromDate} ຫາ ${toDate}`
      : 'ປະຈຳວັນ';

  return (
    <div className="space-y-3">
      {/* Top control bar: Label & Currency Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            ພາບລວມລາຍຮັບ-ລາຍຈ່າຍ ({displayDate})
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="ໂຫຼດຂໍ້ມູນໃໝ່"
              className="rounded-md p-1 text-muted hover:text-fg cursor-pointer transition-colors duration-200"
            >
              <svg
                className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Currency Switcher Tabs */}
        <div className="flex items-center rounded-lg border border-line bg-body p-0.5 text-xs font-medium">
          {(['LAK', 'THB', 'USD'] as const).map((curr) => (
            <button
              key={curr}
              type="button"
              className={`rounded-md px-2.5 py-1 transition-colors duration-200 cursor-pointer ${
                activeCurrency === curr
                  ? 'bg-card text-gold shadow-sm font-semibold'
                  : 'text-muted hover:text-fg'
              }`}
              onClick={() => setActiveCurrency(curr)}
            >
              {curr}
            </button>
          ))}
        </div>
      </div>

      {/* 3 Summary Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Total Income */}
        <div data-fade className="card relative overflow-hidden p-5 border-l-4 border-l-emerald-500">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          >
            <span className="stat-glow bg-emerald-500/10" />
          </span>

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 11l5-5m0 0l5 5m-5-5v12"
                  />
                </svg>
              </span>
              <span className="section-label">ຍອດລວມລາຍຮັບ</span>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
              {summary?.totalIncomeCount ?? 0} ລາຍການ
            </span>
          </div>

          <div className="relative mt-3">
            <div className="text-[11px] text-muted">
              ສະກຸນເງິນ {activeCurrency}
            </div>
            <div className="num mt-0.5 text-2xl font-bold tracking-tight text-emerald-400">
              {formatByCurrency(currentSummary.income, activeCurrency)}
            </div>
          </div>

          {/* Sub currencies breakdown */}
          <div className="relative mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-2.5 text-xs">
            {activeCurrency !== 'LAK' ? (
              <div>
                <span className="text-muted">LAK: </span>
                <span className="num font-semibold text-fg-strong">
                  {formatByCurrency(lakData.income, 'LAK')}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-muted">THB: </span>
                <span className="num font-semibold text-fg-strong">
                  {formatByCurrency(thbData.income, 'THB')}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted">
                {activeCurrency === 'USD' ? 'THB: ' : 'USD: '}
              </span>
              <span className="num font-semibold text-fg-strong">
                {formatByCurrency(
                  activeCurrency === 'USD' ? thbData.income : usdData.income,
                  activeCurrency === 'USD' ? 'THB' : 'USD',
                )}
              </span>
            </div>
          </div>

          {/* Method breakdown */}
          <div className="relative mt-2 flex items-center justify-between border-t border-line/30 pt-2 text-[11px] text-muted">
            <span>
              ເງິນສົດ:{' '}
              <span className="num font-medium text-fg">
                {formatByCurrency(cashData?.income ?? '0', activeCurrency)}
              </span>
            </span>
            <span>
              ເງິນໂອນ:{' '}
              <span className="num font-medium text-fg">
                {formatByCurrency(bankData?.income ?? '0', activeCurrency)}
              </span>
            </span>
          </div>
        </div>

        {/* Card 2: Total Expense */}
        <div data-fade className="card relative overflow-hidden p-5 border-l-4 border-l-rose-500">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          >
            <span className="stat-glow bg-rose-500/10" />
          </span>

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 13l-5 5m0 0l-5-5m5 5V6"
                  />
                </svg>
              </span>
              <span className="section-label">ຍອດລວມລາຍຈ່າຍ</span>
            </div>
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-400">
              {summary?.totalExpenseCount ?? 0} ລາຍການ
            </span>
          </div>

          <div className="relative mt-3">
            <div className="text-[11px] text-muted">
              ສະກຸນເງິນ {activeCurrency}
            </div>
            <div className="num mt-0.5 text-2xl font-bold tracking-tight text-rose-400">
              {formatByCurrency(currentSummary.expense, activeCurrency)}
            </div>
          </div>

          {/* Sub currencies breakdown */}
          <div className="relative mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-2.5 text-xs">
            {activeCurrency !== 'LAK' ? (
              <div>
                <span className="text-muted">LAK: </span>
                <span className="num font-semibold text-fg-strong">
                  {formatByCurrency(lakData.expense, 'LAK')}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-muted">THB: </span>
                <span className="num font-semibold text-fg-strong">
                  {formatByCurrency(thbData.expense, 'THB')}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted">
                {activeCurrency === 'USD' ? 'THB: ' : 'USD: '}
              </span>
              <span className="num font-semibold text-fg-strong">
                {formatByCurrency(
                  activeCurrency === 'USD' ? thbData.expense : usdData.expense,
                  activeCurrency === 'USD' ? 'THB' : 'USD',
                )}
              </span>
            </div>
          </div>

          {/* Method breakdown */}
          <div className="relative mt-2 flex items-center justify-between border-t border-line/30 pt-2 text-[11px] text-muted">
            <span>
              ເງິນສົດ:{' '}
              <span className="num font-medium text-fg">
                {formatByCurrency(cashData?.expense ?? '0', activeCurrency)}
              </span>
            </span>
            <span>
              ເງິນໂອນ:{' '}
              <span className="num font-medium text-fg">
                {formatByCurrency(bankData?.expense ?? '0', activeCurrency)}
              </span>
            </span>
          </div>
        </div>

        {/* Card 3: Net Balance */}
        <div data-fade className="card relative overflow-hidden p-5 border-l-4 border-l-gold">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          >
            <span className="stat-glow" />
          </span>

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-gold">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
              <span className="section-label">ຍອດເງິນສຸດທິ (Net)</span>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                netNumber > 0
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : netNumber < 0
                    ? 'bg-rose-500/15 text-rose-400'
                    : 'bg-line text-muted'
              }`}
            >
              {netNumber > 0 ? '+ ເງິນເຂົ້າຫຼາຍກວ່າ' : netNumber < 0 ? '− ລາຍຈ່າຍຫຼາຍກວ່າ' : 'ສົມດຸນ'}
            </span>
          </div>

          <div className="relative mt-3">
            <div className="text-[11px] text-muted">
              ສະກຸນເງິນ {activeCurrency} (ຮັບ − ຈ່າຍ)
            </div>
            <div
              className={`num mt-0.5 text-2xl font-bold tracking-tight ${
                netNumber > 0
                  ? 'text-emerald-400'
                  : netNumber < 0
                    ? 'text-rose-400'
                    : 'text-fg-strong'
              }`}
            >
              {netNumber > 0 ? '+' : ''}
              {formatByCurrency(currentSummary.net, activeCurrency)}
            </div>
          </div>

          {/* Sub currencies breakdown */}
          <div className="relative mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-2.5 text-xs">
            {activeCurrency !== 'LAK' ? (
              <div>
                <span className="text-muted">LAK: </span>
                <span
                  className={`num font-semibold ${
                    Number(lakData.net) > 0
                      ? 'text-emerald-400'
                      : Number(lakData.net) < 0
                        ? 'text-rose-400'
                        : 'text-fg-strong'
                  }`}
                >
                  {Number(lakData.net) > 0 ? '+' : ''}
                  {formatByCurrency(lakData.net, 'LAK')}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-muted">THB: </span>
                <span
                  className={`num font-semibold ${
                    Number(thbData.net) > 0
                      ? 'text-emerald-400'
                      : Number(thbData.net) < 0
                        ? 'text-rose-400'
                        : 'text-fg-strong'
                  }`}
                >
                  {Number(thbData.net) > 0 ? '+' : ''}
                  {formatByCurrency(thbData.net, 'THB')}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted">
                {activeCurrency === 'USD' ? 'THB: ' : 'USD: '}
              </span>
              <span
                className={`num font-semibold ${
                  Number(activeCurrency === 'USD' ? thbData.net : usdData.net) > 0
                    ? 'text-emerald-400'
                    : Number(activeCurrency === 'USD' ? thbData.net : usdData.net) < 0
                      ? 'text-rose-400'
                      : 'text-fg-strong'
                }`}
              >
                {Number(activeCurrency === 'USD' ? thbData.net : usdData.net) > 0 ? '+' : ''}
                {formatByCurrency(
                  activeCurrency === 'USD' ? thbData.net : usdData.net,
                  activeCurrency === 'USD' ? 'THB' : 'USD',
                )}
              </span>
            </div>
          </div>

          {/* Overall summary footer */}
          <div className="relative mt-2 flex items-center justify-between border-t border-line/30 pt-2 text-[11px] text-muted">
            <span>
              ທຸລະກຳລວມ:{' '}
              <span className="num font-medium text-fg">
                {summary?.totalTransactions ?? 0} ລາຍການ
              </span>
            </span>
            <span>
              ຮັບ: {summary?.totalIncomeCount ?? 0} | ຈ່າຍ: {summary?.totalExpenseCount ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

