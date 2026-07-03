/**
 * 认证相关操作 — 登录/注册
 */
import { StudentProfile, OrgLevel, Position } from '../types';
import { INITIAL_PROFILE } from '../data';
import { authApi, setSession } from '../api';

interface AuthDataLayer {
  setProfile: React.Dispatch<React.SetStateAction<StudentProfile>>;
  setIsAuthModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (msg: string, type?: 'success' | 'info') => void;
  syncCourses: () => void;
  syncPosts: () => void;
  syncFavorites: () => void;
}

export function useAuthActions(d: AuthDataLayer) {
  const handleAuth = async (
    fullName: string,
    studentId: string,
    department: string,
    orgLevel: string,
    orgName: string,
    position: string,
    password: string,
    confidence: string,
  ) => {
    const res = await authApi.login({
      studentId, fullName, password, department,
      orgLevel, orgName, position,
      confidence: confidence || undefined,
    });
    if (res.code === 0 && res.data?.token) {
      setSession(res.data.token, res.data.refresh_token);
      const authStatus = res.data?.user?.authStatus || 'pending';
      const verified = authStatus === 'verified' || authStatus === 'org_verified';
      const newProfile: StudentProfile = {
        ...INITIAL_PROFILE,
        fullName,
        department: res.data?.user?.department || department,
        studentId,
        orgLevel: (res.data?.user?.orgLevel || orgLevel) as OrgLevel,
        orgName: res.data?.user?.orgName || orgName || '',
        position: (res.data?.user?.position || position) as Position,
        isVerified: verified,
        isAdmin: !!res.data?.user?.isAdmin,
        avatarUrl: res.data?.user?.avatarUrl || '',
        coverUrl: res.data?.user?.coverUrl || '',
        bio: res.data?.user?.bio || '',
        postsCount: 0,
        savedCount: 0,
        gender: res.data?.user?.gender || null,
        genderVisible: !!res.data?.user?.genderVisible,
      };
      // 先持久化 profile，再清其他缓存——避免清完到 useEffect 保存之间的窗口期
      // 导致刷新后 token 有效但 profile 丢失、用户显示为游客。
      try {
        localStorage.setItem('campuslink_profile', JSON.stringify(newProfile));
        Object.keys(localStorage)
          .filter((k) => k.startsWith('campuslink_') && !['campuslink_token', 'campuslink_refresh', 'campuslink_sid', 'campuslink_profile', 'campuslink_schema_version'].includes(k))
          .forEach((k) => localStorage.removeItem(k));
      } catch { /* noop */ }
      d.setProfile(newProfile);
      if (authStatus === 'pending') d.showToast('注册成功！等待管理员审核', 'info');
      else if (authStatus === 'org_verified') d.showToast('组织身份已认证', 'success');
      d.setIsAuthModalOpen(false);
      d.showToast('认证成功！', 'success');
      d.syncCourses();
      d.syncPosts();
      d.syncFavorites();
    } else {
      d.showToast(res.message || '认证失败', 'info');
    }
  };

  return { handleAuth };
}
