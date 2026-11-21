#!/bin/bash
# 编译「牛马之家.app」（原生窗口壳，加载常驻服务的本地页面），装到 ~/Applications。
#   bash scripts/build-mac-app.sh
# 可用环境变量覆盖（验证时用）：NIUMA_URL（默认 http://127.0.0.1:5280/）、NIUMA_APP_DIR（默认 ~/Applications）
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
URL=${NIUMA_URL:-http://127.0.0.1:5280/}
DEST=${NIUMA_APP_DIR:-"$HOME/Applications"}
APP="$DEST/牛马之家.app"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/牛马之家.app/Contents/MacOS" "$WORK/牛马之家.app/Contents/Resources"
swiftc -O -o "$WORK/牛马之家.app/Contents/MacOS/NiumaHome" "$ROOT/desktop/macos/NiumaHome.swift"

# 应用图标：AppIcon-1024.png（由 scripts/make-icons.mjs 生成）缩成 iconset 再打包成 icns
mkdir -p "$WORK/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$ROOT/desktop/macos/AppIcon-1024.png" --out "$WORK/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$ROOT/desktop/macos/AppIcon-1024.png" --out "$WORK/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/AppIcon.iconset" -o "$WORK/牛马之家.app/Contents/Resources/AppIcon.icns"

cat > "$WORK/牛马之家.app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>牛马之家</string>
  <key>CFBundleDisplayName</key><string>牛马之家</string>
  <key>CFBundleIdentifier</key><string>cn.niuma-home.app</string>
  <key>CFBundleExecutable</key><string>NiumaHome</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>$(git -C "$ROOT" rev-parse --short HEAD)</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NiumaURL</key><string>$URL</string>
</dict>
</plist>
EOF
codesign --force --sign - "$WORK/牛马之家.app" >/dev/null 2>&1

mkdir -p "$DEST"
rm -rf "$APP"
mv "$WORK/牛马之家.app" "$APP"
touch "$APP"   # 让访达和程序坞刷新图标
echo "已生成 ${APP}（加载 ${URL}）"
