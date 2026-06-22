#!/bin/bash
set -e
N100="ubuntu@100.117.221.27"
ssh -o ConnectTimeout=2 "$N100" "echo ok" 2>/dev/null || N100="ubuntu@192.168.1.10"
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
echo "=== 2/6 上传 ==="
scp dist/assets/* dist/index.html dist/server.cjs dist/admin.html dist/disclaimer.html "$N100:$DIR/" 2>/dev/null
# 同步 package 文件（依赖变了自动装）
scp package.json package-lock.json "$N100:$APP/"
# 同步 .env（仅首次）
ssh "$N100" "test -f $APP/.env" 2>/dev/null || scp .env "$N100:$APP/"
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
  else
    echo '  依赖未变化，跳过'
  fi
"

# ── 4/6 备份数据库（加密） ──
echo "=== 4/6 备份数据库 ==="
BACKUP_KEY=$(grep ENCRYPTION_KEY .env | cut -d= -f2)
DB_PW=$(grep CAMPUSLINK_DB_PW .env | cut -d= -f2)
ssh "$N100" "
  mkdir -p $APP/backups
  mysqldump -u campuslink -p${DB_PW} campuslink | openssl enc -aes-256-cbc -pbkdf2 -pass pass:${BACKUP_KEY} -out $APP/backups/campuslink-\$(date +%Y%m%d-%H%M).sql.enc
  cd $APP/backups && ls -t *.sql.enc | tail -n +8 | xargs -r rm
  echo \"  备份完成: \$(ls -t *.sql.enc | head -1)\"
"

# ── 5/6 部署 ──
echo "=== 5/6 部署 ==="
ssh "$N100" "
  cd $DIR
  rm -rf assets
  mkdir assets
  mv *.js *.css assets/ 2>/dev/null
  pm2 restart campuslink
  sleep 2
"

# ── 6/6 验证 ──
echo "=== 6/6 验证 ==="
HEALTH=$(ssh "$N100" "curl -s http://localhost:3002/api/health")
echo "  本地: $HEALTH"
PAGE=$(curl -sk -o /dev/null -w '%{http_code}' https://8.156.64.189:8443/campus/)
echo "  公网: HTTP $PAGE"

if [ "$PAGE" = "200" ]; then
  echo "✅ 部署成功"
else
  echo "❌ 公网异常"
  exit 1
fi
