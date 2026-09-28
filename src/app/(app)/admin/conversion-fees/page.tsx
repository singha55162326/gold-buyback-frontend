'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLak, formatWeight } from '@/lib/format';

interface JewelryFee {
  id: string;
  tierCode: string;
  weightG: string;
  feeGoodShape: string;
  feeDamagedShape: string;
  tier: { labelLo: string; sortOrder: number };
}

interface BarFee {
  id: string;
  weightG: string;
  barToJewelry: string;
  barToBar: string;
}

/** TOR §3.4 — ຈັດການ ຄ່າປ່ຽນ (ຮູບປະພັນ ແລະ ຄຳແທ່ງ). */
export default function ConversionFeesPage() {
  const { data: jewelry = [] } = useQuery({
    queryKey: ['fees', 'conversion', 'jewelry'],
    queryFn: () => api.get<JewelryFee[]>('/fees/conversion/jewelry'),
  });

  const { data: bar = [] } = useQuery({
    queryKey: ['fees', 'conversion', 'bar'],
    queryFn: () => api.get<BarFee[]>('/fees/conversion/bar'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ຈັດການ ຄ່າປ່ຽນ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຄ່າປ່ຽນທີ່ໃຊ້ໃນລາຍການປ່ຽນເປັນເງິນ (TOR §3.4)
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ຄ່າປ່ຽນຮູບປະພັນ</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU / ຫົວໜ່ວຍ</th>
                <th className="text-right">ນ້ຳໜັກ / g</th>
                <th className="text-right">ຄ່າປ່ຽນຮູບປະພັນດີ (LAK)</th>
                <th className="text-right">ຄ່າປ່ຽນເສຍຮູບ (LAK)</th>
              </tr>
            </thead>
            <tbody>
              {jewelry.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.tier.labelLo}</td>
                  <td className="num text-right">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{formatLak(row.feeGoodShape)}</td>
                  <td className="num text-right">{formatLak(row.feeDamagedShape)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ຄ່າປ່ຽນຄຳແທ່ງ</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="text-right">ນ້ຳໜັກ / g</th>
                <th className="text-right">ຄຳແທ່ງ-ຮູບປະພັນ (LAK)</th>
                <th className="text-right">ຄຳແທ່ງ-ຄຳແທ່ງ (LAK)</th>
              </tr>
            </thead>
            <tbody>
              {bar.map((row) => (
                <tr key={row.id}>
                  <td className="num text-right font-medium">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{formatLak(row.barToJewelry)}</td>
                  <td className="num text-right">{formatLak(row.barToBar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
