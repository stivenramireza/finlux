import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true only for a real `YYYY-MM-DD` calendar day. The pattern alone is
 * not enough: `2025-02-30` matches the shape but is not a real day, so we also
 * round-trip through a UTC `Date` and require the parts to match exactly.
 * Future dates are intentionally allowed.
 */
export function isCalendarDay(value: unknown): boolean {
  if (typeof value !== 'string' || !CALENDAR_DAY_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

@ValidatorConstraint({ name: 'isCalendarDay', async: false })
class IsCalendarDayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCalendarDay(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid calendar day in YYYY-MM-DD form`;
  }
}

/** Validates that a value is a real `YYYY-MM-DD` calendar day. */
export function IsCalendarDay(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCalendarDayConstraint,
    });
  };
}
