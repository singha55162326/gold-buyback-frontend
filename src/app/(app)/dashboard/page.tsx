'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, getStoredUser } from '@/lib/api';
import { PageHead } from '@/components/page-head';
import { ReadinessPanel } from '@/components/readiness-panel';
import { formatLak, formatRate, formatMoney, formatWeight, formatDate, gramsToBaht } from '@/lib/format';
import { StatCard } from '@/components/stat-card';

interface PriceLine {
  tierCode: string; labelLo: string;
  category: 'JEWELRY' | 'BAR';
  sellPrice: string; buybackPrice: string;
}
interface PriceBoard { price1Baht: string; effectiveAt: string; lines: PriceLine[] }
interface Rates { thbSellRate: string; usdSellRate: string; thbBuybackRate: string; usdBuybackRate: string }
interface Wac { totalWeightG: string; totalCost: string; pricePerG: string; pricePerBaht: string }
interface Coh {
  cash: Array<{ currency: string; coh: string; advance: string }>;
  gold: { cohG: string; cohBaht: string; newG: string; oldG: string };
}
interface Advance { totals: Array<{ currency: string; net: string }>; billCount: number }

/** TOR §3.7 — Dashboard. */
export default function DashboardPage() {
  const user = getStoredUser();
  const isFinance =
    user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'FINANCIAL_CONTROLLER';
  const seesGold = isFinance || user?.role === 'WAREHOUSE';

  const { data: board } = useQuery({
    queryKey: ['pricing', 'current'],
    queryFn: () => api.get<PriceBoard>('/pricing/current'),
    retry: false,
  });
  const { data: rates } = useQuery({
    queryKey: ['rates', 'current'],
    queryFn: () => api.get<Rates>('/rates/current'),
    retry: false,
  });
  const { data: wac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
    retry: false,
    enabled: seesGold,
  });
  const { data: coh } = useQuery({
    queryKey: ['ledger', 'coh'],
    queryFn: () => api.get<Coh>('/ledger/coh'),
    retry: false,
    enabled: isFinance,
  });
  const { data: advance } = useQuery({
    queryKey: ['finance', 'advance'],
    queryFn: () => api.get<Advance>('/finance/advance'),
    retry: false,
    enabled: isFinance,
  });

  const cohLak = coh?.cash.find((c) => c.currency === 'LAK');
  const advanceLak = advance?.totals.find((t) => t.currency === 'LAK');

  return (
    <div className="space-y-6">
      <PageHead
        title="Dashboard"
        subtitle={user ? `ສະບາຍດີ ${user.fullName}` : 'ພາບລວມຂອງມື້ນີ້'}
      />

      {/* Setup gaps fail silently at the counter, so they belong above the
          numbers — and only Admin/Manager can act on them. */}
      {isFinance && <ReadinessPanel />}

      {/* Everyone sees the price of the day — it drives every transaction. */}
      <div className="stat-grid">
        <StatCard label="ລາຄາຂາຍ 1 ບາດ"
          value={board ? `${formatLak(board.price1Baht)} ກີບ` : '—'}
          sub={board ? `ອັບເດດ ${formatDate(board.effectiveAt)}` : 'ຍັງບໍ່ໄດ້ຕັ້ງລາຄາ'} />
        <StatCard label="THB Sell / Buyback"
          value={rates ? `${formatRate(rates.thbSellRate)} / ${formatRate(rates.thbBuybackRate)}` : '—'}
          sub="THB/LAK" />
        <StatCard label="USD Sell / Buyback"
          value={rates ? `${formatRate(rates.usdSellRate)} / ${formatRate(rates.usdBuybackRate)}` : '—'}
          sub="USD/LAK" />
        {seesGold ? (
          <StatCard label="WAC ລາຄາ/ບາດ"
            value={wac ? formatLak(wac.pricePerBaht) : '—'}
            sub={wac ? `${formatWeight(wac.totalWeightG)} g ໃນສາງ` : ''} />
        ) : (
          <StatCard label="ຮູບປະພັນ 1 ບາດ ຊື້ຄືນ"
            value={board ? formatLak(board.lines[0]?.buybackPrice ?? '0') : '—'}
            sub="ລາຄາຊື້ຄືນໜ້າຮ້ານ" />
        )}

        {isFinance && (
          <>
          <StatCard label="COH Cash (LAK)" value={cohLak ? formatMoney(cohLak.coh) : '—'}
            sub="ຫຼັງຫັກ AP, Advance ແລະ ບວກ AR" />
          <StatCard label="Advance (LAK)" value={advanceLak ? formatMoney(advanceLak.net) : '—'}
            sub={advance ? `${advance.billCount} ບິນທີ່ຍັງເປີດ` : ''} />
          <StatCard label="COH Gold" value={coh ? `${formatWeight(coh.gold.cohG)} g` : '—'}
            sub={coh ? `${formatWeight(coh.gold.cohBaht)} ບາດ` : ''} />
          <StatCard label="ຕົ້ນທຶນຄຳໃນສາງ" value={wac ? formatLak(wac.totalCost) : '—'} sub="LAK" />
        </>
        )}

        {seesGold && coh && (
          <>
          <StatCard label="Stock (NEW)" value={`${formatWeight(coh.gold.newG)} g`}
            sub={`${gramsToBaht(coh.gold.newG)} ບາດ`} />
          <StatCard label="Stock (OLD)" value={`${formatWeight(coh.gold.oldG)} g`}
            sub={`${gramsToBaht(coh.gold.oldG)} ບາດ`} />
          </>
        )}
      </div>

      <div className="card" data-fade>
        <div className="card-header">
          <h2 className="card-title">ຕາຕະລາງລາຄາປັດຈຸບັນ</h2>
          <Link href="/admin/products" className="btn-ghost">
            ຈັດການ Products →
          </Link>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ຕາຕະລາງລາຄາປັດຈຸບັນ">
          <table className="table">
            <thead>
              <tr>
                <th>ໝວດ / ລາຍການ</th>
                <th className="text-right">ລາຄາຂາຍ (LAK)</th>
                <th className="text-right">ລາຄາຊື້ຄືນ (LAK)</th>
              </tr>
            </thead>
            <tbody>
              {!board && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-muted">
                    ຍັງບໍ່ມີການຕັ້ງລາຄາ — ໄປທີ່ ຈັດການ Products ເພື່ອຕັ້ງລາຄາຂາຍ 1 ບາດ
                  </td>
                </tr>
              )}
              {(board?.lines ?? []).map((line) => (
                <tr key={line.tierCode}>
                  <td>{line.labelLo}</td>
                  <td className="num sell-price text-right">{formatLak(line.sellPrice)}</td>
                  <td className="num text-right">{formatLak(line.buybackPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

