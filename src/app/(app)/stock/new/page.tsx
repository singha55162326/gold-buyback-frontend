'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec, GRAMS_PER_BAHT, lineGoldWeight, type Decimal } from '@kpv/domain';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { StockMovementDialog, type MovementKind, type SkuBalance } from '@/components/stock-movement-dialog';
import { formatLak, formatWeight, formatDate, gramsToBaht } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { DateRangeFilter, useHistoryRange, type HistoryRangeState } from '@/components/date-range';
import { Dialog } from '@/components/dialog';
import { NumberInput } from '@/components/number-input';
import { useToast } from '@/components/toast';

interface Wac { newWeightG: string; newCost: string; pricePerG: string }
interface Sku {
  id: string;
  fullSkuName: string;
  weightG: string;
}
interface Partner {
  id: string;
  nameLo: string;
  code: string;
  direction: string;
}
interface MovementLine {
  id: string;
  goldSkuId: string | null;
  weightG: string;
  quantity: number;
  goldG: string;
  cost: string;
  goldSku?: { id: string; fullSkuName: string; weightG: string; goldItem?: { nameLo: string } } | null;
}
interface MovementDetail {
  id: string;
  code: string;
  scope: 'NEW' | 'OLD';
  type: 'IN' | 'OUT' | 'TRANSFER';
  status: string;
  totalQuantity: number;
  totalGoldG: string;
  totalCost: string;
  pricePerG: string;
  pricePerBaht: string;
  laborFeeThb: string;
  note: string | null;
  createdAt: string;
  partnerId?: string | null;
  partner?: { id: string; nameLo: string; code: string } | null;
  lines: MovementLine[];
  createdByName?: string;
  approvedByName?: string | null;
}
interface LedgerRow {
  id: string;
  movementId: string | null;
  businessDate: string;
  partnerLabel: string | null;
  typeLabel: string;
  goldInG: string;
  goldOutG: string;
  weightG: string;
  priceIn: string;
  priceOut: string;
  cost: string;
  /** ຜູ້ບັນທຶກລາຍການນີ້. */
  createdBy: string;
  movement?: MovementDetail | null;
}

interface FormEditLine {
  goldSkuId: string;
  weightG: string;
  quantity: string;
}

