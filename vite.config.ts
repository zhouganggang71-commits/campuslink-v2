import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/campus/',
    plugins: [react(), tailwindcss()],
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
          target: 'https://8.156.64.189:8443',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'https://8.156.64.189:8443',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: 'https://8.156.64.189:8443',
          changeOrigin: true,
          secure: false,
        },
        '/campus/uploads': {
          target: 'https://8.156.64.189:8443',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    // 管理后台独立页面 — dev 模式直接返回 admin.html
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/campus/admin') {
          req.url = '/campus/admin.html';
        }
        next();
      });
    },
  };
});
