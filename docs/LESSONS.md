# 开发实录与坑

踩过的坑记在这里，Claude 和 Codex 都读。排障、发布、改样式或改脚本之前，先搜一遍：`grep -n 关键词 docs/LESSONS.md`。

## 怎么写

- 每轮交接时自问「本轮踩到新坑了吗」：有就在下面追加一条，并在 CURRENT.md 的交接里写「本轮新坑：L-xx」；没有就写「无」。
- 一条一个坑，编号只增不改。写现象、根因、正确做法、证据。证据写到能查的程度（提交号、文件与章节、证据目录）；查不到就写「未核实」，不编。
- 结论被推翻时改条目并注明日期，不删。

## 怎么升级

- 同类坑第 2 次出现：把正确做法写进 AGENTS.md、docs/OPERATIONS.md 或 docs/STYLE-GUIDE.md（一句话硬约束进 AGENTS.md，操作细节进 OPERATIONS.md），条目的「升级」改成写到了哪里。
- 能用机器判定的：写成测试或脚本（如 `tests/style-rules.test.mjs`、`scripts/verify-release.sh`），条目注明。
- 换个项目也成立的（不依赖本项目的业务、页面、发布脚本）：提议提升到全局坑 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md`，写成 G-xx；原条目保留，末尾加一行「提升：已提升为全局 G-xx（日期）」。只出提案，用户批准才写。
- 条目超过约 30 条时整理一次：已升级、且之后没再犯的，归档到 `docs/history/`。每周五的定时整理提案（见 docs/OPERATIONS.md「每周整理」）会提醒漏记、该升级和该归档的条目。

---

## L-01 改界面时把原有强调色改没了（2026-10-18）

- 现象：改 Codex 重置横条时，「已重置」状态下的橙色底线、图标、时间全变成黑色，用户明确不满。
- 根因：把高亮条件从「有新信号」改成「有新信号且等待重置」，连带改掉了已重置状态的样式。
- 正确做法：只动用户点名的部分；改已有组件前先看清会影响哪些 className、条件、颜色；改完对照改前截图逐项核对颜色与强调。
- 证据：用户 2026-10-18 当面反馈（原记在 Claude 记忆）；对应提交未核实。
- 升级：已写进 AGENTS.md「分工」。
- 提升：已提升为全局 G-09（2026-10-24）。

## L-02 验证证据放在 /tmp，被系统清理（2026-10-21 丢失，10-23 发现）

- 现象：10-21 的 8 个证据目录（strategy-labels、business-charts、kb-switch 等）找不到了，无法恢复。
- 根因：放在 `/tmp/niuma-*`，macOS 会定期清理 `/tmp`。
- 正确做法：备份、日志等证据放 `~/Library/Application Support/NiumaHome/evidence/<目录名>/`；会话临时目录只放用完即弃的文件。
- 证据：`docs/history/CURRENT-through-20261022.md` 开头的 2026-10-23 补注。
- 升级：已写进 AGENTS.md「规则」。
- 提升：已提升为全局 G-01（2026-10-24）。

## L-03 带教回复时间显示成 UTC（2026-10-23）

- 现象：带教回复的时间按 UTC 显示，不是北京时间。
- 根因：页面直接截取 ISO 字符串里的「月-日 时:分」；后端存的 UTC 本身没错。
- 正确做法：页面上的时间一律用 `src/constants.js` 的 `beijingTime` 按 `Asia/Shanghai` 格式化，测试覆盖跨日、跨年。
- 证据：提交 `3200d0e`；`docs/history/CURRENT-through-20261023-am.md`「带教回复北京时间」一节。第 2 次：2026-10-23 每周整理首次试跑发现同一写法还在促销方案「录入」、飞书导出「核对于」、活动「归档于」3 处，正式页面把 10:46 录入的方案显示成 02:46。
- 升级：已写进 docs/STYLE-GUIDE.md §7；已写成 `scripts/check-style.mjs` 的时间规则（`npm test` 里跑）。
- 提升：已提升为全局 G-02（2026-10-24）。

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
- 提升：已提升为全局 G-03（2026-10-24）。

## L-07 两个会话共用一个工作区，测试结果互相污染（2026-10-23）

- 现象：本会话跑全量测试时带上了另一个会话没提交的半成品；另一个会话也因为本会话没提交的 `release-app.sh` 改动挂了 4 项测试。
- 根因：两个会话同时在 `work-desk-ui-bitmap` 里改代码，`npm test` 跑的是整个工作区。
- 正确做法：并行的会话各开独立 worktree；做不到时，测试记录里写明「工作区含他人未提交改动」，提交时用 `git commit -- <自己的文件>`，不碰别人的改动。
- 证据：CURRENT.md「常驻提示可关闭」一节与本轮交接的测试记录。
- 升级：已写进 AGENTS.md「分工」（2026-10-23 每周整理首次试跑提出，用户采纳）。
- 2026-10-24 再犯：交接会话提交 `359ac18` 时整文件 `git add docs/LESSONS.md`，带上了另一会话在同一文件的 4 处未提交改动（当时 `git status` 刚核过是干净的，几分钟后对方又改了）。补做法：共用目录时每次 `git add` 前都看一遍 `git diff -U0 <文件>` 的分块，有别人的块就把自己的块写成补丁 `git apply --cached`，不整文件暂存；暂存后 `git diff --cached` 再核一遍。
- 提升：已提升为全局 G-04（2026-10-24）。

## L-08 launchd 里用 /bin/bash 读不了「文稿」下的脚本（2026-10-23）

- 现象：巡检任务装进 launchd 后一跑就退出码 126，日志只有一行 `Operation not permitted`；同一个脚本在终端里跑正常。
- 根因：macOS 隐私保护拦住了 launchd 直接启动的 `/bin/bash` 读取 `~/Documents`；终端和 Claude 会话有文稿访问权限，所以手动跑看不出来。
- 正确做法：launchd 任务要读仓库或 `data/` 的，借服务外壳 `NiumaHomeServer.app` 里的 node 启动（它已能读文稿，`release-app.sh` 也是这样跑服务的）；装好后一定用 `launchctl kickstart` 真实触发一次再看日志，不能只在终端里试。
- 证据：`scripts/health-check.sh` 的 `--install`；`~/Library/Application Support/NiumaHome/evidence/每日巡检-20261023/`。
- 升级：已写进 `health-check.sh --install`。
- 提升：已提升为全局 G-05（2026-10-24）。

## L-09 PlistBuddy 找不到文件时把提示打到标准输出（2026-10-23）

- 现象：被巡检的服务配置不存在时，数据目录被读成「File Doesn't Exist, Will Create: …」这串文字，后面的检查跟着报错。
- 根因：`PlistBuddy -c "Print …"` 遇到不存在的文件不报错退出，而是往标准输出打提示，`2>/dev/null` 挡不住。
- 正确做法：先 `[ -f "$plist" ]` 再读。
- 证据：`scripts/health-check.sh` 读数据目录那几行；`verify-release.sh` 开头已先判断文件存在。
- 升级：未升级。
- 提升：已提升为全局 G-06（2026-10-24）。

## L-10 外部来源的 GET 每次现读，页面每次打开都要等（2026-10-23）

- 现象：带教答疑每次打开等 3.7 秒（`curl /api/v3/mentor` 实测 3.66 秒，其余只读接口都在 30 毫秒内）；日/周报的解析结果只在内存里，服务重启或发布后第一次打开要等飞书读完。
- 根因：`mentor.mjs` 建读取器时没开 `staleWhileRevalidate`，有落库快照也不先回；`reports.mjs` 的缓存不落库。
- 正确做法：接外部只读来源一律用 `createConfiguredReader(db, kind, …, { staleWhileRevalidate: true })`（或同样的「先回落库快照、超时后台刷新、刷新接口现读」），页面用 `useFreshApi` 或照常读，不让用户等现读。
- 证据：`docs/handoff/UI与功能审核-20261023/审核记录.md` 第 3、4 条；本轮修复见 CURRENT.md「审核后一次性优化」；`tests/mentor-snapshot.test.mjs`、`tests/reports-persist.test.mjs`。
- 升级：已写进 docs/OPERATIONS.md「写接口与接外部来源」（2026-10-24 从 AGENTS.md「规则」搬来）。
- 提升：已提升为全局 G-10（2026-10-24）。

## L-11 请求来源校验只做在一组接口上，其余接口裸奔（2026-10-23）

- 现象：Host + Origin 校验（`kb-collect-pairing.mjs` 的 `guard`）只挂在知识库收藏 5 个接口；其余 POST 没有校验，`readJson` 也不看 content-type，浏览器里任何网页都能向本机 5280 发简单 POST 触发拉飞书、调 Codex、写库。
- 根因：校验写在模块里，没有放到入口统一做。
- 正确做法：横切的保护（来源校验、正文大小、统一错误响应）放 `server/index.mjs` / `server/http.mjs` 对全部 `/api/` 生效，模块里只做自己的业务校验（如配对码）。
- 证据：审核记录第 1 条；`server/http.mjs` `checkOrigin`、`tests/request-guard.test.mjs`。
- 升级：已写进 docs/OPERATIONS.md「写接口与接外部来源」（2026-10-24 从 AGENTS.md「规则」搬来）。
- 提升：已提升为全局 G-07（2026-10-24）。

## L-12 `set -u` 脚本里可选开关裸引用，变量不设就整段退出（2026-10-24）

- 现象：`verify-release.sh` 第 7 步（可选冒烟）写成 `[ -n "$NIUMA_SMOKE" ]`，脚本开头是 `set -uo pipefail`；正常发布不带这个变量，`release-app.sh` 末尾自动回读在 7 项全 ✓ 之后报 `NIUMA_SMOKE: unbound variable` 退出，被判成「完整回读未通过」「发布中止」（服务其实已切到新快照 `nm-20261024-002313-87c6e99`）。每日巡检同样不带变量跑这个脚本，不修就天天报未通过。
- 根因：只跑了 `bash -n` 和带 `NIUMA_SMOKE=1` 的那条路径，没跑「变量不设」的默认路径；`bash -n` 只查语法，查不出 `set -u` 下的未定义引用。
- 正确做法：可选开关一律写 `${VAR:-}`；改带 `set -u` 的脚本后，开关设与不设各跑一遍；发布前先在主工作区单独跑一次 `bash scripts/verify-release.sh`。
- 证据：`~/Library/Application Support/NiumaHome/evidence/全面优化-20261023/release.log`；修复提交号见 CURRENT.md「审核后一次性优化」的「发布」一行。
- 提升：已提升为全局 G-08（2026-10-24）。

## L-13 无头 Chrome 截图与合成事件不可靠：样式没加载完、焦点事件不发（2026-10-24）

- 现象：折线图样稿用 `--headless=new --screenshot --virtual-time-budget=4000` 截图，有几张 `@import` 进来的页面样式没生效（Voice 折线糊成黑块、字号变大），有几张图干脆没画出来（顶层 `await fetch` 的模块还没跑完）；同一命令重跑结果不一样。核对键盘时用 `el.focus()` + 合成 `KeyboardEvent`，内置浏览器里 `onFocus` 根本不触发，无头里截出来停在 1 月，和真实按键（停在 9 月）对不上。
- 根因：`--virtual-time-budget` 只是给虚拟时间一个上限，不保证 `@import` 链、字体和模块里的异步请求都完成；页面不在前台（`document.hasFocus()` 为假）时，程序调 `focus()` 只改 `activeElement`，不发 focus / focusin 事件，React 的 `onFocus` 收不到。合成事件为什么会落到 1 月，未核实。
- 正确做法：要等页面画完再截的图，用调试协议（`--remote-debugging-port` + `Runtime.evaluate` 轮询「图已画出 + `document.fonts.status === "loaded"`」，再 `Page.captureScreenshot` 按元素区域截），`scripts/smoke-pages.mjs` 也是这个路子；键盘、鼠标交互一律用真实输入（`Input.dispatchKeyEvent` / `Input.dispatchMouseEvent`，或内置浏览器的真实按键），不拿合成事件的结果当证据。
- 证据：`~/Library/Application Support/NiumaHome/evidence/折线图数值与悬停-20261024/` 里的 `cdp-shot.mjs`（截图）、`cdp-debug.mjs`（真实按键、鼠标逐步核对）；CURRENT.md「折线图每点数值 + 悬停竖线与数据卡」一节。
- 升级：第 2 次出现（2026-10-26，培养路径「调整安排」弹窗用无头截图摆状态时，程序调 `blur()` 没触发 `onBlur`，改动没提交，截出「还没有改动」；交互本身已在内置浏览器用真实点击、打字核过）；已写进 docs/OPERATIONS.md「报告与验收」第 6 条。
- 提升：已提升为全局 G-11（2026-10-24）。

## L-14 摆位候选全被拒时静默回退到「压得最少」，测试和截图都容易放过（2026-10-27）

- 现象：培养路径地图上，超期两人叠在起点时，业务线标牌的引线从技术线小人身上穿过、横着压过 P6 帐篷；1280 宽时一张标牌压着另一张的引线。几何测试照样全过，放大截图才看出来。
- 根因：`pickBox` 在候选全被拒时不报错，挑「重叠面积最少」的那个交差。真正把候选全拒掉的是两处小错：① 判引线挡不挡路时，标牌正好在小人头顶、引线是一条竖线，剩下的零长段落在小人框里，把所有「直着下来」的候选都判成了挡路；② 标牌最低一档只看山脊线，没让开山脊上冒出的帐篷，擦边一碰就整档作废。
- 正确做法：摆位规则改了以后，用节点脚本把各宽度、各状态的候选逐个打出来，看是否落到回退分支（每个候选的「压到谁」都列出来），别只看最后位置；判碰撞前去掉零长段，两头按方向收几 px；新加的规则（引线不穿过别的标牌、营地、另一个小人；小牌离营地远就有竖引线）写成测试，并先改回旧摆法确认测试会失败。
- 证据：`tests/mentor-path.test.mjs`「当前标牌的引线：不穿过另一张标牌……」；CURRENT.md「培养路径地图改成双脊合峰」一节；证据目录 `~/Library/Application Support/NiumaHome/evidence/培养路径山体优化-20261027/双脊合峰样稿/`。

## L-15 换飞书应用时 open_id 跟着变，写死的身份和存下来的 actor 都会失效（2026-10-27）

- 现象：飞书从机械邪龙兽（`cli_aacf58ab61b85beb`）换到猛鬼兽（`cli_a96f5f9ac63adcd4`），只改 `--profile` 不够：自言自语按本人 open_id 取会话、推送按本人 open_id 发私聊、导出与知识库写入核对 `whoami` 的 profile / App ID，都写死在代码里；数据库里已绑定的简报记着旧 open_id（actor）和含旧身份的来源指纹，迁移后同步会报「身份已变化」。
- 根因：飞书的 open_id 是「用户 × 应用」维度的，同一个人在不同应用下 open_id 不同（常浩：机械邪龙兽下 `ou_77e9…`，猛鬼兽下 `ou_5ad2…`）；身份常量散在 11 个模块里，换应用要逐个找。
- 正确做法：服务端飞书身份只在 `server/lark-identity.mjs` 定义（profile、App ID、本人 open_id），其余模块引用；换应用时先用新应用 `whoami` 拿本人 open_id，对各数据源做只读探测，再用 `npm run migrate:lark-identity` 这类「预览 → 备份 → 确认写 → 回读」的脚本迁存下来的 actor；历史回执不改写。
- 证据：issue #5；本轮 CURRENT.md「服务端飞书身份迁到猛鬼兽」一节；只读探测与副本演练记录在该节「验证」行。
- 第 2 次（2026-11-02，issue #8）：默认身份换成亚古兽（常浩下 `ou_6fac…`），猛鬼兽保留自言自语和推送。改成两个身份对象 + 唯一调用入口 `larkRun`，每个模块显式写用哪个身份，`tests/lark-identity.test.mjs` 检查分配；迁移脚本改为猛鬼兽 → 亚古兽，正式库只有 1 条简报绑定要迁。

## L-16 Safari 网页应用打开时用磁盘里的旧首页：发布换了哈希就黑屏，刷新才好（2026-10-28）

- 现象：数码世界（同为「添加到程序坞」的 Safari 网页应用）每次打开都黑屏，⌘R 后正常；两次打开之间没有发布时不黑。
- 根因：网页应用恢复窗口时直接用磁盘缓存里的旧首页，`no-cache`（以及不写缓存头）拦不住；旧首页引用的带哈希 JS 在发布后已不存在，脚本 404，整页空白。网页应用缓存目录受 macOS 保护读不到，「直接用旧首页」按 WebKit 行为推断，与发布频率、复现条件一致。
- 正确做法：首页（含前端路由回落的 `index.html`）一律 `cache-control: no-store`；带哈希的构建文件不受影响。修好后第一次打开仍可能黑一次（磁盘里还有改前存下的旧首页），之后再发布打开不黑才算验证。
- 证据：牛马之家 `tests/static-cache.test.mjs`；数码世界 `wb-20261028-671` 发布记录。
- 提升：已提升为全局 G-16（2026-10-28）。

## L-17 ChatGPT 新开的会话标签页里输入框先出来、消息后渲染：按「输入框就绪」去读会拿到空历史（2026-11-04）

- 现象：ChatGPT 桥第一次读一个会话的历史返回 0 条，紧接着再读一次就是完整的 10 条；测试聊天同样第一次读到空列表。
- 根因：插件用「输入框出现」判断页面就绪，但 ChatGPT 在新开或刷新的标签页里先渲染输入框，消息列表晚一两秒才出来。发送时同理：按「已有几条回复」定位新回复，消息还没渲染完时计数偏小，会把旧回复当成新回复。
- 正确做法：读历史和发送前都先等消息出现（空会话等满 10 秒照常继续）；发送后以「提问多了一条、最后一条是回复」认新回复，不按回复条数下标取。等待用 MutationObserver，不用定时轮询（后台标签页里计时器会被放慢）。
- 证据：issue #15；`browser-extension/niuma-collect/chatgpt.js`；本轮 CURRENT.md「Agent 接入 ChatGPT 会话」一节「验证」行。
- 第 2 次（2026-11-07，正式环境）：消息出来了，回复正文还要再晚一点——那一刻回复里只有读屏隐藏标题，页面上显示成「ChatGPT 说：」。隐藏标题的 textContent 是「ChatGPT 说：ChatGPT」，和 innerText 对不上，按 textContent 去不掉。改为按 innerText 去掉隐藏标题，读历史等到每条回复都有正文（最多 10 秒）。

## L-18 开发页（Vite）发出的写请求全部被来源校验拦下：代理改写了 Host（2026-11-08）

- 现象：#30 在开发页（`WORKDESK_API_PORT=… npx vite`）点「确认」，接口回 `请求来源校验未通过：不是本机页面发出的请求`（`ORIGIN_REJECTED`）；同一份构建由服务端口直接托管时，写入正常。读接口不受影响，所以只看页面显示发现不了。
- 根因：`vite.config.js` 的代理写成字符串简写 `proxy: { "/api": api }`，Vite 会把它展开成 `{ target, changeOrigin: true }`（`node_modules/vite/dist/node/chunks/dep-*.js`：`opts = { target: opts, changeOrigin: true }`），转发时 Host 被改成服务端口；`server/http.mjs` 的 `checkOrigin` 要求 Origin 等于 `http://${host}`，页面端口和服务端口不同就拒。`http.mjs` 注释「Vite 开发页代理保留页面 Host，所以 5281 的页面也能过」与实际不符。
- 正确做法：在开发页测写入流程前，先用 `curl -X POST -H 'Origin: http://127.0.0.1:<开发端口>' http://127.0.0.1:<开发端口>/api/…` 确认不被拦；被拦时改用 `npm run build` 后由隔离服务端口直接打开页面（同源）来测写入。修 `vite.config.js`（代理写成对象并 `changeOrigin: false`）属于另一件事，先问常浩。
- 证据：本轮 CURRENT.md「批 1·1d 策略页」一节「验证」行；`curl` 复现结果见同节。

