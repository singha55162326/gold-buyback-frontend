'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getStoredUser } from '@/lib/api';
import { StockMovementDialog, type MovementKind } from '@/components/stock-movement-dialog';
import { formatLak, formatWeight, formatDate, gramsToBaht } from '@/lib/format';

interface Wac { newWeightG: string; newCost: string }
interface SkuBalance {
  id: string; openingQty: number; inQty: number; outQty: number;
  balanceQty: number; totalWeightG: string;
  goldSku: { fullSkuName: string; weightG: string };
}
interface LedgerRow {
  id: string; businessDate: string; partnerLabel: string | null; typeLabel: string;
  goldInG: string; goldOutG: string; weightG: string;
  priceIn: string; priceOut: string; cost: string;
}

/** TOR §7.2 — Stock (NEW), ສາງຄຳໃໝ່. */
export default function StockNewPage() {
  const [dialog, setDialog] = useState<MovementKind | null>(null);
  const user = getStoredUser();
  const canMove =
    user?.role === 'WAREHOUSE' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const { data: wac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });
  const { data: balances = [] } = useQuery({
    queryKey: ['stock', 'new', 'balances'],
    queryFn: () => api.get<SkuBalance[]>('/stock/new/balances'),
  });
  const { data: history = [] } = useQuery({
    queryKey: ['stock', 'new', 'history'],
    queryFn: () => api.get<LedgerRow[]>('/stock/new/history'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold text-slate-900">Stock (NEW) — ສາງຄຳໃໝ່</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ready to Gold ຕາມ SKU · ນ້ຳໜັກ ແລະ ຕົ້ນທຶນສະສົມ (TOR §7.2)
        </p>
        </div>
        {canMove && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setDialog('IN')}>IN</button>
            <button className="btn-secondary" onClick={() => setDialog('OUT')}>OUT</button>
            <button className="btn-secondary" onClick={() => setDialog('TRANSFER')}>
              Transfer (NEW) ເປັນ (OLD)
            </button>
          </div>
        )}
      </div>

      {dialog && (
        <StockMovementDialog kind={dialog} scope="NEW" onClose={() => setDialog(null)} />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat labelLo="GOLD (g) NEW" value={wac ? formatWeight(wac.newWeightG) : '—'}
          hint={wac ? `${gramsToBaht(wac.newWeightG)} ບາດ` : ''} />
        <Stat labelLo="ຕົ້ນທຶນຄຳ NEW" value={wac ? formatLak(wac.newCost) : '—'} hint="LAK" />
        <Stat labelLo="ຈຳນວນ SKU" value={String(balances.length)} hint="ທີ່ມີຍອດໃນມື້ນີ້" />
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Ready to Gold</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ຊື່ SKU ເຕັມ</th>
                <th className="text-right">ນ້ຳໜັກ (g)</th>
                <th className="text-right">ຈຳນວນຕັ້ງຕົ້ນ</th>
                <th className="text-right">ເຂົ້າ</th>
                <th className="text-right">ອອກ</th>
                <th className="text-right">ຍອດເຫຼືອ</th>
                <th className="text-right">ນ້ຳໜັກ g ລວມ</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີຍອດໃນມື້ນີ້</td></tr>
              )}
              {balances.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.goldSku.fullSkuName}</td>
                  <td className="num text-right">{formatWeight(row.goldSku.weightG)}</td>
                  <td className="num text-right">{row.openingQty}</td>
                  <td className="num text-right text-emerald-700">{row.inQty}</td>
                  <td className="num text-right text-red-600">{row.outQty}</td>
                  <td className="num text-right font-semibold">{row.balanceQty}</td>
                  <td className="num text-right">{formatWeight(row.totalWeightG)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Balance = ຈຳນວນຕັ້ງຕົ້ນ + IN − OUT · ນ້ຳໜັກ g ລວມ = weight_g × Balance ·
          ມື້ໃໝ່ Balance ຈະກາຍເປັນ ຈຳນວນຕັ້ງຕົ້ນ
        </p>
      </div>

      <LedgerTable titleLo="ປະຫວັດ Stock (NEW)" rows={history} />
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

function LedgerTable({ titleLo, rows }: { titleLo: string; rows: LedgerRow[] }) {
  return (
    <div className="card">
      <div className="card-header"><h2 className="card-title">{titleLo}</h2></div>
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
            {rows.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400">ຍັງບໍ່ມີລາຍການ</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.businessDate)}</td>
                <td>{row.partnerLabel ?? '—'}</td>
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
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        WEIGHT = WEIGHT ແຖວກ່ອນໜ້າ + GOLD(g) IN − GOLD(g) OUT ·
        ຕົ້ນທຶນ = ຕົ້ນທຶນ ແຖວກ່ອນໜ້າ + PRICE (IN) − PRICE (OUT)
      </p>
    </div>
  );
}
