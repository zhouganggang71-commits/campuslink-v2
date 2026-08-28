/**
 * 环境变量 Zod 验证 —— 启动时一次性 parse，格式不合规立即 crash（fail-fast）
 * 替代分散的 process.env.X 读法，所有模块 import { env } from './envSchema' 即可
 */
import { z } from 'zod';

const envSchema = z.object({
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 字符'),
  ADMIN_KEY: z.string().min(16, 'ADMIN_KEY 至少 16 字符').optional(),
  CAMPUSLINK_DB_PW: z.string().min(8, '数据库密码至少 8 位'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY 至少 16 字符'),
  CAMPUSLINK_PORT: z.coerce.number().int().default(3002),
  CAMPUSLINK_HOST: z.string().default('127.0.0.1'),
  CORS_ORIGIN: z.string().default('https://jhcaishui.cn'),
  HEALTH_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MIMO_API_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const env: EnvConfig = envSchema.parse(process.env);
