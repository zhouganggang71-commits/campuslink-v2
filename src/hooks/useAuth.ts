/**
 * 认证状态 hook — 从 useAppData 拆分出的第一块
 * 组件只需 `import { useAuth }` 即可获取 profile/isGuest/isPending
 * 替代 `useAppData().profile` / `useAppData().isGuest` 的模式
 */
import { useAppData } from './useAppData';
import type { AppData } from './useAppData';

export interface AuthState {
  profile: AppData['profile'];
  setProfile: AppData['setProfile'];
  isGuest: AppData['isGuest'];
  isPending: AppData['isPending'];
}

export function useAuth(): AuthState {
  const { profile, setProfile, isGuest, isPending } = useAppData();
  return { profile, setProfile, isGuest, isPending };
}
