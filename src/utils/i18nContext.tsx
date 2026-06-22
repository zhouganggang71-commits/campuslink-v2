import { createContext, useContext, useState, ReactNode } from 'react';
import { zh, en } from './i18n';

type Lang = 'zh' | 'en';
type Messages = typeof zh;

const I18nContext = createContext<{ lang: Lang; t: Messages; toggle: () => void }>({
  lang: 'zh',
  t: zh,
  toggle: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('campuslink_lang');
    return saved === 'en' ? 'en' : 'zh';
  });

  const t = lang === 'zh' ? zh : en;
  const toggle = () => {
    const next = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    localStorage.setItem('campuslink_lang', next);
  };

  return <I18nContext.Provider value={{ lang, t, toggle }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
