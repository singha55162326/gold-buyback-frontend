import { Decimal, dec, GRAMS_PER_BAHT, RATE_DECIMALS, trimTrailingZeros } from '@kpv/domain';

/**
 * Display helpers.
 *
 * The API sends every money and weight field as a STRING so it never passes
 * through a JS float. These helpers take those strings, so nothing on the way
 * to the screen converts to `number` first.
 */

/** 45859000 -> "45,859,000" */
export function formatLak(value: string | number | Decimal | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = dec(value as never);
  if (!d.isFinite()) return '—';
  return addThousands(d.toDecimalPlaces(0).toFixed());
}

/** Money with decimals kept, for foreign currency. */
export function formatMoney(
  value: string | number | Decimal | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = dec(value as never);
  if (!d.isFinite()) return '—';
  const [whole, frac] = d.toDecimalPlaces(decimals).toFixed(decimals).split('.');
  return frac ? `${addThousands(whole!)}.${frac}` : addThousands(whole!);
}

/**
 * ອັດຕາແລກປ່ຽນ — always two decimals (TOR §3.3).
 *
 * Rates are the one money-ish figure that is not a whole kip: 745.25 must not
 * render as "745". Two places are shown even when they are zeros, so a column
 * of rates lines up digit for digit.
 */
export function formatRate(value: string | number | Decimal | null | undefined): string {
  return formatMoney(value, RATE_DECIMALS);
}

/** Weight in grams, trailing zeros trimmed: "1.875" not "1.8750". */
export function formatWeight(value: string | number | Decimal | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = dec(value as never);
  if (!d.isFinite()) return '—';
  return trimZeros(d.toDecimalPlaces(4).toFixed(4));
}

/** ບາດຄຳ = g / 15, trimmed. */
export function gramsToBaht(value: string | number | Decimal | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = dec(value as never);
  if (!d.isFinite()) return '—';
  return trimZeros(d.div(GRAMS_PER_BAHT).toDecimalPlaces(4).toFixed(4));
}

function addThousands(input: string): string {
  const negative = input.startsWith('-');
  const digits = negative ? input.slice(1) : input;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${grouped}` : grouped;
}

function trimZeros(input: string): string {
  return trimTrailingZeros(input);
}

/** Lao-style short date: 05/09/2026 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
