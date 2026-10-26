import { describe, expect, it } from 'vitest';
import {
  REDACTED_TOKEN,
  containsJwtLike,
  scrubJwtLike,
} from './egress-guardrail.js';

// A realistic JWT-shaped string (header.payload.signature, header starts `eyJ`).
const JWT_LIKE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6ImFAYi5jIn0.s1gnatur3_s1gnatur3_s1gnatur3';

describe('egress guardrail (Layer 1)', () => {
  it('detects a JWT-shaped substring', () => {
    expect(containsJwtLike(`your token is ${JWT_LIKE} keep it safe`)).toBe(
      true,
    );
  });

  it('scrubs a JWT-shaped substring from the agent reply', () => {
    const scrubbed = scrubJwtLike(`here: ${JWT_LIKE}`);
    expect(scrubbed).toContain(REDACTED_TOKEN);
    expect(scrubbed).not.toContain('eyJ');
    expect(containsJwtLike(scrubbed)).toBe(false);
  });

  it('scrubs multiple tokens', () => {
    const scrubbed = scrubJwtLike(`${JWT_LIKE} and ${JWT_LIKE}`);
    expect(scrubbed).toBe(`${REDACTED_TOKEN} and ${REDACTED_TOKEN}`);
  });

  it('leaves ordinary prose and numbers untouched', () => {
    const text = 'You spent 20.00 COP on lunch on 2025-02-10. Total: 1234.5678';
    expect(scrubJwtLike(text)).toBe(text);
    expect(containsJwtLike(text)).toBe(false);
  });
});
