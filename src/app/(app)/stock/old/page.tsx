'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getStoredUser } from '@/lib/api';
import { StockMovementDialog, type MovementKind } from '@/components/stock-movement-dialog';
import { formatLak, formatWeight, formatDate, gramsToBaht } from '@/lib/format';

interface Wac { oldWeightG: string; oldCost: string }
interface TypeBalance {
  id: string; openingWeightG: string; openingCost: string;
  inG: string; outG: string; priceIn: string; priceOut: string;
  closingWeightG: string; closingCost: string;
  goldType: { nameLo: string };
}
interface LedgerRow {
  id: string; businessDate: string; partnerLabel: string | null; typeLabel: string;
  goldInG: string; goldOutG: string; weightG: string;
  priceIn: string; priceOut: string; cost: string;
  goldType: { nameLo: string };
}

/** TOR §7.3 — Stock (OLD), ສາງຄຳເກົ່າ. */
export default function StockOldPage() {
  const [dialog, setDialog] = useState<MovementKind | null>(null);
  const user = getStoredUser();
  const canMove =
    user?.role === 'WAREHOUSE' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const { data: wac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });
  const { data: balances = [] } = useQuery({
    queryKey: ['stock', 'old', 'balances'],
    queryFn: () => api.get<TypeBalance[]>('/stock/old/balances'),
  });
  const { data: history = [] } = useQuery({
    queryKey: ['stock', 'old', 'history'],
    queryFn: () => api.get<LedgerRow[]>('/stock/old/history'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold text-slate-900">Stock (OLD) — ສາງຄຳເກົ່າ</h1>
        <p className="mt-1 text-sm text-slate-500">
          ຍອດຄຳເກົ່າແຍກຕາມປະເພດຄຳ · ນ້ຳໜັກ ແລະ ຕົ້ນທຶນສະສົມ (TOR §7.3)
        </p>
        </div>
        {canMove && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setDialog('IN')}>IN</button>
            <button className="btn-secondary" onClick={() => setDialog('OUT')}>OUT</button>
            <button className="btn-secondary" onClick={() => setDialog('TRANSFER')}>
              Transfer (OLD) ເປັນ (NEW)
            </button>
          </div>
        )}
      </div>

      {dialog && (
        <StockMovementDialog kind={dialog} scope="OLD" onClose={() => setDialog(null)} />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat labelLo="GOLD (g) OLD" value={wac ? formatWeight(wac.oldWeightG) : '—'}
          hint={wac ? `${gramsToBaht(wac.oldWeightG)} ບາດ` : ''} />
        <Stat labelLo="ຕົ້ນທຶນຄຳ OLD" value={wac ? formatLak(wac.oldCost) : '—'} hint="LAK" />
        <Stat labelLo="ປະເພດຄຳ" value={String(balances.length)} hint="ທີ່ມີຍອດໃນມື້ນີ້" />
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ຍອດແຍກຕາມປະເພດຄຳ</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ປະເພດຄຳ</th>
                <th className="text-right">ຕົ້ນທຶນຕັ້ງຕົ້ນ</th>
                <th className="text-right">ນໍ້າໜັກ (g) ຕັ້ງຕົ້ນ</th>
                <th className="text-right">ຄຳເຂົ້າ (g)</th>
                <th className="text-right">ຄຳອອກ (g)</th>
                <th className="text-right">ຕົ້ນທຶນເຂົ້າ</th>
                <th className="text-right">ຕົ້ນທຶນອອກ</th>
                <th className="text-right">ນໍ້າໜັກ (g) ຄົງເຫຼືອ</th>
                <th className="text-right">ຕົ້ນທຶນຄົງເຫຼືອ</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີຍອດໃນມື້ນີ້</td></tr>
              )}
              {balances.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.goldType.nameLo}</td>
                  <td className="num text-right">{formatLak(row.openingCost)}</td>
                  <td className="num text-right">{formatWeight(row.openingWeightG)}</td>
                  <td className="num text-right text-emerald-700">{formatWeight(row.inG)}</td>
                  <td className="num text-right text-red-600">{formatWeight(row.outG)}</td>
                  <td className="num text-right">{formatLak(row.priceIn)}</td>
                  <td className="num text-right">{formatLak(row.priceOut)}</td>
                  <td className="num text-right font-semibold">{formatWeight(row.closingWeightG)}</td>
                  <td className="num text-right font-semibold">{formatLak(row.closingCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          ນໍ້າໜັກ(g) ຄົງເຫຼືອ = ຕັ້ງຕົ້ນ + GOLD(g) IN − GOLD(g) OUT ·
          ຕົ້ນທຶນຄົງເຫຼືອ = ຕົ້ນທຶນຕັ້ງຕົ້ນ + PRICE (IN) − PRICE (OUT) ·
          ມື້ໃໝ່ຄົງເຫຼືອຈະກາຍເປັນຕັ້ງຕົ້ນ
        </p>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Stock (OLD)</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ວັນທີ</th>
                <th>ແຫຼ່ງ</th>
                <th>ປະເພດຄຳ</th>
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
              {history.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
              )}
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td>{row.partnerLabel ?? '—'}</td>
                  <td>{row.goldType.nameLo}</td>
                  <td className="text-slate-500">{row.typeLabel}</td>
                  <td className="num text-right text-emerald-700">{formatWeight(row.goldInG)}</td>
                  <td className="num text-right text-red-600">{formatWeight(row.goldOutG)}</td>
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

function Stat({ labelLo, value, hint }: { labelLo: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{labelLo}</div>
      <div className="num mt-1 text-xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
