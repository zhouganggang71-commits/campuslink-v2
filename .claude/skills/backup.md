---
name: backup
description: 备份 CampusLink MySQL 数据库到本地，含加密和完整性校验
---

# CampusLink MySQL 备份

当用户说"备份 campus 数据库"、"备份校园"时执行。

## 数据库信息

| 项 | 值 |
|----|-----|
| 数据库 | `campuslink` |
| 主机 | `127.0.0.1:3306`（N100 本地） |
| 用户 | `campuslink` |
| 密码 | `yWw6qIvI6QCsA7IRRNnF` |
| 加密密钥 | `3fb2dd3e525a9258de7a28c9ca092da5` |

## 备份流程

### 第一步：通过 SSH 执行 mysqldump
```bash
# 先试 Tailscale，不行再内网
SSH_HOST="ubuntu@100.117.221.27"
# 或内网
SSH_HOST="ubuntu@192.168.1.10"

BACKUP_DIR="/Users/zhenggangzhou/campuslink-ui/backups/$(date +%Y%m%d_%H%M)"
mkdir -p "$BACKUP_DIR"

# 备份全库（结构+数据）
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 \
  "mysqldump -u campuslink -p'yWw6qIvI6QCsA7IRRNnF' --single-transaction --routines --triggers campuslink" \
  > "$BACKUP_DIR/campuslink_full.sql"

# 仅结构（无数据）
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 \
  "mysqldump -u campuslink -p'yWw6qIvI6QCsA7IRRNnF' --no-data campuslink" \
  > "$BACKUP_DIR/campuslink_schema.sql"
```

### 第二步：验证备份
```bash
# 检查文件大小（应该有内容）
wc -c "$BACKUP_DIR/campuslink_full.sql"
# 检查 SQL 是否以完整语句结束
tail -5 "$BACKUP_DIR/campuslink_full.sql"
# 预期最后一行是: -- Dump completed on YYYY-MM-DD
```

### 第三步：加密敏感备份
```bash
# 加密全量备份（含用户密码哈希等敏感数据）
python3 -c "
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
import os

key = bytes.fromhex('3fb2dd3e525a9258de7a28c9ca092da5')
iv = os.urandom(16)
cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
encryptor = cipher.encryptor()

with open('$BACKUP_DIR/campuslink_full.sql', 'rb') as f:
    data = f.read()

padder = padding.PKCS7(128).padder()
padded = padder.update(data) + padder.finalize()
encrypted = encryptor.update(padded) + encryptor.finalize()

with open('$BACKUP_DIR/campuslink_full.sql.enc', 'wb') as f:
    f.write(iv + encrypted)
print('encrypted:', len(encrypted), 'bytes')
"
```

### 第四步：备份敏感表单独导出
```bash
# 用户表（含密码哈希，最敏感）
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 \
  "mysqldump -u campuslink -p'yWw6qIvI6QCsA7IRRNnF' campuslink users refresh_tokens" \
  > "$BACKUP_DIR/campuslink_auth.sql"

# 加密字段表（注册信息含手机号）
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 \
  "mysqldump -u campuslink -p'yWw6qIvI6QCsA7IRRNnF' campuslink registrations" \
  > "$BACKUP_DIR/campuslink_registrations.sql"
```

### 第五步：保留 N100 本地备份
```bash
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 "
  mkdir -p /home/ubuntu/app/campuslink/backups/\$(date +%Y%m%d)
  mysqldump -u campuslink -p'yWw6qIvI6QCsA7IRRNnF' --single-transaction campuslink \
    > /home/ubuntu/app/campuslink/backups/\$(date +%Y%m%d)/campuslink_full.sql
  echo 'N100 backup done'
"
```

## 备份策略

- **每周**：完整备份（结构+数据）
- **部署前**：必须备份
- **改表前**：单独备份该表
- **保留**：本地保留最近 30 天，N100 保留最近 7 天

## 恢复

### 恢复整个数据库
```bash
SSH_HOST="ubuntu@100.117.221.27"
BACKUP_FILE="/Users/zhenggangzhou/campuslink-ui/backups/YYYYMMDD_HHMM/campuslink_full.sql"

scp -i ~/.ssh/id_ed25519 "$BACKUP_FILE" "$SSH_HOST:/tmp/restore.sql"
ssh "$SSH_HOST" -i ~/.ssh/id_ed25519 \
  "mysql -u campuslink -p'yWw6qIvI6QCsA7IRRNnF' campuslink < /tmp/restore.sql && rm /tmp/restore.sql"
```

### 恢复加密备份
```bash
python3 -c "
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding

key = bytes.fromhex('3fb2dd3e525a9258de7a28c9ca092da5')

with open('$BACKUP_FILE.enc', 'rb') as f:
    iv = f.read(16)
    encrypted = f.read()

cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
decryptor = cipher.decryptor()
padded = decryptor.update(encrypted) + decryptor.finalize()
unpadder = padding.PKCS7(128).unpadder()
data = unpadder.update(padded) + unpadder.finalize()

with open('$BACKUP_FILE', 'wb') as f:
    f.write(data)
print('decrypted to', '$BACKUP_FILE')
"
```

## 表清单（16 张表）

users, refresh_tokens, posts, favorites, registrations, categories, courses, ads, notices, feedbacks, circles, circle_posts, circle_likes, circle_comments, circle_favorites, _migrations
