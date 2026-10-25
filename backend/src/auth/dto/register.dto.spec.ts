import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './register.dto.js';

function validate(input: Record<string, unknown>) {
  const dto = plainToInstance(RegisterDto, input);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
}

const VALID = {
  email: 'user@example.com',
  password: 'Str0ng!Pass',
  displayName: 'Ada',
};

describe('RegisterDto password policy', () => {
  it('accepts a valid password', () => {
    expect(validate(VALID)).toHaveLength(0);
  });

  it('rejects a password shorter than 8 characters', () => {
    const errors = validate({ ...VALID, password: 'Ab1!' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a password missing an uppercase letter', () => {
    const errors = validate({ ...VALID, password: 'str0ng!pass' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a password missing a lowercase letter', () => {
    const errors = validate({ ...VALID, password: 'STR0NG!PASS' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a password missing a digit', () => {
    const errors = validate({ ...VALID, password: 'Strong!Pass' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a password missing a special character', () => {
    const errors = validate({ ...VALID, password: 'Str0ngPass1' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an invalid email', () => {
    const errors = validate({ ...VALID, email: 'not-an-email' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts registration without a displayName (optional)', () => {
    const { displayName: _omit, ...rest } = VALID;
    void _omit;
    expect(validate(rest)).toHaveLength(0);
  });
});
