'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { TableStateRow } from '@/components/query-state';
import { formatLak, formatWeight } from '@/lib/format';
import { AuditView } from '@/components/audit-view';

interface Deduction {
  id: string;
  tierCode: string;
  kind: 'PERCENT' | 'AMOUNT';
  value: string;
  tier: { labelLo: string; displayWeightG: string; sortOrder: number };
}

/**
 * TOR §3.2 — ຫັກອອກ (%) ສຳລັບ 1 ບາດ / 2 ສະຫຼຶງ / 1 ສະຫຼຶງ ແລະ
 * ລາຄາລົບອອກ (ກີບ) ສຳລັບ 5, 3, 2, 1 ຫຸນ.
 *
 * These feed straight into the buyback half of the price board, so editing a
 * row here changes every future ລາຄາຊື້ຄືນ without touching the sell prices.
 */
export default function DeductionsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isError: rowsFailed, error: rowsError, refetch: refetchRows } = useQuery({
    queryKey: ['fees', 'deductions'],
    queryFn: () => api.get<Deduction[]>('/fees/buyback-deductions'),
  });

  const save = useMutation({
    mutationFn: (row: Deduction) =>
      api.post('/fees/buyback-deductions', {
        tierCode: row.tierCode,
        kind: row.kind,
        value: value.replace(/,/g, '').trim(),
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setEditing(null);
      setValue('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['fees', 'deductions'] });
      void queryClient.invalidateQueries({ queryKey: ['pricing'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="ລາຄາລົບອອກ & ຫັກອອກ (%)"
        subtitle="ຄ່າຫັກທີ່ໃຊ້ຄິດໄລ່ລາຄາຊື້ຄືນຮູບປະພັນ (TOR §3.2)"
      />

      {error && (
        <div id="deduction-error" role="alert" className="notice status-danger">
          {error}
        </div>
      )}

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ຄ່າຫັກປັດຈຸບັນ</h2>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ຄ່າຫັກປັດຈຸບັນ">
          <table className="table">
            <thead>
              <tr>
                <th>ນ້ຳໜັກ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th>ວິທີຫັກ</th>
                <th className="text-right">ຄ່າ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={5}
                isError={rowsFailed}
                error={rowsError}
                isEmpty={false}
                emptyText=""
                onRetry={() => void refetchRows()}
              />
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.tier.labelLo}</td>
                  <td className="num text-right text-muted">
                    {formatWeight(row.tier.displayWeightG)}
                  </td>
                  <td>
                    <span
                      className={
                        row.kind === 'PERCENT'
                          ? 'badge recessed text-gold'
                          : 'badge recessed text-fg'
                      }
                    >
                      {row.kind === 'PERCENT' ? 'ຫັກອອກ (%)' : 'ລາຄາລົບອອກ (ກີບ)'}
                    </span>
                  </td>
                  <td className="num text-right">
                    {editing === row.id ? (
                      <input
                        aria-label={`${row.tier.labelLo} — ຄ່າ`}
                        aria-describedby={error ? 'deduction-error' : undefined}
                        className="input num w-32 text-right"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        autoFocus
                      />
                    ) : row.kind === 'PERCENT' ? (
                      `${row.value} %`
                    ) : (
                      formatLak(row.value)
                    )}
                  </td>
                  <td className="text-right">
                    {editing === row.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          className="btn-primary"
                          onClick={() => save.mutate(row)}
                          disabled={save.isPending}
                        >
                          ບັນທຶກ
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => setEditing(null)}
                        >
                          ຍົກເລີກ
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setEditing(row.id);
                          setValue(row.value);
                        }}
                      >
                        ແກ້ໄຂ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AuditView entity="BuybackDeductionRule" />

      <p data-fade className="text-sm text-muted">
        ຕາຕະລາງນີ້ເປັນແບບ append-only — ການແກ້ໄຂຈະສ້າງແຖວໃໝ່ ແລະ ຮັກສາປະຫວັດເກົ່າໄວ້
        ເພື່ອໃຫ້ລາຄາທີ່ຄິດໄລ່ໃນອະດີດຍັງກວດສອບຄືນໄດ້.
      </p>
    </div>
  );
}
