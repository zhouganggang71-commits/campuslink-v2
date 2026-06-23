import { FormEvent } from 'react';
import { Course } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface AddCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  form: {
    name: string;
    teacher: string;
    classroom: string;
    weekday: number;
    startPeriod: number;
    periodSpan: number;
    weekStart: number;
    weekEnd: number;
    weekType: Course['weekType'];
    courseType: Course['courseType'];
    colorClass: string;
  };
  onChange: (updates: Partial<AddCourseModalProps['form']>) => void;
  editMode?: boolean;
}

export default function AddCourseModal({ isOpen, onClose, onSubmit, form, onChange, editMode }: AddCourseModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editMode ? '编辑课程' : '添加课程'}
      subtitle={editMode ? '修改课程信息' : '手动录入课程信息到你的课表'}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" block onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" block onClick={(e: any) => onSubmit(e)}>
            {editMode ? '保存修改' : '确认添加'}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">课程名称 *</label>
          <input
            type="text"
            required
            placeholder="例如：计算机网络"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">任课教师</label>
          <input
            type="text"
            placeholder="例如：王教授"
            value={form.teacher}
            onChange={(e) => onChange({ teacher: e.target.value })}
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">教室 *</label>
          <input
            type="text"
            required
            placeholder="例如：信息楼 A-302"
            value={form.classroom}
            onChange={(e) => onChange({ classroom: e.target.value })}
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:border-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">星期 *</label>
            <select
              value={form.weekday}
              onChange={(e) => onChange({ weekday: Number(e.target.value) })}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none"
            >
              <option value={1}>周一</option>
              <option value={2}>周二</option>
              <option value={3}>周三</option>
              <option value={4}>周四</option>
              <option value={5}>周五</option>
              <option value={6}>周六</option>
              <option value={7}>周日</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">节次 *</label>
            <select
              value={form.startPeriod}
              onChange={(e) => onChange({ startPeriod: Number(e.target.value) })}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none"
            >
              {Array.from({ length: 11 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  第 {h} 节
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">周类型</label>
            <select
              value={form.weekType}
              onChange={(e) => onChange({ weekType: e.target.value as Course['weekType'] })}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none"
            >
              <option value="all">每周</option>
              <option value="odd">单周</option>
              <option value="even">双周</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">课程类型</label>
            <select
              value={form.courseType}
              onChange={(e) => onChange({ courseType: e.target.value as Course['courseType'] })}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none"
            >
              <option value="theory">理论课</option>
              <option value="lab">实验课</option>
              <option value="elective">选修课</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">起始周</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.weekStart}
              onChange={(e) => onChange({ weekStart: parseInt(e.target.value) || 1 })}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">结束周</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.weekEnd}
              onChange={(e) => onChange({ weekEnd: parseInt(e.target.value) || 18 })}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">颜色</label>
          <select
            value={form.colorClass}
            onChange={(e) => onChange({ colorClass: e.target.value })}
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs focus:outline-none"
          >
            <option value="bg-course-blue text-white">蓝色 · 理工</option>
            <option value="bg-course-green text-white">绿色 · 语言</option>
            <option value="bg-course-yellow text-on-surface">黄色 · 实验</option>
            <option value="bg-course-orange text-white">橙色 · 人文</option>
            <option value="bg-course-purple text-white">紫色 · 计算机</option>
            <option value="bg-course-red text-white">红色 · 经管</option>
            <option value="bg-course-grey text-white">灰色 · 体育/其他</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
