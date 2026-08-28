#!/bin/bash
set -e
N100="ubuntu@100.117.221.27"
# Tailscale SSH 握手较慢，2s 不够，用 8s 避免误 fallback 到内网地址
ssh -o ConnectTimeout=8 "$N100" "echo ok" 2>/dev/null || N100="ubuntu@192.168.1.10"
APP="/home/ubuntu/app/campuslink"
DIR="$APP/dist"
cd "$(dirname "$0")"

# ── 1/6 构建 ──
echo "=== 1/6 构建 ==="
rm -rf dist
npm run build
JS=$(ls dist/assets/index-*.js | head -1)
CSS=$(ls dist/assets/index-*.css | head -1)
echo "  JS: $(basename $JS) ($(wc -c < $JS | tr -d ' ') bytes)"
echo "  CSS: $(basename $CSS) ($(wc -c < $CSS | tr -d ' ') bytes)"
echo "  SRV: $(wc -c < dist/server.cjs | tr -d ' ') bytes"

# ── 2/6 上传代码 ──
# 根因排查过一次真实故障：之前是先把 assets/* 平铺 scp 到 dist/ 根目录，再靠 5/6 步骤里
# `mv *.js assets/`/`mv *.css assets/` 挪到 dist/assets/ 下——这两条 mv 后面跟着 2>/dev/null，
# 而且整段是一次性丢给远程 ssh 执行、没有 set -e，只要 mv 因为任何原因失败（比如 cwd 不对、
# glob 没匹配上），错误会被吞掉、脚本继续跑完 pm2 restart，最终效果是 index.html 引用的新哈希
# 文件名，实际根本没进 dist/assets/，浏览器请求 CSS/JS 直接 404。
# 现在直接把 assets 传到目标目录，不再依赖之后的 mv 重新归位，砍掉这一整类失败可能。
echo "=== 2/6 上传 ==="
# 先清空远程 assets/ 再传，避免旧哈希文件长期堆积；清空和上传在同一步完成，不再依赖后面单独的
# mv 命令去重新归位，减少"传完了但没归位"的中间状态
ssh "$N100" "rm -rf $DIR/assets && mkdir -p $DIR/assets"
scp dist/assets/* "$N100:$DIR/assets/"
scp dist/index.html dist/server.cjs dist/admin.html dist/disclaimer.html dist/logo.png "$N100:$DIR/"
# 上传 PWA 文件（manifest + 手写 service worker + 图标）
# ⚠️ 别加 registerSW.js/workbox-*.js——我们不是 vite-plugin-pwa 生成的 SW，这些文件不存在，
# scp 报错非零退出会被 set -e 直接杀掉整个脚本（2026-07-04 真实翻车过一次，卡死在 2/6）
scp dist/sw.js dist/manifest.webmanifest dist/pwa-192x192.png dist/pwa-512x512.png "$N100:$DIR/"
# 同步 package 文件（依赖变了自动装）
scp package.json package-lock.json "$N100:$APP/"
# 同步 .env（仅首次）
ssh "$N100" "test -f $APP/.env" 2>/dev/null || scp .env "$N100:$APP/"
# VAPID 密钥（Web Push）：远程 .env 缺就从本地补三行，幂等
ssh "$N100" "grep -q VAPID_PUBLIC_KEY $APP/.env" 2>/dev/null || grep '^VAPID_' .env | ssh "$N100" "cat >> $APP/.env"
  ssh "$N100" "mkdir -p $APP/migrations" && scp migrations/*.sql "$N100:$APP/migrations/"
# 同步 OCR 脚本
  ssh "$N100" "mkdir -p $APP/scripts" && scp scripts/ocr_schedule.py "$N100:$APP/scripts/"

# ── 3/6 安装依赖 ──
echo "=== 3/6 安装依赖 ==="
ssh "$N100" "
  cd $APP
  # 比对 package-lock.json，变了才 npm install
  if ! diff -q package-lock.json node_modules/.package-lock.sha 2>/dev/null; then
    npm install --production
    cp package-lock.json node_modules/.package-lock.sha
    echo '  依赖已更新'
    # 依赖变更时重新安装 Playwright 浏览器
    npx playwright install chromium 2>&1 || echo '  Playwright 浏览器安装跳过（非关键）'
  else
    echo '  依赖未变化，跳过'
  fi
  # 每次部署都确保系统依赖存在
  npx playwright install-deps chromium 2>/dev/null || true
"

# ── 4/6 备份数据库（加密） ──
echo "=== 4/6 备份数据库 ==="
BACKUP_KEY=$(grep ENCRYPTION_KEY .env | cut -d= -f2)
DB_PW=$(grep CAMPUSLINK_DB_PW .env | cut -d= -f2)
ssh "$N100" "
  mkdir -p $APP/backups
  export MYSQL_PWD='${DB_PW}'
  mysqldump -u campuslink campuslink | openssl enc -aes-256-cbc -pbkdf2 -pass pass:${BACKUP_KEY} -out $APP/backups/campuslink-\$(date +%Y%m%d-%H%M).sql.enc
  cd $APP/backups && ls -t *.sql.enc | tail -n +8 | xargs -r rm
  echo \"  备份完成: \$(ls -t *.sql.enc | head -1)\"
"

# ── 5/6 部署 ──
# assets 已经在 2/6 直接传到位了（sw.js 也在 2/6 单独传到 dist/ 根目录，不会被误放进 assets/），
# 这里不再需要事后用 mv 重新归位，只管重启进程
echo "=== 5/6 部署 ==="
ssh "$N100" "
  cd $DIR
  pm2 restart campuslink
  sleep 2
"

# ── 6/6 验证 ──
echo "=== 6/6 验证 ==="
HEALTH=$(ssh "$N100" "curl -s http://localhost:3002/api/health")
echo "  本地: $HEALTH"
PAGE=$(curl -sk -o /dev/null -w '%{http_code}' https://jhcaishui.cn/campus/)
echo "  公网: HTTP $PAGE"

if [ "$PAGE" = "200" ]; then
  echo "✅ 部署成功"
else
  echo "❌ 公网异常"
  exit 1
fi
