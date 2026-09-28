'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDateTime } from '@/lib/format';

interface PendingBuyback {
  id: string; code: string; weightG: string; quantity: number;
  payableAmount: string; createdAt: string;
  customer: { phone: string };
  goldType: { nameLo: string };
}

interface PendingExchange {
  id: string; code: string; totalPayable: string; createdAt: string;
  customer: { phone: string };
}

interface PendingCredit {
  id: string; code: string; sellPrice: string; downPayment: string;
  outstanding: string; createdAt: string;
  customer: { phone: string };
}

/**
 * TOR §4.2 — payment reviews what the Valuer created.
 *
 * All three transaction types share one approve/reject shape, so they share
 * one screen rather than three near-identical ones.
 */
export default function PaymentApprovalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);

  const buybacks = useQuery({
    queryKey: ['buyback', 'PENDING'],
    queryFn: () => api.get<PendingBuyback[]>('/buyback?status=PENDING'),
  });
  const exchanges = useQuery({
    queryKey: ['exchange', 'PENDING'],
    queryFn: () => api.get<PendingExchange[]>('/exchange?status=PENDING'),
  });
  const credits = useQuery({
    queryKey: ['credit', 'PENDING'],
    queryFn: () => api.get<PendingCredit[]>('/credit?status=PENDING'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['buyback'] });
    void queryClient.invalidateQueries({ queryKey: ['exchange'] });
    void queryClient.invalidateQueries({ queryKey: ['credit'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const review = useMutation({
    mutationFn: (input: {
      path: string;
      id: string;
      decision: 'APPROVED' | 'REJECTED';
      reason?: string;
    }) =>
      api.post(`/${input.path}/${input.id}/review`, {
        decision: input.decision,
        reason: input.reason,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setRejecting(null);
      setReason('');
      setError(null);
      invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const actions = (path: string, id: string) =>
    rejecting === id ? (
      <div className="flex items-center justify-end gap-2">
        <input
          className="input w-40 py-1 text-xs"
          placeholder="ເຫດຜົນ"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <button
          className="text-sm text-red-600 hover:underline"
          onClick={() => review.mutate({ path, id, decision: 'REJECTED', reason })}
          disabled={review.isPending}
        >
          ຢືນຢັນ Reject
        </button>
        <button className="text-sm text-slate-500 hover:underline" onClick={() => setRejecting(null)}>
          ຍົກເລີກ
        </button>
      </div>
    ) : (
      <div className="flex justify-end gap-3">
        <button
          className="text-sm font-medium text-emerald-700 hover:underline"
          onClick={() => review.mutate({ path, id, decision: 'APPROVED' })}
          disabled={review.isPending}
        >
          Approve
        </button>
        <button className="text-sm text-red-600 hover:underline" onClick={() => setRejecting(id)}>
          Reject
        </button>
      </div>
    );

  const total =
    (buybacks.data?.length ?? 0) + (exchanges.data?.length ?? 0) + (credits.data?.length ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ລາຍການລໍຖ້າ Approve</h1>
        <p className="mt-1 text-sm text-slate-500">
          Buyback, ປ່ຽນເປັນເງິນ ແລະ ສິນເຊື່ອ ທີ່ຜູ້ປະເມີນສ້າງໄວ້ (TOR §4.2)
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {total === 0 && (
        <div className="card p-10 text-center text-slate-400">ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ</div>
      )}

      {(buybacks.data?.length ?? 0) > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Buyback</h2>
            <span className="text-xs text-slate-500">{buybacks.data!.length} ລາຍການ</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th>ວັນທີ</th>
                  <th>ເບີໂທ</th>
                  <th>ປະເພດຄຳ</th>
                  <th className="text-right">ນ້ຳໜັກ (g)</th>
                  <th className="text-right">ຈຳນວນ</th>
                  <th className="text-right">ລາຄາຈ່າຍ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {buybacks.data!.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td>{row.goldType.nameLo}</td>
                    <td className="num text-right">{formatWeight(row.weightG)}</td>
                    <td className="num text-right">{row.quantity}</td>
                    <td className="num text-right font-medium">{formatLak(row.payableAmount)}</td>
                    <td className="text-right">{actions('buyback', row.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(exchanges.data?.length ?? 0) > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">ລາຍການປ່ຽນເປັນເງິນ</h2>
            <span className="text-xs text-slate-500">{exchanges.data!.length} ລາຍການ</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th>ວັນທີ</th>
                  <th>ເບີໂທ</th>
                  <th className="text-right">ລວມເງິນຕ້ອງຈ່າຍ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {exchanges.data!.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td className="num text-right font-medium">{formatLak(row.totalPayable)}</td>
                    <td className="text-right">{actions('exchange', row.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(credits.data?.length ?? 0) > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">ລາຍການສິນເຊື່ອ</h2>
            <span className="text-xs text-slate-500">{credits.data!.length} ລາຍການ</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ລະຫັດລາຍການ</th>
                  <th>ວັນທີ</th>
                  <th>ເບີໂທ</th>
                  <th className="text-right">ລາຄາຂາຍ</th>
                  <th className="text-right">ເງິນວາງດາວ</th>
                  <th className="text-right">ຍອດຕິດໜີ້</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {credits.data!.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-xs">{row.code}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className="num">{row.customer.phone}</td>
                    <td className="num text-right">{formatLak(row.sellPrice)}</td>
                    <td className="num text-right">{formatLak(row.downPayment)}</td>
                    <td className="num text-right font-medium">{formatLak(row.outstanding)}</td>
                    <td className="text-right">{actions('credit', row.id)}</td>
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
