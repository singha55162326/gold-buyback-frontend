'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLak, formatWeight, gramsToBaht } from '@/lib/format';

interface Wac {
  newWeightG: string; newCost: string;
  oldWeightG: string; oldCost: string;
  totalWeightG: string; totalCost: string;
  pricePerG: string; pricePerBaht: string;
}

/** TOR §3.7 — WAC ປັດຈຸບັນ. Always derived from the newest ledger rows. */
export default function WacPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">WAC ປັດຈຸບັນ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຕົ້ນທຶນສະເລ່ຍຖ່ວງນ້ຳໜັກຂອງຄຳທັງໝົດໃນສາງ (TOR §3.7)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat labelLo="ລວມ GOLD (g)" value={data ? formatWeight(data.totalWeightG) : '—'} hint={data ? `${gramsToBaht(data.totalWeightG)} ບາດ` : ''} />
        <Stat labelLo="ລວມຕົ້ນທຶນ" value={data ? formatLak(data.totalCost) : '—'} hint="LAK" />
        <Stat labelLo="ລາຄາ/g" value={data ? formatLak(data.pricePerG) : '—'} hint="LAK / g" />
        <Stat labelLo="ລາຄາ/ບາດ" value={data ? formatLak(data.pricePerBaht) : '—'} hint="ລາຄາ/g × 15" />
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ແຍກຕາມສາງ</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ສາງ</th>
                <th className="text-right">ຄຳ (g)</th>
                <th className="text-right">ບາດ</th>
                <th className="text-right">ຕົ້ນທຶນ (LAK)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="py-6 text-center text-slate-400">ກຳລັງໂຫຼດ...</td></tr>}
              {data && (
                <>
                  <tr>
                    <td className="font-medium">Stock (NEW) — ສາງຄຳໃໝ່</td>
                    <td className="num text-right">{formatWeight(data.newWeightG)}</td>
                    <td className="num text-right">{gramsToBaht(data.newWeightG)}</td>
                    <td className="num text-right">{formatLak(data.newCost)}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">Stock (OLD) — ສາງຄຳເກົ່າ</td>
                    <td className="num text-right">{formatWeight(data.oldWeightG)}</td>
                    <td className="num text-right">{gramsToBaht(data.oldWeightG)}</td>
                    <td className="num text-right">{formatLak(data.oldCost)}</td>
                  </tr>
                  <tr className="bg-slate-50 font-semibold">
                    <td>ລວມ</td>
                    <td className="num text-right">{formatWeight(data.totalWeightG)}</td>
                    <td className="num text-right">{gramsToBaht(data.totalWeightG)}</td>
                    <td className="num text-right">{formatLak(data.totalCost)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
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
