'use client';

import { dec } from '@kpv/domain';
import { formatWeight, gramsToBaht } from '@/lib/format';

export interface GoldPartnerSummaryRow {
  partnerId: string;
  partnerCode: string;
  partnerNameLo: string;
  side: 'AP' | 'AR';
  broughtForwardG: string;
  increasesG: string;
  decreasesG: string;
  currentG: string;
}

function safeDec(value: string | null | undefined) {
  if (!value) return dec(0);
  try {
    return dec(value);
  } catch {
    return dec(0);
  }
}

/**
 * ພາບລວມສະຫຼຸບ ຍອດປັດຈຸບັນ (g) ແຍກຕາມແຫຼ່ງ Supplier (§8.2 / §8.3).
 *
 * ຄລິກທີ່ກາດຂອງແຫຼ່ງໃດໜຶ່ງເພື່ອກອງຕາຕະລາງປະຫວັດດ້ານລຸ່ມສະເພາະແຫຼ່ງນັ້ນ.
 */
export function SupplierGoldSummaryDashboard({
  side,
  partners,
  isLoading = false,
  isError = false,
  selectedPartnerId,
  onSelectPartner,
}: {
  side: 'AP' | 'AR';
  partners: GoldPartnerSummaryRow[];
  isLoading?: boolean;
  isError?: boolean;
  selectedPartnerId: string;
  onSelectPartner: (partnerId: string) => void;
}) {
  if (isError) return null;

  if (isLoading && partners.length === 0) {
    return (
      <section aria-label="ສະຫຼຸບຍອດປັດຈຸບັນ (g) ຕາມແຫຼ່ງ Supplier" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="h-4 w-56 animate-pulse rounded bg-recessed" />
          <div className="h-5 w-36 animate-pulse rounded-full bg-recessed" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-5 w-28 rounded bg-recessed" />
                <div className="h-5 w-12 rounded-full bg-recessed" />
              </div>
              <div className="h-8 w-36 rounded bg-recessed" />
              <div className="h-1.5 w-full rounded-full bg-recessed" />
              <div className="h-11 w-full rounded-xl bg-recessed" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const totalCurrent = partners.reduce((sum, p) => sum.plus(safeDec(p.currentG)), dec(0));
  const totalPositive = partners.reduce((sum, p) => {
    const c = safeDec(p.currentG);
    return c.gt(0) ? sum.plus(c) : sum;
  }, dec(0));

  return (
    <section aria-label="ສະຫຼຸບຍອດປັດຈຸບັນ (g) ຕາມແຫຼ່ງ Supplier" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="section-label inline-flex items-center gap-1.5">
            <svg
              className="h-4 w-4 text-[var(--gold-icon)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 21h18M4 21V7a1 1 0 011-1h5v15M14 21V11a1 1 0 011-1h4a1 1 0 011 1v10M7.5 10h.01M7.5 14h.01M17 14h.01"
              />
            </svg>
            ສະຫຼຸບຍອດປັດຈຸບັນ (g) ຕາມແຫຼ່ງ Supplier
          </span>
          <span className="badge recessed text-muted">{partners.length} ແຫຼ່ງ</span>
          <span className="badge recessed text-fg-strong num">
            ລວມ {formatWeight(totalCurrent.toFixed())} g · {gramsToBaht(totalCurrent.toFixed())} ບາດ
          </span>
        </div>

        {selectedPartnerId && (
          <button
            type="button"
            onClick={() => onSelectPartner('')}
            className="filter-clear cursor-pointer"
          >
            ສະແດງທຸກແຫຼ່ງ
          </button>
        )}
      </div>

      {partners.length === 0 ? (
        <div className="card px-5 py-6 text-center text-sm text-muted">
          ຍັງບໍ່ມີຂໍ້ມູນແຫຼ່ງ Supplier ສຳລັບ {side} (GOLD)
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {partners.map((row) => {
            const isSelected = selectedPartnerId === row.partnerId;
            const current = safeDec(row.currentG);
            const hasPositiveShare = totalPositive.gt(0) && current.gt(0);
            const sharePct = hasPositiveShare
              ? current.div(totalPositive).mul(100).toDecimalPlaces(1).toFixed()
              : '0';
            const barWidthPct = hasPositiveShare
              ? Math.min(100, Math.max(4, Number(sharePct)))
              : 0;

            const valueToneClass = current.gt(0)
              ? 'text-gold'
              : current.lt(0)
                ? 'text-danger'
                : 'text-fg-strong';

            return (
              <button
                key={`${row.partnerId}-${row.side}`}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectPartner(isSelected ? '' : row.partnerId)}
                title="ຄລິກເພື່ອກອງປະຫວັດຕາມແຫຼ່ງ Supplier ນີ້"
                className={`card relative flex w-full flex-col justify-between gap-3 p-5 text-left cursor-pointer transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-2 ${
                  isSelected ? 'border-[var(--gold)] ring-2 ring-[var(--gold)]/45' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                >
                  <span className="stat-glow" />
                </span>

                <div className="relative flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-gold-tint text-gold"
                      aria-hidden="true"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-fg-strong">
                        {row.partnerNameLo}
                      </div>
                      <div className="font-mono text-[11px] text-muted">{row.partnerCode}</div>
                    </div>
                  </div>

                  {isSelected ? (
                    <span className="badge recessed shrink-0 text-gold border-[var(--gold)] text-[11px]">
                      ກຳລັງກອງ
                    </span>
                  ) : (
                    <span
                      className={`shrink-0 text-[11px] ${
                        row.side === 'AP' ? 'status-danger' : 'status-success'
                      }`}
                    >
                      {row.side}
                    </span>
                  )}
                </div>

                <div className="relative space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>ຍອດປັດຈຸບັນ (g)</span>
                    {hasPositiveShare && <span className="num font-medium">{sharePct}%</span>}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className={`num text-2xl font-bold tracking-tight ${valueToneClass}`}>
                      {formatWeight(row.currentG)}{' '}
                      <span className="text-sm font-semibold text-muted">g</span>
                    </div>
                    <div className="num text-xs text-muted">
                      {gramsToBaht(row.currentG)} ບາດ
                    </div>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-1.5 w-full overflow-hidden rounded-full border border-line bg-recessed"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--gold)] transition-all duration-300"
                      style={{ width: `${barWidthPct}%` }}
                    />
                  </div>
                </div>

                <div className="relative grid grid-cols-3 gap-2 rounded-xl border border-line bg-recessed px-3 py-2 text-[11px]">
                  <div className="min-w-0">
                    <div className="text-muted">ຍົກມາ</div>
                    <div className="num truncate font-medium text-fg-strong">
                      {formatWeight(row.broughtForwardG)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted">(+) g</div>
                    <div className="num truncate font-medium text-success">
                      {formatWeight(row.increasesG)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted">(−) g</div>
                    <div className="num truncate font-medium text-danger">
                      {formatWeight(row.decreasesG)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
