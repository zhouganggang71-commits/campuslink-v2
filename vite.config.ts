import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';
import { mockContentsResponse } from './scripts/dev-mock-contents';

export default defineConfig(() => {
  return {
    base: '/campus/',
    plugins: [
      react(),
      tailwindcss(),
      {
        // dev-only 中间件：admin.html 重写 + 内容运营 mock（生产 build 产物不含）
        name: 'campuslink-dev-middleware',
        configureServer(server: any) {
          server.middlewares.use((req: any, res: any, next: any) => {
            if (req.url === '/campus/admin') {
              req.url = '/campus/admin.html';
            }
            next();
          });
          server.middlewares.use((req: any, res: any, next: any) => {
            if (req.url && req.url.startsWith('/campus/api/v1/contents')) {
              const m = mockContentsResponse(req.url);
              if (m) {
                res.statusCode = m.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(m.body));
                return;
              }
            }
            next();
          });
          // dev-only：本地预览封面图（/campus/dev-img/:file → scripts/dev-images/）
          server.middlewares.use((req: any, res: any, next: any) => {
            const m = req.url?.match(/^\/campus\/dev-img\/([a-zA-Z0-9._-]+)$/);
            if (!m) return next();
            const fp = path.join(__dirname, 'scripts/dev-images', m[1]);
            if (!fs.existsSync(fp)) {
              res.statusCode = 404;
              return res.end('not found');
            }
            const ext = path.extname(fp).toLowerCase();
            const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
            res.setHeader('Content-Type', type);
            res.setHeader('Cache-Control', 'no-cache');
            fs.createReadStream(fp).pipe(res);
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/campus/api': {
          target: 'https://jhcaishui.cn',
          changeOrigin: true,
          secure: true,
        },
        '/api': {
          target: 'https://jhcaishui.cn',
          changeOrigin: true,
          secure: true,
        },
        '/uploads': {
          target: 'https://jhcaishui.cn',
          changeOrigin: true,
          secure: true,
        },
        '/campus/uploads': {
          target: 'https://jhcaishui.cn',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
