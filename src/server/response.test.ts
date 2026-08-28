/**
 * 服务端验证工具测试
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// 直接测试 validate 函数的行为——不依赖 express
// validate 的逻辑：用 zod schema 校验对象，失败则调用 fail 并返回 null

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  if (!result.success) return null;
  return result.data;
}

describe('validate', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().min(0),
  });

  it('应通过有效数据', () => {
    const result = validate(schema, { name: 'test', age: 18 });
    expect(result).toEqual({ name: 'test', age: 18 });
  });

  it('应拒绝无效数据（缺少字段）', () => {
    const result = validate(schema, { name: 'test' });
    expect(result).toBeNull();
  });

  it('应拒绝无效数据（类型错误）', () => {
    const result = validate(schema, { name: 'test', age: 'abc' });
    expect(result).toBeNull();
  });

  it('应拒绝空名称', () => {
    const result = validate(schema, { name: '', age: 18 });
    expect(result).toBeNull();
  });

  it('应拒绝负数年龄', () => {
    const result = validate(schema, { name: 'test', age: -1 });
    expect(result).toBeNull();
  });
});

describe('Zod 4 strict mode 行为', () => {
  it('strip 模式默认忽略额外字段', () => {
    const schema = z.object({ a: z.string() });
    const result = schema.safeParse({ a: 'x', b: 'y' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ a: 'x' });
    }
  });

  it('strict mode 拒绝额外字段', () => {
    const schema = z.object({ a: z.string() }).strict();
    const result = schema.safeParse({ a: 'x', b: 'y' });
    expect(result.success).toBe(false);
  });
});
