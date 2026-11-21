#!/bin/bash
# 一次性：把正式数据目录从开发工作区的 data/ 搬到 ~/Library/Application Support/NiumaHome/data（#83）。
# 搬出去之后，工作区里 git clean、误删、别的会话的操作都碰不到正式数据。
#
#   bash scripts/move-data-dir.sh             只预览：从哪搬到哪、文件数和字节数、各库各表行数，不改任何东西
#   bash scripts/move-data-dir.sh --confirm   执行
#
# 执行的步骤（任何一步核对不过都会把服务按原样起回来，原目录不动）：
#   停服务 → 确认没有别的进程还开着库 → 备份主库到证据目录 → 整个目录复制到新位置 → 核对（文件数、总字节数、各库 quick_check、各表行数）
#   → 用当前快照重新生成服务配置（指向新目录）并启动、回读 → 原目录改名为 <原目录>.migrated-<日期>（不删）。
# 可用环境变量覆盖（演练时用一次性目录和标签，不碰正式服务）：NIUMA_BASE、NIUMA_LABEL、PORT、NIUMA_NEW_DATA_DIR
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=${NIUMA_BASE:-"$HOME/Library/Application Support/NiumaHome"}
LABEL=${NIUMA_LABEL:-cn.niuma-home.server}
PORT=${PORT:-5280}
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
TO=${NIUMA_NEW_DATA_DIR:-"$BASE/data"}
DOMAIN="gui/$(id -u)"

fail() { echo "迁移中止：$*" >&2; exit 1; }
plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST" 2>/dev/null; }

