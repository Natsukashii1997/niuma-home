# 当前状态

更新：2026-10-23。工作区 main；进入顺序见 [HANDOFF.md](HANDOFF.md)。历史过程已归档，下面是当前执行基线。

## 三项遗留收尾：L-13 提升为全局 G-11、关掉 5297、读数栏同比去掉「个点」（2026-10-24，Claude 交接会话，用户逐项同意按推荐处理；已提交 `c261bd6`，已发布 `nm-20261024-103421-c261bd6` 回读通过）

- 时间：开工 `2026-10-24 10:25`（收到答复时没跑 `date`，按会话时间回填；`10:28` 起跑测试时用 `date '+%F %H:%M'` 记录）。来由：上一轮交接留下三项待用户定：L-13 要不要提升为全局坑、样稿静态服务 5297 要不要关、`ytdText` 还写「个点」要不要改。
- 改了哪些文件：`src/modules/business/BusinessCharts.jsx`（`ytdText` 转化率分支的「 个点」改成「%」，与数据卡「差 +5.6%」一致）；`docs/LESSONS.md`（L-13 末尾加「提升：已提升为全局 G-11（2026-10-24）」，只加这一行）。仓库外：`agent-kit/LESSONS.md` 末尾加 G-11（无头 Chrome 截图与合成事件不可靠，措辞去掉本项目名词，来源写 work-desk L-13），在 agent-kit 仓库单独提交。
- 5297：进程 14446 是 `python -m http.server 5297 --bind 127.0.0.1`，工作目录是本仓库、09:34 起（上一轮为打开 `docs/design-drafts/charts/hover.html` 起的），不归任何预览会话管；`kill 14446` 后 `lsof` 回读 5297 已无监听。
- 测试：`npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`（含「现有代码不违反样式与监听硬规则」），`npm run check:style` 输出「样式检查通过」，`npm run build` 退出码 0，`git diff --check` 通过（`npm-test-ytd.log`、`build-ytd.log`）。工作区含他人未提交改动（`.claude/launch.json`、`CURRENT.md` 一行、`docs/LESSONS.md` 的 L-01 至 L-12 提升标注，L-07；状态见 `git-status-before-test-ytd.txt`）。
- 验证：`ytdText` 只在 `Readout` 读数栏用，`Readout` 只挂在 `FocusView` 的四个营收视图（单位都是元），转化率图不带读数栏，所以百分比分支现在不会显示，没做页面实看。
- 截图：无。
- 提交：`c261bd6`，只含 `BusinessCharts.jsx`、`docs/LESSONS.md` 的 L-13 一行与 `CURRENT.md` 本节（两份文档都用 `git show HEAD:<文件>` 加本轮改动生成 blob 写暂存区，别人的改动没带，L-07）；agent-kit 的 G-11 提交 `c64d12f`。提交后主工作区 `main` 即从 `b86020b` 快进到 `c261bd6`（早于发布，与前几轮「发布时才快进」不同，已告诉用户）。
- 发布（用户同意，`2026-10-24 10:34:21` 开始）：发布前只读核对正式库没有 `kb-write-lock`、`kb-operation` 11 条 verified / 2 条 aborted；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261024-103421-c261bd6`，自动备份 `backups/work-desk-20261024-103422-before-nm-20261024-103421-c261bd6.db`，保留策略清理 2 项（快照 `nm-20261024-002313-87c6e99`、备份 `work-desk-20261023-191139-before-nm-20261023-191138-96f1c71.db`）。日志 `release-4.log`。
- 回读：脚本末尾自动回读 7 项全 ✓（进程 97536、153 个源码文件与 `c261bd6` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 7 项 ✓ + 冒烟原样结果 `24 项，0 项有问题` → `回读通过：nm-20261024-103421-c261bd6`（`verify-smoke-4.log`，冒烟截图 `smoke-nm-20261024-103421-c261bd6/`）。改动在页面上不显示，改为查构建：快照 `dist/` 里「个点」出现 0 次（上一快照 `nm-20261024-102250-4bb6c0c` 是 1 次）。
- 回滚：`bash scripts/release-app.sh --use nm-20261024-102250-4bb6c0c`。
- 本轮新坑：无。

## 业务页占比面积块：大字固定给最大的两块（2026-10-24，Claude，用户指出 SKU 前两块没用大字、地区用了，要求按地区的样子固定规则、做好直接提交；已提交 `4bb6c0c`，已发布 `nm-20261024-102250-4bb6c0c` 回读通过）

- 时间：开工 `2026-10-24 10:15`（收到需求时没跑 `date`，按会话时间回填；`10:20` 用 `date '+%F %H:%M'` 记录写交接时间）。来由：原规则是「宽 > 160 且高 > 90 才用大字」，申诉 SKU 前两块宽约 120px 没过门槛，同一页两张面积图字号不一致。
- 改了哪些文件：`src/modules/business/BusinessCharts.jsx`（`Treemap`：大字 `is-big` 改给占比最大的两块，块小到宽 < 84 或高 < 90 才退回普通字号；「其他」不参与）；`docs/STYLE-GUIDE.md`（第 5 节加「占比面积块」一条，写明字号规则）。大字样式本身（名称 14、占比 18 加粗）不变。
- 测试：`npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`，`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过（`npm-test-treemap.log`）。工作区含他人未提交改动（`.claude/launch.json`、`CURRENT.md` 一行、`docs/LESSONS.md` 提升标注，L-07）。
- 验证：隔离 5290（沿用正式库 `sqlite3 .backup` 副本与假 `lark-cli`，日志 `server-5290-4.log`，看完已停），1440 宽看申诉、大学、国课三条业务线的 SKU 与地区：每张图前两块都是大字（申诉 SKU 学术不端申诉 24.6%、退学申诉 22.1%，地区英国 39.6%、澳洲 34.9%；大学 SKU 1v1知识点辅导 43.8%、1v1常规辅导 29.7%，地区英国 34.4%、美国 16.8%），其余块字号与改前一致；1280 宽申诉同样。颜色、网点「其他」、块下名单不变。
- 截图：`docs/handoff/折线图数值与悬停-20261024/` 下 `改后-隔离5290-面积块-申诉服务.png`、`-大学辅导.png`、`-国际课程.png`、`-申诉服务-1280.png`。
- 提交：`4bb6c0c`，只含 `BusinessCharts.jsx`、`docs/STYLE-GUIDE.md` 与 `CURRENT.md` 本节（CURRENT 用 `git show HEAD:CURRENT.md` 加本节生成 blob 写暂存区，L-07）。
- 发布（用户同意，交接会话执行，`2026-10-24 10:22:50` 开始）：发布前只读核对正式库没有 `kb-write-lock`、`kb-operation` 11 条 verified / 2 条 aborted（与上一轮相同）；主工作区 `main` 从 `63b3e84` 快进到 `4bb6c0c`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261024-102250-4bb6c0c`，自动备份 `backups/work-desk-20261024-102251-before-nm-20261024-102250-4bb6c0c.db`，保留策略清理 2 项（快照 `nm-20261023-224123-7925f91`、备份 `work-desk-20261023-172918-before-nm-20261023-172917-cdfef96.db`）。日志 `release-3.log`。
- 回读：脚本末尾自动回读 7 项全 ✓（进程 68045、153 个源码文件与 `4bb6c0c` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 7 项 ✓ + 冒烟原样结果 `24 项，0 项有问题` → `回读通过：nm-20261024-102250-4bb6c0c`（`verify-smoke-3.log`，冒烟截图 `smoke-nm-20261024-102250-4bb6c0c/`）。正式 5280 用调试协议截图（等页面就绪、点业务线切换按钮，`cdp-shot.mjs`）看三条业务线：每张面积图前两块都是大字，与隔离 5290 一致（大学 SKU 43.8% / 29.7%、地区 34.4% / 16.8%；国课 SKU AP课时卡 40.7%、SAT课时卡 18.8%，地区中国 44.8%、美国 23.1%；申诉 SKU 24.6% / 22.1%、地区 39.6% / 34.9%）。截图在 `docs/handoff/折线图数值与悬停-20261024/` 下 `改后-正式5280-面积块-大学辅导.png`、`-国际课程.png`、`-申诉服务.png`（`docs/handoff/**/*.png` 被 .gitignore 忽略，只在本地）。
- 回滚：`bash scripts/release-app.sh --use nm-20261024-101248-197e419`。
- 本轮新坑：无。

## 业务页「数据口径与完整数值」表：数字列对齐 + 占比表从高到低（2026-10-24，Claude，用户看正式页后指出；已提交 `197e419`，已发布 `nm-20261024-101248-197e419` 回读通过）

- 时间：开工 `2026-10-24 10:03`（收到需求时没跑 `date`，按会话时间回填；`10:06` 用 `date '+%F %H:%M'` 记录写交接时间）。来由：用户截图指出完整数值表表头和数值对不齐、学校占比表 0 元的排在最前面。
- 改了哪些文件：`src/modules/business/BusinessCharts.jsx`（`SourceDetails`：数字列表头加 `tnum`；占比表按实收金额从高到低排，缺值排最后；折线表保持月份顺序；加一行注释）；`business-charts.css`（`.bc-data th.tnum` 跟 `td.tnum` 一起右对齐）。
- 测试：`npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`，`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过（`npm-test-table.log`）。工作区含他人未提交改动（`.claude/launch.json`、`CURRENT.md` 一行、`docs/LESSONS.md` 提升标注，L-07）。
- 验证：隔离 5290（沿用上一节的正式库 `sqlite3 .backup` 副本与假 `lark-cli`，日志 `server-5290-3.log`，看完已停）展开两张表：转化率表「2025 / 2026」表头与百分比右边对齐；大学辅导「学校」表表头「实收金额 / 占比」与数值右对齐，首行曼彻斯特大学 478,780.00 元，接口数据最大值同为 478,780，0 元排在末尾（330 所）。其他颜色、字号、边线不变。
- 截图：`docs/handoff/折线图数值与悬停-20261024/` 下 `改后-隔离5290-转化率-完整数值表.png`、`改后-隔离5290-大学-学校完整数值表.png`（第一张底部压着页面底栏，是元素比视口高、截图带进来的，不是页面问题）。
- 提交（用户同意）：`197e419`，只含 `BusinessCharts.jsx`、`business-charts.css` 与 `CURRENT.md` 本节（CURRENT 用 `git show HEAD:CURRENT.md` 加本节生成 blob 写暂存区，另一会话那一行没带，L-07）。
- 发布（用户同意，`2026-10-24 10:12:48` 开始）：发布前只读核对正式库没有 `kb-write-lock`、`kb-operation` 11 条 verified / 2 条 aborted（与上一轮相同），当时快照 `nm-20261024-095801-281604e` 回读通过；主工作区 `main` 从 `3caae0f` 快进到 `197e419`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261024-101248-197e419`，自动备份 `backups/work-desk-20261024-101249-before-nm-20261024-101248-197e419.db`，保留策略清理 2 项（快照 `nm-20261023-221528-0c9e0fa`、备份 `work-desk-20261023-160929-before-nm-20261023-160928-557989a.db`）。日志 `release-2.log`。
- 回读：脚本末尾自动回读 7 项全 ✓（进程 36835、153 个源码文件与 `197e419` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 7 项 ✓ + 冒烟原样结果 `24 项，0 项有问题` → `回读通过：nm-20261024-101248-197e419`（`verify-smoke-2.log`，冒烟截图 `smoke-nm-20261024-101248-197e419/`）。正式 5280 只读展开两张表：表头与数值右对齐，大学辅导学校表首行曼彻斯特大学 478,780.00 元。截图 `发布后-正式5280-转化率-完整数值表.png`、`发布后-正式5280-大学-学校完整数值表.png`。
- 回滚：`bash scripts/release-app.sh --use nm-20261024-095801-281604e`。
- 与授权不一致 / 遗留 / 范围外发现：折线表（按月份）没按数值排序，保持 1–12 月，如要也按高低排再说。
- 本轮新坑：无。

## 折线图每点数值 + 悬停竖线与数据卡（2026-10-24，Claude，用户选定样稿，三张折线图含 Voice 都按它改、卡片保留精确到分的元；已提交 `72de318`、`281604e`，已发布 `nm-20261024-095801-281604e` 回读通过）

- 时间：开工 `2026-10-24 09:06`（`date '+%F %H:%M'` 记录）。来由：用户要折线图每个点直接显示数值，鼠标移到图上出现竖线和一张列出这一列所有线数值的卡片；给了两张参考图（业务页「月度」现图、外部图表的悬停卡），要求重做成位图风，先出样稿再改页面。
- 工作台的折线图共三张（改前查清）：业务页「月度」大图（`BusinessCharts.jsx` 的 `TrendChart`，总营收和三条业务线共用，原来只标今年）；业务页「总转化率」（同一组件，原来不标数值）；Voice「近 7 天热度走势」（`VoicePage.jsx` 的 `TrendChart`，原来只有线尾「标题 · 热度」）。悬停原来只有业务图点上的浏览器 `<title>` 小提示，Voice 没有。首页「促销变动」、Voice 7 天点阵柱不是折线图，价格页折线图早已换成空位，都不在本轮。
- 改了哪些文件：
  - 样稿：`docs/design-drafts/charts/hover.html`、`line-hover.js`、`point-labels.js`（新；静态页直接引用 `src/styles.css`、`src/styles/index.css`、`business-charts.css`，SVG 照两个 `TrendChart` 搬成字符串，刻度 / 当月 / 推算 / 同比直接用 `chart-math.js`；业务数据用已入库的 `docs/design-drafts/business/charts-data.json`，Voice 用 `samples.js`；由 `kb-drafts` 静态服务 5297 打开）。
  - 公共件（新）：`src/ui/chart-labels.js`（每点数值摆放：在点四周按顺序试 8 个位置，避开别的标签、方点、固定文字、图框和折线，放不下的不画）；`src/ui/chart-hover.jsx`（`useChartHover` 悬停 / 键盘状态，`ChartTip` 数据卡定位——竖线右边让开半列宽、放不下换左边、夹在图框里，`ChartTipRow` 一线一行）；`tests/chart-labels.test.mjs`（新，5 项）。
  - 业务页：`src/modules/business/BusinessCharts.jsx`（`TrendChart` 加每点数值、竖线、12px 方框、月份反色、透明命中层与数据卡；去掉点上的 `<title>`，精确到分的元挪进卡里；转化率图打开 `labels`，「至今」后带数值；新增 `valueLabels`、`TrendTip`；大图卡头说明改「每点标金额（万元）：黑字今年、灰字去年；…」）；`business-charts.css`（`.bc-chart-host` 加 `position: relative`，加数值描边与月份反色字色）。
  - Voice：`src/modules/voice/VoicePage.jsx`（`TrendChart` 外包 `.trend-host`，加每点热度、竖线、方框、日期反色、数据卡；最后一天的值线尾标签里已有，不重复标；新增 `pointLabels`、`heatText`——热度整数原样、否则一位小数）；`src/styles/55-voice.css`（数值字色与描边、第一名方框橙色）。
  - 公共样式：`src/styles/10-common.css` 末尾加 `.chart-*`（竖线、方框、月份反色底、数据卡与网点错位）。
  - 文档：`docs/STYLE-GUIDE.md` 第 5 节加「折线图」一条；`docs/LESSONS.md` 末尾加 L-13（只加这一条，该文件里另一会话未提交的「提升为全局 G-xx」标注不是本轮的）。
- 测试：改完 `npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`（原 737 + 新增 5），`npm run check:style` 输出「样式检查通过」、退出码 0，`git diff --check` 通过，`npm run build` 通过（日志 `npm-test-1.log`、`check-style-1.log`）；加 L-13、写完本节后复跑 `npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`，`npm run check:style` 退出码 0，`git diff --check` 通过（`npm-test-2.log`、`check-style-2.log`）。日志在 `~/Library/Application Support/NiumaHome/evidence/折线图数值与悬停-20261024/`。工作区含他人未提交改动：`.claude/launch.json`、`CURRENT.md` 一行、`docs/LESSONS.md` 的提升标注（L-07），与这三张图无关。
- 验证：
  - 样稿：内置浏览器 1440 宽实看；无头 Chrome 走调试协议按元素截 2 倍图（总营收 / 申诉 / 国课、转化率、Voice，1440 与 1280 两种主区宽度）；用户看图后选定。
  - 改后在隔离 5290 实看：正式库（`WORKDESK_DATA_DIR` = 主工作区 `data/`）`sqlite3 .backup` 副本加 `images/` 放会话 scratch 目录，`integrity_check` 为 ok；假 `lark-cli` 前置 PATH（业务图表读副本里 09:08 的缓存，后台刷新失败显示黄条「更新未完成」，属隔离环境预期）；`npm run build` 后 `node server/index.mjs`（日志 `server-5290.log`），看完已停。
  - 交互用真实输入核对（调试协议 `Input.dispatchKeyEvent` / `dispatchMouseEvent`，脚本 `cdp-debug.mjs`）：Tab 进图停当月 10 月，← 到 9 月，Esc 收起，收起后 → 回到 10 月，End 到 12 月，Tab 离开收起；鼠标到 3 月出卡、移出收起；Tab 进图有全站橙色焦点框。卡片在 9 月、10 月、12 月靠右放不下时换到左边，1 月、2 月在右边，都在图框内。
  - 对照改前截图逐项核对（L-01，改前取自正式 5280 只读打开）：今年实线墨色 + 实心方点、去年灰色虚线 + 灰小方点、当月网点列、「至今」空心方点、「推算」橙色虚框与橙字、线尾年份灰字、当月月份加粗、同比行绿涨红跌、右侧读数栏（像素大数字、推算橙、同比绿）、营收完成度卡、三条业务线卡，颜色与强调全部一致；Voice 第一名橙线、其余灰虚线、线尾标签一致。有意的变化只有：去年每点灰字、转化率每点数值与「至今 37.9%」、大图卡头说明一句、点上的浏览器小提示换成数据卡。
- 截图：`docs/handoff/折线图数值与悬停-20261024/`（不入库）：改前 2 张（`改前-正式5280-business-1440.png`、`改前-正式5280-voice-1440.png`）；样稿 11 张（`样稿-*.png`）；改后 15 张（`改后-隔离5290-*.png`：整页业务、整页 Voice，月度不悬停 / 悬停 2 月 / 9 月 / 10 月当月 / 键盘 Tab 后左键，申诉 9 月，大学 12 月，转化率 4 月，Voice 不悬停 / 第 3 天 / 最后一天，1280 宽月度 5 月与转化率 10 月）。
- 提交（用户同意，`2026-10-24 09:53`）：只含本轮 14 个文件——`src/ui/chart-labels.js`、`src/ui/chart-hover.jsx`、`tests/chart-labels.test.mjs`、`docs/design-drafts/charts/hover.html`、`line-hover.js`、`point-labels.js`、`src/modules/business/BusinessCharts.jsx`、`business-charts.css`、`src/modules/voice/VoicePage.jsx`、`src/styles/10-common.css`、`src/styles/55-voice.css`、`docs/STYLE-GUIDE.md`、`docs/LESSONS.md`（只 L-13）、`CURRENT.md`（只本节）。暂存前每个文件看过 `git diff -U0` 分块；`CURRENT.md` 与 `docs/LESSONS.md` 里有另一会话未提交的改动（CURRENT 一行、LESSONS 的「提升为全局 G-xx」标注，其中 L-12 那行和 L-13 挨在同一块），这两个文件用 `git show HEAD:<文件>` 加本轮一段生成 blob 写暂存区，没带别人的改动；`.claude/launch.json` 与未跟踪的 `.DS_Store`、`docs/handoff/提示可关闭-20261023/` 不动（L-07）。提交 `72de318`（暂存区导出到临时目录复跑 `npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`，`npm-test-index.log`）。
- 补改（用户提交后指出，`2026-10-24 09:58`）：转化率数据卡底行「+5.6 个点」不正规，改成「+5.6%」（`BusinessCharts.jsx` 的 `TrendTip` 一处）；隔离 5290 复看截图 `改后-隔离5290-转化率-悬停7月-百分号.png`。读数栏的 `ytdText` 也写「个点」，但只在转化率视图的读数栏里用、现在不显示，没动。单独提交。
- 发布（用户同意，`2026-10-24 09:58:01` 开始，`date` 记录）：发布前只读核对正式库——`v3_documents` 里没有 `kb-write-lock`，`kb-operation` 11 条 verified、2 条 aborted（与上一轮发布前相同）；先跑一遍 `verify-release.sh` 确认当时快照 `nm-20261024-011154-fcac8c6` 回读通过；主工作区 `main` 从 `5ec42b9` 快进到 `281604e`（`main..ui-v4` 只有本轮两个提交，已跟踪文件干净）；按 OPERATIONS「发布」用 `GIT_CONFIG_*` 只对这次忽略主工作区 4 个他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261024-095801-281604e`，自动备份 `backups/work-desk-20261024-095802-before-nm-20261024-095801-281604e.db`，保留策略清理 2 项（快照 `nm-20261023-214602-5d45dce`、备份 `work-desk-20261023-154132-before-nm-20261023-154130-632cb0a.db`）。日志 `release.log`。
- 回读：脚本末尾自动回读 7 项全 ✓（launchd 指向新快照、进程 97636、只监听 127.0.0.1、首页与 11 个构建文件一致、153 个源码文件与 `281604e` 一致、错误日志为空、版本号已写进构建）；主工作区再跑 `NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 7 项 ✓ + 页面冒烟原样结果 `24 项，0 项有问题` → `回读通过：nm-20261024-095801-281604e`（`verify-smoke.log`，冒烟截图在证据目录 `smoke-nm-20261024-095801-281604e/`）。正式 5280 实看（只读，调试协议无头 Chrome 1440 宽）：业务页大图每点今年 / 去年数值、悬停 10 月的竖线 / 方框 / 数据卡（至今、推算、去年三行，精确到分的元，同比 ≈+14%）、转化率悬停 7 月卡片底行「差 +5.6%」、Voice 每点热度与悬停卡都正常，状态栏版本 `281604e`。截图 `发布后-正式5280-*.png` 5 张。
- 回滚：`bash scripts/release-app.sh --use nm-20261024-011154-fcac8c6`。
- 与授权不一致 / 遗留 / 范围外发现：① 业务页原来点上的 `<title>` 小提示去掉了，精确值改在数据卡里看（同一信息换位置）；② 转化率「至今」原来只写「至今」，现在跟大图一样带数值；③ `kb-drafts` 静态服务（5297）是本会话用 `preview_start` 重新起的，还在跑；④ L-13 换项目也成立，建议提升为全局 G-xx，只提案，等用户批准；⑤ 构建有「chunk 大于 500 kB」提示，改前就有，没动。
- 本轮新坑：L-13（无头 Chrome 截图与合成事件不可靠）。

## 书架「近 3 天更新」标记改腰封 + 促销打法去掉障碍筛选（2026-10-24，Claude，用户从三稿里选定 A 腰封、确认障碍筛选整块删除；已提交 `fcac8c6`，已发布 `nm-20261024-011154-fcac8c6` 回读通过）

- 时间：开工 `2026-10-24 00:46`（`date '+%F %H:%M'` 记录）。来由：用户看到页面后提的两条新需求——书架近 3 天更新的橙色顶签想换一种版式（先看三稿再选），促销打法页圈了整个障碍筛选块要删；与当晚发布无关。
- 改了哪些文件：
  - 样稿：`docs/design-drafts/kb/recent-mark.html`（新；静态页直接引用 `src/styles.css`、`src/styles/index.css`，书脊 DOM 照 `KbShelf.jsx`、断列用同一个 `kb-shelf.js`，并排放现状顶签 + A 腰封 / B 星头 / C NEW 字牌，各带名字与一句取舍；由仓库根目录的只读静态服务 5297 打开）。
  - 书架：`src/styles/70-kb.css`（只改三条标记规则：`.kbs-bk .kbs-rb` 从顶签 6×16 凸出书顶 8px 改成书尾上方一道 5px 横带 `left/right: 0; bottom: 20px`；`.kbs-flat .kbs-rb` 从右侧小块改成书尾前一道 5px 竖带；图例 `.kbs-lg.is-new::before` 同步改底部横带；加一行注释写明来源是样稿 A）；`src/modules/kb/KbShelf.jsx` 头部注释一句；`docs/STYLE-GUIDE.md` 书架条目一句。JSX 结构、`isRecent` 判断、其余书架样式不动。
  - 促销打法：`src/modules/user/PlaybookView.jsx`（删「全部障碍」+ A/B/C 三行的筛选块、`bar` 状态、`count`、`rank` 排序，以及随之无用的 `Fragment`、`BARRIERS` 导入；计数文案去掉「主要解决该障碍的排在前面」；空状态文案改「换一个阶段或关键词试试」；注释记录决定）；`src/styles/90-playbook.css`（删 `.filter-bar.plb-bars`、`.plb-all`、`.plb-bar-name`、`.plb-bar-group` 四条与注释）。阶段分段、搜索框、「47 / 47 种」、卡片与详情页不动；`playbook.js` 的 `BARRIERS` 与卡片里的 `barriers` 数据保留（用户策略页还在用）。
- 测试：改完书架后 `npm test` 原样结果 `ℹ tests 737` / `ℹ pass 737` / `ℹ fail 0`，`npm run check:style` 退出码 0（`npm-test-1.log`、`check-style-1.log`）；两处都改完复跑 `npm test` 原样结果 `ℹ tests 737` / `ℹ pass 737` / `ℹ fail 0`，`npm run check:style` 退出码 0，`git diff --check` 通过（`npm-test-2.log`、`check-style-2.log`）；`npm run build` 两次通过。日志在 `~/Library/Application Support/NiumaHome/evidence/书架更新标记与障碍筛选-20261024/`。本目录含另一会话未提交的 `.claude/launch.json` 与 `CURRENT.md` 一行改动（L-07），与这两页无关，提交时不带。
- 验证：
  - 样稿：`.claude/launch.json` 的 `kb-drafts`（python http.server 5297，只监听 127.0.0.1）已由另一会话起着、指向本目录，直接复用；内置浏览器 1440 宽实看，无头 Chrome 2 倍截图；用户看图后选 A。
  - 改前图取自正式 5280 只读打开（页面冒烟此前已确认这两条路由只有 GET）；改后在隔离 5290 实看：正式库 `sqlite3 .backup` 副本加 `images/` 放会话 scratch 目录（`WORKDESK_DATA_DIR`），假 `lark-cli` 前置 PATH，`npm run build` 后 `npm start`（日志 `server-5290.log`）。
  - 书架逐项对照（L-01）：第 01 层 7 本新书、柜顶横放的「路觅教育公司级新人知识库：内容架构」、第 05 层「月度物料文档」（网点书尾上方）三处标记位置变了；待上架橙色数字、层名与篇数、书尾类型、档案盒、侧栏选中橙条、状态栏的颜色与强调全部一致。
  - 促销打法：障碍块整块消失，页面上 `.plb-bars` / `.plb-all` / `plb-bar-*` 为 0 个，筛选条只剩阶段 + 搜索 + 计数；页内点测（DOM 触发）：全部 47 / 47，续费 33，新签 38，搜「早鸟」7，搜不到时显示空状态新文案，清空回到 47；分类内顺序与改前一致（限时折扣、直降 / 立减、支付立减）。
  - 未做：本轮不涉及飞书写入，没有真实往返。
- 截图：`docs/handoff/书架更新标记与障碍筛选-20261024/`（不入库）：`样稿-四方案-1440.png`、`样稿-现状顶签.png`、`样稿-A腰封.png`、`样稿-B星头.png`、`样稿-C-NEW字牌.png`、`改前-正式5280-kb书架-1440.png`、`改后-隔离5290-kb书架-1440.png`、`改前-正式5280-kb书架-第01层放大.png`、`改后-隔离5290-kb书架-第01层放大.png`、`改前-正式5280-促销打法-1440.png`、`改后-隔离5290-促销打法-1440.png`；发布后另加 `发布后-正式5280-kb书架-1440.png`、`发布后-正式5280-促销打法-1440.png`，共 13 张。
- 提交（用户同意，`2026-10-24 01:06`）：`fcac8c6`，只含本轮 7 个文件——`src/styles/70-kb.css`、`src/modules/kb/KbShelf.jsx`、`docs/STYLE-GUIDE.md`、`src/modules/user/PlaybookView.jsx`、`src/styles/90-playbook.css`、`docs/design-drafts/kb/recent-mark.html`、`CURRENT.md`（本节）。`CURRENT.md` 用 `git show HEAD:CURRENT.md` 加本节生成 blob 写暂存区，另一会话在该文件未提交的一行改动与 `.claude/launch.json` 都没带（L-07）；暂存前每个文件看过 `git diff -U0` 分块。本节的发布与回读记录在之后补写，单独提交。
- 发布（用户同意，`2026-10-24 01:11:54` 开始，`date` 记录）：发布前只读核对正式库——`v3_documents` 里没有 `kb-write-lock`，`kb-operation` 11 条 verified、2 条 aborted（与上一轮发布前相同），`/api/v3/kb/collect/recent` 最近一条 ok；主工作区 `main` 从 `5eaaa02` 快进到 `fcac8c6`（`main..ui-v4` 只有这一个提交，已跟踪文件干净）；按 OPERATIONS「发布」用 `GIT_CONFIG_*` 只对这次忽略主工作区 4 个他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261024-011154-fcac8c6`，自动备份 `backups/work-desk-20261024-011156-before-nm-20261024-011154-fcac8c6.db`，保留策略清理 4 项（快照 `nm-20261023-201727-64a1f6c`、`nm-20261023-191138-96f1c71` 与两份 10-23 的发布前备份）。日志 `release.log`。
- 回读：脚本末尾自动回读 7 项全 ✓（launchd 指向新快照、进程 63982、只监听 127.0.0.1、首页与 11 个构建文件一致、153 个源码文件与 `fcac8c6` 一致、错误日志为空、版本号已写进构建）；主工作区再跑 `NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 7 项 ✓ + 页面冒烟原样结果 `24 项，0 项有问题` → `回读通过：nm-20261024-011154-fcac8c6`（`verify-smoke.log`，冒烟截图与 `summary.json` 在证据目录 `smoke-nm-20261024-011154-fcac8c6/`）。正式 5280 实看（只读，无头 Chrome 1440 宽）：书架第 01 层 7 本、柜顶横放一本、第 05 层「月度物料文档」都是腰封，状态栏版本 `fcac8c6`；促销打法页筛选条只剩阶段 + 搜索 + 「47 / 47 种」。
- 回滚：`bash scripts/release-app.sh --use nm-20261024-002313-87c6e99`。
- 与授权不一致 / 遗留 / 范围外发现：① 内置浏览器的 `preview_start` 因本目录已有 5 个其他会话的开发服务而起不了，样稿复用已在跑的 5297，隔离 5290 用 Bash 后台 `npm start` 起的，看完手动停；② `src/modules/user/UserPage.jsx` 促销打法页签说明仍写「月度用户策略按决策障碍从这里选打法」，说的是用户策略页的用法，不是筛选，未动；③ 书架图例「近 3 天更新」的小样随标记一起改成底部横带（标记的一部分）。
- 本轮新坑：无。

## AGENTS 瘦身：入口 + 导航表，操作细节搬 docs/OPERATIONS.md（2026-10-24，Claude，用户同意方案 A 与推荐项；确认后提交并快进 main；无需发布）

- 时间：开工 `2026-10-24 00:12`（`date '+%F %H:%M'` 记录）。来由：AGENTS.md 一天长到 114 行，走上分享警告的「说明书越写越长」老路；按「入口只放怎么开始和做什么事之前读哪份，知识按需读」瘦身，只搬家、不删规矩。
- 改了哪些文件：`AGENTS.md`（114 → 98 行、6,531 → 5,016 字符：新增「做什么事之前读哪份」导航表 6 行；分工留 5 条；运行块补 `npm run check:style`、`npm run import:mentor-path`（W2026-10-23-14）；结构树只加 `docs/OPERATIONS.md`、`docs/templates/handoff.md` 两行；规则留 7 条硬约束加 1 句占位指向；「发布」「交接格式」各留一句硬约束加指向）；`docs/OPERATIONS.md`（新，「操作手册」64 行：派单流程、接口占位机制、写接口与接外部来源、发布、发布回读、回滚、每日巡检、每周整理、交接写法、报告与验收，各节原文从 AGENTS 逐行复制，只把 `docs/` 链接前缀去掉）；`docs/LESSONS.md`（「怎么升级」加 OPERATIONS 并说明「硬约束进 AGENTS、细节进 OPERATIONS」；第 15 行每周整理、L-10 与 L-11 的「升级」行改指 OPERATIONS，注明 2026-10-24 搬来）；`docs/templates/handoff.md`（第 3 行「写法细节见」改指 OPERATIONS「交接写法」「报告与验收」）。
- 对照表（原来在哪 → 现在在哪，行号按 `87c6e99` 的 AGENTS.md）：
  - 留 AGENTS、原文不动：1–3 开头（第 3 行句末加一句指向 OPERATIONS）；分工 7、8、9、11、12；运行 17–24 与 26；结构 30–66；规则 72、73、74、75、76、77、80；交接格式 94（句尾「：」改「。」，加一句指向）。
  - 搬 OPERATIONS：10、13 → 「派单流程（可选）」；70、71 → 「接口占位机制」（AGENTS 规则留一句：未实现的接口写 `pending`、按钮用 `PendingButton`）；78、79 → 「写接口与接外部来源」；84、85、86 → 「发布」（AGENTS「发布」留一句：launchd 5280、只在用户同意后在主工作区 `main` 跑 `release-app.sh`）；87 → 「发布回读」；88 → 「回滚」；89 → 「每日巡检」；90 → 「每周整理」；96–104 → 「交接写法」；106–114 → 「报告与验收」。
  - 核对方式：生成脚本从 `git show 87c6e99:AGENTS.md` 逐行取原文拼出两份新文件，断言搬走的 29 行、留下的 65 行逐行能在新文件里找到，HEAD 每一非空行都有去向（脚本在会话 scratch 目录，不入库）。
- 仓库外：每周整理提示词 `~/.claude/scheduled-tasks/niuma-weekly-review/SKILL.md` 第 3 步阅读清单加 `$M/docs/OPERATIONS.md` 全文，第 5 步 B「写进 AGENTS.md 或 docs/STYLE-GUIDE.md」加 OPERATIONS（`update_scheduled_task` 改，改后回读文件）；`~/Library/Application Support/NiumaHome/evidence/weekly-review/decisions.md` 追加 W2026-10-23-14 采纳。
- 测试：临时克隆跑了两次。第一次（`87c6e99` + 本轮 5 个文件，`2026-10-24 00:23` 起）`npm test` 原样结果 `ℹ tests 737` / `ℹ pass 737` / `ℹ fail 0`；提交前 HEAD 变成 `359ac18`，第二次（`359ac18` + 本轮 4 个文件，LESSONS 来自 `359ac18`，`00:28` 起）原样结果 `ℹ tests 737` / `ℹ pass 737` / `ℹ fail 0`；两次 `npm run check:style` 都输出「样式检查通过」、退出码 0。本目录不跑全量（L-07，工作区含他人未提交的 CURRENT.md 改动）。日志与提示词改前改后副本在 `~/Library/Application Support/NiumaHome/evidence/AGENTS瘦身-20261024/`。
- 验证：只改文档，无界面。`grep -rn 'AGENTS' docs tests scripts REQUIREMENTS.md` 核对仍引用 AGENTS 章节的地方：REQUIREMENTS.md:7「发布」（节名与 5280 仍在）；`scripts/check-style.mjs` 报错文案「AGENTS.md 规则」（引用的动效、图标、依赖、监听四条都还在）；LESSONS L-01、L-02、L-07 的「已写进 AGENTS.md「分工」/「规则」」（仍在）；`tests/handoff-format.test.mjs:6` 注释提 AGENTS「报告与验收」（代码文件，不动）。
- 提交：本提交只含 `AGENTS.md`、`CURRENT.md`、`docs/OPERATIONS.md`、`docs/templates/handoff.md` 4 个文件。`docs/LESSONS.md` 的 4 处改动在提交前被另一会话整文件提交的 `359ac18`（修 verify-release.sh、加 L-12）顺带带进仓库，内容与本轮预期一致（已核对），所以不在本提交里——同目录共用工作树的 L-07 情形，不算新坑。
- 截图：无。
- 发布与回读：未发布、无需发布（文档不进快照）。
- 与授权不一致 / 范围外发现：① 行数约 100 而非 60–70：代码树 37 行与运行块 8 行按约束保留，去掉它们后正文 69 行压到 53 行；字数减 23%。② 每周整理提示词第 5 步 D「AGENTS.md / STYLE-GUIDE / LESSONS.md 里说法重复」没加 OPERATIONS（本轮只改第 3 步与 5B），要查 OPERATIONS 的重复时再加。③ `tests/handoff-format.test.mjs:6` 注释仍写 AGENTS「报告与验收」，代码文件未动。
- 本轮新坑：无。

## 交接模板 + 依赖白名单（审核后第 8 批，2026-10-24，Claude，用户同意分批计划，确认后提交并快进 main；无需发布）

- 时间：开工 `2026-10-24 00:02`（`date '+%F %H:%M'` 记录）。来由：审核发现「开工记时间」连漏两轮是因为没有骨架可抄；依赖检查用黑名单认不出新出的库。
- 改了哪些文件：`docs/templates/handoff.md`（新，交接一节的骨架，★ 标出三行硬要求）；`tests/handoff-format.test.mjs`（新，检查 CURRENT.md 顶部一节：标题带日期、有「时间：开工」「测试：」「本轮新坑：」，新坑编号在 LESSONS 里存在；另用样本证明能抓缺项、不误报）；`scripts/check-style.mjs`（package.json 依赖改白名单 `ALLOWED_DEPS`：react、react-dom、vite、@vitejs/plugin-react，其余一律报 `deps`；src 里的 import 黑名单保留）；`tests/style-rules.test.mjs`（样本加 dayjs，期望改为两条 `deps`）；`AGENTS.md`（规则：新增依赖先改白名单；交接格式：指向模板与测试，加「时间：开工」一行）。
- 测试：定向 `node --test`（style-rules、handoff-format、beijing-time）原样结果 `ℹ pass 6` / `ℹ fail 0`；`npm run check:style` 通过；临时副本 package.json 加 `dayjs` 后检查报 `package.json:22 dayjs`、退出码 1；干净克隆（`c3f5bf6` + 本批 5 个文件）全量原样结果 `ℹ pass 723` / `ℹ fail 0`。
- 验证：无界面改动；本目录 `npm test` 仍被另一会话 32 个未提交文件（含删除 `styles-v3.css`）挂住，不在本目录跑全量（L-07）。
- 截图：无。
- 发布与回读：未发布、无需发布。
- 与授权不一致：W-1 原建议另加一条 LESSONS，本批没加——另一会话正在工作树里加 L-10、L-11，再加会撞编号；模板 + 测试已覆盖根因。`decisions.md` 已记 W-1 采纳。
- 本轮新坑：无。

## 每周整理升级：自证未改、提案落盘、记否决（审核后第 7 批，2026-10-23，Claude，用户同意分批计划；仓库内只改 AGENTS 一行与本节，确认后提交并快进 main；定时任务已更新并试跑）

- 时间：开工 `2026-10-23 23:47`（`date` 记录）。来由：审核发现每周整理「只读」只靠提示词、提案只留在会话里（违反「报告与验收」第 1 条）、被否决的条目会每周重提。
- 仓库外（已生效）：① 提示词 `~/.claude/scheduled-tasks/niuma-weekly-review/SKILL.md` 重写——开头记 `rev-parse HEAD`、`status --porcelain` 的 shasum、`stash list` 条数三项指纹，结尾重算比对并写进提案（不一致须如实写出，不许改成一致）；提案先 heredoc 写到 `~/Library/Application Support/NiumaHome/evidence/weekly-review/<日期>.md` 再回复；先读同目录 `decisions.md`，已采纳 / 否决的编号不再提，待定的带到「上次未决」并复核是否仍成立；新建议编号 `W<日期>-<序号>`，序号接着当天已用的往后排。仓库仍只读，唯一写操作是新建提案文件；`decisions.md` 整理只读不写。② 回填：首次试跑的 7 条按会话记录摘要写成 `2026-10-23-试跑1.md`（标明回填、非原文）；`decisions.md` 记 W-2/3/4/5/7 采纳（含提交号）、W-1/6 待定。③ 完成通知本会话只在试跑时开了一次，已关。
- 仓库内：`AGENTS.md`「发布」每周整理一句改写（提案落盘位置、decisions.md 的用法）。
- 测试：只改提示词与文档，未跑测试。
- 验证（试跑会话 `local_873f4610`，23:48–23:54，成功）：提案 `2026-10-23.md` 落盘 9,204 字节，首尾与会话回复一致；新建议 W-8 至 W-14 共 7 条，W-1、W-6 原编号带到「上次未决」并各写了是否仍成立，已采纳的 5 条没有重提；结尾指纹三项与本会话独立复算完全一致（HEAD `e536577`、status `8fa3c383…`、stash 0），主工作区无新提交、无暂存；抽查 W-8（CURRENT 321 行、165–317 行无 `L-` 引用）、W-13（`page-info.js:10` 截的是 `source-status.mjs` 已转好的北京时间）、W-14（AGENTS 运行块没列 `check:style`）三处证据属实。试跑编号从 -8 起是它自己避让回填占用的 1–7，提示词已据此改成「接着当天已用序号往后排」。
- 本轮新坑：无（本会话等文件时 zsh 对不匹配通配报错导致等待脚本空转，属会话工具用法，不是项目坑）。
- 遗留：W-8 至 W-14 与待定的 W-1、W-6 等用户决定；第 8 批（交接模板与依赖白名单）未做。

## 审核后一次性优化（2026-10-23 晚，Claude；用户授权「确认的问题按顺序改、月份默认本月、首页优先级不变、待我处理两行、去掉转主线需求、长期占位不管、工程项按建议做」并要求不分批一次做完；已提交 `87c6e99`，已发布 `nm-20261024-002313-87c6e99` 回读通过，回读脚本修复 `359ac18`）

- 时间：开工 `2026-10-23 23:24`（`date` 记录）；审核本身 23:03 开始，见 [审核记录](docs/handoff/UI与功能审核-20261023/审核记录.md)。
- 改了哪些文件（按审核编号）：
  - 第 1 条：`server/http.mjs` 新增 `checkOrigin`（Host 本机 + Origin 同源 + 扩展只放行收藏路由）与 `readJson` 的 2MB 上限、content-type 校验（写了才校验；不带的按 JSON 解析，否则收藏接口的测试桩和 curl 过不了）；`server/index.mjs` 全部 `/api/` 先过校验，意外错误只回固定文案；`tests/request-guard.test.mjs`（新，5 项）；`docs/API.md`「请求来源要求」。
  - 第 2 条：`server/mentor.mjs` 读取器开 `staleWhileRevalidate`（默认开，可传参关）；`tests/mentor-snapshot.test.mjs`（新，2 项）。前端没改、没有「正在更新」提示：带教快照值是数组，`withStatus` 会把数组摊成对象，改接口形状要动多处，本轮不动。
  - 第 3 条：`server/reports.mjs` 加 `persist` 钩子，`server/routes/workspace.mjs` 接到 `v3_snapshots`（kind `reports:<文档 URL>`）；`tests/reports-persist.test.mjs`（新，3 项）。
  - 第 4 条：`src/api.js` `readShared`（同路径进行中请求共用、3 秒内复用、`reload()` 强制、`apiSend` 写后失效）；`tests/use-api-dedupe.test.mjs`（新，4 项）。自言自语抽屉不另改：它和按钮读同一路径，靠共享即可。
  - 第 5 条：`src/ui/bitmap.jsx` `dissolve` 加 500 ms 兜底与 `visibilitychange` 揭开。
  - 第 6 条：`src/modules/marketing/BriefView.jsx` 删物料改公共 `Modal`，去掉 `window.confirm`。
  - 第 7 条：另一会话已提交 `664ccc5`，本轮未动。
  - 第 8 条：`server/routes/workspace.mjs` Voice 来源未接通改回 `200 { unavailable, code, error }`；`VoicePage.jsx` `voiceIssue` 读它；`tests/v3-voice.test.mjs` 两处断言改 200。
  - 月份默认本月：`StrategyView.jsx`、`UserPage.jsx` 按月时间轴、首页右上按钮（`HomePage.jsx`，「10 月促销」）；`constants.js` 注释；交付月卡、倒计时、状态栏、⌘K 操作不动。
  - 待我处理两行：`server/home-todo.mjs` 拆 `text` / `sub`；`HomePage.jsx` 渲染；`src/styles/20-home.css` 加 `.todo-sub`；`tests/v3-integration.test.mjs` 一处断言改读 `sub`。
  - 去掉「转为主线需求草稿」：`VoicePage.jsx`（按钮、表单、草稿读取、「关联主线需求」块）、`SelfTalk.jsx`（N 键、按钮、预览文案；历史标签仍显示）、删除 `src/modules/user/ManualNeedForm.jsx` 与 `.manual-need` 样式；后端接口和数据不动；`REQUIREMENTS.md` 记录决定。
  - 工程：`scripts/smoke-pages.mjs`（新）+ `package.json` `smoke` + `verify-release.sh` 第 7 步可选（`NIUMA_SMOKE=1`）；4 处 `aria-label`；`styles-v3.css` 拆成 `src/styles/` 20 个带序号文件 + `index.css`（拼回与原文件逐字节一致，脚本校验过），`main.jsx`、AGENTS、STYLE-GUIDE 同步；设置页旧四键 `SettingForm`（140 行）换成 `LegacySettingRow`（WriteBox 流程，周报试读与清空保留）。
  - 文档：`docs/LESSONS.md` L-10、L-11；`AGENTS.md` 规则两条、`npm run smoke`、结构图；`HANDOFF.md` 上一轮范围；`docs/API.md` 两节。
- 测试：`npm test` 原样结果 `ℹ tests 735` / `ℹ pass 735` / `ℹ fail 0`（开工时工作区干净，`664ccc5` 之后无他人改动）；`npm run check:style` 通过；`npm run build` 通过；`git diff --check`、`bash -n scripts/verify-release.sh` 通过。日志 `~/Library/Application Support/NiumaHome/evidence/全面优化-20261023/npm-test.log`。实看后在含他人未提交改动的工作区（见下一条，HEAD `c3f5bf6`）复跑：`npm test` 原样结果 `ℹ tests 737` / `ℹ pass 737` / `ℹ fail 0`（比上次多 2 项，工作区含他人新增的 `tests/handoff-format.test.mjs`），`npm run check:style` 退出码 0，日志 `npm-test-2.log`。
- 工作区含他人未提交改动（L-07）：实看期间另一会话在同一目录提交了 `c3f5bf6`（每周整理升级，只含它自己的 AGENTS 一行与 CURRENT 一节，没带本轮文件），并留下未提交的 `scripts/check-style.mjs`、`tests/style-rules.test.mjs`、`docs/templates/handoff.md`、`tests/handoff-format.test.mjs`（它的下一批，不属本轮，提交时不带）。
- 验证：`npm run smoke`（隔离服务、临时数据目录、假 lark-cli、1440 宽）24 项 0 问题：全部路由 + ⌘K + 抽屉无 JS 异常、无 console.error/warn、无非 GET 请求；「资源加载失败」是假 lark-cli 下的 5xx，预期内。截图与 `summary.json` 在证据目录 `smoke-iso/`，日志 `smoke-iso.log`。第一次跑完在清理 Chrome 临时目录时报 ENOTEMPTY（结果已写出），脚本随后改为等进程退出再删并重试，复跑日志 `smoke-iso-2.log`。
  - 实看（交接会话，`2026-10-23 23:55` 开始，`date` 记在证据目录 `时间.txt`）：正式库 `sqlite3 .backup` 副本加 images 放会话 scratch 目录，假 `lark-cli` 前置 PATH，`PORT=5291 npm start`（日志 `server-5291.log`）；`npm run smoke -- --base http://127.0.0.1:5291` 原样结果 `24 项，0 项有问题`（`smoke-real/`、`smoke-real.log`）。内置浏览器 1440 宽逐项看：① 首页右上按钮「10 月促销」；「待我处理」在隔离环境显示飞书读取失败——它的 `timeline()` 来源不带快照，`/api/v3/timeline`、`/api/v3/home/todo` 都 502（既有行为，不在本轮范围），两行渲染只能发布后在 5280 看。② Voice 页和自言自语抽屉（点窗口条按钮打开）用页面查找都搜不到「主线需求」。③ 用户策略月份框显示 `2026-10 · 本月`（请求 `user-strategy?month=2026-10`）；用户时间同样来源读取失败，默认月份发布后在 5280 看。④ 带教答疑：`/api/v3/mentor` 6–8 ms（快照），页内计时从切路由到出 1889 字内容 168 ms。⑤ 设置页「物料类型清单」编辑 → 填两行重复值加空行 → 预览保存 → WriteBox 显示「确认前不会写入」、原值（尚未配置）划掉、新值合并成一条 → 取消、收起；全程唯一非 GET 是一次 `POST /api/settings/material_types/preview`，隔离库 `settings` 表没有 `material_types` 行。⑥ 设计 Brief 物料表第 1 行「删掉这一行」弹出公共 Modal「删除物料」（正文写明只改本地草稿，按钮取消 / 确认删除），点取消后 3 条物料仍在，Brief 页没有非 GET 请求。
  - 未做：没有在正式 5280 实看（待我处理两行、用户时间默认本月要飞书来源，发布后看）；没有真实飞书往返。
