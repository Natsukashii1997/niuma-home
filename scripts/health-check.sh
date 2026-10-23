#!/bin/bash
# 每日巡检（只读，不调用模型）：发布回读 7 项 + 数据库完整性 + 磁盘余量 + 距上次数据库备份的天数。
# 结果每次追加一行到 <NiumaHome>/evidence/health/<年-月>.log；只有未通过时才弹本机通知。
# 用法：
#   bash scripts/health-check.sh               跑一次
#   bash scripts/health-check.sh --install     装成 launchd 任务，每天 08:30 跑（在主工作区执行，任务指向本脚本所在目录）
#   bash scripts/health-check.sh --uninstall   卸载
# 可用 NIUMA_BASE、NIUMA_LABEL（被巡检的服务）、NIUMA_HEALTH_LABEL（巡检任务本身）覆盖，验证时用。
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=${NIUMA_BASE:-"$HOME/Library/Application Support/NiumaHome"}
LABEL=${NIUMA_LABEL:-cn.niuma-home.server}
HEALTH_LABEL=${NIUMA_HEALTH_LABEL:-cn.niuma-home.health}
HEALTH_PLIST="$HOME/Library/LaunchAgents/$HEALTH_LABEL.plist"
LOG_DIR="$BASE/evidence/health"
MIN_FREE_KB=$((5 * 1024 * 1024))
BACKUP_DAYS=7

if [ "${1:-}" = "--install" ]; then
  # launchd 直接用 /bin/bash 读不了「文稿」里的脚本（macOS 隐私保护，退出码 126）；
  # 借服务外壳 NiumaHomeServer.app 里的 node 来启动，沿用它的文件访问权限
  LAUNCHER="$BASE/NiumaHomeServer.app/Contents/MacOS/node"
  [ -x "$LAUNCHER" ] || { echo "找不到服务外壳 ${LAUNCHER}，先发布一次再安装" >&2; exit 1; }
  mkdir -p "$LOG_DIR" "$(dirname "$HEALTH_PLIST")"
  cat > "$HEALTH_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$HEALTH_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$LAUNCHER</string>
    <string>-e</string>
    <string>process.exit(require("node:child_process").spawnSync("/bin/bash", [process.argv[1]], { stdio: "inherit" }).status ?? 1)</string>
    <string>$ROOT/scripts/health-check.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NIUMA_BASE</key><string>$BASE</string>
    <key>NIUMA_LABEL</key><string>$LABEL</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$LOG_DIR/launchd.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/launchd.log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$HEALTH_LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HEALTH_PLIST" && echo "已安装 ${HEALTH_LABEL}：每天 08:30 跑 $ROOT/scripts/health-check.sh"
  exit
fi
if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$HEALTH_LABEL" 2>/dev/null || true
  rm -f "$HEALTH_PLIST"
  echo "已卸载 $HEALTH_LABEL"
  exit
fi

OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT
ok() { echo "✓ $*" >> "$OUT"; }
bad() { echo "✗ $*" >> "$OUT"; }

# 1. 发布回读 7 项（端口、数据目录从服务的 launchd 配置读）
NIUMA_LABEL="$LABEL" bash "$ROOT/scripts/verify-release.sh" >> "$OUT" 2>&1
SERVICE_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA_DIR=$([ -f "$SERVICE_PLIST" ] && /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:WORKDESK_DATA_DIR" "$SERVICE_PLIST" 2>/dev/null)
DB="$DATA_DIR/work-desk.db"

# 2. 数据库完整性（只读打开）
if [ -z "$DATA_DIR" ]; then bad "读不到服务的数据目录（$SERVICE_PLIST）"
elif [ ! -f "$DB" ]; then bad "找不到数据库：$DB"
else
  CHECK=$(sqlite3 -readonly "$DB" "PRAGMA quick_check;" 2>&1 | head -3 | tr '\n' ' ')
  [ "$CHECK" = "ok " ] && ok "数据库完整性 ok" || bad "数据库完整性检查不过：$CHECK"
fi

# 3. 数据所在磁盘的剩余空间
FREE_KB=$(df -Pk "${DATA_DIR:-$HOME}" 2>/dev/null | awk 'NR == 2 { print $4 }')
if [ -z "$FREE_KB" ]; then bad "读不到磁盘剩余空间"
elif [ "$FREE_KB" -lt "$MIN_FREE_KB" ]; then bad "磁盘只剩 $((FREE_KB / 1024 / 1024)) GB，低于 5 GB"
else ok "磁盘剩余 $((FREE_KB / 1024 / 1024)) GB"; fi

# 4. 数据库备份只在发布前做；太久没发布就没有新备份
if [ -n "$(find "$BASE/backups" -name 'work-desk-*.db' -mtime -"$BACKUP_DAYS" 2>/dev/null | head -1)" ]; then ok "$BACKUP_DAYS 天内有数据库备份"
else bad "超过 $BACKUP_DAYS 天没有数据库备份（只在发布前自动备份）"; fi

FAILS=$(grep '^✗' "$OUT")
COUNT=$(grep -c '^✗' "$OUT")
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/$(date +%Y-%m).log"
if [ "$COUNT" -eq 0 ]; then
  echo "$(date '+%F %H:%M')  通过" >> "$LOG"
  cat "$OUT"
  exit 0
fi
{ echo "$(date '+%F %H:%M')  未通过 $COUNT 项"; echo "$FAILS" | sed 's/^/    /'; } >> "$LOG"
cat "$OUT"
osascript - "未通过 $COUNT 项：$(echo "$FAILS" | head -1 | sed 's/^✗ //')" "明细见 $LOG" <<'EOF' >/dev/null
on run argv
  display notification (item 2 of argv) with title "牛马之家巡检" subtitle (item 1 of argv)
end run
EOF
exit 1
