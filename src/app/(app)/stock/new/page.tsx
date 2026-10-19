'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getStoredUser } from '@/lib/api';
import { StockMovementDialog, type MovementKind } from '@/components/stock-movement-dialog';
import { formatLak, formatWeight, formatDate, gramsToBaht } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';

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

  const { data: wac, isError: wacFailed, error: wacError, refetch: refetchWac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });
  const { data: balances = [], isError: balancesFailed, error: balancesError, refetch: refetchBalances } = useQuery({
    queryKey: ['stock', 'new', 'balances'],
    queryFn: () => api.get<SkuBalance[]>('/stock/new/balances'),
  });
  const { data: history = [], isError: historyFailed, error: historyError, refetch: refetchHistory } = useQuery({
    queryKey: ['stock', 'new', 'history'],
    queryFn: () => api.get<LedgerRow[]>('/stock/new/history'),
  });

  return (
    <div className="space-y-6">
      <PageHead
        title="Stock (NEW) — ສາງຄຳໃໝ່"
        subtitle="Ready to Gold ຕາມ SKU · ນ້ຳໜັກ ແລະ ຕົ້ນທຶນສະສົມ (TOR §7.2)"
        actions={
          canMove ? (
            <>
              <button className="btn-primary" onClick={() => setDialog('IN')}>IN</button>
              <button className="btn-secondary" onClick={() => setDialog('OUT')}>OUT</button>
              <button className="btn-secondary" onClick={() => setDialog('TRANSFER')}>
                Transfer (NEW) ເປັນ (OLD)
              </button>
            </>
          ) : undefined
        }
      />

      {dialog && (
        <StockMovementDialog kind={dialog} scope="NEW" onClose={() => setDialog(null)} />
      )}

      {wacFailed && <QueryErrorNotice error={wacError} onRetry={() => void refetchWac()} />}

      <div className="stat-grid">
        <StatCard label="GOLD (g) NEW" value={wac ? formatWeight(wac.newWeightG) : '—'}
          sub={wac ? `${gramsToBaht(wac.newWeightG)} ບາດ` : ''} />
        <StatCard label="ຕົ້ນທຶນຄຳ NEW" value={wac ? formatLak(wac.newCost) : '—'} sub="LAK" />
        <StatCard label="ຈຳນວນ SKU" value={String(balances.length)} sub="ທີ່ມີຍອດໃນມື້ນີ້" />
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">Ready to Gold</h2></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Ready to Gold">
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
              <TableStateRow colSpan={7} isError={balancesFailed} error={balancesError} isEmpty={balances.length === 0} emptyText="ຍັງບໍ່ມີຍອດໃນມື້ນີ້" onRetry={() => void refetchBalances()} />
              {balances.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.goldSku.fullSkuName}</td>
                  <td className="num text-right">{formatWeight(row.goldSku.weightG)}</td>
                  <td className="num text-right">{row.openingQty}</td>
                  <td className="num text-right text-success">{row.inQty}</td>
                  <td className="num text-right text-danger">{row.outQty}</td>
                  <td className="num text-right font-semibold">{row.balanceQty}</td>
                  <td className="num text-right">{formatWeight(row.totalWeightG)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Balance = ຈຳນວນຕັ້ງຕົ້ນ + IN − OUT · ນ້ຳໜັກ g ລວມ = weight_g × Balance ·
          ມື້ໃໝ່ Balance ຈະກາຍເປັນ ຈຳນວນຕັ້ງຕົ້ນ
        </p>
      </div>

      <LedgerTable
        titleLo="ປະຫວັດ Stock (NEW)"
        rows={history}
        isError={historyFailed}
        error={historyError}
        onRetry={() => void refetchHistory()}
      />
    </div>
  );
}


function LedgerTable({
  titleLo,
  rows,
  isError,
  error,
  onRetry,
}: {
  titleLo: string;
  rows: LedgerRow[];
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div data-fade className="card">
      <div className="card-header"><h2 className="card-title">{titleLo}</h2></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={titleLo}>
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
            <TableStateRow colSpan={9} isError={isError} error={error} isEmpty={rows.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={onRetry} />
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.businessDate)}</td>
                <td>{row.partnerLabel ?? '—'}</td>
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
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        WEIGHT = WEIGHT ແຖວກ່ອນໜ້າ + GOLD(g) IN − GOLD(g) OUT ·
        ຕົ້ນທຶນ = ຕົ້ນທຶນ ແຖວກ່ອນໜ້າ + PRICE (IN) − PRICE (OUT)
      </p>
    </div>
  );
}
