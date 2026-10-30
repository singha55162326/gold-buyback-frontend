'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { NumberInput } from '@/components/number-input';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { formatLak, formatDateTime } from '@/lib/format';
import { AuditView } from '@/components/audit-view';
import { isDecimal } from '@/lib/validate';

interface SoftGoldFee {
  id: string;
  value: string;
  effectiveAt: string;
}

interface HistoryRow extends SoftGoldFee {
  updatedBy: string;
}

/** TOR §3.4 — ຈັດການ ຄ່າອ່ອນ. */
export default function SoftGoldFeePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: current, isError: currentFailedRaw, error: currentError, refetch: refetchCurrent } = useQuery({
    queryKey: ['fees', 'soft-gold'],
    queryFn: () => api.get<SoftGoldFee>('/fees/soft-gold'),
    retry: false,
  });

  const { data: history = [], isLoading: historyLoading, isError: historyFailed, error: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['fees', 'soft-gold', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/fees/soft-gold/history?limit=30'),
  });

  // 404 means "fee not set yet", not a failure.
  const currentFailed = currentFailedRaw && !(currentError instanceof ApiError && currentError.status === 404);

  const save = useMutation({
    mutationFn: () => api.post('/fees/soft-gold', { value: value.replace(/,/g, '').trim() }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setValue('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['fees', 'soft-gold'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pager = usePagination(history);

  return (
    <div className="space-y-6">
      <PageHead
        title="ຈັດການ ຄ່າອ່ອນ"
        subtitle="ຄ່າຫັກຕໍ່ຫົວໜ່ວຍສຳລັບຄຳທີ່ນ້ຳໜັກຫຼຸດຈາກເກນ standard (TOR §3.4)"
      />

      <div data-fade className="card p-5">
        <div className="mb-4">
          <div className="label">
            ຄ່າຄຳອ່ອນປັດຈຸບັນ
          </div>
          <div className="num mt-1 text-2xl font-bold text-gold">
            {current ? `${formatLak(current.value)} LAK` : '—'}
          </div>
          {currentFailed && (
            <div className="mt-3">
              <QueryErrorNotice error={currentError} onRetry={() => void refetchCurrent()} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="value">
              ຄ່າຄຳອ່ອນໃໝ່ (LAK)
            </label>
            <NumberInput
              id="value"
              className="input num"
              decimals={0}
              placeholder="400,000"
              value={value}
              aria-describedby={error ? 'soft-error' : undefined}
              onValueChange={setValue}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!isDecimal(value) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'ກຳລັງບັນທຶກ...' : 'ອັບເດດຄ່າອ່ອນ'}
          </button>
        </div>

        {error && (
          <div id="soft-error" role="alert" className="notice status-danger mt-3">
            {error}
          </div>
        )}
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ປະຫວັດ</h2>
          <span className="text-xs text-muted">30 ແຖວລ່າສຸດ</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ ແລະ ເວລາ</th>
                <th className="text-right">ຄ່າຄຳອ່ອນ</th>
                <th>ຜູ້ແກ້ໄຂ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={3}
                isLoading={historyLoading}
                isError={historyFailed}
                error={historyError}
                isEmpty={history.length === 0}
                emptyText="ຍັງບໍ່ມີປະຫວັດ"
                onRetry={() => void refetchHistory()}
                dense
              />
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.effectiveAt)}</td>
                  <td className="num text-right">{formatLak(row.value)}</td>
                  <td>{row.updatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>

      <AuditView entity="SoftGoldFeeSnapshot" titleLo="ການປ່ຽນແປງລ່າສຸດ ແລະ Audit Log" />
    </div>
  );
}
