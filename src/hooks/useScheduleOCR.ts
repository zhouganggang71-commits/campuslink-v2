/**
 * 课表 OCR 导入 Hook — 文件上传 → 轮询 → 结果选择
 */
import { useState, useRef, useEffect } from 'react';
import { Course, COURSE_COLORS } from '../types';
import { uploadApi } from '../api';

export function useScheduleOCR(onImportCourses: (courses: Omit<Course, 'id'>[]) => void) {
  const [ocrResult, setOcrResult] = useState<Omit<Course, 'id'>[] | null>(null);
  const [ocrSelected, setOcrSelected] = useState<Set<number>>(new Set());
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<string>('');

  const mountedRef = useRef(true);
  const uploadEpoch = useRef(0);
  const pollingRef = useRef(false);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const resumePolling = async (taskId: string) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setOcrProgress('恢复识别中...');

    let parsedCourses: Omit<Course, 'id' | 'colorClass'>[] | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (!mountedRef.current) { pollingRef.current = false; return; }
      const pollRes = await uploadApi.pollScheduleResult(taskId);
      if (pollRes.code !== 0) continue;
      const task = pollRes.data;
      if (task?.status === 'done' && task.courses && task.courses.length > 0) {
        parsedCourses = task.courses;
        break;
      }
      if (task?.status === 'error') {
        setOcrError(task.error || '识别失败，请重试');
        sessionStorage.removeItem('ocr_taskId');
        pollingRef.current = false;
        return;
      }
      setOcrProgress(`后台识别中... ${i * 2} 秒`);
    }

    if (!parsedCourses) {
      setOcrError('识别超时，请重试');
      sessionStorage.removeItem('ocr_taskId');
      pollingRef.current = false;
      return;
    }

    const results: Omit<Course, 'id'>[] = parsedCourses.map((c, i) => ({
      ...c,
      colorClass: COURSE_COLORS[i % COURSE_COLORS.length],
    }));
    setOcrResult(results);
    setOcrSelected(new Set(results.map((_, i) => i)));
    setOcrProgress('');
    sessionStorage.removeItem('ocr_taskId');
    pollingRef.current = false;
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('ocr_taskId');
    if (saved && !pollingRef.current) resumePolling(saved);
  }, []);

  const handleUploadSchedule = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (ocrProgress) return;

    setOcrError(null);
    setOcrProgress('正在识别...');
    setOcrSelected(new Set());
    setOcrResult(null);

    const epoch = ++uploadEpoch.current;
    let parsedCourses: Omit<Course, 'id' | 'colorClass'>[] | null = null;
    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    try {
      const fd = new FormData();
      fd.append('file', file);
      if (isPdf) {
        setOcrProgress('正在解析 PDF 课表...');
        const data = await uploadApi.parseSchedulePDF(fd) as any;
        if (uploadEpoch.current !== epoch || !mountedRef.current) return;
        const courses = data.data?.courses;
        if (data.code === 0 && courses && courses.length > 0) {
          parsedCourses = courses;
        } else {
          setOcrError(data.message || '未识别到课程，请确认是教务系统导出的 PDF');
        }
      } else {
        const uploadRes = await uploadApi.ocrScheduleImage(fd);
        if (uploadEpoch.current !== epoch || !mountedRef.current) return;
        if (uploadRes.code !== 0 || !uploadRes.data?.taskId) {
          setOcrError(uploadRes.message || '上传失败，请重试');
          return;
        }
        sessionStorage.setItem('ocr_taskId', uploadRes.data.taskId);
        setOcrProgress('后台识别中...');
        setTimeout(() => setOcrProgress(''), 3000);
        resumePolling(uploadRes.data.taskId);
        return;
      }
    } catch (err: any) {
      if (uploadEpoch.current !== epoch || !mountedRef.current) return;
      setOcrError(err instanceof TypeError ? '网络异常，请检查网络后重试' : '识别失败，请重试');
    }

    if (!parsedCourses || parsedCourses.length === 0) {
      if (mountedRef.current) setOcrProgress('');
      return;
    }

    if (!mountedRef.current) return;
    const results: Omit<Course, 'id'>[] = parsedCourses.map((c, i) => ({
      ...c,
      colorClass: COURSE_COLORS[i % COURSE_COLORS.length],
    }));
    setOcrResult(results);
    setOcrSelected(new Set(results.map((_, i) => i)));
    setOcrProgress('');
  };

  const handleImportOCR = () => {
    if (!ocrResult) return;
    const selected = ocrResult.filter((_, i) => ocrSelected.has(i));
    onImportCourses(selected);
    setOcrResult(null);
    setOcrSelected(new Set());
  };

  const toggleOcrSelect = (idx: number) => {
    const next = new Set(ocrSelected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setOcrSelected(next);
  };

  return {
    ocrResult, ocrSelected, ocrError, ocrProgress,
    handleUploadSchedule, handleImportOCR, toggleOcrSelect,
    setOcrSelected,
    resumePolling,
  };
}
