'use client';

import { api } from '@/lib/api';
import {
  calcTotalLak,
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

export interface CreditRow {
  id: string;
  code: string;
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
  approvedAt?: string | null;
  settledAt?: string | null;
  createdById?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  customer: { phone: string };
  goldItem: { id?: string; nameLo: string };
  cabinet?: { id?: string; nameLo: string } | null;
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

export interface CreateCreditInput {
  phone: string;
  goldItemId: string;
  cabinetId?: string;
  weightG: string;
  quantity: number;
  sellPrice: string;
  downPayment: string;
  receipts: CreditReceiptPayload[];
}

export type UpdateCreditInput = Partial<CreateCreditInput>;

export const CREDIT_CHANGE_LIMITS: Partial<Record<PayCurrency, number>> = {
  THB: 1000,
  USD: 100,
};

export const creditKeys = {
  all: ['credit'] as const,
  detail: (id: string | undefined) => ['credit', 'detail', id] as const,
};

export const creditApi = {
  getOne: (id: string) => api.get<CreditDetail>(`/credit/${id}`),
  create: (body: CreateCreditInput) => api.post<CreditRow>('/credit', body),
  update: (id: string, body: UpdateCreditInput) => api.patch<CreditRow>(`/credit/${id}`, body),
  cancel: (id: string, reason?: string) =>
    api.post<CreditRow>(`/credit/${id}/cancel`, { reason: reason?.trim() || undefined }),
  remove: (id: string) => api.delete<{ id: string; deleted: boolean }>(`/credit/${id}`),
  addReceipt: (id: string, receipts: CreditReceiptPayload[]) =>
    api.post<CreditRow>(`/credit/${id}/receipts`, { receipts }),
};

/**
 * ກວດສອບລາຍການຮັບເງິນ (ເງິນວາງດາວ / ຄ່າງວດ) ໃຫ້ກົງກັບ TOR §5.3 ແລະ Backend `CreditService`:
 *  - ຖ້າໂອນ (BANK) ຕ້ອງເລືອກທະນາຄານ
 *  - ຍອດລວມ LAK ຕ້ອງ >= ຍອດທີ່ຕ້ອງຮັບ (ຫຼື ຍອມຮັບແຖວວ່າງເມື່ອຍອດ = 0)
 *  - ຫ້າມ LAK ເກີນຍອດ ແລະ ເງິນທອນຈາກ THB ≤ 1,000 THB, USD ≤ 100 USD
 */
export function validateCreditReceipts(
  lines: PaymentLine[],
  owedLak: number,
  rates: Rates | null | undefined,
  options?: { allowEmptyWhenZero?: boolean; requireCoverOwed?: boolean },
): { ok: boolean; error: string | null } {
  const requireCoverOwed = options?.requireCoverOwed ?? true;
  const payload = paymentPayload(lines);
  const missingBank = lines.some(
    (l) => l.method === 'BANK' && l.amount.replace(/,/g, '').trim() !== '' && Number(l.amount.replace(/,/g, '')) > 0 && !l.bankAccountId,
  );
  if (missingBank) {
    return { ok: false, error: 'ກະລຸນາເລືອກທະນາຄານສຳລັບແຖວໂອນ' };
  }

  if (payload.length === 0) {
    if (options?.allowEmptyWhenZero && owedLak === 0) {
      return { ok: true, error: null };
    }
    return { ok: false, error: null };
  }

  const ruleError = validatePaymentRules(lines, owedLak, rates, 'in', {
    disallowLakOverpay: true,
    changeLimits: CREDIT_CHANGE_LIMITS,
  });
  if (ruleError) {
    return { ok: false, error: ruleError };
  }

  if (requireCoverOwed) {
    const hasForeign = payload.some((l) => l.currency !== 'LAK');
    if (!hasForeign || rates) {
      const totalLak = calcTotalLak(lines, rates, 'in');
      if (totalLak + 0.0001 < owedLak) {
        return { ok: false, error: null };
      }
    }
  }

  return { ok: true, error: null };
}
