'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice } from '@/components/query-state';
import { statusClass } from '@/lib/status';

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

  const { data: requests = [], isError: requestsError, error: requestsErr, refetch: refetchRequests } = useQuery({
    queryKey: ['cash', 'requests', 'PENDING'],
    queryFn: () => api.get<CashRequest[]>('/cash/requests?status=PENDING'),
  });
  const { data: shifts = [], isError: shiftsError, error: shiftsErr, refetch: refetchShifts } = useQuery({
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
      <PageHead
        title="ອະນຸມັດ ເບີກ/ມອບ & ປິດກະ"
        subtitle="ເງິນຈະເຄື່ອນໄຫວຕໍ່ເມື່ອ payment ກົດຢືນຢັນຮັບເງິນ ຫຼັງຈາກ Approve ແລ້ວ (TOR §6)"
      />

      {error && (
        <div id="fc-approvals-error" role="alert" className="notice status-danger">{error}</div>
      )}

      {requestsError && <QueryErrorNotice error={requestsErr} onRetry={() => void refetchRequests()} />}
      {shiftsError && <QueryErrorNotice error={shiftsErr} onRetry={() => void refetchShifts()} />}

      {total === 0 && !requestsError && !shiftsError && (
        <div data-fade className="card p-10 text-center text-muted">ບໍ່ມີລາຍການລໍຖ້າອະນຸມັດ</div>
      )}

      {requests.length > 0 && (
        <div data-fade className="card">
          <div className="card-header">
            <h2 className="card-title">ເບີກ / ມອບເງິນ</h2>
            <span className="num text-xs text-muted">{requests.length} ລາຍການ</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="ເບີກ / ມອບເງິນ">
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
                    <td>
                      {formatDateTime(row.createdAt)}
                      <div><span className={statusClass(row.status)}>{row.status}</span></div>
                    </td>
                    <td>
                      <span className="badge recessed text-fg">
                        {row.direction === 'WITHDRAW' ? 'ເບີກເງິນ (+)' : 'ມອບເງິນ (−)'}
                      </span>
                    </td>
                    <td>{row.shift.user.fullName}</td>
                    <td className="num text-right">{amountFor(row.lines, 'LAK')}</td>
                    <td className="num text-right">{amountFor(row.lines, 'THB')}</td>
                    <td className="num text-right">{amountFor(row.lines, 'USD')}</td>
                    <td className="text-muted">{row.note ?? '—'}</td>
                    <td className="text-right">
                      {rejecting === row.id ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <input className="input w-44" aria-label="ເຫດຜົນ" aria-describedby={error ? 'fc-approvals-error' : undefined} placeholder="ເຫດຜົນ"
                            value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                          <button className="btn-danger" aria-label={`ຢືນຢັນ ${row.shift.user.fullName}`}
                            onClick={() => reviewRequest.mutate({ id: row.id, decision: 'REJECTED', reason })}
                            disabled={reviewRequest.isPending}>
                            ຢືນຢັນ
                          </button>
                          <button className="btn-secondary" aria-label={`ຍົກເລີກ ${row.shift.user.fullName}`}
                            onClick={() => setRejecting(null)}>ຍົກເລີກ</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-6">
                          <button className="btn-primary" aria-label={`Approve ${row.shift.user.fullName}`} aria-describedby={error ? 'fc-approvals-error' : undefined}
                            onClick={() => reviewRequest.mutate({ id: row.id, decision: 'APPROVED' })}
                            disabled={reviewRequest.isPending}>
                            Approve
                          </button>
                          <button className="btn-danger" aria-label={`Reject ${row.shift.user.fullName}`} aria-describedby={error ? 'fc-approvals-error' : undefined}
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
        <div data-fade className="card">
          <div className="card-header">
            <h2 className="card-title">ການປິດກະລໍຖ້າອະນຸມັດ</h2>
            <span className="num text-xs text-muted">{shifts.length} ລາຍການ</span>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="ການປິດກະລໍຖ້າອະນຸມັດ">
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
                    <td className="text-muted">{row.user.role}</td>
                    <td>{formatDateTime(row.openedAt)}</td>
                    <td>{formatDateTime(row.closedAt)}</td>
                    <td className="num text-right">{amountFor(row.closingBalances, 'LAK')}</td>
                    <td className="num text-right">{amountFor(row.closingBalances, 'THB')}</td>
                    <td className="num text-right">{amountFor(row.closingBalances, 'USD')}</td>
                    <td className="text-right">
                      {rejecting === row.id ? (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <input className="input w-44" aria-label="ເຫດຜົນ" aria-describedby={error ? 'fc-approvals-error' : undefined} placeholder="ເຫດຜົນ"
                            value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                          <button className="btn-danger" aria-label={`ຢືນຢັນ ${row.user.fullName}`}
                            onClick={() => reviewShift.mutate({ id: row.id, decision: 'REJECTED', reason })}
                            disabled={reviewShift.isPending}>
                            ຢືນຢັນ
                          </button>
                          <button className="btn-secondary" aria-label={`ຍົກເລີກ ${row.user.fullName}`}
                            onClick={() => setRejecting(null)}>ຍົກເລີກ</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-6">
                          <button className="btn-primary" aria-label={`Approve ${row.user.fullName}`} aria-describedby={error ? 'fc-approvals-error' : undefined}
                            onClick={() => reviewShift.mutate({ id: row.id, decision: 'APPROVED' })}
                            disabled={reviewShift.isPending}>
                            Approve
                          </button>
                          <button className="btn-danger" aria-label={`Reject ${row.user.fullName}`} aria-describedby={error ? 'fc-approvals-error' : undefined}
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
