import Decimal from 'decimal.js';

/**
 * Local replacements for the few @kpv/domain helpers the front end used.
 * Money and weights stay in Decimal so nothing passes through a JS float.
 */

export { Decimal };

/** 1 ບາດຄຳ = 15 g. */
export const GRAMS_PER_BAHT = new Decimal(15);

/** Exchange rates are always shown with two decimals (TOR §3.3). */
export const RATE_DECIMALS = 2;

export function dec(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

/** "1.8750" -> "1.875", "2.000" -> "2". Leaves integers untouched. */
export function trimTrailingZeros(input: string): string {
  if (!input.includes('.')) return input;
  return input.replace(/\.?0+$/, '');
}