- 截图：`docs/handoff/全面优化-20261023/`（不入库）10 张：`隔离1440-首页-10月促销按钮-待我处理需飞书.png`、`隔离1440-Voice-无转主线入口.png`、`隔离1440-自言自语抽屉-无转主线入口.png`、`隔离1440-用户策略-默认本月.png`、`隔离1440-用户时间-来源需飞书.png`、`隔离1440-带教答疑-快照秒开.png`、`隔离1440-设置页.png`、`隔离1440-设计Brief.png`（这 8 张整页来自冒烟 `smoke-real/`）、`隔离1440-设置页-物料类型清单-编辑预览未确认.png`、`隔离1440-Brief-删物料弹窗-未确认.png`（两张交互态由临时 CDP 脚本截，脚本在会话 scratch 目录，不入库）。冒烟截图原件与 `summary.json` 在证据目录。
- 与授权不一致：① 第 2 条没加「正在更新」提示（原因见上）；② 超长行换行没做，改到的文件也没重排，避免 diff 噪音；③ content-type 校验放宽为「写了才校验」，真正的防护是 Origin 校验；④ 修复提交 `359ac18` 整文件暂存 `docs/LESSONS.md` 时，带上了另一会话在该文件的 4 处未提交改动（「怎么升级」两行、L-10 / L-11「升级」行改指当时还未入库的 `docs/OPERATIONS.md`），违反 L-07；`main` 已快进到它，不改写历史，已在 L-07 下记明并补做法（暂存前看 `git diff -U0` 分块）。
- 提交（用户同意，`2026-10-24 00:10`）：`87c6e99`，59 个文件只含本轮（他人第 7、8 批已先提交为 `c3f5bf6`、`1f4afa9`，不在本次提交里；`.DS_Store` 与 `docs/handoff/提示可关闭-20261023/_log.txt` 未动）。提交后在该树上复跑 `npm test` 原样结果 `ℹ tests 737` / `ℹ pass 737` / `ℹ fail 0`，`npm run check:style` 退出码 0，日志 `npm-test-3.log`。
- 发布（用户同意，`2026-10-24 00:22` 开始，`date` 记录）：发布前正式库没有 `kb-write-lock`，13 条 `kb-operation` 为 11 条 verified、2 条 aborted，最近收藏状态 ok（本次重新查的：`sqlite3 -readonly` 对 `v3_documents` 按 kind 与 `payload.state` 分组计数，`curl` 带 `Origin` 读 `/api/v3/kb/collect/recent`）；关掉隔离 5291 后，主工作区 `main` 从 `1f4afa9` 快进到 `87c6e99`；`release-app.sh`（只对这次忽略主工作区 4 个他人未跟踪文件）切到 `nm-20261024-002313-87c6e99`，自动备份 `backups/work-desk-20261024-002316-before-nm-20261024-002313-87c6e99.db`，保留策略清理 0 项，这份快照同时带上 `664ccc5`（页面时间按北京时间）与 `121a87b`（巡检脚本，不在服务路径）。脚本退出码 1：末尾自动回读 7 项全 ✓ 之后，在本轮新加的第 7 步可选冒烟那行报 `NIUMA_SMOKE: unbound variable`（`set -u` 下未设置的变量裸引用，L-12）被判成「发布中止」，但服务已切到新快照。修复提交 `359ac18`（改 `${NIUMA_SMOKE:-}` + L-12），`main` 快进到它；每日巡检调用的就是主工作区这份脚本，随之修好。日志 `release.log`。
- 回读（主工作区，修复后）：`bash scripts/verify-release.sh` 不带变量 → `回读通过：nm-20261024-002313-87c6e99`（`verify-plain.log`）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 7 项 ✓ + 页面冒烟原样结果 `24 项，0 项有问题` → `回读通过`（`verify-smoke.log`，截图与 `summary.json` 在证据目录 `smoke-nm-20261024-002313-87c6e99/`）。正式 5280 实看（只读）：`/api/v3/voice` 200 带 `unavailable`、`/api/v3/mentor` 5–15 ms（发布前 3.7 s）、`/api/v3/home/todo` 25 ms；首页「待我处理」第一条两行（「项目结项审核」+「T1 需求诊断…· 常浩 · 逾期3天」，`.todo-sub` 1 个）、右上「10 月促销」；用户时间月份框默认 `2026-10`；`server.stderr.log` 0 字节。截图另加 4 张 `正式1440-*.png`（首页待我处理两行、用户时间默认本月、Voice、带教）到 `docs/handoff/全面优化-20261023/`，共 14 张。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-224123-7925f91`。
- 遗留 / 下一步：① 隔离实看与发布后 5280 补看都已做（见「验证」「回读」）；② 提交、快进、发布、回读均已做；③ Chrome 扩展不用改（已带 JSON content-type 与配对码，核对过）；④ 带教「正在更新」提示另议。
- 本轮新坑：L-10、L-11、L-12（发布时才踩到，见「发布」）。

## 巡检升级：每日备份、查昨天记录、日志裁剪（审核后第 6 批，2026-10-23，Claude，用户同意分批计划，确认后提交并快进 main，正式任务已重装，见本节末尾）

- 时间：开工 `2026-10-23 23:27`（`date` 记录）。来由：深度审核发现「7 天没备份」会每天报警直到发布、巡检自己停了没人知道、launchd.log 无限追加。
- `scripts/health-check.sh`：① 第 4 项改为每日备份 `backups/work-desk-<YYYYMMDD>-daily.db`（`sqlite3 .backup`，当天已有则不重做；写后 `quick_check` 回读；只留 7 份，自己清，因为发布保留策略只认 `before-nm-` 文件名）；② 新增第 5 项：昨天的月度日志里没有记录就算不过，首次运行（之前没有任何记录）不查；③ launchd.log 超过 500 行时原地截断到 300 行（不换 inode，正在追加的句柄不受影响）。脚本不再是纯只读，但只写备份目录和日志。
- `tests/health-check.test.mjs`：3 项——全过（今日备份落盘、9 份旧每日备份清到 7 份、发布前备份不动、600 行 launchd.log 裁到 300、不弹通知）；首次运行不查昨天；5 项不过（含备份失败、昨天缺记录）。`AGENTS.md` 巡检一句同步。
- 测试：本目录 `npm test` 被另一会话未提交的 server 改动挂住（6 项失败后不返回，已停掉，L-07）；改在干净临时克隆（`664ccc5` + 本批两个文件）跑：原样结果 `ℹ pass 721` / `ℹ fail 0`。`bash -n`、`git diff --check` 通过。
- 验证：① 真实环境手动跑 11 项全 ✓、退出码 0，真实备份目录新增 `work-desk-20261023-daily.db`（2,293,760 字节，`quick_check` ok，12 张表与正式库一致），月度日志新增 `23:29 通过`（另有审核时 `23:23` 一行）；② 隔离 launchd 任务 `cn.niuma-home.health-test`（临时 base，只读真实服务与库）触发一次：11 项全 ✓、`last exit code = 0`、备份落在临时 base，测完已卸载、plist 已删；证据 `evidence/每日巡检-20261023/第6批-隔离launchd-备份与查昨天.log`。「昨天缺记录」一项只在测试里验过，真实环境明天 08:30 后才有第一次实跑。
- 截图：无界面改动。
- 本轮新坑：无（测试被他人改动挂住属 L-07）。
- 提交与重装（23:37）：另一会话同时改了 AGENTS.md 的 styles 一行，所以 AGENTS 用「HEAD 版本 + 我那一行」生成内容直接写进暂存区，工作树不动；提交 `121a87b` 只含 4 个文件；主工作区 `main` 从 `664ccc5` 快进到 `121a87b`；在主工作区 `--install` 重装 `cn.niuma-home.health`（`plutil -lint` OK，指向主工作区新版脚本）；`launchctl kickstart` 一次：11 项全 ✓、`last exit code = 0`，真实日志新增 `23:37 通过`。
- 遗留：第 7 批（每周整理升级）、第 8 批（交接模板与依赖白名单）未做；「昨天缺记录」一项等明天 08:30 后才有真实运行。

## 页面时间按北京时间显示（每周整理第 3 条，2026-10-23，Claude，用户同意计划与 3 项推荐做法；用户确认后提交并快进 main；未发布）

- 时间：开工 `2026-10-23 23:07`（`date` 记录）。
- 改动：`src/constants.js` 新增 `beijingTime(iso)`（带时区 ISO → 北京时间「YYYY-MM-DD HH:mm」，没带时区或无效返回空串）；`PlansView.jsx:78`「录入」、`feishu-export.jsx:90`「核对于」、`CampaignView.jsx:231`「归档于」改用它，显示格式不变；`scripts/check-style.mjs` 加时间规则（`*At` 字段按日期时间截取、`.replace("T", " ")`，行内注释写「北京时间」可豁免）；`tests/beijing-time.test.mjs`（新，跨日 / 跨年 / 带偏移 / 无效值）、`tests/style-rules.test.mjs` 加 3 处违规与 4 处合规样本；STYLE-GUIDE §7、AGENTS 结构图、LESSONS L-03（第 2 次出现，标已升级）同步。`mentorReplyTime`、`briefSyncTime` 本来就对，未合并。
- 测试：`npm test` 原样结果 `ℹ pass 720` / `ℹ fail 0`；`npm run check:style` 通过；改前的 3 个文件放进临时目录跑检查，3 处全部被拦；隔离目录 `vite build` 通过；`git diff --check` 通过。
- 验证：本文件夹预览服务名额（5 个）被其他会话占满，没能起隔离页面实看（L-07 再次出现）；改为只读请求正式 5280 `GET /api/plans`，对 3 条真实方案算出改前 / 改后显示：如国际课程 `2026-10-19T02:46:47.630Z` 改前「10-19 02:46 录入」、改后「10-19 10:46 录入」。飞书导出「核对于」与活动「归档于」未在页面实看，只靠单元测试和机检。
- 截图：无（未能起预览）。
- 发布：未发布；正式页面要发布后才生效，发布须用户另外同意，发布后可在 5280 促销方案页实看「录入」时间。
- 本轮新坑：无（预览名额被占属 L-07）。

## 每周整理（Loop 第 5 批，2026-10-23，Claude，用户同意用桌面应用定时任务、每周五 18:00、只出提案；文档改动经用户确认后提交并快进 main；不涉及快照，无需发布）

- 时间：开工 `2026-10-23 22:39`（`date` 记录）。
- 定时任务（仓库外）：桌面应用「【每周五】牛马之家说明书整理提案」`niuma-weekly-review`，cron `0 18 * * 5`（应用错峰后显示 18:10），提示词 `~/.claude/scheduled-tasks/niuma-weekly-review/SKILL.md`。只读主工作区，按 6 类（漏记的坑 / 该升级 / 能机检 / 重复矛盾过时 / 归档 / 巡检）出最多 10 条带证据的提案，不改文件、不提交、不连飞书。因本会话是 Bypass 模式，任务按 Bypass 保存（用户可在应用里改）；完成通知本会话已关。
- `AGENTS.md`「发布」加每周整理一条；`docs/LESSONS.md`「怎么升级」提到它。
- 试跑（会话 `local_43474c74`，22:40–22:43，成功）：出 7 条提案——A 开工不记时间该进交接模板（可选）；B L-07 已多次出现该升级进 AGENTS「分工」（采纳）；C L-03 的 UTC 截取写法仍在 `PlansView.jsx:78`，建议加机检（采纳，改代码需另授权）；D `HANDOFF.md:9` 正式版本过时、`AGENTS.md:41`「samples.js 目前为空」过时、L-09 状态与代码不一致；E CURRENT.md 303 行，建议归档尾部 4 节；F 巡检无异常。
- 核对：本会话独立抽查 3 条证据属实（`HANDOFF.md:9` 仍写 `nm-20261023-103847-3200d0e`；`src/samples.js:6` 有 `voiceSample`；`PlansView.jsx:78` 对 `toISOString()` 写入的 `savedAt` 直接 `slice(5, 16)`）；试跑前后主工作区与本目录的已跟踪文件均无它的改动。
- 测试：只改文档，未重跑测试。
- 本轮新坑：无。
- 采纳（开工 `2026-10-23 22:59`，用户采纳第 2、4、5、7 条，只改文档）：② L-07 写进 AGENTS「分工」、LESSONS 标已升级；④ HANDOFF「最新修复」改为只指向 CURRENT 顶部的「最新状态」，下文「上述版本」改为「之后的版本」；⑤ AGENTS 结构图 `samples.js` 说明更正；⑦ CURRENT 末尾 4 节（原 295–333 行）移到 `docs/history/CURRENT-through-20261023-am.md`，与原文逐字一致、只把 `docs/` 链接前缀改为 `../`（9 个链接核对可打开），CURRENT 末尾留「更早的记录」，LESSONS 的 L-03、L-05 引用同步改路径。
- 遗留：第 1、3、6 条未采纳（第 3 条要改代码，需另外授权）；下次自动运行 2026-10-30（周五）。

## 每日巡检（Loop 第 4 批，2026-10-23，Claude，用户同意第二批计划与 3 项推荐做法，确认后提交；正式巡检任务在提交、快进 main 后安装；不涉及快照，无需发布）

- 时间：开工时没有用 `date` 记时刻（没做到「报告与验收」第 2 条）；按日志：第一次手动巡检 22:30，真实环境巡检 22:32，隔离 launchd 三轮 22:34–22:35。
- `scripts/health-check.sh`（新）：只读、不调用模型；发布回读 7 项 + 数据库 `PRAGMA quick_check` + 磁盘余量（低于 5 GB 报）+ 7 天内有无数据库备份；每次追加一行到 `evidence/health/<年-月>.log`，未通过时逐条记下并弹本机通知；`--install` / `--uninstall` 装卸 launchd 任务 `cn.niuma-home.health`（每天 08:30，借服务外壳的 node 启动，见 L-08）。
- `tests/health-check.test.mjs`（新）2 项：临时 HOME / base 里跑真实脚本，桩掉回读、sqlite3、df、osascript；全过时不弹通知，4 项不过时日志逐条记、只弹一次通知。
- `AGENTS.md`：「发布」加每日巡检一条，结构图加 `health-check.sh`。`docs/LESSONS.md`：加 L-08、L-09。
- 测试：`npm test` 原样结果 `ℹ pass 718` / `ℹ fail 0`（工作区含另一个会话未提交的 MentorPath 改动）；`npm run check:style` 通过；`bash -n`、`git diff --check` 通过。
- 验证：
  - 真实环境手动跑：10 项全 ✓、退出码 0，真实日志记 `2026-10-23 22:32  通过`。
  - 隔离 launchd 任务 `cn.niuma-home.health-test`：① 直接用 `/bin/bash` 启动 → 退出码 126、`Operation not permitted`（L-08）；② 借外壳 node、指向不存在的服务 → 4 项 ✗、退出码 1；③ 借外壳 node、巡检真实服务 → 回读 7 项、数据库、磁盘全 ✓（备份项 ✗ 是测试时把备份目录做成了符号链接，`find` 不跟进，22:32 的真实运行该项通过）。测完已卸载，plist 已删。
  - 通知：`osascript` 正常退出；本机读不到通知设置，由用户 2026-10-23 确认看到了「牛马之家巡检」通知。
  - 证据：`~/Library/Application Support/NiumaHome/evidence/每日巡检-20261023/隔离launchd正常一轮.log`。
- 截图：无界面改动，无截图。
- 本轮新坑：L-08、L-09。
- 提交与安装（开工 `2026-10-23 22:37`，`date` 记录）：用户确认后只提交本批 5 个文件 `303807b`；主工作区 `main` 从 `e4b72df` 快进到 `303807b`（只带这一个提交）；在主工作区 `bash scripts/health-check.sh --install` 装上 `cn.niuma-home.health`（每天 08:30，`plutil -lint` OK，程序指向主工作区脚本、借外壳 node 启动）；`launchctl kickstart` 手动触发一次：10 项全 ✓、`last exit code = 0`，真实日志新增 `2026-10-23 22:38  通过`。卸载：`bash scripts/health-check.sh --uninstall`。
- 遗留：第 5 批每周整理见上一节。

## 带教「培养路径」压到 3/4 宽、坡度均匀、太阳放大（2026-10-23，Claude，用户确认原型「按这版收尾」，中途追加「太阳再大一点」；用户同意后已发布 nm-20261023-224123-7925f91，回读通过）

用户要求：山略长、看不出坡度，长度压到现在的 3/4，整体再协调一些；收尾时追加「太阳再大一点」。原型直接做在代码里、在隔离环境截图给用户看，用户确认后补测试提交（同上一轮做法）。时间：原型开始约 22:22（库副本文件时间），收尾开始 22:32（`date` 记录）。

- `src/modules/projects/mentor-path.js`：`WEEK_W` 140 → 105（24 周 3778 → 2938 宽）；营地高度从按关数等距改为按周数抬升，首尾两关高度不变（原来隔 5～7 周的两关只抬一格，中段像平路，最后又猛拔山顶）；营地之间的起伏幅度 0.7 → 0.35，`crest` 加 `climb`：上坡路两处起伏合计不超过这段爬升的 3 成，路线不往回掉（原来后山线出大本营先下坠一截）；远山从每 420px 改为每 3 周宽（315px）一起一伏；云让开太阳和「今天」那行字（原来有一朵压在字上）；新增 `SUN = { r: 30, glow: 54 }`（原 22 / 40），「今天」文字位置、标牌避让太阳的框、跟着太阳的鸟都按它算。
- `src/modules/projects/MentorPath.jsx`：太阳两圈半径、太阳下虚线起点、打开时「太阳要露出来」的范围改用 `SUN`。
- `tests/mentor-path.test.mjs`：删掉 V7 定稿在 1232 宽下钉死坐标的 3 项（登山者与绳桥、标牌摆放、绳桥说明与松树）和 1232 宽「绳桥不穿营地」1 项——页面不再画 1232 宽的图，真实宽度的同一检查在「按周定宽：标牌全部完整摆开…」一项里（810 / 699 / 640 三个高度）；1232 宽的其余规则检查保留。「按周定宽」一项改为 105 / 2938、云的实际坐标、「今天」跟着 `SUN`。新增 3 项：营地按周数抬升且两条路一路不往回掉（810 / 699 / 640）；与本版定稿一致（810 / 699 高的登山者、绳桥、13 块标牌、绳桥说明、超期小牌，坐标由本版代码算出后钉住，脚本 `baseline.mjs`）；绳桥说明不压图标、松树按规则避让。反向验证：临时把 `climb` 改成 false，「不往回掉」一项报 `ai@810 在 229 往回掉`（正是原型里看到的那处下坠），改回后通过。
- `docs/STYLE-GUIDE.md` 第 5 节培养路径：宽度改为每周 105；新增「坡度」「太阳」两条。
- 测试：`npm test` 原样结果 `ℹ tests 718` / `ℹ pass 718` / `ℹ fail 0`（跑测试时工作区含另一会话的 `tests/health-check.test.mjs`，当时未跟踪、随后由该会话提交为 `303807b`，其中 2 项计入；本文件 13 项改为 12 项）；`node --test tests/mentor-path.test.mjs` 12 / 12；`npm run build`、`git diff --check` 通过。日志 `npm-test-ui.log`。
- 验证：隔离 5291（正式库 `sqlite3 .backup` 抄到 scratchpad + 直接失败的假 `lark-cli`，不连飞书）+ 开发页 5292，无头 Chrome。三组数据（林瑶真实 13 关；进度示意 13 关；20 关——后两组用 CDP 拦截接口、只改浏览器收到的返回，沿用上一轮脚本 `培养路径加宽样稿-20261023/shot-b2.mjs`）：都是 2938 宽、0 块小牌、标牌两两不相交；真实数据打开滚到 174，太阳、登山者、A1 / B1 都在可视区；「回到今天」回到 174；竖向滚轮 400 → 横向 +400；1280 宽可视 1072，「今天 10-23」整行露出（上一轮记的 1280 截字随地图变短消失）；控制台无错误和警告。全景脚本 `pano.mjs`。以上脚本与日志在 `~/Library/Application Support/NiumaHome/evidence/培养路径压缩协调-20261023/`。
- 截图（不入库）：`docs/handoff/培养路径压缩协调-20261023/`：`01-改前-真实-全景`、`02-改前-真实-默认-1440`、`03-改后-真实-全景`、`04-改后-真实-默认-1440`、`05-改后-进度示意-全景`、`06-改后-20关-全景`、`07-改后-真实-默认-1280`、`08-改后-真实-本周攀登收起-1440`、`09-改后-进度示意-默认-1440`。
- 已知：「本周攀登」卡展开时仍会盖住它后面一部分未来营地（收起即可看到）。
- 与授权不一致：太阳放大多少（约 1.35 倍）是我定的，截图已发给用户，用户没有单独确认这个尺寸。
- 发布（用户同意，22:41 开始，`date` 记录）：发布前正式库没有知识库写锁，13 条知识库操作记录为 11 条已核实、2 条已中止，最近收藏为 ok / duplicate，没有结果不明——数字与前两次发布相同，是本次重新查的（`sqlite3 -readonly` 数 `kb-write-lock`、按 `payload.state` 分组数 `kb-operation`，`curl` 带 `Origin` 读 `/api/v3/kb/collect/recent`）。主工作区 `main` 从 `6293e19`（另一会话已快进到它的巡检提交）快进到 `7925f91`，主工作区 `npm test` 原样结果 `ℹ pass 718` / `ℹ fail 0`；`release-app.sh`（只对这次忽略主工作区未跟踪文件）切到 `nm-20261023-224123-7925f91`，自动备份数据库 `backups/work-desk-20261023-224125-before-nm-20261023-224123-7925f91.db`；保留策略清理快照 `nm-20261023-172917-cdfef96` 和数据库备份 `work-desk-20261023-142436-before-nm-20261023-142435-dc8d821.db`。没有表结构改动。这份快照同时带上另一会话的 `46ce673`（文档）、`303807b`（巡检脚本与测试，不在服务运行路径上）、`6293e19`（文档）。
- 回读：发布脚本末尾自动跑 `verify-release.sh` 7 项全过（launchd 与运行中进程指向新快照、只监听 127.0.0.1、首页与 11 个构建文件逐字节一致、快照 153 个源码文件与 `7925f91` 一致、错误日志为空、版本号 `7925f91`）；看完页面后单独再跑一次仍全过，错误日志 0 字节。5280 只读：`/api/v3/mentor/path`、`/api/v3/kb/tree` 均 200；无头 Chrome 1440 与 1280 宽只打开不点击：地图 2938 宽、打开时滚到 174；太阳两圈半径 30 / 54，在可视区；「今天」那行字在 1280 宽下也完整露出；13 块标牌 0 块小牌、0 处重叠；正在爬的 A1 / B1 和两个登山者都在可视区，不压在「本周攀登」卡下；页脚 `7925f91`，控制台无错误和警告，全程无非 GET 请求。脚本 `readback.mjs`、输出 `readback.log`，发布日志 `release.log`，主工作区测试日志 `npm-test-main.log`，都在证据目录。
- 发布后截图（不入库）：`docs/handoff/培养路径压缩协调-20261023/发布后-正式培养路径-1440.png`、`发布后-正式培养路径-1280.png`、`发布后-正式培养路径-全景.png`。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-221528-0c9e0fa`。
- 本轮新坑：无。

