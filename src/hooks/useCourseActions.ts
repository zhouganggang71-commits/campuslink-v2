/**
 * 课表相关操作 — 添加、删除、导入、分享
 */
import { Course } from '../types';
import { coursesApi } from '../api';
import { useOptimistic } from './useOptimistic';

interface CourseDataLayer {
  courses: Course[];
  setCourses: React.Dispatch<React.SetStateAction<Course[]>>;
  syncCourses: () => void;
  setIsShareModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShareWeek: React.Dispatch<React.SetStateAction<number>>;
  setIsAddCourseOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editingCourseId: string | null;
  setEditingCourseId: React.Dispatch<React.SetStateAction<string | null>>;
  courseForm: {
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
  setCourseForm: React.Dispatch<React.SetStateAction<any>>;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export function useCourseActions(d: CourseDataLayer) {
  const { runDelete } = useOptimistic();

  const handleAddCourse = () => {
    if (!d.courseForm.name || !d.courseForm.classroom) {
      d.showToast('请填写课程名称与教室', 'info');
      return;
    }

    const { weekday, startPeriod, periodSpan, weekStart, weekEnd, weekType } = d.courseForm;
    const wd = Number(weekday);
    const sp = Number(startPeriod);
    const ps = Number(periodSpan);
    const ws = Number(weekStart);
    const we = Number(weekEnd);

    // ── 时间冲突检测（编辑模式跳过与自身冲突）──
    const conflict = d.courses.find((c) => {
      if (d.editingCourseId && c.id === d.editingCourseId) return false;
      if (c.weekday !== wd) return false;
      const cEnd = c.startPeriod + c.periodSpan;
      const nEnd = sp + ps;
      if (nEnd <= c.startPeriod || sp >= cEnd) return false;
      if (weekType !== 'all' && c.weekType !== 'all' && c.weekType !== weekType) return false;
      if (ws > c.weekEnd || we < c.weekStart) return false;
      return true;
    });

    if (conflict) {
      const dayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      const conflictRange = `${conflict.startPeriod}-${conflict.startPeriod + conflict.periodSpan}节`;
      d.showToast(`与「${conflict.name}」冲突（${dayNames[conflict.weekday]} ${conflictRange}），请修改时间`, 'info');
      return;
    }

    const courseData = {
      name: d.courseForm.name,
      teacher: d.courseForm.teacher,
      classroom: d.courseForm.classroom,
      weekday: wd,
      startPeriod: sp,
      periodSpan: ps,
      weekStart: ws,
      weekEnd: we,
      weekType: d.courseForm.weekType,
      courseType: d.courseForm.courseType,
      colorClass: d.courseForm.colorClass,
    };

    // ── 编辑模式：乐观更新 + PUT ──
    if (d.editingCourseId) {
      const prevCourses = d.courses;
      d.setCourses(d.courses.map((c) => (c.id === d.editingCourseId ? { ...c, ...courseData } : c)));
      coursesApi
        .update(d.editingCourseId!, courseData)
        .then(() => d.showToast('课程已更新', 'success'))
        .catch(() => {
          d.setCourses(prevCourses);
          d.showToast('更新失败，请重试', 'info');
        });
      d.setEditingCourseId(null);
      d.setIsAddCourseOpen(false);
      d.setCourseForm({
        name: '',
        teacher: '',
        classroom: '',
        weekday: 3,
        startPeriod: 3,
        periodSpan: 2,
        weekStart: 1,
        weekEnd: 18,
        weekType: 'all',
        courseType: 'theory',
        colorClass: 'bg-course-blue text-white',
      });
      return;
    }

    // ── 新增模式 ──
    const prevCourses = d.courses;
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      ...courseData,
    };
    d.setCourses([...d.courses, newCourse]);
    coursesApi
      .create({ ...newCourse, id: undefined } as any)
      .then(() => d.showToast('课程已添加！', 'success'))
      .catch((err) => {
        console.error('[handleAddCourse]', err);
        d.setCourses(prevCourses);
        d.showToast('添加失败，请重试', 'info');
      });
    d.setIsAddCourseOpen(false);
    d.setCourseForm({
      name: '',
      teacher: '',
      classroom: '',
      weekday: 3,
      startPeriod: 3,
      periodSpan: 2,
      weekStart: 1,
      weekEnd: 18,
      weekType: 'all',
      courseType: 'theory',
      colorClass: 'bg-course-blue text-white',
    });
  };

  const handleDeleteCourse = (id: string) => {
    runDelete(d.setCourses, id, () => coursesApi.delete(id), {
      onSuccess: () => d.showToast('课程已删除', 'info'),
      onError: () => d.showToast('删除失败，请重试', 'info'),
    });
  };

  const handleImportCourses = async (imported: Omit<Course, 'id'>[]) => {
    const newCourses = imported.map((c, i) => ({ ...c, id: `course-import-${Date.now()}-${i}` }));
    const prev = d.courses;
    d.setCourses(newCourses);

    const res = await coursesApi.batchReplace(imported);
    if (res.code !== 0) {
      d.setCourses(prev);
      d.showToast('导入失败，已回滚，请重试', 'info');
      return;
    }
    d.showToast(`已导入 ${imported.length} 门课程`, 'success');
  };

  const handleShareSchedule = (week: number) => {
    d.setShareWeek(week);
    d.setIsShareModalOpen(true);
    // 分享前同步服务端课表数据，确保 colorClass 等字段最新
    d.syncCourses();
  };

  return {
    handleAddCourse,
    handleDeleteCourse,
    handleImportCourses,
    handleShareSchedule,
  };
}
