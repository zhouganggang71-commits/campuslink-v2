import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface ShareScheduleModalProps {
  isOpen: boolean;
  selectedWeek: number;
  courseCount: number;
  onClose: () => void;
}

export default function ShareScheduleModal({ isOpen, selectedWeek, courseCount, onClose }: ShareScheduleModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="课表分享卡"
      subtitle="已生成，可分享给同学"
      footer={
        <Button variant="primary" block onClick={onClose}>
          完成
        </Button>
      }
    >
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs flex flex-col gap-2 shadow-inner">
        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
          <span className="font-bold text-primary text-sm flex items-center gap-1">
            <Icon name="school" className="text-xs" /> CampusLink 课表
          </span>
          <span className="bg-course-green/10 text-course-green text-[9px] px-1.5 py-0.5 rounded-full font-bold">
            第 {selectedWeek} 周
          </span>
        </div>
        <p className="font-bold mt-1">
          本学期共修读 <b>{courseCount}</b> 门课
        </p>
        <p className="text-gray-500">
          当前进度: <b>{Math.round((selectedWeek / 18) * 100)}%</b>
        </p>
      </div>
    </Modal>
  );
}