## 规矩改成工具：样式检查、发布回读脚本、LESSONS.md（2026-10-23，Claude，用户同意 3 批计划与 3 项推荐做法；三批均经用户确认后提交：`7c85fbf` / `b5c212d` / 本节所在提交；不涉及运行代码，无需发布）

来由：用户收集的开发分享《长出来的 Skill》（Skill / Loop / RSI）。本轮只做其中两件：靠自觉的规矩写成检查，踩过的坑统一回写到仓库。

- 第 1 批 `7c85fbf`：`scripts/check-style.mjs`（新，不写 transition / animation / @keyframes、不引入图标库 / UI 框架 / CSS-in-JS / 动画库、服务与 vite 只监听 127.0.0.1）+ `tests/style-rules.test.mjs`（新，挂进 `npm test`，含 8 处违规样本）+ `package.json` 加 `check:style`。阴影、圆角、渐变现有合法用法多，不机检。
- 第 2 批 `b5c212d`：`scripts/verify-release.sh`（新，只读回读 7 项）；`release-app.sh` 首页检查后自动跑它，不过就停下、不清理旧快照；AGENTS.md「发布」回读一节改写。
- 第 3 批（本节所在提交）：
  - `tests/t10-release-retention.test.mjs`：修第 2 批引入的 T10 / T11 四项失败（给 `verify-release.sh` 打桩、事件序列加上回读一步），新增「完整回读不过则停下、不清理旧快照」一项。
  - `docs/LESSONS.md`（新）：写法与升级规则 + 7 条有证据的坑（L-01–L-05 从历史补录，L-06、L-07 是本轮踩的）。
  - `AGENTS.md`：分工加两条（只动点名部分并对照截图核对；不把「下线」列为推荐）；结构图加 `LESSONS.md`、`verify-release.sh`、`check-style.mjs`；交接格式加「本轮新坑」一行。
  - `docs/STYLE-GUIDE.md` §7：状态提示不常驻，关键信息常驻须能点 ×。
  - 仓库外：Claude 记忆里上面 3 条已删，换成一条「牛马之家规矩以仓库为准」的指针。
