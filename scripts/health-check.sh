#!/bin/bash
# 每日巡检（不调用模型）：发布回读 7 项 + 数据库完整性 + 磁盘余量 + 每日数据库备份（写后回读，只保留 7 份）+ 内部原声每周拉取（开着才查）+ 昨天有没有巡检记录。
# 不碰数据，只写 <NiumaHome>/backups/ 的每日备份和 evidence/health/ 的日志。
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
KEEP_DAILY=7

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
# launchd 把每次输出追加到 launchd.log；超过 500 行就只留最近 300 行（原地截断，不换文件，正在追加的句柄不受影响）
LAUNCHD_LOG="$LOG_DIR/launchd.log"
if [ -f "$LAUNCHD_LOG" ] && [ "$(wc -l < "$LAUNCHD_LOG")" -gt 500 ]; then tail -n 300 "$LAUNCHD_LOG" > "$OUT" && cat "$OUT" > "$LAUNCHD_LOG"; : > "$OUT"; fi
ok() { echo "✓ $*" >> "$OUT"; }
bad() { echo "✗ $*" >> "$OUT"; }

# 1. 发布回读 7 项（端口、数据目录从服务的 launchd 配置读）
NIUMA_LABEL="$LABEL" bash "$ROOT/scripts/verify-release.sh" >> "$OUT" 2>&1
SERVICE_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA_DIR=$([ -f "$SERVICE_PLIST" ] && /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:WORKDESK_DATA_DIR" "$SERVICE_PLIST" 2>/dev/null)
DB="$DATA_DIR/work-desk.db"

# 2. 数据库完整性（只读打开）
if [ -z "$DATA_DIR" ]; then bad "读不到服务的数据目录（${SERVICE_PLIST}）"
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

# 4. 每日备份：发布前的备份只在发布时做，一周不发布就没有新备份，所以巡检自己做一份。
#    写后回读（quick_check），只保留最近 KEEP_DAILY 份；发布保留策略不认这个文件名，得自己清。
if [ -f "$DB" ]; then
  DAILY="$BASE/backups/work-desk-$(date +%Y%m%d)-daily.db"
  mkdir -p "$BASE/backups"
  if [ -f "$DAILY" ] || sqlite3 "$DB" ".backup '$DAILY'" >> "$OUT" 2>&1; then
    CHECK=$(sqlite3 -readonly "$DAILY" "PRAGMA quick_check;" 2>&1 | head -1)
    [ "$CHECK" = "ok" ] && ok "每日备份 $(basename "$DAILY") 回读 ok" || bad "每日备份回读不过：$CHECK"
    ls "$BASE/backups"/work-desk-*-daily.db 2>/dev/null | sort -r | tail -n +"$((KEEP_DAILY + 1))" | while IFS= read -r old; do rm -f "$old"; done
  else bad "每日备份失败：$DAILY"; fi
fi

# 5. 内部原声自动拉取（设置里开着才查）：最近 8 天要有一次完整成功（done）的每周拉取，不然定时没跑、或一直有会话拉不下来也没人知道
if [ -f "$DB" ] && [ "$(sqlite3 -readonly "$DB" "SELECT value FROM settings WHERE key='internal_voice_auto';" 2>/dev/null)" = "1" ]; then
  VOICE_DB="$DATA_DIR/internal-voice.db"; [ -f "$VOICE_DB" ] || VOICE_DB="$DB" # 会话表已拆到单独的库（#82）；还没迁移时仍在主库
  WEEKLY=$(sqlite3 -readonly "$VOICE_DB" "SELECT range_from || ' 至 ' || range_to || '（' || state || '）' FROM chat_pull_runs WHERE trigger='weekly' AND state='done' AND finished_at >= strftime('%Y-%m-%dT%H:%M:%S','now','-8 days') ORDER BY id DESC LIMIT 1;" 2>/dev/null)
  [ -n "$WEEKLY" ] && ok "内部原声每周拉取：$WEEKLY" || bad "内部原声 8 天内没有完整成功的每周拉取（失败或有会话没拉到），看 /api/v3/internal-voice/status"
fi

# 6. 昨天有没有巡检记录：巡检自己没跑（launchd 停了、路径变了）也得有人知道。首次运行之前没有记录，不查。
YDAY=$(date -v-1d +%F)
if grep -qs "^$YDAY " "$LOG_DIR/${YDAY%-??}.log"; then ok "昨天（${YDAY}）有巡检记录"
elif [ -z "$(cat "$LOG_DIR"/20[0-9][0-9]-[0-9][0-9].log 2>/dev/null | awk -v y="$YDAY" '$1 < y' | head -1)" ]; then ok "首次运行，不查昨天的记录"
else bad "昨天（${YDAY}）没有巡检记录，launchd 可能没跑；看 $LAUNCHD_LOG"; fi

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
