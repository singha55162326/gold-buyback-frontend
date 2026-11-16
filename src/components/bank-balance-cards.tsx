'use client';

import type { ReactNode } from 'react';
import { formatByCurrency } from '@/lib/format';
import type { BankCurrencyFilter } from '@/components/bank-summary-dashboard';

export interface BankBalanceRow {
  bankAccountId: string;
  bankCode: string;
  bankNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  inflow: string;
  outflow: string;
  actual: string;
  /**
   * Reconciliation figures. Optional because Bank (To Day) does not fetch
   * them — the cashier sees what moved, the Financial Controller reconciles.
   */
  net?: string | null;
  variance?: string | null;
}

function VarianceValue({
  variance,
  currency,
}: {
  variance: string | null | undefined;
  currency: BankBalanceRow['currency'];
}) {
  const num = variance === null || variance === undefined ? null : Number(variance);
  if (num === null) {
    return <span className="num text-muted">—</span>;
  }
  if (num === 0) {
    return (
      <span className="num inline-flex items-center gap-1 font-medium text-success">
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        {formatByCurrency(variance, currency)}
      </span>
    );
  }
  return (
    <span
      className="num inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold text-danger"
      style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}
    >
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M10.29 3.86l-8.3 14.38A1 1 0 002.86 20h18.28a1 1 0 00.87-1.76l-8.3-14.38a1 1 0 00-1.72 0z"
        />
      </svg>
      {formatByCurrency(variance, currency)}
    </span>
  );
}

/**
 * ຍອດ Bank ຕົວຈິງ — one horizontal strip per bank with LAK / THB / USD
 * arranged side-by-side in columns (or a flat table when `viewMode="table"`).
 *
 * Laying currencies horizontally instead of stacking them vertically keeps
 * every bank compact and aligns the same currency down the page so balances
 * across banks can be compared at a glance.
 */
