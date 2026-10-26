/**
 * Decimal-safe helpers for money. Amounts are decimal strings with up to 4
 * fractional digits (the `numeric(19,4)` column). We never parse them to a JS
 * float; instead we accumulate in integer "minor units" scaled by 1e4 using
 * BigInt, then format back to a fixed-4-decimal string.
 */
const SCALE = 4;

/** Converts a decimal string (<= 4 dp) to scaled integer minor units (BigInt). */
export function toMinorUnits(amount: string): bigint {
  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [intPart, fracPart = ''] = unsigned.split('.');
  const fracPadded = (fracPart + '0'.repeat(SCALE)).slice(0, SCALE);
  const combined = `${intPart}${fracPadded}`.replace(/^0+(?=\d)/, '');
  const value = BigInt(combined === '' ? '0' : combined);
  return negative ? -value : value;
}

/** Formats scaled integer minor units (BigInt) back to a 4-dp decimal string. */
export function fromMinorUnits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(SCALE + 1, '0');
  const intPart = abs.slice(0, abs.length - SCALE);
  const fracPart = abs.slice(abs.length - SCALE);
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/** Sums a list of decimal strings exactly (no float), returning a 4-dp string. */
export function sumDecimalStrings(amounts: string[]): string {
  const total = amounts.reduce((acc, a) => acc + toMinorUnits(a), 0n);
  return fromMinorUnits(total);
}
