'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { useToast } from '@/components/toast';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice } from '@/components/query-state';
import { today, type PagedResult } from '@/components/date-range';

interface MovementRow {
  id: string; code: string; scope: 'NEW' | 'OLD'; type: 'IN' | 'OUT';
  transformType: string | null; goldPercent: string | null; expectedReturnG: string | null;
  totalQuantity: number; totalGoldG: string; totalCost: string;
  status: string; note: string | null; createdAt: string;
  createdBy: string;
  partner: { nameLo: string; code: string } | null;
  cabinet: { nameLo: string } | null;
  lines: Array<{ id: string; weightG: string; quantity: number; goldG: string }>;
}

interface HandoverRow {
  id: string; code: string; roundNo: number | null;
  weightG: string; grossWeightG: string | null; pureWeightG: string | null;
  glassWeightG: string | null; warehouseCost: string | null;
  status: string; createdAt: string;
  createdBy: string;
  goldType: { nameLo: string };
  shift: { user: { fullName: string } };
  items: Array<{ id: string }>;
}

const TRANSFORM: Record<string, string> = { DYE: 'ຍ້ອມ', ETCH: 'ກັດ', MELT: 'ຫຼອມ' };

/**
 * ຄິວລໍຖ້າອະນຸມັດ ບໍ່ຄວນຫາຍຕອນຂຶ້ນມື້ໃໝ່ — ຖາມຍ້ອນຫຼັງ 1 ປີ ແລະ ເອົາທຸກແຖວ.
 * (`/stock/movements` ບໍ່ກອງຕາມວັນທີຢູ່ແລ້ວ; ມອບຄຳເປັນລາຍການປະຫວັດ ຈຶ່ງຕ້ອງລະບຸຊ່ວງ.)
 */
const PENDING_RANGE = (() => {
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `from_date=${from.getFullYear()}-${p(from.getMonth() + 1)}-${p(from.getDate())}&to_date=${today()}&all=true&status=PENDING`;
})();

/**
 * TOR §7.2 / §7.3 — ອະນຸມັດ Stock OUT ແລະ ການມອບຄຳເຂົ້າສາງ.
 *
 * Stock OUT ຖືກສ້າງເປັນ PENDING ແລະ **ຍັງບໍ່ຕັດຍອດສາງ**; ການຕັດຍອດເກີດຕອນ
 * Admin/Manager ກົດ Approve ຢູ່ໜ້ານີ້ (FACTORY ເປັນຂໍ້ຍົກເວັ້ນ — ໄປລໍຖ້າ
 * ການປະເມີນນ້ຳໜັກກ່ອນ). ການມອບຄຳເຂົ້າສາງ ສາງເປັນຜູ້ຢືນຢັນ.
 */
