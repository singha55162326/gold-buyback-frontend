'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Pagination, usePagination } from '@/components/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';

interface Balance { currency: 'LAK' | 'THB' | 'USD'; inflow: string; outflow: string; balance: string }
interface Row {
  id: string; type: string; currency: string; amount: string;
  refType: string | null; note: string | null; createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  IN: 'ຮັບເຂົ້າ',
  OUT: 'ຈ່າຍອອກ',
  OTHER_INCOME: 'ລາຍຮັບອື່ນ',
  OTHER_EXPENSE: 'ລາຍຈ່າຍອື່ນ',
};

/** TOR §3.7 — Module Cash. */
export default function FcCashPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<'IN' | 'OUT' | 'OTHER_INCOME' | 'OTHER_EXPENSE'>('IN');
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: balances = [] } = useQuery({
    queryKey: ['cash', 'balances'],
    queryFn: () => api.get<Balance[]>('/cash/balances'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['cash', 'history'],
    queryFn: () => api.get<Row[]>('/cash/history'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/cash/transactions', {
        type, currency, amount: amount.replace(/,/g, '').trim(), note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('ດຳເນີນການສຳເລັດ');
      setAmount(''); setNote(''); setError(null);
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ';
      setError(detail);
      toast.error('ບໍ່ສຳເລັດ', detail);
    },
  });

  const pager = usePagination(rows);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Module Cash</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຍອດເງິນສົດຄົງເຫຼືອ ແລະ ການເຄື່ອນໄຫວເງິນສົດໃນມື້ (TOR §3.7)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {balances.map((b) => (
          <div key={b.currency} className="card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              ຍອດຄົງເຫຼືອ {b.currency}
            </div>
            <div className="num mt-1 text-xl font-bold text-slate-900">{formatMoney(b.balance)}</div>
            <div className="mt-0.5 text-xs text-slate-400">
              (+) {formatMoney(b.inflow)} · (−) {formatMoney(b.outflow)}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="card-title mb-4">ບັນທຶກເງິນສົດ</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="type">ປະເພດ</label>
            <select id="type" className="input" value={type}
              onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="IN">Cash In</option>
              <option value="OUT">Cash Out</option>
              <option value="OTHER_INCOME">Other Income</option>
              <option value="OTHER_EXPENSE">Other Expense</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cur">ສະກຸນເງິນ</label>
            <select id="cur" className="input" value={currency}
              onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}>
              <option value="LAK">LAK</option>
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="amt">ຈຳນວນເງິນ</label>
            <input id="amt" className="input num" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="note">Note</label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="mt-4">
          <button className="btn-primary" disabled={!amount.trim() || create.isPending}
            onClick={() => create.mutate()}>
            {create.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Cash</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ປະເພດ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຈຳນວນເງິນ</th>
                <th>ອ້າງອີງ</th>
                <th>ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{TYPE_LABEL[row.type] ?? row.type}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatMoney(row.amount)}</td>
                  <td className="text-slate-500">{row.refType ?? '—'}</td>
                  <td className="text-slate-500">{row.note ?? '—'}</td>
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
