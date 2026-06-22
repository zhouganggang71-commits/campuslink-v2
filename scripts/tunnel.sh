#!/bin/bash
# 自动选路连接 N100 MySQL 隧道
# 用法: bash scripts/tunnel.sh
set -e

LOCAL_PORT=3307
REMOTE_PORT=3306
LAN="ubuntu@192.168.1.10"
TAIL="ubuntu@100.117.221.27"

# 杀掉旧隧道
lsof -ti :$LOCAL_PORT 2>/dev/null | xargs kill 2>/dev/null || true

# 优先走内网（快），不通走 Tailscale
echo "正在连接 N100..."
if ssh -o ConnectTimeout=2 -o BatchMode=yes "$LAN" "echo ok" 2>/dev/null; then
  HOST="$LAN"
  echo "使用内网直连"
else
  HOST="$TAIL"
  echo "使用 Tailscale 中转"
fi

ssh -f -N -L ${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT} -o ServerAliveInterval=60 -o ServerAliveCountMax=3 "$HOST"
echo "隧道已建立: 127.0.0.1:$LOCAL_PORT → N100 MySQL"
echo "关闭命令: lsof -ti :$LOCAL_PORT | xargs kill"
