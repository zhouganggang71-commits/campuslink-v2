/**
 * 面交交易 API（R12 Phase 2）
 */
import { request } from './client';

export interface TransactionRow {
  id: number;
  post_id: number;
  seller_id: number;
  buyer_id: number;
  status: 'pending' | 'code_issued' | 'completed' | 'cancelled' | 'disputed';
  face_code: string | null;
  code_expires_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  post_title: string;
  post_price: number | null;
  post_images: string | null;
  other_name: string;
  other_avatar: string | null;
  my_role: 'seller' | 'buyer';
}

function toTx(r: TransactionRow) {
  return {
    id: r.id,
    postId: r.post_id,
    sellerId: r.seller_id,
    buyerId: r.buyer_id,
    status: r.status,
    faceCode: r.face_code,
    codeExpiresAt: r.code_expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    postTitle: r.post_title,
    postPrice: r.post_price,
    postImages: r.post_images ? JSON.parse(r.post_images) : null,
    otherName: r.other_name,
    otherAvatar: r.other_avatar,
    myRole: r.my_role,
  };
}

export const transactionsApi = {
  /** 买家发起面交 */
  create: (postId: number) =>
    request('POST', '/transactions', { postId }).then(
      (r: any) => r as { code: number; message?: string; data?: { id: number; status: string } },
    ),

  /** 我的交易 */
  mine: () =>
    request('GET', '/transactions/mine').then((r: any) => ({
      code: r.code,
      message: r.message,
      data: Array.isArray(r.data) ? r.data.map(toTx) : [],
    })),

  /** 卖家同意 + 生成面交码 */
  accept: (id: number) =>
    request('PUT', `/transactions/${id}/accept`).then(
      (r: any) =>
        r as { code: number; message?: string; data?: { faceCode?: string; expiresAt?: string; status?: string } },
    ),

  /** 卖家核销 */
  verify: (id: number, code: string) =>
    request('PUT', `/transactions/${id}/verify`, { code }).then(
      (r: any) => r as { code: number; message?: string; data?: { status?: string } },
    ),

  /** 取消 */
  cancel: (id: number) =>
    request('PUT', `/transactions/${id}/cancel`).then((r: any) => r as { code: number; message?: string }),

  /** 评价 */
  review: (id: number, rating: number, comment: string) =>
    request('POST', `/transactions/${id}/review`, { rating, comment }).then(
      (r: any) => r as { code: number; message?: string },
    ),

  /** 用户信誉 */
  reputation: (userId: number) =>
    request('GET', `/users/${userId}/reputation`).then((r: any) => r as { code: number; message?: string; data?: any }),
};
