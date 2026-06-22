import Icon from '../ui/Icon';

interface ContactModalProps {
  isOpen: boolean;
  type: 'QQ' | 'WeChat';
  name: string;
  onClose: () => void;
  onCopy: () => void;
}

export default function ContactModal({ isOpen, type, name, onClose, onCopy }: ContactModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-reveal">
      <div onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-xs transition-opacity"></div>
      <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 z-10 flex flex-col items-center text-center">
        <div
          className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center ${type === 'QQ' ? 'bg-[#005ea1]/10 text-[#005ea1]' : 'bg-course-green/10 text-course-green'}`}
        >
          <Icon name={type === 'QQ' ? 'chat' : 'forum'} className="text-2xl" />
        </div>
        <h3 className="font-headline font-bold text-sm text-on-surface">
          通过 {type} 联系 {name}
        </h3>
        <p className="text-[11px] text-gray-400 px-4 mt-1.5 leading-relaxed">
          请遵守校园守则，校内当面交易，谨防诈骗。
        </p>
        <div className="my-4 bg-slate-100 p-3 rounded-lg w-full text-center border border-slate-200">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">{type} 号</span>
          <span className="text-sm font-bold font-mono text-primary select-all">
            {type === 'QQ' ? '928374921' : 'wxid_campus_alex'}
          </span>
        </div>
        <div className="w-full flex gap-2">
          <button
            onClick={onCopy}
            className="flex-1 bg-primary text-white py-2 text-xs font-bold rounded-lg cursor-pointer"
          >
            复制
          </button>
          <button
            onClick={onClose}
            className="bg-slate-100 text-gray-600 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
