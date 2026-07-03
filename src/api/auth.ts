/**
 * 认证 API — 登录/Token/用户信息/头像/封面/密码
 */
import { request } from './client';

export const authApi = {
  login(body: {
    studentId: string; fullName: string; password: string;
    department?: string; orgLevel?: string; orgName?: string;
    position?: string; confidence?: string;
  }) {
    return request<any>('POST', '/auth/dev-login', body);
  },

  refresh(refreshToken: string) {
    return request<any>('POST', '/auth/refresh', { refresh_token: refreshToken });
  },

  /** 当前登录用户信息（页面刷新后用 token 恢复登录态） */
  me() {
    return request<{
      id: number; studentId: string; nickname: string; authStatus: string; isAdmin: boolean;
      avatarUrl: string; coverUrl: string; bio: string;
      department: string; orgLevel: string; orgName: string; position: string;
      gender: 'male' | 'female' | null; genderVisible: boolean;
    }>('GET', '/auth/me');
  },

  logout() {
    return request('POST', '/auth/logout');
  },

  uploadAvatar(formData: FormData) {
    return request<any>('POST', '/auth/avatar', formData, true);
  },

  uploadCover(formData: FormData) {
    return request<any>('POST', '/auth/cover', formData, true);
  },

  updateProfile(bio: string) {
    return request<any>('PUT', '/auth/profile', { bio });
  },

  /** 更新性别 / 性别是否公开（默认隐藏，用户自己开启才会在帖子里展示） */
  updateGender(gender: 'male' | 'female' | null, genderVisible: boolean) {
    return request<{ gender: 'male' | 'female' | null; genderVisible: boolean }>('PUT', '/auth/profile', { gender, genderVisible });
  },

  changePassword(password: string, oldPassword?: string) {
    return request('PUT', '/auth/password', { password, oldPassword });
  },

  getPublicProfile(userId: number) {
    return request<any>('GET', `/users/${userId}/public-profile`);
  },
};
