'use client';

import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/page-head';
import { api } from '@/lib/api';
import { formatLak, formatWeight, gramsToBaht } from '@/lib/format';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';

interface Wac {
  newWeightG: string; newCost: string;
  oldWeightG: string; oldCost: string;
  totalWeightG: string; totalCost: string;
  pricePerG: string; pricePerBaht: string;
}

/** TOR §3.7 — WAC ປັດຈຸບັນ. Always derived from the newest ledger rows. */
export default function WacPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="WAC ປັດຈຸບັນ"
        subtitle="ຕົ້ນທຶນສະເລ່ຍຖ່ວງນ້ຳໜັກຂອງຄຳທັງໝົດໃນສາງ (TOR §3.7)"
      />

      <div className="stat-grid">
        <StatCard label="ລວມ GOLD (g)" value={data ? formatWeight(data.totalWeightG) : '—'} sub={data ? `${gramsToBaht(data.totalWeightG)} ບາດ` : ''} />
        <StatCard label="ລວມຕົ້ນທຶນ" value={data ? formatLak(data.totalCost) : '—'} sub="LAK" />
        <StatCard label="ລາຄາ/g" value={data ? formatLak(data.pricePerG) : '—'} sub="LAK / g" />
        <StatCard label="ລາຄາ/ບາດ" value={data ? formatLak(data.pricePerBaht) : '—'} sub="ລາຄາ/g × 15" />
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ແຍກຕາມສາງ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ແຍກຕາມສາງ">
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
              <TableStateRow colSpan={4} isLoading={isLoading} isError={isError} error={error} isEmpty={false} emptyText="" onRetry={() => void refetch()} />
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
                  <tr className="font-semibold text-fg-strong [&>td]:border-t-2 [&>td]:border-gold">
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

