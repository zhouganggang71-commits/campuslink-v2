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
  /** 点击遮罩层是否关闭，默认 true。像扫码登录这种"背景空白区域大、误触代价高（会
   * 白白浪费一次服务端浏览器会话）"的场景可以关掉，强制走显式的取消/关闭按钮 */
  closeOnBackdropClick?: boolean;
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
  closeOnBackdropClick = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── ESC 关闭 + 背景滚动锁定 + 焦点陷阱 ──
  // 注意：依赖仅 isOpen，onClose 通过 ref 读取最新值，避免父组件重渲染时
  // effect 重复执行导致 modalRef.focus() 劫持用户正在输入的焦点。
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      // Tab 焦点循环
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    // 不锁 body scroll——内容由弹窗自身 overflow-y-auto 管，
    // 锁 body 在 iOS 上会让固定高度 main 容器外的内容无法触及
    // 打开时聚焦弹窗
    modalRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isCenter = position === 'center';

  return (
    <div
      className={`fixed inset-0 z-50 flex ${isCenter ? 'items-center justify-center p-4' : 'items-end justify-center'} animate-reveal`}
    >
      {/* 遮罩层 */}
      <div
        onClick={closeOnBackdropClick ? onClose : undefined}
        className={`absolute inset-0 bg-black/40 transition-opacity ${isCenter ? 'backdrop-blur-xs' : ''}`}
      />

      {/* 卡片 */}
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`relative bg-white shadow-2xl z-10 flex flex-col ${
          isCenter ? 'rounded-2xl max-h-[90vh]' : 'rounded-t-[20px]'
        } ${isCenter ? (size === 'sm' ? 'w-full max-w-sm' : 'w-full max-w-md') : 'w-full max-w-lg max-h-[95dvh]'}`}
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
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 cursor-pointer">
            <Icon name="x" className="text-lg" />
          </button>
        )}

        {/* 内容区 — min-h-0 必须有：flex 子元素默认 min-height:auto 不会收缩，
            内容超高时会把卡片撑出屏幕（body 又被锁定滚动），表现为"弹窗翻不下去" */}
        <div className={`overflow-y-auto min-h-0 ${isCenter ? 'px-5 py-3' : 'px-6 py-4'}`}>{children}</div>

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
