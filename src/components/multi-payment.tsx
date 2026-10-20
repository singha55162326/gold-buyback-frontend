'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLak } from '@/lib/format';

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

/** The shape /rates/current returns — the snapshot row itself. */
interface Rates {
  thbSellRate: string;
  thbBuybackRate: string;
  usdSellRate: string;
  usdBuybackRate: string;
}

const CURRENCIES: PayCurrency[] = ['LAK', 'THB', 'USD'];

const blank = (): PaymentLine => ({ method: 'CASH', currency: 'LAK', amount: '' });

/** Strip the grouping commas staff type out of habit. */
const clean = (s: string) => s.replace(/,/g, '').trim();

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
  direction = 'in',
  labelLo = 'ການຈ່າຍເງິນ',
}: {
  lines: PaymentLine[];
  onChange: (lines: PaymentLine[]) => void;
  /** What the transaction comes to, in LAK. */
  owedLak?: string | number;
  /** `in` = the shop receives; `out` = the shop pays out. */
  direction?: 'in' | 'out';
  labelLo?: string;
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

  const rateFor = (currency: PayCurrency): number => {
    if (currency === 'LAK') return 1;
    if (!rates) return 0;
    const key = `${currency.toLowerCase()}${direction === 'in' ? 'Sell' : 'Buyback'}Rate` as keyof Rates;
    return Number(rates[key] ?? 0);
  };

  const totalLak = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const n = Number(clean(l.amount));
        return Number.isFinite(n) ? sum + n * rateFor(l.currency) : sum;
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, rates, direction],
  );

  const owed = Number(owedLak ?? 0);
  const remaining = owed - totalLak;

  const set = (i: number, patch: Partial<PaymentLine>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="label mb-0">{labelLo}</span>
        <button type="button" className="btn-secondary" onClick={() => onChange([...lines, blank()])}>
          + ເພີ່ມແຖວ
        </button>
      </div>

      <div className="space-y-2">
        {lines.map((line, i) => {
          const rate = rateFor(line.currency);
          const lak = Number(clean(line.amount)) * rate;
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
              </div>

              <div className="sm:col-span-3">
                <label className="label" htmlFor={`pay-amt-${i}`}>ຈຳນວນ</label>
                <input
                  id={`pay-amt-${i}`}
                  className="input num"
                  inputMode="decimal"
                  placeholder="0"
                  value={line.amount}
                  onChange={(e) => set(i, { amount: e.target.value })}
                />
                {line.currency !== 'LAK' && (
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
        <span className="text-muted">
          ລວມທຽບເທົ່າ <span className="num font-medium text-fg">{formatLak(totalLak)} LAK</span>
        </span>
        {owedLak !== undefined && (
          <span className={remaining > 0 ? 'text-danger' : 'text-success'}>
            {remaining > 0 ? 'ຍັງຂາດ' : 'ເງິນທອນ'}{' '}
            <span className="num font-medium">{formatLak(Math.abs(remaining))} LAK</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** A fresh one-leg list, for a form's initial state. */
export function newPaymentLines(): PaymentLine[] {
  return [blank()];
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
