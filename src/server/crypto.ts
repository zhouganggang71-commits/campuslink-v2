/**
 * 数据加密工具 — AES-256-GCM
 * 用于敏感字段（手机号、联系方式等）在数据库中的加密存储
 *
 * v2（安全修复）：ENCRYPTION_KEY 现在按 hex 解码后经 SHA-256 派生 32 字节密钥
 * v1（旧格式兼容）：密钥直接用 UTF-8 字节（仅保留用于解密已有数据）
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`缺少必需环境变量: ${name}`);
  return val;
}

// ── 密钥派生 ──
const rawHex = requireEnv('ENCRYPTION_KEY');
// v1 旧密钥（仅用于解密已有数据，保留向后兼容）
const KEY_V1 = Buffer.from(rawHex, 'utf8').subarray(0, 32);
// v2 新密钥：hex 解码后 SHA-256 → 正确利用 128 位熵生成 256 位密钥
const KEY_V2 = crypto.createHash('sha256').update(Buffer.from(rawHex, 'hex')).digest();

const FORMAT_PREFIX = 'v2:';

export function encrypt(plaintext: string): string | null {
  if (!plaintext) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, KEY_V2, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // 格式: v2:iv:tag:ciphertext (全部 hex)
    return FORMAT_PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
  } catch {
    return null;
  }
}

export function decrypt(ciphertext: string): string | null {
  if (!ciphertext) return null;
  try {
    let key = KEY_V1;
    let payload = ciphertext;
    // v2 格式：使用新密钥
    if (ciphertext.startsWith(FORMAT_PREFIX)) {
      key = KEY_V2;
      payload = ciphertext.slice(FORMAT_PREFIX.length);
    }
    const parts = payload.split(':');
    if (parts.length !== 3) return ciphertext; // 明文（旧数据兼容）
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return ciphertext; // 解密失败返回原文（兼容旧数据）
  }
}

/**
 * 重新加密为 v2 格式（用于数据迁移）
 * 如果已是 v2 格式则原样返回
 */
export function reEncrypt(ciphertext: string): string | null {
  if (!ciphertext) return null;
  if (ciphertext.startsWith(FORMAT_PREFIX)) return ciphertext;
  const decrypted = decrypt(ciphertext);
  if (!decrypted || decrypted === ciphertext) return ciphertext; // 解密失败保留原样
  return encrypt(decrypted);
}
