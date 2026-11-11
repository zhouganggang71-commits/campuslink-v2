---
name: deploy
description: CampusLink 部署到 N100 生产环境，构建→上传→备份→重启→验证
---

# CampusLink 部署 SOP

当用户说"部署 campus"、"上线校园"时执行。

## 部署流程

### 方式一：deploy.sh（推荐）
```bash
cd /Users/zhenggangzhou/Desktop/04_CampusLink/campuslink-v2 && bash deploy.sh
```
脚本自动完成：构建→上传→备份加密→装依赖→重启→验证。

### 方式二：手动分步（deploy.sh 失败时）

#### 1. 本地构建
```bash
cd /Users/zhenggangzhou/Desktop/04_CampusLink/campuslink-v2
npm run build    # vite + esbuild
npm run check    # tsc + eslint + prettier
```

#### 2. 推送到 N100
先试 Tailscale，不行再内网：
```bash
# Tailscale（优先）
SSH_HOST="ubuntu@100.117.221.27"
# 内网
SSH_HOST="ubuntu@192.168.1.10"

scp -i ~/.ssh/id_ed25519 dist/index.html dist/server.cjs "$SSH_HOST:/home/ubuntu/app/campuslink/dist/"
scp -i ~/.ssh/id_ed25519 -r dist/assets "$SSH_HOST:/home/ubuntu/app/campuslink/dist/"
```

#### 3. 验证传输大小
```bash
ls -la dist/server.cjs
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 "wc -c /home/ubuntu/app/campuslink/dist/server.cjs"
```
两端大小必须一致。

#### 4. 安装依赖（如有新增）
```bash
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 "cd /home/ubuntu/app/campuslink && npm install --production"
```

#### 5. 重启并验证
```bash
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 "pm2 restart campuslink --update-env && sleep 2 && curl -s http://localhost:3002/api/v1/health"
```
期望返回 `{"code":0,"message":"ok"}`。

#### 6. 公网验证
```bash
curl -s -o /dev/null -w '%{http_code}' https://jhcaishui.cn/campus/api/v1/health
```

## 如果修改了 nginx/Apache 配置

每次修改后 reload 并验证：
```bash
# 阿里云 nginx
ssh root@8.156.64.189 -i ~/.ssh/id_ed25519 "nginx -t && nginx -s reload"
# 阿里云 Apache
ssh root@8.156.64.189 -i ~/.ssh/id_ed25519 "systemctl reload httpd"
# 验证
curl -s -o /dev/null -w '%{http_code}' https://jhcaishui.cn/campus/api/v1/health
```

## 部署后检查
```bash
# 检查 N100 服务状态
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 "pm2 status"
# 看最近错误日志
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 "tail -20 /home/ubuntu/app/campuslink/logs/error-\$(date +%Y-%m-%d).log"
```

## 关键路径速查

| 项 | 值 |
|----|-----|
| 本地项目 | `/Users/zhenggangzhou/Desktop/04_CampusLink/campuslink-v2/` |
| N100 项目 | `/home/ubuntu/app/campuslink/` |
| PM2 进程 | `campuslink` |
| 内网端口 | `http://192.168.1.10:3002/` |
| 公网地址 | `https://jhcaishui.cn/campus/` |
| N100 SSH (Tailscale) | `ubuntu@100.117.221.27` |
| N100 SSH (内网) | `ubuntu@192.168.1.10` |
| 阿里云 SSH | `root@8.156.64.189` |
| SSH 密钥 | `~/.ssh/id_ed25519` |
| GitHub | `zhouganggang71-commits/campuslink-ui` |
