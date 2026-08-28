/**
 * 数据加密工具测试
 */
import { describe, it, expect } from 'vitest';

// 需要环境变量，设一个测试用值
process.env.ENCRYPTION_KEY = 'test-encryption-key-32chars!!';

import { encrypt, decrypt } from './crypto';

describe('encrypt / decrypt', () => {
  it('应正确加密和解密', () => {
    const plaintext = '13800138000';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBeNull();
    expect(encrypted).not.toBe(plaintext);

    const decrypted = decrypt(encrypted!);
    expect(decrypted).toBe(plaintext);
  });

  it('空输入返回 null', () => {
    expect(encrypt('')).toBeNull();
  });

  it('相同明文每次加密结果不同（IV 随机）', () => {
    const a = encrypt('hello');
    const b = encrypt('hello');
    expect(a).not.toBe(b);
  });

  it('解密失败返回原文（兼容旧数据）', () => {
    const result = decrypt('not-encrypted-data');
    expect(result).toBe('not-encrypted-data');
  });

  it('空输入解密返回 null', () => {
    expect(decrypt('')).toBeNull();
  });
});
