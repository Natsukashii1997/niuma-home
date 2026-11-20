# 当前状态

当前阶段目标：月度用户策略批 1 上线：用户情况按 v2 生成、提交、确认（#24），发布到 5280，并通过 12 月技术试跑（#32）。（2026-11-08 常浩确认，digital-twin#114）

更新：2026-11-20。工作区 main；进入顺序见 [HANDOFF.md](HANDOFF.md)，第一次接手先看 [GLOSSARY.md](GLOSSARY.md)。

**现在停在哪（2026-11-20 晚）**
- 本轮 4 个 PR 常浩已回「合并」：#76（交付月价格判定，`0e6862f`）、#77（v3 兜底移出路由表，`9286995`）、#78（路由统一装配、存储登记、词汇表，`1f3529e`）已合并，本文件所在的文档收口 PR（#79）随后合并。
- 正式 5280 仍是快照 `nm-20261120-104534-c8452f2`；main 上它之后的提交都还没发布，含 #68 的界面修复和本轮 #76、#77、#78。其中 #76 会改变首页交付月「价格方案」的判定和首页待办的一处文字，见下面第一节。
- 阶段目标相关、仍开着的 issue：#24、#26、#31、#32（批 1）；#49、#55（内部原声）；#69（发布前请求新接口、公共指纹函数两条没做）。
- 等常浩定的事：异机备份放哪（现在没有任何异机备份，见下面第一节）；项目 AGENTS.md「范围外的问题不顺手修」和全局规则第 3 节对不上；低于毛利底线的方案是否继续作为紧急待办长期挂在首页；Voice 两个半成品、12 条没有页面入口的需求接口去留。

**唯一下一步**：常浩决定要不要把 main 发布到 5280（只在他同意后执行 `bash scripts/release-app.sh`）。本轮改动只在隔离数据上跑过自动测试，发布后要在真实页面上看首页交付月和待办两处。

下面各节按时间倒序，是每一轮的交接原文。标题里的「待合并 / 未提交 / 未发布」是写那一节时的状态，现状以上面这段和 git 为准：PR #44、#58、#59、#63、#68 都已合并。2026-11-12 及更早的各节在 [docs/history/CURRENT-through-20261112.md](docs/history/CURRENT-through-20261112.md)。

## 项目整体评估后的两批改动：价格判定、v3 兜底、路由装配与存储登记、词汇表、文档收口（2026-11-20，Claude，常浩看过评估后回「第一、二批都做」，看过 PR 后回「合并」；PR #76、#77、#78 已合并，本 PR 随后合并；未发布）

- 时间：开工 `2026-11-20 19:15`（会话创建时间）。来由：常浩要一份「新人接手的认知成本」评估和一份整体方案与完成度评估（后者由 Fable 5.2 High 子代理做），看完后选了前两批动手。
- 改了哪些文件：
  - PR #76（#72）：`server/routes/delivery.mjs`（价格环节不再看关联需求和破底线原因，交付月接口不再读需求列表）、`server/home-todo.mjs`（低于底线的待办去掉「需填原因」）、`docs/API.md`、两份测试。
  - PR #77（#73，从 #69 拆出）：`server/http.mjs` 新增 `unmatched`，删 `server/routes/v3.mjs`；`src/api.js` 删掉没人用的示例参数；OPERATIONS、AGENTS、LESSONS L-20 同步。
  - PR #78（#74）：新增 `server/app-routes.mjs`、`server/storage-kinds.mjs`、`server/routes/mentor.mjs`、`server/routes/kb.mjs`、`GLOSSARY.md` 和两份测试；`failure` / `readBody` / `respond` 收进 `server/http.mjs`。
  - 本 PR（#75）：CURRENT.md 顶部加「现在停在哪」和「唯一下一步」，2026-11-12 及更早的 73 节原样移到 `docs/history/CURRENT-through-20261112.md`；HANDOFF.md 只留长期有效的事实，原文存 `docs/history/HANDOFF-20261023.md`；根目录两份 10-15 的旧交接移到 `docs/history/`。
