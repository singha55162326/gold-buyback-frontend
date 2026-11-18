'use client';

import { dec } from '@kpv/domain';
import { api } from '@/lib/api';
import type { PagedResult } from '@/components/date-range';
import {
  paymentPayload,
  validatePaymentRules,
  type PayCurrency,
  type PayMethod,
  type PaymentLine,
  type Rates,
} from '@/components/multi-payment';

export type CreditStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export interface CreditReceiptItem {
  id: string;
  method: PayMethod;
  bankAccountId?: string | null;
  currency: PayCurrency;
  rate: string;
  amount: string;
  amountLak: string;
  changeLak: string;
  isDownPayment: boolean;
  createdAt: string;
  bankAccount?: { nameLo: string } | null;
}

export interface CreditLineRow {
  id: string;
  goldItemId: string;
  cabinetId?: string | null;
  weightG: string;
  quantity: number;
  sellPrice: string;
  sortOrder: number;
  goldItem: { id?: string; nameLo: string };
  cabinet?: { id?: string; nameLo: string } | null;
}

export interface CreditRow {
  id: string;
  code: string;
  shiftId?: string;
  goldItemId?: string;
  cabinetId?: string | null;
  weightG: string;
  quantity: number;
  sellPrice: string;
  downPayment: string;
  outstanding: string;
  paidAmount?: string;
  status: CreditStatus;
  rejectReason?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  settledAt?: string | null;
  createdById?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
  customer: { phone: string };
  goldItem: { id?: string; nameLo: string };
  cabinet?: { id?: string; nameLo: string } | null;
  lines?: CreditLineRow[];
  receipts?: CreditReceiptItem[];
}

export interface CreditAuditItem {
  id: string;
  action: string;
  summary: string | null;
  createdAt: string;
  actor?: { fullName: string } | null;
}

export interface CreditDetail extends CreditRow {
  audits?: CreditAuditItem[];
}

export interface CreditReceiptPayload {
  method: PayMethod;
  bankAccountId?: string;
  currency: PayCurrency;
  amount: string;
}

export interface CreditLinePayload {
  goldItemId: string;
  cabinetId: string;
  weightG: string;
  quantity: number;
  sellPrice: string;
}

export interface CreateCreditInput {
  phone: string;
  lines: CreditLinePayload[];
  downPayment: string;
  receipts: CreditReceiptPayload[];
}

export type UpdateCreditInput = Partial<CreateCreditInput>;

export interface ListCreditParams {
  status?: CreditStatus;
  search?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
  all?: boolean;
}

export interface ReviewCreditInput {
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
}

export const CREDIT_CHANGE_LIMITS: Partial<Record<PayCurrency, number>> = {
  THB: 1000,
  USD: 100,
};

export const creditKeys = {
  all: ['credit'] as const,
  list: (params?: ListCreditParams) => ['credit', 'list', params ?? {}] as const,
  detail: (id: string | undefined) => ['credit', 'detail', id] as const,
};

function buildListQuery(params?: ListCreditParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  if (params.all) search.set('all', 'true');
  if (params.status) search.set('status', params.status);
  if (params.search?.trim()) search.set('search', params.search.trim());
  if (params.from_date) search.set('from_date', params.from_date);
  if (params.to_date) search.set('to_date', params.to_date);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.page_size !== undefined) search.set('page_size', String(params.page_size));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const creditApi = {
  list: (params?: ListCreditParams) =>
    api.get<PagedResult<CreditRow>>(`/credit${buildListQuery(params)}`),
  getOne: (id: string) => api.get<CreditDetail>(`/credit/${id}`),
  create: (body: CreateCreditInput) => api.post<CreditRow>('/credit', body),
  update: (id: string, body: UpdateCreditInput) => api.patch<CreditRow>(`/credit/${id}`, body),
  review: (id: string, body: ReviewCreditInput) =>
    api.post<CreditRow>(`/credit/${id}/review`, {
      decision: body.decision,
      reason: body.reason?.trim() || undefined,
    }),
  cancel: (id: string, reason?: string) =>
    api.post<CreditRow>(`/credit/${id}/cancel`, { reason: reason?.trim() || undefined }),
  remove: (id: string) => api.delete<{ id: string; deleted: boolean }>(`/credit/${id}`),
  addReceipt: (id: string, receipts: CreditReceiptPayload[]) =>
    api.post<CreditRow>(`/credit/${id}/receipts`, { receipts }),
};

/** ແປງ Decimal string ຈາກ API ໃຫ້ສະອາດສຳລັບຟອມ (ບໍ່ຜ່ານ Number ຈຶ່ງບໍ່ເສຍຄວາມແມ່ນຍຳ). */
export function toCleanDecimalInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  try {
    return dec(String(value).replace(/,/g, '').trim()).toFixed();
  } catch {
    return '';
  }
}

function sellRateFor(currency: PayCurrency, rates: Rates | null | undefined): number {
  if (currency === 'LAK') return 1;
  if (!rates) return 0;
  return currency === 'THB' ? Number(rates.thbSellRate ?? 0) : Number(rates.usdSellRate ?? 0);
}

