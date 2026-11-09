'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type {
  Wac,
  TypeBalance,
  SkuBalance,
  SkuOption,
  GoldTypeOption,
  GoldItemOption,
  PartnerOption,
  LedgerRow,
  FormEditLine,
} from '@/app/(app)/stock/old/types';

/** Centralized query keys to prevent typos and ensure clean cache invalidation. */
export const stockOldKeys = {
  all: ['stock', 'old'] as const,
  balances: () => ['stock', 'old', 'balances'] as const,
  history: () => ['stock', 'old', 'history'] as const,
  wac: () => ['ledger', 'wac'] as const,
  newBalances: () => ['stock', 'new', 'balances'] as const,
};

export const catalogKeys = {
  skus: () => ['skus'] as const,
  goldTypes: () => ['catalog', 'gold-types'] as const,
  goldItems: () => ['catalog', 'gold-items'] as const,
  partners: () => ['catalog', 'partners'] as const,
};

export interface UpdateStockMovementPayload {
  partnerId?: string;
  goldTypeId?: string;
  transformType?: string | null;
  goldPercent?: string;
  totalCost?: string;
  note?: string;
  lines: Array<{
    goldSkuId?: string;
    goldTypeId?: string;
    goldItemId?: string;
    oldCategory?: 'JEWELRY' | 'BAR';
    weightG: string;
    quantity: number;
  }>;
}

export interface UpdateOldHistoryPayload {
  goldTypeId?: string;
  partnerLabel?: string | null;
  weightG: string;
  totalCost: string;
}

/** Strongly-typed Service API functions */
export const stockOldApi = {
  getWac: () => api.get<Wac>('/ledger/wac'),
  getBalances: () => api.get<TypeBalance[]>('/stock/old/balances'),
  getNewBalances: () => api.get<SkuBalance[]>('/stock/new/balances'),

  // Catalog
  getSkus: () => api.get<SkuOption[]>('/skus'),
  getGoldTypes: () => api.get<GoldTypeOption[]>('/catalog/gold-types?stockOnly=true'),
  getGoldItems: () => api.get<GoldItemOption[]>('/catalog/gold-items'),
  getPartners: () => api.get<PartnerOption[]>('/catalog/partners'),

  // Mutations
  updateMovement: (id: string, payload: UpdateStockMovementPayload) =>
    api.patch(`/stock/movements/${id}`, payload),
  updateHistoryRow: (id: string, payload: UpdateOldHistoryPayload) =>
    api.patch(`/stock/old/history/${id}`, payload),
  deleteMovement: (id: string) => api.delete(`/stock/movements/${id}`),
  deleteHistoryRow: (id: string) => api.delete(`/stock/old/history/${id}`),
  updateBalance: (id: string, payload: { openingWeightG: string; openingCost: string }) =>
    api.patch(`/stock/old/balances/${id}`, payload),
};

/**
 * Hook for master data (catalogs) with 5-minute cache time to prevent
 * refetch cascades when opening and closing modals.
 */
export function useStockMasterData(enabled = true) {
  const staleTime = 5 * 60 * 1000; // 5 minutes

  const skusQ = useQuery({
    queryKey: catalogKeys.skus(),
    queryFn: stockOldApi.getSkus,
    enabled,
    staleTime,
  });

  const goldTypesQ = useQuery({
    queryKey: catalogKeys.goldTypes(),
    queryFn: stockOldApi.getGoldTypes,
    enabled,
    staleTime,
  });

  const goldItemsQ = useQuery({
    queryKey: catalogKeys.goldItems(),
    queryFn: stockOldApi.getGoldItems,
    enabled,
    staleTime,
  });

  const partnersQ = useQuery({
    queryKey: catalogKeys.partners(),
    queryFn: stockOldApi.getPartners,
    enabled,
    staleTime,
  });

  return {
    skus: skusQ.data ?? [],
    goldTypes: goldTypesQ.data ?? [],
    goldItems: goldItemsQ.data ?? [],
    partners: partnersQ.data ?? [],
    isLoading:
      skusQ.isLoading || goldTypesQ.isLoading || goldItemsQ.isLoading || partnersQ.isLoading,
  };
}

/** Hook for WAC */
export function useOldStockWac() {
  return useQuery({
    queryKey: stockOldKeys.wac(),
    queryFn: stockOldApi.getWac,
  });
}

/** Hook for Old Gold Balances by type */
export function useOldStockBalances() {
  return useQuery({
    queryKey: stockOldKeys.balances(),
    queryFn: stockOldApi.getBalances,
  });
}

/** Hook for New Stock SKU balances (needed when editing transfers) */
export function useNewStockBalances(enabled = false) {
  return useQuery({
    queryKey: stockOldKeys.newBalances(),
    queryFn: stockOldApi.getNewBalances,
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Mutation hook for updating opening balance */
export function useUpdateOpeningBalance(callbacks?: {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      balanceId,
      openingWeightG,
      openingCost,
    }: {
      balanceId: string;
      openingWeightG: string;
      openingCost: string;
    }) =>
      stockOldApi.updateBalance(balanceId, {
        openingWeightG: openingWeightG || '0',
        openingCost: openingCost || '0',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: stockOldKeys.balances() });
      void queryClient.invalidateQueries({ queryKey: stockOldKeys.wac() });
      void queryClient.invalidateQueries({ queryKey: stockOldKeys.history() });
      callbacks?.onSuccess?.();
    },
    onError: (err) => {
      callbacks?.onError?.(err);
    },
  });
}

/** Unified update mutation: safely handles movement or fallback history row */
export function useUpdateStockOldRecord(callbacks?: {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
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
    }: {
      row: LedgerRow;
      editPartnerId: string;
      editPartnerLabel: string;
      editGoldTypeId: string;
      editTransformType: string;
      editGoldPercent: string;
      editTotalCost: string;
      editNote: string;
      editLines: FormEditLine[];
      editLedgerWeightG: string;
    }) => {
      if (row.movementId && row.movement) {
        const mv = row.movement;
        return stockOldApi.updateMovement(row.movementId, {
          partnerId: editPartnerId || undefined,
          goldTypeId: mv.type === 'TRANSFER' && editGoldTypeId ? editGoldTypeId : undefined,
          transformType: mv.type === 'OUT' ? editTransformType || null : undefined,
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

      // Fallback for ledger rows without movementId
      return stockOldApi.updateHistoryRow(row.id, {
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
      callbacks?.onSuccess?.();
    },
    onError: (err) => {
      callbacks?.onError?.(err);
    },
  });
}

/** Unified delete mutation: safely handles movement or fallback history row */
export function useDeleteStockOldRecord(callbacks?: {
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (row: LedgerRow) => {
      if (row.movementId) {
        return stockOldApi.deleteMovement(row.movementId);
      }
      return stockOldApi.deleteHistoryRow(row.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['apar'] });
      callbacks?.onSuccess?.();
    },
    onError: (err) => {
      callbacks?.onError?.(err);
    },
  });
}

