# work-desk 协作约定（Codex / Claude 必读）

个人工作台「牛马之家」，只有本人使用。进入顺序：[HANDOFF.md](HANDOFF.md) → 本文件 → [CURRENT.md](CURRENT.md)（当前状态与唯一下一步）。需求以 [REQUIREMENTS.md](REQUIREMENTS.md) 为准。所有面向用户的文字用简体中文。本文件只放怎么开始和做什么事之前读哪份；操作细节在 [docs/OPERATIONS.md](docs/OPERATIONS.md)，按需读对应一节。

## 做什么事之前读哪份

| 要做的事 | 先读 |
|---|---|
| 第一次接手；找某个页面对应哪些文件；看不懂 `v3`、策略、Agent、Voice 这些词指什么 | [GLOSSARY.md](GLOSSARY.md) |
| 实现接口、改数据、接外部来源 | [docs/API.md](docs/API.md)；[OPERATIONS](docs/OPERATIONS.md)「接口占位机制」「写接口与接外部来源」 |
| 改样式、改界面 | [docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md)；下面「分工」里「改现有视觉先问」 |
| 排障、发布、改样式或脚本 | 先 `grep -n 关键词 docs/LESSONS.md`（[LESSONS](docs/LESSONS.md)） |
| 发布、回读、回滚、巡检、每周整理 | [OPERATIONS](docs/OPERATIONS.md) 对应节 |
| 写交接、验收别人的交接 | [docs/templates/handoff.md](docs/templates/handoff.md) 骨架；[OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」 |
| 拆派单 | `docs/tasks/T*.md`；[OPERATIONS](docs/OPERATIONS.md)「派单流程」 |
| 开需求、拆任务、实现、审查 | 下面「Agent skills」一节 |
| 改界面、交互、文案，或判断某处算不算已定 | [docs/DECIDED.md](docs/DECIDED.md) 已定内容登记表；基线截图对比 `node scripts/ui-baseline.mjs compare`（先 `npm run build`，页面清单 `docs/design/pages.json`；发布脚本切换前自动跑） |

## 分工（2026-10-23 更新）

- **以用户每轮明确授权的范围为准**。接手的一方（Claude 或 Codex）前后端都可以做，含接口、测试、发布和交接；授权外的预留功能不做。
- 改动现有视觉要先问用户，保留原有风格基调、配色与强调色；大的视觉调整先给方向或样稿再动手。只动用户点名的部分，改完对照改前截图逐项核对颜色与强调（[LESSONS](docs/LESSONS.md) L-01）。
- 用户提过的功能入口（如 Voice、自言自语）暂时没有落点时，推荐「补上查看位置 / 保持现状」，不把「下线」列为推荐（用户 2026-10-23）。
- 看到的相关问题、重复实现、死代码可以顺手修和整理，按全局规则第 3 节办（先问已定内容、改变行为先列出来、交付时列全部改动）。原来的「范围外的问题记进交接，不顺手修」常浩 2026-11-20 删掉了。
- 并行的会话各开独立 worktree，不在同一目录改代码。做不到时，测试记录写明「工作区含他人未提交改动」，提交用 `git commit -- <自己的文件>`，不带别人的改动，不动别人的未跟踪文件（[LESSONS](docs/LESSONS.md) L-07）。

## 运行

```sh
npm install
npm run build && npm start      # http://127.0.0.1:5280（开发目录直接起服务；正式环境见「发布」）
npm run dev                     # 开发页 http://127.0.0.1:5281，/api 转给 5280
npm test                        # 自动使用临时数据目录，不碰 data/
npm run check:style             # 样式、监听、时间显示、shell 变量写法与 LESSONS 升级行硬规则（npm test 里也跑）
git config core.hooksPath scripts/hooks   # 装提交、推送前的必经检查（每个克隆、每台电脑各一次；不用 --no-verify 绕过）
npm run smoke                   # 页面冒烟：先 npm run build；隔离服务 + 本机 Chrome 只读打开全部路由，截图到证据目录（--base 可指向已在跑的服务）
npm run import:feishu           # 一次性迁移旧飞书表（已执行过，可重复执行；写正式数据要带 WORKDESK_DATA_DIR）
npm run import:mentor-path      # 导入带教培养路径（同上）
```

隔离数据：`WORKDESK_DATA_DIR=$(mktemp -d) PORT=5290 npm start`，再 `WORKDESK_API_PORT=5290 npm run dev`。

正式数据不在仓库里（#83）：正式数据目录是 `~/Library/Application Support/NiumaHome/data/`，以服务配置里的 `WORKDESK_DATA_DIR` 为准；测试和开发验证不得写入。仓库里的 `data/` 只是开发用的本地库，不带环境变量直接 `npm start` 读写的是它。命令行脚本要操作正式数据时必须显式带 `WORKDESK_DATA_DIR`，写法见 [OPERATIONS](docs/OPERATIONS.md)「数据目录」。

## 结构（不要改动骨架）

```
HANDOFF.md           交接入口（长期有效的事实：数据库位置、飞书身份、插件安装位置、证据位置；每轮范围看 CURRENT.md）
CURRENT.md           当前状态与唯一下一步；旧记录在 docs/history/
GLOSSARY.md          词汇表与代码地图：容易读错的词；页面 → 路由文件 → 服务文件 → 存储
server/
  index.mjs          HTTP 服务：静态文件 + /api 路由分发
  http.mjs           json / readJson / readBody / failure / respond / route / match / pending(task) / unmatched（没匹配上的 /api/v3/* 回 501，其余 404）
  app-routes.mjs     全部接口的装配处：每个路由组一行，找接口先看这里
  routes/*.mjs       各路由组，导出 …Routes(…) → route(...) 数组，由 app-routes.mjs 装配
  db.mjs             全部表结构，专用表（plans、promos、materials、assistants 等）的查询；<数据目录>/work-desk.db、<数据目录>/images/；内部原声的会话三张表在同目录的 internal-voice.db（voiceDbFor）
  local-records.mjs  通用表 v3_documents 的读写（getRecord / putRecord / listRecords）与本地「预览 → 确认」
  storage-kinds.mjs  v3_documents、v3_snapshots 两张通用表的 kind 登记表（新增 kind 要在这里加一行，测试会查）
src/
  App.jsx            左侧导航 + 模块登记（MODULES）
  router.js          #/ 路由：useRoute() / href()
  api.js             useApi(path) / apiSend()
  constants.js       业务线、促销字段、月份工具、交付月环节
  samples.js         Voice 模拟数据 `voiceSample`（来源接通前显示，用户 2026-10-23 要求）
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
  move-data-dir.sh   一次性：把正式数据目录搬出开发工作区（#83；默认只预览，--confirm 才执行，原目录改名保留）
  check-style.mjs    样式、监听、时间显示、shell 变量写法与 LESSONS 升级行硬规则检查（npm run check:style；npm test 里也跑）
  smoke-pages.mjs    页面冒烟（npm run smoke）：全部路由 + ⌘K + 抽屉，查 JS 异常、console 错误与非 GET 请求，截图；verify-release.sh 加 NIUMA_SMOKE=1 可选调用
  health-check.sh    每日巡检（只读；--install 装成 launchd 任务）
  internal-voice-pull.mjs  内部原声命令行拉取（隔离数据目录试拉用；服务在跑时走接口）
  migrate-voice-db.mjs  一次性迁移：把会话三张表从主库搬到 internal-voice.db（默认只预览，#82）
  hooks/             git 钩子（装法见「运行」）：commit-msg 查修复类提交的「同类：」一行，pre-push 推送前跑 npm test
docs/
  agents/            Matt Pocock 技能读的约定：issue 看板、分流标签、领域文档
  LESSONS.md         开发实录与坑（排障、发布、改样式或脚本前先搜）
  API.md             接口约定
  STYLE-GUIDE.md     视觉规范
  OPERATIONS.md      操作手册：派单、接口占位、发布 / 回读 / 回滚、巡检、每周整理、交接写法、报告与验收
  tasks/T*.md        派单
  templates/handoff.md  交接一节的骨架
  handoff/           各轮验证记录与截图
  history/           归档的旧 CURRENT / HANDOFF
fixtures/            验收样例（飞书复制的方案原文）
```

## Agent skills

开发流程用 Matt Pocock skills（`~/.agents/skills/`）：大活走 `to-spec` → `to-tickets` → `implement` / `tdd` → `code-review` → PR；小改（一张 issue、一天内做完）跳过 `to-spec`。Claude 用 `/技能名`，Codex 用 `$技能名`；这几个技能只在点名时加载，不会自动触发。

### Issue tracker

需求、规格与任务用本仓库 GitHub Issues。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个默认分流标签。见 `docs/agents/triage-labels.md`。

### Domain docs

single-context：根目录 `GLOSSARY.md`（已建，2026-11-20）与 `docs/adr/`（用到时再建）。见 `docs/agents/domain.md`。

旧派单 `docs/tasks/T*.md` 留着不迁，新活开 issue。

改动怎么走、分支怎么起名、交接写在哪、怎么合并：见 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/工程流程.md`。

## 规则

- 未实现的接口在路由里写 `pending("T0x")`，未实现的按钮用 `<PendingButton task="T0x">`；占位与实现的做法见 [OPERATIONS](docs/OPERATIONS.md)「接口占位机制」。
- 接口路径与数据形状以 [docs/API.md](docs/API.md) 为准；改接口时同步更新文档，并在交接里说明理由。
- 表结构只在 `server/db.mjs` 的 SCHEMA 里改（内部原声的会话三张表在同文件的 `VOICE_SCHEMA`，存在单独的库文件里）；已有列不改名、不删。
- 视觉以 [docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md)（v2 位图风）为准：新样式先用已有变量和类；图标只用 `PixelIcon`；动效只用 `src/ui/bitmap.jsx` 的按帧组件，不写 CSS transition。不引入 UI 框架、CSS-in-JS 或图标库。新增依赖须先改 `scripts/check-style.mjs` 的 `ALLOWED_DEPS` 白名单（否则 `npm test` 不过），并在交接里说明理由。
- 所有写入真实数据的操作必须「先预览、后确认」。唯一例外：知识库快捷收藏（T12，只新建指向原文的快捷方式）用户 2026-10-18 确认点击即收藏，但仍须只写一次、不自动重试、写后回读、结果不明时锁住核对。
- 访问飞书一律用本机 `lark-cli`，默认亚古兽应用 `cli_a965c429ef785bd3`；只有自言自语（读常浩与猛鬼兽的私聊）和 Codex 重置推送留在猛鬼兽 `cli_a96f5f9ac63adcd4`（常浩 2026-11-02 定）。读写资源用 user 身份，带教评论可选 bot，推送用 bot；不回退其他机器人，不在代码里写 token。两个身份（profile、App ID、本人 open_id）只在 `server/lark-identity.mjs` 定义，服务端一律经 `larkRun(run, 身份, args)` 调用，每次调用记一行到 `<数据目录>/logs/lark-calls.jsonl`（应用、身份、命令、成败、耗时，不记内容）；换应用时 open_id 会变，见 [LESSONS](docs/LESSONS.md) L-15。
- 只监听 127.0.0.1。
- 验证用的备份、日志等证据放 `~/Library/Application Support/NiumaHome/evidence/<目录名>/`，不要只留在 `/tmp`（会被系统清理）；私人数据库与完整日志不进仓库。

## AI 接入

按全局规则 P-13：每个 AI 功能谁来产出、怎么接、读什么、写到哪，都在「设置 → AI 接入」看得到、改设置就能切换。这一节和设置页同一出处：`server/ai-executor.mjs`（`AI_FEATURES`、`FIXED_FEATURES`、`OPENINGS`、`DATA_OBJECTS`）；改 AI 功能时三处一起改。

- **执行方**：Codex、Claude，接入方式都是本机 CLI（用本机登录的订阅，不存密钥）。Codex 经 `codex app-server`（只读沙箱、关掉工具）；Claude 经 `claude -p`（`--tools ""`、不读设置和 MCP、不留会话）。默认 Codex（设置键 `ai_default_executor`）；可用状态只跑 `--version` 和登录状态，不调用模型，最近一小时调用报过额度用尽的标「额度用尽」。
- **可切换的功能**（设置键 `ai_features`，每个功能可「跟随默认」或单独指定，另可选备用执行方，默认不设）：
  | 功能 | 读哪些数据 | 产出写到哪里 |
  |---|---|---|
  | 带教草稿（页面暂无入口，只有接口） | 管培生近 30 天飞书日志 | 预览确认后存本地「带教草稿」 |
  | 亚古兽回答提问（带教页） | 这条提问所在那天的日志 | 只显示在回复框；常浩确认后才作为评论发到飞书 |
  | 自言自语周汇总（顶栏「自言自语」） | 常浩和猛鬼兽一周的私聊文本 | 预览确认后存本地「自言自语周汇总」 |
- **不可切换的功能**：Agent 页 Codex 助手仅支持 Codex（会话历史、切换会话、换模型都直接读写 Codex 线程）；Agent 页 ChatGPT 助手仅支持 ChatGPT 网页（网页桥，经 Chrome 插件收发）。
- **不可用时**：切换在下一次调用生效，正在跑的按原执行方跑完。主执行方失败（未安装、未登录、额度用尽、调用失败）时，没设备用方就报错并指向设置，不自动换家；设了备用方才转交，只转一次，两家都失败就报错，不重试。超长输出不转交。
- **留痕**：每条产出带执行方、接入方式、模型、时间，转交过的另写原定执行方和原因，界面上显示在产出下方；每次调用（含失败）记一行到 `<数据目录>/logs/ai-calls.jsonl`（功能、原定与实际执行方、各次尝试的成败与原因、耗时，不记内容）。改造前存的旧记录只可能来自 Codex，按 Codex 补出留痕。
- **对外开放**：workdesk MCP，`server/mcp-workdesk.mjs` + `/api/v3/agent/*`（见 [docs/API.md](docs/API.md)「智能体接入」）。每个 agent 一个凭据，按工具授权，所有调用记进 `agent_calls`。
  - 只读：`mentor_trainees`、`mentor_questions`、`project_list`、`strategy_month`、`strategy_facts`（月度用户策略 v2 的事实底稿）、`strategy_submission`（查 submission 状态：按 `id`，或按提交时的 `idempotencyKey` 查本凭据自己的提交）。
  - 写入：只有 `strategy_submit`，只能创建待确认的月度策略 submission，不改正式版本；确认与拒绝只在页面（同源接口），不进智能体工具。
  - 关掉：`node scripts/agent-token.mjs revoke <agent>` 撤销凭据（`WORKDESK_DATA_DIR` 指向正式数据目录），或重新签发时去掉某个工具。
  - 经 MCP 进来的月度用户策略由 `my-skills` 的 `monthly-user-strategy` 在 Claude 或 Codex 会话里产出，换执行方不改工作台代码；留痕：submission 记 `agent`（来自凭据，服务端认定）、`declared`（AI 自报的执行方、模型、skill 版本，只作声明）、`submitted_at`；revision 记 `submission_id`、`confirmed_by`、`confirmed_from`、`created_at` 和输入（时间线快照指纹、证据版本、规则版本）。
- **数据对象**（只展示或采集，不参与切换）：Codex 会话导入（Agent 页「导入会话」，读本机 Codex 会话列表）；Codex 重置提醒（aihot.news 公开接口，开关打开后经猛鬼兽推送）。
- **内部原声的原始数据**（#49）：从公司企微会话存档只读拉取（`server/internal-voice.mjs`），不是 AI 产出、不调用模型；后续由 skill 经 MCP 读取、提炼原声卡（批 2、3）。
- **安全目标**：在单用户可信本机环境里，阻止默认智能体工具误操作，隔离提交与确认，保留可审计记录；不声称能防御同一用户环境下有任意本地执行权限的恶意进程。

## 发布

- 正式环境是 launchd 常驻服务 `cn.niuma-home.server`（端口 5280）；只在用户同意后发布，在主工作区（`main`）执行 `bash scripts/release-app.sh`。发布流程、回读、回滚、每日巡检、每周整理见 [OPERATIONS](docs/OPERATIONS.md) 对应节。

## 交接格式

每轮完成后，在 CURRENT.md 顶部新增一节（旧节保留在下面，过长时归档到 `docs/history/`），骨架照抄 [docs/templates/handoff.md](docs/templates/handoff.md)；`tests/handoff-format.test.mjs` 会检查顶部一节有没有日期、「时间：开工」「测试：」「本轮新坑：」三行，新坑编号在 LESSONS 里要存在。每一行怎么写、报告与验收的防伪造五条见 [OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」；没做就写「未做」。
