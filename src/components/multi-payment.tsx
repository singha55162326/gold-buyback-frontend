'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLak, formatByCurrency } from '@/lib/format';
import { NumberInput } from './number-input';

export type PayMethod = 'CASH' | 'BANK';
export type PayCurrency = 'LAK' | 'THB' | 'USD';

export interface PaymentLine {
  method: PayMethod;
  bankAccountId?: string;
  currency: PayCurrency;
  amount: string;
}

interface Bank {
  id: string;
  nameLo: string;
}

export interface CashBalance {
  currency: PayCurrency;
  balance: string;
}

export interface BankBalance {
  bankAccountId: string;
  currency: PayCurrency;
  actual: string;
  bankNameLo: string;
}

/** The shape /rates/current returns — the snapshot row itself. */
export interface Rates {
  thbSellRate: string;
  thbBuybackRate: string;
  usdSellRate: string;
  usdBuybackRate: string;
}

const CURRENCIES: PayCurrency[] = ['LAK', 'THB', 'USD'];

const blank = (): PaymentLine => ({ method: 'CASH', currency: 'LAK', amount: '' });

/** Strip the grouping commas staff type out of habit. */
const clean = (s: string | number | undefined | null) => String(s ?? '').replace(/,/g, '').trim();

/**
 * ກວດສອບວ່າລາຍການຈ່າຍເງິນອອກ (direction = 'out') ເກີນຍອດຄົງເຫຼືອໃນ Module Cash
 * ຫຼື Module Bank ຫຼືບໍ່ — ເພື່ອບລັອກປຸ່ມຢືນຢັນ ແລະ ແຈ້ງເຕືອນທັນທີກ່ອນຍິງ API.
 */
export function useInsufficientFundsError(
  lines: PaymentLine[],
  enabled = true,
  actionLabelLo = 'ຈ່າຍອອກ',
): string | null {
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
    enabled,
  });

  const { data: cashBalances = [] } = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<CashBalance[]>('/cash/balances'),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const { data: bankBalances = [] } = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  return useMemo(() => {
    if (!enabled) return null;

    const cashTotals: Record<string, number> = {};
    const bankTotals: Record<string, number> = {};

    for (const p of lines) {
      const amt = Number(clean(p.amount));
      if (Number.isFinite(amt) && amt > 0) {
        if (p.method === 'CASH') {
          cashTotals[p.currency] = (cashTotals[p.currency] ?? 0) + amt;
        } else if (p.method === 'BANK' && p.bankAccountId) {
          const key = `${p.bankAccountId}:${p.currency}`;
          bankTotals[key] = (bankTotals[key] ?? 0) + amt;
        }
      }
    }

    for (const [cur, total] of Object.entries(cashTotals)) {
      const cb = cashBalances.find((c) => c.currency === cur);
      const avail = Number(cb?.balance ?? 0);
      if (total > avail + 0.0001) {
        return `ເງິນສົດ ${cur} ໃນຮ້ານ (Module Cash) ບໍ່ພໍສຳລັບ${actionLabelLo} (ມີເຫຼືອ ${formatByCurrency(avail, cur)} ${cur}, ຕ້ອງການຈ່າຍ ${formatByCurrency(total, cur)} ${cur})`;
      }
    }

    for (const [key, total] of Object.entries(bankTotals)) {
      const [bankAccountId, cur] = key.split(':');
      const bb = bankBalances.find((b) => b.bankAccountId === bankAccountId && b.currency === cur);
      const avail = Number(bb?.actual ?? 0);
      const bankName =
        bb?.bankNameLo ?? banks.find((b) => b.id === bankAccountId)?.nameLo ?? 'ທະນາຄານ';
      if (total > avail + 0.0001) {
        return `ຍອດເງິນ ${cur} ໃນບັນຊີ ${bankName} (Module Bank) ບໍ່ພໍສຳລັບ${actionLabelLo} (ມີເຫຼືອ ${formatByCurrency(avail, cur)} ${cur}, ຕ້ອງການຈ່າຍ ${formatByCurrency(total, cur)} ${cur})`;
      }
    }

    return null;
  }, [enabled, lines, cashBalances, bankBalances, banks, actionLabelLo]);
}

