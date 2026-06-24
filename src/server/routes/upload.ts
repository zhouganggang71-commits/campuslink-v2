import { Request, Response } from "express";
/**
 * 文件上传 + 安全校验
 */
import fs from 'fs';
import { limiter } from '../middleware/limiter';
import { auth } from '../middleware/auth';
import { ErrorCode } from '../errors';
import { logger } from '../../utils/logger';
import { ok, fail, badRequest } from '../response';

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
  app.post('/api/v1/upload', auth, limiter(10), upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return badRequest(res, '未选择文件');

      if (!validateImageMagic(req.file.path, req.file.mimetype)) {
        fs.unlink(req.file.path, () => {});
        logger.security('文件上传伪造类型', {
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
          size: req.file.size,
          ip: req.ip,
          trace_id: req._traceId,
        });
        return badRequest(res, '仅支持 JPG/PNG/WebP/GIF 格式图片');
      }

      const uid = (req as any).userId || 'anonymous';
      const url = `/campus/uploads/${uid}/${req.file.filename}`;
      logger.business('文件上传', {
        filename: req.file.filename,
        user: uid,
        size: req.file.size,
        mimetype: req.file.mimetype,
        trace_id: req._traceId,
      });
      ok(res, { url });
    } catch (err: any) {
      logger.error('文件上传失败', { error: err.message, trace_id: req._traceId });
      fail(res, 500, '上传失败');
    }
  });
}
