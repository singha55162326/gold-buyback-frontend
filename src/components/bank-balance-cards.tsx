'use client';

import type { ReactNode } from 'react';
import { formatByCurrency } from '@/lib/format';

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

/**
 * ຍອດ Bank ຕົວຈິງ — one card per bank, currencies stacked inside it.
 *
 * The API returns one row per (bank × currency), which as a flat table ran
 * nine rows down the page for three banks and read as a wall. Grouping puts
 * a bank's whole position in one place, which is the question being asked:
 * "how much is in BCEL?", not "what is row seven?".
 *
 * `renderNet` is a slot because Module Bank edits ເງິນ Bank ສຸດທິ in place
 * while Bank (To Day) only displays it — same layout, different affordance.
 */
export function BankBalanceCards({
  rows,
  renderNet,
  showVariance = true,
}: {
  rows: BankBalanceRow[];
  renderNet?: (row: BankBalanceRow) => ReactNode;
  showVariance?: boolean;
}) {
  // Preserve the API's order (sortOrder) rather than sorting by name.
  const banks: { id: string; nameLo: string; code: string; rows: BankBalanceRow[] }[] = [];
  for (const row of rows) {
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

  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
      {banks.map((bank) => (
        <section key={bank.id} className="rounded-xl border border-line p-4">
          <header className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-fg-strong">{bank.nameLo}</h3>
            <span className="font-mono text-xs text-muted">{bank.code}</span>
          </header>

          <dl className="space-y-3">
            {bank.rows.map((row) => {
              const variance = row.variance === null ? null : Number(row.variance);
              return (
                <div key={row.currency} className="border-t border-line pt-3 first:border-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-xs font-medium text-muted">{row.currency}</dt>
                    <dd className="num text-lg font-semibold text-fg-strong">
                      {formatByCurrency(row.actual, row.currency)}
                    </dd>
                  </div>

                  <div className="num mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
                    <span className="text-success">(+) {formatByCurrency(row.inflow, row.currency)}</span>
                    <span className="text-danger">(−) {formatByCurrency(row.outflow, row.currency)}</span>
                  </div>

                  {renderNet && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-muted">ເງິນ Bank ສຸດທິ</span>
                      <span className="num">{renderNet(row)}</span>
                    </div>
                  )}

                  {showVariance && (
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted">ຍອດເງິນຂາດດຸນ</span>
                      <span
                        className={`num ${
                          variance === null
                            ? 'text-muted'
                            : variance === 0
                              ? 'text-success'
                              : 'font-semibold text-danger'
                        }`}
                      >
                        {row.variance === null ? '—' : formatByCurrency(row.variance, row.currency)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
