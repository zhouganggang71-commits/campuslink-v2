/**
 * 数据加密工具 — AES-256-GCM
 * 用于敏感字段（手机号、联系方式等）在数据库中的加密存储
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`缺少必需环境变量: ${name}`);
  return val;
}

const KEY = Buffer.from(requireEnv('ENCRYPTION_KEY'), 'utf8').subarray(0, 32);

export function encrypt(plaintext: string): string | null {
  if (!plaintext) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // 格式: iv:tag:ciphertext (全部 hex)
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
  } catch {
    return null;
  }
}

export function decrypt(ciphertext: string): string | null {
  if (!ciphertext) return null;
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) return ciphertext; // 明文（旧数据兼容）
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return ciphertext; // 解密失败返回原文（兼容旧数据）
  }
}
