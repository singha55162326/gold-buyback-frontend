'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec } from '@kpv/domain';
import { api, ApiError, getStoredUser } from '@/lib/api';
import { StockMovementDialog, type MovementKind, type TypeBalance, type SkuBalance } from '@/components/stock-movement-dialog';
import { formatLak, formatWeight, formatDate, gramsToBaht } from '@/lib/format';
import { PageHead } from '@/components/page-head';
import { StatCard } from '@/components/stat-card';
import { QueryErrorNotice, TableStateRow } from '@/components/query-state';
import { DateRangeFilter, useHistoryRange } from '@/components/date-range';
import { Dialog } from '@/components/dialog';
import { NumberInput } from '@/components/number-input';
import { useToast } from '@/components/toast';

interface Wac {
  oldWeightG: string;
  oldCost: string;
  pricePerG?: string;
}

interface MovementLine {
  id: string;
  goldSkuId?: string | null;
  goldTypeId?: string | null;
  goldItemId?: string | null;
  oldCategory?: 'JEWELRY' | 'BAR' | null;
  weightG: string;
  quantity: number;
  goldG: string;
  cost: string;
  goldSku?: { id: string; fullSkuName: string; weightG: string } | null;
  goldType?: { id: string; nameLo: string } | null;
  goldItem?: { id: string; nameLo: string } | null;
}

interface MovementData {
  id: string;
  code: string;
  scope: 'NEW' | 'OLD';
  type: 'IN' | 'OUT' | 'TRANSFER';
  partnerId?: string | null;
  partner?: { id: string; nameLo: string; code: string; direction: string } | null;
  transformType?: 'DYE' | 'ETCH' | 'MELT' | null;
  goldPercent?: string | null;
  expectedReturnG?: string | null;
  totalQuantity: number;
  totalGoldG: string;
  totalCost: string;
  pricePerG: string;
  pricePerBaht: string;
  laborFeeThb: string;
  note?: string | null;
  status: string;
  createdAt: string;
  lines: MovementLine[];
}

interface LedgerRow {
  id: string;
  movementId?: string | null;
  goldTypeId?: string;
  businessDate: string;
  partnerLabel: string | null;
  typeLabel: string;
  goldInG: string;
  goldOutG: string;
  weightG: string;
  priceIn: string;
  priceOut: string;
  cost: string;
  goldType: { id?: string; nameLo: string };
  /** ຜູ້ບັນທຶກລາຍການນີ້. */
  createdBy: string;
  movement?: MovementData | null;
}

interface SkuOption {
  id: string;
  fullSkuName: string;
  weightG: string;
}

interface GoldTypeOption {
  id: string;
  nameLo: string;
}

interface GoldItemOption {
  id: string;
  nameLo: string;
}

interface PartnerOption {
  id: string;
  nameLo: string;
  code: string;
  direction: string;
}

interface FormEditLine {
  goldSkuId: string;
  goldTypeId: string;
  goldItemId: string;
  oldCategory: 'JEWELRY' | 'BAR' | '';
  weightG: string;
  quantity: string;
}

const TRANSFORM_LABEL: Record<'DYE' | 'ETCH' | 'MELT', string> = {
  DYE: 'ຍ້ອມ',
  ETCH: 'ກັດ',
  MELT: 'ຫຼອມ',
};

