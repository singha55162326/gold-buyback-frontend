'use client';

import { useEffect, useMemo, useState } from 'react';
import { dec } from '@kpv/domain';
import { Dialog } from '@/components/dialog';
import { NumberInput } from '@/components/number-input';
import { formatLak, formatWeight } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { useUpdateStockOldRecord, useMovementDetails } from '@/lib/stock-old-api';
import type {
  LedgerRow,
  TypeBalance,
  SkuBalance,
  SkuOption,
  GoldTypeOption,
  GoldItemOption,
  PartnerOption,
  FormEditLine,
  Wac,
} from '../types';

interface MovementEditModalProps {
  row: LedgerRow | null;
  onClose: () => void;
  balances: TypeBalance[];
  newBalances: SkuBalance[];
  masterData: {
    skus: SkuOption[];
    goldTypes: GoldTypeOption[];
    goldItems: GoldItemOption[];
    partners: PartnerOption[];
  };
  wac?: Wac;
}

export function MovementEditModal({
  row,
  onClose,
  balances,
  newBalances,
  masterData,
  wac,
}: MovementEditModalProps) {
  const toast = useToast();
  const { skus, goldTypes, goldItems, partners } = masterData;

  const { data: fullMovement } = useMovementDetails(row?.movementId);
  const activeMovement = fullMovement ?? row?.movement;

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

  useEffect(() => {
    if (!row) return;
    const mv = activeMovement;
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
  }, [row, activeMovement]);

  const updateMutation = useUpdateStockOldRecord({
    onSuccess: () => {
      toast.success('ແກ້ໄຂລາຍການສຳເລັດ');
      onClose();
    },
    onError: (err) => {
      setEditError(err instanceof ApiError ? err.message : 'ເກີດຂໍ້ຜິດພາດໃນການແກ້ໄຂ');
    },
  });

  const updateEditLine = (idx: number, patch: Partial<FormEditLine>) => {
    setEditLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const editCalculations = useMemo(() => {
    if (!activeMovement) {
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
    const isIn = activeMovement.type === 'IN';
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
      perG = dec(activeMovement.pricePerG || wac?.pricePerG || 0);
      cost = totalGoldG.mul(perG);
    }
    return { totalGoldG, totalQty, cost, perG };
  }, [editLines, editTotalCost, editLedgerWeightG, activeMovement, wac]);

  const getEditAvailableOldWeight = (goldTypeId: string) => {
    if (!goldTypeId) return null;
    const bal = balances.find(
      (b) => (b.goldTypeId ?? b.goldType?.id) === goldTypeId,
    );
    const currentClosingWeight = dec(bal?.closingWeightG ?? 0);
    const origOutWeight = (activeMovement?.lines ?? [])
      .filter((l) => l.goldTypeId === goldTypeId)
      .reduce((sum, l) => sum.plus(dec(l.goldG || 0)), dec(0));
    return currentClosingWeight.plus(origOutWeight);
  };

  const getEditAvailableNewSkuWeight = (skuId: string) => {
    if (!skuId) return null;
    const bal = newBalances.find((b) => (b.goldSkuId ?? b.goldSku.id) === skuId);
    const currentWeight = dec(bal?.totalWeightG ?? 0);
    const origLineWeight = (activeMovement?.lines ?? [])
      .filter((l) => l.goldSkuId === skuId)
      .reduce((sum, l) => sum.plus(dec(l.goldG || 0)), dec(0));
    return currentWeight.plus(origLineWeight);
  };

  const getEditMaxWeightForLine = (idx: number) => {
    const mv = activeMovement;
    if (!mv || mv.type === 'IN') return undefined;

    const currentLine = editLines[idx];
    if (!currentLine) return undefined;
    const currentQty = Math.max(1, Number(currentLine.quantity) || 1);

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
    const mv = activeMovement;
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
  }, [editLines, editGoldTypeId, row, balances, newBalances, goldTypes, skus]);

  if (!row) return null;

  const handleSubmit = () => {
    updateMutation.mutate({
      row,
      editPartnerId,
      editPartnerLabel,
      editGoldTypeId,
      editTransformType,
      editGoldPercent,
      editTotalCost,
      editNote,
      editLines,
      editLedgerWeightG,
    });
  };

  return (
    <Dialog
      open
      size="lg"
      title={`ແກ້ໄຂລາຍການ — ${activeMovement?.code ?? row.typeLabel}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={updateMutation.isPending}
          >
            ຍົກເລີກ
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
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
        {activeMovement ? (
          <>
            {/* Partner / GoldType header fields */}
            {activeMovement.type === 'OUT' && (
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

            {activeMovement.type === 'OUT' && (
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

            {activeMovement.type === 'TRANSFER' && (
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
                        {activeMovement?.scope === 'OLD' && avail !== null
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
                        oldCategory: activeMovement?.type === 'IN' ? 'JEWELRY' : '',
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
                const mv = activeMovement!;
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

                      <div
                        className={
                          isOldIn
                            ? 'col-span-5'
                            : isTransferOldToNew
                              ? 'col-span-6'
                              : 'col-span-3'
                        }
                      >
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
                      <div
                        className={
                          isOldIn
                            ? 'col-span-5'
                            : isTransferOldToNew
                              ? 'col-span-4'
                              : 'col-span-2'
                        }
                      >
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
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
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

            {activeMovement.type === 'IN' && (
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
  );
}

