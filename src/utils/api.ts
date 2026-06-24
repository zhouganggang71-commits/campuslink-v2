/**
 * API 层 — 向后兼容封装，委托到 src/api/client.ts
 * 保留 api.get/post/put/delete/upload 接口，所有调用方无需修改
 */
import { request, setSession, getToken } from '../api/client';

const doFetch = (method: string, path: string, body?: any) =>
  request(method, path, body, false);

const doUpload = (path: string, formData: FormData) =>
  request('POST', path, formData, true);

export { setSession, getToken };

export const api = {
  get: <T>(path: string) => doFetch('GET', path) as Promise<{ code: number; data?: T; message?: string; detail?: string }>,
  post: <T>(path: string, body?: any) => doFetch('POST', path, body) as Promise<{ code: number; data?: T; message?: string; detail?: string }>,
  put: <T>(path: string, body?: any) => doFetch('PUT', path, body) as Promise<{ code: number; data?: T; message?: string; detail?: string }>,
  delete: <T>(path: string) => doFetch('DELETE', path) as Promise<{ code: number; data?: T; message?: string; detail?: string }>,
  upload: <T>(path: string, formData: FormData) => doUpload(path, formData) as Promise<{ code: number; data?: T; message?: string; detail?: string }>,
};