## L-19 会话存档员工列表永远只回 10 条：分页参数是 `limit`，不是文档写的 `size`（2026-11-10）

- 现象：#49 接企微会话存档，`GET /api/staff/list?page=1&size=2000` 只回 10 条，`total_page` 104；按这个结果做业务线筛选，一千多个员工里只看到前 10 个。
- 根因：`x.lumiclass.com` 的员工列表接口分页参数是 `limit`（实测 `limit=100` 回 100 条、`total_page` 11），`size`、`per_page`、`pageSize` 都被忽略；会话列表、消息列表才认 `size`。另外 `/api/department/list` 只回 1 个顶级部门，部门名要看员工记录里的 `department_name`。
- 正确做法：接外部列表接口先核对「本页条数 = 请求的条数」与 `total_page` 再写循环；会话存档员工列表用 `limit`（`server/internal-voice.mjs` 已按此写，`tests/internal-voice.test.mjs` 的假接口也按 `limit` 分页）。按学生走长连接 watch 会带出该学生所在全部群（实测 49 个群、10 天 8132 条），做用户之声只取客户单聊和群里客户本人的发言。
- 证据：`~/Library/Application Support/NiumaHome/evidence/企微会话存档接入-20261110/`（探测脚本与结果）。

## L-20 新接口发布后回 501「未实现」：注册在 v3 兜底路由后面（2026-11-10）

