# work-desk 协作约定（Codex / Claude 必读）

个人工作台「牛马之家」，只有本人使用。进入顺序：[HANDOFF.md](HANDOFF.md) → 本文件 → [CURRENT.md](CURRENT.md)（当前状态与唯一下一步）。需求以 [REQUIREMENTS.md](REQUIREMENTS.md) 为准。所有面向用户的文字用简体中文。

## 分工（2026-10-23 更新）

- **以用户每轮明确授权的范围为准**。接手的一方（Claude 或 Codex）前后端都可以做，含接口、测试、发布和交接；授权外的预留功能不做。
- 改动现有视觉要先问用户，保留原有风格基调、配色与强调色；大的视觉调整先给方向或样稿再动手。只动用户点名的部分，改完对照改前截图逐项核对颜色与强调（[LESSONS](docs/LESSONS.md) L-01）。
- 用户提过的功能入口（如 Voice、自言自语）暂时没有落点时，推荐「补上查看位置 / 保持现状」，不把「下线」列为推荐（用户 2026-10-23）。
- 派单流程保留为可选：需要拆分时由一方写 `docs/tasks/T*.md`，另一方认领（在 CURRENT.md 标「进行中」）→ 实现 + 测试 + 截图 → 交接 → 验收 → 用户最终验收。
- 一次只做一件授权的事；范围外的问题记进交接，不顺手修。
- 并行的会话各开独立 worktree，不在同一目录改代码。做不到时，测试记录写明「工作区含他人未提交改动」，提交用 `git commit -- <自己的文件>`，不带别人的改动，不动别人的未跟踪文件（[LESSONS](docs/LESSONS.md) L-07）。
- 历史：2026-10-16 起曾按「Claude 做 UI、Codex 做后端」分工，2026-10-18 起改为按授权前后端一起做。

## 运行

```sh
npm install
npm run build && npm start      # http://127.0.0.1:5280（开发目录直接起服务；正式环境见「发布」）
npm run dev                     # 开发页 http://127.0.0.1:5281，/api 转给 5280
npm test                        # 自动使用临时数据目录，不碰 data/
npm run smoke                   # 页面冒烟：先 npm run build；隔离服务 + 本机 Chrome 只读打开全部路由，截图到证据目录（--base 可指向已在跑的服务）
npm run import:feishu           # 一次性迁移旧飞书表（已执行过，可重复执行）
```

隔离数据：`WORKDESK_DATA_DIR=$(mktemp -d) PORT=5290 npm start`，再 `WORKDESK_API_PORT=5290 npm run dev`。默认数据目录 `data/` 是真实数据，测试不得写入。

## 结构（不要改动骨架）

```
HANDOFF.md           交接入口（最新一轮范围、固定身份、证据位置）
CURRENT.md           当前状态与唯一下一步；旧记录在 docs/history/
server/
  index.mjs          HTTP 服务：静态文件 + /api 路由分发
  http.mjs           json / readJson / route / match / pending(task)
  db.mjs             全部表结构与查询；data/work-desk.db、data/images/
  routes/*.mjs       每个模块导出 routes(db) → route(...) 数组
src/
  App.jsx            左侧导航 + 模块登记（MODULES）
  router.js          #/ 路由：useRoute() / href()
  api.js             useApi(path, sample) / apiSend()
  constants.js       业务线、促销字段、月份工具、交付月环节
  samples.js         示例数据（接口 501 时显示）；另有 Voice 模拟数据 `voiceSample`（来源接通前显示，用户 2026-10-23 要求）
  ui/components.jsx  公共组件
  ui/bitmap.jsx      位图风基础件：FlipNumber / DotMatrix / DitherBar / TypeText / StepProgress / PixelIcon / BitAvatar / dissolve
  assets/fonts/      Geist / Geist Mono / Geist Pixel（OFL）
  styles.css         设计变量 + 基础样式
  styles/            v3 起各页面样式，按模块拆成带序号的文件；index.css 按序号引入，序号就是层叠顺序（2026-10-23 从 styles-v3.css 拆出）
  styles-layout.css / styles-scrollbars.css  布局与滚动条
  modules/<模块>/     各模块页面
browser-extension/niuma-collect/   Chrome 收藏插件源码（安装位置见 HANDOFF.md）
scripts/
  release-app.sh     发布 / 回滚正式 5280（launchd 常驻 + 固定快照）
  verify-release.sh  发布回读（只读；release-app.sh 末尾自动跑，也可单独跑）
  check-style.mjs    样式、监听与时间显示硬规则检查（npm run check:style；npm test 里也跑）
  smoke-pages.mjs    页面冒烟（npm run smoke）：全部路由 + ⌘K + 抽屉，查 JS 异常、console 错误与非 GET 请求，截图；verify-release.sh 加 NIUMA_SMOKE=1 可选调用
  health-check.sh    每日巡检（只读；--install 装成 launchd 任务）
docs/
  LESSONS.md         开发实录与坑（排障、发布、改样式或脚本前先搜）
  API.md             接口约定
  STYLE-GUIDE.md     视觉规范
  tasks/T*.md        派单
  handoff/           各轮验证记录与截图
  history/           归档的旧 CURRENT / HANDOFF
fixtures/            验收样例（飞书复制的方案原文）
```

