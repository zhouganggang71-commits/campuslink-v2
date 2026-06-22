import { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface FieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
}

function Field({ label, required, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1">
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
}

export function Input({ label, required, className = '', ...props }: InputProps) {
  return (
    <Field label={label} required={required}>
      <input
        {...props}
        className={`w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-primary ${className}`}
      />
    </Field>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  required?: boolean;
  options: { value: string | number; label: string }[];
}

export function Select({ label, required, options, className = '', ...props }: SelectProps) {
  return (
    <Field label={label} required={required}>
      <select
        {...props}
        className={`w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none ${className}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
