'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';

interface CashRequest {
  id: string; direction: 'WITHDRAW' | 'HANDOVER'; status: string;
  note: string | null; createdAt: string;
  lines: Array<{ id: string; currency: string; amount: string }>;
  shift: { user: { fullName: string } };
}

interface PendingShift {
  id: string; openedAt: string; closedAt: string | null;
  user: { fullName: string; role: string };
  closingBalances: Array<{ id: string; currency: string; amount: string }>;
}

/** TOR §6 — Notification Center: ເບີກ/ມອບເງິນ ແລະ ການປິດກະ. */
export default function FcApprovalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);

  const { data: requests = [] } = useQuery({
    queryKey: ['cash', 'requests', 'PENDING'],
    queryFn: () => api.get<CashRequest[]>('/cash/requests?status=PENDING'),
  });
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', 'pending'],
    queryFn: () => api.get<PendingShift[]>('/shifts/pending'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
    void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const reviewRequest = useMutation({
    mutationFn: (input: { id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) =>
      api.post(`/cash/requests/${input.id}/review`, {
        decision: input.decision, reason: input.reason,
      }),
    onSuccess: () => { setRejecting(null); setReason(''); setError(null); invalidate(); },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const reviewShift = useMutation({
    mutationFn: (input: { id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) =>
      api.post(`/shifts/${input.id}/review`, {
        decision: input.decision, reason: input.reason,
      }),
    onSuccess: () => { setRejecting(null); setReason(''); setError(null); invalidate(); },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ດຳເນີນການບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const amountFor = (lines: Array<{ currency: string; amount: string }>, currency: string) =>
    formatMoney(lines.find((l) => l.currency === currency)?.amount ?? '0');

  const total = requests.length + shifts.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ອະນຸມັດ ເບີກ/ມອບ & ປິດກະ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ເງິນຈະເຄື່ອນໄຫວຕໍ່ເມື່ອ payment ກົດຢືນຢັນຮັບເງິນ ຫຼັງຈາກ Approve ແລ້ວ (TOR §6)
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {total === 0 && (
        <div className="card p-10 text-center text-slate-400">ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ</div>
      )}

      {requests.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">ເບີກ / ມອບເງິນ</h2>
            <span className="text-xs text-slate-500">{requests.length} ລາຍການ</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ວັນທີ</th>
                  <th>ປະເພດ</th>
                  <th>ຜູ້ຮ້ອງຂໍ</th>
                  <th className="text-right">LAK</th>
                  <th className="text-right">THB</th>
                  <th className="text-right">USD</th>
                  <th>ໝາຍເຫດ</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>
                      <span className={row.direction === 'WITHDRAW' ? 'badge bg-amber-100 text-amber-800' : 'badge bg-blue-100 text-blue-800'}>
                        {row.direction === 'WITHDRAW' ? 'ເບີກເງິນ (+)' : 'ມອບເງິນ (−)'}
                      </span>
                    </td>
                    <td>{row.shift.user.fullName}</td>
                    <td className="num text-right">{amountFor(row.lines, 'LAK')}</td>
                    <td className="num text-right">{amountFor(row.lines, 'THB')}</td>
                    <td className="num text-right">{amountFor(row.lines, 'USD')}</td>
                    <td className="text-slate-500">{row.note ?? '—'}</td>
                    <td className="text-right">
                      {rejecting === row.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input className="input w-36 py-1 text-xs" placeholder="ເຫດຜົນ"
                            value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                          <button className="text-sm text-red-600 hover:underline"
                            onClick={() => reviewRequest.mutate({ id: row.id, decision: 'REJECTED', reason })}>
                            ຢືນຢັນ
                          </button>
                          <button className="text-sm text-slate-500 hover:underline"
                            onClick={() => setRejecting(null)}>ຍົກເລີກ</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-3">
                          <button className="text-sm font-medium text-emerald-700 hover:underline"
                            onClick={() => reviewRequest.mutate({ id: row.id, decision: 'APPROVED' })}
                            disabled={reviewRequest.isPending}>
                            Approve
                          </button>
                          <button className="text-sm text-red-600 hover:underline"
                            onClick={() => setRejecting(row.id)}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {shifts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">ການປິດກະລໍຖ້າອະນຸມັດ</h2>
            <span className="text-xs text-slate-500">{shifts.length} ລາຍການ</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ຜູ້ໃຊ້</th>
                  <th>ສິດຜູ້ໃຊ້</th>
                  <th>ເປີດກະ</th>
                  <th>ປິດກະ</th>
                  <th className="text-right">LAK</th>
                  <th className="text-right">THB</th>
                  <th className="text-right">USD</th>
                  <th className="text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.user.fullName}</td>
                    <td className="text-slate-500">{row.user.role}</td>
                    <td>{formatDateTime(row.openedAt)}</td>
                    <td>{formatDateTime(row.closedAt)}</td>
                    <td className="num text-right">{amountFor(row.closingBalances, 'LAK')}</td>
                    <td className="num text-right">{amountFor(row.closingBalances, 'THB')}</td>
                    <td className="num text-right">{amountFor(row.closingBalances, 'USD')}</td>
                    <td className="text-right">
                      {rejecting === row.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input className="input w-36 py-1 text-xs" placeholder="ເຫດຜົນ"
                            value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                          <button className="text-sm text-red-600 hover:underline"
                            onClick={() => reviewShift.mutate({ id: row.id, decision: 'REJECTED', reason })}>
                            ຢືນຢັນ
                          </button>
                          <button className="text-sm text-slate-500 hover:underline"
                            onClick={() => setRejecting(null)}>ຍົກເລີກ</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-3">
                          <button className="text-sm font-medium text-emerald-700 hover:underline"
                            onClick={() => reviewShift.mutate({ id: row.id, decision: 'APPROVED' })}
                            disabled={reviewShift.isPending}>
                            Approve
                          </button>
                          <button className="text-sm text-red-600 hover:underline"
                            onClick={() => setRejecting(row.id)}>Reject</button>
                        </div>
                      )}
                    </td>
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
