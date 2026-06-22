import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  block?: boolean;
  children: ReactNode;
}

const variants = {
  primary: 'bg-primary text-white shadow-md hover:brightness-110 active:scale-[0.98] disabled:opacity-40',
  secondary: 'border border-gray-200 text-gray-600 hover:bg-slate-50 active:scale-95',
  danger: 'border border-red-200 text-red-500 hover:bg-red-50 active:scale-95',
  ghost: 'text-gray-500 hover:text-gray-700 hover:bg-slate-100',
};

const sizes = {
  sm: 'py-2 text-xs font-semibold',
  md: 'py-3 text-sm font-semibold',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  block,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-lg cursor-pointer transition-all disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
