'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dec, expectedReturnWeight, GRAMS_PER_BAHT, type Decimal } from '@kpv/domain';
import { api, ApiError } from '@/lib/api';
import { formatLak, formatWeight, formatGrams } from '@/lib/format';
import { Dialog } from './dialog';
import { NumberInput } from './number-input';
import { QueryErrorNotice } from './query-state';
import { useToast } from './toast';

export type MovementKind = 'IN' | 'OUT' | 'TRANSFER';

export interface TypeBalance {
  id: string;
  goldTypeId?: string;
  openingWeightG: string;
  openingCost: string;
  inG: string;
  outG: string;
  priceIn: string;
  priceOut: string;
  closingWeightG: string;
  closingCost: string;
  goldType: { id?: string; nameLo: string };
}

export interface SkuBalance {
  id: string;
  goldSkuId?: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  balanceQty: number;
  totalWeightG: string;
  goldSku: { id: string; fullSkuName: string; weightG: string };
}

interface Sku { id: string; fullSkuName: string; weightG: string }
interface GoldType { id: string; nameLo: string }
interface GoldItem { id: string; nameLo: string }
interface Partner {
  id: string;
  nameLo: string;
  code: string;
  direction: string;
  type?: 'FACTORY' | 'SMITH' | 'SUPPLIER' | 'INTERNAL';
}
interface Wac { newWeightG: string; newCost: string; pricePerG: string; pricePerBaht: string }

interface Line {
  goldSkuId: string;
  skuQuery?: string;
  goldTypeId: string;
  /** ລາຍການຄຳ — Stock (OLD) ເທົ່ານັ້ນ. */
  goldItemId: string;
  /** ໝວດ (ຮູບປະພັນ / ແທ່ງ) — ຖາມສະເພາະ Stock OLD IN. */
  oldCategory: 'JEWELRY' | 'BAR';
  weightG: string;
  /** ເກັບເປັນ string ເພື່ອໃຫ້ລຶບຄ່າເກົ່າອອກແລ້ວພິມໃໝ່ໄດ້ ບໍ່ຖືກບັງຄັບເປັນ 1. */
  quantity: string;
}

const emptyLine = (): Line => ({
  goldSkuId: '', skuQuery: '', goldTypeId: '', goldItemId: '', oldCategory: 'JEWELRY', weightG: '', quantity: '1',
});

/** ຈຳນວນທີ່ພິມຍັງບໍ່ຄົບ ("" ຫຼື "0") ນັບເປັນ 1 ຕອນຄຳນວນ ແລະ ຕອນບັນທຶກ. */
const qty = (value: string) => Math.max(1, Math.trunc(Number(value) || 0) || 1);

/**
 * The Stock IN / OUT / Transfer dialogs (TOR §7.2, §7.3).
 *
 * All three share the same shape — a repeatable line list with an Add button,
 * running totals, and a ລາຄາ/g that drives ຕົ້ນທຶນຄຳ — so they are one
 * component parameterised by `kind` and `scope` rather than six near-copies.
 *
 * Where the price comes from differs and matters:
 *  - IN  : the user enters ຕົ້ນທຶນຄໍາ, and ລາຄາ/g = ຕົ້ນທຶນຄໍາ / GOLD(g)
 *  - OUT (OLD) and TRANSFER (OLD -> NEW): ລາຄາ/g comes from the cost of
 *    Stock ຄຳເກົ່າ for the selected ປະເພດຄຳ (closingCost / closingWeightG).
 *  - OUT (NEW) and TRANSFER (NEW -> OLD): ລາຄາ/g comes from the latest WAC.
 */
