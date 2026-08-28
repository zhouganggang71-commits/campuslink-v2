import { Request, Response } from 'express';
/**
 * 文件上传 + 安全校验 + 用户配额
 */
import fs from 'fs';
import { limiter } from '../middleware/limiter';
import { auth } from '../middleware/auth';
import { logger } from '../../utils/logger';
import { ok, fail, badRequest } from '../response';
import { pool } from '../db';

const DAILY_MAX_FILES = 20;
const DAILY_MAX_BYTES = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'ffd8',
  'image/png': '89504e47',
  'image/webp': '52494646',
  'image/gif': '47494638',
};

export function validateImageMagic(filePath: string, mimeType: string): boolean {
  const expected = ALLOWED_MIME[mimeType];
  if (!expected) return false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.toString('hex').startsWith(expected);
  } catch {
    return false;
  }
}

export function registerUploadRoutes(app: any, upload: any) {
  app.post('/api/v1/upload', auth, limiter(10), upload.array('file', 9), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const singleFile = req.file as Express.Multer.File | undefined;
      const allFiles = files && files.length > 0 ? files : singleFile ? [singleFile] : [];
      if (allFiles.length === 0) return badRequest(res, '未选择文件');

      const uid = (req as any).userId;

      // 每日配额检查
      if (uid) {
        const [[{ cnt }]]: any = await pool.query(
          'SELECT COUNT(*) AS cnt FROM upload_log WHERE user_id = ? AND DATE(created_at) = CURDATE()',
          [uid],
        );
        if (cnt + allFiles.length > DAILY_MAX_FILES) {
          logger.security('上传超配额(张数)', {
            user_id: uid,
            count: cnt,
            limit: DAILY_MAX_FILES,
            trace_id: req._traceId,
          });
          return fail(res, 429, `今日上传已达上限（${DAILY_MAX_FILES}张）`);
        }
        const [[{ total }]]: any = await pool.query(
          'SELECT COALESCE(SUM(size), 0) AS total FROM upload_log WHERE user_id = ? AND DATE(created_at) = CURDATE()',
          [uid],
        );
        const incomingTotal = allFiles.reduce((s, f) => s + f.size, 0);
        if (total + incomingTotal > DAILY_MAX_BYTES) {
          logger.security('上传超配额(容量)', {
            user_id: uid,
            total,
            incoming: incomingTotal,
            limit: DAILY_MAX_BYTES,
            trace_id: req._traceId,
          });
          return fail(res, 429, '今日上传容量已达上限（100MB）');
        }
      }

      const urls: string[] = [];

      for (const file of allFiles) {
        if (!validateImageMagic(file.path, file.mimetype)) {
          // 删除已上传的文件
          for (const f of allFiles) fs.unlink(f.path, () => {});
          logger.security('文件上传伪造类型', {
            mimetype: file.mimetype,
            originalname: file.originalname,
            size: file.size,
            ip: req.ip,
            trace_id: req._traceId,
          });
          return badRequest(res, '仅支持 JPG/PNG/WebP/GIF 格式图片');
        }
        const url = `/campus/uploads/${uid}/${file.filename}`;
        urls.push(url);
        // 记录上传日志（异步，不阻塞响应）
        if (uid) {
          pool
            .query('INSERT INTO upload_log (user_id, filename, size) VALUES (?, ?, ?)', [uid, file.filename, file.size])
            .catch(() => {});
        }
        logger.business('文件上传', {
          filename: file.filename,
          user: uid,
          size: file.size,
          mimetype: file.mimetype,
          trace_id: req._traceId,
        });
      }

      ok(res, { url: urls[0], urls });
    } catch (err: any) {
      logger.error('文件上传失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '上传失败');
    }
  });
}
