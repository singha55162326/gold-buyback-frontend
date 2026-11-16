import { dec, GRAMS_PER_BAHT, type Decimal } from '@kpv/domain';
import type { TypeBalance, SkuBalance } from '@/components/stock-movement-dialog';

/**
 * ລາຄາ/g = ຕົ້ນທຶນຄົງເຫຼືອ / ນໍ້າໜັກ(g) ຄົງເຫຼືອ, ລາຄາ/ບາດ = ລາຄາ/g * 15 (ແຍກຕາມປະເພດຄຳ).
 */
export function computeOldTypeRates(
  closingWeightG: string,
  closingCost: string,
): { pricePerG: Decimal | null; pricePerBaht: Decimal | null } {
  const weight = dec(closingWeightG || 0);
  const cost = dec(closingCost || 0);
  if (weight.lte(0)) {
    return { pricePerG: null, pricePerBaht: null };
  }
  const pricePerG = cost.div(weight);
  return {
    pricePerG,
    pricePerBaht: pricePerG.mul(GRAMS_PER_BAHT),
  };
}

export interface Wac {
  oldWeightG: string;
  oldCost: string;
  pricePerG?: string;
}

export interface MovementLine {
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

export interface MovementData {
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

export interface LedgerRow {
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
  createdAt?: string;
  movement?: MovementData | null;
}

export interface SkuOption {
  id: string;
  fullSkuName: string;
  weightG: string;
}

export interface GoldTypeOption {
  id: string;
  nameLo: string;
}

export interface GoldItemOption {
  id: string;
  nameLo: string;
}

export interface PartnerOption {
  id: string;
  nameLo: string;
  code: string;
  direction: string;
}

export interface FormEditLine {
  goldSkuId: string;
  goldTypeId: string;
  goldItemId: string;
  oldCategory: 'JEWELRY' | 'BAR' | '';
  weightG: string;
  quantity: string;
}

export const TRANSFORM_LABEL: Record<'DYE' | 'ETCH' | 'MELT', string> = {
  DYE: 'ຍ້ອມ',
  ETCH: 'ກັດ',
  MELT: 'ຫຼອມ',
};

export type { TypeBalance, SkuBalance };