- 测试：`npm test` 717 / 717（工作区同时含另一个会话未提交的改动）；`npm run check:style` 通过；`bash -n`、`git diff --check` 通过。
- 验证：回读脚本对正式 5280（`nm-20261023-214602-5d45dce`）只读跑 7 项全过；在临时克隆里用隔离 launchd 任务 `cn.niuma-home.verify-test`、5293、临时数据目录、假 `lark-cli` 真实发布一次，全过；人为制造 4 种错误（错快照名、改快照 server 文件、错误日志写一行、停掉任务）均报 ✗、退出码 1，带着篡改走 `--use` 时停在回读处；之后已清理隔离任务、plist 和临时目录。记录在 `~/Library/Application Support/NiumaHome/evidence/发布回读脚本-20261023/验证记录.md`。
- 截图：无界面改动，无截图。
- 与计划不一致：① 计划迁 4 条记忆，实际 3 条——「伙伴屏是北极星」讲的是数码世界（personal-ai-workbench），不属于本仓库，留在记忆；② 第 2 批交付时漏跑全量测试，导致 T10 / T11 失败四项，已在第 3 批修好（L-06）。
- 追加（用户确认后提交，本节最新一次提交）：AGENTS.md 新增「报告与验收（防伪造）」一节，取自分享的验证者五条，改写成本项目的交接与验收用语（先写盘再报告、开工记时间、照抄测试结果、沿用要明说、数字一致须说明独立来源）。
- 本轮新坑：L-06、L-07。
- 遗留：`main` 还不含这几批，新的发布回读要等 `main` 包含它们才生效；`main` 快进到 `ui-v4` 会同时带上另一个会话的提交（培养路径拉长，未发布），建议随下次发布一起快进。

