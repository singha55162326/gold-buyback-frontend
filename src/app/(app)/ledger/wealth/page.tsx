'use client';

import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/page-head';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatRate, formatMoney, formatWeight } from '@/lib/format';
import { StatCard } from '@/components/stat-card';
import { TableStateRow } from '@/components/query-state';

interface Wealth {
  totalLak: string; totalThb: string; totalUsd: string;
  thbSellRate: string; usdSellRate: string; price1Baht: string;
  /** Converted server-side in Decimal — never multiplied in the browser. */
  thbInLak: string; usdInLak: string;
  grandTotalLak: string; weightG: string; baht: string;
}

/** TOR §3.7 — Module Wealth. */
export default function WealthPage() {
  const { data, isLoading, isError: failedRaw, error, refetch } = useQuery({
    queryKey: ['ledger', 'wealth'],
    queryFn: () => api.get<Wealth>('/ledger/wealth'),
    retry: false,
  });
  // A 404 means "not configured yet", which the page already shows as empty.
  const isError = failedRaw && !(error instanceof ApiError && error.status === 404);

  return (
    <div className="space-y-6">
      <PageHead
        title="Wealth"
        subtitle="ມູນຄ່າລວມແປງເປັນ LAK ແລະ ທຽບເປັນນ້ຳໜັກຄຳ (TOR §3.7)"
      />

      <div className="stat-grid">
        <StatCard label="ລວມ LAK" value={data ? formatLak(data.grandTotalLak) : '—'} sub="ທັງໝົດແປງເປັນກີບ" />
        <StatCard label="ນ້ຳໜັກ (g)" value={data ? formatWeight(data.weightG) : '—'} sub="ຖ້າຊື້ຄຳທັງໝົດ" />
        <StatCard label="ບາດຄຳ" value={data ? formatWeight(data.baht) : '—'} sub="= g / 15" />
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ລາຍລະອຽດ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ລາຍລະອຽດ">
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
              <TableStateRow colSpan={4} isLoading={isLoading} isError={isError} error={error} isEmpty={false} emptyText="" onRetry={() => void refetch()} />
              {data && (
                <>
                  <tr>
                    <td>TOTAL Cash + Bank (LAK)</td>
                    <td className="num text-right">{formatMoney(data.totalLak)}</td>
                    <td className="num text-right text-muted">1</td>
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
                  <tr className="font-semibold text-fg-strong [&>td]:border-t-2 [&>td]:border-gold">
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
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            ນ້ຳໜັກ (g) = (ລວມ LAK / ລາຄາຂາຍ 1 ບາດ {formatLak(data.price1Baht)}) × 15
          </p>
        )}
      </div>
    </div>
  );
}

