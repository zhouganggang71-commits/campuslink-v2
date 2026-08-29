#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 川财CampusLink 管理后台一键通道（Mac 上用）
# 用法:
#   bash scripts/admin-tunnel.sh          # 开隧道并打开后台（自动清理旧隧道）
#   bash scripts/admin-tunnel.sh stop     # 关闭隧道
#   bash scripts/admin-tunnel.sh status   # 查看隧道状态
#
# 原理: SSH 本地转发 N100:3002 → 本机:3002
#      管理后台已改为 IP 白名单（127.0.0.1/内网/Tailscale），
#      隧道来源是本机回环，自动放行，无需密钥。
# ═══════════════════════════════════════════════════════════════
set -e

HOST="ubuntu@100.117.221.27"        # N100（Tailscale）
REMOTE_PORT=3002
LOCAL_PORT=3002
ADMIN_URL="http://127.0.0.1:${LOCAL_PORT}/admin"

case "${1:-}" in
  stop)
    echo "→ 关闭隧道..."
    pids=$(lsof -tiTCP:${LOCAL_PORT} -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
      kill $pids 2>/dev/null || true
      echo "  已关闭进程: $pids"
    else
      echo "  没有在运行的隧道"
    fi
    exit 0
    ;;
  status)
    if lsof -iTCP:${LOCAL_PORT} -sTCP:LISTEN >/dev/null 2>&1; then
      echo "✓ 隧道运行中 → ${ADMIN_URL}"
      curl -s -o /dev/null -w "  后台页面: HTTP %{http_code}\n" "${ADMIN_URL}" 2>/dev/null || true
    else
      echo "✗ 隧道未运行（先执行 bash scripts/admin-tunnel.sh）"
    fi
    exit 0
    ;;
esac

# ── 开隧道 ──
echo "→ 检查是否已有隧道..."
if lsof -iTCP:${LOCAL_PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  已有隧道占用 ${LOCAL_PORT}，直接打开后台"
else
  echo "→ 建立 SSH 隧道 ${HOST}:${REMOTE_PORT} → 本机:${LOCAL_PORT} ..."
  ssh -f -N -L ${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT} "${HOST}"
  sleep 1
fi

# ── 验证 + 打开浏览器 ──
if curl -s -o /dev/null "${ADMIN_URL}"; then
  echo "✓ 后台就绪: ${ADMIN_URL}"
  open "${ADMIN_URL}"
else
  echo "✗ 后台未响应，检查 N100 是否在线: ssh ${HOST}"
  exit 1
fi