## 规则

- **接口占位机制**：未实现的接口在路由里写 `pending("T0x")`，返回 501；前端 `useApi(path, sample)` 收到 501 时显示示例并标「示例 · T0x」。实现接口 = 把 `pending(...)` 换成真实处理函数，前端示例自动消失。实现后删掉 `samples.js` 里对应的示例。
- 未实现的按钮用 `<PendingButton task="T0x">`；实现时换成 `<Button>`。
- 接口路径与数据形状以 [docs/API.md](docs/API.md) 为准；改接口时同步更新文档，并在交接里说明理由。
- 表结构只在 `server/db.mjs` 的 SCHEMA 里改；已有列不改名、不删。
- 视觉以 [docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md)（v2 位图风）为准：新样式先用已有变量和类；图标只用 `PixelIcon`；动效只用 `src/ui/bitmap.jsx` 的按帧组件，不写 CSS transition。不引入 UI 框架、CSS-in-JS 或图标库。新增依赖须先改 `scripts/check-style.mjs` 的 `ALLOWED_DEPS` 白名单（否则 `npm test` 不过），并在交接里说明理由。
- 所有写入真实数据的操作必须「先预览、后确认」。唯一例外：知识库快捷收藏（T12，只新建指向原文的快捷方式）用户 2026-10-18 确认点击即收藏，但仍须只写一次、不自动重试、写后回读、结果不明时锁住核对。
- 访问飞书一律用本机 `lark-cli`，固定 `--profile codex`（机械邪龙兽应用）：读写资源用该应用的 user 身份，发评论用 bot 身份；不回退其他机器人，不在代码里写 token。
- 只监听 127.0.0.1。
- 请求来源校验在 `server/index.mjs` 对全部 `/api/` 统一做（`http.mjs` 的 `checkOrigin`：Host 本机、Origin 同源；扩展只在收藏路由放行），新接口不用自己做；正文上限与错误响应也在那里（[API.md](docs/API.md)「请求来源要求」）。
- 接外部只读来源一律 `createConfiguredReader(…, { staleWhileRevalidate: true })` 落快照，页面先回旧数据再后台刷新，不让用户等现读（[LESSONS](docs/LESSONS.md) L-10）。
- 验证用的备份、日志等证据放 `~/Library/Application Support/NiumaHome/evidence/<目录名>/`，不要只留在 `/tmp`（会被系统清理）；私人数据库与完整日志不进仓库。

## 发布

