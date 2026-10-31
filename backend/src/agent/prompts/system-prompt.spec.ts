import { describe, expect, it } from 'vitest';
import { FINLUX_SYSTEM_PROMPT } from './system-prompt.js';

describe('FINLUX_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof FINLUX_SYSTEM_PROMPT).toBe('string');
    expect(FINLUX_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  describe('language behavior', () => {
    it('has a Language section', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/##\s*Language/i);
    });

    it('declares Spanish as the default language', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/default language is Spanish/i);
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/reply in Spanish by default/i);
    });

    it('mirrors the caller and uses English only when the caller uses English', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/mirror the caller/i);
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /english only when the caller writes/i,
      );
    });
  });

  describe('default currency by conversation language', () => {
    it('defaults to COP for a Spanish conversation', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /spanish conversation\s*(?:→|->)?\s*default the draft currency to\s*"?COP"?/i,
      );
    });

    it('defaults to USD for an English conversation', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /english conversation\s*(?:→|->)?\s*default the draft currency to\s*"?USD"?/i,
      );
    });

    it('applies the default only when the caller does not state a currency', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /only when the caller does not explicitly state a currency/i,
      );
    });

    it('lets an explicitly stated currency override the language default', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /explicitly stated currency always overrides/i,
      );
    });

    it('does not ask which currency when none was mentioned', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /do not ask the caller which currency/i,
      );
    });
  });

  describe('plain-text output (no Markdown)', () => {
    it('has an Output format section', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/##\s*Output format/i);
    });

    it('tells the agent not to use Markdown syntax', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/not use Markdown/i);
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/\*\*bold\*\*/i);
    });

    it('explains the UI renders the reply as plain text', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/plain text/i);
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /does ?not parse Markdown|verbatim/i,
      );
    });

    it('keeps the plain-text rule separate from the tool amount-string rule', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/plain decimal STRING/i);
    });
  });

  describe('batch capture — one transaction at a time', () => {
    it('records multiple described transactions one by one', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/one by one/i);
    });

    it('requires exactly one create-transaction call per transaction', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /one create-transaction call per transaction/i,
      );
    });

    it('forbids merging several items into a single record', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /never collapse several items into a single record/i,
      );
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /never sum or split amounts to merge them/i,
      );
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /never batch multiple items into one write/i,
      );
    });
  });

  describe('duplicate-concept check (same concept, same month)', () => {
    it('checks for a same-concept transaction before recording', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /same concept.*same.*calendar month|same concept already exists in the same/i,
      );
    });

    it('matches the concept case-insensitively, ignoring accents/wording', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /case-insensitively, ignoring accents/i,
      );
    });

    it('uses the read-only list-transactions tool for the month range', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/list-transactions/i);
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/first day of the month/i);
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/last day of the month/i);
    });

    it('asks for explicit confirmation before recording a duplicate', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /already exists this month and ask for explicit confirmation/i,
      );
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /do not silently (?:skip it and do not silently )?create a duplicate/i,
      );
    });

    it('keeps the duplicate confirmation in addition to the save confirmation', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /in addition to the normal save confirmation/i,
      );
    });
  });

  describe('existing guardrails remain intact', () => {
    it('keeps currency constrained to the closed COP | USD set', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/"COP"\s*(?:or|\|)\s*"USD"/i);
    });

    it('still forbids moving real money', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/move real money/i);
    });

    it('still declines regulated advice', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(
        /regulated financial, tax, investment, or legal advice/i,
      );
    });

    it('still requires explicit confirmation before creating a transaction', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/explicitly confirmed/i);
    });

    it('still resists prompt injection', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/strictly as data/i);
    });

    it('still keeps amounts as a plain decimal string', () => {
      expect(FINLUX_SYSTEM_PROMPT).toMatch(/plain decimal STRING/i);
    });
  });
});