## 带教「培养路径」横向拉长（2026-10-23，Claude，用户确认原型「按这版收尾」；用户确认截图后与知识库待上架一起发布 nm-20261023-221528-0c9e0fa，回读通过）

用户要求：山拉长到约现在的 3 倍宽，更自然、轻松、不堆在一起；路径以后会重写、关卡可能更多，拉长后要放得下更多细节。用户定下：每周固定宽度；「本周攀登」卡固定右下、可收起。原型直接做在代码里、在隔离环境截图给用户看（没有另出 HTML 稿），用户确认后补测试提交。

- `src/modules/projects/mentor-path.js`：`WEEK_W = 140`、`mapWidth(weeks) = 170 + weeks × 140 + 248`（24 周 3778 宽）；山路起伏幅度 0.45 → 0.7；远山每 420px 一起一伏；云每 4 周一朵、鸟多两群；地平线周次带起始日；`fixedLabels` 不传 `week` 时卡片不在图上；标牌上沿限制 70 → 64（页头高），挨着山顶的最后一关多一行后往上挂才放得下。
- `src/modules/projects/MentorPath.jsx`：地图按 `mapWidth` 定宽；打开时滚到今天（今天尽量在可视区 40% 处，但太阳、登山者、正在爬的营地标牌都要露出来、不压在卡片底下；第一版只放 40% 时卡片盖住了正在爬的 B3）；竖向滚轮换成横向；「本周攀登」卡移出地图、固定在可视区右下，表头加「回到今天」和收起（收起状态记本机 `niuma:m7-week-open`）；标牌加一行「待办 x/y · 产出 a/b」，没解锁的写「n 件要做 · 交 m 份」。
- `src/styles-v3.css`：`.m7-plate` 宽 184 → 200、`.dt` 一行；`.m7-week` 固定右下、480 宽、收起样式与表头按钮。
- `tests/mentor-path.test.mjs`：原有 11 项（V7 定稿 1232 宽的精确位置）保留作窄图算法回归，全部通过；新增 2 项按周定宽——24 周 3778 宽、营地横坐标 = 170 + 结束周 × 140、云 6 朵、周次起始日、卡片不在图上；810 / 699 / 640 高下 13 块标牌全部完整摆开（无小牌）、两两不相交、不出框，绳桥说明不压标牌和文字、绳桥不穿营地。标牌尺寸按页面实测 200×76。`docs/STYLE-GUIDE.md` 第 5 节培养路径同步。
- 测试：`npm test` 716 项里 712 通过、4 项失败，失败的都是 `tests/t10-release-retention.test.mjs` 的发布脚本测试（T10 / T11），原因是另一个会话在本目录的 `scripts/release-app.sh` 改动（发布尾段新调用 `scripts/verify-release.sh`，已由该会话提交为 `b5c212d`，提交后仍是这 4 项失败），与本节无关、未动，发布前要先处理；`tests/mentor-path.test.mjs` 13 / 13；`npm run build`、`git diff --check` 通过。
- 验证：隔离 5291 / 5292（正式库副本 + 假 `lark-cli`），无头 Chrome。三组数据：林瑶真实路径（13 关，B1、A1 超期 6 周）；进度示意（13 关，每条线前两关通关）；20 关（每条线 10 关，前三关通关），后两组用 CDP 拦截接口、只改浏览器收到的返回。三组都 0 块小牌、标牌和文字两两不相交；打开时真实数据滚到 244（超期的 B1、A1 和太阳都在可视区），另两组滚到 1048（今天在左边 210px，正在爬的标牌在卡片左边）；「回到今天」回到同一位置；竖向滚轮 400 → 横向 +400；1280 宽可视 1072；控制台无错误和警告。脚本 `~/Library/Application Support/NiumaHome/evidence/培养路径加宽样稿-20261023/shot-b2.mjs`。
- 截图（不入库）：`docs/handoff/培养路径加宽样稿-20261023/B2-{真实,进度示意,20关}-*.png`（默认、全景、悬停、收起、营地日志、1280）。
- 已知：「本周攀登」卡展开时会盖住它后面一部分未来营地（收起即可看到）；1280 宽打开真实数据时「今天」那行字右侧被可视区截掉一截（太阳在内）。
- 时间：开始时没有用 `date` 记开工时刻，以下按证据文件时间：主工作区测试 22:14:51、发布 22:15:28、页面回读 22:17:12（均为 2026-10-23）。
- 发布（用户同意，与下一节一起）：发布前正式库没有知识库写锁，13 条知识库操作记录为 11 条已核实、2 条已中止，最近收藏为 ok / duplicate，没有结果不明——与上一节「常驻提示可关闭」发布前的数字相同，是本轮自己重新查的（`sqlite3 -readonly` 按 `kind` 数 `kb-write-lock`、按 `payload.state` 分组数 `kb-operation`，`curl` 带 `Origin` 读 `/api/v3/kb/collect/recent`），最近一条操作更新于 10-23 12:41，此后没有新收藏。主工作区 `main` = `ui-v4` = `0c9e0fa`（含上一节三批，上一节遗留的 `main` 快进随本次完成），主工作区 `npm test` 原样结果 `ℹ pass 717` / `ℹ fail 0`（日志 `npm-test-main.log`，同证据目录）；`release-app.sh`（只对这次忽略主工作区别人留下的未跟踪文件）切到 `nm-20261023-221528-0c9e0fa`，自动备份数据库 `backups/work-desk-20261023-221529-before-nm-20261023-221528-0c9e0fa.db`；保留策略清理快照 `nm-20261023-160928-557989a` 和数据库备份 `work-desk-20261023-140120-before-nm-20261023-140119-40c9528.db`。没有表结构改动。日志 `~/Library/Application Support/NiumaHome/evidence/待上架与培养路径发布-20261023/release.log`。
- 回读：发布脚本末尾自动跑 `verify-release.sh` 7 项全过（launchd 与运行中进程指向新快照、只监听 127.0.0.1、首页与 11 个构建文件逐字节一致、快照 153 个源码文件与 `0c9e0fa` 一致、错误日志为空、版本号 `0c9e0fa`）；看完页面后单独再跑一次仍全过，错误日志 0 字节。5280 只读：`/api/v3/mentor/path`、`/api/v3/kb/tree` 均 200；无头 Chrome 1440 宽打开培养路径：地图 3778 宽、可视 1232、打开时滚到 244，太阳、两个登山者、正在爬的 A1 / B1 标牌都在可视区且不压在卡片下；「本周攀登」卡在右下，点收起变成一行、再点展开（只改临时浏览器配置里的本机状态）；标牌多一行「待办 0/3 · 产出 0/2」/「3 件要做 · 交 2 份」；页脚 `0c9e0fa`，无脚本错误，全程无非 GET 请求。脚本 `readback.mjs`、输出 `readback.log`（同证据目录）。
- 截图（不入库）：`docs/handoff/培养路径加宽样稿-20261023/发布后-正式培养路径-1440.png`、`发布后-正式培养路径-本周攀登收起-1440.png`。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-214602-5d45dce`。
- 其他：发布后另一会话往 `ui-v4` 提交了 `46ce673`（只改 AGENTS.md、CURRENT.md），本节提交在它之后；`main` 快进后比正式快照 `0c9e0fa` 多这两个文档提交，不涉及运行代码，无需再发布。
- 本轮新坑：无。

## 知识库「待上架」区加宽（2026-10-23，Claude，用户确认样稿 v4-3；用户确认截图后与培养路径横向拉长一起发布 nm-20261023-221528-0c9e0fa，回读通过）

用户要求：待上架区排版空间要更大，和下面书柜比显得窄小；表头（标题、数字、说明、右侧图例）排得怪。样稿 `docs/design-drafts/kb/v4-3.html`（截图 `shots/v4-3-*.png`，对照 `shots/v4-2-top-*.png`）用户确认「按 v4-3 这版做」。

- `src/modules/kb/KbShelf.jsx`：柜顶表头分两行（「待上架 N 本」/ 说明），图例单独一块（「图例」+ 两行三列）；书摞一排放不下时每摞多叠一本再排（最多 5 本），宽度、字体或待上架的书变了从 3 本重试，书都落在柜顶上（原先 1024 宽下第四摞换行、上一排悬空）。这一条是样稿里加的，用户随样稿确认。
- `src/styles-v3.css`：柜顶上方和书摞上方各 32px、书摞之间 48px、横放书名最长 320px；新表头和图例样式；600 以下图例去掉「图例」字样排三列、不折字，横放书名最长 220px。
- `tests/ui-kb-shelf.test.mjs`：加 4 本一摞的断言。`docs/STYLE-GUIDE.md` 第 5 节知识库书架同步。
- 测试：`npm test` 712 / 712，`npm run build`、`git diff --check` 通过。
- 验证：隔离 5291 / 5292（同上一节，正式库副本 + 假 `lark-cli`），无头 Chrome：1440 为 3 / 3 / 1 三摞，1024 为 4 / 3 两摞，书摞底边都贴着柜顶（差 0px），表头与图例不重叠、页面不横向滚动；1440 → 1024 → 1440 来回切换会重新排回 3 / 3 / 1；390 宽为 5 / 2（5 本封顶后换行）；控制台无错误和警告。脚本 `~/Library/Application Support/NiumaHome/evidence/待上架样稿-20261023/shot-b1.mjs`。
- 截图（不入库）：`docs/handoff/知识库待上架-20261023/B1-待上架-{1440,1024,390}.png`。
- 已知：390 宽下最长那本横放书带书签时右侧比书柜多出约 14px（改前更多），未处理。
- 发布：与上一节一起发布到 `nm-20261023-221528-0c9e0fa`；发布前核对、数据库备份、自动回读和回滚命令见上一节。
- 回读：5280 只读，无头 Chrome 1440 宽打开知识库：柜顶「待上架 7 本」两行表头（标题 / 说明），图例在右上（「图例」+ 两行三列），3 摞共 7 本，底边都落在柜顶（差 0px）；页脚 `0c9e0fa`，无脚本错误，无非 GET 请求。截图（不入库）`docs/handoff/知识库待上架-20261023/发布后-正式知识库-1440.png`。
- 本轮新坑：无。

## 常驻提示可关闭 + 已知小问题（2026-10-23，Claude，用户同意做法、确认隔离截图；已发布 nm-20261023-214602-5d45dce，回读通过）

用户要求：7 处常驻提示改成可关闭；已知小问题都改好。用户选定：提示关掉后「内容变了才再出现」，操作说明类关掉后一直不出现；底栏知识库快捷键换成真实可用的操作；书脊上「｜」换成「·」。

- 新增 `src/ui/dismissible.jsx`（`useDismissed` / `DismissibleNote`，记在本机 localStorage `niuma:dismiss:*`）+ `styles-v3.css` 的 `.has-close`。7 处：`BriefView.jsx`（时间线依据变化）、`BusinessPage.jsx`（更新未完成）、`ReportsPage.jsx`（更新未完成、旧内容）、`UserPage.jsx`（旧格式快照、裁定失效）、`AssistantsPage.jsx`（知识库警告）、`DesignReferences.jsx`（操作说明）、`StrategyView.jsx`（编辑格式提示）。
- 小问题：`MentorPath.jsx` 抽屉 key 改成 `drawer-${who}`（和地图的 `key={who}` 撞，控制台报重复 key），去掉「（示例，可改）」；`App.jsx` 窗口条路径显示页签中文名（`SUB_LABELS`）；`page-info.js` 知识库底栏改为「拖动 · 移到别的层或盒子」「悬停层名 · 改名」；`kb-shelf.js` 新增 `spineText`（书脊上「｜」→「·」，`spineName` / 拆编号不变），`KbShelf.jsx` 书脊用它；`server/kb-collect.mjs` 注释改「待上架」。测试同步：`ui-kb-shelf.test.mjs`、`statusbar-page-info.test.mjs`。
- 测试：`npm test` 712 / 712，`npm run build`、`git diff --check` 通过。
- 验证：隔离 5291（正式库用 `sqlite3 .backup` 抄一份到 scratchpad，`PATH` 里换成直接失败的假 `lark-cli`，全程不连飞书）+ 开发页 5292（开发模式才报重复 key），无头 Chrome 1440 宽。Brief（2026-11 时间线依据变化）、业务（点「重新读取」读飞书失败）、设计参考、用户策略（点「需求温度」进编辑）是隔离库里的真实状态；日 / 周报、时间线异常、Agent 知识库三处用 CDP 拦截接口，换成正式响应副本改过字段的返回（造出旧内容 + 刷新失败、旧格式快照 + 裁定失效、超阈值）。7 处提示都有 ×、点了即关；关掉「3 条裁定失效」后刷新不再出现，改成 4 条刷新后重新出现；设计参考操作说明关掉后刷新不再出现。窗口条显示「带教 / 培养路径」「营销 / 设计 Brief」「策略 / 用户时间」；知识库底栏为新的两条操作；书脊（临时把「00｜知识库使用说明」挪进第一层，只改浏览器收到的返回）显示「00·知识库使用说明」；培养路径开营地日志、切人、开山顶抽屉，控制台 0 条错误和警告（先自检能收到），山顶抽屉无「示例」。脚本 `~/Library/Application Support/NiumaHome/evidence/提示可关闭-20261023/shot.mjs`。
- 截图（不入库）：`docs/handoff/提示可关闭-20261023/`：`01-Brief-*`、`02-业务-*`、`03-日周报-*`、`04-时间线异常-*`、`05-Agent知识库-*`、`06-设计参考-*`、`07-用户策略-*`、`08-知识库-{整页,底栏,书脊间隔号}`、`09-培养路径-{营地日志切人后,山顶抽屉}`，逐项结果在 `_log.txt`。
- 发布（用户同意）：发布前正式库没有知识库写锁，13 条知识库操作记录为 11 条已核实、2 条已中止，最近收藏没有结果不明。`ui-v4` 提交 `5d45dce`，主工作区 `main` 从 `10735ca` 快进到 `5d45dce`，主工作区 `npm test` 712 / 712；`release-app.sh`（只对这次忽略主工作区别人留下的未跟踪文件）切到 `nm-20261023-214602-5d45dce`，自动备份数据库 `backups/work-desk-20261023-214604-before-nm-20261023-214602-5d45dce.db`；保留策略清理快照 `nm-20261023-154130-632cb0a` 和一份 10-23 13:54 的数据库备份。没有表结构改动。
- 回读：launchd 指向新快照、运行中；首页、JS、CSS 与快照逐字节一致；74 个 server 文件与 `5d45dce` 一致；错误日志 0 字节（看完页面后复查仍为 0）。5280 只读：`/api/v3/mentor/path`、`/api/v3/kb/tree`、`/api/v3/business/revenue`、`/api/v3/briefs/2026-11` 均 200；无头 Chrome 只打开不点击：知识库底栏为新的两条操作，窗口条「带教 / 培养路径」「营销 / 设计 Brief」，Brief 页提示带 ×，无脚本错误，页脚 `5d45dce`。截图 `docs/handoff/提示可关闭-20261023/发布后-{正式知识库,正式培养路径,正式设计Brief}-1440.png`，脚本 `readback.mjs`（同证据目录）。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-201727-64a1f6c`。
- 用户同时提的新需求：知识库「待上架」区排版太挤、表头排得怪（样稿 `docs/design-drafts/kb/v4-3.html` 用户已确认，下一步实现）；培养路径横向拉长到约 3 倍、每周固定宽度、本周攀登卡固定右下可收起（待出样稿）。