export default function StockApprovalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);

  const role = getStoredUser()?.role;
  const canReviewOut = role === 'ADMIN' || role === 'MANAGER';
  const canReviewHandover = canReviewOut || role === 'WAREHOUSE';

  const movements = useQuery({
    queryKey: ['stock', 'movements', 'PENDING'],
    queryFn: () => api.get<MovementRow[]>('/stock/movements?status=PENDING'),
    enabled: canReviewOut,
  });
  const handovers = useQuery({
    queryKey: ['stock', 'handovers', 'PENDING'],
    queryFn: () => api.get<PagedResult<HandoverRow>>(`/stock/handovers?${PENDING_RANGE}`),
    enabled: canReviewHandover,
  });

  // Stock IN ບໍ່ຕ້ອງອະນຸມັດ — ກອງໄວ້ສະເພາະ OUT ທີ່ລໍຖ້າ.
  const outRows = (movements.data ?? []).filter((m) => m.type === 'OUT');
  const handoverRows = handovers.data?.rows ?? [];

  const review = useMutation({
    mutationFn: (input: { path: string; id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) =>
      api.post(`${input.path}/${input.id}/review`, {
        decision: input.decision,
        reason: input.reason,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setRejecting(null);
      setReason('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const actions = (path: string, id: string) =>
    rejecting === id ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <input className="input w-44" aria-label="ເຫດຜົນ" placeholder="ເຫດຜົນ"
          aria-describedby={error ? 'stock-approvals-error' : undefined}
          value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        <button className="btn-danger" disabled={review.isPending}
          onClick={() => review.mutate({ path, id, decision: 'REJECTED', reason })}>
          ຢືນຢັນ Reject
        </button>
        <button className="btn-secondary" onClick={() => setRejecting(null)}>ຍົກເລີກ</button>
      </div>
    ) : (
      <div className="flex justify-end gap-6">
        <button className="btn-primary" disabled={review.isPending}
          aria-describedby={error ? 'stock-approvals-error' : undefined}
          aria-label={`Approve ${id}`}
          onClick={() => review.mutate({ path, id, decision: 'APPROVED' })}>
          Approve
        </button>
        <button className="btn-danger" aria-label={`Reject ${id}`}
          onClick={() => { setRejecting(id); setReason(''); }}>
          Reject
        </button>
      </div>
    );

  const total = (canReviewOut ? outRows.length : 0) + (canReviewHandover ? handoverRows.length : 0);

  return (
    <div className="space-y-6">
      <PageHead
        title="ອະນຸມັດ ສາງຄຳ"
        subtitle="Stock OUT ລໍຖ້າ Admin/Manager ອະນຸມັດ ແລະ ການມອບຄຳເຂົ້າສາງ ລໍຖ້າສາງຢືນຢັນ (TOR §7.2, §7.3, §4.2)"
      />

      {movements.isError && <QueryErrorNotice error={movements.error} onRetry={() => void movements.refetch()} />}
      {handovers.isError && <QueryErrorNotice error={handovers.error} onRetry={() => void handovers.refetch()} />}

      {error && (
        <div id="stock-approvals-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {(movements.isLoading || handovers.isLoading) && (
        <div data-fade className="card p-10 text-center text-muted">ກຳລັງໂຫຼດ...</div>
      )}

      {total === 0 && !movements.isLoading && !handovers.isLoading && !movements.isError && !handovers.isError && (
        <div data-fade className="card p-10 text-center text-muted">ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ</div>
      )}

      {canReviewOut && outRows.length > 0 && (
        <div data-fade className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Stock OUT ລໍຖ້າອະນຸມັດ</h2>
              <p className="text-xs text-muted">
                ຍອດສາງ <b>ຍັງບໍ່ຖືກຕັດ</b> ຈົນກວ່າຈະກົດ Approve · ສົ່ງໄປ FACTORY ຈະໄປລໍຖ້າການປະເມີນນ້ຳໜັກກ່ອນ
              </p>
            </div>
            <span className="num text-xs text-muted">{outRows.length} ລາຍການ</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Stock OUT ລໍຖ້າອະນຸມັດ">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th>ວັນທີ</th>
                  <th>ສາງ</th>
                  <th>ແຫຼ່ງສົ່ງອອກ</th>
                  <th>ແປງສະພາບ</th>
                  <th className="text-right">ລວມ GOLD (g)</th>
                  <th className="text-right">ຕົ້ນທຶນຄຳ</th>
                  <th>ຜູ້ບັນທຶກ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {outRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">
                      {row.code}
                      {row.partner?.code === 'FACTORY' && (
                        <span className="ml-1 badge recessed text-gold">FACTORY</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td>{row.scope === 'NEW' ? 'ຄຳໃໝ່' : 'ຄຳເກົ່າ'}</td>
                    <td>{row.partner?.nameLo ?? '—'}</td>
                    <td className="text-muted">
                      {row.transformType ? (TRANSFORM[row.transformType] ?? row.transformType) : '—'}
                    </td>
                    <td className="num text-right font-medium">{formatWeight(row.totalGoldG)}</td>
                    <td className="num text-right">{formatLak(row.totalCost)}</td>
                    <td className="text-muted">{row.createdBy}</td>
                    <td className="text-right">{actions('/stock/out', row.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canReviewHandover && handoverRows.length > 0 && (
        <div data-fade className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">ມອບຄຳເຂົ້າສາງ ລໍຖ້າຢືນຢັນ</h2>
              <p className="text-xs text-muted">ຄຳເກົ່າທີ່ຜູ້ປະເມີນ / ການເງິນ ມອບເຂົ້າສາງ — ກົດ Approve ເພື່ອຮັບເຂົ້າສາງຄຳເກົ່າ</p>
            </div>
            <span className="num text-xs text-muted">{handoverRows.length} ລາຍການ</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="ມອບຄຳເຂົ້າສາງ ລໍຖ້າຢືນຢັນ">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th className="text-right">ຮອບທີ</th>
                  <th>ວັນທີ</th>
                  <th>ປະເພດຄຳ</th>
                  <th className="text-right">ນ້ຳໜັກອອກ (g)</th>
                  <th className="text-right">ຕົ້ນທຶນເຂົ້າສາງ</th>
                  <th>ຜູ້ມອບ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {handoverRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">
                      {row.code}
                      {row.items.length > 0 && (
                        <span className="ml-1 text-muted">({row.items.length} ລາຍການ)</span>
                      )}
                    </td>
                    <td className="num text-right">{row.roundNo ?? <span className="text-muted">—</span>}</td>
                    <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td>{row.goldType.nameLo}</td>
                    <td className="num text-right font-medium">
                      {formatWeight(row.grossWeightG ?? row.weightG)}
                    </td>
                    <td className="num text-right">
                      {row.warehouseCost ? formatLak(row.warehouseCost) : '—'}
                    </td>
                    <td>{row.shift.user.fullName}</td>
                    <td className="text-right">{actions('/stock/handovers', row.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