- 测试：各分支各跑 `npm test`，原样结果：#76 `ℹ pass 921` / `ℹ fail 0`；#77 `ℹ pass 920` / `ℹ fail 0`；#78 `ℹ pass 924` / `ℹ fail 0`；本 PR `ℹ pass 924` / `ℹ fail 0`。合并前 #77、#78 各变基到最新 main 后重跑：#77 `ℹ pass 921` / `ℹ fail 0`，#78 `ℹ pass 924` / `ℹ fail 0`，CI 也各自通过。`npm run check:style` 通过；#77 另跑 `npm run build` 通过。
- 验证：只在隔离临时数据目录里跑了自动测试，没有起正式服务、没有读正式库、没有看页面。#78 重构前后各导出一次路由清单，197 条逐条一致。未在真实环境验证。
- 截图：无（没有界面改动；#76 改了首页两处文字，没截图）。
- 发布与回读：未发布。
- 与授权不一致之处、遗留问题、范围外发现：
  - 第一批里的「每日巡检加异机备份」没做：本机没有挂载 NAS 也没有第二块盘，项目里唯一已知的 NAS 路径是跨部门共享盘，业务库里有企微客户会话原文，不能放上去。等常浩定一个只有他能访问的位置。
  - #76 之外还有一处要常浩定：低于毛利底线的方案是否继续作为「紧急」待办长期挂在首页（现在除了改价或改成历史没有办法消掉）。
  - 评估里列出但没做的：后端十几处各写各的「预览 → 确认」收敛成一个实现、统一代码格式、文件改名、内部原声三张表拆库、正式数据目录迁出工作区、12 条没有页面入口的需求接口去留。
  - 规则冲突（按全局规则第 16 节报告，未处理）：项目 AGENTS.md「分工」写「范围外的问题记进交接，不顺手修」，全局 CLAUDE.md 第 3 节写可以直接修相关问题。
- 本轮新坑：无。

## ui-preflight 扫出的界面问题：修掉 3 处显示问题，工具栏折行与策略页表头按常浩选的处理（2026-11-20，Claude，常浩回「牛马修，你另起会话吧」，工具栏回「按推荐办」，表头回「改成『覆盖明细』」；PR #68 已合并 `481923b`（常浩回「合」，经 agent-hud 转达），未发布）

- 时间：开工 `2026-11-20 12:24`（取 worktree 里第一条命令的时间，开工时没单独用 `date` 记）。★ 来由：常浩 11-20 用新 skill `ui-preflight` 扫 main `c8452f2` 的 22 页，扫出 5 类问题，母会话派本会话修。
- 改了哪些文件：`src/styles/80-review-p1.css`（读取失败框 `.state-error` 允许换行，原因至少留 200px：窄卡里原因、按钮各占一行，不再一字一行）；`src/styles/20-home.css`（待我处理卡只在读取失败时放开固定高度，报错框按自身高度放全；有列表时仍跟同行 Codex 板块走）；`src/styles/42-settings.css`（AI 接入表「执行方」列 150→160px，「仅支持 ChatGPT 网页」一行放下）；`src/styles/51-strategy-v2.css`（「版本与留痕」表去掉单元格 96px 下限，1280 宽不再多出 9px 横向滚动）；`docs/LESSONS.md`（L-23）。第二轮（常浩回「按推荐办」）：`src/styles/85-kb-v3.css`（品牌页搜索框 `flex: 100 1 240px; max-width: 360px`，剩余宽度先给它：1280 收到约 320px、筛选条一行，1440 仍 360px）；`src/modules/voice/VoicePage.jsx`（筛选条加类名 `voice-filter`，只给排除用）；`docs/design/pages.json`（顶层 `preflight.ignore` 排除 `.voice-filter`、`.report-toolbar`：这两处允许换行）；`docs/DECIDED.md`（登记这一条）。第三轮（表头改动确认后）：`src/modules/user/StrategyV2.jsx`（第 6 列表头改「覆盖明细」、悬停显示全称；图例加一项口径）；`src/styles/51-strategy-v2.css`（图例这一项左边加一条分隔线）；`docs/DECIDED.md` 再登记一行。
- 测试：`npm test` 原样结果 `ℹ pass 915` / `ℹ fail 0`。★ `npm run check:style` 通过；`npm run build && node scripts/ui-baseline.mjs compare` 6 张「和基线一致」。
- 验证：worktree 起隔离服务 5297（正式库 `sqlite3 -readonly .backup` 的副本、假 lark-cli / codex / claude、断外网），ui-preflight 改前 6 页、改后全部 22 页 × 1280 / 1440 复扫；首页、设置、策略三页另在 WKWebView 探针里量过（报错框三块都在卡内、标签高 21px 一行、版本表 scrollWidth = clientWidth）。全部 22 页复扫剩下的不通过：策略页表头（待定，见下）、Voice / 品牌 / 日报工具栏折行（待定，见下）、设计 Brief 标题框差 2px（改前就有、不在本次清单）；没有因本轮改动新增的问题。
- 截图：`~/Library/Application Support/NiumaHome/evidence/ui-preflight-fix-20261120/`（`before/`、`after1/`、`after-all/` 三份 ui-preflight 报告与标注图，`wkwebview/` 六张，`npm-test.log`；不入库）。
- 发布与回读：未发布。
- 与授权不一致之处、遗留问题、范围外发现：① 策略页优先级表第 6 列表头折 3 行：属已定内容（`b25c138`），单独发了改动确认，常浩回「改成『覆盖明细』」（经 agent-hud 转达）后改；22 页复扫策略页两宽度全过，WKWebView 表头一行。同一列数据格（如「23 / 17 / 6 / 0」）在 1280 下也折 2 行，main 上就有、ui-preflight 不查数据格，没改，列给常浩。② 工具栏折行：常浩回「按推荐办」（经 agent-hud 插件转达），品牌页改为一行，Voice 与日报页允许换行并在 ui-preflight 里排除；第二轮复扫三页 × 两宽度全过，品牌页搜索框 Chromium 1280 / 1440 为 319 / 360px，WKWebView 为 309 / 360px，都是一行；npm test 915 / 0，基线一致。排除是整块排除，这两条工具栏里别的截断问题以后也查不到了。③ 待我处理卡在 Codex 板块也读取失败时（两张都只剩报错框）整行会比原来高约 40px；Codex 正常时板块 234px，报错态的待我处理约 209px，行高不变（Codex 正常状态隔离环境断网拍不到，是按高度推算的）。④ 首页 Agent 卡四个小字说明、设置页飞书链接的省略号（⚠️ 提示）是改前就有的，没动。
- 本轮新坑：L-23。★

