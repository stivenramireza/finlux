import type { HTMLInputAutoCompleteAttribute } from 'react';

/**
 * Labeled, brand-bordered input matching the chat's input treatment
 * (`border-brand`, rounded, `focus-within` brand ring). Associates
 * `<label htmlFor>` with the input `id`, and links a validation message via
 * `aria-describedby` when present (Req 7.1).
 */
interface AuthFieldProps {
  id: string;
  label: string;
  type: 'email' | 'password' | 'text';
  value: string;
  onChange: (value: string) => void;
  autoComplete?: HTMLInputAutoCompleteAttribute;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Optional per-field validation / helper message. */
  error?: string;
  /** Optional hint shown when there is no error (e.g. password policy). */
  hint?: string;
}

export function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  required = false,
  disabled = false,
  placeholder,
  error,
  hint,
}: AuthFieldProps) {
  const describedById = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </label>

      <div className="border-brand focus-within:ring-brand/40 bg-background flex items-center rounded-xl border px-1 focus-within:ring-4">
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm focus-visible:outline-none disabled:opacity-60 sm:text-base"
        />
      </div>

      {error ? (
        <p id={`${id}-error`} className="text-brand text-sm font-medium">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
