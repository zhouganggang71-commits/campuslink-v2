import { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { getWechatQr, pollWechatLogin } from '../../api/wechat-auth';

interface WechatLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (data: { token: string; refresh_token: string; user: any }) => void;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export default function WechatLoginModal({ isOpen, onClose, onLoginSuccess, showToast }: WechatLoginModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'waiting_qr' | 'scanning' | 'scanned' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingRef = useRef(false);
  // 用 ref 存最新状态，避免闭包过期问题
  const statusRef = useRef(status);
  const qrCodeRef = useRef(qrCode);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { qrCodeRef.current = qrCode; }, [qrCode]);

  // 打开弹窗时获取二维码
  useEffect(() => {
    if (!isOpen) {
      // 关闭时清理
      if (pollingRef.current) clearInterval(pollingRef.current);
      setQrCode(null);
      setSessionId(null);
      setStatus('loading');
      setErrorMsg('');
      loadingRef.current = false;
      return;
    }

    startLogin();

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isOpen]);

  async function startLogin() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStatus('loading');
    try {
      const data = await getWechatQr();
      setSessionId(data.sessionId);
      setStatus('waiting_qr'); // 先显示"生成中"，等轮询拿到二维码后再切 scanning
      // 开始轮询
      startPolling(data.sessionId);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || '获取二维码失败，请重试');
    } finally {
      loadingRef.current = false;
    }
  }

  function startPolling(sid: string) {
    if (pollingRef.current) clearInterval(pollingRef.current);
    let retries = 0;
    const maxRetries = 120;

    pollingRef.current = setInterval(async () => {
      retries++;
      if (retries > maxRetries) {
        clearInterval(pollingRef.current!);
        setStatus('error');
        setErrorMsg('扫码超时，请重新尝试');
        return;
      }

      try {
        const result = await pollWechatLogin(sid);
        if (result.status === 'starting' || result.status === 'rate_limited') {
          return; // 限流本轮跳过，下一轮继续
        }
        if (result.status === 'error' || result.status === 'expired') {
          clearInterval(pollingRef.current!);
          setStatus('error');
          setErrorMsg(result.message || '获取二维码超时，请重试');
          return;
        }
        if (result.status === 'scanning' && result.qrCode && !qrCodeRef.current) {
          // 第一次拿到二维码 → 切到 scanning 显示二维码
          setQrCode(result.qrCode);
          setStatus('scanning');
        }
        if (result.status === 'scanned') {
          if (statusRef.current !== 'scanned') setStatus('scanned');
          return;
        }
        if (result.status === 'done' && result.token) {
          clearInterval(pollingRef.current!);
          setStatus('success');
          onLoginSuccess({
            token: result.token,
            refresh_token: result.refresh_token!,
            user: result.user,
          });
          showToast(result.sync?.message || '登录成功', 'success');
          setTimeout(() => onClose(), 1500);
        }
      } catch (err: any) {
        console.warn('轮询失败', err.message); // 网络抖动等，下一轮继续
      }
    }, 2000); // 2s/次 = 30次/分，配合服务端 poll 限流 60/分留一倍余量
  }

  function handleRetry() {
    startLogin();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="企业微信扫码登录" position="center" showCloseButton={false}>
      <div className="flex flex-col items-center py-6 px-4">
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-gray-500">正在获取二维码...</p>
          </div>
        )}

        {status === 'waiting_qr' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-gray-500">正在生成二维码...</p>
          </div>
        )}

        {status === 'scanning' && qrCode && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <img src={qrCode} alt="企业微信扫码" className="w-48 h-48 object-contain" />
            </div>
            <p className="text-sm text-gray-600 font-medium">请使用企业微信扫一扫</p>
            <p className="text-xs text-gray-400 text-center max-w-xs">
              打开手机企业微信 → 扫一扫，完成身份验证后自动登录
            </p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">等待扫码中...</span>
            </div>
          </div>
        )}

        {status === 'scanned' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 bg-[#07C160]/10 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-[#07C160]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-[#07C160] font-semibold">扫码成功！</p>
            <p className="text-xs text-gray-400">正在验证身份并同步课表...</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-course-blue rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">处理中</span>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-course-green/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-course-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-course-green font-semibold">登录成功</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-course-red/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-course-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm text-course-red">{errorMsg || '登录失败'}</p>
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" onClick={handleRetry}>重新扫码</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