/** TOR §7.3 — Stock (OLD), ສາງຄຳເກົ່າ. */
export default function StockOldPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<MovementKind | null>(null);
  const user = getStoredUser();
  const canMove =
    user?.role === 'WAREHOUSE' || user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  // View / Edit modal states for ຍອດແຍກຕາມປະເພດຄຳ (TypeBalance)
  const [viewingBalance, setViewingBalance] = useState<TypeBalance | null>(null);
  const [editingBalance, setEditingBalance] = useState<TypeBalance | null>(null);
  const [editOpeningWeightG, setEditOpeningWeightG] = useState('');
  const [editOpeningCost, setEditOpeningCost] = useState('');
  const [editBalanceError, setEditBalanceError] = useState<string | null>(null);

  // View / Edit / Delete modal states for ປະຫວັດ Stock (OLD) (Ledger)
  const [viewingRow, setViewingRow] = useState<LedgerRow | null>(null);
  const [editingRow, setEditingRow] = useState<LedgerRow | null>(null);
  const [deletingRow, setDeletingRow] = useState<LedgerRow | null>(null);

  // Edit movement / ledger row form state
  const [editPartnerId, setEditPartnerId] = useState('');
  const [editPartnerLabel, setEditPartnerLabel] = useState('');
  const [editGoldTypeId, setEditGoldTypeId] = useState('');
  const [editTransformType, setEditTransformType] = useState<'DYE' | 'ETCH' | 'MELT' | ''>('');
  const [editGoldPercent, setEditGoldPercent] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editTotalCost, setEditTotalCost] = useState('');
  const [editLedgerWeightG, setEditLedgerWeightG] = useState('');
  const [editLines, setEditLines] = useState<FormEditLine[]>([
    { goldSkuId: '', goldTypeId: '', goldItemId: '', oldCategory: 'JEWELRY', weightG: '', quantity: '1' },
  ]);
  const [editError, setEditError] = useState<string | null>(null);

  const { data: wac, isError: wacFailed, error: wacError, refetch: refetchWac } = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });
  const { data: balances = [], isError: balancesFailed, error: balancesError, refetch: refetchBalances } = useQuery({
    queryKey: ['stock', 'old', 'balances'],
    queryFn: () => api.get<TypeBalance[]>('/stock/old/balances'),
  });
  const { data: newBalances = [] } = useQuery({
    queryKey: ['stock', 'new', 'balances'],
    queryFn: () => api.get<SkuBalance[]>('/stock/new/balances'),
    enabled: Boolean(editingRow),
  });

  // ຄ່າເລີ່ມຕົ້ນ = ມື້ນີ້; the range is widened from the filter strip.
  const historyRange = useHistoryRange<LedgerRow>(['stock', 'old', 'history'], '/stock/old/history');
  const history = historyRange.rows;
  const historyFailed = historyRange.isError;
  const historyError = historyRange.error;
  const refetchHistory = historyRange.refetch;

  // Master data for Edit Modal
  const { data: skus = [] } = useQuery({
    queryKey: ['master', 'gold-skus'],
    queryFn: () => api.get<SkuOption[]>('/master/gold-skus'),
    enabled: Boolean(editingRow),
  });
  const { data: goldTypes = [] } = useQuery({
    queryKey: ['master', 'gold-types'],
    queryFn: () => api.get<GoldTypeOption[]>('/master/gold-types'),
    enabled: Boolean(editingRow),
  });
  const { data: goldItems = [] } = useQuery({
    queryKey: ['master', 'gold-items'],
    queryFn: () => api.get<GoldItemOption[]>('/master/gold-items'),
    enabled: Boolean(editingRow),
  });
  const { data: partners = [] } = useQuery({
    queryKey: ['master', 'partner-sources'],
    queryFn: () => api.get<PartnerOption[]>('/master/partner-sources'),
    enabled: Boolean(editingRow),
  });

  const openEditBalance = (bal: TypeBalance) => {
    setEditOpeningWeightG(dec(bal.openingWeightG || 0).toFixed());
    setEditOpeningCost(dec(bal.openingCost || 0).toFixed());
    setEditBalanceError(null);
    setEditingBalance(bal);
  };

  const openEditModal = (row: LedgerRow) => {
    const mv = row.movement;
    setEditError(null);
    setEditPartnerId(mv?.partnerId ?? '');
    setEditPartnerLabel(row.partnerLabel ?? '');
    setEditGoldTypeId(
      mv?.lines?.[0]?.goldTypeId ?? row.goldTypeId ?? row.goldType?.id ?? '',
    );
    setEditTransformType(mv?.transformType ?? '');
    setEditGoldPercent(mv?.goldPercent ? dec(mv.goldPercent).toFixed() : '');
    setEditNote(mv?.note ?? '');

    const isInRow = mv ? mv.type === 'IN' : dec(row.goldInG || 0).gt(0);
    setEditTotalCost(
      mv
        ? dec(mv.totalCost || 0).toFixed()
        : dec(isInRow ? row.priceIn || 0 : row.priceOut || 0).toFixed(),
    );
    setEditLedgerWeightG(
      dec(isInRow ? row.goldInG || 0 : row.goldOutG || 0).toFixed(),
    );

    if (mv && mv.lines && mv.lines.length > 0) {
      setEditLines(
        mv.lines.map((l) => ({
          goldSkuId: l.goldSkuId ?? '',
          goldTypeId: l.goldTypeId ?? row.goldTypeId ?? row.goldType?.id ?? '',
          goldItemId: l.goldItemId ?? '',
          oldCategory: l.oldCategory ?? (mv.type === 'IN' ? 'JEWELRY' : ''),
          weightG: dec(l.weightG || 0).toFixed(),
          quantity: String(l.quantity),
        })),
      );
    } else {
      const w = isInRow ? row.goldInG : row.goldOutG;
      setEditLines([
        {
          goldSkuId: '',
          goldTypeId: row.goldTypeId ?? row.goldType?.id ?? '',
          goldItemId: '',
          oldCategory: isInRow ? 'JEWELRY' : '',
          weightG: dec(w || 0).toFixed(),
          quantity: '1',
        },
      ]);
    }
    setEditingRow(row);
  };

  const editCalculations = useMemo(() => {
    if (!editingRow?.movement) {
      let w = dec(0);
      let c = dec(0);
      try {
        w = dec(editLedgerWeightG || 0);
      } catch {
        w = dec(0);
      }
      try {
        c = dec(editTotalCost || 0);
      } catch {
        c = dec(0);
      }
      const perG = w.gt(0) ? c.div(w) : dec(0);
      return { totalGoldG: w, totalQty: 1, cost: c, perG };
    }

    const totalGoldG = editLines.reduce((sum, l) => {
      try {
        return sum.plus(dec(l.weightG || 0).mul(Number(l.quantity) || 0));
      } catch {
        return sum;
      }
    }, dec(0));
    const totalQty = editLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
    const isIn = editingRow.movement.type === 'IN';
    let cost = dec(0);
    let perG = dec(0);
    if (isIn) {
      try {
        cost = dec(editTotalCost || 0);
      } catch {
        cost = dec(0);
      }
      perG = totalGoldG.gt(0) ? cost.div(totalGoldG) : dec(0);
    } else {
      perG = dec(editingRow.movement.pricePerG || wac?.pricePerG || 0);
      cost = totalGoldG.mul(perG);
    }
    return { totalGoldG, totalQty, cost, perG };
  }, [editLines, editTotalCost, editLedgerWeightG, editingRow, wac]);

  // Available weight for a GoldType in Edit modal (current closingWeightG + original movement's OUT weight for that GoldType)
  const getEditAvailableOldWeight = (goldTypeId: string) => {
    if (!goldTypeId) return null;
    const bal = balances.find(
      (b) => (b.goldTypeId ?? b.goldType?.id) === goldTypeId,
    );
    const currentClosingWeight = dec(bal?.closingWeightG ?? 0);
    const origOutWeight = (editingRow?.movement?.lines ?? [])
      .filter((l) => l.goldTypeId === goldTypeId)
      .reduce((sum, l) => sum.plus(dec(l.goldG || 0)), dec(0));
    return currentClosingWeight.plus(origOutWeight);
  };

  // Available weight for a NEW SKU in Edit modal (when editing a NEW_TO_OLD transfer from /stock/old)
  const getEditAvailableNewSkuWeight = (skuId: string) => {
    if (!skuId) return null;
    const bal = newBalances.find((b) => (b.goldSkuId ?? b.goldSku.id) === skuId);
    const currentWeight = dec(bal?.totalWeightG ?? 0);
    const origLineWeight = (editingRow?.movement?.lines ?? [])
      .filter((l) => l.goldSkuId === skuId)
      .reduce((sum, l) => sum.plus(dec(l.goldG || 0)), dec(0));
    return currentWeight.plus(origLineWeight);
  };

  const getEditMaxWeightForLine = (idx: number) => {
    const mv = editingRow?.movement;
    if (!mv || mv.type === 'IN') return undefined;

    const currentLine = editLines[idx];
    if (!currentLine) return undefined;
    const currentQty = Math.max(1, Number(currentLine.quantity) || 1);

    // Case 1: Transfer NEW -> OLD (movement.scope === 'NEW' && movement.type === 'TRANSFER')
    if (mv.scope === 'NEW' && mv.type === 'TRANSFER') {
      const targetSkuId = currentLine.goldSkuId;
      if (!targetSkuId) return undefined;
      const available = getEditAvailableNewSkuWeight(targetSkuId);
      if (available === null) return undefined;
      let otherLinesWeight = dec(0);
      editLines.forEach((l, i) => {
        if (i === idx) return;
        if (l.goldSkuId === targetSkuId) {
          try {
            otherLinesWeight = otherLinesWeight.plus(
              dec(l.weightG || 0).mul(Number(l.quantity) || 0),
            );
          } catch {
            // ignore
          }
        }
      });
      const remaining = available.minus(otherLinesWeight);
      const maxPerUnit = remaining.gt(0) ? remaining.div(currentQty) : dec(0);
      return Number(maxPerUnit.toDecimalPlaces(2).toFixed());
    }

    // Case 2: OLD OUT or Transfer OLD -> NEW
    const targetGoldTypeId =
      mv.type === 'TRANSFER' ? editGoldTypeId : currentLine.goldTypeId;
    if (!targetGoldTypeId) return undefined;
    const available = getEditAvailableOldWeight(targetGoldTypeId);
    if (available === null) return undefined;

    let otherLinesWeight = dec(0);
    editLines.forEach((l, i) => {
      if (i === idx) return;
      const lTypeId = mv.type === 'TRANSFER' ? editGoldTypeId : l.goldTypeId;
      if (lTypeId === targetGoldTypeId) {
        try {
          otherLinesWeight = otherLinesWeight.plus(
            dec(l.weightG || 0).mul(Number(l.quantity) || 0),
          );
        } catch {
          // ignore
        }
      }
    });

    const remaining = available.minus(otherLinesWeight);
    const maxPerUnit = remaining.gt(0) ? remaining.div(currentQty) : dec(0);
    return Number(maxPerUnit.toDecimalPlaces(2).toFixed());
  };

  const editOverweightMessage = useMemo(() => {
    const mv = editingRow?.movement;
    if (!mv || mv.type === 'IN') return null;

    if (mv.scope === 'NEW' && mv.type === 'TRANSFER') {
      const bySku = new Map<string, ReturnType<typeof dec>>();
      for (const l of editLines) {
        if (!l.goldSkuId) continue;
        try {
          const lineW = dec(l.weightG || 0).mul(Number(l.quantity) || 0);
          bySku.set(l.goldSkuId, (bySku.get(l.goldSkuId) ?? dec(0)).plus(lineW));
        } catch {
          // ignore
        }
      }
      for (const [skuId, requested] of bySku) {
        const available = getEditAvailableNewSkuWeight(skuId);
        if (available !== null && requested.gt(available)) {
          const skuName = skus.find((s) => s.id === skuId)?.fullSkuName ?? 'SKU';
          return `ນ້ຳໜັກລວມຂອງ "${skuName}" (${formatWeight(requested.toFixed())} g) ເກີນນ້ຳໜັກ g ລວມທີ່ມີ (${formatWeight(available.toFixed())} g)`;
        }
      }
      return null;
    }

    const byType = new Map<string, ReturnType<typeof dec>>();
    for (const l of editLines) {
      const gtId = mv.type === 'TRANSFER' ? editGoldTypeId : l.goldTypeId;
      if (!gtId) continue;
      try {
        const lineW = dec(l.weightG || 0).mul(Number(l.quantity) || 0);
        byType.set(gtId, (byType.get(gtId) ?? dec(0)).plus(lineW));
      } catch {
        // ignore
      }
    }
    for (const [gtId, requested] of byType) {
      const available = getEditAvailableOldWeight(gtId);
      if (available !== null && requested.gt(available)) {
        const typeName =
          goldTypes.find((g) => g.id === gtId)?.nameLo ??
          balances.find((b) => (b.goldTypeId ?? b.goldType?.id) === gtId)?.goldType.nameLo ??
          'ປະເພດຄຳ';
        return `ນ້ຳໜັກລວມຂອງ "${typeName}" (${formatWeight(requested.toFixed())} g) ເກີນຍອດຄົງເຫຼືອ (${formatWeight(available.toFixed())} g)`;
      }
    }
    return null;
  }, [editLines, editGoldTypeId, editingRow, balances, newBalances, goldTypes, skus]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingRow) throw new Error('ບໍ່ພົບລາຍການ');
      if (editingRow.movementId && editingRow.movement) {
        const mv = editingRow.movement;
        return api.patch(`/stock/movements/${editingRow.movementId}`, {
          partnerId: editPartnerId || undefined,
          goldTypeId: mv.type === 'TRANSFER' && editGoldTypeId ? editGoldTypeId : undefined,
          transformType: mv.type === 'OUT' ? (editTransformType || null) : undefined,
          goldPercent: mv.type === 'OUT' && editGoldPercent ? editGoldPercent : undefined,
          totalCost: mv.type === 'IN' ? editTotalCost : undefined,
          note: editNote,
          lines: editLines.map((l) => ({
            goldSkuId: l.goldSkuId || undefined,
            goldTypeId:
              mv.type === 'TRANSFER'
                ? editGoldTypeId || l.goldTypeId || undefined
                : l.goldTypeId || undefined,
            goldItemId: l.goldItemId || undefined,
            oldCategory: mv.type === 'IN' && l.oldCategory ? l.oldCategory : undefined,
            weightG: l.weightG,
            quantity: Number(l.quantity),
          })),
        });
      }
      // Fallback for ledger rows without movementId (e.g. handover / buyback / exchange)
      return api.patch(`/stock/old/history/${editingRow.id}`, {
        goldTypeId: editGoldTypeId || undefined,
        partnerLabel: editPartnerLabel,
        weightG: editLedgerWeightG,
        totalCost: editTotalCost,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['apar'] });
      toast.success('ແກ້ໄຂລາຍການສຳເລັດ');
      setEditingRow(null);
    },
    onError: (err: unknown) => {
      setEditError(err instanceof ApiError ? err.message : 'ເກີດຂໍ້ຜິດພາດໃນການແກ້ໄຂ');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (row: LedgerRow) => {
      if (row.movementId) {
        return api.delete(`/stock/movements/${row.movementId}`);
      }
      return api.delete(`/stock/old/history/${row.id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['apar'] });
      toast.success('ລຶບລາຍການສຳເລັດ');
      setDeletingRow(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'ບໍ່ສາມາດລຶບລາຍການໄດ້');
    },
  });

  const updateBalanceMutation = useMutation({
    mutationFn: () => {
      if (!editingBalance) throw new Error('ບໍ່ພົບຍອດປະເພດຄຳ');
      return api.patch(`/stock/old/balances/${editingBalance.id}`, {
        openingWeightG: editOpeningWeightG || '0',
        openingCost: editOpeningCost || '0',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock', 'old', 'balances'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger', 'wac'] });
      toast.success('ແກ້ໄຂຍອດຕັ້ງຕົ້ນສຳເລັດ');
      setEditingBalance(null);
    },
    onError: (err: unknown) => {
      setEditBalanceError(err instanceof ApiError ? err.message : 'ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ');
    },
  });

  const updateEditLine = (idx: number, patch: Partial<FormEditLine>) => {
    setEditLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

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
        <StockMovementDialog
          kind={dialog}
          scope="OLD"
          onClose={() => setDialog(null)}
          initialBalances={balances}
        />
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
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={10} isError={balancesFailed} error={balancesError} isEmpty={balances.length === 0} emptyText="ຍັງບໍ່ມີຍອດໃນມື້ນີ້" onRetry={() => void refetchBalances()} />
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
                  <td className="text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                      {/* View Button */}
                      <button
                        type="button"
                        className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/40 transition-colors"
                        title="ເບິ່ງລາຍລະອຽດຍອດປະເພດຄຳ"
                        aria-label={`View ${row.goldType.nameLo}`}
                        onClick={() => setViewingBalance(row)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>

                      {/* Edit Button */}
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--gold)] hover:bg-[var(--gold)]/10 transition-colors"
                          title="ແກ້ໄຂຍອດຕັ້ງຕົ້ນ (Opening Weight & Cost)"
                          aria-label={`Edit ${row.goldType.nameLo}`}
                          onClick={() => openEditBalance(row)}
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
          ນໍ້າໜັກ(g) ຄົງເຫຼືອ = ຕັ້ງຕົ້ນ + GOLD(g) IN − GOLD(g) OUT ·
          ຕົ້ນທຶນຄົງເຫຼືອ = ຕົ້ນທຶນຕັ້ງຕົ້ນ + PRICE (IN) − PRICE (OUT) ·
          ມື້ໃໝ່ຄົງເຫຼືອຈະກາຍເປັນຕັ້ງຕົ້ນ
        </p>
      </div>

      <div data-fade className="card">
        <div className="card-header"><h2 className="card-title">ປະຫວັດ Stock (OLD)</h2></div>
        <DateRangeFilter history={historyRange} />
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
                <th>ຜູ້ບັນທຶກ</th>
                <th className="text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              <TableStateRow colSpan={12} isError={historyFailed} error={historyError} isEmpty={history.length === 0} emptyText="ຍັງບໍ່ມີລາຍການ" onRetry={() => void refetchHistory()} />
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
                  <td className="text-muted">{row.createdBy}</td>
                  <td className="text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                      {/* View Button */}
                      <button
                        type="button"
                        className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-muted hover:text-fg hover:bg-line/40 transition-colors"
                        title="ເບິ່ງລາຍລະອຽດ"
                        aria-label={`View ${row.typeLabel}`}
                        onClick={() => setViewingRow(row)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>

                      {/* Edit Button */}
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--gold)] hover:bg-[var(--gold)]/10 transition-colors"
                          title="ແກ້ໄຂລາຍການ"
                          aria-label={`Edit ${row.typeLabel}`}
                          onClick={() => openEditModal(row)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}

                      {/* Delete Button */}
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn-ghost p-1.5 h-8 w-8 rounded-lg flex items-center justify-center text-danger hover:bg-danger/10 transition-colors"
                          title="ລຶບລາຍການ"
                          aria-label={`Delete ${row.typeLabel}`}
                          onClick={() => setDeletingRow(row)}
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
      </div>

      {/* ─── VIEW TYPE BALANCE MODAL ─────────────────────────────────── */}
      {viewingBalance && (
        <Dialog
          open
          onClose={() => setViewingBalance(null)}
          size="md"
          title={`ລາຍລະອຽດປະເພດຄຳ — ${viewingBalance.goldType.nameLo}`}
          footer={
            <button className="btn-secondary" onClick={() => setViewingBalance(null)}>
              ປິດ
            </button>
          }
        >
          <div className="space-y-4">
            <div className="p-3 bg-recessed rounded-xl border border-line text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted">ປະເພດຄຳ:</span>
                <span className="font-semibold">{viewingBalance.goldType.nameLo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ນ້ຳໜັກຄົງເຫຼືອ:</span>
                <span className="font-medium num">
                  {formatWeight(viewingBalance.closingWeightG)} g ({gramsToBaht(viewingBalance.closingWeightG)} ບາດ)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3">
                <span className="text-xs text-muted block">ນໍ້າໜັກ (g) ຕັ້ງຕົ້ນ</span>
                <span className="num font-semibold text-base">{formatWeight(viewingBalance.openingWeightG)} g</span>
                <span className="text-xs text-muted block">{formatLak(viewingBalance.openingCost)} LAK</span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ເຂົ້າ (IN) ມື້ນີ້</span>
                <span className="num font-semibold text-base text-success">+{formatWeight(viewingBalance.inG)} g</span>
                <span className="text-xs text-muted block">+{formatLak(viewingBalance.priceIn)} LAK</span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ອອກ (OUT) ມື້ນີ້</span>
                <span className="num font-semibold text-base text-danger">-{formatWeight(viewingBalance.outG)} g</span>
                <span className="text-xs text-muted block">-{formatLak(viewingBalance.priceOut)} LAK</span>
              </div>
              <div className="card p-3">
                <span className="text-xs text-muted block">ຕົ້ນທຶນຄົງເຫຼືອ (LAK)</span>
                <span className="num font-semibold text-base text-[var(--gold)]">{formatLak(viewingBalance.closingCost)}</span>
                <span className="text-xs text-muted block">LAK</span>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* ─── EDIT TYPE BALANCE MODAL (ADMIN ONLY) ────────────────────── */}
      {editingBalance && isAdmin && (
        <Dialog
          open
          onClose={() => setEditingBalance(null)}
          size="md"
          title={`ແກ້ໄຂຍອດຕັ້ງຕົ້ນ — ${editingBalance.goldType.nameLo}`}
          footer={
            <>
              <button
                className="btn-secondary"
                onClick={() => setEditingBalance(null)}
                disabled={updateBalanceMutation.isPending}
              >
                ຍົກເລີກ
              </button>
              <button
                className="btn-primary"
                onClick={() => updateBalanceMutation.mutate()}
                disabled={updateBalanceMutation.isPending}
              >
                {updateBalanceMutation.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">ນໍ້າໜັກ (g) ຕັ້ງຕົ້ນ *</label>
                <NumberInput
                  decimals={4}
                  className="input num font-semibold text-base"
                  value={editOpeningWeightG}
                  onValueChange={setEditOpeningWeightG}
                  required
                />
              </div>
              <div>
                <label className="label">ຕົ້ນທຶນຕັ້ງຕົ້ນ (LAK) *</label>
                <NumberInput
                  decimals={2}
                  className="input num font-semibold text-base"
                  value={editOpeningCost}
                  onValueChange={setEditOpeningCost}
                  required
                />
              </div>
            </div>

            {(() => {
              let nextWeight = dec(0);
              let nextCost = dec(0);
              try {
                nextWeight = dec(editOpeningWeightG || 0)
                  .plus(dec(editingBalance.inG || 0))
                  .minus(dec(editingBalance.outG || 0));
              } catch {
                nextWeight = dec(0);
              }
              try {
                nextCost = dec(editOpeningCost || 0)
                  .plus(dec(editingBalance.priceIn || 0))
                  .minus(dec(editingBalance.priceOut || 0));
              } catch {
                nextCost = dec(0);
              }
              return (
                <div className="p-3 bg-recessed rounded-xl border border-line text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted">ຍອດເຂົ້າ (IN):</span>
                    <span className="num text-success">+{formatWeight(editingBalance.inG)} g</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">ຍອດອອກ (OUT):</span>
                    <span className="num text-danger">-{formatWeight(editingBalance.outG)} g</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-line/60 pt-1.5">
                    <span>ຍອດນ້ຳໜັກຄົງເຫຼືອໃໝ່:</span>
                    <span className="num text-[var(--gold)]">
                      {formatWeight(nextWeight.toFixed())} g ({gramsToBaht(nextWeight.toFixed())} ບາດ)
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>ຍອດຕົ້ນທຶນຄົງເຫຼືອໃໝ່:</span>
                    <span className="num text-[var(--gold)]">
                      {formatLak(nextCost.toFixed())} LAK
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </Dialog>
      )}

      {/* ─── VIEW MOVEMENT / HISTORY MODAL ───────────────────────────── */}
      {viewingRow && (
        <Dialog
          open
          size="lg"
          title={`ລາຍລະອຽດການເຄື່ອນໄຫວສາງ — ${viewingRow.movement?.code ?? viewingRow.typeLabel}`}
          onClose={() => setViewingRow(null)}
          footer={
            <button className="btn-secondary" onClick={() => setViewingRow(null)}>
              ປິດ
            </button>
          }
        >
          {(() => {
            const mv = viewingRow.movement;
            const isIn = mv ? mv.type === 'IN' : dec(viewingRow.goldInG).gt(0);
            const isTransfer = mv?.type === 'TRANSFER' || viewingRow.typeLabel.includes('Transfer');
            const totalW = mv ? mv.totalGoldG : isIn ? viewingRow.goldInG : viewingRow.goldOutG;
            const totalC = mv ? mv.totalCost : isIn ? viewingRow.priceIn : viewingRow.priceOut;
            const perG = mv?.pricePerG
              ? mv.pricePerG
              : dec(totalW || 0).gt(0)
                ? dec(totalC || 0).div(dec(totalW)).toFixed()
                : '0';

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-recessed rounded-xl border border-line text-sm">
                  <div>
                    <span className="text-xs text-muted block">ລະຫັດລາຍການ</span>
                    <span className="font-mono font-medium">{mv?.code ?? viewingRow.typeLabel}</span>
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
                    <span className="font-medium">{mv?.partner?.nameLo ?? viewingRow.partnerLabel ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block">ປະເພດຄຳ</span>
                    <span className="font-medium">{viewingRow.goldType?.nameLo ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block">ຜູ້ບັນທຶກ</span>
                    <span>{viewingRow.createdBy}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted block">ສະຖານະ</span>
                    <span className="font-medium text-success">{mv?.status ?? 'COMPLETED'}</span>
                  </div>
                  {mv?.transformType && (
                    <div>
                      <span className="text-xs text-muted block">ແປງສະພາບ</span>
                      <span className="font-medium">{TRANSFORM_LABEL[mv.transformType] ?? mv.transformType}</span>
                    </div>
                  )}
                  {mv?.goldPercent && dec(mv.goldPercent).gt(0) && (
                    <div>
                      <span className="text-xs text-muted block">%ຄຳ / ນ້ຳໜັກຄາດວ່າຈະໄດ້ຮັບ</span>
                      <span className="font-medium num">
                        {formatWeight(mv.goldPercent)}% {mv.expectedReturnG ? `(${formatWeight(mv.expectedReturnG)} g)` : ''}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="card p-3">
                    <span className="text-xs text-muted block">ນ້ຳໜັກຄຳ</span>
                    <span className={`num font-semibold text-base ${isIn ? 'text-success' : 'text-danger'}`}>
                      {isIn ? '+' : '-'}{formatWeight(totalW)} g
                    </span>
                    <span className="text-xs text-muted block">{gramsToBaht(totalW)} ບາດ</span>
                  </div>
                  <div className="card p-3">
                    <span className="text-xs text-muted block">ຈຳນວນລວມ</span>
                    <span className="num font-semibold text-base">{mv?.totalQuantity ?? 1} ຊິ້ນ</span>
                  </div>
                  <div className="card p-3">
                    <span className="text-xs text-muted block">ລາຄາ / g</span>
                    <span className="num font-semibold text-base">{formatLak(perG)}</span>
                    <span className="text-xs text-muted block">LAK</span>
                  </div>
                  <div className="card p-3">
                    <span className="text-xs text-muted block">ຕົ້ນທຶນລວມ</span>
                    <span className="num font-semibold text-base text-[var(--gold)]">{formatLak(totalC)}</span>
                    <span className="text-xs text-muted block">LAK</span>
                  </div>
                </div>

                {mv?.note && (
                  <div className="p-3 bg-recessed rounded-xl border border-line text-sm">
                    <span className="text-xs text-muted block mb-0.5">ໝາຍເຫດ</span>
                    <p className="text-fg">{mv.note}</p>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold mb-2">ລາຍການຄຳໃນໃບບິນ</h4>
                  <div className="table-wrap border border-line rounded-lg">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>ປະເພດຄຳ / SKU</th>
                          <th>ລາຍການຄຳ</th>
                          <th>ໝວດ</th>
                          <th className="text-right">ນ້ຳໜັກ/ຊິ້ນ (g)</th>
                          <th className="text-right">ຈຳນວນ</th>
                          <th className="text-right">ນ້ຳໜັກລວມ (g)</th>
                          <th className="text-right">ຕົ້ນທຶນ (LAK)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mv?.lines && mv.lines.length > 0 ? (
                          mv.lines.map((line, idx) => (
                            <tr key={line.id || idx}>
                              <td className="text-muted text-xs">{idx + 1}</td>
                              <td className="font-medium">
                                {line.goldType?.nameLo ?? line.goldSku?.fullSkuName ?? viewingRow.goldType?.nameLo ?? '—'}
                              </td>
                              <td>{line.goldItem?.nameLo ?? '—'}</td>
                              <td>
                                {line.oldCategory === 'JEWELRY'
                                  ? 'ຮູບປະພັນ'
                                  : line.oldCategory === 'BAR'
                                    ? 'ແທ່ງ'
                                    : '—'}
                              </td>
                              <td className="num text-right">{formatWeight(line.weightG)}</td>
                              <td className="num text-right">{line.quantity}</td>
                              <td className="num text-right font-semibold">{formatWeight(line.goldG)}</td>
                              <td className="num text-right">{formatLak(line.cost)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="text-muted text-xs">1</td>
                            <td className="font-medium">{viewingRow.goldType?.nameLo ?? '—'}</td>
                            <td>—</td>
                            <td>—</td>
                            <td className="num text-right">{formatWeight(totalW)}</td>
                            <td className="num text-right">1</td>
                            <td className="num text-right font-semibold">{formatWeight(totalW)}</td>
                            <td className="num text-right">{formatLak(totalC)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </Dialog>
      )}

      {/* ─── EDIT MOVEMENT / HISTORY MODAL (ADMIN ONLY) ──────────────── */}
      {editingRow && isAdmin && (
        <Dialog
          open
          size="lg"
          title={`ແກ້ໄຂລາຍການ — ${editingRow.movement?.code ?? editingRow.typeLabel}`}
          onClose={() => setEditingRow(null)}
          footer={
            <>
              <button
                className="btn-secondary"
                onClick={() => setEditingRow(null)}
                disabled={updateMutation.isPending}
              >
                ຍົກເລີກ
              </button>
              <button
                className="btn-primary"
                onClick={() => updateMutation.mutate()}
                disabled={
                  updateMutation.isPending ||
                  editCalculations.totalGoldG.lte(0) ||
                  Boolean(editOverweightMessage)
                }
              >
                {updateMutation.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກການແກ້ໄຂ'}
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
            {editingRow.movement ? (
              <>
                {/* Partner / GoldType header fields */}
                {editingRow.movement.type === 'OUT' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">ແຫຼ່ງສົ່ງມອບ *</label>
                      <select
                        className="input"
                        value={editPartnerId}
                        onChange={(e) => setEditPartnerId(e.target.value)}
                        required
                      >
                        <option value="">— ເລືອກ —</option>
                        {partners
                          .filter((p) => p.direction === 'OUT' || p.direction === 'BOTH')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nameLo}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">ແປງສະພາບ (ຖ້າມີ)</label>
                      <select
                        className="input"
                        value={editTransformType}
                        onChange={(e) =>
                          setEditTransformType(e.target.value as 'DYE' | 'ETCH' | 'MELT' | '')
                        }
                      >
                        <option value="">— ບໍ່ລະບຸ —</option>
                        <option value="DYE">ຍ້ອມ</option>
                        <option value="ETCH">ກັດ</option>
                        <option value="MELT">ຫຼອມ</option>
                      </select>
                    </div>
                  </div>
                )}

                {editingRow.movement.type === 'OUT' && (
                  <div>
                    <label className="label">%ຄຳ (ສຳລັບສົ່ງຊ່າງນອກ / ອື່ນໆ)</label>
                    <NumberInput
                      decimals={2}
                      max="100"
                      className="input num"
                      value={editGoldPercent}
                      onValueChange={setEditGoldPercent}
                      placeholder="ເຊັ່ນ 99.99"
                    />
                  </div>
                )}

                {editingRow.movement.type === 'TRANSFER' && (
                  <div>
                    <label className="label">ປະເພດຄຳ (ຝັ່ງ OLD) *</label>
                    <select
                      className="input"
                      value={editGoldTypeId}
                      onChange={(e) => setEditGoldTypeId(e.target.value)}
                      required
                    >
                      <option value="">— ເລືອກປະເພດຄຳ —</option>
                      {goldTypes.map((gt) => {
                        const avail = getEditAvailableOldWeight(gt.id);
                        return (
                          <option key={gt.id} value={gt.id}>
                            {gt.nameLo}
                            {editingRow.movement?.scope === 'OLD' && avail !== null
                              ? ` (ຍອດຄົງເຫຼືອ: ${formatWeight(avail.toFixed())} g)`
                              : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Lines Editor */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label mb-0">ລາຍການຄຳ</span>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1 text-xs"
                      onClick={() =>
                        setEditLines((prev) => [
                          ...prev,
                          {
                            goldSkuId: '',
                            goldTypeId: editGoldTypeId || '',
                            goldItemId: '',
                            oldCategory: editingRow.movement?.type === 'IN' ? 'JEWELRY' : '',
                            weightG: '',
                            quantity: '1',
                          },
                        ])
                      }
                    >
                      + ເພີ່ມລາຍການ
                    </button>
                  </div>

                  {editLines.map((line, idx) => {
                    const mv = editingRow.movement!;
                    const isTransferNewToOld =
                      mv.type === 'TRANSFER' && mv.scope === 'NEW';
                    const isTransferOldToNew =
                      mv.type === 'TRANSFER' && mv.scope === 'OLD';
                    const isOldIn = mv.type === 'IN' && mv.scope === 'OLD';
                    const isOldOut = mv.type === 'OUT' && mv.scope === 'OLD';
                    const maxW = getEditMaxWeightForLine(idx);

                    return (
                      <div
                        key={idx}
                        className="space-y-2 rounded-lg border border-line bg-surface-2/40 p-3"
                      >
                        <div className="grid grid-cols-12 items-end gap-2">
                          {/* Primary selector: SKU for NEW_TO_OLD transfer, GoldType for OLD IN/OUT */}
                          {isTransferNewToOld ? (
                            <div className="col-span-6">
                              <label className="label">SKU (ຝັ່ງ NEW) *</label>
                              <select
                                className="input"
                                value={line.goldSkuId}
                                onChange={(e) => {
                                  const sku = skus.find((s) => s.id === e.target.value);
                                  const skuWeight = sku ? dec(sku.weightG) : null;
                                  const availW = getEditAvailableNewSkuWeight(e.target.value);
                                  const nextW =
                                    skuWeight && availW !== null && skuWeight.gt(availW)
                                      ? availW.gt(0)
                                        ? availW.toDecimalPlaces(2).toFixed()
                                        : '0'
                                      : sku
                                        ? dec(sku.weightG).toFixed()
                                        : line.weightG;
                                  updateEditLine(idx, {
                                    goldSkuId: e.target.value,
                                    weightG: nextW,
                                  });
                                }}
                                required
                              >
                                <option value="">— ເລືອກ SKU —</option>
                                {skus.map((s) => {
                                  const avail = getEditAvailableNewSkuWeight(s.id);
                                  return (
                                    <option key={s.id} value={s.id}>
                                      {s.fullSkuName}
                                      {avail !== null
                                        ? ` (ລວມ: ${formatWeight(avail.toFixed())} g)`
                                        : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          ) : !isTransferOldToNew ? (
                            <div className={isOldIn ? 'col-span-4' : 'col-span-6'}>
                              <label className="label">ປະເພດຄຳ *</label>
                              <select
                                className="input"
                                value={line.goldTypeId}
                                onChange={(e) => {
                                  const nextTypeId = e.target.value;
                                  let nextW = line.weightG;
                                  if (isOldOut && nextTypeId && line.weightG) {
                                    const avail = getEditAvailableOldWeight(nextTypeId);
                                    const qty = Math.max(1, Number(line.quantity) || 1);
                                    if (avail !== null) {
                                      const maxUnit = avail.gt(0) ? avail.div(qty) : dec(0);
                                      try {
                                        if (dec(line.weightG).gt(maxUnit)) {
                                          nextW = maxUnit.toDecimalPlaces(2).toFixed();
                                        }
                                      } catch {
                                        // ignore
                                      }
                                    }
                                  }
                                  updateEditLine(idx, {
                                    goldTypeId: nextTypeId,
                                    weightG: nextW,
                                  });
                                }}
                                required
                              >
                                <option value="">— ເລືອກປະເພດຄຳ —</option>
                                {goldTypes.map((gt) => {
                                  const avail = getEditAvailableOldWeight(gt.id);
                                  return (
                                    <option key={gt.id} value={gt.id}>
                                      {gt.nameLo}
                                      {isOldOut && avail !== null
                                        ? ` (ຄົງເຫຼືອ: ${formatWeight(avail.toFixed())} g)`
                                        : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          ) : null}

                          {isOldIn && (
                            <>
                              <div className="col-span-4">
                                <label className="label">ລາຍການຄຳ</label>
                                <select
                                  className="input"
                                  value={line.goldItemId}
                                  onChange={(e) =>
                                    updateEditLine(idx, { goldItemId: e.target.value })
                                  }
                                >
                                  <option value="">— ເລືອກ —</option>
                                  {goldItems.map((gi) => (
                                    <option key={gi.id} value={gi.id}>
                                      {gi.nameLo}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-span-4">
                                <label className="label">ໝວດ</label>
                                <select
                                  className="input"
                                  value={line.oldCategory}
                                  onChange={(e) =>
                                    updateEditLine(idx, {
                                      oldCategory: e.target.value as 'JEWELRY' | 'BAR',
                                    })
                                  }
                                >
                                  <option value="JEWELRY">ຮູບປະພັນ</option>
                                  <option value="BAR">ແທ່ງ</option>
                                </select>
                              </div>
                            </>
                          )}

                          <div className={isOldIn ? 'col-span-5' : isTransferOldToNew ? 'col-span-6' : 'col-span-3'}>
                            <label className="label">weight_g *</label>
                            <NumberInput
                              decimals={4}
                              className="input num"
                              value={line.weightG}
                              onValueChange={(v) => updateEditLine(idx, { weightG: v })}
                              max={maxW !== undefined ? String(maxW) : undefined}
                              required
                            />
                          </div>
                          <div className={isOldIn ? 'col-span-5' : isTransferOldToNew ? 'col-span-4' : 'col-span-2'}>
                            <label className="label">ຈຳນວນ *</label>
                            <NumberInput
                              decimals={0}
                              className="input num"
                              value={line.quantity}
                              onValueChange={(v) => {
                                if (mv.type !== 'IN') {
                                  const qty = Math.max(1, Number(v) || 1);
                                  let avail: ReturnType<typeof dec> | null = null;
                                  if (isTransferNewToOld && line.goldSkuId) {
                                    avail = getEditAvailableNewSkuWeight(line.goldSkuId);
                                  } else {
                                    const gtId =
                                      mv.type === 'TRANSFER' ? editGoldTypeId : line.goldTypeId;
                                    if (gtId) avail = getEditAvailableOldWeight(gtId);
                                  }
                                  if (avail !== null && line.weightG) {
                                    try {
                                      const w = dec(line.weightG);
                                      if (w.gt(0) && w.mul(qty).gt(avail)) {
                                        const maxQty = Math.max(
                                          1,
                                          Math.floor(Number(avail.div(w).toFixed())),
                                        );
                                        updateEditLine(idx, { quantity: String(maxQty) });
                                        return;
                                      }
                                    } catch {
                                      // ignore
                                    }
                                  }
                                }
                                updateEditLine(idx, { quantity: v });
                              }}
                              required
                            />
                          </div>
                          <div className="col-span-2 flex justify-end sm:col-span-1">
                            {editLines.length > 1 && (
                              <button
                                type="button"
                                className="btn-ghost p-1 h-8 w-8 text-danger hover:bg-danger/10 rounded flex items-center justify-center"
                                title="ລຶບແຖວນີ້"
                                onClick={() =>
                                  setEditLines((prev) => prev.filter((_, i) => i !== idx))
                                }
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {editingRow.movement.type === 'IN' && (
                  <div>
                    <label className="label">ຕົ້ນທຶນຄຳລວມ (LAK) *</label>
                    <NumberInput
                      decimals={2}
                      className="input num"
                      value={editTotalCost}
                      onValueChange={setEditTotalCost}
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="label">ໝາຍເຫດ</label>
                  <input
                    className="input"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </div>
              </>
            ) : (
              /* Fallback editor for ledger rows without a movementId */
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">ປະເພດຄຳ *</label>
                    <select
                      className="input"
                      value={editGoldTypeId}
                      onChange={(e) => setEditGoldTypeId(e.target.value)}
                      required
                    >
                      <option value="">— ເລືອກປະເພດຄຳ —</option>
                      {goldTypes.map((gt) => (
                        <option key={gt.id} value={gt.id}>
                          {gt.nameLo}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">ແຫຼ່ງ</label>
                    <input
                      className="input"
                      value={editPartnerLabel}
                      onChange={(e) => setEditPartnerLabel(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">ນ້ຳໜັກຄຳ (g) *</label>
                    <NumberInput
                      decimals={4}
                      className="input num"
                      value={editLedgerWeightG}
                      onValueChange={setEditLedgerWeightG}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">ຕົ້ນທຶນລວມ (LAK) *</label>
                    <NumberInput
                      decimals={2}
                      className="input num"
                      value={editTotalCost}
                      onValueChange={setEditTotalCost}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Live Calculation Summary */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-gold/40 bg-gold/5 p-3.5 text-sm">
              <div>
                <div className="text-xs text-muted">ລວມນ້ຳໜັກຄຳ</div>
                <div className="num text-base font-bold text-ink">
                  {formatWeight(editCalculations.totalGoldG.toFixed())} g
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">ລວມຈຳນວນ</div>
                <div className="num text-base font-bold text-ink">
                  {editCalculations.totalQty} ຊິ້ນ
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">ຕົ້ນທຶນຄຳລວມ</div>
                <div className="num text-base font-bold text-gold">
                  {formatLak(editCalculations.cost.toFixed())} LAK
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">ລາຄາສະເລ່ຍ / g</div>
                <div className="num text-base font-bold text-ink">
                  {formatLak(editCalculations.perG.toFixed())} LAK
                </div>
              </div>
            </div>

            {editOverweightMessage && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {editOverweightMessage}
              </p>
            )}

            {editError && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{editError}</p>
            )}
          </div>
        </Dialog>
      )}

      {/* ─── DELETE CONFIRMATION MODAL (ADMIN ONLY) ──────────────────── */}
      {deletingRow && isAdmin && (
        <Dialog
          open
          onClose={() => setDeletingRow(null)}
          size="md"
          title={`ຢືນຢັນການລຶບລາຍການ — ${deletingRow.movement?.code ?? deletingRow.typeLabel}`}
          footer={
            <>
              <button
                className="btn-secondary"
                onClick={() => setDeletingRow(null)}
                disabled={deleteMutation.isPending}
              >
                ຍົກເລີກ
              </button>
              <button
                className="btn-danger"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deletingRow)}
              >
                {deleteMutation.isPending ? 'ກຳລັງລຶບ...' : 'ຢືນຢັນລຶບ'}
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
                <li>ຍອດສິນຄ້າໃນສາງ (Stock OLD) ຈະຖືກປັບປຸງຄືນໂດຍອັດຕະໂນມັດ.</li>
                <li>ບັນຊີ AP/AR (GOLD) ແລະ ປະຫວັດ Stock ຈະຖືກປັບຍອດຄືນ.</li>
              </ul>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
