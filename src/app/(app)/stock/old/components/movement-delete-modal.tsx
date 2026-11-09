'use client';

import { Dialog } from '@/components/dialog';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { useDeleteStockOldRecord } from '@/lib/stock-old-api';
import type { LedgerRow } from '../types';

interface MovementDeleteModalProps {
  row: LedgerRow | null;
  onClose: () => void;
}

export function MovementDeleteModal({ row, onClose }: MovementDeleteModalProps) {
  const toast = useToast();

  const deleteMutation = useDeleteStockOldRecord({
    onSuccess: () => {
      toast.success('ລຶບລາຍການສຳເລັດ');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'ບໍ່ສາມາດລຶບລາຍການໄດ້');
    },
  });

  if (!row) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      title={`ຢືນຢັນການລຶບລາຍການ — ${row.movement?.code ?? row.typeLabel}`}
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={deleteMutation.isPending}
          >
            ຍົກເລີກ
          </button>
          <button
            className="btn-danger"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(row)}
          >
            {deleteMutation.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການ{' '}
          <strong className="text-fg">{row.movement?.code ?? row.typeLabel}</strong>{' '}
          ({formatDate(row.businessDate)})?
        </p>
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger space-y-1">
          <p className="font-semibold">⚠️ ຜົນກະທົບຕໍ່ລະບົບ:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>ຍອດສິນຄ້າໃນສາງ (Stock OLD) ຈະຖືກປັບປຸງຄືນໂດຍອັດຕະໂນມັດ.</li>
            <li>ບັນຊີ AP/AR (GOLD) ແລະ ປະຫວັດ Stock ຈະຖືກປັບຍອດຄືນ.</li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
}

