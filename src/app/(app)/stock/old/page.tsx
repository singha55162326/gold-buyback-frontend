'use client';

import { useState } from 'react';
import { getStoredUser } from '@/lib/api';
import {
  StockMovementDialog,
  type MovementKind,
} from '@/components/stock-movement-dialog';
import { formatGrams, formatLak, gramsToBaht } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice } from '@/components/query-state';
import { useHistoryRange } from '@/components/date-range';
import { useTimeSearchFilter } from '@/components/time-search-filter';
import {
  stockOldKeys,
  useOldStockWac,
  useOldStockBalances,
  useNewStockBalances,
  useStockMasterData,
} from '@/lib/stock-old-api';
import { computeOldTypeRates, type TypeBalance, type LedgerRow } from './types';
import { TypeBalanceTable } from './components/type-balance-table';
import { TypeBalanceViewModal } from './components/type-balance-view-modal';
import { TypeBalanceEditModal } from './components/type-balance-edit-modal';
import { HistoryTable } from './components/history-table';
import { MovementViewModal } from './components/movement-view-modal';
import { MovementEditModal } from './components/movement-edit-modal';

/** TOR §7.3 — Stock (OLD), ສາງຄຳເກົ່າ. */
export default function StockOldPage() {
  const [dialog, setDialog] = useState<MovementKind | null>(null);
  const user = getStoredUser();
  const canMove =
    user?.role === 'WAREHOUSE' || user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  // Modal states for TypeBalance (ຍອດແຍກຕາມປະເພດຄຳ)
  const [viewingBalance, setViewingBalance] = useState<TypeBalance | null>(null);
  const [editingBalance, setEditingBalance] = useState<TypeBalance | null>(null);

  // Modal states for LedgerRow (ປະຫວັດ Stock (OLD))
  const [viewingRow, setViewingRow] = useState<LedgerRow | null>(null);
  const [editingRow, setEditingRow] = useState<LedgerRow | null>(null);

  // Queries
  const {
    data: wac,
    isError: wacFailed,
    error: wacError,
    refetch: refetchWac,
  } = useOldStockWac();

  const {
    data: balances = [],
    isError: balancesFailed,
    error: balancesError,
    refetch: refetchBalances,
  } = useOldStockBalances();

  const { data: newBalances = [] } = useNewStockBalances(Boolean(editingRow));
  const masterData = useStockMasterData(true);

  // Search, time & goldType filter state
  const [selectedGoldTypeId, setSelectedGoldTypeId] = useState<string>('');
  const timeSearch = useTimeSearchFilter();

  // Ledger history with date range, time range, search & goldType filter
  const historyRange = useHistoryRange<LedgerRow>(
    stockOldKeys.history(selectedGoldTypeId),
    '/stock/old/history',
    {
      params: {
        ...(selectedGoldTypeId ? { goldTypeId: selectedGoldTypeId } : {}),
        start_time: timeSearch.startTime || undefined,
        end_time: timeSearch.endTime || undefined,
        search: timeSearch.debouncedSearch || undefined,
      },
    },
  );
  const history = historyRange.rows;
  const historyFailed = historyRange.isError;
  const historyError = historyRange.error;
  const refetchHistory = historyRange.refetch;

  return (
    <div className="space-y-6">
      <PageHead
        title="Stock (OLD) — ສາງຄຳເກົ່າ"
        subtitle="ຍອດຄຳເກົ່າແຍກຕາມປະເພດຄຳ · ນ້ຳໜັກ ແລະ ຕົ້ນທຶນສະສົມ (TOR §7.3)"
        actions={
          canMove ? (
            <>
              <button className="btn-primary" onClick={() => setDialog('IN')}>
                IN
              </button>
              <button className="btn-secondary" onClick={() => setDialog('OUT')}>
                OUT
              </button>
              <button className="btn-secondary" onClick={() => setDialog('TRANSFER')}>
                Transfer (OLD) ເປັນ (NEW)
              </button>
            </>
          ) : undefined
        }
      />

      {dialog && (
        <StockMovementDialog
          kind={dialog}
          scope="OLD"
          onClose={() => setDialog(null)}
          initialBalances={balances}
        />
      )}

      {wacFailed && (
        <QueryErrorNotice error={wacError} onRetry={() => void refetchWac()} />
      )}

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="GOLD (g) OLD"
            value={wac ? formatGrams(wac.oldWeightG) : '—'}
            sub={wac ? `${gramsToBaht(wac.oldWeightG)} ບາດ` : ''}
          />
          <StatCard
            label="ຕົ້ນທຶນຄຳ OLD"
            value={wac ? formatLak(wac.oldCost) : '—'}
            sub="LAK"
          />
        </div>

        {balances.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {balances.map((b) => {
              const { pricePerG, pricePerBaht } = computeOldTypeRates(
                b.closingWeightG,
                b.closingCost,
              );
              const perGText = pricePerG ? formatLak(pricePerG.toFixed()) : '—';
              const perBahtText = pricePerBaht ? formatLak(pricePerBaht.toFixed()) : '—';
              return (
                <div key={b.id} data-fade className="card relative p-5">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                  >
                    <span className="stat-glow" />
                  </span>
                  <div className="relative flex items-center justify-between gap-2">
                    <span className="section-label">{b.goldType.nameLo}</span>
                    <span className="badge recessed num text-[11px] text-muted">
                      {formatGrams(b.closingWeightG)} g
                    </span>
                  </div>
                  <div className="relative mt-3 space-y-2 border-t border-line/60 pt-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted">ລາຄາ/g</span>
                      <span className="num whitespace-nowrap text-base font-semibold text-gold" title={perGText}>
                        {perGText}{' '}
                        {pricePerG && <span className="text-[11px] font-normal text-muted">LAK</span>}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-muted">ລາຄາ/ບາດ</span>
                      <span className="num whitespace-nowrap text-base font-semibold text-gold" title={perBahtText}>
                        {perBahtText}{' '}
                        {pricePerBaht && <span className="text-[11px] font-normal text-muted">LAK</span>}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ຍອດແຍກຕາມປະເພດຄຳ */}
      <TypeBalanceTable
        balances={balances}
        isError={balancesFailed}
        error={balancesError}
        onRetry={() => void refetchBalances()}
        isAdmin={isAdmin}
        onView={setViewingBalance}
        onEdit={setEditingBalance}
      />

      {/* ປະຫວັດ Stock (OLD) */}
      <HistoryTable
        historyRange={historyRange}
        timeSearch={timeSearch}
        history={history}
        isError={historyFailed}
        error={historyError}
        onRetry={() => void refetchHistory()}
        isAdmin={isAdmin}
        onView={setViewingRow}
        onEdit={setEditingRow}
        goldTypes={masterData.goldTypes}
        selectedGoldTypeId={selectedGoldTypeId}
        onGoldTypeChange={setSelectedGoldTypeId}
      />

      {/* ─── Modals ─── */}
      <TypeBalanceViewModal
        balance={viewingBalance}
        onClose={() => setViewingBalance(null)}
      />

      {isAdmin && (
        <TypeBalanceEditModal
          balance={editingBalance}
          onClose={() => setEditingBalance(null)}
        />
      )}

      <MovementViewModal
        row={viewingRow}
        onClose={() => setViewingRow(null)}
      />

      {isAdmin && (
        <MovementEditModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          balances={balances}
          newBalances={newBalances}
          masterData={masterData}
          wac={wac}
        />
      )}
    </div>
  );
}
