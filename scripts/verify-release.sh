#!/bin/bash
# 发布回读（只读，不重启、不写数据）：核对 launchd 正在跑的快照与提交、构建产物、错误日志是否一致。
# 用法：
#   bash scripts/verify-release.sh            核对 launchd 当前指向的快照
#   bash scripts/verify-release.sh <快照名>    并要求当前快照就是这一份（release-app.sh 发布 / 回滚后自动这样调用）
# 端口、数据目录一律从 launchd 配置读；NIUMA_LABEL 可指向隔离验证用的任务。本轮相关接口与页面仍须人工实看。
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
LABEL=${NIUMA_LABEL:-cn.niuma-home.server}
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
FAILED=0
ok() { echo "✓ $*"; }
bad() { echo "✗ $*"; FAILED=1; }
get() { /usr/libexec/PlistBuddy -c "Print :$1" "$PLIST" 2>/dev/null; }

[ -f "$PLIST" ] || { echo "✗ 找不到 launchd 配置：$PLIST"; exit 1; }
ENTRY=$(get ProgramArguments:1)
REL=${ENTRY%/server/index.mjs}
NAME=$(basename "$REL")
SHA=${NAME##*-}
PORT=$(get EnvironmentVariables:PORT)
DATA_DIR=$(get EnvironmentVariables:WORKDESK_DATA_DIR)
URL="http://127.0.0.1:$PORT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "回读 $LABEL → $NAME（$URL）"

# 1. launchd 指向这份快照，且正在跑的进程就是它
if [ -n "${1:-}" ] && [ "$1" != "$NAME" ]; then bad "launchd 指向 $NAME，不是要求的 $1"; else ok "launchd 指向 $NAME"; fi
[ -f "$ENTRY" ] && [ -f "$REL/dist/index.html" ] || bad "快照不完整：$REL"
PID=$(launchctl list | awk -v l="$LABEL" '$3 == l { print $1 }')
if [ -z "$PID" ] || [ "$PID" = "-" ]; then
  bad "launchd 任务没有在运行"
else
  [[ "$(ps -o command= -p "$PID")" == *"$ENTRY"* ]] && ok "运行中的进程 $PID 是这份快照" || bad "运行中的进程 $PID 不是这份快照"
  # 2. 只监听 127.0.0.1
  LISTEN=$(lsof -nP -a -p "$PID" -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { print $9 }' | sort -u | tr '\n' ' ')
  [ "$LISTEN" = "127.0.0.1:$PORT " ] && ok "端口 $PORT 只监听 127.0.0.1" || bad "端口 $PORT 监听不对：${LISTEN:-没有监听}"
fi

# 3. 服务返回的首页、JS、CSS 等构建产物与快照逐字节一致
TOTAL=0; DIFFS=()
while IFS= read -r file; do
  TOTAL=$((TOTAL + 1))
  curl -sf "$URL/$file" -o "$TMP/served" && cmp -s "$TMP/served" "$REL/dist/$file" || DIFFS+=("$file")
done < <(cd "$REL/dist" && find . -type f | sed 's|^\./||' | sort)
curl -sf "$URL/" -o "$TMP/served" && cmp -s "$TMP/served" "$REL/dist/index.html" || DIFFS+=("/")
[ ${#DIFFS[@]} -eq 0 ] && ok "首页与 $TOTAL 个构建文件与快照一致" || bad "与快照不一致：${DIFFS[*]}"

# 4. 快照里的源码文件与提交一致
if ! git -C "$ROOT" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  bad "仓库里找不到提交 $SHA"
else
  TOTAL=0; DIFFS=()
  while IFS= read -r file; do
    TOTAL=$((TOTAL + 1))
    git -C "$ROOT" cat-file blob "$SHA:$file" 2>/dev/null | cmp -s - "$REL/$file" || DIFFS+=("$file")
  done < <(cd "$REL" && find . -type f -not -path './dist/*' | sed 's|^\./||' | sort)
  [ ${#DIFFS[@]} -eq 0 ] && ok "快照 $TOTAL 个源码文件与提交 $SHA 一致" || bad "快照与提交 $SHA 不一致：${DIFFS[*]}"
fi

# 5. 错误日志为空
LOG="$DATA_DIR/daemon-logs/server.stderr.log"
if [ -s "$LOG" ]; then bad "错误日志不为空（$(wc -l < "$LOG" | tr -d ' ') 行）：$LOG"; tail -3 "$LOG" | sed 's/^/    /'; else ok "错误日志为空"; fi

# 6. 页脚版本号：构建时写进 JS 的提交号就是快照的提交号
grep -qF "\"$SHA\"" "$REL"/dist/assets/*.js 2>/dev/null && ok "版本号 $SHA 已写进构建" || bad "构建里找不到版本号 $SHA"

# 7（可选）. 页面冒烟：NIUMA_SMOKE=1 时用本机 Chrome 只读打开全部路由（不点任何写操作），截图到证据目录
if [ -n "$NIUMA_SMOKE" ]; then
  SMOKE_OUT="${NIUMA_SMOKE_OUT:-$HOME/Library/Application Support/NiumaHome/evidence/smoke-$NAME}"
  if node "$(dirname "$0")/smoke-pages.mjs" --base "$URL" --out "$SMOKE_OUT"; then ok "页面冒烟通过（$SMOKE_OUT）"; else bad "页面冒烟未通过（$SMOKE_OUT）"; fi
fi

echo "· 人工：本轮相关接口与页面仍须实看（NIUMA_SMOKE=1 可先跑一遍只读冒烟）"
[ "$FAILED" -eq 0 ] && echo "回读通过：$NAME" || { echo "回读未通过：$NAME" >&2; exit 1; }
