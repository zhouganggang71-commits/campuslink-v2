/**
 * 活动报名面板 — 懒加载独立组件
 */
import { useState } from 'react';
import { Listing } from '../../types';
import { useRegistrations } from '../../utils/regContext';
import Icon from '../ui/Icon';
import Button from '../ui/Button';

export default function RegisterPanel({
  listing,
  profile,
}: {
  listing: Listing;
  profile: { fullName: string; studentId: string; department: string };
}) {
  const { register, countFor } = useRegistrations();
  const [isOpen, setIsOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ name: '', studentId: '', department: '', phone: '' });

  const openModal = () => {
    setForm({
      name: profile.fullName || '',
      studentId: profile.studentId || '',
      department: profile.department || '',
      phone: '',
    });
    setIsOpen(true);
  };

  if (listing.postType !== 'activity' || listing.status !== 'active') return null;

  const handleSubmit = () => {
    if (!form.name || !form.phone) return;
    register(listing.id, listing.title, form.name, form.studentId, form.department, form.phone);
    setDone(true);
    setIsOpen(false);
  };

  const cnt = countFor(listing.id);

  return (
    <>
      <div className="flex items-center gap-2">
        {cnt > 0 && <span className="text-[11px] text-gray-400">{cnt}人报名</span>}
        {done ? (
          <span className="bg-course-green text-white text-sm font-semibold py-2.5 px-6 rounded-lg flex items-center gap-1">
            <Icon name="check_circle" className="text-base" />
            已报名
          </span>
        ) : (
          <button
            onClick={openModal}
            className="bg-course-purple text-white font-headline text-sm py-2.5 px-6 rounded-lg active:scale-95 font-semibold cursor-pointer shadow-sm"
          >
            我要报名
          </button>
        )}
      </div>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
          <div
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          ></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[20px] shadow-2xl z-10 px-6 py-6 overflow-y-auto max-h-[80vh]">
            <h3 className="font-headline text-lg font-bold mb-4">活动报名 — {listing.title}</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={form.name}
                disabled
                className="w-full bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 cursor-not-allowed"
              />
              <input
                type="text"
                value={form.studentId}
                disabled
                className="w-full bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 cursor-not-allowed"
              />
              <input
                type="text"
                value={form.department}
                disabled
                className="w-full bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 cursor-not-allowed"
              />
              <input
                type="text"
                placeholder="请输入手机号"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" size="sm" block onClick={() => setIsOpen(false)}>
                取消
              </Button>
              <Button variant="primary" size="sm" block onClick={handleSubmit} disabled={!form.name || !form.phone}>
                确认报名
              </Button>
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-3">提交后发布者将在报名库中看到你的信息</p>
          </div>
        </div>
      )}
    </>
  );
}
