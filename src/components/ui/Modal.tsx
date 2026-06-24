import { ReactNode, useEffect, useRef } from 'react';
import Icon from './Icon';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
  /** 'center' = 居中弹窗（默认），'bottom' = 底部弹出（bottom-sheet） */
  position?: 'center' | 'bottom';
  /** 是否显示右上角关闭按钮，默认 true */
  showCloseButton?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  position = 'center',
  showCloseButton = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // ── ESC 关闭 + 背景滚动锁定 + 焦点陷阱 ──
  // 所有 hooks 必须在 early return 之前，保持调用顺序一致
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Tab 焦点循环
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    // 打开时聚焦弹窗
    modalRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isCenter = position === 'center';

  return (
    <div
      className={`fixed inset-0 z-50 flex ${isCenter ? 'items-center justify-center p-4' : 'items-end justify-center'} animate-reveal`}
    >
      {/* 遮罩层 */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity ${isCenter ? 'backdrop-blur-xs' : ''}`}
      />

      {/* 卡片 */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative bg-white shadow-2xl z-10 flex flex-col ${
          isCenter ? 'rounded-2xl' : 'rounded-t-[20px]'
        } ${isCenter ? (size === 'sm' ? 'w-full max-w-sm' : 'w-full max-w-md') : 'w-full max-w-lg max-h-[92vh]'}`}
      >
        {/* 底部弹出模式：拖拽手柄 */}
        {!isCenter && (
          <div onClick={onClose} className="w-full flex justify-center py-3 cursor-pointer shrink-0">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
          </div>
        )}

        {/* 标题 / 副标题 */}
        {(title || subtitle) && (
          <div className={`${isCenter ? 'px-5 pt-5 pb-2' : 'px-6 pb-4'}`}>
            {title && (
              <h2
                className={`font-headline font-bold text-on-surface ${isCenter ? 'text-base' : 'text-lg'} ${subtitle ? 'mb-0.5' : ''}`}
              >
                {title}
              </h2>
            )}
            {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
          </div>
        )}

        {/* 关闭按钮（居中模式默认显示） */}
        {showCloseButton && isCenter && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <Icon name="x" className="text-lg" />
          </button>
        )}

        {/* 内容区 */}
        <div className={`overflow-y-auto ${isCenter ? 'px-5 py-3' : 'px-6 py-4'}`}>{children}</div>

        {/* 底部按钮区 */}
        {footer && (
          <div className={`shrink-0 ${isCenter ? 'px-5 pb-5 pt-1' : 'border-t border-slate-100 px-4 pb-6 pt-4'}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
