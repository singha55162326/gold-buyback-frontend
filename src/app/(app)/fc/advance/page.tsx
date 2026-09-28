'use client';

import { useState } from 'react';
import { Pagination, usePagination } from '@/components/pagination';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { formatMoney, formatWeight, formatDate } from '@/lib/format';

interface Summary {
  totals: Array<{ currency: 'LAK' | 'THB' | 'USD'; net: string }>;
  billCount: number;
}

interface Row {
  id: string;
  businessDate: string;
  currency: string;
  amountIn: string;
  amountOut: string;
  balance: string;
  method: string | null;
  note: string | null;
  order: {
    id: string; code: string; billNo: string; productType: string;
    staffName: string; weightG: string; quantity: number;
    totalAmount: string; balanceAmount: string; status: string;
    receivedFromSmithAt: string | null; customerPickupAt: string | null;
    customer: { phone: string };
    goldItem?: { nameLo: string } | null;
    supplier?: { nameLo: string } | null;
  };
  bankAccount: { nameLo: string } | null;
}

/**
 * TOR §7 — Module Advace.
 *
 * ເງິນມັດຈໍາ Order ຮັບລ່ວງໜ້າ has its own ledger in the updated TOR, separate
 * from AP (Cash). COH Cash subtracts the net, so a deposit sitting in the
 * drawer never reads as the shop's own money.
 */
export default function AdvancePage() {
  const [viewing, setViewing] = useState<string | null>(null);
  const { data: summary } = useQuery({
    queryKey: ['finance', 'advance'],
    queryFn: () => api.get<Summary>('/finance/advance'),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ['finance', 'advance', 'history'],
    queryFn: () => api.get<Row[]>('/finance/advance/history'),
  });

  const pager = usePagination(rows);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Module Advace</h1>
        <p className="mt-1 text-sm text-slate-500">
          ເງິນມັດຈໍາ Order ຮັບລ່ວງໜ້າ — ຫັກອອກຈາກ COH Cash ຈົນກວ່າລູກຄ້າຮັບເຄື່ອງ (TOR §7)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(summary?.totals ?? []).map((t) => (
          <div key={t.currency} className="card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              ລວມຍອດເງິນ Advace ({t.currency})
            </div>
            <div className="num mt-1 text-xl font-bold text-slate-900">{formatMoney(t.net)}</div>
          </div>
        ))}
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            ລວມຈຳນວນບິນ
          </div>
          <div className="num mt-1 text-xl font-bold text-slate-900">
            {summary?.billCount ?? '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">Order ທີ່ຍັງບໍ່ Completed</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Module Advace</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ລະຫັດລາຍການ</th>
                <th>ລະຫັດບິນ</th>
                <th>ວັນທີ</th>
                <th>ເບີໂທ</th>
                <th>ປະເພດສິນຄ້າ</th>
                <th className="text-right">ຮັບຈາກລູກຄ້າ (+)</th>
                <th className="text-right">ຕັດຊຳຣະ (−)</th>
                <th className="text-right">ຍອດສະສົມ</th>
                <th>ສະກຸນເງິນ</th>
                <th>ຮູບແບບຈ່າຍ</th>
                <th>ທະນາຄານ</th>
                <th>ສະຖານະ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={13} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {pager.pageItems.map((row) => (
                <>
                <tr key={row.id}>
                  <td className="font-mono text-xs">{row.order.code}</td>
                  <td className="font-mono text-xs">{row.order.billNo}</td>
                  <td>{formatDate(row.businessDate)}</td>
                  <td className="num">{row.order.customer.phone}</td>
                  <td>{row.order.productType}</td>
                  <td className="num text-right text-emerald-700">{formatMoney(row.amountIn)}</td>
                  <td className="num text-right text-red-600">{formatMoney(row.amountOut)}</td>
                  <td className="num text-right font-medium">{formatMoney(row.balance)}</td>
                  <td>{row.currency}</td>
                  <td className="text-slate-500">{row.method ?? '—'}</td>
                  <td className="text-slate-500">{row.bankAccount?.nameLo ?? '—'}</td>
                  <td className="text-slate-500">{row.order.status}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-3">
                      {Number(row.order.balanceAmount) > 0 && (
                        <Link href="/fc/orders" className="text-sm text-emerald-700 hover:underline">
                          Payment
                        </Link>
                      )}
                      <button className="text-sm text-gold-700 hover:underline"
                        onClick={() => setViewing(viewing === row.id ? null : row.id)}>
                        View
                      </button>
                    </div>
                  </td>
                </tr>
                {viewing === row.id && (
                  <tr key={`${row.id}-d`}>
                    <td colSpan={13} className="bg-slate-50 p-4">
                      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                        <F labelLo="ຊື່ພະນັກງານທີ່ຮັບ Order" value={row.order.staffName} />
                        <F labelLo="ລາຍການ" value={row.order.goldItem?.nameLo ?? '—'} />
                        <F labelLo="ນ້ຳໜັກ (g)" value={formatWeight(row.order.weightG)} />
                        <F labelLo="ຈຳນວນ" value={String(row.order.quantity)} />
                        <F labelLo="Supplier" value={row.order.supplier?.nameLo ?? '—'} />
                        <F labelLo="ວັນທີຮັບເຄື່ອງຈາກຊ່າງ" value={formatDate(row.order.receivedFromSmithAt)} />
                        <F labelLo="ວັນທີລູກຄ້າມາຮັບເຄື່ອງ" value={formatDate(row.order.customerPickupAt)} />
                        <F labelLo="ຍອດຄົງເຫຼືອ" value={`${formatMoney(row.order.balanceAmount)} LAK`} />
                      </div>
                    </td>
                  </tr>
                )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...pager} />
      </div>
    </div>
  );
}

function F({ labelLo, value }: { labelLo: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelLo}</div>
      <div className="num mt-0.5 font-semibold text-slate-800">{value}</div>
    </div>
  );
}