function calcTotalLakDec(lines: PaymentLine[], rates: Rates | null | undefined): ReturnType<typeof dec> {
  const payload = paymentPayload(lines);
  let total = dec(0);
  for (const l of payload) {
    const amt = dec(l.amount);
    if (l.currency === 'LAK') {
      total = total.plus(amt);
    } else if (rates) {
      const r = sellRateFor(l.currency, rates);
      if (r > 0) total = total.plus(amt.mul(dec(r)));
    }
  }
  return total;
}

/**
 * ຄຳນວນສະຫຼຸບຍອດຮັບຕົວຈິງ (Total LAK, Change LAK, Remaining LAK) ດ້ວຍ Decimal precision.
 */
export function calcCreditReceiptSummary(
  lines: PaymentLine[],
  owedLakInput: string | number,
  rates: Rates | null | undefined,
): { totalLak: string; changeLak: string; appliedLak: string; remainingLak: string } {
  const total = calcTotalLakDec(lines, rates);
  const owed = dec(String(owedLakInput || '0').replace(/,/g, '').trim() || '0');
  const change = total.gt(owed) ? total.minus(owed) : dec(0);
  const applied = total.minus(change);
  const remaining = owed.gt(applied) ? owed.minus(applied) : dec(0);

  return {
    totalLak: total.toFixed(0),
    changeLak: change.toFixed(0),
    appliedLak: applied.toFixed(0),
    remainingLak: remaining.toFixed(0),
  };
}

/**
 * ກວດສອບລາຍການຮັບເງິນ (ເງິນວາງດາວ / ຄ່າງວດ) ໃຫ້ກົງກັບ TOR §5.3 ແລະ Backend `CreditService`:
 *  - ຖ້າໂອນ (BANK) ຕ້ອງເລືອກທະນາຄານ
 *  - ຖ້າໃຊ້ THB/USD ຕ້ອງມີອັດຕາແລກປ່ຽນ Sell Rate ທີ່ຖືກຕ້ອງ
 *  - ຖ້າຍອດຕ້ອງຮັບ = 0 ຫ້າມປ້ອນລາຍການຮັບເງິນ
 *  - ຍອດລວມ LAK ຕ້ອງ >= ຍອດທີ່ຕ້ອງຮັບ (ເມື່ອ requireCoverOwed = true)
 *  - ຫ້າມ LAK ເກີນຍອດ ແລະ ເງິນທອນຈາກ THB ≤ 1,000 THB, USD ≤ 100 USD
 */
export function validateCreditReceipts(
  lines: PaymentLine[],
  owedLak: number | string,
  rates: Rates | null | undefined,
  options?: { allowEmptyWhenZero?: boolean; requireCoverOwed?: boolean },
): { ok: boolean; error: string | null } {
  const requireCoverOwed = options?.requireCoverOwed ?? true;
  const owedDec = dec(String(owedLak || '0').replace(/,/g, '').trim() || '0');
  const owedNum = owedDec.toNumber();
  const payload = paymentPayload(lines);

  const missingBank = lines.some((l) => {
    const cleaned = l.amount.replace(/,/g, '').trim();
    return l.method === 'BANK' && cleaned !== '' && Number(cleaned) > 0 && !l.bankAccountId;
  });
  if (missingBank) {
    return { ok: false, error: 'ກະລຸນາເລືອກທະນາຄານສຳລັບແຖວໂອນ' };
  }

  if (owedDec.eq(0)) {
    if (payload.length === 0 && options?.allowEmptyWhenZero) {
      return { ok: true, error: null };
    }
    if (payload.length > 0) {
      return { ok: false, error: 'ບໍ່ມີຍອດເງິນທີ່ຕ້ອງຮັບ — ກະລຸນາລຶບຈຳນວນເງິນຮັບອອກ' };
    }
    return { ok: false, error: null };
  }

  if (payload.length === 0) {
    return { ok: false, error: null };
  }

  const missingRate = payload.some((l) => l.currency !== 'LAK' && sellRateFor(l.currency, rates) <= 0);
  if (missingRate) {
    return { ok: false, error: 'ຍັງບໍ່ສາມາດໂຫຼດອັດຕາແລກປ່ຽນ Sell Rate ໄດ້ — ກະລຸນາລອງໃໝ່' };
  }

  const ruleError = validatePaymentRules(lines, owedNum, rates, 'in', {
    disallowLakOverpay: true,
    changeLimits: CREDIT_CHANGE_LIMITS,
  });
  if (ruleError) {
    return { ok: false, error: ruleError };
  }

  if (requireCoverOwed) {
    const total = calcTotalLakDec(lines, rates);
    if (total.lt(owedDec)) {
      return { ok: false, error: 'ຍອດຮັບລວມ (LAK) ຍັງບໍ່ຄົບຍອດເງິນວາງດາວ' };
    }
  }

  return { ok: true, error: null };
}
