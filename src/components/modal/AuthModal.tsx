import { useState, useRef } from 'react';
import { DEPARTMENTS, POSITIONS, ORG_LEVELS, ORGANIZATIONS } from '../../types';
import { uploadApi } from '../../api';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    fullName: string,
    studentId: string,
    department: string,
    orgLevel: string,
    orgName: string,
    position: string,
    password: string,
    confidence: string,
  ) => void;
  initialValues: { fullName: string; studentId: string; department: string; orgLevel: string; orgName: string; position: string };
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export default function AuthModal({ isOpen, onClose, onSubmit, initialValues, showToast }: AuthModalProps) {
  const [fullName, setFullName] = useState(initialValues.fullName);
  const [studentId, setStudentId] = useState(initialValues.studentId);
  const [department, setDepartment] = useState(initialValues.department);
  const [orgLevel, setOrgLevel] = useState(initialValues.orgLevel);
  const [orgName, setOrgName] = useState(initialValues.orgName);
  const [position, setPosition] = useState(initialValues.position);
  const [isLogin, setIsLogin] = useState(true);
  const [password, setPassword] = useState('');
  const [isOrg, setIsOrg] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 预览
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setPhotoUploaded(true);
    };
    reader.readAsDataURL(file);
    // 自动识图填充（压缩上传，绕过 nginx 1MB 限制）
    setOcrLoading(true);
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append('file', blob, 'student-id.jpg');
      const data = await uploadApi.ocrStudentId(fd);
      if (data.code === 0 && data.data) {
        if (data.data.name) setFullName(data.data.name);
        if (data.data.studentId) setStudentId(data.data.studentId);
        if (data.data.department) setDepartment(data.data.department);
        setOcrConfidence(data.data.confidence || 'low');
      }
    } catch {
      /* noop */
    }
    setOcrLoading(false);
  };

  // Canvas 压缩：长边最大 800px，JPEG quality 0.7
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 800;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 不可用'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('压缩失败')), 'image/jpeg', 0.7);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('加载失败')); };
      img.src = url;
    });
  };

  const handleSubmit = () => {
    if (!studentId.trim()) { showToast('请输入学号'); return; }
    if (!password.trim() || password.trim().length < 6) { showToast('密码至少6位'); return; }
    if (!isLogin) {
      if (!fullName.trim()) { showToast('请输入真实姓名'); return; }
      if (!department.trim()) { showToast('请选择院系'); return; }
      if (!photoUploaded) { showToast('请上传学生证照片'); return; }
      if (ocrConfidence === 'low') { showToast('学生证识别失败，请重新拍摄清晰照片'); return; }
      if (!agreedToTerms) { showToast('请先阅读并同意免责声明'); return; }
    }
    onSubmit(
      isLogin ? fullName.trim() || '用户' : fullName.trim(),
      studentId.trim(),
      department.trim() || initialValues.department,
      isOrg ? orgLevel : '',
      isOrg ? orgName : '',
      isOrg ? position : '',
      password.trim(),
      ocrConfidence || '',
    );
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      position="bottom"
      showCloseButton={false}
      title={isLogin ? '登录' : '学生身份认证'}
      subtitle={isLogin ? '已有账号直接登录' : '完成认证后发布信息带"已认证"标识'}
      footer={
        <div>
          <div className="flex gap-3">
          <Button variant="secondary" size="sm" block onClick={handleClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            block
            onClick={handleSubmit}
            disabled={!studentId.trim() || password.trim().length < 6 || (!isLogin && !agreedToTerms)}
          >
            {isLogin ? '登录' : '提交审核'}
          </Button>
          </div>
          {!isLogin && (!studentId.trim() || password.trim().length < 6 || !agreedToTerms) && (
            <p className="text-[10px] text-gray-400 text-center mt-2">
              {!studentId.trim() ? '请填写学号' : password.trim().length < 6 ? '请设置至少6位密码' : '请勾选同意免责声明'}
            </p>
          )}
        </div>
      }
    >
      {/* 登录/注册切换 */}
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setIsLogin(true)}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${isLogin ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}
        >
          已有账号
        </button>
        <button
          type="button"
          onClick={() => setIsLogin(false)}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${!isLogin ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}
        >
          首次注册
        </button>
      </div>

      {/* 表单字段 */}
      <div className="space-y-4">
        {!isLogin && (
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">姓名 *</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="请输入真实姓名"
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">学号 *</label>
          <input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="请输入学号"
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
          />
        </div>
        {!isLogin && (
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">院系 *</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        {!isLogin && (
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">是否加入学生组织</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsOrg(false);
                  setOrgLevel('');
                  setOrgName('');
                  setPosition('');
                }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border cursor-pointer ${!isOrg ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                否
              </button>
              <button
                type="button"
                onClick={() => setIsOrg(true)}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border cursor-pointer ${isOrg ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                是
              </button>
            </div>
          </div>
        )}
        {!isLogin && isOrg && (
          <>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">具体组织</label>
              <select
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
              >
                <option value="">请选择</option>
                {ORGANIZATIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">组织级别</label>
              <select
                value={orgLevel}
                onChange={(e) => setOrgLevel(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
              >
                {ORG_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">职位</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">{isLogin ? '密码 *' : '设置密码 *'}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isLogin ? '输入登录密码' : '至少6位，用于以后登录'}
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all"
          />
          {isLogin && (
            <p className="text-[10px] text-gray-400 mt-1">
              忘记密码？用「微信扫码登录」进入后，在「我的 → 修改密码」中免旧密码重设
            </p>
          )}
        </div>
        {!isLogin && (
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">学生证/校园卡照片 *</label>
            <input type="file" ref={fileRef} accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            <div
              onClick={() => fileRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${photoUploaded ? 'border-course-green bg-course-green/5 h-36' : 'border-primary/20 bg-primary/5 hover:bg-primary/10 h-28'}`}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="学生证" className="w-full h-full object-contain rounded-xl p-1" />
              ) : (
                <>
                  <Icon name="camera" className="text-primary/60 text-2xl mb-1.5" />
                  <span className="text-xs text-gray-500">点击上传学生证照片</span>
                  <span className="text-[10px] text-gray-400 mt-1">支持 jpg/png，不超过 5MB</span>
                </>
              )}
            </div>
            {ocrConfidence === 'high' && (
              <p className="text-[10px] text-course-green mt-2">可信度高，信息已自动填充</p>
            )}
            {ocrConfidence === 'medium' && (
              <p className="text-[10px] text-course-yellow mt-2">可信度一般，请核对信息</p>
            )}
            {ocrConfidence === 'low' && (
              <p className="text-[10px] text-course-red mt-2">未识别到有效学生证，请手动填写</p>
            )}
            {ocrLoading && <p className="text-[10px] text-course-blue mt-2 text-center">正在识别学生证信息...</p>}
          </div>
        )}
      </div>

      {/* 条款勾选框 */}
      {!isLogin && (
        <label className="flex items-start gap-2 mt-4 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          />
          <span className="text-xs text-gray-500 leading-relaxed">
            我已阅读并同意
            <a href="/campus/disclaimer" target="_blank" className="text-primary underline mx-1">
              《免责声明与用户协议》
            </a>
          </span>
        </label>
      )}
    </Modal>
  );
}
