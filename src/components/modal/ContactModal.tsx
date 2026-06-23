import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface ContactModalProps {
  isOpen: boolean;
  type: 'QQ' | 'WeChat';
  name: string;
  onClose: () => void;
  onCopy: () => void;
}

export default function ContactModal({ isOpen, type, name, onClose, onCopy }: ContactModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center ${type === 'QQ' ? 'bg-brand-blue/10 text-brand-blue' : 'bg-course-green/10 text-course-green'}`}
          >
            <Icon name={type === 'QQ' ? 'chat' : 'forum'} className="text-base" />
          </span>
          通过 {type} 联系 {name}
        </span>
      }
      subtitle="请遵守校园守则，校内当面交易，谨防诈骗。"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="primary" size="sm" block onClick={onCopy}>
            复制
          </Button>
          <Button variant="secondary" size="sm" block onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <div className="bg-slate-100 p-3 rounded-lg w-full text-center border border-slate-200">
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">{type} 号</span>
        <span className="text-sm font-bold font-mono text-primary select-all">
          {type === 'QQ' ? '928374921' : 'wxid_campus_alex'}
        </span>
      </div>
    </Modal>
  );
}
