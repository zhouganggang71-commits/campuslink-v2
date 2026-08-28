# CampusLink 运维手册

## 服务状态检查

```bash
# 登录 N100
ssh ubuntu@100.117.221.27  # Tailscale
# 或
ssh ubuntu@192.168.1.10    # 局域网

# 检查 PM2 状态
pm2 status

# 检查健康检查
curl http://localhost:3002/api/health

# 检查日志
tail -100 /home/ubuntu/app/campuslink/logs/app-$(date +%Y%m%d).log
```

## 常见故障排查

### 服务 502 / 无法访问

1. **FRP 隧道是否运行**（N100 → 阿里云）
   ```bash
   systemctl is-active frpc
   # 如果 stopped: sudo systemctl start frpc
   ```

2. **PM2 是否运行**
   ```bash
   pm2 status
   # 如果 stopped: pm2 start ecosystem.config.cjs
   ```

3. **阿里云 nginx 是否正常**（SSH 到 8.156.64.189）
   ```bash
   systemctl status nginx
   nginx -t && nginx -s reload
   ```

### 数据库故障

```bash
# 查看数据库连接
mysql -u campuslink -p -e "SHOW PROCESSLIST;"

# 恢复备份
cd /home/ubuntu/app/campuslink/backups
ls -t *.sql.enc | head -1  # 找到最新备份
openssl enc -aes-256-cbc -pbkdf2 -d -pass pass:$BACKUP_KEY -in <file> | mysql -u campuslink -p campuslink
```

### 磁盘空间不足

```bash
df -h
# 清理旧日志（7天自动清理已配置）
# 清理旧备份（保留最近7个）
cd /home/ubuntu/app/campuslink/backups && ls -t *.sql.enc | tail -n +8 | xargs rm
```

### 扫码登录卡住 / 浏览器崩溃

```bash
# 查看扫码会话数
grep "扫码" /home/ubuntu/app/campuslink/logs/app-$(date +%Y%m%d).log | tail -20

# 重启服务释放浏览器
pm2 restart campuslink
```

## 部署回滚

```bash
# 回滚数据库迁移
cd /home/ubuntu/app/campuslink
node dist/server.cjs rollback

# 从备份恢复
# 见上方"数据库故障"章节

# 回滚代码（git）
cd /home/ubuntu/app/campuslink
git log --oneline -5  # 找到要回滚到的 commit
git checkout <commit_hash>
pm2 restart campuslink
```

## 监控告警检验

- 健康检查: `curl http://localhost:3002/api/health?key=<ADMIN_KEY>`
- SSL 证书到期: 2026-08-17 (Let's Encrypt, 自动续期)
- 内存告警: PM2 日志中 watch `memory: rss`
