'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec } from '@kpv/domain';
import { api, ApiError } from '@/lib/api';
import { clean, isPositive } from '@/lib/validate';
import { formatByCurrency } from '@/lib/format';
import { Dialog } from './dialog';
import { NumberInput } from './number-input';
import { useToast } from './toast';
import type { BankBalance, CashBalance } from './multi-payment';

export interface ApArPartnerRow {
  partnerId: string;
  partnerCode: string;
  partnerNameLo: string;
  isActive?: boolean;
  currency: 'LAK' | 'THB' | 'USD';
  broughtForward: string;
  increases: string;
  decreases: string;
  current: string;
}

interface Bank {
  id: string;
  nameLo: string;
}

export interface SettleApArCashModalProps {
  row: ApArPartnerRow | null;
  onClose: () => void;
  side: 'AP' | 'AR';
}

/**
 * Modal for settling (paying AP / receiving AR) a Partner's outstanding cash balance.
 * Replaces the cramped inline row inputs with clear balance visibility, full-pay shortcut,
 * and optional note support.
 */
export function SettleApArCashModal({ row, onClose, side }: SettleApArCashModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const open = Boolean(row);

  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMethod('CASH');
    setBankAccountId('');
    setAmount('');
    setNote('');
    setError(null);
  }, [row?.partnerId, row?.currency]);

  const { data: banks = [], isLoading: banksLoading } = useQuery({
    queryKey: ['catalog', 'bank-accounts'],
    queryFn: () => api.get<Bank[]>('/catalog/bank-accounts'),
    enabled: open,
  });

  const isApOpen = open && side === 'AP';
  const { data: cashBalances = [], isLoading: cashLoading } = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<CashBalance[]>('/cash/balances'),
    enabled: isApOpen,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const { data: bankBalances = [], isLoading: bankLoading } = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
    enabled: isApOpen,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const balancesLoading = isApOpen && (method === 'CASH' ? cashLoading : bankLoading);

  const availableFunds = (() => {
    if (!row || side !== 'AP') return null;
    if (method === 'CASH') {
      if (cashLoading) return null;
      const cb = cashBalances.find((c) => c.currency === row.currency);
      return dec(cb?.balance ?? 0);
    }
    if (!bankAccountId || bankLoading) return null;
    const bb = bankBalances.find(
      (b) => b.bankAccountId === bankAccountId && b.currency === row.currency,
    );
    return dec(bb?.actual ?? 0);
  })();

  const validationError = (() => {
    if (!row) return null;
    const cleaned = clean(amount);
    if (!cleaned) return null;
    let amt;
    try {
      amt = dec(cleaned);
    } catch {
      return null;
    }
    if (!amt.isFinite() || amt.lte(0)) return null;

    const maxCurrent = dec(row.current);
    if (amt.gt(maxCurrent)) {
      return `ຈຳນວນເງິນເກີນຍອດຄ້າງປັດຈຸບັນ (${formatByCurrency(maxCurrent, row.currency)} ${row.currency})`;
    }

    if (side === 'AP' && !balancesLoading && availableFunds !== null && amt.gt(availableFunds)) {
      if (method === 'CASH') {
        return `ເງິນສົດ ${row.currency} ໃນຮ້ານ (Module Cash) ບໍ່ພໍ (ມີເຫຼືອ ${formatByCurrency(availableFunds, row.currency)} ${row.currency})`;
      }
      const bankName = banks.find((b) => b.id === bankAccountId)?.nameLo ?? 'ທະນາຄານ';
      return `ຍອດເງິນ ${row.currency} ໃນບັນຊີ ${bankName} (Module Bank) ບໍ່ພໍ (ມີເຫຼືອ ${formatByCurrency(availableFunds, row.currency)} ${row.currency})`;
    }

    return null;
  })();

  const settle = useMutation({
    mutationFn: () => {
      if (!row) throw new Error('No row selected');
      return api.post(`/finance/ap-ar/${side}/settle`, {
        partnerId: row.partnerId,
        currency: row.currency,
        method,
        bankAccountId: method === 'BANK' ? bankAccountId : undefined,
        amount: clean(amount),
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      if (row) {
        toast.success(
          side === 'AR' ? 'ຮັບຊຳຣະໜີ້ AR ສຳເລັດ' : 'ຊຳຣະໜີ້ AP ສຳເລັດ',
          `${formatByCurrency(clean(amount), row.currency)} ${row.currency} · ${row.partnerNameLo}`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['finance', 'ap-ar', side] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      onClose();
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError
          ? e.message
          : side === 'AR'
            ? 'ຮັບເງິນບໍ່ສຳເລັດ'
            : 'ຊຳຣະບໍ່ສຳເລັດ';
      setError(msg);
      toast.error('ບໍ່ສຳເລັດ', msg);
    },
  });

  const canConfirm =
    Boolean(row) &&
    isPositive(amount) &&
    (method === 'CASH' || Boolean(bankAccountId)) &&
    !balancesLoading &&
    !validationError &&
    !settle.isPending;

  const fillFullAmount = () => {
    if (!row) return;
    const d = dec(row.current);
    const decimals = row.currency === 'LAK' ? 0 : 2;
    const formatted = d.toDecimalPlaces(decimals).toFixed(decimals);
    setAmount(decimals > 0 ? formatted.replace(/\.?0+$/, '') : formatted);
  };

  const titleLo =
    side === 'AP'
      ? 'ຊຳຣະໜີ້ AP (Cash) — Payment'
      : 'ຮັບຊຳຣະໜີ້ AR (Cash) — Receive';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={titleLo}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={settle.isPending}
          >
            ຍົກເລີກ
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canConfirm}
            onClick={() => settle.mutate()}
          >
            {settle.isPending
              ? 'ກຳລັງບັນທຶກ...'
              : side === 'AR'
                ? 'ຢືນຢັນຮັບເງິນ'
                : 'ຢືນຢັນຊຳຣະ'}
          </button>
        </>
      }
    >
      {row && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canConfirm) settle.mutate();
          }}
          className="space-y-4"
        >
          {error && (
            <div id="settle-apar-error" role="alert" className="notice status-danger text-sm">
              {error}
            </div>
          )}

          {validationError && (
            <div role="alert" className="notice status-danger text-xs">
              {validationError}
            </div>
          )}

          {/* Partner & Outstanding Summary */}
          <div className="rounded-xl border border-line bg-recessed/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-muted">ແຫຼ່ງ / ຄູ່ຄ້າ</div>
              <div className="font-semibold text-fg-strong mt-0.5">{row.partnerNameLo}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">ຍອດຄ້າງປັດຈຸບັນ</div>
              <div className="num text-base font-bold text-gold mt-0.5">
                {formatByCurrency(row.current, row.currency)} {row.currency}
              </div>
            </div>
          </div>

          {/* Method & Bank */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="settle-method">
                {side === 'AR' ? 'ຮັບເຂົ້າຊ່ອງທາງ' : 'ຈ່າຍອອກຈາກຊ່ອງທາງ'} <span className="text-danger">*</span>
              </label>
              <select
                id="settle-method"
                className="input w-full font-medium"
                value={method}
                onChange={(e) => {
                  const next = e.target.value as 'CASH' | 'BANK';
                  setMethod(next);
                  if (next === 'CASH') setBankAccountId('');
                }}
                disabled={settle.isPending}
                autoFocus
              >
                <option value="CASH">ເງິນສົດ (Cash)</option>
                <option value="BANK">ເງິນໂອນ (Bank Transfer)</option>
              </select>
            </div>

            {method === 'BANK' && (
              <div>
                <label className="label" htmlFor="settle-bank">
                  ທະນາຄານ <span className="text-danger">*</span>
                </label>
                <select
                  id="settle-bank"
                  className="input w-full"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  disabled={banksLoading || settle.isPending}
                  required
                >
                  <option value="">{banksLoading ? 'ກຳລັງໂຫຼດ...' : '— ເລືອກທະນາຄານ —'}</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameLo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Available Funds hint for AP */}
          {side === 'AP' && (method === 'CASH' || bankAccountId) && (
            <div className="text-xs text-muted flex items-center justify-between px-1">
              <span>
                {method === 'CASH'
                  ? `ຍອດເງິນສົດ ${row.currency} ໃນຮ້ານ (Module Cash):`
                  : `ຍອດເງິນ ${row.currency} ໃນບັນຊີທີ່ເລືອກ:`}
              </span>
              <span className="num font-semibold text-fg">
                {balancesLoading
                  ? 'ກຳລັງກວດສອບ...'
                  : availableFunds !== null
                    ? `${formatByCurrency(availableFunds, row.currency)} ${row.currency}`
                    : '—'}
              </span>
            </div>
          )}

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0" htmlFor="settle-amount">
                ຈຳນວນເງິນ ({row.currency}) <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                className="text-xs font-medium text-gold hover:underline"
                onClick={fillFullAmount}
                disabled={settle.isPending}
              >
                ເຕັມຈຳນວນ ({formatByCurrency(row.current, row.currency)})
              </button>
            </div>
            <div className="relative">
              <NumberInput
                id="settle-amount"
                className="input num w-full pr-14 text-right font-semibold"
                decimals={row.currency === 'LAK' ? 0 : 2}
                placeholder={row.currency === 'LAK' ? '0' : '0.00'}
                value={amount}
                onValueChange={setAmount}
                disabled={settle.isPending}
                aria-describedby={error ? 'settle-apar-error' : undefined}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted">
                {row.currency}
              </span>
            </div>
          </div>

          {/* Note */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0" htmlFor="settle-note">
                ໝາຍເຫດ (Note)
              </label>
              <span className="text-[11px] text-muted">{note.length}/500</span>
            </div>
            <textarea
              id="settle-note"
              rows={2}
              maxLength={500}
              className="input w-full resize-none py-2"
              placeholder="ໝາຍເຫດການຊຳຣະ / ຮັບເງິນ (ຖ້າມີ)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={settle.isPending}
            />
          </div>
        </form>
      )}
    </Dialog>
  );
}
