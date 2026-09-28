'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
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

  const { data: rows = [] } = useQuery({
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ລາຄາລົບອອກ & ຫັກອອກ (%)</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຄ່າຫັກທີ່ໃຊ້ຄິດໄລ່ລາຄາຊື້ຄືນຮູບປະພັນ (TOR §3.2)
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ຄ່າຫັກປັດຈຸບັນ</h2>
        </div>
        <div className="table-wrap">
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
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.tier.labelLo}</td>
                  <td className="num text-right text-slate-500">
                    {formatWeight(row.tier.displayWeightG)}
                  </td>
                  <td>
                    <span
                      className={
                        row.kind === 'PERCENT'
                          ? 'badge bg-blue-100 text-blue-800'
                          : 'badge bg-purple-100 text-purple-800'
                      }
                    >
                      {row.kind === 'PERCENT' ? 'ຫັກອອກ (%)' : 'ລາຄາລົບອອກ (ກີບ)'}
                    </span>
                  </td>
                  <td className="num text-right">
                    {editing === row.id ? (
                      <input
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
                          className="text-sm text-gold-700 hover:underline"
                          onClick={() => save.mutate(row)}
                          disabled={save.isPending}
                        >
                          ບັນທຶກ
                        </button>
                        <button
                          className="text-sm text-slate-500 hover:underline"
                          onClick={() => setEditing(null)}
                        >
                          ຍົກເລີກ
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-sm text-gold-700 hover:underline"
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

      <p className="text-sm text-slate-500">
        ຕາຕະລາງນີ້ເປັນແບບ append-only — ການແກ້ໄຂຈະສ້າງແຖວໃໝ່ ແລະ ຮັກສາປະຫວັດເກົ່າໄວ້
        ເພື່ອໃຫ້ລາຄາທີ່ຄິດໄລ່ໃນອະດີດຍັງກວດສອບຄືນໄດ້.
      </p>
    </div>
  );
}