## 带教「培养路径」接上真实数据 T14（2026-10-23，Claude，用户定下做法并同意 4 批计划，表单样稿与截图已确认；已发布 nm-20261023-201727-64a1f6c，回读通过；两人的路径已导入正式数据）

用户定下（同日）：路径定义和评分全放工作台本地，不接飞书；营地日志里能评分，先看表单样稿；每位管培生一份路径（以后还会加人）；「打开产出物」改成产出物每行一个「打开」；没评分的显示「—」「未评分」。默认假设：两人先用示例那 13 关做起点（分数不导入），2026-09-01 入职、24 周、70 分通关、评分人常浩；最近一次评分 ≥ 通关线即通关。详见 [docs/tasks/T14-培养路径真实数据.md](docs/tasks/T14-培养路径真实数据.md)。

- 与计划不一致（已告知用户）：计划写在 SCHEMA 里加两张表，实际复用 `v3_documents`（kind `mentor-path` 存定义、`mentor-camp` 存营地记录），沿用现成的 `createLocalChanges` 做预览 / 确认 / 回读，没有表结构改动。
- `server/mentor-path.mjs`（新）：路径定义校验（两条线依次 biz、ai，id 不重复，周次在赛季内且一关排在上一关之后，评分项权重合计 100，跨线依赖必须连两条线）；`derivePath` 由营地记录推出分数（每一项都有分才算）、状态（≥ 通关线通关，前一关和绳桥依赖都通关才解锁）、`todoChecked` / `outLinks` / 待评分 `review`（进行中、交了产出，且没评过或产出在评分之后更新过）；营地记录写入（每一项都打分才算一次评分，全部留空只更新进度；评分项改了才更新评分时间，链接改了才更新产出时间；旧记录进 history 最近 20 条）；`today` 按北京时间。
- `server/routes/projects.mjs`：`GET /api/v3/mentor/path` 接上服务；新增 `POST /api/v3/mentor/path/:name/nodes/:id/record/preview` 与 `.../record`。接口形状改动：`season` 从顶层挪进每人的 `path`（各自入职日）；关卡新增 `todoChecked`、`outLinks`、`review`。`docs/API.md` 已同步。
- `docs/培养路径/林瑶.json`、`胡贵兰.json`（新）：两人的路径种子（示例 13 关定义，不含分数，内容相同）。`scripts/import-mentor-path.mjs`（新）+ `npm run import:mentor-path -- <姓名> [--file 路径] [--confirm]`：默认只预览（目标、赛季、关卡数、与现有定义的差异、失去对应关卡的营地记录），`--confirm` 才写入并回读；只换定义，不动营地记录。
- `src/modules/projects/MentorPath.jsx`：赛季按当前选中的人算；营地记录表单（勾要做的事、产出物链接、逐项打分与评语）接写入接口，预览由后端给（各项旧值 → 新值、总分与星数、状态变化、解锁 / 回锁、还要等哪一关），确认后回读整份路径、这一关与预览一致才算保存，页面按回读结果重画、抽屉不关；产出物有链接的那一行显示「已交 / 初稿」和「打开」，去掉「打开产出物」按钮；地图标牌、本周攀登、营地日志、山顶抽屉未评分显示「—」「未评分」。`mentor-path.js`：待评分改用后端的 `review`。`styles-v3.css`：表单、未评分、打开链接样式。
- `src/samples.js`：删掉 `MENTOR_PATH_SAMPLE`，「示例」标识随之消失；布局测试改用 `tests/helpers/mentor-path-sample.mjs`。
- 测试：`tests/mentor-path-data.test.mjs`（新）11 项——定义校验、推导（无记录、通关线、缺项、绳桥、措辞改动、待评分先后、星数、超期）、GET 接口与北京时间、导入（重复确认、预览后变化 409、失去对应关卡的记录）、导入脚本端到端、营地记录写入（预览不写入、确认回读、解锁 / 回锁、历史、各类 400 / 404 / 409、预览后别的记录变了 409）。`npm test` 712 / 712（ui-v4 与主工作区各跑一次），`npm run build` 通过。
- 验证：隔离 5291 / 5292（scratchpad 数据目录，导入两人路径并写测试评分；本目录预览名额被其他会话占满，改在终端标签页起服务），无头 Chrome（CDP 脚本已存 `~/Library/Application Support/NiumaHome/evidence/T14-培养路径导入-20261023/shot*.mjs`）。实测：B3 评 77 分 → 后端预览「进行中 → 已通关，解锁 B4；A3 还要等 A2 达到 70 分」→ 确认 → 回读一致，页头 3/13 关、5 星；B4 解锁后标牌「未评分 · W9 截止」；A1 只交产出 → 「只更新进度」→ 1 份待评分；林瑶 / 胡贵兰切换、各自第 8 周。
- 截图（不入库）：`docs/handoff/T14-评分表单样稿-20261023/`（第 1 批样稿 0–6）、`docs/handoff/T14-培养路径真实数据-20261023/`（10–17 隔离实测，20 正式环境导入后）。
- 发布（用户同意）：`ui-v4` 提交 `64a1f6c`，主工作区 `main` 从 `5b788e0` 快进到 `64a1f6c`；`release-app.sh`（只对这次忽略主工作区别人留下的未跟踪文件）切到 `nm-20261023-201727-64a1f6c`，自动备份数据库 `backups/work-desk-20261023-201728-before-nm-20261023-201727-64a1f6c.db`；保留策略清理快照 `nm-20261023-153952-c470026` 和一份 10-23 10:38 的数据库备份。
- 回读：launchd 指向新快照、运行中；首页、JS、CSS 与快照逐字节一致；快照 `server/` 与 `64a1f6c` 一致；错误日志 0 字节；5280 `/api/v3/mentor/path` 200、导入前两人 `path` 为 null，页面「还没有培养路径」、无「示例」，页脚 `64a1f6c`。
- 正式数据导入（用户看过预览后同意）：主工作区 `npm run import:mentor-path -- 林瑶 --confirm`、`胡贵兰 --confirm`，均「已写入，回读核对一致」，再预览为「没有变化」；正式库此前没有路径与营地记录。5280 回读：两人都可选、第 8 周，B1、A1 进行中「未评分 · 超期 6 周」，其余未解锁，0/13 关、0 星、0 份待评分。证据：`~/Library/Application Support/NiumaHome/evidence/T14-培养路径导入-20261023/`（`import.log`、`db-readback.txt`、`api-after-import.json`）。
- 唯一下一步：用户在营地日志里补录两人已经评过的分（导入后前几关会如实显示超期）。路径内容要改时改 `docs/培养路径/<姓名>.json`，再跑导入脚本（先预览）。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-191138-96f1c71`（旧快照的接口仍是 `pending("T14")`，培养路径页回到示例数据；已导入的路径和营地记录留在库里，不影响别的页面）。
- 范围外发现（未动）：山顶抽屉「结业时看什么（示例，可改）」是写死的说明文字，带「示例」二字；打开任何营地日志抽屉（含大本营）开发控制台报一次「两个子元素 key 重复（值为 0）」，V7 原有。
- 设计稿：T14 做完后，按用户要求把业务页、知识库、带教三组设计稿（`docs/design-drafts/`，91 个文件约 18MB，含截图和设计稿用的数据快照）一起提交入库；各节里写的「本地，不入库」只代表当时。

## 带教「培养路径」V7 远征登山（2026-10-23，Claude，用户定稿 V7 并同意 4 批计划；第 1–3 批已提交，用户确认截图后已发布 nm-20261023-191138-96f1c71，回读通过）

用户要求（同日）：「V7 就按现在这版定稿」，另开会话实现并发布。稿件（本地，不入库）：`docs/design-drafts/mentor-path/v7.html` + `_shared/`、截图 `shots/v7*.png`；细节备忘在会话共享笔记 `~/Library/Application Support/Claude/side-session-notes/local_78c266b8-9b8c-4c3c-8986-a13056a783f1/v7-细节收尾.md`。
用户确认的做法：保留工作台侧栏，地图定宽（最小 1232，即 1440×900 下的主区宽），窗口窄时横向滚动；地图插画（旗、帐篷、城堡、登山者、云、松树）收进 `src/ui/bitmap.jsx` 做公共件；本轮先用示例数据，`GET /api/v3/mentor/path` 写 `pending("T14")`，真实来源下一轮再定。第 3 批做完截图给用户，确认后发布。

- 第 1 批（已提交）：`src/modules/projects/mentor-path.js`（新）——季度时钟（UTC 算日期，宿主时区不影响）、关卡文字（超期、解锁条件、待评分）、`layout()`（山形、营地平台、山脊、登山者、实线 / 虚线、积雪、绳桥弧度避让、地平线刻度）、`fixedLabels()`、`placePlates()`（标牌避让 + 小牌）、`plateStyle()`、`placeRopeLabels()`、`pines()`、`slopeOf()`，全部照稿子移过来、不碰 DOM。`src/samples.js` 加 `MENTOR_PATH_SAMPLE`（稿子的模拟数据；测试要用，从第 2 批提前）。`tests/mentor-path.test.mjs`（新）11 项：用稿子在 Chrome 实测的尺寸，1232×814 / 1232×710 下标牌位置、小牌、绳桥弧线与说明、松树、登山者坐标都与稿子一致；标牌、引线、固定文字两两不相交、不出框；绳桥不穿过别的营地。`npm test` 701 / 701 通过；界面未变。
- 已知（稿子同样）：1232×814 下悬停 B3 / A3 时「绳桥 B3 访谈纪要 → A3」说明压到 A1 旗子右边约 14px；沿整条绳桥都没有空位，保留稿子的做法。
- 第 2 批（已提交）：`src/ui/bitmap.jsx` 加「像素插画」一节——`SPRITES`（旗、帐篷、城堡、松树、鸟、云、登山者两帧）、`SpriteCells`（画在已有 SVG 里，左上角取整，可加 2px 底色贴纸边）、`PixelSprite`（单独一张，图例和抽屉用）；文件头「像素只出现在这些地方」加上培养路径插画。`src/ui/icons7.js` 补 `flag`、`crown`（标牌、抽屉标题里的小图标，照常走 `PixelIcon`）。`server/routes/projects.mjs` 加 `GET /api/v3/mentor/path` → `pending("T14")`。`docs/API.md` 加「带教 · 培养路径（T14）」约定形状；`docs/tasks/T14-培养路径真实数据.md`（新）记待定事项。测试加 1 项（接口 501 + T14），`npm test` 702 / 702，`npm run build` 通过。
- 第 3 批（已提交，用户确认截图）：`src/modules/projects/MentorPath.jsx`（新）——整页横向全景（`.main` 去掉内边距，地图最小 1232 宽、窗口窄时横向滚动；页头和抽屉固定在可视区）；SVG 地图（天空、网点山、积雪、松树、两条路、绳桥、营地、大本营、山顶、地平线）；标牌和固定文字先排版量尺寸（完整 / 小牌各量一次，字体加载完重量）再交给 `placePlates` 摆；悬停高亮整段坡、相关绳桥与说明，小牌悬停展开；营地日志抽屉（三帧滑入，上一 / 下一营地按钮、← →、Esc、×），山顶 = 结业条件，大本营 = 规则；登山者两帧按帧挥手（减少动态时静止）；「本周攀登」卡与图例；页头管培生切换（没有路径的人置灰）、关键数字、「示例」标识。评分、打开产出物为 `PendingButton`（T14）。`ProjectsPage.jsx`：`MentorPage` 加页签「带教答疑 / 培养路径」（`#/mentor` 仍是答疑，原说明文字不变，只多一行页签；`#/mentor/path` 是新页）。`src/ui/bitmap.jsx` 加 `DitherPattern`（SVG 网点填充，同一套 Bayer 阈值）。`src/styles-v3.css` 末尾加 `.m7-*` 一节（照稿子，类名统一换成 `m7-` 前缀，避开已有的 `.mp-*`）。`docs/STYLE-GUIDE.md` 第 3 节补插画、第 5 节加「带教 · 培养路径」（写明突破了哪些规则）。`npm test` 702 / 702，`npm run build`、`git diff --check` 通过。
- 验证：隔离 5290（scratchpad 临时数据目录；这个目录的预览名额被其他会话占满，改用后台命令起服务），无头 Chrome（CDP 脚本 `~/Library/Application Support/NiumaHome/evidence/带教V7-20261023/shot.mjs`，截图前跑几何检查）。1440×900：地图 1232×810，A1、A2、B5 小牌，标牌 / 卡片 / 文字两两不相交、无出框，页面本身不滚动。1280×800：可视 1072、地图 1232 可横向滚动，地图高 699（细滚动条占 11px），A1、A2、B6 小牌，无相交、无出框；没有滚动条占位时（macOS 叠加滚动条）高 710，只有 A1、A2 小牌。交互逐项实测：悬停标牌 / 营地高亮坡与绳桥、小牌展开收回、点营地 / 标牌 / 本周攀登行开抽屉、← → 与按钮换营地、B7「山顶」禁用、Esc / × 关闭、山顶与大本营抽屉、林瑶置灰、答疑页签与内边距恢复。控制台只有占位接口预期的 501。
- 截图（不入库）：`docs/handoff/带教V7-20261023/第3批-{默认,悬停B3,营地日志B4,山顶}-{1440,1280}.png`、`第3批-{小牌展开A1,营地日志B5方向键,大本营,答疑页签}-1440.png`、`第3批-右滑-1280.png`。
- 与验收标准不一致：「1280 下 A1、A2、B5 收小牌」是稿子舞台（1224×740）的结果；按用户选的「保留侧栏、地图定宽」，1280 下地图是 1232×699 / 710，B5 放得下完整标牌，收小牌的是 A1、A2（有滚动条时加 B6）。
- 已知小问题（稿子同样）：小牌悬停展开时临时盖住旁边标牌（A1 展开盖住 A2，移开即收回）；1440 下悬停 B3 / A3 时绳桥说明压到 A1 旗子右边约 14px。
- 范围外发现：窗口条路径显示路由原文「niuma-home / 带教 / path」（`App.jsx` 统一取 `route[1]`，项目页同样显示 board / campaign），未动。
- 发布（用户同意）：主工作区 `main` 从 `2ad163a` 快进到 `96f1c71`，主工作区 `npm test` 702 / 702；`release-app.sh`（只对这次忽略主工作区别人留下的 4 项未跟踪文件）切到 `nm-20261023-191138-96f1c71`，自动备份数据库 `backups/work-desk-20261023-191139-before-nm-20261023-191138-96f1c71.db`；保留策略清理快照 `nm-20261023-150835-4309174` 和一份 10-23 10:27 的数据库备份。没有表结构改动。
- 回读：launchd 指向新快照、运行中；首页、JS、CSS 与快照逐字节一致；73 个 server 文件与 `96f1c71` 一致；错误日志 0 字节（看完页面后复查仍为 0）。5280 只读：`/api/v3/mentor/path` 501 + T14（页面显示示例），`/api/v3/mentor` 200。无头 Chrome 只读打开 5280：培养路径 1440（地图 1232×810，A1、A2、B5 小牌）、1280（可视 1072 横向滚动，地图 1232×710，A1、A2 小牌），点开 B4 营地日志，答疑页签；几何检查无相交、无出框，无脚本错误；页脚 `96f1c71`。截图 `docs/handoff/带教V7-20261023/发布后-{正式培养路径-1440,正式培养路径-1280,正式营地日志B4-1440,正式答疑页签-1440}.png`。隔离 5290 已停。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-172917-cdfef96`。
- `docs/design-drafts/` 未改动、未提交（按用户要求，由主会话之后把业务页、知识库、带教三组设计稿一起提交）。

## 知识库页改为书架（2026-10-23，Claude，用户从三轮设计稿选定「V4 书架精修」并同意 4 批计划；第 1–4 批已提交；用户同意后已发布 nm-20261023-172917-cdfef96，回读通过；插件已同步，待用户在 chrome://extensions 重新加载）

用户要求（同日）：文件夹里只露两篇看不清、散卡区和文件夹区各是各的。三轮设计稿后选定 V4 书架精修版，要求竖排文字对齐、页面干净、注意细节。稿件（本地，不入库）：`docs/design-drafts/kb/v4-2.html`、总览 `index.html`、截图 `shots/v4-2-*.png`；实现规则备忘在会话共享笔记 `~/Library/Application Support/Claude/side-session-notes/local_1da347e0-4601-4d99-ba30-f08824a7f00d/kb-shelf-v4-2.md`。
用户确认的做法：Chrome 插件里「散卡区」那句一起改成「待上架」；每批做完就提交（只含本批文件、不推送）；第 2、3 批给用户看截图；全部做完、用户同意后再发布。后端、接口、数据库不动，写飞书沿用现有队列（拖完即写、一次一项、回读、结果不明锁住）。

- 第 1 批（已提交）：`src/modules/kb/kb-shelf.js`（新）——书名清理（去彩色 emoji、书脊去扩展名、拆编号）、竖排切词（两位以内横排一格 / 3–4 位数字与全大写缩写竖立 / 其余侧转）、词起点（`Intl.Segmenter` + 不拆词表）、断列（字宽由页面实测传入；按分隔符、中英文交界、词边界选断点，不留单字列，日期连字符与「7月」不拆，三列放不下截断）、系列（同前缀 / 后缀并组）、一层摆放（档案盒在前、系列挨着）、装行、柜顶书摞、近 3 天更新。`tests/ui-kb-shelf.test.mjs`（新）8 项，覆盖稿件里核对过的书名断法。`npm test` 690 / 690 通过；界面未变。
- 第 2 批（已提交，用户确认截图）：`src/modules/kb/KbShelf.jsx`（新）——两格书柜、等高书、竖排按隐藏竖排元素实测字宽断列（字体加载完重算）、系列括号、书尾类型、近 3 天书签、档案盒 / 敞口盒（书逐帧取出；盒中盒在原盒里进入、盒盖写路径可逐级返回，用户 10-23 同意）、柜顶「待上架」书摞、图例、悬停 / 聚焦两帧抽出再弹卡、搜索收起没命中的层并自动开盒、⌘K 打开某篇时开盒抽出弹卡。`KbCanvas.jsx`：工具栏并成一行，去掉分组标签条，散卡区 / 文件夹格 / 抽屉 / 横版卡换成书柜；写入队列、锁住核对、同步、最近收藏不变；「新建分组」暂禁用，拖放、改名第 3 批接。`styles-v3.css`：新增 `.kbs-*` 书柜样式，删不再用的 `.kbf-*`。`kb-canvas.js` 删掉不再用的 `pose`（原计划第 4 批，提前到让它变孤儿的这批），`tests/ui-kb-canvas.test.mjs` 同步删断言。`npm test` 690 / 690，`npm run build`、`git diff --check` 通过。验证：隔离 5292（临时数据目录，只抄入正式的 `kb_space_id`、`kb_collect_rules` 和分组顺序；经 lark-cli 只读读飞书，首次请求 502 一次、重试正常），无头 Chrome 截图 `docs/handoff/知识库书架-20261023/第2批-{默认-1440,开盒悬停-1440,搜索营销-1440,命令跳转-1440,默认-1024}.png`。范围外发现：底栏在知识库页列出 ⌘Z / ⇧⌘N / F2 / ⌘X ⌘V 快捷键（`src/modules/statusbar/page-info.js` 的 `KB_KEYS`），但从来没有实现，未动。
- 第 3 批（已提交，用户确认截图）：`KbShelf.jsx` 接上拖放——书 / 整个盒子拖到层、盒（含敞口盒当前这一层、盒中盒）、柜顶 = 飞书移动；拖层名到另一层 = 排到它前面（只存本机）；放回原处、盒子放进自己或子盒不算落点，也不让外层接走。拿起的书原位留灰色虚线空位（下一帧才变，拖影保持原样），落点出现橙色虚线「放这里」（柜顶是「放回柜顶」、层名排序是层名橙色虚线框），写入中的书标「同步中」，落定后那一层层名反色闪两下。层头悬停出现「改名」「本页正文」（换掉篇数和更新）；敞口盒盒盖加改名（铅笔）、本页正文图标；「新建分组」在书柜末尾加一层空层、层名处输入，回车在飞书根目录新建。锁住或同步中不能拖、不能改名、不能新建。`KbCanvas.jsx`：把写入中的 id、落定目标、锁住状态、改名输入框和移动 / 排序 / 改名操作交给书柜，写入队列本身不变。`styles-v3.css`：拖放、写入中、层头操作、盒盖按钮样式。`npm test` 690 / 690，`npm run build`、`git diff --check` 通过。验证：scratchpad 演示服务（真服务代码 + 假 lark-cli 执行器 + 10-23 快照，外加一个演示用盒中盒；PATH 里的 lark-cli 换成直接失败的假命令，全程不连真实飞书），无头 Chrome 合成 HTML5 拖放，在 1440、1024 两个宽度各从干净数据跑一遍 15 项检查全部通过（拖动中、写入中、成功回读与层名闪两下、失败退回、结果不明锁住→只读核对、盒中盒、整盒移动、层名排序、新建分组、层名与盒子改名、无脚本错误）。脚本与结果在 `~/Library/Application Support/NiumaHome/evidence/知识库书架-20261023/`；截图 `docs/handoff/知识库书架-20261023/第3批-{拖动中,写入中,写入成功,失败退回,结果不明锁住,只读核对,盒中盒,层名排序,新建分组}-{1440,1024}.png`。验证完已停掉 5292（连真实飞书）和 5293 演示服务。观察：带编号的书（「00｜知识库使用说明」）放进层里后，竖排书脊上的「｜」按竖排规范转成横线，看起来像「一」，未改。
- 第 4 批（已提交）：「散卡」统一为「待上架」——最近收藏弹窗提示（`CollectPage.jsx`，含文件头注释）、`docs/API.md` 两处、插件 `browser-extension/niuma-collect/content.js` 归类不明确那句，以及 `kb-canvas.js` 注释和 `tests/ui-kb-canvas.test.mjs` 测试名；后端 `server/kb-collect.mjs` 第 83 行注释仍写「画布散卡区」，按「后端不动」没改。插件安装目录 `~/Library/Application Support/NiumaHome/extension/niuma-collect/` 在发布那一步同步（和正式页面一起换字），之后用户在 chrome://extensions 重新加载。`docs/STYLE-GUIDE.md` 第 5 节加「知识库书架」（书柜、书、类型、系列、档案盒、待上架、悬停卡、搜索、拖放）。`pose` 已在第 2 批删除。`npm test` 690 / 690，`npm run build`、`git diff --check`、`node --check content.js` 通过。截图：`docs/handoff/知识库书架-20261023/第4批-最近收藏-1440.png`（演示服务）。
- 发布（用户同意）：发布前正式库没有知识库写锁，最近收藏没有结果不明。主工作区 `main` 从 `02437fd` 快进到 `cdfef96`（一起带上业务页 V3 趋势 `a7e7725`，用户同意一起发布），主工作区 `npm test` 690 / 690；`release-app.sh`（只对这次忽略主工作区别人留下的未跟踪文件）切到 `nm-20261023-172917-cdfef96`，自动备份数据库 `backups/work-desk-20261023-172918-before-nm-20261023-172917-cdfef96.db`；保留策略清理快照 `nm-20261023-142435-dc8d821` 和一份 10-22 数据库备份。
- 回读：launchd 指向新快照、运行中；首页、JS、CSS 与快照逐字节一致；73 个 server 文件与 `cdfef96` 一致；错误日志为空（看完页面后复查仍为 0 字节）。5280 只读：`/api/v3/kb/tree` 200（路觅策略知识库，19 个根节点、56 篇），`/api/v3/kb/layout` 7 项与发布前一致，`/api/v3/business/charts` 200。无头 Chrome 只读打开 5280 知识库页（1440 / 1024）显示书柜、页脚 `cdfef96`，业务页显示 V3 趋势；没有拖动、没有写入。截图 `docs/handoff/知识库书架-20261023/发布后-{正式知识库-1440,正式知识库-1024,正式业务页-1440}.png`。
- 插件：只有 `content.js` 那一句不同；旧版备份到 `~/Library/Application Support/NiumaHome/evidence/知识库书架-20261023/extension-before/` 后覆盖，安装目录与主库 `browser-extension/niuma-collect/` 逐文件一致。需要用户在 chrome://extensions 点「重新加载」才生效。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-160928-557989a`；插件回滚把上述备份拷回安装目录。

