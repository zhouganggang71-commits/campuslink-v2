/**
 * 报名上下文 — 独立 Context
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Registration } from '../types';
import { api, getToken } from './api';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`campuslink_${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: any) {
  try {
    localStorage.setItem(`campuslink_${key}`, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

interface RegContextType {
  registrations: Registration[];
  myRegIds: Set<string>;
  register: (
    listingId: string,
    listingTitle: string,
    name: string,
    studentId: string,
    department: string,
    phone: string,
  ) => void;
  countFor: (listingId: string) => number;
}

const RegContext = createContext<RegContextType>({
  registrations: [],
  myRegIds: new Set(),
  register: () => {},
  countFor: () => 0,
});

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [registrations, setRegistrations] = useState<Registration[]>(() => load('regs', []));
  const [myRegIds, setMyRegIds] = useState<Set<string>>(() => new Set(load<string[]>('myRegIds', [])));

  // 从后端加载
  useEffect(() => {
    if (!getToken()) return;
    api
      .get<{ joined: any[]; mine: any[] }>('/registrations')
      .then((res) => {
        if (res.code === 0 && res.data) {
          const joined = (res.data.joined || []).map(
            (r: any) =>
              ({
                id: String(r.id),
                listingId: String(r.listing_id),
                listingTitle: r.listing_title,
                registrantName: r.registrant_name,
                studentId: r.student_id,
                department: r.department || '',
                phone: r.phone,
                registeredAt: r.created_at?.substring(0, 16) || '',
              }) as Registration,
          );
          const mine = (res.data.mine || []).map(
            (r: any) =>
              ({
                id: String(r.id),
                listingId: String(r.listing_id),
                listingTitle: r.listing_title,
                registrantName: r.registrant_name,
                studentId: r.student_id,
                department: r.department || '',
                phone: r.phone,
                registeredAt: r.created_at?.substring(0, 16) || '',
              }) as Registration,
          );
          const all = [...joined, ...mine];
          // joined 里的都是我报名的
          if (joined.length)
            setMyRegIds((prev) => {
              const next = new Set(prev);
              joined.forEach((r) => next.add(r.id));
              return next;
            });
          if (all.length)
            setRegistrations((prev) => {
              const existing = new Set(prev.map((r) => r.id));
              return [...all.filter((r) => !existing.has(r.id)), ...prev];
            });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    save('regs', registrations);
  }, [registrations]);
  useEffect(() => {
    save('myRegIds', [...myRegIds]);
  }, [myRegIds]);

  const registerFn = useCallback(
    (listingId: string, listingTitle: string, name: string, studentId: string, department: string, phone: string) => {
      const id = `reg-${Date.now()}`;
      const reg: Registration = {
        id,
        listingId,
        listingTitle,
        registrantName: name,
        studentId,
        department,
        phone,
        registeredAt: new Date().toLocaleString('zh-CN'),
      };
      setRegistrations((prev) => [reg, ...prev]);
      setMyRegIds((prev) => new Set(prev).add(id));
      api
        .post('/registrations', { listingId, listingTitle, registrantName: name, studentId, department, phone })
        .catch(() => {
          setRegistrations((prev) => prev.filter((r) => r.id !== id));
          setMyRegIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    },
    [],
  );

  const countFor = useCallback(
    (listingId: string) => registrations.filter((r) => r.listingId === listingId).length,
    [registrations],
  );

  return (
    <RegContext.Provider value={{ registrations, myRegIds, register: registerFn, countFor }}>
      {children}
    </RegContext.Provider>
  );
}

export function useRegistrations() {
  return useContext(RegContext);
}