/** Convert payment lines to LAK equivalent based on direction rates. */
export function calcTotalLak(
  lines: PaymentLine[],
  rates?: Rates | null,
  direction: 'in' | 'out' = 'in',
): number {
  return lines.reduce((sum, l) => {
    const n = Number(clean(l.amount));
    if (!Number.isFinite(n) || n <= 0) return sum;
    if (l.currency === 'LAK') return sum + n;
    if (!rates) return sum;
    const key = `${l.currency.toLowerCase()}${direction === 'in' ? 'Sell' : 'Buyback'}Rate` as keyof Rates;
    const rate = Number(rates[key] ?? 0);
    return sum + n * rate;
  }, 0);
}

/**
 * ຈ່າຍ / ຮັບ ທັງເງິນສົດ ແລະ ໂອນ, ຫຼາຍສະກຸນເງິນ ໃນ 1 ທຸລະກຳ.
 *
 * Every leg carries its own method, currency and bank, and is converted at
 * the rate that applies to the direction of the money: `sell` when the shop
 * is taking money in, `buyback` when it is paying out. The server re-reads
 * those rates and recomputes the total — what is shown here is a preview, so
 * a stale rate in a long-open tab cannot change what is booked.
 */
export function MultiPayment({
  lines,
  onChange,
  owedLak,
  owedAmount,
  owedCurrency,
  direction = 'in',
  labelLo = 'ການຈ່າຍເງິນ',
  fixedCurrency,
  hideEquivalent,
  preventOverpay,
  hideInsufficientNotice,
  onlyCashBalanceGuide,
}: {
  lines: PaymentLine[];
  onChange: (lines: PaymentLine[]) => void;
  /** What the transaction comes to, in LAK. */
  owedLak?: string | number;
  /** What the transaction comes to in the target currency (e.g. USD, THB, LAK). */
  owedAmount?: string | number;
  /** Currency of owedAmount. Defaults to fixedCurrency or 'LAK'. */
  owedCurrency?: PayCurrency;
  /** `in` = the shop receives; `out` = the shop pays out. */
  direction?: 'in' | 'out';
  labelLo?: string;
  /** When set, all legs are locked to this currency and cannot be changed individually. */
  fixedCurrency?: PayCurrency;
  /** When set, hides "ລວມທຽບເທົ່າ ... LAK" and individual conversion rates. */
  hideEquivalent?: boolean;
  /** When true, caps/prevents entering an amount that exceeds the remaining amount owed. */
  preventOverpay?: boolean;
  /** When true, hides the built-in insufficient funds notice (e.g. when the parent renders its own). */
  hideInsufficientNotice?: boolean;
  /** When true, the balance guide under amount only shows for cash (ເງິນສົດຄົງເຫຼືອ), hiding bank balance guide. */
  onlyCashBalanceGuide?: boolean;
}) {
  const { data: banks = [] } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
  });

  const { data: rates } = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
    retry: false,
  });

  const isOut = direction === 'out';

  const { data: cashBalances = [] } = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<CashBalance[]>('/cash/balances'),
    enabled: isOut,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const { data: bankBalances = [] } = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
    enabled: isOut,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const insufficientFundsError = useInsufficientFundsError(lines, isOut);

  const getAvailableForLine = (line: PaymentLine): number | null => {
    if (!isOut) return null;
    if (line.method === 'CASH') {
      const cb = cashBalances.find((c) => c.currency === line.currency);
      return Number(cb?.balance ?? 0);
    }
    if (line.method === 'BANK') {
      if (!line.bankAccountId) return null;
      const bb = bankBalances.find(
        (b) => b.bankAccountId === line.bankAccountId && b.currency === line.currency,
      );
      return Number(bb?.actual ?? 0);
    }
    return null;
  };

  const rateFor = (currency: PayCurrency): number => {
    if (currency === 'LAK') return 1;
    if (!rates) return 0;
    const key = `${currency.toLowerCase()}${direction === 'in' ? 'Sell' : 'Buyback'}Rate` as keyof Rates;
    return Number(rates[key] ?? 0);
  };

  const totalLak = useMemo(() => calcTotalLak(lines, rates, direction), [lines, rates, direction]);

  const targetCurrency: PayCurrency = owedCurrency ?? fixedCurrency ?? 'LAK';
  const isForeign = targetCurrency !== 'LAK';

  const totalInTargetCurrency = useMemo(() => {
    if (!isForeign) return totalLak;
    return lines.reduce((sum, l) => {
      const n = Number(clean(l.amount));
      if (!Number.isFinite(n) || n <= 0) return sum;
      if (l.currency === targetCurrency) return sum + n;
      const rate = rateFor(l.currency);
      const targetRate = rateFor(targetCurrency);
      if (targetRate > 0) {
        return sum + (n * rate) / targetRate;
      }
      return sum;
    }, 0);
  }, [isForeign, targetCurrency, totalLak, lines, rates, direction]);

  const hasOwed = owedAmount !== undefined || owedLak !== undefined;
  const numOwed = useMemo(() => {
    if (owedAmount !== undefined) {
      return Number(clean(owedAmount)) || 0;
    }
    if (owedLak !== undefined) {
      if (!isForeign) return Number(clean(owedLak)) || 0;
      const targetRate = rateFor(targetCurrency);
      return targetRate > 0 ? (Number(clean(owedLak)) || 0) / targetRate : 0;
    }
    return 0;
  }, [owedAmount, owedLak, isForeign, targetCurrency, rates, direction]);

  const remaining = numOwed - totalInTargetCurrency;
  const roundedRemaining = isForeign ? Math.round(remaining * 100) / 100 : Math.round(remaining);

  const shouldPreventOverpay = preventOverpay ?? (direction === 'out' && hasOwed);

  const getOtherLinesTotalInTarget = (excludeIndex: number) => {
    return lines.reduce((sum, l, idx) => {
      if (idx === excludeIndex) return sum;
      const n = Number(clean(l.amount));
      if (!Number.isFinite(n) || n <= 0) return sum;
      if (l.currency === targetCurrency) return sum + n;
      const r = rateFor(l.currency);
      const tr = rateFor(targetCurrency);
      return tr > 0 ? sum + (n * r) / tr : sum;
    }, 0);
  };

  const getMaxForLine = (lineIndex: number, lineCurrency: PayCurrency) => {
    if (!hasOwed || numOwed <= 0) return Infinity;
    const otherTotal = getOtherLinesTotalInTarget(lineIndex);
    const remInTarget = Math.max(0, numOwed - otherTotal);
    let maxVal = remInTarget;
    if (lineCurrency !== targetCurrency) {
      const lr = rateFor(lineCurrency);
      const tr = rateFor(targetCurrency);
      maxVal = lr > 0 && tr > 0 ? (remInTarget * tr) / lr : remInTarget;
    }
    return lineCurrency === 'LAK' ? Math.floor(maxVal) : Math.floor(maxVal * 100) / 100;
  };

  const handleAmountChange = (i: number, v: string) => {
    const rawClean = clean(v);
    if (shouldPreventOverpay && hasOwed && numOwed > 0 && rawClean !== '') {
      const n = Number(rawClean);
      const curr = lines[i].currency;
      const maxVal = getMaxForLine(i, curr);

      if (Number.isFinite(n) && n > maxVal) {
        const capped = curr === 'LAK' ? String(maxVal) : String(Math.round(maxVal * 100) / 100);
        set(i, { amount: capped });
        return;
      }
    }
    set(i, { amount: v });
  };

  const set = (i: number, patch: Partial<PaymentLine>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="label mb-0">{labelLo}</span>
        <button type="button" className="btn-secondary" onClick={() => onChange([...lines, { method: 'CASH', currency: fixedCurrency ?? 'LAK', amount: '' }])}>
          + ເພີ່ມແຖວ
        </button>
      </div>

      <div className="space-y-2">
        {lines.map((line, i) => {
          const rate = rateFor(line.currency);
          const lineAmtNum = Number(clean(line.amount)) || 0;
          const lak = lineAmtNum * rate;
          const maxVal = getMaxForLine(i, line.currency);
          const availBal = getAvailableForLine(line);
          const lineExceedsAvail = availBal !== null && lineAmtNum > availBal + 0.0001;
          return (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="label" htmlFor={`pay-method-${i}`}>ວິທີ</label>
                <select
                  id={`pay-method-${i}`}
                  className="input"
                  value={line.method}
                  onChange={(e) =>
                    set(i, {
                      method: e.target.value as PayMethod,
                      // A cash leg has no bank; clearing it stops a stale id
                      // travelling with the request.
                      bankAccountId: e.target.value === 'CASH' ? undefined : line.bankAccountId,
                    })
                  }
                >
                  <option value="CASH">ເງິນສົດ</option>
                  <option value="BANK">ໂອນ</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="label" htmlFor={`pay-bank-${i}`}>ທະນາຄານ</label>
                <select
                  id={`pay-bank-${i}`}
                  className="input"
                  value={line.bankAccountId ?? ''}
                  disabled={line.method !== 'BANK'}
                  onChange={(e) => set(i, { bankAccountId: e.target.value || undefined })}
                >
                  <option value="">{line.method === 'BANK' ? '— ເລືອກ —' : '—'}</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameLo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="label" htmlFor={`pay-cur-${i}`}>ສະກຸນ</label>
                {fixedCurrency ? (
                  <div className="input flex items-center justify-center font-bold bg-recessed text-fg select-none h-10">
                    {fixedCurrency}
                  </div>
                ) : (
                  <select
                    id={`pay-cur-${i}`}
                    className="input"
                    value={line.currency}
                    onChange={(e) => set(i, { currency: e.target.value as PayCurrency })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="sm:col-span-3">
                <div className="flex items-center justify-between">
                  <label className="label mb-0" htmlFor={`pay-amt-${i}`}>ຈຳນວນ</label>
                  {shouldPreventOverpay && hasOwed && Number.isFinite(maxVal) && maxVal > 0 && Number(clean(line.amount)) !== maxVal && (
                    <button
                      type="button"
                      className="text-xs text-[var(--gold)] hover:underline"
                      onClick={() => handleAmountChange(i, String(maxVal))}
                    >
                      ໃສ່ທັງໝົດ ({formatByCurrency(maxVal, line.currency)})
                    </button>
                  )}
                </div>
                {/* ຕົວຂັ້ນຫຼັກພັນ ແລະ ຈຸດທົດສະນິຍົມຕາມສະກຸນເງິນ: ກີບບໍ່ມີອັດຕາ
                    ຍ່ອຍ, ສ່ວນ THB/USD ມີ 2 ຕຳແໜ່ງ. */}
                <NumberInput
                  id={`pay-amt-${i}`}
                  className="input num"
                  decimals={line.currency === 'LAK' ? 0 : 2}
                  placeholder="0"
                  value={line.amount}
                  onValueChange={(v) => handleAmountChange(i, v)}
                />
                {shouldPreventOverpay && hasOwed && Number.isFinite(maxVal) && maxVal > 0 && (
                  <div className="num mt-1 text-xs text-muted">
                    ສູງສຸດ: {formatByCurrency(maxVal, line.currency)} {line.currency}
                  </div>
                )}
                {isOut && availBal !== null && (!onlyCashBalanceGuide || line.method === 'CASH') && (
                  <div className={`num mt-1 text-xs ${lineExceedsAvail ? 'text-danger font-medium' : 'text-muted'}`}>
                    {line.method === 'CASH' ? 'ເງິນສົດຄົງເຫຼືອ' : 'ບັນຊີຄົງເຫຼືອ'}: {formatByCurrency(availBal, line.currency)} {line.currency}
                  </div>
                )}
                {!hideEquivalent && !fixedCurrency && line.currency !== 'LAK' && lineAmtNum > 0 && (
                  <div className="num mt-1 text-xs text-muted">
                    {rate > 0 ? `× ${formatLak(rate)} = ${formatLak(lak)} LAK` : 'ຍັງບໍ່ມີອັດຕາແລກປ່ຽນ'}
                  </div>
                )}
              </div>

              <div className="sm:col-span-1">
                <button
                  type="button"
                  className="btn-ghost text-danger"
                  aria-label="ລຶບແຖວ"
                  disabled={lines.length <= 1}
                  onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {insufficientFundsError && !hideInsufficientNotice && (
        <div role="alert" className="notice status-danger text-xs">
          {insufficientFundsError}
        </div>
      )}

      {hasOwed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <div>
            {!hideEquivalent && !isForeign && !fixedCurrency && (
              <span className="text-muted">
                ລວມທຽບເທົ່າ <span className="num font-medium text-fg">{formatLak(totalLak)} LAK</span>
              </span>
            )}
            {lines.length > 1 && (isForeign || fixedCurrency) && (
              <span className="text-muted">
                ລວມ:{' '}
                <strong className="num font-medium text-fg">
                  {formatByCurrency(totalInTargetCurrency, targetCurrency)} {targetCurrency}
                </strong>
              </span>
            )}
          </div>
          <span
            className={
              roundedRemaining > 0.0001
                ? 'text-danger'
                : roundedRemaining < -0.0001
                ? direction === 'out'
                  ? 'text-danger'
                  : 'text-success'
                : 'text-success'
            }
          >
            {roundedRemaining > 0.0001
              ? 'ຍັງຂາດ'
              : roundedRemaining < -0.0001
              ? direction === 'out'
                ? 'ເກີນຍອດຮັບ'
                : 'ເງິນທອນ'
              : 'ຄົບຖ້ວນ'}{' '}
            <span className="num font-medium">
              {formatByCurrency(Math.abs(roundedRemaining), targetCurrency)} {targetCurrency}
            </span>
          </span>
        </div>
      ) : !hideEquivalent && !fixedCurrency ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
          <span className="text-muted">
            ລວມທຽບເທົ່າ <span className="num font-medium text-fg">{formatLak(totalLak)} LAK</span>
          </span>
        </div>
      ) : lines.length > 1 && fixedCurrency ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-2 text-xs text-muted">
          <span>
            ລວມມັດຈໍາ:{' '}
            <strong className="num text-success font-medium">
              {formatByCurrency(
                lines.reduce((s, l) => s + (Number(clean(l.amount)) || 0), 0),
                fixedCurrency,
              )}{' '}
              {fixedCurrency}
            </strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** A fresh one-leg list, for a form's initial state. */
export function newPaymentLines(currency: PayCurrency = 'LAK'): PaymentLine[] {
  return [{ method: 'CASH', currency, amount: '' }];
}

/** Strip the display formatting before the lines go to the API. */
export function paymentPayload(lines: PaymentLine[]) {
  return lines
    .filter((l) => clean(l.amount) !== '' && Number(clean(l.amount)) > 0)
    .map((l) => ({
      method: l.method,
      ...(l.method === 'BANK' && l.bankAccountId ? { bankAccountId: l.bankAccountId } : {}),
      currency: l.currency,
      amount: clean(l.amount),
    }));
}
