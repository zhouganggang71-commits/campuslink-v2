import { memo } from 'react';
import Icon from './Icon';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  toast: { message: string; type: 'success' | 'info'; action?: ToastAction } | null;
}

const Toast = memo(function Toast({ toast }: ToastProps) {
  if (!toast) return null;
  return (
    <div role="alert" aria-live="polite" className="fixed top-20 left-1/2 -translate-x-1/2 z-[110] bg-primary text-white font-headline text-sm rounded-full px-6 py-3 shadow-lg flex items-center gap-2 animate-bounce">
      <Icon name="check_circle" className="text-lg" />
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.action!.onClick();
          }}
          className="ml-1 px-3 py-0.5 bg-white/20 hover:bg-white/30 rounded-full text-xs font-semibold cursor-pointer transition-colors"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
});

export default Toast;