## AI 接入写进设置、能切换（2026-11-20，Claude，全局规则 P-13；常浩回「按计划开工」、选设置栏 A 版「一张总表」、回「合并」「先挪开再发布」；PR #64 已合并 `c8452f2`，已发布 nm-20261120-104534-c8452f2 回读通过）

- 时间：开工 `2026-11-20 09:55`（取 worktree 建立时间，开工时没单独用 `date` 记）。★ 来由：常浩 11-07 定 P-13（11-20 补「备用执行方」，agent-kit#93），母会话派本会话给牛马之家补齐。
- 改了哪些文件：`server/ai-executor.mjs`（新：执行方、功能清单、对外开放、数据对象的唯一出处；Codex / Claude 两个本机 CLI 执行方；可用状态检查；调用日志 `logs/ai-calls.jsonl`；`GET /api/v3/ai-access` 的数据）；`server/ai-draft.mjs`（按设置选执行方，失败没设备用方就报错指向设置，设了只转交一次，返回留痕）；`server/mentor.mjs`、`server/selftalk.mjs`（传功能编号、存与返回留痕 `trace` / `digestTrace` / `feedbackTrace`）；`server/v3-settings.mjs`（设置键 `ai_default_executor`、`ai_features`）；`server/routes/workspace.mjs`（接口）；`src/modules/settings/AiAccessCard.jsx` + `SettingsPage.jsx` + `src/styles/42-settings.css`（设置栏 A 版）；`src/ui/components.jsx` 的 `AiTrace`、`ProjectsPage.jsx`（亚古兽回答下显示留痕、说明文字改成「调用一次 AI」）、`SelfTalk.jsx`（周汇总与预览显示留痕）；`scripts/ui-baseline-setup.mjs`（基线环境也把 `claude` 换成假命令）；`AGENTS.md`「AI 接入」一节按实际改写、`docs/API.md` 补「AI 接入」；两项测试的 selftalk 返回字段断言加 `digestTrace`；新测试 `tests/ai-access.test.mjs`。
- 测试：`npm test` 原样结果 `ℹ pass 915` / `ℹ fail 0`。★ `npm run check:style` 通过；`npm run smoke` 24 项 0 项有问题（证据 `evidence/smoke-20261120-0229`）；`node scripts/ui-baseline.mjs compare` 6 张「和基线一致」。
- 验证：worktree 里另起隔离服务 5291（临时数据目录；预览工具起的服务跑的是主工作区代码，所以用命令起），真实 Chrome 面板 1440 与 1280 两个宽度，截图自查两轮：① 设置页把默认执行方切到 Claude（预览→确认→回读一致），带教页点「亚古兽回答」，只读林瑶 10-28 那天的飞书日志，留痕显示「Claude · 本机 CLI · claude-fable-5-2」，设置页「最近一次产出」同步；② PATH 去掉 codex、默认改回 Codex、亚古兽回答备用方设 Claude，设置页标「Codex 未安装」，回答由 Claude 产出，留痕写「原定 Codex，未安装，已转交」；③ 自言自语周汇总行内编辑备用方的预览、确认、回读。都没有发送飞书评论、没有写正式数据。
- 截图：`~/Library/Application Support/NiumaHome/evidence/ai-access-20261120/`（9 张 + `ai-calls.jsonl` + README，不入库）。三版预览：https://claude.ai/artifact/RfE6TYFH9DUbz9tsHB7CAc
- 发布与回读：已发布 `nm-20261120-104534-c8452f2`，`release-app.sh` 基线对比与回读 7 项全过（日志 `evidence/ai-access-20261120/release.log`）。主工作区有别人 11-09 未提交的 `docs/策略规则/README.md` 一行改动和 19 个未跟踪文件，常浩同意后用带标记的 stash 暂存、发布、按 SHA 放回，前后状态、改动行、未跟踪文件哈希逐一比对一致后删掉 stash（`evidence/ai-access-20261120/release-park/`）。正式 5280 的 `GET /api/v3/ai-access?refresh=1`：Codex、Claude 都是「可用」（launchd 下 `claude auth status` 能读到登录），默认仍是 Codex、三个功能都没设备用方，行为与发布前相同；截图 `prod-settings-5280.jpg`。正式服务里没有实跑 Claude 产出（要改正式设置，未做）。上一份正式快照是 11-10 的 `nm-20261110-172402-6ec82cd`，所以这次同时上线了之后合进 main 的 #44、#54、#56、#57、#58、#59、#60、#61、#63（带代码的是 #58 服务入口与内部原声、#59 基线对比，其余是文档和人设）。回滚：`bash scripts/release-app.sh --use nm-20261110-172402-6ec82cd`。
- 与授权不一致之处、遗留问题、范围外发现：① 「带教草稿」在 `ef3fc94` 之后页面已没有入口，只剩接口，功能清单如实写「页面暂无入口」，没补入口。② Agent 页两种助手标「仅支持 Codex / ChatGPT 网页」，没加 Claude 助手（常浩同意另议）。③ 设置页没进基线截图（带检查时间和本机状态），已登记 DECIDED.md 说明原因。④ `codex.mjs` 注释写按 codex-cli 0.160.1 协议，本机已是 0.166.0，没动。⑤ AGENTS.md 旧「AI 接入」说「本身不调用模型」、「Claude、Codex 用量」「ChatGPT 网页桥算数据对象」与现状不符，已按实际改写。已登记 DECIDED.md。
- 本轮新坑：L-22（spawn 的工作目录不存在也报 ENOENT，被误判「未安装」）。★

