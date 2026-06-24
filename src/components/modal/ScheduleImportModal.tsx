import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { uploadApi } from '../../api';
import type { Course } from '../../types';

interface ScheduleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (courses: Omit<Course, 'id'>[]) => void;
}

export default function ScheduleImportModal({ isOpen, onClose, onImport }: ScheduleImportModalProps) {
  const [mode, setMode] = useState<'pdf' | 'html'>('pdf');
  const [htmlText, setHtmlText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');

  const WEEKDAYS = ['周一','周二','周三','周四','周五','周六','周日'];

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await uploadApi.parseSchedulePDF(form) as any;
      if (res.code === 0 && res.data?.courses?.length) {
        setResult(res.data.courses);
        setSelected(new Set(res.data.courses.map((_: any, i: number) => i)));
      } else {
        setError(res.message || '未识别到课程');
      }
    } catch { setError('上传失败'); }
    setLoading(false);
  };

  const handleHtmlParse = async () => {
    if (!htmlText.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await uploadApi.parseScheduleHTML(htmlText) as any;
      if (res.code === 0 && res.data?.courses?.length) {
        setResult(res.data.courses);
        setSelected(new Set(res.data.courses.map((_: any, i: number) => i)));
      } else {
        setError(res.message || '未识别到课程');
      }
    } catch { setError('解析失败'); }
    setLoading(false);
  };

  const toggle = (i: number) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const handleImport = () => {
    if (!result) return;
    onImport(result.filter((_, i) => selected.has(i)));
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="导入课表" subtitle="支持 PDF 文件或粘贴 HTML 表格">
      <div className="space-y-3">
        <div className="flex gap-2">
          <button onClick={() => { setMode('pdf'); setResult(null); setError(''); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg ${mode === 'pdf' ? 'bg-primary text-white' : 'bg-slate-100 text-gray-500'}`}>
            📄 PDF 文件
          </button>
          <button onClick={() => { setMode('html'); setResult(null); setError(''); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg ${mode === 'html' ? 'bg-primary text-white' : 'bg-slate-100 text-gray-500'}`}>
            📋 粘贴 HTML
          </button>
        </div>

        {mode === 'pdf' ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-primary/40">
            <input type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
            <Icon name="file_text" className="text-3xl text-gray-300" />
            <span className="text-xs text-gray-500">点击选择教务系统导出的 PDF</span>
          </label>
        ) : (
          <div>
            <textarea value={htmlText} onChange={(e) => setHtmlText(e.target.value)}
              placeholder="粘贴教务系统课表的 HTML 源代码..."
              rows={6} className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none resize-none" />
            <button onClick={handleHtmlParse} disabled={!htmlText.trim() || loading}
              className="w-full mt-2 bg-primary text-white py-2 rounded-lg text-xs font-semibold disabled:opacity-50">
              解析
            </button>
          </div>
        )}

        {loading && <div className="text-center py-4 text-xs text-gray-400">解析中...</div>}
        {error && <div className="text-xs text-red-500 p-3 bg-red-50 rounded-lg">{error}</div>}

        {result && (
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700">识别到 {result.length} 门课程</span>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set(result.map((_: any, i: number) => i)))}
                  className="text-[10px] text-primary font-semibold">全选</button>
                <button onClick={() => setSelected(new Set())}
                  className="text-[10px] text-gray-400">取消</button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {result.map((c, i) => (
                <div key={i} onClick={() => toggle(i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${selected.has(i) ? 'bg-white border border-primary/30' : 'bg-white/50 border border-transparent'}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selected.has(i) ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                    {selected.has(i) && <Icon name="check" className="text-white text-[10px]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold">{c.name}</span>
                    <span className="text-[10px] text-gray-400 ml-2">
                      {c.teacher} · {WEEKDAYS[(c.weekday||1)-1]} {c.startPeriod}-{c.startPeriod+c.periodSpan-1}节{c.classroom ? ` · ${c.classroom}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={handleImport} disabled={selected.size === 0}
              className="w-full mt-2 bg-primary text-white py-2 rounded-lg text-xs font-semibold disabled:opacity-50">
              导入选中 ({selected.size})
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
