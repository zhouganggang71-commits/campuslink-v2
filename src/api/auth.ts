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

  changePassword(password: string, oldPassword?: string) {
    return request('PUT', '/auth/password', { password, oldPassword });
  },

  getPublicProfile(userId: number) {
    return request<any>('GET', `/users/${userId}/public-profile`);
  },
};
