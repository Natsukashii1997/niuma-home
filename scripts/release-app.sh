#!/bin/bash
# 发布「牛马之家」本地应用（做法同数码世界）：把当前提交的 server、fixtures + 构建好的 dist 复制成固定快照，
# 由 launchd 常驻服务运行；之后改开发目录不影响正在用的版本。保留最近 5 份快照和当前运行版本，可回滚。
#
#   bash scripts/release-app.sh              在主工作区执行：备份数据库 → 生成新快照 → 切换服务
#   bash scripts/release-app.sh --use <快照名>   切回已有快照（回滚）
#
# 可用环境变量覆盖（验证时用一次性目录，不碰正式服务）：
#   NIUMA_BASE（默认 ~/Library/Application Support/NiumaHome）、NIUMA_LABEL、PORT、WORKDESK_DATA_DIR
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=${NIUMA_BASE:-"$HOME/Library/Application Support/NiumaHome"}
LABEL=${NIUMA_LABEL:-cn.niuma-home.server}
PORT=${PORT:-5280}
DATA_DIR=${WORKDESK_DATA_DIR:-"$ROOT/data"}
DIGIWORLD_DIR=${WORKDESK_DIGIWORLD_DIR:-"$(dirname "$ROOT")/personal-ai-workbench/data"}
NODE=$(command -v node)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SERVER_APP="$BASE/NiumaHomeServer.app"
URL="http://127.0.0.1:$PORT"

fail() { echo "发布中止：$*" >&2; exit 1; }

# 端口只能空着或由本服务占用，不抢别的进程
OWNER=$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN | head -1 || true)
if [ -n "$OWNER" ]; then
  JOB_PID=$(launchctl list | awk -v l="$LABEL" '$3 == l { print $1 }')
  [ "$OWNER" = "$JOB_PID" ] || fail "端口 $PORT 被其他进程占用（pid ${OWNER}），先停掉它再发布"
fi

if [ "${1:-}" = "--use" ]; then
  NAME=${2:?用法：--use <快照名>}
  REL="$BASE/releases/$NAME"
  [ -f "$REL/server/index.mjs" ] || fail "没有这个快照：$REL"
else
  [ -z "$(git -C "$ROOT" status --porcelain)" ] || fail "工作区有未提交改动，先提交再发布"
  NAME="nm-$(date +%Y%m%d-%H%M%S)-$(git -C "$ROOT" rev-parse --short HEAD)"
  REL="$BASE/releases/$NAME"
  [ ! -e "$REL" ] || fail "快照已存在：$REL"
  mkdir -p "$REL"
  # 用户策略在运行时读 docs/用户情况、docs/打法库，并引用 src/modules/user/playbook.js，须随快照带上
  git -C "$ROOT" archive HEAD server fixtures package.json docs/用户情况 docs/打法库 src/modules/user/playbook.js | tar -x -C "$REL"
  (cd "$ROOT" && npx vite build --outDir "$REL/dist" --emptyOutDir --logLevel warn)
  [ -f "$REL/dist/index.html" ] || fail "构建没有产出 dist/index.html"
fi

# 切换前备份真实数据库（新代码可能补表结构）
if [ -f "$DATA_DIR/work-desk.db" ]; then
  mkdir -p "$BASE/backups"
  sqlite3 "$DATA_DIR/work-desk.db" ".backup '$BASE/backups/work-desk-$(date +%Y%m%d-%H%M%S)-before-$NAME.db'"
fi

# 后台服务外壳：只在后台运行、不显示 Dock 图标，「登录项」里显示为「牛马之家服务」
mkdir -p "$SERVER_APP/Contents/MacOS"
cp "$NODE" "$SERVER_APP/Contents/MacOS/node"
cat > "$SERVER_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>牛马之家服务</string>
  <key>CFBundleName</key><string>牛马之家服务</string>
  <key>CFBundleExecutable</key><string>node</string>
  <key>CFBundleIdentifier</key><string>$LABEL</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF
codesign --force --sign - "$SERVER_APP" >/dev/null 2>&1

mkdir -p "$DATA_DIR/daemon-logs" "$(dirname "$PLIST")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>AssociatedBundleIdentifiers</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SERVER_APP/Contents/MacOS/node</string>
    <string>$REL/server/index.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$REL</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>WORKDESK_DATA_DIR</key><string>$DATA_DIR</string>
    <key>WORKDESK_DIGIWORLD_DIR</key><string>$DIGIWORLD_DIR</string>
    <key>PATH</key><string>$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$DATA_DIR/daemon-logs/server.stdout.log</string>
  <key>StandardErrorPath</key><string>$DATA_DIR/daemon-logs/server.stderr.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
RETENTION_FAILED=0
for _ in $(seq 20); do lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null || break; sleep 0.5; done
# 日志只在旧服务停止之后轮转，避免复制/清空期间仍有进程写入。
lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null && fail "服务仍占用端口 ${PORT}，未轮转日志或启动新版本"
if "$NODE" "$ROOT/scripts/release-retention.mjs" --base "$BASE" --data-dir "$DATA_DIR" --current-release "$REL" --scope logs --apply; then
  :
else
  RETENTION_STATUS=$?
  RETENTION_FAILED=1
  printf '日志保留策略失败（退出码 %s）；保留上述错误，继续启动并核对目标服务\n' "$RETENTION_STATUS" >&2
fi
launchctl bootstrap "gui/$(id -u)" "$PLIST"

# 回读：服务返回的首页必须和快照里的 dist/index.html 逐字节一致
for _ in $(seq 30); do curl -sf "$URL/" -o /dev/null && break; sleep 0.5; done
curl -sf "$URL/" | cmp -s - "$REL/dist/index.html" || fail "$URL 返回的首页和快照不一致，查看 $DATA_DIR/daemon-logs/server.stderr.log"
# 完整回读：进程与端口、全部构建文件、快照与提交、错误日志、版本号
NIUMA_LABEL="$LABEL" bash "$ROOT/scripts/verify-release.sh" "$NAME" || fail "服务已切换到 ${NAME}，但完整回读未通过（见上方 ✗），未清理旧快照；需要时用 --use <上一份快照名> 回滚"
# 只有目标版本通过运行回读，才清理历史产物；REL 是本次已确认在用的快照。
if "$NODE" "$ROOT/scripts/release-retention.mjs" --base "$BASE" --data-dir "$DATA_DIR" --current-release "$REL" --scope artifacts --apply; then
  :
else
  RETENTION_STATUS=$?
  RETENTION_FAILED=1
  printf '发布产物保留策略失败（退出码 %s）；保留上述错误及当前文件状态\n' "$RETENTION_STATUS" >&2
fi
if [ "$RETENTION_FAILED" -ne 0 ]; then
  printf '服务已切换但保留策略未完成：%s；%s（launchd %s）。请核对上方错误后处理维护项。\n' "$NAME" "$URL" "$LABEL" >&2
  exit 1
fi
echo "已切换到 ${NAME}：${URL}（launchd ${LABEL}）"
