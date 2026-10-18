'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLak, formatWeight, formatDate } from '@/lib/format';

interface Summary { side: 'AP' | 'AR'; startG: string; netMovementG: string; totalG: string; totalBaht: string }
interface PartnerRow {
  partnerId: string; partnerCode: string; partnerNameLo: string; side: 'AP' | 'AR';
  broughtForwardG: string; increasesG: string; decreasesG: string; currentG: string;
}
interface HistoryRow {
  id: string; businessDate: string; side: 'AP' | 'AR'; typeLabel: string;
  goldInG: string; goldOutG: string; weightG: string;
  priceIn: string; priceOut: string; cost: string;
  partner: { nameLo: string };
}

const SIDE_LABEL = {
  AR: 'AR (GOLD) — ໜີ້ຕ້ອງຮັບຄຳ (FACTORY / ຊ່າງ)',
  AP: 'AP (GOLD) — ໜີ້ຕ້ອງສົ່ງຄຳ (Vendor)',
} as const;

/** TOR §8 — AP/AR (GOLD). */
export function ApArGoldModule({ side }: { side: 'AP' | 'AR' }) {
  // One window per side (TOR §8.2, §8.3); the shape is identical so the
  // two pages share this component rather than duplicating it.
  const { data: summary = [] } = useQuery({
    queryKey: ['ledger', 'ap-ar', 'gold'],
    queryFn: () => api.get<Summary[]>('/ledger/ap-ar/gold'),
  });
  const { data: partners = [] } = useQuery({
    queryKey: ['ledger', 'ap-ar', 'gold', 'partners'],
    queryFn: () => api.get<PartnerRow[]>('/ledger/ap-ar/gold/partners'),
  });
  const { data: history = [] } = useQuery({
    queryKey: ['ledger', 'ap-ar', 'gold', 'history'],
    queryFn: () => api.get<HistoryRow[]>('/ledger/ap-ar/gold/history'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{SIDE_LABEL[side]}</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຕິດຕາມພັນທະຄຳກັບຄູ່ຄ້າ — EASY / FACTORY / ຊ່າງນອກ / ອື່ນໆ
          (TOR {side === 'AP' ? '§8.2' : '§8.3'})
        </p>
      </div>

      {/* With every gold movement booked to AP per §8.4 / §7.4, this window has
          no posting rule feeding it. Saying so is kinder than letting a row of
          zeros read as a broken report. */}
      {side === 'AR' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ຕາມທີ່ຕົກລົງກັບລູກຄ້າ — ທຸກການເໜັງຕີງຄຳລົງບັນຊີຢູ່ <strong>AP (GOLD)</strong> ໝົດ
          (TOR §8.4 ແລະ §7.4): ຮັບເຂົ້າ = AP (+), ສົ່ງອອກ = AP (−).
          ໜ້ານີ້ຈຶ່ງບໍ່ມີລາຍການ ແລະ ຍອດເປັນ 0 — ບໍ່ແມ່ນລະບົບຜິດພາດ.
          ຖ້າຕ້ອງການໃຫ້ຄຳສົ່ງອອກລົງເປັນ AR ແທນ ແກ້ໄດ້ທີ່ຕາຕະລາງກົດ AP/AR (GOLD) ໂດຍບໍ່ຕ້ອງແກ້ໂຄ້ດ.
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2 className="card-title">ຍອດລວມ {side} (GOLD)</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ປະເພດ</th>
                <th className="text-right">ຍອດຕັ້ງຕົ້ນ (g)</th>
                <th className="text-right">ຍອດເຄື່ອນໄຫວ (g)</th>
                <th className="text-right">ຍອດສຸດທິ (g)</th>
                <th className="text-right">ບາດຄຳ</th>
              </tr>
            </thead>
            <tbody>
              {summary.filter((r) => r.side === side).map((row) => (
                <tr key={row.side}>
                  <td className="font-medium">{SIDE_LABEL[row.side]}</td>
                  <td className="num text-right">{formatWeight(row.startG)}</td>
                  <td className="num text-right">{formatWeight(row.netMovementG)}</td>
                  <td className="num text-right font-semibold">{formatWeight(row.totalG)}</td>
                  <td className="num text-right">{formatWeight(row.totalBaht)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ແຍກຕາມແຫຼ່ງ</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ແຫຼ່ງ</th>
                <th>ດ້ານ</th>
                <th className="text-right">ຍອດຍົກມາ (g)</th>
                <th className="text-right">(+) g</th>
                <th className="text-right">(−) g</th>
                <th className="text-right">ຍອດປັດຈຸບັນ (g)</th>
              </tr>
            </thead>
            <tbody>
              {partners.filter((r) => r.side === side).length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">ຍັງບໍ່ມີຂໍ້ມູນ</td></tr>
              )}
              {partners.filter((r) => r.side === side).map((row) => (
                <tr key={`${row.partnerId}-${row.side}`}>
                  <td className="font-medium">{row.partnerNameLo}</td>
                  <td><span className={row.side === 'AP' ? 'badge bg-red-100 text-red-800' : 'badge bg-emerald-100 text-emerald-800'}>{row.side}</span></td>
                  <td className="num text-right">{formatWeight(row.broughtForwardG)}</td>
                  <td className="num text-right text-emerald-700">{formatWeight(row.increasesG)}</td>
                  <td className="num text-right text-red-600">{formatWeight(row.decreasesG)}</td>
                  <td className="num text-right font-semibold">{formatWeight(row.currentG)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ AP-AR (GOLD)</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ແຫຼ່ງ</th>
                <th>ປະເພດ</th>
                <th className="text-right">ຄຳເຂົ້າ (g)</th>
                <th className="text-right">ຄຳອອກ (g)</th>
                <th className="text-right">ນ້ຳໜັກ</th>
                <th className="text-right">ຕົ້ນທຶນເຂົ້າ</th>
                <th className="text-right">ຕົ້ນທຶນອອກ</th>
                <th className="text-right">ຕົ້ນທຶນ</th>
              </tr>
            </thead>
            <tbody>
              {history.filter((r) => r.side === side).length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {history.filter((r) => r.side === side).map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td>{row.partner.nameLo}</td>
                  <td className="text-slate-500">{row.typeLabel}</td>
                  <td className="num text-right">{formatWeight(row.goldInG)}</td>
                  <td className="num text-right">{formatWeight(row.goldOutG)}</td>
                  <td className="num text-right font-medium">{formatWeight(row.weightG)}</td>
                  <td className="num text-right">{formatLak(row.priceIn)}</td>
                  <td className="num text-right">{formatLak(row.priceOut)}</td>
                  <td className="num text-right font-medium">{formatLak(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
