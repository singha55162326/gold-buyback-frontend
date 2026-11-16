'use client';

import { dec } from '@kpv/domain';
import { formatByCurrency } from '@/lib/format';
import type { BankBalanceRow } from '@/components/bank-balance-cards';

export type BankCurrencyFilter = 'ALL' | 'LAK' | 'THB' | 'USD';

const CURRENCIES: Array<{ code: 'LAK' | 'THB' | 'USD'; label: string; symbol: string }> = [
  { code: 'LAK', label: 'ກີບລາວ', symbol: '₭' },
  { code: 'THB', label: 'ບາດໄທ', symbol: '฿' },
  { code: 'USD', label: 'ໂດລາສະຫະລັດ', symbol: '$' },
];

function safeDec(value: string | null | undefined) {
  if (!value) return dec(0);
  try {
    return dec(value);
  } catch {
    return dec(0);
  }
}

/**
 * ພາບລວມຍອດລວມ Bank ແຍກຕາມສະກຸນເງິນ (LAK / THB / USD).
 *
 * ລວມຍອດທຸກທະນາຄານເຂົ້າກັນໂດຍບໍ່ປົນສະກຸນເງິນ, ພ້ອມສະແດງການເຄື່ອນໄຫວ (+ / −)
 * ແລະ ຍອດຂາດດຸນລວມ ເພື່ອໃຫ້ເຫັນຄວາມຜິດປົກກະຕິໄດ້ທັນທີ. ກົດທີ່ກາດເພື່ອກັ່ນຕອງ
 * ທັງສ່ວນຍອດ Bank ແລະ ຕາຕະລາງປະຫວັດດ້ານລຸ່ມ.
 */