## 05 覆盖率校准：补旧版差异 27 格的逐项原因（2026-11-20，Claude，#32，常浩清 PR 积压时回「按建议」：PR #44 补上逐项原因再合；已提交、PR #44 待合并，无需发布）

- 时间：开工 `2026-11-20 06:21`（取证据目录的创建时间，开工时没有单独用 `date` 记）。★ 来由：PR #44 的 Codex 审查（11-11）「修完再合」，05 第 6 节要求与旧版不一致的月份逐个查原因，原校准只给了 33/60、28/60 两个汇总数。
- 改了哪些文件：`docs/策略规则/05-需求生命周期.md`（第 6 节「校准结论」加「旧版差异逐项原因」表和一段说明，变更记录那行补一句）；`docs/策略规则/README.md`（延期事项那行注明已补齐）。只改规则文档，不改代码、阈值、窗口和默认矩阵。
- 测试：`npm test` 原样结果 `ℹ pass 905` / `ℹ fail 0`。★
- 验证：在证据目录另拷的数据副本上重算 60 格，覆盖率、档位、旧档、考试类比率与 11-09 保存的 `result.json` 全部一致；不一致 27 格、只算考试类一致 28 格，与原校准相同。文档里每类的格数和格子用脚本结果核对过。没有启动服务，没有碰 5280 和正式数据。
- 截图：无（无界面改动）。
- 发布与回读：未发布（只改文档，无需发布）。
- 与授权不一致之处、遗留问题、范围外发现：① 11 格与口径无关：默认矩阵把香港、澳洲、加拿大的「高」直接给主战场，旧版没有这样给；只记为观察，没有加进修订候选，要不要复核第 7 节默认矩阵等常浩定。② 原因 C 的 3 格是按旧版理由判断的，不是算出来的。③ 逐项表和脚本在本机 `~/Library/Application Support/NiumaHome/evidence/2026-11-20-pr44-diff27/`，不入库。④ #32 其余验收项、#24 能否验收不在本轮范围。
- 本轮新坑：无。★


