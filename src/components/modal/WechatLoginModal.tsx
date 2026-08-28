import { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { getWechatQr, pollWechatLogin, cancelWechatLogin } from '../../api/wechat-auth';

interface WechatLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (data: { token: string; refresh_token: string; user: any }) => void;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export default function WechatLoginModal({ isOpen, onClose, onLoginSuccess, showToast }: WechatLoginModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'waiting_qr' | 'scanning' | 'scanned' | 'success' | 'error'>(
    'loading',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFnRef = useRef<(() => Promise<void>) | null>(null);
  const loadingRef = useRef(false);
  // 用 ref 存最新状态，避免闭包过期问题
  const statusRef = useRef(status);
  const qrCodeRef = useRef(qrCode);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    qrCodeRef.current = qrCode;
  }, [qrCode]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // 页面切回前台时立即轮询一次（解决 iOS 切到微信扫码后定时器被挂起的问题）
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && statusRef.current === 'scanning' && pollFnRef.current) {
        pollFnRef.current();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 打开弹窗时获取二维码
  useEffect(() => {
    if (!isOpen) {
      // 关闭时清理：主动告诉服务端放弃这个会话，立即释放浏览器——
      // 不这么做的话，服务端要等 7 分钟超时清理器才回收，用户多关几次/重试几次
      // 就会把并发配额占满，表现成"明明只有我一个人在扫却提示人数过多"
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (sessionIdRef.current) cancelWechatLogin(sessionIdRef.current);
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
      // 重新扫码/重试前，先把上一支还没结束的会话释放掉，避免旧的一直占着并发配额
      // （见上面 isOpen 关闭分支的同一个根因说明）
      if (sessionIdRef.current) {
        await cancelWechatLogin(sessionIdRef.current);
        sessionIdRef.current = null;
        setSessionId(null);
      }
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
    // 180 次 × 2s = 6 分钟——比原来的 4 分钟宽松一些，给扫码/CAS 验证多留些余量
    // （服务端会话存活时间同步放宽到 7 分钟，比这里多留 1 分钟缓冲）
    const maxRetries = 180;

    async function pollOnce() {
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
    }

    pollFnRef.current = pollOnce;
    pollingRef.current = setInterval(pollOnce, 2000); // 2s/次 = 30次/分，配合服务端 poll 限流 60/分留一倍余量
  }

  function handleRetry() {
    startLogin();
  }

  // 扫码过程中随时可以主动取消——onClose 会触发上面 isOpen 的清理分支，
  // 自动调用 cancelWechatLogin 立即释放服务端浏览器
  const canCancel = status !== 'success';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="企业微信扫码登录"
      position="center"
      showCloseButton={false}
      // 二维码区域旁边留白大、误触代价高（白白浪费一次服务端浏览器会话，还容易让人
      // 以为"码很快就失效了"）——关掉点击遮罩关闭，只能走下面的显式"取消"按钮
      closeOnBackdropClick={false}
    >
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
              <Button variant="secondary" size="sm" onClick={handleRetry}>
                重新扫码
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                取消
              </Button>
            </div>
          </div>
        )}

        {/* 非终态（加载中/等码/扫码中/已扫码待处理）统一给一个取消入口，
            替代被关掉的"点击遮罩关闭"——避免用户找不到退出方式 */}
        {canCancel && status !== 'error' && (
          <button
            onClick={onClose}
            className="mt-6 text-xs text-gray-400 hover:text-gray-600 cursor-pointer underline underline-offset-2"
          >
            取消登录
          </button>
        )}
      </div>
    </Modal>
  );
}