export function BankBalanceCards({
  rows,
  renderNet,
  showVariance = true,
  currencyFilter = 'ALL',
  viewMode = 'cards',
  selectedBank = null,
  onSelectBank,
}: {
  rows: BankBalanceRow[];
  renderNet?: (row: BankBalanceRow) => ReactNode;
  showVariance?: boolean;
  currencyFilter?: BankCurrencyFilter;
  viewMode?: 'cards' | 'table';
  selectedBank?: string | null;
  onSelectBank?: (bankNameLo: string | null) => void;
}) {
  const filteredRows =
    currencyFilter === 'ALL' ? rows : rows.filter((r) => r.currency === currencyFilter);

  // Preserve the API's order (sortOrder) rather than sorting by name.
  const banks: { id: string; nameLo: string; code: string; rows: BankBalanceRow[] }[] = [];
  for (const row of filteredRows) {
    let bank = banks.find((b) => b.id === row.bankAccountId);
    if (!bank) {
      bank = { id: row.bankAccountId, nameLo: row.bankNameLo, code: row.bankCode, rows: [] };
      banks.push(bank);
    }
    bank.rows.push(row);
  }

  if (banks.length === 0) {
    return <p className="px-5 py-8 text-center text-muted">ຍັງບໍ່ມີບັນຊີທະນາຄານ</p>;
  }

  if (viewMode === 'table') {
    return (
      <div className="table-wrap" tabIndex={0} role="region" aria-label="ຕາຕະລາງຍອດ Bank">
        <table className="table">
          <thead>
            <tr>
              <th>ທະນາຄານ</th>
              <th>ສະກຸນເງິນ</th>
              <th className="text-right">ຍອດຕົວຈິງ</th>
              <th className="text-right">(+) ເຂົ້າ</th>
              <th className="text-right">(−) ອອກ</th>
              {renderNet && <th className="text-right">ເງິນ Bank ສຸດທິ</th>}
              {showVariance && <th className="text-right">ຍອດເງິນຂາດດຸນ</th>}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const isSelected = selectedBank === row.bankNameLo;
              return (
                <tr
                  key={`${row.bankAccountId}-${row.currency}`}
                  className={isSelected ? 'bg-gold-tint' : undefined}
                >
                  <td>
                    {onSelectBank ? (
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelectBank(isSelected ? null : row.bankNameLo)}
                        className="inline-flex items-center gap-2 text-left font-medium text-fg-strong hover:text-gold cursor-pointer transition-colors duration-150"
                        title="ກົດເພື່ອກັ່ນຕອງປະຫວັດຕາມທະນາຄານນີ້"
                      >
                        <span>{row.bankNameLo}</span>
                        <span className="font-mono text-[11px] text-muted">{row.bankCode}</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2 font-medium text-fg-strong">
                        <span>{row.bankNameLo}</span>
                        <span className="font-mono text-[11px] text-muted">{row.bankCode}</span>
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="badge bg-gold-tint text-gold">{row.currency}</span>
                  </td>
                  <td className="num text-right font-semibold text-fg-strong">
                    {formatByCurrency(row.actual, row.currency)}
                  </td>
                  <td className="num text-right text-success">
                    (+) {formatByCurrency(row.inflow, row.currency)}
                  </td>
                  <td className="num text-right text-danger">
                    (−) {formatByCurrency(row.outflow, row.currency)}
                  </td>
                  {renderNet && <td className="num text-right">{renderNet(row)}</td>}
                  {showVariance && (
                    <td className="text-right">
                      <VarianceValue variance={row.variance} currency={row.currency} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 sm:p-5">
      {banks.map((bank) => {
        const isSelected = selectedBank === bank.nameLo;
        const issueCount = showVariance
          ? bank.rows.filter(
              (r) => r.variance !== null && r.variance !== undefined && Number(r.variance) !== 0,
            ).length
          : 0;
        const colsClass =
          bank.rows.length === 1
            ? 'grid-cols-1'
            : bank.rows.length === 2
              ? 'grid-cols-1 md:grid-cols-2 md:divide-x md:divide-y-0'
              : 'grid-cols-1 md:grid-cols-3 md:divide-x md:divide-y-0';

        return (
          <section
            key={bank.id}
            style={
              isSelected
                ? { borderColor: 'var(--border-active)', boxShadow: '0 0 0 2px var(--gold-tint)' }
                : undefined
            }
            className="overflow-hidden rounded-xl border border-line bg-recessed transition-colors duration-200"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              {onSelectBank ? (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectBank(isSelected ? null : bank.nameLo)}
                  className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                  title={isSelected ? 'ກົດເພື່ອຍົກເລີກການກັ່ນຕອງ' : 'ກົດເພື່ອກັ່ນຕອງປະຫວັດ Bank ດ້ານລຸ່ມ'}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-gold-tint text-gold"
                    aria-hidden="true"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18M12 3l9 5H3l9-5z"
                      />
                    </svg>
                  </span>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="truncate font-semibold text-fg-strong group-hover:text-gold transition-colors duration-150">
                      {bank.nameLo}
                    </h3>
                    <span className="font-mono text-[11px] text-muted">{bank.code}</span>
                    {isSelected && (
                      <span className="text-[11px] font-medium text-gold">· ກຳລັງກັ່ນຕອງປະຫວັດ</span>
                    )}
                  </div>
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-gold-tint text-gold"
                    aria-hidden="true"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18M12 3l9 5H3l9-5z"
                      />
                    </svg>
                  </span>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="truncate font-semibold text-fg-strong">{bank.nameLo}</h3>
                    <span className="font-mono text-[11px] text-muted">{bank.code}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                {issueCount > 0 && (
                  <span className="status-danger shrink-0">ຂາດດຸນ {issueCount}</span>
                )}
                {onSelectBank && (
                  <span className="hidden text-[11px] text-muted sm:inline">
                    {isSelected ? 'ກົດອີກຄັ້ງເພື່ອຍົກເລີກ' : 'ກົດຊື່ທະນາຄານເພື່ອກັ່ນຕອງ'}
                  </span>
                )}
              </div>
            </header>

            <dl className={`grid divide-y divide-line ${colsClass}`}>
              {bank.rows.map((row) => (
                <div key={row.currency} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="badge bg-gold-tint text-gold">{row.currency}</dt>
                    <dd className="num text-base font-bold text-fg-strong sm:text-lg">
                      {formatByCurrency(row.actual, row.currency)}
                    </dd>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span className="num inline-flex items-center gap-1 text-success">
                      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                      </svg>
                      {formatByCurrency(row.inflow, row.currency)}
                    </span>
                    <span className="num inline-flex items-center gap-1 text-danger">
                      <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                      </svg>
                      {formatByCurrency(row.outflow, row.currency)}
                    </span>
                  </div>

                  {(renderNet || showVariance) && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-xs">
                      {renderNet && (
                        <div className="inline-flex items-center gap-1">
                          <span className="text-muted" title="ເງິນ Bank ສຸດທິ">ສຸດທິ:</span>
                          <span className="num font-medium text-fg">{renderNet(row)}</span>
                        </div>
                      )}

                      {showVariance && (
                        <div className="inline-flex items-center gap-1">
                          <span className="text-muted" title="ຍອດເງິນຂາດດຸນ">ຂາດດຸນ:</span>
                          <VarianceValue variance={row.variance} currency={row.currency} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