## 亚古兽人设：思维内核用法段修改、规程补两条（2026-11-19，Claude，#62，常浩看过改动确认和两轮试跑后回「装」；PR 待合并，已装到亚古兽）

- 时间：开工 `2026-11-19 23:15`（`date` 记录）。★ 来由：常浩 12:27 说亚古兽分析项目纪要「本末倒置」；完整经过和试跑记录见 digital-twin#244 及其 CURRENT。
- 改了哪些文件：`docs/亚古兽/角色配置-V3/SOUL.md`「思维内核」用法段（去掉「模型在思考里用，不在回答里摆」，加「结果要在回答里看得到」五样和「先定主线，再取证」）；`HERMES.md` 第 2 节加「按能力缺口带教」、第 3 节加「先加载 `thinking-mainline`」。底线逐字未改。
- 顺带同步：源文件此前比安装副本旧，缺销售侧边栏内容（第 8 节一句、第 9 节，digital-twin 11-19 装的），这次一并补齐；现在两份源文件与 `~/.hermes/profiles/agumon/` 下的安装副本逐字一致。
- 测试：`npm test` 原样结果 `ℹ pass 844` / `ℹ fail 0`；第一次推送没跑测试，本节缺「开工」「本轮新坑」两行，CI 的交接骨架检查失败，补齐后重跑。
- 回滚：把 `~/Library/Application Support/DigitalTwin/evidence/agumon-thinking-install-20261119/` 里的 `SOUL.before.md`、`HERMES.before.md` 拷回，`hermes -p agumon curator restore business-analysis-coaching`，重启 `ai.hermes.gateway-agumon`。
- 遗留：常浩要在飞书发 `/new` 才用上新人设。
- 本轮新坑：无（只改文档也要跑 `npm test`，交接格式检查在里面；属已有规则 G-03）。

## 接入基线截图对比与已定内容登记表（2026-11-19，Claude，常浩批准的复盘提案 P3 一批，由主会话派出；分支 `claude/ui-baseline` 开 PR #59；常浩 11-19 确认基线：不入库、策略页先不进基线，登记表都对；未发布）

