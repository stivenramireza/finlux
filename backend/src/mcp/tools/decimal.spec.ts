import { describe, expect, it } from 'vitest';
import {
  fromMinorUnits,
  subtractDecimalStrings,
  sumDecimalStrings,
  toMinorUnits,
} from './decimal.js';

describe('decimal helpers', () => {
  describe('sumDecimalStrings', () => {
    it('sums with exact 4-dp precision (no float drift)', () => {
      // 0.1 + 0.2 would drift as a float; BigInt minor units stay exact.
      expect(sumDecimalStrings(['0.1', '0.2'])).toBe('0.3000');
      expect(sumDecimalStrings(['10.5000', '0.1000'])).toBe('10.6000');
    });

    it('returns 0.0000 for an empty list', () => {
      expect(sumDecimalStrings([])).toBe('0.0000');
    });
  });

  describe('subtractDecimalStrings', () => {
    it('subtracts exactly (4-dp round-trip, no float drift)', () => {
      expect(subtractDecimalStrings('30.0000', '10.0000')).toBe('20.0000');
      expect(subtractDecimalStrings('0.3', '0.1')).toBe('0.2000');
    });

    it('produces a negative result when b > a', () => {
      expect(subtractDecimalStrings('10.0000', '30.0000')).toBe('-20.0000');
      expect(subtractDecimalStrings('0', '0.0001')).toBe('-0.0001');
    });

    it('returns 0.0000 when equal', () => {
      expect(subtractDecimalStrings('19.1545', '19.1545')).toBe('0.0000');
    });

    it('handles the full 4-dp scale without rounding', () => {
      expect(subtractDecimalStrings('1234567.8901', '0.0001')).toBe(
        '1234567.8900',
      );
    });

    it('round-trips through minor units', () => {
      const a = '42.4242';
      const b = '17.1717';
      expect(subtractDecimalStrings(a, b)).toBe(
        fromMinorUnits(toMinorUnits(a) - toMinorUnits(b)),
      );
    });
  });
});
