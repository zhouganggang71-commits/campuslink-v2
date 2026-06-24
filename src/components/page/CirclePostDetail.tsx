import { useEffect, useState, useCallback, lazy, Suspense, useRef } from 'react';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import { getToken } from '../../utils/api';
import { circlesApi, uploadApi } from '../../api';
import { timeAgo } from '../../utils/time';
import type { CirclePost } from '../../hooks/useCircles';

const ProfilePage = lazy(() => import('./ProfilePage'));

interface CommentItem {
  id: number;
  post_id: number;
  parent_id: number | null;
  content: string;
  image_url?: string | null;
  created_at: string;
  nickname: string;
  auth_status: string;
  replies?: CommentItem[];
}

interface CirclePostDetailProps {
  post: CirclePost;
  onBack: () => void;
  onLike: (postId: number) => Promise<boolean>;
  onSave: (postId: number) => void;
  isSaved: boolean;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export default function CirclePostDetail({ post, onBack, onLike, onSave, isSaved, showToast }: CirclePostDetailProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState(post.like_count);
  const [showProfile, setShowProfile] = useState(false);
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const displayName = post.is_anonymous ? '匿名同学' : post.nickname;
  const images = Array.isArray(post.images) ? post.images : [];
  const tags = Array.isArray(post.tags) ? post.tags : [];

  const loadComments = useCallback(() => {
    setLoading(true);
    circlesApi.getComments(post.id)
      .then((res) => {
        if (res.code === 0 && Array.isArray(res.data)) setComments(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [post.id]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleSubmitComment = async () => {
    const txt = commentText.trim();
    if (!txt && !commentImage) return;
    if (!getToken()) { showToast('请先登录'); return; }
    setSubmitting(true);
    try {
      const body: any = { content: txt || '📷' };
      if (replyTo) body.parent_id = replyTo.id;
      if (commentImage) body.image_url = commentImage;
      const res = await circlesApi.comment(post.id, body.content, body.parent_id, body.image_url);
      if (res.code === 0) {
        setCommentText('');
        setCommentImage(null);
        setReplyTo(null);
        showToast('评论已发布');
        loadComments();
      } else {
        showToast(res.message || '评论失败', 'info');
      }
    } catch { showToast('评论失败', 'info'); }
    setSubmitting(false);
  };

  // 图片压缩（Canvas → JPEG，max 1920px）
  const compressImage = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas 不可用')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('转换失败')), 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('请选择图片文件'); return; }
    setImageUploading(true);
    try {
      // HEIC 转 JPEG / >1MB 自动压缩
      const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic');
      if (isHeic || file.size > 1 * 1024 * 1024) {
        file = new File([await compressImage(file)], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
      }
      const form = new FormData();
      form.append('file', file);
      const res = await uploadApi.uploadImage(form) as any;
      if (res.code === 0 && res.data?.url) {
        setCommentImage(res.data.url);
      } else {
        showToast(res.message || '上传失败');
      }
    } catch { showToast('上传失败'); }
    setImageUploading(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleLikeClick = async () => {
    if (!getToken()) { showToast('请先登录'); return; }
    const ok = await onLike(post.id);
    if (ok) setLocalLikeCount((c) => c + 1);
  };

  return (
    <div className="flex flex-col flex-1 animate-fade-in bg-white">
      {/* 顶栏 */}
      <header className="px-4 py-3 flex items-center gap-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button onClick={onBack} className="text-gray-500 hover:bg-gray-100 p-2 rounded-full active:scale-95 cursor-pointer shrink-0">
          <Icon name="arrow_back" />
        </button>
        <h2 className="font-headline text-sm font-bold text-on-surface">帖子详情</h2>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* 用户信息 */}
        <div
          className={`px-4 py-3 flex items-center gap-3 ${!post.is_anonymous ? 'cursor-pointer touch-manipulation select-none' : ''}`}
          onClick={() => { if (!post.is_anonymous) setShowProfile(true); }}
        >
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <Icon name="person" className="text-lg text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">{displayName}</span>
              {!post.is_anonymous && post.auth_status === 'verified' && (
                <Icon name="verified" className="text-[10px] text-course-green" />
              )}
            </div>
            <span className="text-[10px] text-gray-400">{timeAgo(post.created_at)}</span>
          </div>
          {post.is_anonymous ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-gray-400">匿名</span>
          ) : (
            <Icon name="chevron_right" className="text-gray-300 text-sm shrink-0" />
          )}
        </div>

        {/* 内容 */}
        <div className="px-4 pb-2">
          <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{post.content}</p>
        </div>

        {/* 图片 */}
        {images.length > 0 && (
          <div className="px-4 pb-3">
            <div className={`grid gap-1.5 ${images.length === 1 ? '' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {images.slice(0, 9).map((url, i) => (
                <div key={i} className="aspect-square rounded-lg overflow-hidden bg-slate-100">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 标签 */}
        {tags.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-primary">{tag}</span>
            ))}
          </div>
        )}

        {/* 互动栏 */}
        <div className="px-4 py-3 flex items-center gap-5 border-y border-gray-50">
          <button onClick={handleLikeClick} className="flex items-center gap-1 text-sm text-gray-500 hover:text-course-red transition-colors cursor-pointer">
            <Icon name="favorite" className="text-base" />
            <span className="text-xs">{localLikeCount || 0}</span>
          </button>
          <span className="flex items-center gap-1 text-sm text-gray-400">
            <Icon name="chat" className="text-base" />
            <span className="text-xs">{comments.length}</span>
          </span>
          <button onClick={() => onSave(post.id)} className={`flex items-center gap-1 text-sm cursor-pointer transition-colors ml-auto ${isSaved ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
            <Icon name="bookmark" className="text-base" />
          </button>
        </div>

        {/* 评论区 */}
        <div className="px-4 py-3">
          <h3 className="text-xs font-bold text-gray-600 mb-3">
            评论 {comments.length > 0 && `(${comments.length})`}
          </h3>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center py-8 text-[11px] text-gray-400">暂无评论，来说两句吧</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id}>
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon name="person" className="text-xs text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-gray-700">{c.nickname}</span>
                        <span className="text-[9px] text-gray-400">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{c.content}</p>
                      {c.image_url && (
                        <img src={c.image_url} alt="" className="mt-1.5 w-15 h-15 rounded-lg object-cover border border-gray-100" referrerPolicy="no-referrer" />
                      )}
                      <button
                        onClick={() => setReplyTo({ id: c.id, name: c.nickname })}
                        className="text-[10px] text-gray-400 hover:text-primary mt-1 cursor-pointer"
                      >
                        回复
                      </button>
                    </div>
                  </div>
                  {/* 嵌套回复 */}
                  {c.replies && c.replies.length > 0 && (
                    <div className="ml-9 mt-2 space-y-2 pl-3 border-l-2 border-gray-100">
                      {c.replies.map((r) => (
                        <div key={r.id} className="flex gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <Icon name="person" className="text-[10px] text-gray-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-semibold text-gray-600">{r.nickname}</span>
                              <span className="text-[9px] text-gray-400">{timeAgo(r.created_at)}</span>
                            </div>
                            <p className="text-[11px] text-gray-600 mt-0.5">{r.content}</p>
                            {r.image_url && (
                              <img src={r.image_url} alt="" className="mt-1.5 w-12 h-12 rounded-lg object-cover border border-gray-100" referrerPolicy="no-referrer" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 个人主页 */}
      {showProfile && (
        <Suspense fallback={<div className="flex items-center justify-center flex-1"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mt-20" /></div>}>
          <ProfilePage
            userId={post.user_id || 0}
            onBack={() => setShowProfile(false)}
            placeholder={{
              name: post.nickname || '',
              avatar: '',
              isVerified: post.auth_status === 'verified',
            }}
          />
        </Suspense>
      )}

      {/* 评论输入 */}
      <div className="border-t border-gray-100 px-4 py-3 bg-white">
        {replyTo && (
          <div className="flex items-center gap-1 mb-2 text-[10px] text-gray-500">
            回复 <span className="font-semibold text-primary">{replyTo.name}</span>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer ml-1">
              <Icon name="close" className="text-[10px]" />
            </button>
          </div>
        )}
        {/* 图片预览 */}
        {commentImage && (
          <div className="mb-2 relative inline-block">
            <img src={commentImage} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" referrerPolicy="no-referrer" />
            <button
              onClick={() => setCommentImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
            >
              <Icon name="close" className="text-[10px]" />
            </button>
          </div>
        )}
        {imageUploading && (
          <div className="mb-2 flex items-center gap-2 text-[10px] text-gray-400">
            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            上传中...
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }}
            placeholder={replyTo ? `回复 ${replyTo.name}...` : '写评论...'}
            maxLength={500}
            className="flex-1 bg-slate-50 border border-gray-200 rounded-full px-4 py-2 text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary focus:outline-none"
          />
          <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={imageUploading}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-gray-400 hover:bg-slate-200 hover:text-gray-600 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            aria-label="添加图片"
          >
            <Icon name="camera" className="text-sm" />
          </button>
          <Button variant="primary" size="sm" onClick={handleSubmitComment} disabled={(!commentText.trim() && !commentImage) || submitting}>
            {submitting ? '...' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  );
}
