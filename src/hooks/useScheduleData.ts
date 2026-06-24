import { useState, useEffect, useRef, useCallback } from 'react';
import { Course } from '../types';
import { coursesApi } from '../api';

export function useScheduleData() {
  const [courses, setCourses] = useState<Course[]>([]);
  const retried = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetch = useCallback(() => {
    coursesApi.list()
      .then((res: any) => {
        if (res.code === 0 && res.data) {
          const arr = Array.isArray(res.data) ? res.data : (res.data as any).data || [];
          setCourses(
            arr.map((c: any) => ({
              id: String(c.id),
              name: c.name,
              teacher: c.teacher || '',
              classroom: c.classroom || '',
              weekday: c.weekday || 1,
              startPeriod: c.start_period || 1,
              periodSpan: c.period_span || 2,
              weekStart: c.week_start || 1,
              weekEnd: c.week_end || 18,
              weekType: c.week_type || 'all',
              courseType: c.course_type || 'theory',
              colorClass: c.color_class || 'bg-course-blue text-white',
            })),
          );
          try {
            localStorage.setItem('campuslink_courses', JSON.stringify(arr));
          } catch {
            /* noop */
          }
        } else if (!retried.current) {
          retried.current = true;
          timerRef.current = setTimeout(fetch, 2000);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetch]);

  return { courses, setCourses };
}
