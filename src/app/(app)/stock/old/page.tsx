'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getStoredUser } from '@/lib/api';
import { StockMovementDialog, type MovementKind } from '@/components/stock-movement-dialog';
import { formatLak, formatWeight, formatDate, gramsToBaht } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';

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

  const { data: wac, isError: wacFailed, error: wacError, refetch: refetchWac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });
  const { data: balances = [], isError: balancesFailed, error: balancesError, refetch: refetchBalances } = useQuery({
    queryKey: ['stock', 'old', 'balances'],
    queryFn: () => api.get<TypeBalance[]>('/stock/old/balances'),
  });
  const { data: history = [], isError: historyFailed, error: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['stock', 'old', 'history'],
    queryFn: () => api.get<LedgerRow[]>('/stock/old/history'),
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="Stock (OLD) — ສາງຄຳເກົ່າ"
        subtitle="ຍອດຄຳເກົ່າແຍກຕາມປະເພດຄຳ · ນ້ຳໜັກ ແລະ ຕົ້ນທຶນສະສົມ (TOR §7.3)"
        actions={
          canMove ? (
            <>
              <button className="btn-primary" onClick={() => setDialog('IN')}>IN</button>
              <button className="btn-secondary" onClick={() => setDialog('OUT')}>OUT</button>
              <button className="btn-secondary" onClick={() => setDialog('TRANSFER')}>
                Transfer (OLD) ເປັນ (NEW)
              </button>
            </>
          ) : undefined
        }
      />

      {dialog && (
        <StockMovementDialog kind={dialog} scope="OLD" onClose={() => setDialog(null)} />
      )}

      {wacFailed && <QueryErrorNotice error={wacError} onRetry={() => void refetchWac()} />}

      <div className="stat-grid">
        <StatCard label="GOLD (g) OLD" value={wac ? formatWeight(wac.oldWeightG) : '—'}
          sub={wac ? `${gramsToBaht(wac.oldWeightG)} ບາດ` : ''} />
        <StatCard label="ຕົ້ນທຶນຄຳ OLD" value={wac ? formatLak(wac.oldCost) : '—'} sub="LAK" />
        <StatCard label="ປະເພດຄຳ" value={String(balances.length)} sub="ທີ່ມີຍອດໃນມື້ນີ້" />
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ຍອດແຍກຕາມປະເພດຄຳ</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ຍອດແຍກຕາມປະເພດຄຳ">
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
              <TableStateRow colSpan={9} isError={balancesFailed} error={balancesError} isEmpty={balances.length === 0} emptyText="ຍັງບໍ່ມີຍອດໃນມື້ນີ້" onRetry={() => void refetchBalances()} />
              {balances.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.goldType.nameLo}</td>
                  <td className="num text-right">{formatLak(row.openingCost)}</td>
                  <td className="num text-right">{formatWeight(row.openingWeightG)}</td>
                  <td className="num text-right text-success">{formatWeight(row.inG)}</td>
                  <td className="num text-right text-danger">{formatWeight(row.outG)}</td>
                  <td className="num text-right">{formatLak(row.priceIn)}</td>
                  <td className="num text-right">{formatLak(row.priceOut)}</td>
                  <td className="num text-right font-semibold">{formatWeight(row.closingWeightG)}</td>
                  <td className="num text-right font-semibold">{formatLak(row.closingCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          ນໍ້າໜັກ(g) ຄົງເຫຼືອ = ຕັ້ງຕົ້ນ + GOLD(g) IN − GOLD(g) OUT ·
          ຕົ້ນທຶນຄົງເຫຼືອ = ຕົ້ນທຶນຕັ້ງຕົ້ນ + PRICE (IN) − PRICE (OUT) ·
          ມື້ໃໝ່ຄົງເຫຼືອຈະກາຍເປັນຕັ້ງຕົ້ນ
        </p>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Stock (OLD)</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="ປະຫວັດ Stock (OLD)">
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
              <TableStateRow colSpan={10} isError={historyFailed} error={historyError} isEmpty={history.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={() => void refetchHistory()} />
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.businessDate)}</td>
                  <td>{row.partnerLabel ?? '—'}</td>
                  <td>{row.goldType.nameLo}</td>
                  <td className="text-muted">{row.typeLabel}</td>
                  <td className="num text-right text-success">{formatWeight(row.goldInG)}</td>
                  <td className="num text-right text-danger">{formatWeight(row.goldOutG)}</td>
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