- 时间：开工 `2026-11-19 05:05`（`date '+%F %H:%M'` 记录）。★ 来由：月度复盘里「补数据时顺带把定稿版式改掉、再恢复」出现过三次；把起步骨架（my-skills `8a984b4`）的基线截图对比和 `docs/DECIDED.md` 接进来，并拍候选基线给常浩确认。
- 改了哪些文件：新增 `scripts/ui-baseline.mjs`、`scripts/ui-baseline.spec.mjs`（骨架原件，加了 setup / style / clock / ready 四个可选项、单像素阈值 0.02、减少动态效果、关 LCD 子像素文字）、`scripts/ui-baseline-setup.mjs`（隔离服务：临时数据、假 lark-cli 与 codex、端口 5296，给培养路径写固定演示进度）、`scripts/ui-baseline-preload.mjs`（只给隔离服务：固定服务端时间、断外网）、`docs/design/pages.json`（3 页 × 1280 / 1440，基线目录指本机，见下面 11-19 收尾）、`docs/design/baseline.css`（截图时藏状态栏和 Agent 页模型列表报错条）、`docs/DECIDED.md`（首批 18 行，待常浩确认）、`tests/ui-baseline.test.mjs`（骨架自测，CI 没有 Chromium 时跳过）、`tests/release-ui-baseline.test.mjs`（发布脚本里对比的位置）；改 `scripts/release-app.sh`（新快照建好后先比基线，不一致删快照、不切换）、`scripts/check-style.mjs`（`ALLOWED_DEPS` 加 `@playwright/test`，理由：只给基线截图用、不进页面代码）、`package.json` / `package-lock.json`（`@playwright/test` 1.64.0，对应本机已缓存的 Chromium 1248）、`AGENTS.md`（导航表加一行指向 `docs/DECIDED.md`）、`docs/OPERATIONS.md`「发布」（加基线对比一条，改正原来写反的「先备份再生成快照」顺序）、`docs/LESSONS.md`（L-21）。
- 测试：`npm test` 原样结果 `ℹ pass 843` / `ℹ fail 0`（`ℹ skipped 0`，本机有 Chromium，骨架自测真跑了）；`npm run check:style` 样式检查通过；基线对比见「验证」。★
- 验证：隔离端口 5296 + 临时数据目录，看了策略、促销打法、Agent、培养路径四页的 1280 / 1440；同一版本连比三次都过；用 `git archive` + `vite build` 模拟一份发布快照（不跑 release-app.sh、不碰 launchd），原样对比通过，把 `--panel` 改成米色后 8 张全部失败。日志在 `~/Library/Application Support/NiumaHome/evidence/ui-baseline/verify-20261119/final/`。
- 截图：基线图在本机 `~/Library/Application Support/NiumaHome/ui-baseline/`（6 张，不入库）；另存一份 1280 宽给主会话做确认页。
- 11-19 常浩确认后的收尾（主会话）：`scripts/ui-baseline.mjs` 加可选项 `baseline`（基线目录，不写默认 `docs/design/baseline/`，不能在 /tmp），`pages.json` 指到本机持久目录、去掉策略页；`.gitignore` 加 `docs/design/baseline/` 防误提交；`docs/DECIDED.md` 改为已确认并加 11-19 一行；`docs/OPERATIONS.md`「发布」、`release-app.sh` 注释写明基线位置；两份测试补断言（基线目录、/tmp 报错、策略页不在清单）。仓库内那份基线副本移走后，`npm run build && node scripts/ui-baseline.mjs compare` 从本机目录读，6 张一致。
- 发布与回读：未发布。
- 与授权不一致之处、遗留问题、范围外发现：① 基线 PNG 不入库（常浩 11-19 定，同 10-23 那条），放本机持久目录；换电脑或目录被清掉时发布前检查会因「缺基线」拦下，要在 main 上重拍。骨架（my-skills project-starter）还没有 `baseline` 这个可选项，要不要带回骨架另议。② 业务、知识库、时间线、首页依赖飞书或本机数据，隔离环境没有演示数据，没进基线清单。③ 没接 CI：基线是在 macOS 上拍、常浩在 macOS 上确认的，Ubuntu 的字体渲染不同，CI 里比必然失败；装 Chromium 每次还要多 1～2 分钟。
- 本轮新坑：L-21。★

## 安全审计 PR #58 刷新（2026-11-17，Codex，常浩授权变基、验证与推送；待合并）

- 时间：开工 `2026-11-17 18:00`。
- 改了哪些文件：本轮只新增本节交接；现有审计实现与 900 项测试逐项复核，无缺失回归需补写。
- 测试：`npm test` 原样 `ℹ tests 900` / `ℹ pass 900` / `ℹ fail 0`，退出 0；`npm run build` 退出 0。main 原声实现对照回归失败，完整原样日志位于 `~/Library/Application Support/NiumaHome/evidence/2026-11-17-refresh/`。
- 验证：最新 origin/main `0ad8449`，rebase 无需重放、无冲突；只用隔离数据库与合成上游。结论为可直接合并。
- 截图：无，未改界面。
- 发布与回读：本轮更新指定审计分支与 PR #58，目标运行环境尚未采用。
- 遗留问题：构建已有 >500 kB 警告；没有合并阻断项。
- 本轮新坑：无。
