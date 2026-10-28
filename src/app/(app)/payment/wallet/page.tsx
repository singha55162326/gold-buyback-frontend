'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { PageHead } from '@/components/page-head';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { statusClass } from '@/lib/status';
import { StatCard } from '@/components/stat-card';

interface Balance { currency: 'LAK' | 'THB' | 'USD'; inflow: string; outflow: string; balance: string }
interface Wallet { shiftId: string | null; openedAt: string | null; balances: Balance[] }
interface Request {
  id: string; direction: 'WITHDRAW' | 'HANDOVER'; status: string;
  note: string | null; createdAt: string;
  lines: Array<{ id: string; currency: string; amount: string }>;
  /** ຜູ້ບັນທຶກ (ຜູ້ຮ້ອງຂໍ) ແລະ ມືສຸດທ້າຍ (ຜູ້ອະນຸມັດ). */
  createdBy: string;
  updatedBy: string;
}

const STATUS: Record<string, { lo: string }> = {
  PENDING: { lo: 'ລໍຖ້າອະນຸມັດ' },
  APPROVED: { lo: 'ອະນຸມັດແລ້ວ — ກົດຢືນຢັນ' },
  REJECTED: { lo: 'ປະຕິເສດ' },
  COMPLETED: { lo: 'ສຳເລັດ' },
  CANCELLED: { lo: 'ຍົກເລີກ' },
};

/**
 * TOR §4.1 — ກະເປົ໋າເງິນສົດ (To Day).
 *
 * ເງິນຈະເຄື່ອນໄຫວຕອນ 'Completed' ເທົ່ານັ້ນ: ສ້າງລາຍການ → FC Approve →
 * payment ກົດຢືນຢັນຮັບ/ມອບເງິນຕົວຈິງ.
 */
