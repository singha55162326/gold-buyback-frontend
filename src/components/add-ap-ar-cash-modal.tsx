'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { isPositive } from '@/lib/validate';
import { formatByCurrency } from '@/lib/format';
import { Dialog } from './dialog';
import { NumberInput } from './number-input';
import { useToast } from './toast';

interface Partner {
  id: string;
  code?: string;
  nameLo: string;
}

interface Category {
  id: string;
  nameLo: string;
  side?: string | null;
}

interface Bank {
  id: string;
  nameLo: string;
  code?: string;
}

export interface AddApArCashModalProps {
  open: boolean;
  onClose: () => void;
  side: 'AP' | 'AR';
}

/**
 * Modal form for creating an AP Cash or AR Cash ledger entry (TOR §9.3 / §9.4).
 * Replaces the previous inline form with an accessible, focus-trapped dialog modal.
 */
export function AddApArCashModal({ open, onClose, side }: AddApArCashModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [partnerId, setPartnerId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: partners = [], isLoading: partnersLoading } = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
    enabled: open,
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['finance', 'ap-ar-categories', side],
    queryFn: () => api.get<Category[]>(`/finance/ap-ar/categories?side=${side}`),
    enabled: open,
  });

  const { data: banks = [], isLoading: banksLoading } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
    enabled: open,
  });

  const resetForm = () => {
    setPartnerId('');
    setCategoryId('');
    setCurrency('LAK');
    setAmount('');
    setMethod('CASH');
    setBankAccountId('');
    setNote('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const add = useMutation({
    mutationFn: () =>
      api.post(`/finance/ap-ar/${side}/entries`, {
        partnerId,
        categoryId,
        currency,
        amount: amount.replace(/,/g, '').trim(),
        method,
        bankAccountId: method === 'BANK' ? bankAccountId : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      const cleanAmt = Number(amount.replace(/,/g, '').trim());
      const formattedAmt = formatByCurrency(cleanAmt, currency);
      const partner = partners.find((p) => p.id === partnerId);
      toast.success(
        `ເພີ່ມລາຍການ ${side} (Cash) ສຳເລັດ`,
        `${formattedAmt} ${currency}${partner ? ` · ${partner.nameLo}` : ''}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['finance', 'ap-ar', side] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      handleClose();
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ');
    },
  });

  const isFormValid =
    Boolean(partnerId) &&
    Boolean(categoryId) &&
    isPositive(amount) &&
    (method === 'CASH' || Boolean(bankAccountId)) &&
    !add.isPending;

  const titleLo =
    side === 'AP'
      ? 'ເພີ່ມລາຍການ AP (Cash) — ໜີ້ຕ້ອງສົ່ງ'
      : 'ເພີ່ມລາຍການ AR (Cash) — ໜີ້ຕ້ອງຮັບ';

  const partnerLabel = side === 'AP' ? 'Supplier / ຄູ່ຄ້າ' : 'Supplier / ລູກຄ້າ';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="md"
      title={titleLo}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClose}
            disabled={add.isPending}
          >
            ຍົກເລີກ
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!isFormValid}
            onClick={() => add.mutate()}
          >
            {add.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isFormValid) add.mutate();
        }}
        className="space-y-4"
      >
        {error && (
          <div id="modal-apar-error" role="alert" className="notice status-danger text-sm">
            {error}
          </div>
        )}

        {/* Info banner explaining the side */}
        <div className="rounded-xl border border-line bg-recessed/60 p-3 text-xs flex items-center justify-between">
          <span className="text-muted">
            {side === 'AP'
              ? 'ບັນທຶກຍອດໜີ້ຄ້າງຈ່າຍເງິນສົດ (AP) ໃຫ້ກັບ Supplier / ຊ່າງ'
              : 'ບັນທຶກຍອດໜີ້ຄ້າງຮັບເງິນສົດ (AR) ຈາກ Supplier ຫຼື ລູກຄ້າ'}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ml-2 ${
              side === 'AP' ? 'status-danger' : 'status-success'
            }`}
          >
            {side} Cash
          </span>
        </div>

        {/* Partner selection */}
        <div>
          <label className="label" htmlFor="cash-modal-partner">
            {partnerLabel} <span className="text-danger">*</span>
          </label>
          <select
            id="cash-modal-partner"
            className="input w-full"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            disabled={partnersLoading || add.isPending}
            required
            autoFocus
          >
            <option value="">— ເລືອກ {partnerLabel} —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameLo}
              </option>
            ))}
          </select>
        </div>

        {/* Category selection */}
        <div>
          <label className="label" htmlFor="cash-modal-category">
            ປະເພດລາຍການ <span className="text-danger">*</span>
          </label>
          <select
            id="cash-modal-category"
            className="input w-full"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={categoriesLoading || add.isPending}
            required
          >
            <option value="">— ເລືອກປະເພດລາຍການ —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameLo}
              </option>
            ))}
          </select>
        </div>

        {/* Currency and Amount */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="label" htmlFor="cash-modal-currency">
              ສະກຸນເງິນ <span className="text-danger">*</span>
            </label>
            <select
              id="cash-modal-currency"
              className="input w-full font-medium"
              value={currency}
              onChange={(e) => {
                const next = e.target.value as 'LAK' | 'THB' | 'USD';
                setCurrency(next);
                if (next === 'LAK' && amount.includes('.')) {
                  setAmount(amount.split('.')[0]);
                }
              }}
              disabled={add.isPending}
            >
              <option value="LAK">LAK (₭)</option>
              <option value="THB">THB (฿)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="cash-modal-amount">
              ຈຳນວນເງິນ ({currency}) <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <NumberInput
                id="cash-modal-amount"
                className="input num w-full pr-14 text-right font-semibold"
                decimals={currency === 'LAK' ? 0 : 2}
                value={amount}
                placeholder={currency === 'LAK' ? '0' : '0.00'}
                onValueChange={setAmount}
                disabled={add.isPending}
                aria-describedby={error ? 'modal-apar-error' : undefined}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
                {currency}
              </span>
            </div>
            {isPositive(amount) && (
              <p className="mt-1 text-right text-xs text-[var(--gold)]">
                ຍອດລວມ: {formatByCurrency(Number(amount.replace(/,/g, '').trim()), currency)} {currency}
              </p>
            )}
          </div>
        </div>

        {/* Payment Method & Bank */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cash-modal-method">
              ຮູບແບບການຊຳລະ / ຮັບເງິນ
            </label>
            <select
              id="cash-modal-method"
              className="input w-full font-medium"
              value={method}
              onChange={(e) => {
                const next = e.target.value as 'CASH' | 'BANK';
                setMethod(next);
                if (next === 'CASH') setBankAccountId('');
              }}
              disabled={add.isPending}
            >
              <option value="CASH">ເງິນສົດ (Cash)</option>
              <option value="BANK">ເງິນໂອນ (Bank Transfer)</option>
            </select>
          </div>

          {method === 'BANK' && (
            <div>
              <label className="label" htmlFor="cash-modal-bank">
                ທະນາຄານ (Bank) <span className="text-danger">*</span>
              </label>
              <select
                id="cash-modal-bank"
                className="input w-full"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                disabled={banksLoading || add.isPending}
                required
              >
                <option value="">— ເລືອກທະນາຄານ —</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameLo}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Note */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0" htmlFor="cash-modal-note">
              ໝາຍເຫດ (Note)
            </label>
            <span className="text-[11px] text-muted">{note.length}/500</span>
          </div>
          <textarea
            id="cash-modal-note"
            rows={2}
            maxLength={500}
            className="input w-full resize-none py-2"
            placeholder="ໝາຍເຫດເພີ່ມເຕີມ (ຖ້າມີ)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={add.isPending}
          />
        </div>
      </form>
    </Dialog>
  );
}

