'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/format';

interface BankBalance {
  bankAccountId: string; bankCode: string; bankNameLo: string;
  currency: 'LAK' | 'THB' | 'USD';
  inflow: string; outflow: string; actual: string;
}
interface Row {
  id: string; type: string; currency: string; amount: string;
  refType: string | null; note: string | null; createdAt: string;
  bankAccount: { nameLo: string };
}

/**
 * TOR §4.1 — Module Bank for the cashier.
 *
 * Read-only by design: the cashier needs to see what is actually in the bank
 * to reconcile the counter, but posting bank entries and setting ເງິນ Bank
 * ສຸດທິ belong to the Financial Controller and Admin respectively.
 */
export default function PaymentBankPage() {
  const { data: balances = [] } = useQuery({
    queryKey: ['cash', 'bank', 'balances'],
    queryFn: () => api.get<BankBalance[]>('/cash/bank/balances'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['cash', 'bank', 'history'],
    queryFn: () => api.get<Row[]>('/cash/bank/history'),
  });

  const banks = [...new Set(balances.map((b) => b.bankNameLo))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Bank (To Day)</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຍອດເງິນຕົວຈິງໃນ Bank ແຍກຕາມທະນາຄານ ແລະ ສະກຸນເງິນ (TOR §4.1)
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ຍອດ Bank ຕົວຈິງ</h2>
          <span className="text-xs text-slate-500">ອ່ານຢ່າງດຽວ</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ທະນາຄານ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຮັບເຂົ້າ (+)</th>
                <th className="text-right">ຈ່າຍອອກ (−)</th>
                <th className="text-right">ຍອດຕົວຈິງ</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີຂໍ້ມູນ</td></tr>
              )}
              {balances.map((row) => (
                <tr key={`${row.bankAccountId}-${row.currency}`}>
                  <td className="font-medium">{row.bankNameLo}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right text-emerald-700">{formatMoney(row.inflow)}</td>
                  <td className="num text-right text-red-600">{formatMoney(row.outflow)}</td>
                  <td className="num text-right font-semibold">{formatMoney(row.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {banks.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            {banks.join(' · ')} — ເງິນ Bank ສຸດທິ ແລະ ຍອດຂາດດຸນ ເບິ່ງໄດ້ທີ່ Module Bank (Admin)
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">History ທຸລະກຳ Bank ໃນມື້</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ທະນາຄານ</th>
                <th>ປະເພດ</th>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ຈຳນວນເງິນ</th>
                <th>ອ້າງອີງ</th>
                <th>ໝາຍເຫດ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.bankAccount.nameLo}</td>
                  <td className="text-slate-500">{row.type}</td>
                  <td>{row.currency}</td>
                  <td className="num text-right font-medium">{formatMoney(row.amount)}</td>
                  <td className="text-slate-500">{row.refType ?? '—'}</td>
                  <td className="text-slate-500">{row.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