## 业务页营收与转化趋势改为 V3 聚焦式（2026-10-23，Claude，用户从三版稿中选 V3、去掉「趋势与构成」标题，同意分批计划与三项默认做法，第 1、2 批截图已确认；已提交 a7e7725，用户同意后随知识库书架一起发布 nm-20261023-172917-cdfef96，回读见知识库书架那一节）

用户要求（同日）：扇形图在扇面上读不出内容，营收转化趋势部分全部重做；三版稿见 `docs/design-drafts/business/`（本地，不入库），选定 V3。默认做法：保留「按日均推算月底」并标「示意」；地区写法不统一（中国香港 / 中国(香港)、澳洲 / 澳大利亚）先原样显示；每张卡保留折叠的「数据口径与完整数值」。

- `src/modules/business/BusinessCharts.jsx`：重写。营收完成度卡下直接是切换栏（总营收 / 大学辅导 / 国际课程 / 申诉服务，默认总营收、不记忆），右侧为更新时间、重新读取、在飞书查看；左边趋势大图（今年实线、去年灰虚线、每点标值、线尾写年份、下排同比，翻倍以上写 ×N），右边读数栏（至今、推算、累计同比、今年最高）。总营收视图下方为转化率图 + 三线占比条；业务线视图下方为 SKU / 地区面积块（名称、占比、金额写在块里，写不下的列在块下，「其他」按真实占比铺网点）+ 学校前 10（国课为科目一级空状态）。删除扇形图与旧图例。
- `src/modules/business/chart-math.js`（新）：刻度、当月判断（用接口的 `period` / `updatedAt`，不用浏览器时间；月末视为整月）、推算、同口径累计、前 N 名 + 其他、面积块排布。
- `src/modules/business/business-charts.css`：整份重写；业务线色沿用完成度进度条（大学红、国课绿、申诉蓝），只在 `.business-charts` 内定义变量；当月列网点用 SVG pattern；无 CSS transition。
- `tests/business-chart-math.test.mjs`（新）：8 条，覆盖当月判断、推算、缺月、跨年、转化率、刻度、其他合计、面积块面积与边界。
- 接口、后端、营收完成度卡、`docs/API.md` 未动。
- 测试：`npm test` 682 / 682 通过；`npm run build`、`git diff --check` 通过。
- 验证：隔离 5290（空临时数据目录，首次打开经 `lark-cli` 只读读取飞书）；Chrome 无头按 1440 / 1024 宽逐个视图截图，看过的截图无错位、无横向溢出。
- 截图（不入库）：`docs/handoff/业务页V3-20261023/`：`第1批-*`、`第2批-{总营收,大学辅导,国际课程,申诉服务}-{1440,1024}.png`。
- 与稿件不同：稿件里「其他」单独占一列、最少 104px，会把 1.2% 画得比 10% 还宽，实现时改成按真实占比参与排布。
- 遗留：业务页数据过期常驻提示仍在「等用户定」清单里，未动。

## 第 2 批：时间线多年份与 2027 入口（2026-10-23，Claude，用户同意方案与三条默认做法并确认；已发布 nm-20261023-160928-557989a，回读通过）

用户问题：录入 2027 年时间表没有入口。原来只有一个来源设置且年份写死 2026，直接换表会把无年份日期当 2026、丢掉 2026 数据、人工裁定按格子位置串年。

- `server/timeline.mjs`：新增 `timelineSources` / `timelineIdentity`（首年 = `timeline_source`，后加 = 设置 `timeline_years`）；`parseTimeline` 支持按年份与标记解析（代码 `UK@2027`、来源格 `2027·…`）；新增 `mergeTimelines`，同步依次读全部年份后合并并带 `years`。只登记首年时身份与来源格同旧版。
- `server/timeline-calendar.mjs`：月历来源格同样带年份前缀。
- `server/timeline-years.mjs`（新）：链接解析（`/wiki/` 用 `lark-cli wiki +node-get`、`/sheets/` 读工作簿信息，固定 codex user，只读）+ 登记预览 / 确认（校验表名年份、4 张地区明细、重复年份与重复表、预览后配置变化），确认后写设置、回读、同步。
- `server/routes/user.mjs`：`POST /api/v3/timeline/years/preview|confirm`。`server/user-strategy.mjs`、`price.mjs`、`source-status.mjs`、`timeline-rulings.mjs` 改用统一身份 / 首年来源。`server/v3-settings.mjs`：`timeline_years` 只读。
- 前端：`src/modules/user/TimelineYears.jsx`（新）年份弹窗——列已登记年份（表名、学校、日期、AI 推测数），粘链接「检查」→ 预览 →「确认登记并同步」→ 回读；`UserPage.jsx` 工具栏加「年份 2026 · 2027」按钮，按月视图国家按钮去重，明细表多年时按年份切换，AI 推测多年时按年份筛（待核格子键带年份）；`command-index.js` 同一学校只列一次；设置页只读展示「时间线后加年份」；`styles-v3.css` 弹窗输入框样式。
- 文档：`docs/API.md` 新增「时间线多年份」一节。
- 测试：新增 `tests/timeline-years.test.mjs` 4 项（首年身份不变、预览不写 / 确认后两年并存且代码与来源格带年份 / 来源状态 ok、重复年份与无年份表名与地区表不全与配置变化均拒绝、首年裁定不影响次年同格）；`tests/v3-batch1.test.mjs` 字段清单加 `years`。`npm test` 674 / 674，构建、`git diff --check` 通过。
- 验证：正式库副本（推送关闭，用完已删）。① 隔离服务对真实飞书只读解析：粘 2026 链接返回「2026 年已经登记过时间表」，非飞书链接被拒，设置未写入。② 演示服务（5298，scratchpad 脚本，用真实 2026 表内容冒充「2027海外大学时间线」）无头浏览器走完：检查预览（2027 · 4 张地区明细 · 12 张月历 · 77 校 · 1058 条日期 · 323 条待核）→ 确认登记并同步 → 回读一致，年份表出现 2026 / 2027；明细表 2027 切换、AI 推测 2027 筛选正常。演示数据会让 2026 月份出现重复事件，属演示伪造，未用于判断。
- 截图（不入库）：`docs/handoff/第2批-时间线年份-20261023/` 1–7。
- 发布：提交 `557989a`（只含第 2 批文件；工作区里业务页会话未提交的 `src/modules/business/*` 未带上）→ main 快进，主工作区 `npm test` 674 / 674；`release-app.sh` 切到 `nm-20261023-160928-557989a`（自动备份数据库；保留策略清理快照 `nm-20261023-140119-40c9528` 和一份 10-22 数据库备份）。
- 回读：launchd 指向新快照、运行中；首页、JS、CSS 与快照逐字节一致；73 个 server 文件与 `557989a` 一致；错误日志为空。正式库没有 `timeline_years`；时间线 `years` 只有 2026，议程 1133 条、异常 320 条（待核 190）与发布前一致，来源格无年份前缀；用户策略依据仍为 changed（发布前即如此，身份未变）；来源状态 ok。对 5280 预览登记 2026 链接返回「2026 年已经登记过时间表」，设置未写入。5280 用户时间页显示「年份 2026」，弹窗列出 2026 一行（77 校 · 1058 条 · 320 条），页脚 `557989a`。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-154130-632cb0a`。
- 待用户：真实 2027 表建好后，在「用户时间 → 年份」粘链接登记。2027 年格子没有官网核验记录，全部从 AI 推测待核开始。
- 未做：移除已登记年份（未要求）；登记错了目前只能改设置库。

## 第 1 批：策略页与 Voice 模拟数据（2026-10-23，Claude，用户同意分批计划与默认做法并确认截图；已发布 nm-20261023-154130-632cb0a，回读通过）

用户要求（同日）：AI 推测不与时间轴、明细表并列；删「显示来源单元格」；策略页常驻提示要可关；Voice 未接真实数据前用模拟数据（含首页）。促销打法不动。第 2 批（2027 时间线入口）、第 3 批（带教培养路径 5 版、知识库 3 版、业务图表 3 版设计稿）待做，设计稿已提成三张会话卡。

- `src/modules/user/UserPage.jsx`：视图切换只剩「按月 · 时间轴 / 按国家 · 明细表」；工具栏右侧加「AI 推测 N 条待核」入口（`.tl-guess-entry`），同步后照常生成待核项。删掉显示来源开关及其控制的条上来源、明细「来源」列、月历原文对照、明细格来源小字；悬停提示与日期详情里的「来源」一并去掉；AI 推测核对页保留来源格（纠错要定位原格）。
- `src/modules/user/StrategyView.jsx`：时间线依据提示改成 `EvidenceNotice`——与时间线一致时不显示；有变化或缺快照时显示并带 ×，关掉后按「状态 + 指纹」记在本机 localStorage（只重新同步不会再弹），依据再变才重新出现。
- `src/samples.js` 新增 `voiceSample()`（字段同 `/api/v3/voice`，七天日期按今天推）；`src/modules/voice/VoicePage.jsx` 在来源不可用时显示模拟热榜并加虚线「模拟数据」说明条，模拟话题不能转需求；`src/modules/home/HomePage.jsx` 留学之声卡同样显示模拟词云与摘要并标「示例 · 模拟数据」。来源接通或真实空榜时按原逻辑。
- `src/styles-v3.css`：新增 `.tl-guess-entry`、`.us-warn-close`、`.voice-sample-note`；删除不再使用的 `.tl-calendar-reference`；`src/styles-layout.css` 删 `.tl-cell-source`。
- 测试：`npm test` 670 / 670 通过，`npm run build`、`git diff --check` 通过（这批没有新增测试：都是前端展示）。
- 验证：隔离 5290 + 正式库 `.backup` 副本（`codex_push_enabled` 写 0，用完已删）；Chrome 无头 1440 宽，改前对照 5280。点 × 后刷新提示不再出现；Voice 页「转为主线需求草稿」为禁用。
- 截图（不入库）：`docs/handoff/第1批-策略与Voice-20261023/`。
- 发布：提交 `c470026`（第 1 批）→ main 快进，主工作区 `npm test` 670 / 670，发布 `nm-20261023-153952-c470026`。回读时发现提示的关闭记录含同步时间、每次重新同步都会再弹，补提交 `632cb0a`（只按状态 + 指纹）后再次测试 670 / 670 并发布 `nm-20261023-154130-632cb0a`。两次发布都自动备份数据库；保留策略清理快照 `nm-20261023-103847-3200d0e`、`nm-20261023-135430-426b4ab` 和两份 10-22 的数据库备份。
- 回读：launchd 指向 `nm-20261023-154130-632cb0a`、运行中；首页、JS、CSS 与快照逐字节一致；72 个 server 文件与 `632cb0a` 一致；错误日志为空；时间线、用户策略、自言自语、业务图表接口均 200。5280 实看：用户时间工具栏只剩两种视图 + 「AI 推测 190 条待核」入口，无「显示来源单元格」；用户策略提示带 ×，点掉后刷新不再出现；Voice 显示模拟数据说明条，「转为主线需求草稿」禁用；页脚版本 `632cb0a`。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-150835-4309174`（第 1 批之前）。
- 其他页面常驻提示清单（只列不改，等用户定）：Brief 页时间线依据变化提示（`BriefView.jsx:162`）、业务页数据源过期提示（`BusinessPage.jsx:33`）、日 / 周报「更新未完成 / 旧内容」（`ReportsPage.jsx:61,85`）、AI 推测页旧格式与裁定原格已改提示（`UserPage.jsx` Anomalies）、Agent 页知识库警告（`AssistantsPage.jsx:73`）、知识库「拖进下面的文件夹」提示（`KbCanvas.jsx:308`，随知识库重设计一起定）、设计参考操作说明（`DesignReferences.jsx:89`）、用户策略各节编辑提示（`StrategyView.jsx` HINT）。
- 范围外发现：`server/user-strategy.mjs` 已读设置项 `timeline_source`（时间线来源可配置），第 2 批 2027 入口可在此基础上做。

