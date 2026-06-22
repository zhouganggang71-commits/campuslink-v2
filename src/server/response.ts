/**
 * 统一 API 响应格式 + Zod 校验工具
 */
import type { Response } from 'express';
import { ZodSchema } from 'zod';
import { ErrorCode, ErrorCodeType } from './errors';

function trace(req: any): string {
  return req._traceId || '-';
}

export function ok(res: Response, data?: any, message = 'ok') {
  res.json({ code: 0, message, data: data ?? null, trace_id: trace(res.req) });
}

/**
 * 返回错误响应
 * @param res     Response 对象
 * @param status  HTTP 状态码
 * @param message 错误描述
 * @param code    业务错误码（可选，默认 -1）
 * @param detail  详细错误信息（可选，用于字段级错误）
 */
export function fail(res: Response, status: number, message: string, code?: number, detail?: string) {
  res.status(status).json({ code: code ?? -1, message, detail: detail ?? null, trace_id: trace(res.req) });
}

export function notFound(res: Response, message = '资源不存在') {
  fail(res, 404, message, ErrorCode.NOT_FOUND);
}
export function badRequest(res: Response, message: string) {
  fail(res, 400, message, ErrorCode.INVALID_INPUT);
}

/**
 * Zod 校验辅助：解析 req.body，失败自动返回 400 带字段级错误详情
 * 用法: const input = validate(res, schema, req.body); if (!input) return;
 */
export function validate<T>(res: Response, schema: ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const err = result.error;
  const fields =
    (err as any).issues?.map((e: any) => `${e.path?.join('.') || ''}: ${e.message}`).join('; ') || '参数格式错误';
  fail(res, 400, '参数校验失败', ErrorCode.VALIDATION_ERROR, fields);
  return null;
}
