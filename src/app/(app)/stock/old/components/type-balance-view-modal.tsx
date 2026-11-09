'use client';

import { Dialog } from '@/components/dialog';
import { formatLak, formatWeight, gramsToBaht } from '@/lib/format';
import type { TypeBalance } from '../types';

interface TypeBalanceViewModalProps {
  balance: TypeBalance | null;
  onClose: () => void;
}

export function TypeBalanceViewModal({ balance, onClose }: TypeBalanceViewModalProps) {
  if (!balance) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`ລາຍລະອຽດປະເພດຄຳ — ${balance.goldType.nameLo}`}
      footer={
        <button className="btn-secondary" onClick={onClose}>
          ປິດ
        </button>
      }
    >
      <div className="space-y-4">
        <div className="p-3 bg-recessed rounded-xl border border-line text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted">ປະເພດຄຳ:</span>
            <span className="font-semibold">{balance.goldType.nameLo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">ນ້ຳໜັກຄົງເຫຼືອ:</span>
            <span className="font-medium num">
              {formatWeight(balance.closingWeightG)} g ({gramsToBaht(balance.closingWeightG)} ບາດ)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3">
            <span className="text-xs text-muted block">ນໍ້າໜັກ (g) ຕັ້ງຕົ້ນ</span>
            <span className="num font-semibold text-base">
              {formatWeight(balance.openingWeightG)} g
            </span>
            <span className="text-xs text-muted block">{formatLak(balance.openingCost)} LAK</span>
          </div>
          <div className="card p-3">
            <span className="text-xs text-muted block">ເຂົ້າ (IN) ມື້ນີ້</span>
            <span className="num font-semibold text-base text-success">
              +{formatWeight(balance.inG)} g
            </span>
            <span className="text-xs text-muted block">+{formatLak(balance.priceIn)} LAK</span>
          </div>
          <div className="card p-3">
            <span className="text-xs text-muted block">ອອກ (OUT) ມື້ນີ້</span>
            <span className="num font-semibold text-base text-danger">
              -{formatWeight(balance.outG)} g
            </span>
            <span className="text-xs text-muted block">-{formatLak(balance.priceOut)} LAK</span>
          </div>
          <div className="card p-3">
            <span className="text-xs text-muted block">ຕົ້ນທຶນຄົງເຫຼືອ (LAK)</span>
            <span className="num font-semibold text-base text-[var(--gold)]">
              {formatLak(balance.closingCost)}
            </span>
            <span className="text-xs text-muted block">LAK</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

