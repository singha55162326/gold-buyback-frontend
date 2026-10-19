/**
 * Pure helpers for the formatted number input.
 *
 * Values stay decimal STRINGS end to end: nothing here converts to `number`.
 * The "raw" value has no thousand separators ("1500000.5"); the "display"
 * value has them ("1,500,000.5").
 */

export interface SanitizeOptions {
  /** Max fraction digits. 0 = integer only. */
  decimals: number;
  allowNegative?: boolean;
}

/** Characters that count when tracking the caret (everything but separators). */
const SIGNIFICANT = /[0-9.-]/;

/**
 * Typed/pasted text -> raw numeric string. May be "", "-", or end with "."
 * while the user is mid-entry.
 */
export function sanitizeNumeric(raw: string, opts: SanitizeOptions): string {
  const { decimals, allowNegative = false } = opts;
  const text = raw.trim();
  const negative = allowNegative && text.startsWith('-');

  let int = '';
  let frac = '';
  let seenDot = false;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      if (seenDot) frac += ch;
      else int += ch;
    } else if (ch === '.' && !seenDot) {
      seenDot = true;
      // Integer-only: ignore everything after the point ("1,234.56" -> 1234).
      if (decimals <= 0) break;
    }
    // commas, spaces, letters, extra dots, inner minus: dropped
  }

  frac = decimals > 0 ? frac.slice(0, decimals) : '';
  const keepDot = decimals > 0 && seenDot;

  int = int.replace(/^0+(?=\d)/, '');
  if (int === '' && keepDot) int = '0';

  const sign = negative ? '-' : '';
  if (int === '' && !keepDot) return sign;
  return sign + int + (keepDot ? '.' + frac : '');
}

/** Raw -> display: thousand separators on the integer part only. */
export function formatNumericDisplay(raw: string): string {
  if (raw === '') return '';
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf('.');
  const int = dot === -1 ? body : body.slice(0, dot);
  const rest = dot === -1 ? '' : body.slice(dot); // "." + fraction, as typed
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + grouped + rest;
}

/**
 * Caret position in `nextDisplay` that sits after the same number of
 * significant characters (digits, '.', '-') as were left of `prevCaret`
 * in `prevDisplay`.
 */
export function caretAfterFormat(
  prevDisplay: string,
  prevCaret: number,
  nextDisplay: string,
): number {
  let count = 0;
  for (let i = 0; i < Math.min(prevCaret, prevDisplay.length); i++) {
    if (SIGNIFICANT.test(prevDisplay[i]!)) count++;
  }
  if (count === 0) return 0;
  let seen = 0;
  for (let i = 0; i < nextDisplay.length; i++) {
    if (SIGNIFICANT.test(nextDisplay[i]!)) seen++;
    if (seen === count) return i + 1;
  }
  return nextDisplay.length;
}
