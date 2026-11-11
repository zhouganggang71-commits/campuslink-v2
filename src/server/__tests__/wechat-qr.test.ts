import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import { captureWechatQr, WECHAT_LOGIN_URL } from '../wechat-qr';

function makePage() {
  const screenshot = vi.fn().mockResolvedValue(Buffer.alloc(2000));
  const frame = {
    waitForSelector: vi.fn().mockResolvedValue({ screenshot }),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
  };
  const contentFrame = vi.fn().mockResolvedValue(frame);
  const page = { waitForSelector: vi.fn().mockResolvedValue({ contentFrame }) };
  return { page: page as unknown as Page, frame, screenshot, contentFrame };
}

describe('企业微信二维码加载', () => {
  it('使用学校提供的 CAS 回调，而非会跳转至门户的旧教务入口', () => {
    const url = new URL(WECHAT_LOGIN_URL);
    expect(url.origin).toBe('http://cas-scpcfe-cn.vpn.scpcfe.cn:8118');
    expect(url.pathname).toBe('/cas/login');
    expect(url.searchParams.get('service')).toBe('https://cas1.scpcfe.cn/auth/cas_validate?entry_id=1');
  });

  it('图片准备完成之前绝不截图，避免只等到 iframe 或 logo 就返回空白', async () => {
    const { page, frame, screenshot } = makePage();
    let finishLoading!: () => void;
    const loaded = new Promise<void>((resolve) => {
      finishLoading = resolve;
    });
    let signalWaiting!: () => void;
    const waiting = new Promise<void>((resolve) => {
      signalWaiting = resolve;
    });
    frame.waitForFunction.mockImplementation(() => {
      signalWaiting();
      return loaded;
    });
    const capture = captureWechatQr(page);
    await waiting;
    expect(frame.waitForSelector).toHaveBeenCalledWith('img.qrcode', { timeout: 15000 });
    expect(screenshot).not.toHaveBeenCalled();
    finishLoading();
    expect(await capture).toHaveLength(2000);
    expect(screenshot).toHaveBeenCalledWith({ type: 'png' });
  });

  it('框架未加载时明确失败，不使用整页截图兜底', async () => {
    const { page, contentFrame, screenshot } = makePage();
    contentFrame.mockResolvedValue(null);
    await expect(captureWechatQr(page)).rejects.toThrow('框架未加载');
    expect(screenshot).not.toHaveBeenCalled();
  });

  it('二维码图片加载超时时失败，不继续截图碰运气', async () => {
    const { page, frame, screenshot } = makePage();
    frame.waitForFunction.mockRejectedValue(new Error('image load timeout'));
    await expect(captureWechatQr(page)).rejects.toThrow('image load timeout');
    expect(screenshot).not.toHaveBeenCalled();
  });

  it('拒绝过小的占位截图', async () => {
    const { page, screenshot } = makePage();
    screenshot.mockResolvedValue(Buffer.alloc(200));
    await expect(captureWechatQr(page)).rejects.toThrow('截图体积异常');
  });
});
