'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney, formatWeight } from '@/lib/format';

interface Coh {
  cash: Array<{
    currency: 'LAK' | 'THB' | 'USD';
    cash: string; bcel: string; ldb: string; otherBank: string;
    ap: string; ar: string; coh: string;
  }>;
  gold: { newG: string; oldG: string; apG: string; arG: string; cohG: string; cohBaht: string };
}

/** TOR §3.7 — COH Cash ແລະ COH Gold. */
export default function CohPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ledger', 'coh'],
    queryFn: () => api.get<Coh>('/ledger/coh'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">COH — Cash & Gold On Hand</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຍອດເງິນ ແລະ ຄຳທີ່ຖືຢູ່ຈິງ ຫຼັງຫັກ AP ແລະ ບວກ AR (TOR §3.7)
        </p>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">COH Cash</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ສະກຸນເງິນ</th>
                <th className="text-right">ເງິນສົດ</th>
                <th className="text-right">BCEL</th>
                <th className="text-right">LDB</th>
                <th className="text-right">ທະນາຄານອື່ນ</th>
                <th className="text-right">AP (−)</th>
                <th className="text-right">AR (+)</th>
                <th className="text-right">COH Cash</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="py-6 text-center text-slate-400">ກຳລັງໂຫຼດ...</td></tr>}
              {data?.cash.map((row) => (
                <tr key={row.currency}>
                  <td className="font-medium">{row.currency}</td>
                  <td className="num text-right">{formatMoney(row.cash)}</td>
                  <td className="num text-right">{formatMoney(row.bcel)}</td>
                  <td className="num text-right">{formatMoney(row.ldb)}</td>
                  <td className="num text-right">{formatMoney(row.otherBank)}</td>
                  <td className="num text-right text-red-600">{formatMoney(row.ap)}</td>
                  <td className="num text-right text-emerald-700">{formatMoney(row.ar)}</td>
                  <td className="num text-right font-semibold">{formatMoney(row.coh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          COH Cash = Cash + BCEL + LDB + Other Bank − AP + AR
        </p>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">COH Gold</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="text-right">ຄຳໃໝ່ (g)</th>
                <th className="text-right">ຄຳເກົ່າ (g)</th>
                <th className="text-right">AP (g)</th>
                <th className="text-right">AR (g)</th>
                <th className="text-right">COH Gold (g)</th>
                <th className="text-right">ບາດຄຳ</th>
              </tr>
            </thead>
            <tbody>
              {data && (
                <tr>
                  <td className="num text-right">{formatWeight(data.gold.newG)}</td>
                  <td className="num text-right">{formatWeight(data.gold.oldG)}</td>
                  <td className="num text-right text-red-600">{formatWeight(data.gold.apG)}</td>
                  <td className="num text-right text-emerald-700">{formatWeight(data.gold.arG)}</td>
                  <td className="num text-right font-semibold">{formatWeight(data.gold.cohG)}</td>
                  <td className="num text-right">{formatWeight(data.gold.cohBaht)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          COH Gold = Gold NEW(g) + Gold OLD(g) − AP + AR
        </p>
      </div>
    </div>
  );
}