/** TOR §7.2 — Stock (NEW), ສາງຄຳໃໝ່. */
export default function StockNewPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<MovementKind | null>(null);
  const user = getStoredUser();
  const canMove =
    user?.role === 'WAREHOUSE' || user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const canManage = user?.role === 'ADMIN';

  // View / Edit / Delete modal states for Ledger
  const [viewingRow, setViewingRow] = useState<LedgerRow | null>(null);
  const [editingRow, setEditingRow] = useState<LedgerRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<LedgerRow | null>(null);

  // View / Edit modal states for Ready to Gold (SKU Balance)
  const [viewingBalance, setViewingBalance] = useState<SkuBalance | null>(null);
  const [editingBalance, setEditingBalance] = useState<SkuBalance | null>(null);
  const [editOpeningQty, setEditOpeningQty] = useState('');
  const [editBalanceError, setEditBalanceError] = useState<string | null>(null);

  // Edit movement form state
  const [editPartnerId, setEditPartnerId] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editTotalCost, setEditTotalCost] = useState('');
  const [editLaborFeeThb, setEditLaborFeeThb] = useState('');
  const [editLines, setEditLines] = useState<FormEditLine[]>([{ goldSkuId: '', weightG: '', quantity: '1' }]);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: wac, isError: wacFailed, error: wacError, refetch: refetchWac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });
  const { data: balances = [], isError: balancesFailed, error: balancesError, refetch: refetchBalances } = useQuery({
    queryKey: ['stock', 'new', 'balances'],
    queryFn: () => api.get<SkuBalance[]>('/stock/new/balances'),
  });
  const { data: skus = [] } = useQuery({
    queryKey: ['skus'],
    queryFn: () => api.get<Sku[]>('/skus'),
  });
  const { data: partners = [] } = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
  });

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const historyRange = useHistoryRange<LedgerRow>(['stock', 'new', 'history'], '/stock/new/history');
  const history = historyRange.rows;
  const historyFailed = historyRange.isError;
  const historyError = historyRange.error;
  const refetchHistory = historyRange.refetch;

  // Open edit modal for a movement
  function openEditModal(row: LedgerRow) {
    setEditingRow(row);
    setEditError(null);
    const mov = row.movement;
    setEditPartnerId(mov?.partnerId ?? '');
    setEditNote(mov?.note ?? '');
    setEditTotalCost(mov ? String(Number(mov.totalCost) || '') : (row.priceIn !== '0' ? String(Number(row.priceIn)) : ''));
    setEditLaborFeeThb(mov?.laborFeeThb ? String(Number(mov.laborFeeThb) || '') : '');
    if (mov?.lines && mov.lines.length > 0) {
      setEditLines(
        mov.lines.map((l) => ({
          goldSkuId: l.goldSkuId ?? '',
          weightG: String(Number(l.weightG) || ''),
          quantity: String(l.quantity),
        })),
      );
    } else {
      setEditLines([{ goldSkuId: '', weightG: '', quantity: '1' }]);
    }
  }

  // Open edit modal for SKU opening quantity
  function openEditBalanceModal(bal: SkuBalance) {
    setEditingBalance(bal);
    setEditOpeningQty(String(bal.openingQty));
    setEditBalanceError(null);
  }

  // Update Movement Mutation
  const updateMovement = useMutation({
    mutationFn: () => {
      const movId = editingRow?.movementId || editingRow?.movement?.id;
      if (!movId) throw new Error('ບໍ່ພົບ ID ການເຄື່ອນໄຫວສາງ');
      const payloadLines = editLines
        .filter((l) => Number(l.weightG) > 0 && l.goldSkuId)
        .map((l) => ({
          goldSkuId: l.goldSkuId,
          weightG: l.weightG.trim(),
          quantity: Math.max(1, Math.trunc(Number(l.quantity) || 0) || 1),
        }));
      return api.patch(`/stock/movements/${movId}`, {
        partnerId: editPartnerId || undefined,
        totalCost: editTotalCost.replace(/,/g, '').trim() || undefined,
        laborFeeThb: editLaborFeeThb.trim() || undefined,
        note: editNote || undefined,
        lines: payloadLines.length > 0 ? payloadLines : undefined,
      });
    },
    onSuccess: () => {
      toast.success('ແກ້ໄຂລາຍການສຳເລັດ');
      setEditingRow(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      setEditError(e instanceof ApiError ? e.message : 'ແກ້ໄຂບໍ່ສຳເລັດ');
    },
  });

  // Delete Movement Mutation
  const deleteMovement = useMutation({
    mutationFn: (movementId: string) => api.delete(`/stock/movements/${movementId}`),
    onSuccess: () => {
      toast.success('ລຶບລາຍການສຳເລັດ');
      setDeletingRow(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => {
      toast.error('ລຶບບໍ່ສຳເລັດ', e instanceof ApiError ? e.message : undefined);
    },
  });

  // Update SKU Balance Opening Qty Mutation
  const updateBalance = useMutation({
    mutationFn: () => {
      if (!editingBalance) throw new Error('ບໍ່ພົບ ID');
      return api.patch(`/stock/new/balances/${editingBalance.id}`, {
        openingQty: Math.max(0, Math.trunc(Number(editOpeningQty) || 0)),
      });
    },
    onSuccess: () => {
      toast.success('ປັບປຸງຈຳນວນຕັ້ງຕົ້ນສຳເລັດ');
      setEditingBalance(null);
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
    onError: (e) => {
      setEditBalanceError(e instanceof ApiError ? e.message : 'ປັບປຸງບໍ່ສຳເລັດ');
    },
  });

  const isEditIn = editingRow?.movement?.type === 'IN' || Boolean(editingRow?.typeLabel.includes('IN'));

  const getEditSkuAvailableWeight = (skuId: string): Decimal => {
    if (!skuId) return dec(0);
    const bal = balances.find((b) => b.goldSkuId === skuId || b.goldSku?.id === skuId);
    const currentAvail = bal ? dec(bal.totalWeightG || 0) : dec(0);
    // If editing an already-completed OUT/TRANSFER movement, add back its original weight for this SKU
    const mov = editingRow?.movement;
    if (mov && mov.type !== 'IN' && (mov.status === 'COMPLETED' || mov.status === 'APPROVED')) {
      const origWeight = (mov.lines ?? []).reduce((sum, l) => {
        if (l.goldSkuId !== skuId) return sum;
        return sum.plus(dec(l.weightG || 0).mul(l.quantity || 1));
      }, dec(0));
      return currentAvail.plus(origWeight);
    }
    return currentAvail.gt(0) ? currentAvail : dec(0);
  };

  const getEditMaxWeightForLine = (rowIndex: number, targetSkuId?: string, currentLines = editLines): Decimal | null => {
    if (!editingRow || isEditIn) return null;
    const skuId = targetSkuId ?? currentLines[rowIndex]?.goldSkuId ?? '';
    if (!skuId) return null;
    const available = getEditSkuAvailableWeight(skuId);
    const otherUsed = currentLines.reduce((sum, l, idx) => {
      if (idx === rowIndex || l.goldSkuId !== skuId) return sum;
      const w = l.weightG.trim();
      const q = Math.max(1, Math.trunc(Number(l.quantity) || 0) || 1);
      return /^\d+(\.\d+)?$/.test(w) ? sum.plus(dec(w).mul(q)) : sum;
    }, dec(0));
    const rem = available.minus(otherUsed);
    const rowQty = Math.max(1, Math.trunc(Number(currentLines[rowIndex]?.quantity) || 0) || 1);
    return rem.gt(0) ? rem.div(rowQty).toDecimalPlaces(4) : dec(0);
  };

  // Calculated totals for edit lines modal
  const editTotals = useMemo(() => {
    const goldG = editLines.reduce((sum, l) => {
      const w = l.weightG.trim();
      const q = Math.max(1, Math.trunc(Number(l.quantity) || 0) || 1);
      if (!/^\d+(\.\d+)?$/.test(w)) return sum;
      return sum.plus(dec(w).mul(q));
    }, dec(0));
    const quantity = editLines.reduce((sum, l) => sum + Math.max(1, Math.trunc(Number(l.quantity) || 0) || 1), 0);

    const cost = editTotalCost.replace(/,/g, '').trim();
    const perG = isEditIn
      ? goldG.gt(0) && /^\d+(\.\d+)?$/.test(cost)
        ? dec(cost).div(goldG)
        : dec(0)
      : dec(editingRow?.movement?.pricePerG ?? wac?.pricePerG ?? 0);

    return {
      goldG,
      quantity,
      pricePerG: perG,
      pricePerBaht: perG.mul(GRAMS_PER_BAHT),
      totalCost: isEditIn && /^\d+(\.\d+)?$/.test(cost) ? dec(cost) : goldG.mul(perG),
    };
  }, [editLines, editTotalCost, editingRow, isEditIn, wac]);

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
        <StockMovementDialog
          kind={dialog}
          scope="NEW"
          onClose={() => setDialog(null)}
          initialNewBalances={balances}
        />
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
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={8} isError={balancesFailed} error={balancesError} isEmpty={balances.length === 0} emptyText="ຍັງບໍ່ມີຍອດໃນມື້ນີ້" onRetry={() => void refetchBalances()} />
              {balances.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">{row.goldSku.fullSkuName}</td>
                  <td className="num text-right">{formatWeight(row.goldSku.weightG)}</td>
                  <td className="num text-right">{row.openingQty}</td>
                  <td className="num text-right text-success">{row.inQty}</td>
                  <td className="num text-right text-danger">{row.outQty}</td>
                  <td className="num text-right font-semibold">{row.balanceQty}</td>
                  <td className="num text-right">{formatWeight(row.totalWeightG)}</td>
                  <td className="text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                      {/* View Button */}
                      <button
                        type="button"
                        className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/40 transition-colors"
                        title="ເບິ່ງລາຍລະອຽດ SKU"
                        onClick={() => setViewingBalance(row)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      {/* Edit Button */}
                      {canManage && (
                        <button
                          type="button"
                          className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--gold)] hover:bg-[var(--gold)]/10 transition-colors"
                          title="ແກ້ໄຂຈຳນວນຕັ້ງຕົ້ນ (Opening Qty)"
                          onClick={() => openEditBalanceModal(row)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
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
        history={historyRange}
        isError={historyFailed}
        error={historyError}
        canManage={canManage}
        onRetry={() => void refetchHistory()}
        onView={(row) => setViewingRow(row)}
        onEdit={(row) => openEditModal(row)}
        onDelete={(row) => setDeletingRow(row)}
      />

      {/* ========================================================================= */}
      {/* 1. VIEW MOVEMENT MODAL                                                    */}
      {/* ========================================================================= */}
      {viewingRow && (
        <Dialog
          open
          onClose={() => setViewingRow(null)}
          size="lg"
          title={`ລາຍລະອຽດການເຄື່ອນໄຫວສາງ — ${viewingRow.movement?.code ?? viewingRow.typeLabel}`}
          footer={
            <button className="btn-secondary" onClick={() => setViewingRow(null)}>
              ປິດ
            </button>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-recessed rounded-xl border border-line text-sm">
              <div>
                <span className="text-xs text-muted block">ລະຫັດລາຍການ</span>
                <span className="font-mono font-medium">{viewingRow.movement?.code ?? viewingRow.movementId ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">ວັນທີ</span>
                <span className="font-medium">{formatDate(viewingRow.businessDate)}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">ປະເພດການເຄື່ອນໄຫວ</span>
                <span className="font-medium text-[var(--gold)]">{viewingRow.typeLabel}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">ແຫຼ່ງທີ່ມາ / ແຫຼ່ງສົ່ງມອບ</span>
                <span className="font-medium">{viewingRow.partnerLabel ?? viewingRow.movement?.partner?.nameLo ?? '—'}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">ຜູ້ບັນທຶກ</span>
                <span>{viewingRow.createdBy}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">ສະຖານະ</span>
                <span className="font-semibold text-success">
                  {viewingRow.movement?.status ?? 'COMPLETED'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card p-3">
                <span className="text-xs text-muted block">ນ້ຳໜັກຄຳ</span>
                <span className="num font-semibold text-base">
                  {formatWeight(Number(viewingRow.goldInG) > 0 ? viewingRow.goldInG : viewingRow.goldOutG)} g
                </span>
                <span className="text-xs text-muted block">
                  {gramsToBaht(Number(viewingRow.goldInG) > 0 ? viewingRow.goldInG : viewingRow.goldOutG)} ບາດ
                </span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ຈຳນວນລວມ</span>
                <span className="num font-semibold text-base">
                  {viewingRow.movement?.totalQuantity ?? '—'} ຊິ້ນ
                </span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ລາຄາ / g</span>
                <span className="num font-semibold text-base">
                  {viewingRow.movement ? formatLak(viewingRow.movement.pricePerG) : '—'}
                </span>
                <span className="text-xs text-muted block">LAK</span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ຕົ້ນທຶນລວມ</span>
                <span className="num font-semibold text-base text-[var(--gold)]">
                  {formatLak(Number(viewingRow.priceIn) > 0 ? viewingRow.priceIn : viewingRow.priceOut)}
                </span>
                <span className="text-xs text-muted block">LAK</span>
              </div>
            </div>

            {viewingRow.movement?.laborFeeThb && Number(viewingRow.movement.laborFeeThb) > 0 && (
              <div className="p-3 bg-recessed rounded-xl border border-line text-sm flex items-center justify-between">
                <span className="text-muted">ຄ່າແຮງ (Labor Fee):</span>
                <span className="font-semibold text-warning">{formatLak(viewingRow.movement.laborFeeThb)} THB</span>
              </div>
            )}

            {viewingRow.movement?.note && (
              <div className="p-3 bg-recessed rounded-xl border border-line text-sm">
                <span className="text-xs text-muted block mb-0.5">ໝາຍເຫດ</span>
                <p className="text-fg">{viewingRow.movement.note}</p>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2">ລາຍການ SKU ໃນໃບບິນ</h4>
              <div className="table-wrap border border-line rounded-lg">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>ຊື່ SKU ເຕັມ</th>
                      <th className="text-right">ນ້ຳໜັກ/ຊິ້ນ (g)</th>
                      <th className="text-right">ຈຳນວນ</th>
                      <th className="text-right">ນ້ຳໜັກລວມ (g)</th>
                      <th className="text-right">ຕົ້ນທຶນ (LAK)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewingRow.movement?.lines ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">ບໍ່ມີລາຍລະອຽດ SKU ຍ່ອຍ</td>
                      </tr>
                    ) : (
                      viewingRow.movement!.lines.map((line, idx) => (
                        <tr key={line.id || idx}>
                          <td className="text-muted text-xs">{idx + 1}</td>
                          <td className="font-medium">{line.goldSku?.fullSkuName ?? '—'}</td>
                          <td className="num text-right">{formatWeight(line.weightG)}</td>
                          <td className="num text-right">{line.quantity}</td>
                          <td className="num text-right font-semibold">{formatWeight(line.goldG)}</td>
                          <td className="num text-right">{formatLak(line.cost)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* 2. EDIT MOVEMENT FORM MODAL                                              */}
      {/* ========================================================================= */}
      {editingRow && (
        <Dialog
          open
          onClose={() => setEditingRow(null)}
          size="lg"
          title={`ແກ້ໄຂລາຍການ — ${editingRow.movement?.code ?? editingRow.typeLabel}`}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditingRow(null)} disabled={updateMovement.isPending}>
                ຍົກເລີກ
              </button>
              <button
                className="btn-primary"
                onClick={() => updateMovement.mutate()}
                disabled={updateMovement.isPending || editTotals.goldG.lte(0)}
              >
                {updateMovement.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກການແກ້ໄຂ'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {editError && (
              <div className="notice status-danger">
                <div>{editError}</div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label" htmlFor="edit-partner">ແຫຼ່ງທີ່ມາ / ແຫຼ່ງສົ່ງມອບ</label>
                <select
                  id="edit-partner"
                  className="input"
                  value={editPartnerId}
                  onChange={(e) => setEditPartnerId(e.target.value)}
                >
                  <option value="">— ເລືອກແຫຼ່ງ —</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameLo} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">ປະເພດການເຄື່ອນໄຫວ</label>
                <div className="input flex items-center font-medium bg-recessed text-muted cursor-not-allowed">
                  {editingRow.typeLabel}
                </div>
              </div>
            </div>

            {/* Lines Editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="label mb-0 font-semibold text-fg">ລາຍການ SKU</span>
                <button
                  type="button"
                  className="btn-secondary text-xs px-2.5 py-1"
                  onClick={() =>
                    setEditLines((p) => [...p, { goldSkuId: '', weightG: '', quantity: '1' }])
                  }
                >
                  + ເພີ່ມລາຍການ
                </button>
              </div>

              <div className="space-y-2">
                {editLines.map((line, idx) => {
                  const maxEditWeight = getEditMaxWeightForLine(idx);
                  const maxEditWeightStr = maxEditWeight !== null ? String(Number(maxEditWeight.toFixed())) : undefined;
                  return (
                    <div key={idx} className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-recessed border border-line">
                      <div className="flex-1 min-w-[200px]">
                        <select
                          className="input text-sm py-1.5"
                          value={line.goldSkuId}
                          onChange={(e) => {
                            const nextSkuId = e.target.value;
                            const selectedSku = skus.find((s) => s.id === nextSkuId);
                            let nextWeight = selectedSku ? String(Number(selectedSku.weightG)) : line.weightG;
                            if (!isEditIn && nextSkuId && selectedSku) {
                              const maxForSku = getEditMaxWeightForLine(idx, nextSkuId);
                              if (maxForSku !== null && dec(nextWeight).gt(maxForSku)) {
                                nextWeight = maxForSku.gt(0) ? String(Number(maxForSku.toFixed())) : '0';
                              }
                            }
                            setEditLines((p) =>
                              p.map((l, i) =>
                                i === idx
                                  ? {
                                      ...l,
                                      goldSkuId: nextSkuId,
                                      weightG: nextWeight,
                                    }
                                  : l,
                              ),
                            );
                          }}
                        >
                          <option value="">— ເລືອກ SKU —</option>
                          {skus.map((s) => {
                            const avail = !isEditIn ? getEditSkuAvailableWeight(s.id) : null;
                            return (
                              <option key={s.id} value={s.id}>
                                {avail !== null
                                  ? `${s.fullSkuName} (ນ້ຳໜັກ g ລວມ: ${formatWeight(avail.toFixed())} g)`
                                  : s.fullSkuName}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="w-28">
                        <NumberInput
                          decimals={4}
                          max={maxEditWeightStr}
                          className="input text-sm py-1.5 text-right num"
                          placeholder={
                            maxEditWeight !== null
                              ? `ສູງສຸດ ${formatWeight(maxEditWeight.toFixed())} g`
                              : 'ນ້ຳໜັກ g'
                          }
                          value={line.weightG}
                          onValueChange={(v) =>
                            setEditLines((p) =>
                              p.map((l, i) => (i === idx ? { ...l, weightG: v } : l)),
                            )
                          }
                        />
                      </div>

                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          className="input text-sm py-1.5 text-right num"
                          placeholder="ຈຳນວນ"
                          value={line.quantity}
                          onChange={(e) => {
                            const rawQty = e.target.value;
                            const lineW = line.weightG.trim();
                            if (
                              !isEditIn &&
                              line.goldSkuId &&
                              /^\d+(\.\d+)?$/.test(lineW) &&
                              dec(lineW).gt(0)
                            ) {
                              const totalAvail = getEditSkuAvailableWeight(line.goldSkuId);
                              const otherUsed = editLines.reduce((sum, l, i) => {
                                if (i === idx || l.goldSkuId !== line.goldSkuId) return sum;
                                const w = l.weightG.trim();
                                const q = Math.max(1, Math.trunc(Number(l.quantity) || 0) || 1);
                                return /^\d+(\.\d+)?$/.test(w) ? sum.plus(dec(w).mul(q)) : sum;
                              }, dec(0));
                              const remDiff = totalAvail.minus(otherUsed);
                              const rem = remDiff.gt(0) ? remDiff : dec(0);
                              const maxQty = Math.max(1, Math.floor(Number(rem.div(dec(lineW)).toFixed())));
                              if (Number(rawQty) > maxQty) {
                                setEditLines((p) =>
                                  p.map((l, i) => (i === idx ? { ...l, quantity: String(maxQty) } : l)),
                                );
                                return;
                              }
                            }
                            setEditLines((p) =>
                              p.map((l, i) => (i === idx ? { ...l, quantity: rawQty } : l)),
                            );
                          }}
                        />
                      </div>

                      <div className="w-24 text-right num font-semibold text-sm">
                        {formatWeight(
                          dec(line.weightG || 0).mul(Math.max(1, Number(line.quantity) || 1)).toFixed(),
                        )}{' '}
                        g
                      </div>

                      {editLines.length > 1 && (
                        <button
                          type="button"
                          className="btn-ghost p-1 h-8 w-8 text-danger hover:bg-danger/10 rounded flex items-center justify-center"
                          title="ລຶບແຖວນີ້"
                          onClick={() => setEditLines((p) => p.filter((_, i) => i !== idx))}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cost & labor fields for IN */}
            {(editingRow.movement?.type === 'IN' || editingRow.typeLabel.includes('IN')) && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="edit-cost">ຕົ້ນທຶນຄຳລວມ (LAK)</label>
                  <input
                    id="edit-cost"
                    type="text"
                    inputMode="decimal"
                    className="input num"
                    placeholder="ຕົ້ນທຶນ LAK"
                    value={editTotalCost}
                    onChange={(e) => setEditTotalCost(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-labor">ຄ່າແຮງ (THB) ຖ້າມີ</label>
                  <input
                    id="edit-labor"
                    type="text"
                    inputMode="decimal"
                    className="input num"
                    placeholder="ຄ່າແຮງ THB"
                    value={editLaborFeeThb}
                    onChange={(e) => setEditLaborFeeThb(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="label" htmlFor="edit-note">ໝາຍເຫດ</label>
              <textarea
                id="edit-note"
                className="input min-h-[64px]"
                rows={2}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="ເພີ່ມໝາຍເຫດ..."
              />
            </div>

            {/* Summary preview */}
            <div className="p-3 bg-recessed rounded-xl border border-line text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted">ນ້ຳໜັກຄຳລວມໃໝ່:</span>
                <span className="font-semibold num">{formatWeight(editTotals.goldG.toFixed())} g ({gramsToBaht(editTotals.goldG.toFixed())} ບາດ)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ຈຳນວນລວມໃໝ່:</span>
                <span className="font-semibold num">{editTotals.quantity} ຊິ້ນ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ຕົ້ນທຶນຄຳລວມໃໝ່:</span>
                <span className="font-semibold num text-[var(--gold)]">{formatLak(editTotals.totalCost.toFixed())} LAK</span>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* 3. DELETE CONFIRMATION DIALOG                                             */}
      {/* ========================================================================= */}
      {deletingRow && (
        <Dialog
          open
          onClose={() => setDeletingRow(null)}
          size="md"
          title="ຢືນຢັນການລຶບລາຍການ"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setDeletingRow(null)} disabled={deleteMovement.isPending}>
                ຍົກເລີກ
              </button>
              <button
                className="btn-danger"
                disabled={deleteMovement.isPending}
                onClick={() => {
                  const mId = deletingRow.movementId || deletingRow.movement?.id;
                  if (mId) {
                    deleteMovement.mutate(mId);
                  }
                }}
              >
                {deleteMovement.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm">
              ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລາຍການ{' '}
              <strong className="text-fg">{deletingRow.movement?.code ?? deletingRow.typeLabel}</strong>{' '}
              ({formatDate(deletingRow.businessDate)})?
            </p>
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger space-y-1">
              <p className="font-semibold">⚠️ ຜົນກະທົບຕໍ່ລະບົບ:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>ຍອດສິນຄ້າໃນສາງ (Ready to Gold) ຈະຖືກປັບປຸງຄືນໂດຍອັດຕະໂນມັດ.</li>
                <li>ບັນຊີ AP/AR (GOLD) ແລະ ປະຫວັດ Stock ຈະຖືກປັບຍອດຄືນ.</li>
              </ul>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* 4. VIEW SKU BALANCE DIALOG (Ready to Gold)                                */}
      {/* ========================================================================= */}
      {viewingBalance && (
        <Dialog
          open
          onClose={() => setViewingBalance(null)}
          size="md"
          title={`ລາຍລະອຽດ SKU — ${viewingBalance.goldSku.fullSkuName}`}
          footer={
            <button className="btn-secondary" onClick={() => setViewingBalance(null)}>
              ປິດ
            </button>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-recessed rounded-xl border border-line text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted">ຊື່ SKU:</span>
                <span className="font-semibold">{viewingBalance.goldSku.fullSkuName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ນ້ຳໜັກຕໍ່ຊິ້ນ:</span>
                <span className="font-medium num">{formatWeight(viewingBalance.goldSku.weightG)} g</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3">
                <span className="text-xs text-muted block">ຈຳນວນຕັ້ງຕົ້ນ (Opening)</span>
                <span className="num font-semibold text-base">{viewingBalance.openingQty}</span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ເຂົ້າ (IN) ມື້ນີ້</span>
                <span className="num font-semibold text-base text-success">+{viewingBalance.inQty}</span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ອອກ (OUT) ມື້ນີ້</span>
                <span className="num font-semibold text-base text-danger">-{viewingBalance.outQty}</span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ຍອດເຫຼືອປັດຈຸບັນ (Balance)</span>
                <span className="num font-semibold text-base text-[var(--gold)]">{viewingBalance.balanceQty}</span>
              </div>
            </div>

            <div className="p-3 bg-recessed rounded-xl border border-line text-sm flex justify-between items-center">
              <span className="text-muted">ນ້ຳໜັກ g ລວມ (Total Weight):</span>
              <span className="num font-semibold text-lg">{formatWeight(viewingBalance.totalWeightG)} g</span>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* 5. EDIT SKU BALANCE DIALOG (Ready to Gold)                                */}
      {/* ========================================================================= */}
      {editingBalance && (
        <Dialog
          open
          onClose={() => setEditingBalance(null)}
          size="md"
          title={`ແກ້ໄຂຈຳນວນຕັ້ງຕົ້ນ — ${editingBalance.goldSku.fullSkuName}`}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditingBalance(null)} disabled={updateBalance.isPending}>
                ຍົກເລີກ
              </button>
              <button
                className="btn-primary"
                onClick={() => updateBalance.mutate()}
                disabled={updateBalance.isPending}
              >
                {updateBalance.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {editBalanceError && (
              <div className="notice status-danger">
                <div>{editBalanceError}</div>
              </div>
            )}

            <div>
              <label className="label" htmlFor="edit-opening-qty">ຈຳນວນຕັ້ງຕົ້ນ (Opening Qty)</label>
              <input
                id="edit-opening-qty"
                type="number"
                min="0"
                className="input num font-semibold text-base"
                value={editOpeningQty}
                onChange={(e) => setEditOpeningQty(e.target.value)}
              />
            </div>

            <div className="p-3 bg-recessed rounded-xl border border-line text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted">ຍອດເຂົ້າ (IN):</span>
                <span className="num text-success">+{editingBalance.inQty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ຍອດອອກ (OUT):</span>
                <span className="num text-danger">-{editingBalance.outQty}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-line/60 pt-1.5">
                <span>ຍອດເຫຼືອໃໝ່ (Balance):</span>
                <span className="num text-[var(--gold)]">
                  {Math.max(0, Number(editOpeningQty) || 0) + editingBalance.inQty - editingBalance.outQty}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted">
                <span>ນ້ຳໜັກ g ລວມໃໝ່:</span>
                <span className="num">
                  {formatWeight(
                    dec(editingBalance.goldSku.weightG)
                      .mul(Math.max(0, Number(editOpeningQty) || 0) + editingBalance.inQty - editingBalance.outQty)
                      .toFixed(),
                  )}{' '}
                  g
                </span>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function LedgerTable({
  titleLo,
  rows,
  history,
  isError,
  error,
  canManage,
  onRetry,
  onView,
  onEdit,
  onDelete,
}: {
  titleLo: string;
  rows: LedgerRow[];
  /** Owns the ຈາກວັນທີ–ຫາວັນທີ controls and the request behind them. */
  history: HistoryRangeState<LedgerRow>;
  isError: boolean;
  error: unknown;
  canManage: boolean;
  onRetry: () => void;
  onView: (row: LedgerRow) => void;
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
}) {
  return (
    <div data-fade className="card">
      <div className="card-header"><h2 className="card-title">{titleLo}</h2></div>
      <DateRangeFilter history={history} />
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
              <th>ຜູ້ບັນທຶກ</th>
              <th className="text-right">ຈັດການ</th>
            </tr>
          </thead>
          <tbody>
            <TableStateRow colSpan={11} isError={isError} error={error} isEmpty={rows.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={onRetry} />
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.businessDate)}</td>
                <td>{row.partnerLabel ?? row.movement?.partner?.nameLo ?? '—'}</td>
                <td className="text-muted">{row.typeLabel}</td>
                <td className="num text-right text-success">{formatWeight(row.goldInG)}</td>
                <td className="num text-right text-danger">{formatWeight(row.goldOutG)}</td>
                <td className="num text-right font-medium">{formatWeight(row.weightG)}</td>
                <td className="num text-right">{formatLak(row.priceIn)}</td>
                <td className="num text-right">{formatLak(row.priceOut)}</td>
                <td className="num text-right font-medium">{formatLak(row.cost)}</td>
                <td className="text-muted">{row.createdBy}</td>
                <td className="text-right">
                  <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                    {/* View Button */}
                    <button
                      type="button"
                      className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/40 transition-colors"
                      title="ເບິ່ງລາຍລະອຽດ"
                      aria-label={`View ${row.typeLabel}`}
                      onClick={() => onView(row)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                    {/* Edit Button */}
                    {canManage && (
                      <button
                        type="button"
                        className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--gold)] hover:bg-[var(--gold)]/10 transition-colors"
                        title="ແກ້ໄຂລາຍການ"
                        aria-label={`Edit ${row.typeLabel}`}
                        onClick={() => onEdit(row)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}

                    {/* Delete Button */}
                    {canManage && (
                      <button
                        type="button"
                        className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-danger hover:bg-danger/10 transition-colors"
                        title="ລຶບລາຍການ"
                        aria-label={`Delete ${row.typeLabel}`}
                        onClick={() => onDelete(row)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
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
