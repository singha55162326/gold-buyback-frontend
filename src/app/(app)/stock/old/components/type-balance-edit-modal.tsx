'use client';

import { useState, useEffect } from 'react';
import { dec } from '@kpv/domain';
import { Dialog } from '@/components/dialog';
import { NumberInput } from '@/components/number-input';
import { formatLak, formatWeight, gramsToBaht } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { useUpdateOpeningBalance } from '@/lib/stock-old-api';
import type { TypeBalance } from '../types';

interface TypeBalanceEditModalProps {
  balance: TypeBalance | null;
  onClose: () => void;
}

export function TypeBalanceEditModal({ balance, onClose }: TypeBalanceEditModalProps) {
  const toast = useToast();
  const [openingWeightG, setOpeningWeightG] = useState('');
  const [openingCost, setOpeningCost] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (balance) {
      setOpeningWeightG(dec(balance.openingWeightG || 0).toFixed());
      setOpeningCost(dec(balance.openingCost || 0).toFixed());
      setErrorMsg(null);
    }
  }, [balance]);

  const updateMutation = useUpdateOpeningBalance({
    onSuccess: () => {
      toast.success('ແກ້ໄຂຍອດຕັ້ງຕົ້ນສຳເລັດ');
      onClose();
    },
    onError: (err) => {
      setErrorMsg(err instanceof ApiError ? err.message : 'ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ');
    },
  });

  if (!balance) return null;

  let nextWeight = dec(0);
  let nextCost = dec(0);
  try {
    nextWeight = dec(openingWeightG || 0)
      .plus(dec(balance.inG || 0))
      .minus(dec(balance.outG || 0));
  } catch {
    nextWeight = dec(0);
  }
  try {
    nextCost = dec(openingCost || 0)
      .plus(dec(balance.priceIn || 0))
      .minus(dec(balance.priceOut || 0));
  } catch {
    nextCost = dec(0);
  }

  const handleSubmit = () => {
    updateMutation.mutate({
      balanceId: balance.id,
      openingWeightG,
      openingCost,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`ແກ້ໄຂຍອດຕັ້ງຕົ້ນ — ${balance.goldType.nameLo}`}
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            ຍົກເລີກ
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="notice status-danger">
            <div>{errorMsg}</div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">ນໍ້າໜັກ (g) ຕັ້ງຕົ້ນ *</label>
            <NumberInput
              decimals={4}
              className="input num font-semibold text-base"
              value={openingWeightG}
              onValueChange={setOpeningWeightG}
              required
            />
          </div>
          <div>
            <label className="label">ຕົ້ນທຶນຕັ້ງຕົ້ນ (LAK) *</label>
            <NumberInput
              decimals={2}
              className="input num font-semibold text-base"
              value={openingCost}
              onValueChange={setOpeningCost}
              required
            />
          </div>
        </div>

        <div className="p-3 bg-recessed rounded-xl border border-line text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted">ຍອດເຂົ້າ (IN):</span>
            <span className="num text-success">+{formatWeight(balance.inG)} g</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">ຍອດອອກ (OUT):</span>
            <span className="num text-danger">-{formatWeight(balance.outG)} g</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-line/60 pt-1.5">
            <span>ຍອດນ້ຳໜັກຄົງເຫຼືອໃໝ່:</span>
            <span className="num text-[var(--gold)]">
              {formatWeight(nextWeight.toFixed())} g ({gramsToBaht(nextWeight.toFixed())} ບາດ)
            </span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>ຍອດຕົ້ນທຶນຄົງເຫຼືອໃໝ່:</span>
            <span className="num text-[var(--gold)]">{formatLak(nextCost.toFixed())} LAK</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

