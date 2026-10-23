# 开发实录与坑

踩过的坑记在这里，Claude 和 Codex 都读。排障、发布、改样式或改脚本之前，先搜一遍：`grep -n 关键词 docs/LESSONS.md`。

## 怎么写

- 每轮交接时自问「本轮踩到新坑了吗」：有就在下面追加一条，并在 CURRENT.md 的交接里写「本轮新坑：L-xx」；没有就写「无」。
- 一条一个坑，编号只增不改。写现象、根因、正确做法、证据。证据写到能查的程度（提交号、文件与章节、证据目录）；查不到就写「未核实」，不编。
- 结论被推翻时改条目并注明日期，不删。

## 怎么升级

- 同类坑第 2 次出现：把正确做法写进 AGENTS.md、docs/OPERATIONS.md 或 docs/STYLE-GUIDE.md（一句话硬约束进 AGENTS.md，操作细节进 OPERATIONS.md），条目的「升级」改成写到了哪里。
- 能用机器判定的：写成测试或脚本（如 `tests/style-rules.test.mjs`、`scripts/verify-release.sh`），条目注明。
- 条目超过约 30 条时整理一次：已升级、且之后没再犯的，归档到 `docs/history/`。每周五的定时整理提案（见 docs/OPERATIONS.md「每周整理」）会提醒漏记、该升级和该归档的条目。

---

## L-01 改界面时把原有强调色改没了（2026-10-18）

- 现象：改 Codex 重置横条时，「已重置」状态下的橙色底线、图标、时间全变成黑色，用户明确不满。
- 根因：把高亮条件从「有新信号」改成「有新信号且等待重置」，连带改掉了已重置状态的样式。
- 正确做法：只动用户点名的部分；改已有组件前先看清会影响哪些 className、条件、颜色；改完对照改前截图逐项核对颜色与强调。
- 证据：用户 2026-10-18 当面反馈（原记在 Claude 记忆）；对应提交未核实。
- 升级：已写进 AGENTS.md「分工」。

## L-02 验证证据放在 /tmp，被系统清理（2026-10-21 丢失，10-23 发现）

- 现象：10-21 的 8 个证据目录（strategy-labels、business-charts、kb-switch 等）找不到了，无法恢复。
- 根因：放在 `/tmp/niuma-*`，macOS 会定期清理 `/tmp`。
- 正确做法：备份、日志等证据放 `~/Library/Application Support/NiumaHome/evidence/<目录名>/`；会话临时目录只放用完即弃的文件。
- 证据：`docs/history/CURRENT-through-20261022.md` 开头的 2026-10-23 补注。
- 升级：已写进 AGENTS.md「规则」。

## L-03 带教回复时间显示成 UTC（2026-10-23）

- 现象：带教回复的时间按 UTC 显示，不是北京时间。
- 根因：页面直接截取 ISO 字符串里的「月-日 时:分」；后端存的 UTC 本身没错。
- 正确做法：页面上的时间一律用 `src/constants.js` 的 `beijingTime` 按 `Asia/Shanghai` 格式化，测试覆盖跨日、跨年。
- 证据：提交 `3200d0e`；`docs/history/CURRENT-through-20261023-am.md`「带教回复北京时间」一节。第 2 次：2026-10-23 每周整理首次试跑发现同一写法还在促销方案「录入」、飞书导出「核对于」、活动「归档于」3 处，正式页面把 10:46 录入的方案显示成 02:46。
- 升级：已写进 docs/STYLE-GUIDE.md §7；已写成 `scripts/check-style.mjs` 的时间规则（`npm test` 里跑）。

## L-04 React 重复 key 只在开发模式报（2026-10-23）

- 现象：打开带教营地日志抽屉，开发页控制台报两个子元素 key 重复；正式构建不报，截图也看不出来。
- 根因：抽屉和地图是同级子元素，都用了 `key={who}`。
- 正确做法：同级的不同组件，key 加前缀区分（如 `drawer-${who}`）；改了列表或同级组件，验收时在开发页（`npm run dev`）看一次控制台。
- 证据：提交 `5d45dce`；CURRENT.md「培养路径接上真实数据 T14」的范围外发现与「常驻提示可关闭」一节。
- 升级：未升级。

