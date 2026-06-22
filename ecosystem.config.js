module.exports = {
  apps: [
    {
      name: 'campuslink',
      script: './dist/server.cjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        CAMPUSLINK_PORT: '3002',
        CAMPUSLINK_HOST: '127.0.0.1',
      },
      env_file: '.env',
      // 优雅关闭
      kill_timeout: 10000,
      listen_timeout: 3000,
      // 自动重启
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      // 日志
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