export function StockMovementDialog({
  kind,
  scope,
  onClose,
  initialBalances,
  initialNewBalances,
}: {
  kind: MovementKind;
  scope: 'NEW' | 'OLD';
  onClose: () => void;
  initialBalances?: TypeBalance[];
  initialNewBalances?: SkuBalance[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [partnerId, setPartnerId] = useState('');
  const [goldTypeId, setGoldTypeId] = useState('');
  const [transferDirection, setTransferDirection] = useState<'NEW_TO_OLD' | 'OLD_TO_NEW'>(
    scope === 'NEW' ? 'NEW_TO_OLD' : 'OLD_TO_NEW',
  );
  const [transformType, setTransformType] = useState<'' | 'DYE' | 'ETCH' | 'MELT'>('');
  const [goldPercent, setGoldPercent] = useState('');
  // ໝວດຄຳເກົ່າ — ໜຶ່ງຄ່າຕໍ່ລາຍການ, ຢູ່ຂ້າງ ປະເພດຄຳ ຕາມທີ່ລູກຄ້າຂໍ.
  const [oldCategory, setOldCategory] = useState<'JEWELRY' | 'BAR'>('JEWELRY');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [totalCost, setTotalCost] = useState('');
  const [laborFeeThb, setLaborFeeThb] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const skusQ = useQuery({
    queryKey: ['skus'],
    queryFn: () => api.get<Sku[]>('/skus'),
  });
  const goldTypesQ = useQuery({
    queryKey: ['catalog', 'gold-types'],
    queryFn: () => api.get<GoldType[]>('/catalog/gold-types?stockOnly=true'),
  });
  const goldItemsQ = useQuery({
    queryKey: ['catalog', 'gold-items'],
    queryFn: () => api.get<GoldItem[]>('/catalog/gold-items'),
  });
  const partnersQ = useQuery({
    queryKey: ['catalog', 'partners'],
    queryFn: () => api.get<Partner[]>('/catalog/partners'),
  });
  const wacQ = useQuery({
    queryKey: ['ledger', 'wac'],
    queryFn: () => api.get<Wac>('/ledger/wac'),
  });
  const oldBalancesQ = useQuery({
    queryKey: ['stock', 'old', 'balances'],
    queryFn: () => api.get<TypeBalance[]>('/stock/old/balances'),
    enabled: scope === 'OLD',
    initialData: initialBalances,
  });
  const newBalancesQ = useQuery({
    queryKey: ['stock', 'new', 'balances'],
    queryFn: () => api.get<SkuBalance[]>('/stock/new/balances'),
    enabled: scope === 'NEW',
    initialData: initialNewBalances,
  });

  const skus = skusQ.data ?? [];
  const goldTypes = goldTypesQ.data ?? [];
  const partners = partnersQ.data ?? [];
  const goldItems = goldItemsQ.data ?? [];
  const wac = wacQ.data;
  const oldBalances = oldBalancesQ.data ?? initialBalances ?? [];
  const newBalances = newBalancesQ.data ?? initialNewBalances ?? [];
  const failedQuery = [
    skusQ,
    goldTypesQ,
    partnersQ,
    wacQ,
    ...(scope === 'OLD' ? [oldBalancesQ] : [newBalancesQ]),
  ].find((q) => q.isError);
  const retryFailed = () => {
    for (const q of [skusQ, goldTypesQ, partnersQ, wacQ, oldBalancesQ, newBalancesQ])
      if (q.isError) void q.refetch();
  };

  /**
   * ຕົ້ນທຶນ/g ຂອງຄຳເກົ່າແຍກຕາມ ປະເພດຄຳ (TOR §7.3).
   * ໄລ່ຈາກ: ຕົ້ນທຶນຄົງເຫຼືອ (closingCost) / ນ້ຳໜັກຄົງເຫຼືອ (closingWeightG) ຂອງປະເພດຄຳນັ້ນ.
   */
  const getOldTypeRate = (typeId: string): Decimal => {
    if (!typeId) return dec(0);
    const bal = oldBalances.find((b) => b.goldTypeId === typeId || b.goldType?.id === typeId);
    if (!bal) return dec(0);
    const closingWeight = dec(bal.closingWeightG || 0);
    const closingCost = dec(bal.closingCost || 0);
    if (closingWeight.gt(0) && closingCost.gt(0)) {
      return closingCost.div(closingWeight);
    }
    const opWeight = dec(bal.openingWeightG || 0);
    const opCost = dec(bal.openingCost || 0);
    if (opWeight.gt(0) && opCost.gt(0)) {
      return opCost.div(opWeight);
    }
    return dec(0);
  };

  /**
   * ນໍ້າໜັກ (g) ຄົງເຫຼືອ ຂອງ ປະເພດຄຳ ໃນ Stock ຄຳເກົ່າ.
   */
  const getOldTypeAvailableWeight = (typeId: string): Decimal => {
    if (!typeId) return dec(0);
    const bal = oldBalances.find((b) => b.goldTypeId === typeId || b.goldType?.id === typeId);
    if (!bal) return dec(0);
    return dec(bal.closingWeightG || 0);
  };

  /**
   * ນ້ຳໜັກ g ລວມ (totalWeightG) ຂອງ SKU ໃນ Stock ຄຳໃໝ່ (Ready to Gold).
   */
  const getNewSkuAvailableWeight = (skuId: string): Decimal => {
    if (!skuId) return dec(0);
    const bal = newBalances.find((b) => b.goldSkuId === skuId || b.goldSku?.id === skuId);
    if (!bal) return dec(0);
    const w = dec(bal.totalWeightG || 0);
    return w.gt(0) ? w : dec(0);
  };

  /**
   * IN sources vs OUT destinations differ (TOR §7.2).
   *
   * ກອງຕາມ `direction` ທີ່ຕັ້ງໄວ້ໃນ ຈັດການ Supplier ບໍ່ແມ່ນລາຍຊື່ code ທີ່
   * ຂຽນຕາຍໃນໜ້າຈໍ — ບໍ່ດັ່ງນັ້ນ ແຫຼ່ງທີ່ຮ້ານເພີ່ມເອງຈະບໍ່ປາກົດໃຫ້ເລືອກ
   * (ລູກຄ້າແຈ້ງວ່າ "ບໍ່ມີແຫຼ່ງທີ່ມາທີ່ຕັ້ງໄວ້ມາໃຫ້ເລືອກ").
   */
  const partnerOptions = useMemo(() => {
    const wanted = kind === 'IN' ? 'IN' : 'OUT';
    return partners.filter((p) => p.direction === wanted || p.direction === 'BOTH');
  }, [partners, kind]);

  const selectedPartner = partners.find((p) => p.id === partnerId);
  const isFactoryOut =
    kind === 'OUT' &&
    (selectedPartner?.type === 'FACTORY' || selectedPartner?.code === 'FACTORY');
  const isSmithOut =
    kind === 'OUT' &&
    scope === 'OLD' &&
    (selectedPartner?.type === 'SMITH' ||
      selectedPartner?.code === 'OUTSOURCE_SMITH' ||
      selectedPartner?.code === 'OTHER');

  /** Lines reference a SKU in the NEW warehouse and a ປະເພດຄຳ in OLD. */
  const usesSku = scope === 'NEW' || kind === 'TRANSFER';

  /*
   * ຄຳເກົ່າເຂົ້າສາງ ມາຈາກ Cashier ສະເໝີ, ສະນັ້ນຟອມບໍ່ຖາມແຫຼ່ງທີ່ມາ —
   * server ກໍບັງຄັບເຊັ່ນກັນ, ຟອມນີ້ພຽງແຕ່ບໍ່ຖາມສິ່ງທີ່ບໍ່ມີທາງເລືອກ.
   */
  const isOldIn = kind === 'IN' && scope === 'OLD';
  /** ຄຳເກົ່າອອກ: ນັບເປັນນ້ຳໜັກລ້ວນ ບໍ່ມີຈຳນວນ ແລະ ບໍ່ເລືອກລາຍການຄຳ. */
  const isOldOut = kind === 'OUT' && scope === 'OLD';
  const isTransferOld = kind === 'TRANSFER' && scope === 'OLD';
  const isNewOut = kind === 'OUT' && scope === 'NEW';
  const isTransferNew = kind === 'TRANSFER' && scope === 'NEW';

  /**
   * ຄຳນວນນ້ຳໜັກສູງສຸດ (g) ທີ່ແຖວທີ `rowIndex` ສາມາດປ້ອນໄດ້ ໂດຍຫັກນ້ຳໜັກທີ່ແຖວອື່ນ
   * ທີ່ເລືອກ ປະເພດຄຳ ຫຼື SKU ດຽວກັນໃຊ້ໄປແລ້ວ ເພື່ອບໍ່ໃຫ້ລວມກັນເກີນ ນໍ້າໜັກຄົງເຫຼືອ / ນ້ຳໜັກ g ລວມ.
   */
  const getMaxWeightForLine = (rowIndex: number, targetId?: string, currentLines = lines): Decimal | null => {
    if (isOldOut) {
      const typeId = targetId ?? currentLines[rowIndex]?.goldTypeId ?? '';
      if (!typeId) return null;
      const available = getOldTypeAvailableWeight(typeId);
      const otherUsed = currentLines.reduce((sum, l, idx) => {
        if (idx === rowIndex || l.goldTypeId !== typeId) return sum;
        const w = l.weightG.trim();
        return /^\d+(\.\d+)?$/.test(w) ? sum.plus(dec(w)) : sum;
      }, dec(0));
      const rem = available.minus(otherUsed);
      return rem.gt(0) ? rem : dec(0);
    }
    if (isTransferOld) {
      const typeId = targetId ?? goldTypeId;
      if (!typeId) return null;
      const available = getOldTypeAvailableWeight(typeId);
      const otherUsed = currentLines.reduce((sum, l, idx) => {
        if (idx === rowIndex) return sum;
        const w = l.weightG.trim();
        return /^\d+(\.\d+)?$/.test(w) ? sum.plus(dec(w).mul(qty(l.quantity))) : sum;
      }, dec(0));
      const rem = available.minus(otherUsed);
      const rowQty = qty(currentLines[rowIndex]?.quantity ?? '1');
      return rem.gt(0) ? rem.div(rowQty).toDecimalPlaces(4) : dec(0);
    }
    if (isNewOut || isTransferNew) {
      const skuId = targetId ?? currentLines[rowIndex]?.goldSkuId ?? '';
      if (!skuId) return null;
      const available = getNewSkuAvailableWeight(skuId);
      const otherUsed = currentLines.reduce((sum, l, idx) => {
        if (idx === rowIndex || l.goldSkuId !== skuId) return sum;
        const w = l.weightG.trim();
        return /^\d+(\.\d+)?$/.test(w) ? sum.plus(dec(w).mul(qty(l.quantity))) : sum;
      }, dec(0));
      const rem = available.minus(otherUsed);
      const rowQty = qty(currentLines[rowIndex]?.quantity ?? '1');
      return rem.gt(0) ? rem.div(rowQty).toDecimalPlaces(4) : dec(0);
    }
    return null;
  };

  const totals = useMemo(() => {
    const goldG = lines.reduce((sum, l) => {
      const w = l.weightG.trim();
      if (!/^\d+(\.\d+)?$/.test(w)) return sum;
      return sum.plus(isOldOut ? dec(w) : dec(w).mul(qty(l.quantity)));
    }, dec(0));
    const quantity = lines.reduce((sum, l) => sum + (isOldOut ? 1 : qty(l.quantity)), 0);

    let perG = dec(0);
    let goldCost = dec(0);

    if (kind === 'IN') {
      const cost = totalCost.replace(/,/g, '').trim();
      goldCost = /^\d+(\.\d+)?$/.test(cost) ? dec(cost) : dec(0);
      perG = goldG.gt(0) ? goldCost.div(goldG) : dec(0);
    } else if (kind === 'OUT' && scope === 'OLD') {
      // Stock OUT (OLD): ລາຄາ/g ຫານຈາກຕົ້ນທຶນຂອງ Stock ຄຳເກົ່າ ຕາມ ປະເພດຄຳ ທີ່ເລືອກ
      let lineCostSum = dec(0);
      for (const line of lines) {
        const w = line.weightG.trim();
        if (!/^\d+(\.\d+)?$/.test(w)) continue;
        const lineWeight = dec(w);
        const rate = getOldTypeRate(line.goldTypeId);
        lineCostSum = lineCostSum.plus(lineWeight.mul(rate));
      }
      goldCost = lineCostSum;
      if (goldG.gt(0)) {
        perG = goldCost.div(goldG);
      } else {
        const firstSelected = lines.find((l) => Boolean(l.goldTypeId));
        perG = firstSelected ? getOldTypeRate(firstSelected.goldTypeId) : dec(0);
      }
    } else if (kind === 'TRANSFER' && scope === 'OLD') {
      // Transfer (OLD) ເປັນ (NEW): ລາຄາ/g ຫານຈາກຕົ້ນທຶນຂອງ Stock ຄຳເກົ່າ ຕາມ ປະເພດຄຳ ທີ່ເລືອກ
      perG = getOldTypeRate(goldTypeId);
      goldCost = goldG.mul(perG);
    } else {
      // Stock OUT (NEW) and Transfer (NEW -> OLD): ລາຄາ/g = ຕົ້ນທຶນຄຳ NEW ປັດຈຸບັນ / GOLD (g) NEW ປັດຈຸບັນ
      const newWeightG = dec(wac?.newWeightG ?? 0);
      const newCost = dec(wac?.newCost ?? 0);
      perG = newWeightG.gt(0) ? newCost.div(newWeightG) : dec(0);
      goldCost = goldG.mul(perG);
    }

    return {
      goldG,
      quantity,
      pricePerG: perG,
      pricePerBaht: perG.mul(GRAMS_PER_BAHT),
      goldCost,
      expectedReturnG:
        isSmithOut && /^\d+(\.\d+)?$/.test(goldPercent.trim())
          ? expectedReturnWeight(goldG, goldPercent)
          : null,
    };
  }, [lines, totalCost, wac, kind, scope, goldTypeId, oldBalances, isOldOut, isSmithOut, goldPercent]);

  /**
   * ກວດສອບວ່ານ້ຳໜັກລວມທີ່ປ້ອນ ຫຼື ເລືອກ ບໍ່ເກີນ ນໍ້າໜັກ (g) ຄົງເຫຼືອ ຂອງປະເພດຄຳ ຫຼື ນ້ຳໜັກ g ລວມ ຂອງ SKU ນັ້ນ.
   */
  const overweightMessage = useMemo(() => {
    if (isOldOut) {
      const byType = new Map<string, Decimal>();
      for (const l of lines) {
        if (!l.goldTypeId) continue;
        const w = l.weightG.trim();
        if (!/^\d+(\.\d+)?$/.test(w)) continue;
        byType.set(l.goldTypeId, (byType.get(l.goldTypeId) ?? dec(0)).plus(dec(w)));
      }
      for (const [typeId, requested] of byType) {
        const available = getOldTypeAvailableWeight(typeId);
        if (requested.gt(available)) {
          const typeName = goldTypes.find((t) => t.id === typeId)?.nameLo ?? 'ປະເພດຄຳທີ່ເລືອກ';
          return `ນ້ຳໜັກ ${typeName} ທີ່ປ້ອນ (${formatWeight(requested.toFixed())} g) ຫຼາຍກວ່ານ້ຳໜັກຄົງເຫຼືອ (${formatWeight(available.toFixed())} g)`;
        }
      }
    } else if (isTransferOld && goldTypeId) {
      const available = getOldTypeAvailableWeight(goldTypeId);
      if (totals.goldG.gt(available)) {
        const typeName = goldTypes.find((t) => t.id === goldTypeId)?.nameLo ?? 'ປະເພດຄຳທີ່ເລືອກ';
        return `ນ້ຳໜັກ ${typeName} ທີ່ປ້ອນ (${formatWeight(totals.goldG.toFixed())} g) ຫຼາຍກວ່ານ້ຳໜັກຄົງເຫຼືອ (${formatWeight(available.toFixed())} g)`;
      }
    } else if (isNewOut || isTransferNew) {
      const bySku = new Map<string, Decimal>();
      for (const l of lines) {
        if (!l.goldSkuId) continue;
        const w = l.weightG.trim();
        if (!/^\d+(\.\d+)?$/.test(w)) continue;
        bySku.set(l.goldSkuId, (bySku.get(l.goldSkuId) ?? dec(0)).plus(dec(w).mul(qty(l.quantity))));
      }
      for (const [skuId, requested] of bySku) {
        const available = getNewSkuAvailableWeight(skuId);
        if (requested.gt(available)) {
          const skuName = skus.find((s) => s.id === skuId)?.fullSkuName ?? 'SKU ທີ່ເລືອກ';
          return `ນ້ຳໜັກ ${skuName} ທີ່ປ້ອນ (${formatWeight(requested.toFixed())} g) ຫຼາຍກວ່ານ້ຳໜັກ g ລວມ (${formatWeight(available.toFixed())} g)`;
        }
      }
    }
    return null;
  }, [isOldOut, isTransferOld, isNewOut, isTransferNew, lines, goldTypeId, totals.goldG, oldBalances, newBalances, goldTypes, skus]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = useMutation({
    mutationFn: () => {
      if (kind === 'TRANSFER') {
        const payloadLines = lines
          .filter((l) => Number(l.weightG) > 0 && (usesSku ? Boolean(l.goldSkuId) : Boolean(l.goldTypeId)))
          .map((l) => ({
            goldSkuId: usesSku ? l.goldSkuId : undefined,
            goldTypeId: usesSku ? goldTypeId : l.goldTypeId,
            weightG: l.weightG.trim(),
            quantity: isOldOut ? 1 : qty(l.quantity),
            ...(scope === 'OLD' && l.goldItemId ? { goldItemId: l.goldItemId } : {}),
          }));
        return api.post('/stock/transfer', {
          direction: transferDirection,
          goldTypeId,
          lines: payloadLines,
          note: note || undefined,
        });
      }
      if (kind === 'IN') {
        const payloadLines = lines
          .filter((l) => Number(l.weightG) > 0 && (usesSku ? Boolean(l.goldSkuId) : true))
          .map((l) => ({
            goldSkuId: usesSku ? l.goldSkuId : undefined,
            goldTypeId: usesSku ? undefined : (goldTypeId || l.goldTypeId || undefined),
            ...(isOldIn ? { oldCategory } : {}),
            weightG: l.weightG.trim(),
            quantity: isOldOut ? 1 : qty(l.quantity),
            ...(scope === 'OLD' && l.goldItemId ? { goldItemId: l.goldItemId } : {}),
          }));
        return api.post('/stock/in', {
          scope,
          // ຄຳເກົ່າ: ບໍ່ສົ່ງແຫຼ່ງທີ່ມາ ແລະ ບໍ່ມີຄ່າແຮງ.
          partnerId: isOldIn ? undefined : partnerId,
          lines: payloadLines,
          totalCost: totalCost.replace(/,/g, '').trim(),
          laborFeeThb: isOldIn ? undefined : laborFeeThb.trim() || undefined,
          note: note || undefined,
        });
      }
      const payloadLines = lines
        .filter((l) => Number(l.weightG) > 0 && (usesSku ? Boolean(l.goldSkuId) : Boolean(l.goldTypeId)))
        .map((l) => ({
          goldSkuId: usesSku ? l.goldSkuId : undefined,
          goldTypeId: usesSku ? undefined : l.goldTypeId,
          weightG: l.weightG.trim(),
          quantity: isOldOut ? 1 : qty(l.quantity),
          ...(scope === 'OLD' && l.goldItemId ? { goldItemId: l.goldItemId } : {}),
        }));
      return api.post('/stock/out', {
        scope,
        partnerId,
        transformType: transformType || undefined,
        goldPercent: goldPercent.trim() || undefined,
        lines: payloadLines,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      toast.success(
        kind === 'IN'
          ? 'ບັນທຶກຮັບຄຳເຂົ້າສາງສຳເລັດ'
          : kind === 'OUT'
            ? 'ບັນທຶກຈ່າຍຄຳອອກສາງສຳເລັດ'
            : 'ບັນທຶກໂອນຍ້າຍສາງສຳເລັດ',
        `${titleLo} · ${formatWeight(totals.goldG.toFixed())} g`,
      );
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'ບັນທຶກບໍ່ສຳເລັດ'),
  });

  const titleLo =
    kind === 'IN'
      ? `Stock IN — ${scope === 'NEW' ? 'ສາງຄຳໃໝ່' : 'ສາງຄຳເກົ່າ'}`
      : kind === 'OUT'
        ? `Stock OUT — ${scope === 'NEW' ? 'ສາງຄຳໃໝ່' : 'ສາງຄຳເກົ່າ'}`
        : `Transfer ${transferDirection === 'NEW_TO_OLD' ? '(NEW) ເປັນ (OLD)' : '(OLD) ເປັນ (NEW)'}`;

  const canSubmit =
    totals.goldG.gt(0) &&
    !overweightMessage &&
    (kind === 'TRANSFER' || isOldIn ? Boolean(goldTypeId) : true) &&
    (kind === 'TRANSFER' || isOldIn ? true : Boolean(partnerId)) &&
    (kind !== 'IN' || Number(totalCost.replace(/,/g, '')) > 0) &&
    (usesSku
      ? lines.some((l) => Boolean(l.goldSkuId) && Number(l.weightG) > 0)
      : isOldIn
        ? lines.length > 0 && lines.every((l) => Number(l.weightG) > 0)
        : lines.length > 0 && lines.every((l) => Boolean(l.goldTypeId) && Number(l.weightG) > 0));

  const errorId = 'movement-error';

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={titleLo}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>ຍົກເລີກ</button>
          <button className="btn-primary" disabled={!canSubmit || submit.isPending}
            aria-describedby={error ? errorId : undefined}
            onClick={() => submit.mutate()}>
            {submit.isPending ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
          </button>
        </>
      }
    >
      {failedQuery && (
        <div className="mb-4">
          <QueryErrorNotice error={failedQuery.error} onRetry={retryFailed} />
        </div>
      )}
      <div className={`grid gap-4 ${isOldIn ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {kind === 'TRANSFER' ? (
          /* ທິດທາງ ຕາມສາງທີ່ກົດເຂົ້າມາ ແລະ ເລືອກບໍ່ໄດ້: ຢູ່ສາງຄຳໃໝ່ ມີແຕ່
             (NEW) → (OLD), ຢູ່ສາງຄຳເກົ່າ ມີແຕ່ (OLD) → (NEW). */
          <div>
            <span className="label">ທິດທາງ</span>
            <div className="input flex items-center font-medium">
              {transferDirection === 'NEW_TO_OLD' ? '(NEW) ເປັນ (OLD)' : '(OLD) ເປັນ (NEW)'}
            </div>
          </div>
        ) : isOldIn ? (
          <div>
            <span className="label">ແຫຼ່ງທີ່ມາ</span>
            <div className="input flex items-center font-medium">Cashier</div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="partner">
              {kind === 'IN' ? 'ແຫຼ່ງທີ່ມາ' : 'ແຫຼ່ງສົ່ງມອບ'}
            </label>
            <select id="partner" className="input" value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">— ເລືອກ —</option>
              {partnerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameLo} {p.type === 'FACTORY' ? '(ໂຮງງານ)' : p.type === 'SMITH' ? '(ຊ່າງ)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ສະແດງ ປະເພດຄຳ ດ້ານເທິງສຳລັບ Transfer ແລະ Stock IN (OLD) ເທົ່ານັ້ນ (Stock IN NEW ໃຊ້ SKU) */}
        {(kind === 'TRANSFER' || isOldIn) && (
          <div>
            <label className="label" htmlFor="goldType">ປະເພດຄຳ</label>
            <select
              id="goldType"
              className="input"
              value={goldTypeId}
              onChange={(e) => {
                const nextTypeId = e.target.value;
                setGoldTypeId(nextTypeId);
                if (isTransferOld && nextTypeId) {
                  let remaining = getOldTypeAvailableWeight(nextTypeId);
                  setLines((prev) =>
                    prev.map((l) => {
                      const w = l.weightG.trim();
                      if (!/^\d+(\.\d+)?$/.test(w)) return l;
                      const q = qty(l.quantity);
                      const maxUnit = remaining.gt(0) ? remaining.div(q).toDecimalPlaces(4) : dec(0);
                      const clampedUnit = dec(w).gt(maxUnit) ? maxUnit : dec(w);
                      const nextRem = remaining.minus(clampedUnit.mul(q));
                      remaining = nextRem.gt(0) ? nextRem : dec(0);
                      return dec(w).gt(maxUnit)
                        ? { ...l, weightG: clampedUnit.gt(0) ? String(Number(clampedUnit.toFixed())) : '0' }
                        : l;
                    }),
                  );
                }
              }}
            >
              <option value="">— ເລືອກປະເພດຄຳ —</option>
              {goldTypes.map((t) => {
                const avail = isTransferOld ? getOldTypeAvailableWeight(t.id) : null;
                return (
                  <option key={t.id} value={t.id}>
                    {avail !== null ? `${t.nameLo} (ຄົງເຫຼືອ ${formatWeight(avail.toFixed())} g)` : t.nameLo}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {isOldIn && (
          <div>
            <label className="label" htmlFor="oldCategory">ໝວດ</label>
            <select id="oldCategory" className="input" value={oldCategory}
              onChange={(e) => setOldCategory(e.target.value as 'JEWELRY' | 'BAR')}>
              <option value="JEWELRY">ຮູບປະພັນ</option>
              <option value="BAR">ແທ່ງ</option>
            </select>
          </div>
        )}

        {kind === 'OUT' && scope === 'OLD' && (
          <div>
            <label className="label" htmlFor="transform">ແປງສະພາບ</label>
            <select id="transform" className="input" value={transformType}
              onChange={(e) => setTransformType(e.target.value as typeof transformType)}>
              <option value="">— ເລືອກ —</option>
              <option value="DYE">ຍ້ອມ</option>
              <option value="ETCH">ກັດ</option>
              <option value="MELT">ຫຼອມ</option>
            </select>
          </div>
        )}

        {isSmithOut && (
          <div>
            <label className="label" htmlFor="pct">%ຄຳ</label>
            <NumberInput id="pct" className="input num" decimals={2} placeholder="96"
              value={goldPercent} onValueChange={setGoldPercent} />
          </div>
        )}
      </div>

      {/* Repeatable lines with the TOR's Add button */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="label mb-0 font-semibold text-fg">
            {usesSku ? 'ລາຍການ SKU' : isOldIn ? 'ລາຍການຄຳ' : 'ປະເພດຄຳ'}
          </span>
          <button className="btn-secondary"
            onClick={() => setLines((p) => [...p, emptyLine()])}>
            + Add
          </button>
        </div>
        <div className="space-y-3">
          {lines.map((line, i) => {
            const lineW = line.weightG.trim();
            const lineWeightG = /^\d+(\.\d+)?$/.test(lineW)
              ? (isOldOut ? dec(lineW) : dec(lineW).mul(qty(line.quantity)))
              : dec(0);

            const lineUnitPrice = isOldOut
              ? getOldTypeRate(line.goldTypeId)
              : isTransferOld
                ? getOldTypeRate(goldTypeId)
                : dec(0);

            const lineTotalCost = lineWeightG.mul(lineUnitPrice);
            const maxLineWeight = getMaxWeightForLine(i);
            const maxLineWeightStr = maxLineWeight !== null ? String(Number(maxLineWeight.toFixed())) : undefined;

            return (
              <div key={i} className={`grid gap-2 ${
                isOldOut ? 'md:grid-cols-[1.8fr_1.1fr_1.4fr_auto]'
                  : isTransferOld ? 'md:grid-cols-[1.8fr_0.9fr_0.7fr_0.9fr_1.3fr_auto]'
                  : 'md:grid-cols-[2fr_1fr_0.8fr_1fr_auto]'
              }`}>
                {usesSku ? (
                  /* ຂຽນຄົ້ນຫາໄດ້: ລາຍການ SKU ຍາວເກີນກວ່າຈະເລື່ອນຫາ. ໃຊ້ datalist
                     ຂອງ browser ເອງ ຈຶ່ງໃຊ້ໄດ້ທັງແປ້ນພິມ ແລະ ຈໍສຳຜັດ ໂດຍບໍ່ຕ້ອງ
                     ເພີ່ມ library. ພິມແລ້ວບໍ່ກົງກັບ SKU ໃດ = ຍັງບໍ່ໄດ້ເລືອກ. */
                  <input
                    className="input"
                    aria-label="full_sku_name"
                    list={`sku-options-${i}`}
                    placeholder="ພິມຄົ້ນຫາ full_sku_name"
                    value={line.skuQuery ?? (skus.find((s) => s.id === line.goldSkuId)?.fullSkuName ?? '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      const sku = skus.find((s) => s.fullSkuName === val);
                      if (!sku) {
                        setLine(i, { skuQuery: val, goldSkuId: '' });
                        return;
                      }
                      let nextWeight = String(Number(sku.weightG));
                      if (isNewOut || isTransferNew) {
                        const maxForSku = getMaxWeightForLine(i, sku.id);
                        if (maxForSku !== null && dec(nextWeight).gt(maxForSku)) {
                          nextWeight = maxForSku.gt(0) ? String(Number(maxForSku.toFixed())) : '0';
                        }
                      } else if (isTransferOld && goldTypeId) {
                        const maxForType = getMaxWeightForLine(i, goldTypeId);
                        if (maxForType !== null && dec(nextWeight).gt(maxForType)) {
                          nextWeight = maxForType.gt(0) ? String(Number(maxForType.toFixed())) : '0';
                        }
                      }
                      setLine(i, {
                        skuQuery: val,
                        goldSkuId: sku.id,
                        weightG: nextWeight,
                      });
                    }}
                  />
                ) : isOldIn ? (
                  /* ຄຳເກົ່າບໍ່ມີ SKU — ເລືອກລາຍການຄຳ (ສາຍແຂນ, ແຫວນ ...). ປະເພດຄຳຖືກເລືອກຄັ້ງດຽວຢູ່ດ້ານເທິງຟອມແລ້ວ */
                  <select
                    className="input"
                    aria-label="ລາຍການຄຳ"
                    value={line.goldItemId}
                    onChange={(e) => setLine(i, { goldItemId: e.target.value })}
                  >
                    <option value="">ລາຍການຄຳ (ບໍ່ບັງຄັບ)</option>
                    {goldItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.nameLo}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    className="input"
                    aria-label="ປະເພດຄຳ"
                    value={line.goldTypeId}
                    onChange={(e) => {
                      const nextTypeId = e.target.value;
                      if (isOldOut && nextTypeId) {
                        const maxForNewType = getMaxWeightForLine(i, nextTypeId);
                        const w = line.weightG.trim();
                        if (maxForNewType !== null && /^\d+(\.\d+)?$/.test(w) && dec(w).gt(maxForNewType)) {
                          setLine(i, {
                            goldTypeId: nextTypeId,
                            weightG: maxForNewType.gt(0) ? String(Number(maxForNewType.toFixed())) : '0',
                          });
                          return;
                        }
                      }
                      setLine(i, { goldTypeId: nextTypeId });
                    }}
                  >
                    <option value="">ປະເພດຄຳ</option>
                    {goldTypes.map((t) => {
                      const avail = isOldOut ? getOldTypeAvailableWeight(t.id) : null;
                      return (
                        <option key={t.id} value={t.id}>
                          {avail !== null ? `${t.nameLo} (ຄົງເຫຼືອ ${formatWeight(avail.toFixed())} g)` : t.nameLo}
                        </option>
                      );
                    })}
                  </select>
                )}
                {usesSku && (
                  <datalist id={`sku-options-${i}`}>
                    {skus.map((s) => {
                      const avail = isNewOut || isTransferNew ? getNewSkuAvailableWeight(s.id) : null;
                      return (
                        <option key={s.id} value={s.fullSkuName}>
                          {avail !== null ? `ນ້ຳໜັກ g ລວມ: ${formatWeight(avail.toFixed())} g` : undefined}
                        </option>
                      );
                    })}
                  </datalist>
                )}
                {kind === 'IN' && usesSku && line.goldSkuId ? (
                  /* ນ້ຳໜັກມາຈາກ SKU ທີ່ເລືອກ — ແກ້ບໍ່ໄດ້ໃນໂໝດ IN, ບໍ່ດັ່ງນັ້ນນ້ຳໜັກໃນສາງ
                     ຈະບໍ່ກົງກັບນິຍາມຂອງ SKU ນັ້ນອີກຕໍ່ໄປ. */
                  <div className="input num flex items-center justify-end text-muted"
                    aria-label="weight_g" title="ນ້ຳໜັກມາຈາກ SKU ທີ່ເລືອກ">
                    {formatWeight(line.weightG)}
                  </div>
                ) : (
                  <NumberInput
                    className="input num"
                    aria-label="weight_g"
                    decimals={4}
                    max={maxLineWeightStr}
                    placeholder={
                      maxLineWeight !== null
                        ? `ສູງສຸດ ${formatWeight(maxLineWeight.toFixed())} g`
                        : 'weight_g'
                    }
                    value={line.weightG}
                    onValueChange={(v) => setLine(i, { weightG: v })}
                  />
                )}
                {!isOldOut && (
                  <>
                    <input
                      className="input num"
                      aria-label="ຈຳນວນ"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="1"
                      value={line.quantity}
                      onChange={(e) => {
                        const rawQty = e.target.value;
                        if (isTransferOld && goldTypeId && /^\d+(\.\d+)?$/.test(lineW) && dec(lineW).gt(0)) {
                          const totalAvail = getOldTypeAvailableWeight(goldTypeId);
                          const otherUsed = lines.reduce((sum, l, idx) => {
                            if (idx === i) return sum;
                            const w = l.weightG.trim();
                            return /^\d+(\.\d+)?$/.test(w) ? sum.plus(dec(w).mul(qty(l.quantity))) : sum;
                          }, dec(0));
                          const remDiff = totalAvail.minus(otherUsed);
                          const rem = remDiff.gt(0) ? remDiff : dec(0);
                          const maxQty = Math.max(1, Math.floor(Number(rem.div(dec(lineW)).toFixed())));
                          if (Number(rawQty) > maxQty) {
                            setLine(i, { quantity: String(maxQty) });
                            return;
                          }
                        } else if (
                          (isNewOut || isTransferNew) &&
                          line.goldSkuId &&
                          /^\d+(\.\d+)?$/.test(lineW) &&
                          dec(lineW).gt(0)
                        ) {
                          const totalAvail = getNewSkuAvailableWeight(line.goldSkuId);
                          const otherUsed = lines.reduce((sum, l, idx) => {
                            if (idx === i || l.goldSkuId !== line.goldSkuId) return sum;
                            const w = l.weightG.trim();
                            return /^\d+(\.\d+)?$/.test(w) ? sum.plus(dec(w).mul(qty(l.quantity))) : sum;
                          }, dec(0));
                          const remDiff = totalAvail.minus(otherUsed);
                          const rem = remDiff.gt(0) ? remDiff : dec(0);
                          const maxQty = Math.max(1, Math.floor(Number(rem.div(dec(lineW)).toFixed())));
                          if (Number(rawQty) > maxQty) {
                            setLine(i, { quantity: String(maxQty) });
                            return;
                          }
                        }
                        setLine(i, { quantity: rawQty });
                      }}
                    />
                    <div className="input num flex items-center justify-end text-muted">
                      {/^\d+(\.\d+)?$/.test(line.weightG)
                        ? formatWeight(dec(line.weightG).mul(qty(line.quantity)).toFixed())
                        : '—'}
                    </div>
                  </>
                )}
                {(isOldOut || isTransferOld) && (
                  <div
                    className="input num flex items-center justify-end font-semibold text-gold-light"
                    aria-label="ຍອດລວມລາຍການ"
                    title={lineUnitPrice.gt(0) ? `ລາຄາ/g: ${formatLak(lineUnitPrice.toFixed())} LAK` : 'ລາຄາລວມຂອງລາຍການນີ້'}
                  >
                    {lineTotalCost.gt(0) ? `${formatLak(lineTotalCost.toFixed())} LAK` : '—'}
                  </div>
                )}
                <button className="btn-secondary" disabled={lines.length === 1}
                  onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                  ລຶບ
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          {isOldOut
            ? 'ຍອດລວມຕໍ່ລາຍການ = weight_g × ລາຄາ/g (ຫານຈາກຕົ້ນທຶນຄຳເກົ່າຕາມປະເພດຄຳທີ່ເລືອກ)'
            : isTransferOld
              ? 'GOLD (g) = weight_g × ຈຳນວນ · ຍອດລວມ = GOLD (g) × ລາຄາ/g ຕາມປະເພດຄຳທີ່ເລືອກ'
              : 'GOLD (g) = weight_g × ຈຳນວນ'}
        </p>
        {overweightMessage && (
          <div role="alert" className="notice status-danger mt-2">
            {overweightMessage}
          </div>
        )}
      </div>

      {kind === 'IN' && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="cost">ຕົ້ນທຶນຄໍາ (LAK)</label>
            <NumberInput id="cost" className="input num" decimals={0} value={totalCost}
              onValueChange={setTotalCost} />
          </div>
          {/* ຄ່າແຮງ ເປັນເລື່ອງຂອງຊ່າງຝັ່ງຄຳໃໝ່; ຄຳເກົ່າມາຈາກ Cashier ບໍ່ມີຄ່າແຮງ. */}
          {!isOldIn && (
          <div>
            <label className="label" htmlFor="labor">ຄ່າແຮງ (THB)</label>
            <NumberInput id="labor" className="input num" decimals={2} value={laborFeeThb}
              aria-describedby="labor-hint"
              onValueChange={setLaborFeeThb} />
            <p id="labor-hint" className="mt-1 text-xs text-muted">ບັນທຶກເປັນ +AP (Cash) ຄ່າແຮງຄ້າງຈ່າຍ</p>
          </div>
          )}
        </div>
      )}

      {/* Running totals */}
      <div className="recessed mt-5 grid gap-3 rounded-xl p-4 sm:grid-cols-3">
        <Field labelLo="ລວມຈຳນວນ" value={String(totals.quantity)} />
        <Field labelLo="ລວມ GOLD (g)" value={formatWeight(totals.goldG.toFixed())} />
        <Field labelLo="ລາຄາ/g" value={formatLak(totals.pricePerG.toFixed())} />
        <Field labelLo="ລາຄາ/ບາດ" value={formatLak(totals.pricePerBaht.toFixed())} />
        <Field labelLo="ຕົ້ນທຶນຄຳ" value={formatLak(totals.goldCost.toFixed())} strong />
        {totals.expectedReturnG && (
          <Field labelLo="ນ້ຳໜັກ(g) ທີ່ໄດ້ຮັບ"
            value={formatGrams(totals.expectedReturnG.toFixed())} />
        )}
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="note">Note</label>
        <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {kind === 'OUT' && (
        <div className="notice status-warning mt-3">
          {isFactoryOut
            ? `OUT ໄປໂຮງງານ (${selectedPartner?.nameLo ?? 'FACTORY'}): ຕ້ອງລໍຖ້າ Admin/Manager Approve ແລ້ວ ລະບົບຍັງບໍ່ຕັດຍອດ — ຈະໄປຢູ່ Module ຕິດຕາມ Stock Out ໄປ FACTORY ຈົນກວ່າຈະປ້ອນນ້ຳໜັກທີ່ FACTORY ປະເມີນ.`
            : isSmithOut
            ? `OUT ໄປຊ່າງ (${selectedPartner?.nameLo ?? 'ຊ່າງ'}): ຕັດຍອດສາງຕາມນ້ຳໜັກຕົວຈິງ ແລະ ຕັດຍອດ AP Gold ຕາມນ້ຳໜັກຄາດວ່າຈະໄດ້ຮັບ (${totals.expectedReturnG ? formatGrams(totals.expectedReturnG.toFixed()) : '—'} g).`
            : 'Stock OUT ຕ້ອງລໍຖ້າ Admin/Manager Approve ກ່ອນຈຶ່ງຕັດຍອດ.'}
        </div>
      )}

      {error && (
        <div id={errorId} role="alert" className="notice status-danger mt-3">
          {error}
        </div>
      )}
    </Dialog>
  );
}

function Field({ labelLo, value, strong }: { labelLo: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="section-label">{labelLo}</div>
      <div className={`num mt-0.5 ${strong ? 'text-lg font-bold text-gold-light' : 'font-semibold text-fg-strong'}`}>
        {value}
      </div>
    </div>
  );
}