## L-05 硬规矩靠每轮人工核对，各轮范围不一（2026-10-23 升级）

- 现象：样式规矩每轮手工 grep；发布回读有的轮只比首页和 JS，有的另比 CSS 和 server，而发布脚本本身只核对首页。
- 根因：规矩写成提醒，没有变成工具。
- 正确做法：能机器判定的写成检查，在跑测试或发布时自动执行。
- 证据：`docs/history/CURRENT-through-20261022.md` 的 T09 测试记录；`docs/history/CURRENT-through-20261023-am.md`「带教回复北京时间」一节的回读记录；提交 `7c85fbf`、`b5c212d`。
- 升级：已写成 `tests/style-rules.test.mjs`（`npm run check:style`）与 `scripts/verify-release.sh`（`release-app.sh` 末尾自动跑）。

## L-06 改了发布脚本只做 bash 验证，没跑全量测试（2026-10-23）

- 现象：给 `release-app.sh` 加上完整回读后，T10 / T11 四项发布控制流测试失败；是另一个会话跑测试时发现的。
- 根因：`tests/t10-release-retention.test.mjs` 会截取 `release-app.sh` 从 `launchctl bootout` 起的尾段，给外部命令打桩后真实执行；新增的外部调用没有桩。
- 正确做法：改 `scripts/` 下任何脚本也要跑 `npm test`；`release-app.sh` 尾段新增外部命令时，在 T10 测试里补桩和事件断言。
- 证据：提交 `b5c212d` 引入；CURRENT.md「常驻提示可关闭」一节的测试记录；修复是 T10 测试里的 `verify-release.sh` 桩。
- 升级：未升级。

## L-07 两个会话共用一个工作区，测试结果互相污染（2026-10-23）

- 现象：本会话跑全量测试时带上了另一个会话没提交的半成品；另一个会话也因为本会话没提交的 `release-app.sh` 改动挂了 4 项测试。
- 根因：两个会话同时在 `work-desk-ui-bitmap` 里改代码，`npm test` 跑的是整个工作区。
- 正确做法：并行的会话各开独立 worktree；做不到时，测试记录里写明「工作区含他人未提交改动」，提交时用 `git commit -- <自己的文件>`，不碰别人的改动。
- 证据：CURRENT.md「常驻提示可关闭」一节与本轮交接的测试记录。
- 升级：已写进 AGENTS.md「分工」（2026-10-23 每周整理首次试跑提出，用户采纳）。
- 2026-10-24 再犯：交接会话提交 `359ac18` 时整文件 `git add docs/LESSONS.md`，带上了另一会话在同一文件的 4 处未提交改动（当时 `git status` 刚核过是干净的，几分钟后对方又改了）。补做法：共用目录时每次 `git add` 前都看一遍 `git diff -U0 <文件>` 的分块，有别人的块就把自己的块写成补丁 `git apply --cached`，不整文件暂存；暂存后 `git diff --cached` 再核一遍。

## L-08 launchd 里用 /bin/bash 读不了「文稿」下的脚本（2026-10-23）

- 现象：巡检任务装进 launchd 后一跑就退出码 126，日志只有一行 `Operation not permitted`；同一个脚本在终端里跑正常。
- 根因：macOS 隐私保护拦住了 launchd 直接启动的 `/bin/bash` 读取 `~/Documents`；终端和 Claude 会话有文稿访问权限，所以手动跑看不出来。
- 正确做法：launchd 任务要读仓库或 `data/` 的，借服务外壳 `NiumaHomeServer.app` 里的 node 启动（它已能读文稿，`release-app.sh` 也是这样跑服务的）；装好后一定用 `launchctl kickstart` 真实触发一次再看日志，不能只在终端里试。
- 证据：`scripts/health-check.sh` 的 `--install`；`~/Library/Application Support/NiumaHome/evidence/每日巡检-20261023/`。
- 升级：已写进 `health-check.sh --install`。

