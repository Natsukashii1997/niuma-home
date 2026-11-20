# 牛马之家工作台交接入口

更新：2026-11-20。工作区：`/Users/nat/Documents/ChatGPT/个人/work/niuma-home`，分支 `main`。

先读本文件 → `AGENTS.md` → `CURRENT.md`。第一次接手、或看不懂某个词指什么，再看 `GLOSSARY.md`（词汇表与代码地图，随 PR #78 加入）。当前用户明确授权的范围优先于历史分工与门禁；历史记录不能当成当前状态。

本文件只放长期有效的事实。每一轮做了什么、现在停在哪、唯一下一步，都在 CURRENT.md 顶部；改动的交接写在各自的 PR 里。

## 最新状态

最新一轮范围与发布状态以 CURRENT.md 顶部一节为准；正式快照号见该节「发布」与「回读」行，也可以直接跑 `bash scripts/verify-release.sh` 查看。本文件不写具体快照号，免得过时。

## 固定事实

- 真实数据库：`data/work-desk.db`。单测、构建和开发验证使用独立目录与端口，不把隔离通过等同正式采用。
- 飞书默认使用亚古兽 `lark-cli --profile cli_a965c429ef785bd3`（2026-11-02 起）；自言自语与 Codex 重置推送仍用猛鬼兽 `cli_a96f5f9ac63adcd4`；原机械邪龙兽 codex 不再使用。资源访问使用 user，带教评论可选 bot，推送使用 bot。不回退其他机器人。身份常量与调用记录见 `server/lark-identity.mjs`。
- 真实验证只操作本轮明确标记的临时内容，保留已有数据；未知写入先回读，不重复创建或重发。
- Chrome 收藏插件安装位置（2026-10-23 起）：`~/Library/Application Support/NiumaHome/extension/niuma-collect/`，内容来自主库 `browser-extension/niuma-collect/`。改主库插件后要手动同步到该目录，再在 `chrome://extensions` 重新加载；不要误认为改主库文件就自动改变已安装插件。此前安装在 `work-desk-t10`（已停用），10-22 改前备份在 `~/Library/Application Support/NiumaHome/evidence/niuma-legacy-20261022/extension-before/`。
- 验证证据（备份数据库、日志、截图原件）放 `~/Library/Application Support/NiumaHome/evidence/`，不放 `/tmp`；10-21 那批 `/tmp` 证据已被系统清理。

## 发布与收尾

运行脚本 `scripts/release-app.sh` 仅在本轮验证满足用户条件后使用。发布前备份与核对业务数据、确认没有未决写入；发布后核对首页与快照、关键接口、运行文件和数据保持一致。对本轮文件明确提交，保留既有无关未跟踪文件。

## 历史

- 2026-10-23 之前这份文件的原文（当时的「上一轮范围」「已完成事项与证据」）：[docs/history/HANDOFF-20261023.md](docs/history/HANDOFF-20261023.md)。
- 2026-10-15 的两份专题交接：[位图风 UI 改造（T09）](docs/history/HANDOFF-位图风UI.md)、[新增需求梳理](docs/history/HANDOFF-新增需求梳理.md)。里面的路径（`work-desk`）、身份和待办只属于当时。
- 更早的 ui-v3 交接：[docs/history/HANDOFF-ui-v3-20261016.md](docs/history/HANDOFF-ui-v3-20261016.md)。
