/**
 * JWT 工具测试
 */
import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = 'test-jwt-unit-test-secret-key-2026';

import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';

describe('signAccessToken / verifyAccessToken', () => {
  it('应签名并验证普通用户 token', () => {
    const token = signAccessToken(1, false);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT 格式: header.payload.signature

    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe(1);
    expect(payload!.admin).toBe(false);
  });

  it('应签名并验证管理员 token', () => {
    const token = signAccessToken(42, true);
    const payload = verifyAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe(42);
    expect(payload!.admin).toBe(true);
  });

  it('amr 默认应为 password', () => {
    const payload = verifyAccessToken(signAccessToken(1, false));
    expect(payload!.amr).toBe('password');
  });

  it('amr=scan 应完整往返（扫码会话免旧密码重设的依据）', () => {
    const payload = verifyAccessToken(signAccessToken(1, false, 'scan'));
    expect(payload!.amr).toBe('scan');
  });

  it('应拒绝过期 token', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign({ uid: 1, admin: false, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const payload = verifyAccessToken(expired);
    expect(payload).toBeNull();
  });

  it('应拒绝篡改的 token', () => {
    const token = signAccessToken(1, false);
    const [header, payload] = token.split('.');
    const tampered = [header, payload, 'invalidsig'].join('.');
    const result = verifyAccessToken(tampered);
    expect(result).toBeNull();
  });

  it('应拒绝无效格式', () => {
    expect(verifyAccessToken('')).toBeNull();
    expect(verifyAccessToken('not-a-jwt')).toBeNull();
    expect(verifyAccessToken('a.b')).toBeNull();
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  it('应签名并验证 refresh token', () => {
    const token = signRefreshToken(1);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    const payload = verifyRefreshToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe(1);
  });

  it('access token 不应通过 refresh token 验证', () => {
    const accessToken = signAccessToken(1, false);
    const result = verifyRefreshToken(accessToken);
    expect(result).toBeNull();
  });

  it('应拒绝过期 refresh token', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign({ uid: 1, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const payload = verifyRefreshToken(expired);
    expect(payload).toBeNull();
  });
});

describe('类型区分', () => {
  it('不同用户 ID 产出不同 token', () => {
    const t1 = signAccessToken(1, false);
    const t2 = signAccessToken(2, false);
    expect(t1).not.toBe(t2);
  });
});