## L-09 PlistBuddy 找不到文件时把提示打到标准输出（2026-10-23）

- 现象：被巡检的服务配置不存在时，数据目录被读成「File Doesn't Exist, Will Create: …」这串文字，后面的检查跟着报错。
- 根因：`PlistBuddy -c "Print …"` 遇到不存在的文件不报错退出，而是往标准输出打提示，`2>/dev/null` 挡不住。
- 正确做法：先 `[ -f "$plist" ]` 再读。
- 证据：`scripts/health-check.sh` 读数据目录那几行；`verify-release.sh` 开头已先判断文件存在。
- 升级：未升级。

## L-10 外部来源的 GET 每次现读，页面每次打开都要等（2026-10-23）

- 现象：带教答疑每次打开等 3.7 秒（`curl /api/v3/mentor` 实测 3.66 秒，其余只读接口都在 30 毫秒内）；日/周报的解析结果只在内存里，服务重启或发布后第一次打开要等飞书读完。
- 根因：`mentor.mjs` 建读取器时没开 `staleWhileRevalidate`，有落库快照也不先回；`reports.mjs` 的缓存不落库。
- 正确做法：接外部只读来源一律用 `createConfiguredReader(db, kind, …, { staleWhileRevalidate: true })`（或同样的「先回落库快照、超时后台刷新、刷新接口现读」），页面用 `useFreshApi` 或照常读，不让用户等现读。
- 证据：`docs/handoff/UI与功能审核-20261023/审核记录.md` 第 3、4 条；本轮修复见 CURRENT.md「审核后一次性优化」；`tests/mentor-snapshot.test.mjs`、`tests/reports-persist.test.mjs`。
- 升级：已写进 docs/OPERATIONS.md「写接口与接外部来源」（2026-10-24 从 AGENTS.md「规则」搬来）。

## L-11 请求来源校验只做在一组接口上，其余接口裸奔（2026-10-23）

- 现象：Host + Origin 校验（`kb-collect-pairing.mjs` 的 `guard`）只挂在知识库收藏 5 个接口；其余 POST 没有校验，`readJson` 也不看 content-type，浏览器里任何网页都能向本机 5280 发简单 POST 触发拉飞书、调 Codex、写库。
- 根因：校验写在模块里，没有放到入口统一做。
- 正确做法：横切的保护（来源校验、正文大小、统一错误响应）放 `server/index.mjs` / `server/http.mjs` 对全部 `/api/` 生效，模块里只做自己的业务校验（如配对码）。
- 证据：审核记录第 1 条；`server/http.mjs` `checkOrigin`、`tests/request-guard.test.mjs`。
- 升级：已写进 docs/OPERATIONS.md「写接口与接外部来源」（2026-10-24 从 AGENTS.md「规则」搬来）。

## L-12 `set -u` 脚本里可选开关裸引用，变量不设就整段退出（2026-10-24）

- 现象：`verify-release.sh` 第 7 步（可选冒烟）写成 `[ -n "$NIUMA_SMOKE" ]`，脚本开头是 `set -uo pipefail`；正常发布不带这个变量，`release-app.sh` 末尾自动回读在 7 项全 ✓ 之后报 `NIUMA_SMOKE: unbound variable` 退出，被判成「完整回读未通过」「发布中止」（服务其实已切到新快照 `nm-20261024-002313-87c6e99`）。每日巡检同样不带变量跑这个脚本，不修就天天报未通过。
- 根因：只跑了 `bash -n` 和带 `NIUMA_SMOKE=1` 的那条路径，没跑「变量不设」的默认路径；`bash -n` 只查语法，查不出 `set -u` 下的未定义引用。
- 正确做法：可选开关一律写 `${VAR:-}`；改带 `set -u` 的脚本后，开关设与不设各跑一遍；发布前先在主工作区单独跑一次 `bash scripts/verify-release.sh`。
- 证据：`~/Library/Application Support/NiumaHome/evidence/全面优化-20261023/release.log`；修复提交号见 CURRENT.md「审核后一次性优化」的「发布」一行。