export default function WalletPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [direction, setDirection] = useState<'WITHDRAW' | 'HANDOVER'>('WITHDRAW');
  const [lak, setLak] = useState('');
  const [thb, setThb] = useState('');
  const [usd, setUsd] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  /*
   * ຍອດໃນກະເປົ໋າ ບໍ່ແມ່ນຍອດເງິນສົດຂອງຮ້ານ.
   *
   * ມັນຄືເງິນທີ່ພະນັກງານຄົນນີ້ຖືຢູ່ໃນກະນີ້: ເຂົ້າຈາກການເບີກ ແລະ ສິນເຊື່ອ,
   * ອອກຕອນຈ່າຍ Buyback / ປ່ຽນເປັນເງິນ ແລະ ຕອນມອບເງິນຄືນ.
   */
  const { data: wallet, isError: balancesFailed, error: balancesError, refetch: refetchBalances } = useQuery({
    queryKey: ['cash', 'wallet'],
    queryFn: () => api.get<Wallet>('/cash/wallet'),
  });
  const balances = wallet?.balances ?? [];
  const { data: requests = [], isError: requestsFailed, error: requestsError, refetch: refetchRequests } = useQuery({
    queryKey: ['cash', 'requests'],
    queryFn: () => api.get<Request[]>('/cash/requests'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cash'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
  };

  const create = useMutation({
    mutationFn: () => {
      const lines = [
        { currency: 'LAK', amount: lak },
        { currency: 'THB', amount: thb },
        { currency: 'USD', amount: usd },
      ]
        .filter((l) => l.amount.trim() && Number(l.amount.replace(/,/g, '')) > 0)
        .map((l) => ({ currency: l.currency, amount: l.amount.replace(/,/g, '').trim() }));
      return api.post('/cash/requests', { direction, lines, note: note || undefined });
    },
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setLak(''); setThb(''); setUsd(''); setNote(''); setError(null); invalidate();
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/cash/requests/${id}/complete`),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ຢືນຢັນບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const amountFor = (lines: Array<{ currency: string; amount: string }>, currency: string) =>
    formatMoney(lines.find((l) => l.currency === currency)?.amount ?? '0');

  const canSave = [lak, thb, usd].some((v) => v.trim() && Number(v.replace(/,/g, '')) > 0);

  const pager = usePagination(requests);


  return (
    <div className="space-y-6">
      <PageHead
        title="ກະເປົ໋າເງິນສົດ (To Day)"
        subtitle="ເບີກເງິນ (+) / ມອບເງິນ (−) — ເງິນເຄື່ອນໄຫວຕອນກົດ Completed ເທົ່ານັ້ນ (TOR §4.1)"
      />
      {balancesFailed && <QueryErrorNotice error={balancesError} onRetry={() => void refetchBalances()} />}

      {!wallet?.shiftId && (
        <div data-fade className="notice status-warning">
          ຍັງບໍ່ໄດ້ເປີດກະ — ຍອດໃນກະເປົ໋າຈະເປັນ 0 ຈົນກວ່າຈະເປີດກະ ແລະ ເບີກເງິນ
        </div>
      )}

      <div className="stat-grid">
        {balances.map((b) => (
          <StatCard key={b.currency} label={`ຍອດຄົງເຫຼືອ ${b.currency}`} value={formatMoney(b.balance)}
            sub={`ເຂົ້າ ${formatMoney(b.inflow)} · ອອກ ${formatMoney(b.outflow)}`} />
        ))}
      </div>

      {error && (
        <div id="wallet-error" role="alert" className="notice status-danger">{error}</div>
      )}

      <div data-fade className="card p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" aria-pressed={direction === 'WITHDRAW'}
            className={direction === 'WITHDRAW' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setDirection('WITHDRAW')}>
            ເບີກເງິນ (+)
          </button>
          <button type="button" aria-pressed={direction === 'HANDOVER'}
            className={direction === 'HANDOVER' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setDirection('HANDOVER')}>
            ມອບເງິນ (−)
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="lak">Amount (LAK)</label>
            <NumberInput decimals={0} id="lak" className="input input-lg num" aria-describedby={error ? 'wallet-error' : undefined} value={lak}
              onValueChange={setLak} />
          </div>
          <div>
            <label className="label" htmlFor="thb">Amount (THB)</label>
            <NumberInput decimals={2} id="thb" className="input input-lg num" value={thb}
              onValueChange={setThb} />
          </div>
          <div>
            <label className="label" htmlFor="usd">Amount (USD)</label>
            <NumberInput decimals={2} id="usd" className="input input-lg num" value={usd}
              onValueChange={setUsd} />
          </div>
          <div>
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input input-lg" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <button className="btn-primary min-h-[54px] w-full sm:w-auto sm:min-w-[240px]" disabled={!canSave || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງສົ່ງ...' : `ສົ່ງຄຳຮ້ອງ${direction === 'WITHDRAW' ? 'ເບີກເງິນ' : 'ມອບເງິນ'}`}
          </button>
        </div>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">History ເບີກ / ມອບເງິນ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="History ເບີກ / ມອບເງິນ">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ປະເພດ</th>
                <th className="text-right">LAK</th>
                <th className="text-right">THB</th>
                <th className="text-right">USD</th>
                <th>ໝາຍເຫດ</th>
                <th>ສະຖານະ</th>
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={9} isError={requestsFailed} error={requestsError} isEmpty={requests.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={() => void refetchRequests()} />
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.direction === 'WITHDRAW' ? 'ເບີກເງິນ (+)' : 'ມອບເງິນ (−)'}</td>
                  <td className="num text-right">{amountFor(row.lines, 'LAK')}</td>
                  <td className="num text-right">{amountFor(row.lines, 'THB')}</td>
                  <td className="num text-right">{amountFor(row.lines, 'USD')}</td>
                  <td className="text-muted">{row.note ?? '—'}</td>
                  <td>
                    <span className={statusClass(row.status)}>
                      {STATUS[row.status]?.lo ?? row.status}
                    </span>
                  </td>
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-right">
                    {row.status === 'APPROVED' ? (
                      <button className="btn-primary"
                        onClick={() => complete.mutate(row.id)} disabled={complete.isPending}>
                        ຢືນຢັນ Completed
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}

