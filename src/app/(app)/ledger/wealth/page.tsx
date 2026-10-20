'use client';

import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/page-head';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatDate } from '@/lib/format';
import { StatCard } from '@/components/stat-card';
import { TableStateRow } from '@/components/query-state';

interface Wealth {
  totalLak: string; totalThb: string; totalUsd: string;
  thbSellRate: string; usdSellRate: string; price1Baht: string;
  /** Converted server-side in Decimal — never multiplied in the browser. */
  thbInLak: string; usdInLak: string;
  grandTotalLak: string; weightG: string; baht: string;
}

/** ໜຶ່ງແຖວຕໍ່ມື້ການຄ້າ — ຕົວເລກລ້ວນມາຈາກ server. */
interface WealthDay {
  businessDayId: string;
  date: string;
  broughtForwardG: string;
  netG: string;
  differenceG: string;
}

/**
 * TOR §3.7 — Module Wealth.
 *
 * ໜ້າຈໍສະແດງ 30 ມື້ລ່າສຸດ: ຍົກມາ / ສຸດທິ / ສ່ວນຕ່າງ ເປັນນ້ຳໜັກຄຳ. ລາຍລະອຽດ
 * ການແປງສະກຸນເງິນ (THB/USD → LAK) ຍັງຄຳນວນຢູ່ຫຼັງບ້ານ ແລະ ດຶງໄດ້ຈາກ API
 * ແຕ່ບໍ່ສະແດງຢູ່ໜ້ານີ້ ຕາມທີ່ລູກຄ້າຂໍ.
 */
export default function WealthPage() {
  const { data, isError: failedRaw, error } = useQuery({
    queryKey: ['ledger', 'wealth'],
    queryFn: () => api.get<Wealth>('/ledger/wealth'),
    retry: false,
  });
  // A 404 means "not configured yet", which the page already shows as empty.
  const isError = failedRaw && !(error instanceof ApiError && error.status === 404);

  const days = useQuery({
    queryKey: ['ledger', 'wealth', 'history'],
    queryFn: () => api.get<WealthDay[]>('/ledger/wealth/history'),
    retry: false,
  });
  const rows = days.data ?? [];

  return (
    <div className="space-y-6">
      <PageHead
        title="Wealth"
        subtitle="ຍອດຄຳຍົກມາ ແລະ ຍອດຄຳສຸດທິ ຕໍ່ມື້ການຄ້າ — 30 ມື້ລ່າສຸດ (TOR §3.7)"
      />

      <div className="stat-grid">
        <StatCard label="ລວມ LAK" value={data && !isError ? formatLak(data.grandTotalLak) : '—'} sub="ທັງໝົດແປງເປັນກີບ" />
        <StatCard label="ນ້ຳໜັກ (g)" value={data && !isError ? formatWeight(data.weightG) : '—'} sub="ຖ້າຊື້ຄຳທັງໝົດ" />
        <StatCard label="ບາດຄຳ" value={data && !isError ? formatWeight(data.baht) : '—'} sub="= g / 15" />
      </div>

      <div data-fade className="card">
        <div className="card-header">
          <h2 className="card-title">ຍອດຄຳຕໍ່ມື້</h2>
          <span className="num text-xs text-muted">{rows.length} ມື້</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ຍອດຄຳຕໍ່ມື້">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th className="text-right">ຍອດຄຳຍົກມາ (g)</th>
                <th className="text-right">ຍອດຄຳສຸດທິ (g)</th>
                <th className="text-right">ສ່ວນຕ່າງ (g)</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow
                colSpan={4}
                isLoading={days.isLoading}
                isError={days.isError}
                error={days.error}
                isEmpty={rows.length === 0}
                emptyText="ຍັງບໍ່ມີຂໍ້ມູນຍອດຄຳລາຍວັນ"
                onRetry={() => void days.refetch()}
              />
              {rows.map((row) => (
                <tr key={row.businessDayId}>
                  <td>{formatDate(row.date)}</td>
                  <td className="num text-right">{formatWeight(row.broughtForwardG)}</td>
                  <td className="num text-right">{formatWeight(row.netG)}</td>
                  <td className={`num text-right font-medium ${Number(row.differenceG) < 0 ? 'text-danger' : ''}`}>
                    {formatWeight(row.differenceG)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          ຍົກມາ = ຍອດຕົ້ນມື້ຂອງ ສາງຄຳເກົ່າ + ສາງຄຳໃໝ່ · ສຸດທິ = ຍອດທ້າຍມື້ຂອງສອງສາງ ·
          ສ່ວນຕ່າງ = ຍົກມາ − ສຸດທິ
        </p>
      </div>
    </div>
  );
}
