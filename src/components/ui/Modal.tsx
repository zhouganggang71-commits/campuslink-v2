import { ReactNode } from 'react';
import Icon from './Icon';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}

export default function Modal({ isOpen, onClose, title, subtitle, children, footer, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-reveal">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity" />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl z-10 flex flex-col ${size === 'sm' ? 'w-full max-w-sm' : 'w-full max-w-md'}`}
      >
        {(title || subtitle) && (
          <div className="px-5 pt-5 pb-2">
            {title && <h2 className="text-base font-bold text-on-surface">{title}</h2>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        )}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer">
          <Icon name="x" className="text-lg" />
        </button>
        <div className="px-5 py-3 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 pb-5 pt-1">{footer}</div>}
      </div>
    </div>
  );
}