- 正式环境是 launchd 常驻服务 `cn.niuma-home.server`（端口 5280），运行 `~/Library/Application Support/NiumaHome/releases/` 下的固定快照，数据目录是主工作区的 `data/`。
- 只在用户同意后发布：在主工作区（`main`）执行 `bash scripts/release-app.sh`。脚本会先备份数据库，再生成快照、切换服务，并按保留策略清理旧快照。
- 脚本要求工作区干净。主工作区有别人留下的未跟踪文件时，不要删改它们，只对这一次运行忽略未跟踪文件：`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=status.showUntrackedFiles GIT_CONFIG_VALUE_0=no bash scripts/release-app.sh`。
- 发布后回读：`release-app.sh` 末尾会自动跑 `scripts/verify-release.sh`（只读，可随时单独再跑），核对 launchd 与运行中进程指向新快照、只监听 127.0.0.1、首页与全部构建文件逐字节一致、快照源码与提交一致、错误日志为空、版本号正确；本轮相关接口与页面仍须人工实看。
- 回滚：`bash scripts/release-app.sh --use <上一份快照名>`，在交接里写明。
- 每日巡检：launchd 任务 `cn.niuma-home.health` 每天 08:30 跑 `scripts/health-check.sh`（不调用模型，不碰数据）：发布回读 7 项 + 数据库完整性 + 磁盘余量 + 每日数据库备份（`backups/work-desk-<日期>-daily.db`，写后回读，只留 7 份）+ 昨天有没有巡检记录（巡检自己停了也要有人知道）；结果追加到 `~/Library/Application Support/NiumaHome/evidence/health/<年-月>.log`，未通过才弹本机通知。在主工作区执行 `bash scripts/health-check.sh --install` / `--uninstall` 安装或卸载；任务借服务外壳 `NiumaHomeServer.app` 的 node 启动（[LESSONS](docs/LESSONS.md) L-08）。
- 每周整理：桌面应用定时任务「【每周五】牛马之家说明书整理提案」（`niuma-weekly-review`，每周五 18:00 后几分钟）读 LESSONS / AGENTS / CURRENT 与巡检日志，**只出提案、不改仓库**：提案写到 `~/Library/Application Support/NiumaHome/evidence/weekly-review/<日期>.md`，结尾用 git 指纹自证未改；同目录 `decisions.md` 记每条提案的采纳 / 否决 / 待定（编号 `W<日期>-<序号>`），整理只读它、不重复提已决定的。用户回复采纳哪几条，当时的会话按上面的规矩动手，并在 `decisions.md` 追加一行。应用关着时到点不跑，下次打开时补跑。提示词在 `~/.claude/scheduled-tasks/niuma-weekly-review/SKILL.md`。

## 交接格式

每轮完成后，在 CURRENT.md 顶部新增一节（旧节保留在下面，过长时归档到 `docs/history/`），骨架照抄 [docs/templates/handoff.md](docs/templates/handoff.md)；`tests/handoff-format.test.mjs` 会检查顶部一节有没有日期、「时间：开工」「测试：」「本轮新坑：」三行，新坑编号在 LESSONS 里要存在：

- 标题写明内容、日期、谁做的、用户是否同意、发布状态
- 时间：开工 `YYYY-MM-DD HH:mm`（`date '+%F %H:%M'` 记录；早于它的构建、截图、测试结果不算本轮的）
- 改了哪些文件（一句话说明各自做了什么）
- 测试：命令与结果（通过 / 失败数）
- 验证：隔离端口与数据、看了哪些宽度和页面
- 截图：放在 `docs/handoff/<本轮名>/`，列出文件名；截图不提交进仓库（用户 2026-10-23 确认），只留在本地
- 发布与回读、回滚命令（如已发布）
- 与授权不一致之处、遗留问题、范围外发现
- 本轮新坑：无 / L-xx（写进 [docs/LESSONS.md](docs/LESSONS.md)，格式和升级规则见该文件开头）

## 报告与验收（防伪造，实施方和验收方都照做）

1. 先写盘，再报告：交接和验证记录先写进 CURRENT.md 或证据目录，再在对话里说；对话里说了、文件里没有的，按没做算。
2. 开工先记时间：验证记录写明开始时刻（`date '+%F %H:%M'`）；早于它的构建、截图、测试结果不算本轮的。
3. 说跑过命令，就贴原样结果：测试至少照抄通过数和失败数那两行，不改写成「测试通过」。
4. 沿用别人的结果要明说：验收方没有重新跑测试、构建或截图，就写「沿用某某的结果」，不写成自己核过。
5. 数字和实施方的记录一字不差时，写明自己是怎么独立得到的（跑了什么命令、看了哪个文件）。

没做就写「未做」，一条诚实的「未做」比一条编出来的「已做」有用。
