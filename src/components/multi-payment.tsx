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
  compact,
  headerSlot,
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
  /** 2-row card layout for narrow columns (e.g. split modal right pane). */
  compact?: boolean;
  /** Optional custom left header node (used with compact split layout). */
  headerSlot?: React.ReactNode;
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

  const strictPreventOverpay = preventOverpay === true;
  const shouldCapCurrency = (curr: PayCurrency) => {
    if (preventOverpay === false) return false;
    if (strictPreventOverpay) return true;
    // Buyback/Exchange (`direction="out"`): `LAK` ຫ້າມເກີນ TOTAL(LAK), ສ່ວນ `THB/USD` ຈ່າຍເກີນເພື່ອທອນເປັນ LAK ໄດ້.
    if (direction === 'out' && hasOwed) {
      return fixedCurrency ? true : curr === 'LAK';
    }
    return false;
  };
  const showMaxFillForOut =
    (strictPreventOverpay || (direction === 'out' && preventOverpay !== false)) && hasOwed;

  const lakLegsTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        if (l.currency !== 'LAK') return sum;
        const n = Number(clean(l.amount));
        return Number.isFinite(n) && n > 0 ? sum + n : sum;
      }, 0),
    [lines],
  );
  const foreignLegsTotalLak = totalLak - lakLegsTotal;
  const hasForeignLeg = lines.some(
    (l) => l.currency !== 'LAK' && Number(clean(l.amount)) > 0,
  );
  const isInvalidLakOverpay =
    direction === 'out' && hasOwed && !isForeign && lakLegsTotal > numOwed + 0.0001;
  const isInvalidMixedLak =
    direction === 'out' &&
    hasOwed &&
    !isForeign &&
    !strictPreventOverpay &&
    lakLegsTotal > 0 &&
    foreignLegsTotalLak >= numOwed - 0.0001;
  const isValidForeignChange =
    direction === 'out' &&
    hasOwed &&
    !strictPreventOverpay &&
    !fixedCurrency &&
    !isInvalidLakOverpay &&
    hasForeignLeg &&
    roundedRemaining < -0.0001;

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

  const getRawRemainingForLine = (lineIndex: number, lineCurrency: PayCurrency) => {
    if (!hasOwed || numOwed <= 0) return Infinity;
    const otherTotal = getOtherLinesTotalInTarget(lineIndex);
    const remInTarget = Math.max(0, numOwed - otherTotal);
    if (lineCurrency === targetCurrency) return remInTarget;
    const lr = rateFor(lineCurrency);
    const tr = rateFor(targetCurrency);
    if (lr <= 0 || tr <= 0) return Infinity;
    return (remInTarget * tr) / lr;
  };

  const getMaxForLine = (lineIndex: number, lineCurrency: PayCurrency) => {
    const maxVal = getRawRemainingForLine(lineIndex, lineCurrency);
    if (!Number.isFinite(maxVal)) return Infinity;
    return lineCurrency === 'LAK' ? Math.floor(maxVal) : Math.floor(maxVal * 100) / 100;
  };

  /** ຈຳນວນຕ່ຳສຸດທີ່ປ້ອນໃນແຖວນີ້ ເພື່ອໃຫ້ຍອດ "ຍັງຂາດ" ເປັນ 0 (ປັດຂຶ້ນຕາມຫຼັກທົດສະນິຍົມຂອງສະກຸນ). */
  const getExactZeroForLine = (lineIndex: number, lineCurrency: PayCurrency) => {
    const rawVal = getRawRemainingForLine(lineIndex, lineCurrency);
    if (!Number.isFinite(rawVal) || rawVal <= 0) return 0;
    return lineCurrency === 'LAK'
      ? Math.ceil(rawVal - 1e-9)
      : Math.ceil(rawVal * 100 - 1e-9) / 100;
  };

  const handleAmountChange = (i: number, v: string) => {
    const rawClean = clean(v);
    const curr = lines[i].currency;
    if (shouldCapCurrency(curr) && hasOwed && numOwed > 0 && rawClean !== '') {
      const n = Number(rawClean);
      const maxVal = getMaxForLine(i, curr);

      if (Number.isFinite(n) && n > maxVal) {
        const capped = curr === 'LAK' ? String(maxVal) : String(Math.round(maxVal * 100) / 100);
        set(i, { amount: capped });
        return;
      }
    }
    set(i, { amount: v });
  };

  const handleCurrencyChange = (i: number, nextCurrency: PayCurrency) => {
    const rawClean = clean(lines[i].amount);
    if (shouldCapCurrency(nextCurrency) && hasOwed && numOwed > 0 && rawClean !== '') {
      const n = Number(rawClean);
      const maxVal = getMaxForLine(i, nextCurrency);
      if (Number.isFinite(n) && n > maxVal) {
        const capped =
          nextCurrency === 'LAK' ? String(maxVal) : String(Math.round(maxVal * 100) / 100);
        set(i, { currency: nextCurrency, amount: capped });
        return;
      }
    }
    set(i, { currency: nextCurrency });
  };

  const set = (i: number, patch: Partial<PaymentLine>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {headerSlot ?? <span className="label mb-0">{labelLo}</span>}
        <button
          type="button"
          className={`btn-secondary cursor-pointer ${compact ? 'h-8 min-h-[32px] px-2.5 text-xs' : ''}`}
          onClick={() => onChange([...lines, { method: 'CASH', currency: fixedCurrency ?? 'LAK', amount: '' }])}
        >
          {compact ? '+ ແຍກຊ່ອງທາງ' : '+ ເພີ່ມແຖວ'}
        </button>
      </div>

      <div className={compact ? 'space-y-2.5' : 'space-y-2'}>
        {lines.map((line, i) => {
          const rate = rateFor(line.currency);
          const lineAmtNum = Number(clean(line.amount)) || 0;
          const lak = lineAmtNum * rate;
          const maxVal = getMaxForLine(i, line.currency);
          const lineCapped = shouldCapCurrency(line.currency);
          const exactZeroVal = getExactZeroForLine(i, line.currency);
          const fillTargetVal = lineCapped ? maxVal : exactZeroVal;
          const amountPlaceholder =
            hasOwed && numOwed > 0 && Number.isFinite(fillTargetVal) && fillTargetVal > 0
              ? formatByCurrency(fillTargetVal, line.currency)
              : '0';
          const showForeignGuide =
            hasOwed &&
            numOwed > 0 &&
            !fixedCurrency &&
            line.currency !== 'LAK' &&
            rate > 0 &&
            Number.isFinite(fillTargetVal) &&
            fillTargetVal > 0;
          const availBal = getAvailableForLine(line);
          const lineExceedsAvail = availBal !== null && lineAmtNum > availBal + 0.0001;
          const canFillAll =
            showMaxFillForOut &&
            Number.isFinite(fillTargetVal) &&
            fillTargetVal > 0 &&
            Number(clean(line.amount)) !== fillTargetVal;

          if (compact) {
            return (
              <div key={i} className="recessed rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-5">
                    <select
                      id={`pay-method-${i}`}
                      aria-label={`ວິທີ ແຖວ ${i + 1}`}
                      className="input h-9 text-xs"
                      value={line.method}
                      onChange={(e) =>
                        set(i, {
                          method: e.target.value as PayMethod,
                          bankAccountId: e.target.value === 'CASH' ? undefined : line.bankAccountId,
                        })
                      }
                    >
                      <option value="CASH">ເງິນສົດ</option>
                      <option value="BANK">ໂອນທະນາຄານ</option>
                    </select>
                  </div>

                  <div className="col-span-5">
                    <select
                      id={`pay-bank-${i}`}
                      aria-label={`ທະນາຄານ ແຖວ ${i + 1}`}
                      className="input h-9 text-xs"
                      value={line.bankAccountId ?? ''}
                      disabled={line.method !== 'BANK'}
                      onChange={(e) => set(i, { bankAccountId: e.target.value || undefined })}
                    >
                      <option value="">{line.method === 'BANK' ? '— ເລືອກທະນາຄານ —' : '— ບໍ່ຕ້ອງເລືອກ —'}</option>
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nameLo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <button
                      type="button"
                      className="btn-ghost h-9 min-h-[36px] w-full cursor-pointer px-0 text-xs text-danger"
                      aria-label="ລຶບແຖວ"
                      disabled={lines.length <= 1}
                      onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-4">
                    {fixedCurrency ? (
                      <div className="input flex h-9 items-center justify-center bg-recessed text-xs font-bold text-fg select-none">
                        {fixedCurrency}
                      </div>
                    ) : (
                      <select
                        id={`pay-cur-${i}`}
                        aria-label={`ສະກຸນ ແຖວ ${i + 1}`}
                        className="input h-9 text-xs font-semibold"
                        value={line.currency}
                        onChange={(e) => handleCurrencyChange(i, e.target.value as PayCurrency)}
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="relative col-span-8">
                    <NumberInput
                      id={`pay-amt-${i}`}
                      aria-label={`ຈຳນວນ ແຖວ ${i + 1}`}
                      className={`input h-9 num font-semibold ${canFillAll ? 'pr-16' : ''}`}
                      decimals={line.currency === 'LAK' ? 0 : 2}
                      placeholder={amountPlaceholder}
                      value={line.amount}
                      onValueChange={(v) => handleAmountChange(i, v)}
                    />
                    {canFillAll && (
                      <button
                        type="button"
                        onClick={() => handleAmountChange(i, String(fillTargetVal))}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-md border border-transparent bg-[var(--gold-tint)] px-2 py-1 text-[10px] font-semibold text-gold hover:border-[var(--border-hover)]"
                      >
                        ເຕັມຍອດ
                      </button>
                    )}
                  </div>
                </div>

                {(showForeignGuide ||
                  (isOut && availBal !== null && (!onlyCashBalanceGuide || line.method === 'CASH')) ||
                  (!hideEquivalent && !fixedCurrency && line.currency !== 'LAK' && lineAmtNum > 0)) && (
                  <div className="space-y-0.5 text-[11px]">
                    {showForeignGuide && (
                      <div className="flex items-center justify-between gap-2 text-gold">
                        <span>ໃຫ້ຍອດຂາດເປັນ 0</span>
                        <span className="num font-semibold">
                          ≈ {formatByCurrency(fillTargetVal, line.currency)} {line.currency}
                        </span>
                      </div>
                    )}
                    {((isOut && availBal !== null && (!onlyCashBalanceGuide || line.method === 'CASH')) ||
                      (!hideEquivalent && !fixedCurrency && line.currency !== 'LAK' && lineAmtNum > 0)) && (
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                        {isOut && availBal !== null && (!onlyCashBalanceGuide || line.method === 'CASH') ? (
                          <span className={`num ${lineExceedsAvail ? 'font-medium text-danger' : 'text-muted'}`}>
                            {line.method === 'CASH' ? 'ສົດຄົງເຫຼືອ' : 'ບັນຊີຄົງເຫຼືອ'}: {formatByCurrency(availBal, line.currency)} {line.currency}
                          </span>
                        ) : <span />}
                        {!hideEquivalent && !fixedCurrency && line.currency !== 'LAK' && lineAmtNum > 0 && (
                          <span className="num text-muted">
                            {rate > 0 ? `× ${formatLak(rate)} = ${formatLak(lak)} LAK` : 'ຍັງບໍ່ມີອັດຕາແລກປ່ຽນ'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }

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
                    onChange={(e) => handleCurrencyChange(i, e.target.value as PayCurrency)}
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
                  {canFillAll && (
                    <button
                      type="button"
                      className="text-xs text-[var(--gold)] hover:underline"
                      onClick={() => handleAmountChange(i, String(fillTargetVal))}
                    >
                      ໃສ່ທັງໝົດ ({formatByCurrency(fillTargetVal, line.currency)})
                    </button>
                  )}
                </div>
                {/* ຕົວຂັ້ນຫຼັກພັນ ແລະ ຈຸດທົດສະນິຍົມຕາມສະກຸນເງິນ: ກີບບໍ່ມີອັດຕາ
                    ຍ່ອຍ, ສ່ວນ THB/USD ມີ 2 ຕຳແໜ່ງ. */}
                <NumberInput
                  id={`pay-amt-${i}`}
                  className="input num"
                  decimals={line.currency === 'LAK' ? 0 : 2}
                  placeholder={amountPlaceholder}
                  value={line.amount}
                  onValueChange={(v) => handleAmountChange(i, v)}
                />
                {showForeignGuide && (
                  <div className="num mt-1 text-xs text-gold">
                    ໃຫ້ຍອດຂາດເປັນ 0 ≈ {formatByCurrency(fillTargetVal, line.currency)} {line.currency}
                  </div>
                )}
                {lineCapped && hasOwed && Number.isFinite(maxVal) && maxVal > 0 && (
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

      {(isInvalidLakOverpay || isInvalidMixedLak) && (
        <div role="alert" className="notice status-danger text-xs">
          {isInvalidLakOverpay
            ? `ຈຳນວນເງິນ LAK (${formatLak(lakLegsTotal)}) ຕ້ອງບໍ່ເກີນລວມເງິນທີ່ຕ້ອງຈ່າຍ (${formatLak(numOwed)} LAK)`
            : 'ຍອດສະກຸນເງິນຕ່າງປະເທດຄົບຍອດແລ້ວ — ບໍ່ຄວນຈ່າຍ LAK ເພີ່ມ'}
        </div>
      )}

      {hasOwed ? (
        compact ? (
          <div className="recessed flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs">
            <div>
              <span className="block text-[11px] text-muted">
                {isForeign || fixedCurrency ? `ຍອດລວມ (${targetCurrency})` : 'ຍອດຈ່າຍລວມ (LAK)'}
              </span>
              <span className="num text-sm font-semibold text-fg-strong">
                {isForeign || fixedCurrency
                  ? `${formatByCurrency(totalInTargetCurrency, targetCurrency)} ${targetCurrency}`
                  : `${formatLak(totalLak)} LAK`}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-[11px] text-muted">
                {isValidForeignChange ? 'CHANGE (LAK ONLY)' : 'ສະຖານະຍອດ'}
              </span>
              <span
                className={`num text-sm font-semibold ${
                  roundedRemaining > 0.0001
                    ? 'text-danger'
                    : roundedRemaining < -0.0001
                    ? direction === 'out'
                      ? isValidForeignChange
                        ? 'text-success'
                        : 'text-danger'
                      : 'text-success'
                    : 'text-success'
                }`}
              >
                {roundedRemaining > 0.0001
                  ? 'ຍັງຂາດ'
                  : roundedRemaining < -0.0001
                  ? direction === 'out'
                    ? isValidForeignChange
                      ? 'ເງິນທອນ'
                      : 'ເກີນຍອດ'
                    : 'ເງິນທອນ'
                  : 'ຄົບຖ້ວນ'}{' '}
                {formatByCurrency(Math.abs(roundedRemaining), targetCurrency)} {targetCurrency}
              </span>
            </div>
          </div>
        ) : (
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
                  ? isValidForeignChange
                    ? 'text-success'
                    : 'text-danger'
                  : 'text-success'
                : 'text-success'
            }
          >
            {roundedRemaining > 0.0001
              ? 'ຍັງຂາດ'
              : roundedRemaining < -0.0001
              ? direction === 'out'
                ? isValidForeignChange
                  ? 'ເງິນທອນ (LAK ONLY)'
                  : 'ເກີນຍອດຮັບ'
                : 'ເງິນທອນ'
              : 'ຄົບຖ້ວນ'}{' '}
            <span className="num font-medium">
              {formatByCurrency(Math.abs(roundedRemaining), targetCurrency)} {targetCurrency}
            </span>
          </span>
        </div>
        )
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