- 现象：#50 发布到 5280 后，`GET /api/v3/internal-voice/status` 回 `501 {"error":"未实现，见 docs/tasks/V3-接口清单.md"}`；单元测试全过（测试直接调路由模块，没经过 `server/index.mjs` 的注册顺序）。
- 根因：`server/routes/v3.mjs` 末尾有兜底路由 `/^\/api\/v3\/.+$/` → `pending("V3-接口清单")`；`server/http.mjs` 的 `match` 按注册顺序取第一个匹配。新模块追加在 `v3` 之后，所有请求先被兜底接走。
- 正确做法：新路由模块加进 `server/index.mjs` 的 `routes` 数组时放在 `v3` 前面（`tests/internal-voice.test.mjs` 断言 `v3` 在最后）；发布回读后实际请求一次本轮新接口，不只看 7 项回读。
- 证据：本轮 CURRENT.md「内部原声批 1」一节「发布与回读」。

## L-21 基线截图连拍不一致、或改了颜色也比不出来（2026-11-19）

- 现象：接入基线截图对比（`scripts/ui-baseline.mjs`）时：① Agent 页同一版本连拍两次，一次有「模型列表读取失败」报错条、一次没有，对比失败；② 底部状态栏是 `position: fixed`，整页截图里压在页面中间，版本号、数据源状态每次不同；③ 把面板底色 `--panel` 从 `#FBFBFC` 改成米色 `#F3EFE6`，八张图对比全部「一致」。
- 根因：① 隔离环境用假 codex，模型列表必然读不到，但报错条在数据回来之后才出，截图早晚决定有没有；② 整页截图按视口位置画 fixed 元素；③ Playwright 单像素颜色阈值默认 0.2（YIQ 距离），米色底和原底色只差约 0.05，被当成同一种颜色。
- 正确做法：环境造成、时有时无的元素在 `docs/design/baseline.css` 里截图时去掉（不要只遮住，遮住了还会撑开版面）；fixed 的状态栏截图时藏掉；阈值收紧到 0.02（`scripts/ui-baseline.mjs` 的 `PIXEL_THRESHOLD`），同机连拍逐像素一致，不误报。新加页面进基线时，同一版本至少连比三次都过、再故意改一处颜色确认会失败，才算接好。
- 证据：`~/Library/Application Support/NiumaHome/evidence/ui-baseline/verify-20261119/`（同版本连比、改面板底色的对比日志）；本轮 CURRENT.md「接入基线截图对比与已定内容登记表」一节。
- 升级：已写进 `docs/design/baseline.css`、`scripts/ui-baseline.mjs`（机器判定：对比本身）。
