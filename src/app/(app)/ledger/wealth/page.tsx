'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLak, formatRate, formatMoney, formatWeight } from '@/lib/format';

interface Wealth {
  totalLak: string; totalThb: string; totalUsd: string;
  thbSellRate: string; usdSellRate: string; price1Baht: string;
  /** Converted server-side in Decimal — never multiplied in the browser. */
  thbInLak: string; usdInLak: string;
  grandTotalLak: string; weightG: string; baht: string;
}

/** TOR §3.7 — Module Wealth. */
export default function WealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ledger', 'wealth'],
    queryFn: () => api.get<Wealth>('/ledger/wealth'),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Wealth</h1>
        <p className="mt-1 text-sm text-slate-500">
          ມູນຄ່າລວມແປງເປັນ LAK ແລະ ທຽບເປັນນ້ຳໜັກຄຳ (TOR §3.7)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat labelLo="ລວມ LAK" value={data ? formatLak(data.grandTotalLak) : '—'} hint="ທັງໝົດແປງເປັນກີບ" />
        <Stat labelLo="ນ້ຳໜັກ (g)" value={data ? formatWeight(data.weightG) : '—'} hint="ຖ້າຊື້ຄຳທັງໝົດ" />
        <Stat labelLo="ບາດຄຳ" value={data ? formatWeight(data.baht) : '—'} hint="= g / 15" />
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ລາຍລະອຽດ</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ລາຍການ</th>
                <th className="text-right">ຈຳນວນ</th>
                <th className="text-right">ອັດຕາຂາຍ</th>
                <th className="text-right">ມູນຄ່າ (LAK)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="py-6 text-center text-slate-400">ກຳລັງໂຫຼດ...</td></tr>}
              {data && (
                <>
                  <tr>
                    <td>TOTAL Cash + Bank (LAK)</td>
                    <td className="num text-right">{formatMoney(data.totalLak)}</td>
                    <td className="num text-right text-slate-400">1</td>
                    <td className="num text-right">{formatLak(data.totalLak)}</td>
                  </tr>
                  <tr>
                    <td>TOTAL THB</td>
                    <td className="num text-right">{formatMoney(data.totalThb)}</td>
                    <td className="num text-right">{formatRate(data.thbSellRate)}</td>
                    <td className="num text-right">
                      {formatLak(data.thbInLak)}
                    </td>
                  </tr>
                  <tr>
                    <td>TOTAL USD</td>
                    <td className="num text-right">{formatMoney(data.totalUsd)}</td>
                    <td className="num text-right">{formatRate(data.usdSellRate)}</td>
                    <td className="num text-right">
                      {formatLak(data.usdInLak)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50 font-semibold">
                    <td>ລວມ LAK</td>
                    <td colSpan={2} />
                    <td className="num text-right">{formatLak(data.grandTotalLak)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            ນ້ຳໜັກ (g) = (ລວມ LAK / ລາຄາຂາຍ 1 ບາດ {formatLak(data.price1Baht)}) × 15
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ labelLo, value, hint }: { labelLo: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelLo}</div>
      <div className="num mt-1 text-xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
