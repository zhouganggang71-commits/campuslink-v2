import type { Page } from 'playwright';

// 学校当前 CAS 入口；service 保留学校提供的认证回调，不能省略。
export const WECHAT_LOGIN_URL =
  'http://cas-scpcfe-cn.vpn.scpcfe.cn:8118/cas/login?service=https%3A%2F%2Fcas1.scpcfe.cn%2Fauth%2Fcas_validate%3Fentry_id%3D1';

/** 只截取加载完成的企业微信二维码，不依赖 iframe 的长轮询停止。 */
export async function captureWechatQr(page: Page): Promise<Buffer> {
  const iframe = await page.waitForSelector('iframe#qrcodeIframe', { timeout: 15000 });
  const frame = await iframe?.contentFrame();
  if (!frame) throw new Error('企业微信二维码框架未加载');

  const image = await frame.waitForSelector('img.qrcode', { timeout: 15000 });
  if (!image) throw new Error('企业微信二维码图片不存在');
  await frame.waitForFunction(
    () => {
      const qr = document.querySelector('img.qrcode');
      return qr instanceof HTMLImageElement && qr.complete && qr.naturalWidth >= 100 && qr.naturalHeight >= 100;
    },
    undefined,
    { timeout: 15000 },
  );

  const buffer = await image.screenshot({ type: 'png' });
  if (buffer.length < 1000) throw new Error('二维码截图体积异常，未返回可用二维码');
  return buffer;
}
