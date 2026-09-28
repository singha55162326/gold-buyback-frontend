'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, getStoredUser } from '@/lib/api';
import { ReadinessPanel } from '@/components/readiness-panel';
import { formatLak, formatRate, formatMoney, formatWeight, formatDate, gramsToBaht } from '@/lib/format';

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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user ? `ສະບາຍດີ ${user.fullName}` : 'ພາບລວມຂອງມື້ນີ້'}
        </p>
      </div>

      {/* Setup gaps fail silently at the counter, so they belong above the
          numbers — and only Admin/Manager can act on them. */}
      {isFinance && <ReadinessPanel />}

      {/* Everyone sees the price of the day — it drives every transaction. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat labelLo="ລາຄາຂາຍ 1 ບາດ"
          value={board ? `${formatLak(board.price1Baht)} ກີບ` : '—'}
          hint={board ? `ອັບເດດ ${formatDate(board.effectiveAt)}` : 'ຍັງບໍ່ໄດ້ຕັ້ງລາຄາ'} />
        <Stat labelLo="THB Sell / Buyback"
          value={rates ? `${formatRate(rates.thbSellRate)} / ${formatRate(rates.thbBuybackRate)}` : '—'}
          hint="THB/LAK" />
        <Stat labelLo="USD Sell / Buyback"
          value={rates ? `${formatRate(rates.usdSellRate)} / ${formatRate(rates.usdBuybackRate)}` : '—'}
          hint="USD/LAK" />
        {seesGold ? (
          <Stat labelLo="WAC ລາຄາ/ບາດ"
            value={wac ? formatLak(wac.pricePerBaht) : '—'}
            hint={wac ? `${formatWeight(wac.totalWeightG)} g ໃນສາງ` : ''} />
        ) : (
          <Stat labelLo="ຮູບປະພັນ 1 ບາດ ຊື້ຄືນ"
            value={board ? formatLak(board.lines[0]?.buybackPrice ?? '0') : '—'}
            hint="ລາຄາຊື້ຄືນໜ້າຮ້ານ" />
        )}
      </div>

      {isFinance && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat labelLo="COH Cash (LAK)" value={cohLak ? formatMoney(cohLak.coh) : '—'}
            hint="ຫຼັງຫັກ AP, Advance ແລະ ບວກ AR" />
          <Stat labelLo="Advance (LAK)" value={advanceLak ? formatMoney(advanceLak.net) : '—'}
            hint={advance ? `${advance.billCount} ບິນທີ່ຍັງເປີດ` : ''} />
          <Stat labelLo="COH Gold" value={coh ? `${formatWeight(coh.gold.cohG)} g` : '—'}
            hint={coh ? `${formatWeight(coh.gold.cohBaht)} ບາດ` : ''} />
          <Stat labelLo="ຕົ້ນທຶນຄຳໃນສາງ" value={wac ? formatLak(wac.totalCost) : '—'} hint="LAK" />
        </div>
      )}

      {seesGold && coh && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat labelLo="Stock (NEW)" value={`${formatWeight(coh.gold.newG)} g`}
            hint={`${gramsToBaht(coh.gold.newG)} ບາດ`} />
          <Stat labelLo="Stock (OLD)" value={`${formatWeight(coh.gold.oldG)} g`}
            hint={`${gramsToBaht(coh.gold.oldG)} ບາດ`} />
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">ຕາຕະລາງລາຄາປັດຈຸບັນ</h2>
          <Link href="/admin/products" className="text-sm text-gold-700 hover:underline">
            ຈັດການ Products →
          </Link>
        </div>
        <div className="table-wrap">
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
                  <td colSpan={3} className="py-8 text-center text-slate-500">
                    ຍັງບໍ່ມີການຕັ້ງລາຄາ — ໄປທີ່ ຈັດການ Products ເພື່ອຕັ້ງລາຄາຂາຍ 1 ບາດ
                  </td>
                </tr>
              )}
              {(board?.lines ?? []).map((line) => (
                <tr key={line.tierCode}>
                  <td>{line.labelLo}</td>
                  <td className="num text-right font-medium">{formatLak(line.sellPrice)}</td>
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

function Stat({ labelLo, value, hint }: { labelLo: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelLo}</div>
      <div className="num mt-1 text-xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
