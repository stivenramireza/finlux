import { describe, expect, it } from 'vitest';
import {
  createGetCurrentDateTool,
  currentCalendarDay,
} from './get-current-date.tool.js';

describe('currentCalendarDay', () => {
  it('formats a fixed instant as YYYY-MM-DD in the given time zone', () => {
    // 2025-03-10T02:30:00Z is still 2025-03-09 (21:30) in America/Bogota (-05).
    const instant = new Date('2025-03-10T02:30:00Z');
    expect(currentCalendarDay('America/Bogota', instant)).toBe('2025-03-09');
    expect(currentCalendarDay('UTC', instant)).toBe('2025-03-10');
  });

  it('returns a valid calendar-day shape', () => {
    expect(currentCalendarDay('America/Bogota')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is independent of the server time zone (same instant, different zones)', () => {
    const instant = new Date('2025-01-01T00:30:00Z');
    // 00:30 UTC is still 2024-12-31 19:30 in Bogota.
    expect(currentCalendarDay('America/Bogota', instant)).toBe('2024-12-31');
    expect(currentCalendarDay('UTC', instant)).toBe('2025-01-01');
  });

  it('falls back to the default zone when given an invalid time zone', () => {
    const instant = new Date('2025-03-10T02:30:00Z');
    // Invalid zone → default America/Bogota → 2025-03-09.
    expect(currentCalendarDay('Not/AZone', instant)).toBe('2025-03-09');
  });
});

describe('get-current-date tool', () => {
  it('takes no input and returns a calendar-day string', async () => {
    const tool = createGetCurrentDateTool('UTC');
    // The tool reads no caller data; context is irrelevant to the result.
    const result = (await tool.execute!({}, {} as never)) as { date: string };
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has no userId/token/accessToken in its input schema (consistency)', () => {
    const tool = createGetCurrentDateTool('UTC');
    const shape = (
      tool.inputSchema as unknown as { shape?: Record<string, unknown> }
    ).shape;
    const keys = shape ? Object.keys(shape) : [];
    expect(keys).toEqual([]);
  });
});
