import { describe, expect, it } from 'vitest';
import { ColumnNumericTransformer } from './column-numeric.transformer.js';

describe('ColumnNumericTransformer', () => {
  const transformer = new ColumnNumericTransformer();

  it('round-trips a decimal string without float drift', () => {
    // The classic float trap: 0.1 + 0.2 !== 0.3 in IEEE-754. We never touch
    // `number`, so the exact decimal string survives the round trip.
    const stored = transformer.to('0.30');
    const loaded = transformer.from(stored);
    expect(loaded).toBe('0.30');
  });

  it('preserves high-precision values at numeric(19,4)', () => {
    const values = [
      '0.0001',
      '1234567890123456.7890', // 16 integer + 4 fractional digits
      '999999999999999.9999',
      '20.0000',
      '-45.5000',
    ];
    for (const value of values) {
      expect(transformer.from(transformer.to(value))).toBe(value);
    }
  });

  it('does not coerce to a JavaScript number', () => {
    const value = '0.1';
    const result = transformer.from(transformer.to(value));
    expect(typeof result).toBe('string');
    // A number round-trip would lose the trailing precision; the string keeps it.
    expect(result).not.toBe(0.1 as unknown as string);
  });

  it('passes through null and undefined unchanged', () => {
    expect(transformer.to(null)).toBeNull();
    expect(transformer.to(undefined)).toBeUndefined();
    expect(transformer.from(null)).toBeNull();
    expect(transformer.from(undefined)).toBeUndefined();
  });
});