export function BankSummaryDashboard({
  rows,
  isLoading = false,
  activeCurrency = 'ALL',
  onSelectCurrency,
  showVariance = true,
}: {
  rows: BankBalanceRow[];
  isLoading?: boolean;
  activeCurrency?: BankCurrencyFilter;
  onSelectCurrency?: (currency: BankCurrencyFilter) => void;
  showVariance?: boolean;
}) {
  const bankIds = new Set(rows.map((r) => r.bankAccountId));

  const totalsByCurrency = CURRENCIES.map(({ code, label, symbol }) => {
    const matching = rows.filter((r) => r.currency === code);
    let actual = dec(0);
    let inflow = dec(0);
    let outflow = dec(0);
    let net = dec(0);
    let netCount = 0;
    let variance = dec(0);
    let varianceCount = 0;
    let issueCount = 0;

    for (const r of matching) {
      actual = actual.plus(safeDec(r.actual));
      inflow = inflow.plus(safeDec(r.inflow));
      outflow = outflow.plus(safeDec(r.outflow));
      if (r.net !== null && r.net !== undefined) {
        net = net.plus(safeDec(r.net));
        netCount += 1;
      }
      if (r.variance !== null && r.variance !== undefined) {
        const v = safeDec(r.variance);
        variance = variance.plus(v);
        varianceCount += 1;
        if (!v.isZero()) issueCount += 1;
      }
    }

    return {
      code,
      label,
      symbol,
      accountCount: matching.length,
      actual,
      inflow,
      outflow,
      net,
      netCount,
      variance,
      varianceCount,
      issueCount,
    };
  });

  const totalIssues = totalsByCurrency.reduce((sum, item) => sum + item.issueCount, 0);
  const totalNetEntries = totalsByCurrency.reduce((sum, item) => sum + item.netCount, 0);

  if (isLoading && rows.length === 0) {
    return (
      <section aria-label="ພາບລວມຍອດລວມ Bank" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="h-4 w-44 animate-pulse rounded bg-recessed" />
          <div className="h-5 w-32 animate-pulse rounded-full bg-recessed" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-5 w-24 rounded bg-recessed" />
                <div className="h-5 w-16 rounded-full bg-recessed" />
              </div>
              <div className="h-8 w-40 rounded bg-recessed" />
              <div className="h-9 w-full rounded-xl bg-recessed" />
              <div className="h-4 w-full rounded bg-recessed" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="ພາບລວມຍອດລວມ Bank" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="section-label inline-flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18M12 3l9 5H3l9-5z"
              />
            </svg>
            ພາບລວມຍອດລວມ Bank
          </span>
          <span className="badge text-muted">{bankIds.size} ທະນາຄານ</span>
          <span className="live-dot">ອັບເດດອັດຕະໂນມັດ</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showVariance && rows.length > 0 && (
            totalIssues > 0 ? (
              <span className="status-danger">
                ພົບຍອດຂາດດຸນ {totalIssues} ລາຍການ
              </span>
            ) : totalNetEntries > 0 ? (
              <span className="status-success">ຍອດສຸດທິກົງກັນ</span>
            ) : (
              <span className="badge text-muted">ຍັງບໍ່ມີຍອດສຸດທິ</span>
            )
          )}
          {onSelectCurrency && activeCurrency !== 'ALL' && (
            <button
              type="button"
              onClick={() => onSelectCurrency('ALL')}
              className="filter-clear cursor-pointer"
            >
              ສະແດງທຸກສະກຸນເງິນ
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {totalsByCurrency.map((item) => {
          const isSelected = activeCurrency === item.code;
          const isDimmed = activeCurrency !== 'ALL' && !isSelected;
          const hasIssue = item.issueCount > 0;
          const hasVariance = item.varianceCount > 0;

          const cardContent = (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
              >
                <span className="stat-glow" />
              </span>

              <div className="relative flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-gold-tint text-sm font-bold text-gold"
                    aria-hidden="true"
                  >
                    {item.symbol}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-fg-strong">{item.code}</span>
                      <span className="text-xs text-muted">· {item.label}</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      ຍອດຕົວຈິງລວມ ({item.accountCount} ບັນຊີ)
                    </div>
                  </div>
                </div>

                {isSelected ? (
                  <span className="badge bg-gold-tint text-gold">ກຳລັງກັ່ນຕອງ</span>
                ) : hasIssue ? (
                  <span className="status-danger">{item.issueCount} ຂາດດຸນ</span>
                ) : null}
              </div>

              <div
                title={formatByCurrency(item.actual, item.code)}
                className="num relative mt-3.5 truncate text-2xl font-bold tracking-tight text-fg-strong"
              >
                {formatByCurrency(item.actual, item.code)}
              </div>

              <div className="recessed relative mt-3 grid grid-cols-2 gap-2 rounded-xl px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[11px] text-muted">
                    <svg className="h-3.5 w-3.5 shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                    </svg>
                    <span>ເຂົ້າ (+)</span>
                  </div>
                  <div className="num mt-0.5 truncate font-semibold text-success">
                    {formatByCurrency(item.inflow, item.code)}
                  </div>
                </div>
                <div className="min-w-0 border-l border-line pl-2.5">
                  <div className="flex items-center gap-1 text-[11px] text-muted">
                    <svg className="h-3.5 w-3.5 shrink-0 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                    </svg>
                    <span>ອອກ (−)</span>
                  </div>
                  <div className="num mt-0.5 truncate font-semibold text-danger">
                    {formatByCurrency(item.outflow, item.code)}
                  </div>
                </div>
              </div>

              {showVariance && (
                <div className="relative mt-3 space-y-1 border-t border-line pt-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">ເງິນ Bank ສຸດທິລວມ</span>
                    <span className="num font-medium text-fg">
                      {item.netCount > 0 ? formatByCurrency(item.net, item.code) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">ຍອດເງິນຂາດດຸນລວມ</span>
                    <span
                      className={`num inline-flex items-center gap-1 ${
                        !hasVariance
                          ? 'text-muted'
                          : item.variance.isZero()
                            ? 'text-success font-medium'
                            : 'text-danger font-semibold'
                      }`}
                    >
                      {hasVariance && !item.variance.isZero() && (
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01M10.29 3.86l-8.3 14.38A1 1 0 002.86 20h18.28a1 1 0 00.87-1.76l-8.3-14.38a1 1 0 00-1.72 0z"
                          />
                        </svg>
                      )}
                      {hasVariance && item.variance.isZero() && (
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {hasVariance ? formatByCurrency(item.variance, item.code) : '—'}
                    </span>
                  </div>
                </div>
              )}
            </>
          );

          const selectedStyle = isSelected
            ? { borderColor: 'var(--border-active)', boxShadow: '0 0 0 2px var(--gold-tint), var(--card-shadow)' }
            : undefined;

          if (onSelectCurrency) {
            return (
              <button
                key={item.code}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectCurrency(isSelected ? 'ALL' : item.code)}
                style={selectedStyle}
                className={`card relative w-full overflow-hidden p-5 text-left cursor-pointer transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] ${
                  isDimmed ? 'opacity-70 hover:opacity-100' : ''
                }`}
              >
                {cardContent}
              </button>
            );
          }

          return (
            <div key={item.code} data-fade className="card relative overflow-hidden p-5">
              {cardContent}
            </div>
          );
        })}
      </div>
    </section>
  );
}

