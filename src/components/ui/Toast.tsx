import { memo } from 'react';
import Icon from './Icon';
interface ToastProps {
  toast: { message: string; type: 'success' | 'info' } | null;
}

const Toast = memo(function Toast({ toast }: ToastProps) {
  if (!toast) return null;
  return (
    <div className="fixed top-20 z-[110] bg-primary text-white font-headline text-sm rounded-full px-6 py-3 shadow-lg flex items-center gap-2 animate-bounce">
      <Icon name="check_circle" className="text-lg" />
      <span>{toast.message}</span>
    </div>
  );
});

export default Toast;
