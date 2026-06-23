/**
 * 校园圈发布弹窗 — 圈子选择 + 内容 + 图片上传 + 匿名开关
 */
import { useState, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { api } from '../../utils/api';
import type { CircleInfo, CirclePost } from '../../hooks/useCircles';

interface CirclePublishModalProps {
  isOpen: boolean;
  circles: CircleInfo[];
  onClose: () => void;
  onSuccess: (post: CirclePost) => void;
  onError: (msg: string) => void;
}

export default function CirclePublishModal({ isOpen, circles, onClose, onSuccess, onError }: CirclePublishModalProps) {
  const [circleId, setCircleId] = useState(circles[0]?.id || 'trending');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + imageFiles.length > 9) {
      onError('最多上传9张图片');
      return;
    }
    const newFiles = files.filter((f) => f.type.startsWith('image/'));
    if (newFiles.length !== files.length) onError('仅支持图片格式');
    if (newFiles.length === 0) return;
    const previews = newFiles.map((f) => URL.createObjectURL(f));
    setImageFiles((prev) => [...prev, ...newFiles].slice(0, 9));
    setImagePreviews((prev) => [...prev, ...previews].slice(0, 9));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (i: number) => {
    URL.revokeObjectURL(imagePreviews[i]);
    setImageFiles((prev) => prev.filter((_, j) => j !== i));
    setImagePreviews((prev) => prev.filter((_, j) => j !== i));
  };

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const form = new FormData();
        imageFiles.forEach((f) => form.append('images', f));
        const uploadRes = await api.upload<{ urls: string[] }>('/upload', form);
        if (uploadRes.code === 0 && uploadRes.data?.urls) {
          imageUrls = uploadRes.data.urls;
        } else {
          onError(uploadRes.message || '图片上传失败');
          setLoading(false);
          return;
        }
      }
      const res = await api.post(`/circles/${circleId}/posts`, {
        circle_id: circleId,
        content: content.trim(),
        images: imageUrls,
        tags: [],
        is_anonymous: isAnonymous,
      });
      if (res.code === 0 && res.data) {
        onSuccess(res.data as CirclePost);
        setContent('');
        setIsAnonymous(false);
        imagePreviews.forEach((u) => URL.revokeObjectURL(u));
        setImageFiles([]);
        setImagePreviews([]);
        onClose();
      } else {
        onError(res.message || '发布失败');
      }
    } catch {
      onError('发布失败，请重试');
    }
    setLoading(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { onClose(); imagePreviews.forEach((u) => URL.revokeObjectURL(u)); setImageFiles([]); setImagePreviews([]); }}
      title="发布到校园圈"
      subtitle="分享校园生活，连接更多同学"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" block onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            block
            onClick={handleSubmit}
            disabled={!content.trim() || loading}
          >
            {loading ? '发布中...' : '发布'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* 圈子选择 */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1.5">选择圈子</label>
          <div className="flex flex-wrap gap-2">
            {circles.map((c) => (
              <button
                key={c.id}
                onClick={() => setCircleId(c.id)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-all ${circleId === c.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* 内容 */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="分享你的校园生活..."
            rows={4}
            maxLength={200}
            className="w-full bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none transition-all resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1 text-right">{content.length}/200</p>
        </div>

        {/* 图片上传 */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1.5">图片（选填，最多9张）</label>
          <div className="flex flex-wrap gap-2">
            {imagePreviews.map((url, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-100">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute top-0 right-0 w-5 h-5 bg-black/50 rounded-bl-lg flex items-center justify-center cursor-pointer"
                >
                  <Icon name="close" className="text-[10px] text-white" />
                </button>
              </div>
            ))}
            {imageFiles.length < 9 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
              >
                <Icon name="image" className="text-lg" />
                <span className="text-[8px] mt-0.5">添加</span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleSelectImages} className="hidden" />
        </div>

        {/* 匿名开关 */}
        <label className="flex items-center justify-between bg-slate-50 rounded-lg p-3 cursor-pointer">
          <div>
            <span className="text-xs font-bold text-gray-600 block">匿名发布</span>
            <span className="text-[10px] text-gray-400">开启后仅显示"匿名同学"，不暴露院系</span>
          </div>
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          />
        </label>
      </div>
    </Modal>
  );
}