[ -f "$PLIST" ] || fail "找不到服务配置 $PLIST，不知道现在的数据目录在哪"
FROM=$(plist EnvironmentVariables:WORKDESK_DATA_DIR) || fail "服务配置里没有 WORKDESK_DATA_DIR"
SNAPSHOT=$(basename "$(plist WorkingDirectory)")
[ -f "$FROM/work-desk.db" ] || fail "现在的数据目录里没有主库：$FROM/work-desk.db"
if [ -d "$TO" ] && [ "$(cd "$FROM" && pwd -P)" = "$(cd "$TO" && pwd -P)" ]; then fail "数据目录已经在目标位置：$TO"; fi
case "$TO/" in "$FROM"/*) fail "目标目录不能放在现在的数据目录里面：$TO" ;; esac
[ -f "$BASE/releases/$SNAPSHOT/server/index.mjs" ] || fail "当前快照 $SNAPSHOT 不在 $BASE/releases/ 下，无法用它重新生成服务配置"
if [ -e "$TO" ] && [ -n "$(ls -A "$TO" 2>/dev/null)" ]; then fail "目标目录已存在且不为空，不覆盖：$TO"; fi
# 切换后的回读要求错误日志为空（verify-release.sh 第 5 项）；日志会原样带到新目录，所以停服务之前就拦下
[ ! -s "$FROM/daemon-logs/server.stderr.log" ] || fail "错误日志不为空，切换后的回读会不过；先看完并清空：$FROM/daemon-logs/server.stderr.log"

# 目录概况：文件个数、总字节数；各库各表行数（表名排序，一行一个）
summary() { find "$1" -type f ! -name '.DS_Store' -print0 | xargs -0 stat -f '%z' | awk '{ n++; s += $1 } END { printf "%d 个文件 %d 字节", n, s }'; }
rows() {
  for db in "$1"/*.db; do
    [ -f "$db" ] || continue
    for table in $(sqlite3 -readonly "$db" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"); do
      printf '%s %s %s\n' "$(basename "$db")" "$table" "$(sqlite3 -readonly "$db" "SELECT COUNT(*) FROM \"$table\";")"
    done
  done
}

echo "服务：$LABEL（端口 $PORT，当前快照 $SNAPSHOT）"
echo "从：$FROM"
echo "到：$TO"
echo "现状：$(summary "$FROM")"
if [ "${1:-}" != "--confirm" ]; then
  rows "$FROM" | awk '{ printf "  %s %s：%s 行\n", $1, $2, $3 }'
  echo "只预览，没有改动。执行：bash scripts/move-data-dir.sh --confirm（会停服务一两分钟）"
  exit 0
fi

EVIDENCE="$BASE/evidence/数据目录迁移-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$EVIDENCE"
MOVED="$FROM.migrated-$(date +%Y%m%d)"
[ ! -e "$MOVED" ] || fail "改名的目标已存在：$MOVED"

stop_service() {
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  # bootout 是异步的：等任务真的卸下、端口空出来再往下走（全局坑 G-18）
  for _ in $(seq 40); do
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null || return 0
    sleep 0.5
  done
  return 1
}
# 按原配置把服务起回来（核对不过时用）
restore_service() {
  for _ in 1 2 3; do launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null && return 0; sleep 2; done
  echo "服务没能自动起回来；配置没改，手动执行：launchctl bootstrap $DOMAIN \"$PLIST\"" >&2
  return 1
}
abort() { echo "迁移中止：$*" >&2; rm -rf "$TO"; restore_service || true; echo "原目录没有改动：$FROM；服务仍用它。" >&2; exit 1; }

echo "1/5 停服务"
stop_service || fail "服务没有停下来（端口 $PORT 仍被占用或任务仍在），没有做任何改动"
# 命令行脚本、开发服务也可能开着这些库；复制期间有人写入，两边就对不上
HOLDERS=$(lsof -t -- "$FROM"/*.db 2>/dev/null | sort -u | tr '\n' ' ' || true)
[ -z "$HOLDERS" ] || abort "还有进程开着数据库（pid ${HOLDERS% }），先停掉它们再迁移"

echo "2/5 备份主库到 $EVIDENCE"
sqlite3 "$FROM/work-desk.db" ".backup '$EVIDENCE/work-desk-before-move.db'" || abort "备份失败"
[ "$(sqlite3 -readonly "$EVIDENCE/work-desk-before-move.db" 'PRAGMA quick_check;' | head -1)" = "ok" ] || abort "备份文件 quick_check 不过"

echo "3/5 复制到新位置"
ditto "$FROM" "$TO" || abort "复制失败"

echo "4/5 核对"
summary "$FROM" > "$EVIDENCE/from-summary.txt"; summary "$TO" > "$EVIDENCE/to-summary.txt"
rows "$FROM" > "$EVIDENCE/from-rows.txt"; rows "$TO" > "$EVIDENCE/to-rows.txt"
cmp -s "$EVIDENCE/from-summary.txt" "$EVIDENCE/to-summary.txt" || abort "文件个数或总字节数对不上（$(cat "$EVIDENCE/from-summary.txt") / $(cat "$EVIDENCE/to-summary.txt")）"
cmp -s "$EVIDENCE/from-rows.txt" "$EVIDENCE/to-rows.txt" || abort "各表行数对不上，见 $EVIDENCE/from-rows.txt 和 to-rows.txt"
for db in "$TO"/*.db; do
  [ "$(sqlite3 -readonly "$db" 'PRAGMA quick_check;' | head -1)" = "ok" ] || abort "$(basename "$db") quick_check 不过"
done
echo "  一致：$(cat "$EVIDENCE/to-summary.txt")，$(wc -l < "$EVIDENCE/to-rows.txt" | tr -d ' ') 张表行数相同"

echo "5/5 用快照 $SNAPSHOT 重新生成服务配置（指向新目录）并启动"
if ! NIUMA_BASE="$BASE" NIUMA_LABEL="$LABEL" PORT="$PORT" WORKDESK_DATA_DIR="$TO" bash "$ROOT/scripts/release-app.sh" --use "$SNAPSHOT" > "$EVIDENCE/switch.log" 2>&1; then
  echo "切换到新目录失败（日志 $EVIDENCE/switch.log），改回原目录" >&2
  if NIUMA_BASE="$BASE" NIUMA_LABEL="$LABEL" PORT="$PORT" WORKDESK_DATA_DIR="$FROM" bash "$ROOT/scripts/release-app.sh" --use "$SNAPSHOT" > "$EVIDENCE/rollback.log" 2>&1; then
    rm -rf "$TO"
    echo "服务已改回原目录：$FROM；新目录已删掉，原目录没有改动。" >&2
  else
    # 服务这时可能正跑在任何一边，新目录先留着不删，免得把正在用的数据目录删掉
    echo "改回原目录也失败了（日志 $EVIDENCE/rollback.log）。数据都在：原目录 $FROM 没有改动，新目录 $TO 留着没删。" >&2
    echo "人工处理：看 $PLIST 里的 WORKDESK_DATA_DIR 指向哪边，再用 release-app.sh --use $SNAPSHOT 把服务起来。" >&2
  fi
  exit 1
fi
[ "$(plist EnvironmentVariables:WORKDESK_DATA_DIR)" = "$TO" ] || fail "服务已启动，但配置里的数据目录不是新位置，人工核对 $PLIST"

mv "$FROM" "$MOVED"
echo "完成。服务现在用：$TO"
echo "原目录已改名保留（没有删）：$MOVED"
echo "证据：$EVIDENCE"
echo "回退（会丢掉迁移之后的写入）：mv \"$MOVED\" \"$FROM\" && WORKDESK_DATA_DIR=\"$FROM\" bash scripts/release-app.sh --use $SNAPSHOT"