## 逐页走查 8 处界面问题（2026-10-23，Claude，用户同意按默认改法全修并确认截图与第 5 处改法；已发布 nm-20261023-150835-4309174，回读通过）

用户要求：8 处都按默认改法修，改完在隔离端口逐处截图给用户看，确认后再发布。

- 1 促销打法障碍筛选（`PlaybookView.jsx`、`styles-v3.css` 的 `.plb-*`）：改成三列网格——「全部障碍」第一行最前，A / B / C 每组一行，组名一列对齐。已改，未截图。
- 2 用户时间按月视图国家按钮（`UserPage.jsx` 加 `tl-country`、图例拆成 `tl-cats-row`）：按钮左右内边距 12→8px，1440 宽一行放下；图例单独一行靠右。已改，未截图。
- 3 同模块切页签回到顶部（`App.jsx` `useDisplayedRoute`）：只在 `route[1]` 变化时 `scrollTo(0,0)`，同页签内换月份、换条目不动。已改，未截图。
- 4 知识库文件夹卡叠纸（`KbCanvas.jsx` 加 `is-back`、`.kbf-peek.is-back strong` 一行省略）。已改，未截图。
- 5 业务页饼图（`BusinessCharts.jsx`）：**与默认改法不同**——调色板只有 6 色，前 8 名会重色，改为前 5 名 + 「其他 N 项」（灰）；下方图例列表仍列全部，第 6 名起圆点为灰。需向用户说明并确认。
- 6 业务趋势图（`BusinessCharts.jsx`、`business-charts.css`）：纵轴取整刻度（1 / 2 / 2.5 / 5 × 10ⁿ）；今年当月（未过完）的点画空心并标「至今」。截图时发现「至今」压在去年同月的点上，改为：同月有别的年份在它上方时标在点下方，否则标在上方。
- 7 Brief 第一节物料名拼接多出换行：**不改代码**。现行生成逻辑已先清洗物料名（`16017f4`，10-21 16:18），试跑「考前冲刺海报\n」得到「围绕考前冲刺海报、选课海报，把…」；正式库那句是 10-21 14 点多修复前生成的（最早导出预览为「考前冲刺海报\n、选课海报\n，」，10-22 11:38 后第二处被手动改过）。只在 `tests/brief-template.test.mjs` 补一条回归测试（直接把未清洗的名字交给生成函数）。已保存正文不动，由用户重新生成或手删。
- 8 自言自语底栏（`styles-v3.css` `.st-foot`）：允许换行，提示文字占满一行，「拉取新消息」下一行靠右；`SelfTalk.jsx` 无需改。
- 测试：`npm test` 670 / 670 通过，`npm run build`、`git diff --check` 通过。
- 验证：隔离 5290，数据目录为正式库 `.backup` 副本（scratchpad），副本里 `codex_push_enabled` 显式写 0（原本无此项即关闭）；Chrome 无头（独立临时用户目录）按真实宽度截图，改前对照正式 5280。1、2、6 看了 1440 / 1269 / 1024，4、5、8 看 1440。第 3 处用浏览器实测：促销打法滚到 800 → 切「用户策略」回 0；切模块回 0；用户时间滚到 500 → 换月 2026-11→10 停在 452（页面变短被压回），未回顶。
- 截图（不入库）：`docs/handoff/走查8处-20261023/` 共 24 张，命名 `<序号>-<处>-<宽>-before|after.png`。
- 用户确认：截图与第 5 处「前 5 名 + 其他」均确认，要求发布。
- 发布：ui-v4 提交 `4309174`，main 从 `f287bc8` 快进到 `4309174`，主工作区 `npm test` 670 / 670 通过；`bash scripts/release-app.sh` 从 `nm-20261023-142435-dc8d821` 切到 `nm-20261023-150835-4309174`（切换前自动备份数据库；保留策略清理快照 `nm-20261023-102725-0b61cd0` 和一份 10-21 的数据库备份），同前只对本次运行忽略未跟踪文件检查。`.claude/launch.json` 里上一会话加的预览配置随 wip 提交一起并入。
- 回读：launchd 指向新快照、进程运行中；首页、JS、CSS 与快照逐字节一致；72 个 server 文件与 `4309174` 一致；错误日志为空。`/api/v3/timeline`、`/api/v3/business/charts`、`/api/v3/selftalk` 均 200。5280 按 1440 宽实看促销打法筛选、用户时间按月、业务趋势图「至今」、饼图前 5 + 其他、自言自语底栏均与隔离截图一致，页脚版本 `4309174`。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-142435-dc8d821`。
- 遗留：正式库 2026-10 Brief 第一节那处换行仍在（历史正文，未改），需用户重新生成或手删。

## 首页 Agent 小卡窄屏两行两列 + 待定项结论（2026-10-23，Claude，用户确认；已发布 nm-20261023-142435-dc8d821，回读通过）

- 发布（用户要求）：主工作区 `main` 为 `dc8d821`，`npm test` 669 / 669 通过；`bash scripts/release-app.sh` 从 `nm-20261023-140119-40c9528` 切到 `nm-20261023-142435-dc8d821`（切换前自动备份数据库；保留策略清理快照 `nm-20261022-204952-2f395cd` 和一份 10-21 的数据库备份），同前只对本次运行忽略未跟踪文件检查。
- 回读：launchd 指向新快照；首页、JS、CSS、72 个 server 文件与 `dc8d821` 一致，错误日志为空；交付月、待办、状态、营收、NAS、日程接口均 200。5280 首页 1024 宽：Agent 小卡 2×2、名字无挤出，交付环节名 89px，物料交付「NAS 暂无 11 月物料」，无横向溢出，页脚版本 `dc8d821`。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-140119-40c9528`。

- `src/styles-v3.css`：901–1320px 时首页 Agent 四个小卡排成 2×2，名字不再挤出卡片；1440 宽和 900px 以下仍为一行四个。隔离 5290 实测 800 / 1024 / 1269 / 1440 均无挤出，1269 宽时卡片高度与旁边留学之声卡相同（311px）。`npm test` 669 / 669、构建通过。
- 用户结论：Voice「转为主线需求草稿」和自言自语「转主线需求」**保持现状**（都是用户提的需求，Voice 还要想办法实现），下面「首页窄屏…」一节的范围外条目以此为准；前端拆包不做（本机加载收益小）；毛利底线、课时成本由用户自己在设置页填写。

## 文档与环境整理（2026-10-23，Claude，用户同意计划与三个默认选择；只改文档与本机环境，不涉及运行代码，未重新发布）

- 证据搬迁：`/tmp` 里 15 个证据目录（文档引用的 10 个 + 5 个带日期、未被引用的证据目录）搬到 `~/Library/Application Support/NiumaHome/evidence/`，共 58MB，逐目录核对校验值一致后才删除 `/tmp` 原件；两份 `release-checkout`（完整代码检出）未搬。CURRENT / HANDOFF / `docs/handoff/` 共 14 个文件的路径已同步。10-21 那批（strategy-labels、business-charts、kb-switch、kb-sync、materials、brief、brief-autosave、brief-sync）此前已被系统清理，`docs/history/CURRENT-through-20261022.md` 顶部补了说明。29 个测试临时目录和日志按约定保留，交给系统清理。
- AGENTS.md：进入顺序、按授权分工（接手一方前后端都可做，改现有视觉先问）、飞书固定 `--profile codex`、结构图、新增「发布」一节、交接格式（写在 CURRENT 顶部，截图不入库）、证据放持久目录。
- REQUIREMENTS.md：顶部新增「当前范围（2026-10-23 整理）」——13 个模块、第一版后改定的决定、待定项；第一版原文保留。待用户过目。
- `.gitignore`：忽略 `docs/handoff/**` 下的 png / jpg / jpeg；已入库的截图不动。
- Chrome 收藏插件：安装位置改为 `~/Library/Application Support/NiumaHome/extension/niuma-collect/`（从主库复制，与原安装版逐文件一致）。用户已在 Chrome 移除旧插件、从新目录加载并「保存并检查」配对码；Claude 在飞书文档页确认「★ 收藏」按钮已注入，未点击、未写入。HANDOFF.md 已写明同步方法。
- 清理：删除 4 个已合并的 `.claude/worktrees/*` 和 `work-desk-t10`（其中 2 处改动与主库插件一致），以及分支 `claude/*` 4 个、`codex/t10-final`、`ui-v3`、`ui-bitmap`；剩 `main` 与本会话的 `ui-v4`。腾出约 770MB。
- 未做：插件真实收藏一次的端到端验证（会写飞书，等用户日常使用时观察）。

## 交付环节「物料交付」改读 NAS（2026-10-23，Claude，用户确认口径；已发布 nm-20261023-140119-40c9528，回读通过）

原来 `server/routes/delivery.mjs` 把这一步写死为 `pending`「NAS 尚未接入」，首页一直显示「待接入」。

- 改法：新增 `materialsStep`，只读数据库里 NAS 上次扫描的快照（`v3_snapshots` kind `nas`），不在首页触发扫描；快照根目录与当前设置不一致按未扫描处理。
- 口径（用户 2026-10-23 确认）：交付月各业务线的固定物料都识别到即完成（大学辅导 价格图 / 选课指导 / 试听海报，国际课程 价格图，共 4 类）；活动海报只计张数，不作为必须项。部分有 = 进行中，一类都没有 = 未开始。
- 显示：主行「固定物料 x/4 · 活动海报 n 张」；悬停写缺哪几类和「按 NAS 扫描 MM-DD HH:mm」。交付月文件夹还没有时显示「NAS 暂无 N 月物料」；从未扫描显示「尚未扫描 NAS」。新物料进 NAS 后要在「物料沉淀」点一次扫描，首页才更新。前端未改。
- 测试：`tests/v3-delivery.test.mjs` 新增 1 项（缺月、部分、齐全、只有活动海报、换根目录）并更新原断言，`tests/v3-batch1.test.mjs` 同步；`npm test` 669 / 669 通过，构建通过。
- 隔离验证：5290，空数据目录只写入正式 NAS 快照的只读副本。2026-08 / 09 / 10 均为完成（活动海报 3 / 5 / 2 张，与 NAS 一致），2026-11 为未开始「NAS 暂无 11 月物料」；首页 1440 宽显示正常，未生成缩略图目录（没有触发扫描）。
- 发布（用户同意）：main 从 `845210a` 快进到 `40c9528`，主工作区 `npm test` 669 / 669 通过；`bash scripts/release-app.sh` 从 `nm-20261023-135430-426b4ab` 切到 `nm-20261023-140119-40c9528`（切换前自动备份数据库；保留策略清理快照 `nm-20261022-201044-8e0c352` 和一份 10-21 的数据库备份），同前只对本次运行忽略未跟踪文件检查。
- 回读：launchd 指向新快照；首页、JS、CSS、72 个 server 文件与 `40c9528` 一致，错误日志为空。`/api/v3/months/2026-10` 物料交付 done「固定物料 4/4 · 活动海报 2 张」，`2026-11` todo「NAS 暂无 11 月物料」；状态接口里 NAS 扫描时间仍为 10:27（未触发扫描）。5280 首页显示「NAS 暂无 11 月物料」、悬停「按 NAS 扫描 10-23 10:27」，全页不再有「待接入」，页脚版本 `40c9528`。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-135430-426b4ab`。

## 首页窄屏、业务数字重叠与旧「主线需求」入口（2026-10-23，Claude，用户同意；已发布 nm-20261023-135430-426b4ab，回读通过）

用户确认第一批：首页窄屏交付步骤竖排、业务页数字重叠、命令面板和首页的旧「主线需求」入口、清理不再用的示例数据。两个默认选择用户同意：首页待办里的「需求」项一并删除；5 个环节在三列里是 3+2，右下空一格。基线 `3bdd3a3`（ui-v4 从 `2d83306` 快进）。

- 首页交付月卡（`src/styles-v3.css`）：1320px 以下环节改两列；1180px 以下黑块放上面、环节回到三列；600px 以下两列。1440 宽保持原样。进度小格改为跟环节数走（原写死 6 格）。
- 业务页（`src/styles-v3.css`）：`.rev-item` 设为容器，内容宽 ≤240px 时「当前 / 目标」上下两行、隐藏分隔线；只作用于带分隔线的数字行，「总转化率 · 上月」不受影响。
- 主线需求：`server/routes/delivery.mjs` 去掉 `needs` 环节（价格环节对已采纳需求的判断不变）；`src/constants.js` 方案录入改为第 1 位；`server/home-todo.mjs` 去掉「需求」待办，读取器不再读需求、不再接收 month（`server/routes/workspace.mjs` 同步）；命令面板（`CommandPalette.jsx`、`command-index.js`）去掉需求范围、需求搜索结果与预览、「审主线需求」，不再请求 `/api/v3/needs`，提示语与「用户策略」说明改为现结构。营销战役倒计时的完成数随之变为 x/5。
- 删除 `src/samples/v3.js`（两组示例已无引用）；`docs/tasks/V3-6-第三轮接口.md` 的返回结构改为以文档为准。`src/samples.js` 按 AGENTS.md 保留。
- 测试：`tests/v3-delivery.test.mjs`、`tests/v3-integration.test.mjs`、`tests/v3-batch1.test.mjs`、`tests/command-index.test.mjs` 同步；`npm test` 668 / 668 通过；`npm run build`、`git diff --check` 通过。
- 隔离验证：5290 空数据目录。首页 800 / 1024 / 1269 / 1440 及 375 手机宽度环节名不再挤压、无横向溢出；业务页 1024 / 1269 / 1440 无重叠，1440 仍为一行；⌘K 范围为「全部 / 页面 / SKU / 学校 / 文档 / 操作」，无需求请求。控制台只有 Voice 未配置的 503（原有）。
- 截图（未提交）：`docs/handoff/首页窄屏与旧入口-20261023/`，含改前（正式 5280）与改后。
- 范围外，未改：交付环节「物料交付」仍显示「待接入 · NAS 尚未接入」，但 NAS 已接通；Voice「转为主线需求草稿」、自言自语「转主线需求」、手写主线需求表单和后端 `/api/v3/needs*` 仍在，需决定下线或并入；首页 Agent 四个小卡在 1024 宽时说明文字被截断。
- 发布（用户同意）：main 从 `3bdd3a3` 快进到 `426b4ab`，主工作区 `npm test` 668 / 668 通过；`bash scripts/release-app.sh` 从 `nm-20261023-103847-3200d0e` 切到 `nm-20261023-135430-426b4ab`（切换前自动备份数据库；保留策略清理快照 `nm-20261022-194602-2d3785d` 和一份 10-21 的数据库备份）。主工作区有其他会话的未跟踪文档，同前只对本次运行忽略未跟踪文件检查（`status.showUntrackedFiles=no`），未改动它们。
- 回读：launchd 指向新快照；首页、JS、CSS 与快照逐字节一致，快照 72 个 server 文件与 `426b4ab` 一致，错误日志为空。`/api/v3/months/2026-11` 返回 prices / materials / brief / campaign 四环节；`/api/v3/home/todo` 只有时间线、项目两类；营收、状态接口 200。5280 页面 1024 宽：交付环节名 89px、5 格进度、无「主线需求」、无横向溢出，页脚版本 `426b4ab`；业务页 7 处数字无重叠。控制台只有 Voice 的 503。
- 回滚：`bash scripts/release-app.sh --use nm-20261023-103847-3200d0e`。

## 更早的记录

- 2026-10-23 上午及以前（带教回复北京时间、旧入口保护与真实集成验证、已发布成果）：[docs/history/CURRENT-through-20261023-am.md](docs/history/CURRENT-through-20261023-am.md)
- 2026-10-22 及以前：[docs/history/CURRENT-through-20261022.md](docs/history/CURRENT-through-20261022.md)；旧 ui-v3 交接：[docs/history/HANDOFF-ui-v3-20261016.md](docs/history/HANDOFF-ui-v3-20261016.md)
