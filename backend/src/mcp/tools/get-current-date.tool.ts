import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Resolves "today" as a `YYYY-MM-DD` calendar day in a fixed IANA time zone,
 * independently of the server's local time zone. LLMs have no clock, so without
 * this the agent cannot resolve relative dates ("today", "yesterday") when
 * capturing a transaction. The zone defaults to `America/Bogota` (the product's
 * primary market; COP is a first-class currency) and is overridable via the
 * `AGENT_TIME_ZONE` env var.
 *
 * Unlike the transaction tools, this reads no caller data: the current date is
 * not user-scoped, so the tool takes no inputs, needs no `accessToken`, and
 * carries no request context.
 */

const DEFAULT_TIME_ZONE = 'America/Bogota';

/**
 * Formats a `Date` as `YYYY-MM-DD` in the given IANA time zone using `Intl`
 * (so it does not depend on the process TZ). Falls back to the default zone if
 * the configured one is invalid.
 */
export function currentCalendarDay(
  timeZone: string = DEFAULT_TIME_ZONE,
  now: Date = new Date(),
): string {
  const format = (tz: string): string =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now); // en-CA yields the ISO-like `YYYY-MM-DD` shape.

  try {
    return format(timeZone);
  } catch {
    return format(DEFAULT_TIME_ZONE);
  }
}

/**
 * Builds the `get-current-date` tool. The resolved time zone is read once from
 * config (by key name) and closed over; a missing/invalid value falls back to
 * the default inside {@link currentCalendarDay}.
 */
export function createGetCurrentDateTool(timeZone: string = DEFAULT_TIME_ZONE) {
  const description =
    "Get today's date as a YYYY-MM-DD calendar day. Call this to resolve " +
    'relative dates the user mentions (e.g. "today", "yesterday", "last ' +
    'Friday") before drafting or saving a transaction. Takes no input.';

  return createTool({
    id: 'get-current-date',
    description,
    inputSchema: z.object({}),
    outputSchema: z.object({ date: z.string() }),
    execute: () => Promise.resolve({ date: currentCalendarDay(timeZone) }),
  });
}
