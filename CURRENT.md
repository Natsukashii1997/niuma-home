# 当前状态

当前阶段目标：月度用户策略批 1 上线：用户情况按 v2 生成、提交、确认（#24），发布到 5280，并通过 12 月技术试跑（#32）。（2026-11-08 常浩确认，digital-twin#114）

更新：2026-10-23。工作区 main；进入顺序见 [HANDOFF.md](HANDOFF.md)。历史过程已归档，下面是当前执行基线。

## 接入基线截图对比与已定内容登记表（2026-11-19，Claude，常浩批准的复盘提案 P3 一批，由主会话派出；分支 `claude/ui-baseline` 开 PR，基线待常浩确认、确认前不合并；未发布）

- 时间：开工 `2026-11-19 05:05`（`date '+%F %H:%M'` 记录）。★ 来由：月度复盘里「补数据时顺带把定稿版式改掉、再恢复」出现过三次；把起步骨架（my-skills `8a984b4`）的基线截图对比和 `docs/DECIDED.md` 接进来，并拍候选基线给常浩确认。
- 改了哪些文件：新增 `scripts/ui-baseline.mjs`、`scripts/ui-baseline.spec.mjs`（骨架原件，加了 setup / style / clock / ready 四个可选项、单像素阈值 0.02、减少动态效果、关 LCD 子像素文字）、`scripts/ui-baseline-setup.mjs`（隔离服务：临时数据、假 lark-cli 与 codex、端口 5296，给培养路径写固定演示进度）、`scripts/ui-baseline-preload.mjs`（只给隔离服务：固定服务端时间、断外网）、`docs/design/pages.json`（4 页 × 1280 / 1440）、`docs/design/baseline.css`（截图时藏状态栏和 Agent 页模型列表报错条）、`docs/DECIDED.md`（首批 18 行，待常浩确认）、`tests/ui-baseline.test.mjs`（骨架自测，CI 没有 Chromium 时跳过）、`tests/release-ui-baseline.test.mjs`（发布脚本里对比的位置）；改 `scripts/release-app.sh`（新快照建好后先比基线，不一致删快照、不切换）、`scripts/check-style.mjs`（`ALLOWED_DEPS` 加 `@playwright/test`，理由：只给基线截图用、不进页面代码）、`package.json` / `package-lock.json`（`@playwright/test` 1.64.0，对应本机已缓存的 Chromium 1248）、`AGENTS.md`（导航表加一行指向 `docs/DECIDED.md`）、`docs/OPERATIONS.md`「发布」（加基线对比一条，改正原来写反的「先备份再生成快照」顺序）、`docs/LESSONS.md`（L-21）。
- 测试：`npm test` 原样结果 `ℹ pass 843` / `ℹ fail 0`（`ℹ skipped 0`，本机有 Chromium，骨架自测真跑了）；`npm run check:style` 样式检查通过；基线对比见「验证」。★
- 验证：隔离端口 5296 + 临时数据目录，看了策略、促销打法、Agent、培养路径四页的 1280 / 1440；同一版本连比三次都过；用 `git archive` + `vite build` 模拟一份发布快照（不跑 release-app.sh、不碰 launchd），原样对比通过，把 `--panel` 改成米色后 8 张全部失败。日志在 `~/Library/Application Support/NiumaHome/evidence/ui-baseline/verify-20261119/final/`。
- 截图：基线图在分支的 `docs/design/baseline/`（**没提交**，见下一条）；另存一份 1280 宽给主会话做确认页。
- 发布与回读：未发布。
- 与授权不一致之处、遗留问题、范围外发现：① 基线 PNG 要不要进仓库待常浩定：OPERATIONS「交接写法」写着截图不提交进仓库（用户 2026-10-23 确认），仓库又是公开的；骨架约定基线图放 `docs/design/baseline/` 入库。这次图只留在本地 worktree，没提交、没推送；不入库的话发布前检查会因「缺基线」拦下所有发布，所以确认前不能合并。② 业务、知识库、时间线、首页依赖飞书或本机数据，隔离环境没有演示数据，没进基线清单。③ 没接 CI：基线是在 macOS 上拍、常浩在 macOS 上确认的，Ubuntu 的字体渲染不同，CI 里比必然失败；装 Chromium 每次还要多 1～2 分钟。
- 本轮新坑：L-21。★

## 亚古兽人设 V4 安装（2026-11-12，Claude，常浩看过改动确认与试答对比后回「合并」；PR #57 已合并 `c201ad0`，已装到亚古兽 profile；牛马之家无需发布）

- 时间：开工 `2026-11-12 10:40`（会话创建时刻）。★ 来由：常浩要亚古兽像企业分身——专业、严谨、干脆、直击本质，思考背后有思维建模，沉淀提示符合人设；改动与试答见 `docs/亚古兽/角色配置-V3/送审说明.md`「V4 人设深化」。
- 改了哪些文件：PR #57 改 `docs/亚古兽/角色配置-V3/SOUL.md`（思维内核、精简表达、做事原则两条、沉淀；底线逐字未改）、`HERMES.md`（§0 用户授权已登录；新增 §6 工作动态与记忆日报，原 §6、§7 顺延）、新增 `locales/zh.yaml`（亚古兽专属沉淀提示 15 条）、`送审说明.md`；本节 `CURRENT.md`。
- 测试：PR #57 CI `test` 通过（1m6s）；本节只改 CURRENT，跑 `node --test tests/handoff-format.test.mjs`。★ 未跑全量 `npm test`：本轮无代码改动。
- 验证：安装前备份到 `~/Library/Application Support/DigitalTwin/evidence/agumon-persona-20261112/install-before/`；装到 `~/.hermes/profiles/agumon/SOUL.md`、`workspace/HERMES.md`、`locales/zh.yaml`（新建目录，600），与 main 逐个 `cmp` 一致，SHA-256 前后缀与送审说明一致（`0d1582fa…06b3`、`c4af115e…9bb8`、`98343403…912f`）。10:56 重启 `ai.hermes.gateway-agumon`，10:57:11 日志 `✓ feishu connected`。飞书私聊实测待常浩发一句。
- 截图：无（本批无界面）。
- 发布与回读：牛马之家无需发布。回滚：把 `install-before/` 里的 SOUL.md、HERMES.md 拷回，删 `~/.hermes/profiles/agumon/locales/`，再重启亚古兽网关。
- 与授权不一致之处、遗留问题、范围外发现：① 新沉淀提示「📌 方法沉淀｜…」要等亚古兽下次沉淀时才能看到。② 主工作区有他人未提交的 `docs/策略规则/README.md`，本节在 worktree 提交，没碰它。
- 本轮新坑：无。

## 内部原声批 1：企微会话存档拉取（2026-11-10，Claude，常浩「按方案接入」、四项已定改动与三个细节「都按推荐」，后纠正为周 / 月 / 手动拉取且不看申诉；PR #51 + 修复 #52 已合并、已发布 nm-20261110-172402-6ec82cd 回读通过）

- 时间：开工 `2026-11-10 16:50`（试拉证据目录 `时间.txt`）。★ 来由：常浩拿到公司企微会话存档接口与 token，要做「用户之声」内部原声；总规格 #49，批 1 拆为 #50。
- 改了哪些文件：`server/internal-voice.mjs`（拉取：员工按部门筛大学销售企微-* / 国课销售企微-*，会话列表早于开始日期就停，单聊全存、群只留客户发言，按 msg_id 去重，并发 3、失败重试 3 次；周 / 月自动 tick；手动预览 → 确认；token 读钥匙串）；`server/routes/internal-voice.mjs`（status、pull/preview、pull/confirm）；`server/db.mjs`（`chat_conversations`、`chat_messages`、`chat_pull_runs`）；`server/index.mjs`（每小时 tick）；`server/v3-settings.mjs`（`internal_voice_auto` 默认 0）；`scripts/internal-voice-pull.mjs`（命令行试拉）；`scripts/health-check.sh`（开关开着时查 8 天内的每周拉取）；测试 `tests/internal-voice.test.mjs`（新 8 项）、`tests/health-check.test.mjs`（+1 项）；文档 `docs/API.md`「内部原声」、`docs/OPERATIONS.md`「内部原声拉取」、`AGENTS.md`（结构、AI 接入的数据对象）、`REQUIREMENTS.md`（Voice 两个标签）、`docs/LESSONS.md` L-19。
- 测试：`npm test` 原样结果 `ℹ pass 838` / `ℹ fail 0`（审查修正后）；修复 #52 后 `ℹ pass 839` / `ℹ fail 0`；`npm run check:style` 样式检查通过。
- 验证：隔离数据目录 `~/Library/Application Support/NiumaHome/evidence/内部原声-试拉-20261110/data`，真实接口拉 2026-11-02 至 11-08：`done（356s）`，37 个销售、6406 个单聊、3504 个群，入库 101837 条（客户 66137、语音 3288），失败 0。对账脚本抽 20 个单聊 + 10 个群比对接口条数，原样结果 `对上 30 / 30`；申诉部门混入 0、群里员工发言混入 0；时间范围 `2026-11-02 00:00:16` 至 `2026-11-08 23:59:52`。日志 `pull.log`、`reconcile.log`。审查修正后用新代码在同一隔离库重拉同一周：`done（430s）`，会话 9915 个（第一次之后又有 5 个会话来了新消息），新增 `messages: 0`，库内总数仍 101837，没有重复入库（`pull-2-修正后重拉.log`）。
- 代码审查（独立子 agent，只读）：高 1 中 3 已修——自动拉取只认 `done`，`partial` 下个小时重拉、巡检只认 `done`；会话列表翻完重读第 1 页补上翻页期间跳到最前的会话；任一任务让整次失败后各路不再取新会话、结束状态只写一次（`WHERE state='running'`）；拉取 promise 接住收尾错误防止未处理 rejection。低风险一并修：429 重试、单请求 60 秒超时、命令行不重置服务的 running 记录、过期预览清理、范围内没消息的会话不记。补测 4 项（多页、重排、中途 token 失效、partial 重拉）。
- 截图：无（本批无界面）。
- 发布与回读：常浩点「合并并发布」。主工作区有他人未提交的 `docs/策略规则/README.md`（加「10-报告内容规格」一行），常浩选「用干净 worktree 发布」：在本会话 worktree 检出合并后的提交，显式 `WORKDESK_DATA_DIR`、`WORKDESK_DIGIWORLD_DIR` 指向正式目录发布（快照内容同 `git archive HEAD`）。第一次发布 `nm-20261110-172059-7fda0fd` 回读 7 项通过，但实请 `/api/v3/internal-voice/status` 回 501（L-20，路由排在 v3 兜底后面），修复 PR #52 合并后重发 nm-20261110-172402-6ec82cd，回读通过、状态接口 200（见下）。回滚：`bash scripts/release-app.sh --use nm-20261109-213654-48f7758`。正式环境实请：`GET /api/v3/internal-voice/status` 200，`tokenConfigured: true`（launchd 服务能读钥匙串），`auto: false`、库内 0 条；`pull/preview` 倒序日期回 400 `RANGE_INVALID`。只读冒烟（第一次快照）`24 项，0 项有问题`。常浩确认后 17:33 把 `internal_voice_auto` 改为 1（设置预览 → 确认 → 回读 `auto=true`），重启服务（`launchctl kickstart -k`）让每小时检查立即触发：每周 11-02 至 11-08 `done`（17:34–17:40，9952 个会话，101837 条，0 失败，条数与隔离试拉一致）；每月 10-01 至 10-31 `done`（18:33–18:50，20324 个会话，439213 条，客户 267145、语音 13227，0 失败）。正式库合计 541050 条（客户 333282），覆盖 10-01 至 11-08。10 月抽 30 个会话对账 `对上 30 / 30`，申诉混入 0、群里员工发言混入 0（证据 `evidence/内部原声-正式拉取-20261110/`）。
- 与授权不一致之处、遗留问题、范围外发现：① 群里客户发言 4.8 万条，是单聊客户发言（1.8 万）的 2.6 倍，大群闲聊多，批 3 提炼时要按群类型或发言内容再筛。② 当前 token 属于提需机器人超管账号（`ai:read:all`，2027-01-07 到期），建议管理员给牛马之家单独签 PAT，换时只改钥匙串。③ 语音 3288 条未转写。④ 页面上的手动拉取按钮与开关在批 4 样稿里一起做。⑤ 顺手改动、改变已有行为：`server/db.mjs` 的 `openDb` 加 `PRAGMA busy_timeout = 5000`，所有连接遇到锁会等最多 5 秒再报错（原来立刻报 SQLITE_BUSY），为了每日备份或命令行与服务同时读写时不直接失败。
- 本轮新坑：L-19、L-20。

## 批 1 验收 #32：12 月技术试跑、覆盖率阈值校准、反例对照（2026-11-09，Claude，常浩点「照计划开始」；校准结论 PR #44 未合并；无需发布）

- 时间：开工 `2026-11-09 21:59`（签发凭据时刻，命令输出的签发时间）。★ 来由：批 1 验收票 #32 的前三项。
- 改了哪些文件：本节 `CURRENT.md`；分支 `claude/32-coverage-calibration`（PR #44）改 `docs/策略规则/05-需求生命周期.md`（第 6 节加「校准结论」，变更记录加一行，未改规则）与 `docs/策略规则/README.md`（延期事项注明已处理）。正式库：签发智能体凭据 `claude-skill`（`strategy_facts,strategy_submit,strategy_submission`，凭据在 `~/Library/Application Support/NiumaHome/agent-env/claude-skill.env`，600 权限）。
- 测试：main `4997cf5` 上 `npm test` 原样结果 `ℹ pass 825` / `ℹ fail 0`；PR #44 分支同样 825/0；skill `node --test tests/*.test.mjs` `ℹ pass 28` / `ℹ fail 0`。
- 验证：① **12 月试跑**（由子会话「月度策略·12 月技术试跑（#32）」执行，skill 1.2.0）：提交 `SUB-2026-12-252dc948`，服务端校验拦截 0、提示 0；常浩在页面确认，本会话从正式接口回读到 `REV-2026-12-2`（`confirmed_from=page`，`submission_id=SUB-2026-12-252dc948`），提交状态 confirmed。链路技术上通过。试跑记录 `~/Library/Application Support/NiumaHome/evidence/strategy-2026-12-20261109-2200/trial-record.md`，其中「常浩确认」「回读」两节子会话还没补。② **阈值校准**：在迁移试跑隔离副本上只读计算 12 个月 × 6 地区，72 格 69 高 / 2 中 / 1 低，±5 个百分点只改 3 格；口径饱和（统计范围 45 天 + 开学窗口 37 天 + 任一重叠即活跃），不改阈值，三条修订候选待常浩批准。③ **反例对照**：1–5、7–26（含 8a、8b）26 项都有代码测试且通过，#2、#4、#21、#22 另有 skill eval。②③ 证据：`~/Library/Application Support/NiumaHome/evidence/2026-11-09-coverage-calibration/`（`calibrate.mjs`、`result.json`、`校准与反例对照.md`）。
- 截图：试跑页面截图见试跑证据目录（`page-pending-01-header.jpg`、`page-pending-02-diff.jpg`）。
- 发布与回读：无需发布；正式库只多了凭据和 12 月 r2。
- 与授权不一致之处、遗留问题、范围外发现：① **内容质量未达标**：常浩审阅 12 月页面后反馈产出「看不懂、拆得太碎、没有重点和结论、推断太浅」，试跑会话判断根因在产出层设计，已起草产出结构草案与 `docs/策略规则/10-报告内容规格.md`（主工作区未提交），skill 返修在交接会话「【交接】月度用户策略 skill｜按 GPT 审核返修 2.0」等常浩拍板；#24 能否验收由常浩定，本节不判。② 试跑会话记录的其他问题：波士顿大学「出分时间」列被归为「其他」没算出分窗口（列名映射）；`assemble.mjs` 40 字检查口径与 SKILL.md 字面不一致；详见 trial-record「问题」。③ #26、#31 已完成未关 issue。④ 凭据 `claude-skill` 留着供后续生成用，不用时 `node scripts/agent-token.mjs revoke claude-skill`。
- 本轮新坑：无。

## 月度策略 v2 迁移切换到正式库（2026-11-09，Claude，常浩看过迁移报告网页后说「同意切换」；只改交接、无代码改动；无需发布）

- 时间：开工 `2026-11-09 21:54`（`date '+%F %H:%M'` 记录）。★ 来由：批 1 已发布（见下一节），常浩看过 `plan-1` 报告（做成网页 https://claude.ai/artifact/BSUA5fko2d9epW2f4Cq8ce，本地副本 `plan-1/月度策略迁移报告.html`）后同意切换。
- 改了哪些文件：只有 `CURRENT.md`（本节）；正式库 `data/work-desk.db` 写入 12 个迁移版本。
- 测试：未跑 `npm test`（本节没有改代码，上一节发布前 `ℹ pass 825` / `ℹ fail 0`）；切换脚本自身逐月比对报告指纹、覆盖率与默认优先级全部一致才写入。
- 验证：`node scripts/migrate-strategy-v2.mjs apply --data data --report "<证据>/2026-11-09-strategy-v2-migration/plan-1" --confirm` 写入 `REV-2026-01-1` … `REV-2026-12-1`（`confirmed_from=migration`、`confirmed_by=migration-script`）；经正式 5280 接口回读 12 个月版本都在，去掉 `inputs` 后与试跑的 `migrated/<月份>.json` 逐字段一致 12/12；内置浏览器打开 `#/user/strategy`（11 月）显示「正式版本 r1 · 已确认 11-09 21:54」、六个地区分档与理由、香港和加拿大标「与默认不同」、其他「待研判」，控制台没有错误。
- 截图：`~/Library/Application Support/NiumaHome/evidence/2026-11-09-strategy-v2-migration/plan-1/apply-2026-11-09T13-54-00-886Z/after-apply-strategy-2026-11.jpg`。
- 发布与回读：无需发布（只写数据）。切换前备份 `…/apply-2026-11-09T13-54-00-886Z/work-desk-before-apply.db`，日志 `apply-log.json`。回退见 OPERATIONS「月度策略 v2 迁移」第 4 步（先 `rollback --data data` 预览）。
- 与授权不一致之处、遗留问题、范围外发现：① 下一步是 #32 的 12 月技术试跑：正式库还没有给 skill 用的智能体凭据（只有 `agumon`），签发要写正式库，须常浩同意。② 业务背景卡仍空，34 条障碍已按规则降为未知，补背景卡后由 skill 下一份提交提回。③ 27 处分档与默认建议不一致留待 #32 校准覆盖率阈值后再看。④ #26、#31 已完成未关 issue。
- 本轮新坑：无。

## 月度用户策略批 1 发布到 5280，并用正式库出迁移报告（2026-11-09，Claude，常浩点「发布批 1」；只改交接、无代码改动；已发布 `nm-20261109-213654-48f7758` 回读通过；未切换正式数据）

- 时间：开工 `2026-11-09 21:36`（`date '+%F %H:%M'` 记录）。★ 来由：批 1 的票（#25、#27–#30、#39–#41）都已合进 main，正式服务仍是 `nm-20261107-231835-b8deee5`，v2 接口返回 501。
- 改了哪些文件：只有 `CURRENT.md`（本节）。
- 测试：发布前在 main（`48f7758`）`npm test` 原样结果 `ℹ pass 825` / `ℹ fail 0`；发布前单独跑 `bash scripts/verify-release.sh` 回读旧快照通过（L-12）。
- 验证：① 发布后 `curl` 正式 5280：`/api/v3/strategy-v2?month=2026-12`、`…/revisions`、`…/submissions`、`…/evidence` 都返回 200，evidence 没有报 `409 TIMELINE_RESYNC`（新服务启动后 21:37 自动同步过时间线，快照已带原格信息）。② `npm run smoke -- --base http://127.0.0.1:5280` 24 项 0 项有问题，证据 `~/Library/Application Support/NiumaHome/evidence/smoke-20261109-1337`。③ 内置浏览器打开 `#/user/strategy`：顶部是 v2 工具栏（正式版本「v2 尚无正式版本」、业务背景卡「未填写」），下面按设计退回 v1 旧视图，控制台没有错误。④ 迁移试跑（只读正式库，不加 `--refresh-timeline`）：`node scripts/migrate-strategy-v2.mjs plan --data data --out "$HOME/Library/Application Support/NiumaHome/evidence/2026-11-09-strategy-v2-migration/plan-1"`，12 个月全部通过，条目逐月守恒、校验 0 错误 0 提示；`SUMMARY.md` 表格与 11-08 隔离试跑 `plan-2` 逐行一致；各月共 27 处旧分档与覆盖率默认建议不一致（⚠），与 11-08 相同。
- 截图：无界面改动；冒烟截图见上面证据目录。
- 发布与回读：`GIT_CONFIG_COUNT=1 … bash scripts/release-app.sh`（忽略他人未跟踪文件），快照 `nm-20261109-213654-48f7758`，自动回读 7 项全 ✓（launchd、进程、只监听 127.0.0.1、首页与 12 个构建文件、166 个源码文件与提交一致、错误日志为空、版本号）；日志 `~/Library/Application Support/NiumaHome/evidence/2026-11-09-batch1-release/release.log`。保留策略清掉旧快照 `nm-20261102-201455-38ea63d`、`nm-20261102-174752-ee743c9` 和两份 10-28 的发布前备份。回滚：`bash scripts/release-app.sh --use nm-20261107-231835-b8deee5`。
- 与授权不一致之处、遗留问题、范围外发现：① **未切换正式数据**：须常浩看过 `plan-1/SUMMARY.md` 与 `reports/` 并明确同意，再按 OPERATIONS「月度策略 v2 迁移」第 3 步执行 `apply --report plan-1 --confirm`。② OPERATIONS 写「同意后中间不要再同步时间线」，但服务每 10 分钟自动重读飞书；#39 后快照指纹只看内容，飞书内容没变就不影响，变了 `apply` 会拒绝、要求重出报告（安全，但可能要重跑一次试跑）。③ 正式数据目录只有 `agumon` 一个智能体凭据，没有 `strategy_facts` / `strategy_submit` 授权；#32 的 12 月试跑要在正式库签发 skill 用的凭据（写正式库，须常浩同意）。④ 背景卡还是空的，引用业务证据的障碍和购买准备度会被封顶（见 #40 一节）。⑤ #26、#31 的活已经完成，issue 还开着，未关。
- 本轮新坑：无。

## 月度策略：购买判断证据口径与 skill 预检对齐，背景卡加适用范围（2026-11-08，Claude，由 #24 交接会话按 issue #40 派出；常浩「按推荐开工」定 5 处细节、页面选样稿 A；分支 `claude/40-evidence-scope`，常浩说「CI 过后合并」，PR #43 squash 合并为 `b8144a8`，关闭 #40；未发布，批 1 合起来再发布）

- 时间：开工 `2026-11-08 20:12`（`date '+%F %H:%M'` 记录，拉分支时）。★ 来由：服务端校验器把管理判断也算行为证据、readiness 不查、不按强度封顶、不查业务证据适用范围，绕过 skill 直接 `strategy_submit` 时拦不住（#40，来源 my-skills PR #76 遗留第 2 条）。
- 改了哪些文件：`server/strategy-service.mjs` 背景卡条目加可选 `countries`（只收时间线认识的 10 个代码，转小写、去重、排序）、`relation`（新签 / 续费 / 通用），带进 business Evidence，只在填了时计入 `evidenceVersion`（老条目版本不变）；`server/strategy-evidence.mjs` 导出 `KNOWN_COUNTRIES`；`server/strategy-validate.mjs` 行为证据只认事实记录、业务观察和 Voice，readiness 与 barrier 同一套规则，按适用行为证据最高强度封顶（known 须事实记录，partial 须业务观察以上），范围没填或对不上最高 inferred + weak，报错写明哪条证据、哪里对不上；`src/modules/user/StrategyV2Parts.jsx`、`strategy-v2.js`、`src/styles/51-strategy-v2.css` 背景卡每条加「适用范围」行（样稿 A：国家 chip、人群分段切换、右侧状态标签；顶部统计未填条数；保存差异写出范围）；测试 `tests/strategy-validate.test.mjs`（+6 项，改 1 处旧断言：没有类型和范围的业务证据不再能撑 known）、`tests/strategy-service.test.mjs`（+1 项）、`tests/strategy-v2-view.test.mjs`（+1 项）；文档 `docs/API.md`、`docs/策略规则/07-业务背景卡.md`（升 bizcard-v1.1）、`docs/策略规则/README.md`。
- 测试：`npm test` 原样结果 `ℹ pass 825` / `ℹ fail 0`；`npm run check:style` 通过；`npm run build && npm run smoke` 24 项 0 项有问题（审查修改后重跑，证据 `~/Library/Application Support/NiumaHome/evidence/smoke-20261108-1240`，`/user/strategy` 无资源失败）。反向验证：临时去掉范围检查，4 项新测试失败，恢复后全过。
- 验证：① 与 skill 口径对齐：用 skill 1.1.0 `tests/assemble.test.mjs` 里 14 个购买判断样例（E6、E7、P1-01 与基础稿），把 skill 从原文推出的范围换成结构化字段后跑服务端校验，14 个判定全部一致；不填范围时有 5 个 skill 能过的稿子被封顶拒掉（预期影响）。脚本与输出 `…/evidence/2026-11-08-40-evidence-scope/parity.mjs`、`parity-output.txt`。E1–E7 盲测要另起 agent 生成研判稿，未跑。② 页面：隔离服务 5290（临时数据目录，用接口写入示例背景卡），宽度只看 1440；真实点选国家、人群 →「其他国家…」展开 → 预览（差异写出范围）→ 确认 → 页面「回读核对一致」，接口回读字段一致；先美国后英国保存为 `uk, us`；预览期间范围按钮变灰；改前改后计算样式逐项比对（弹窗宽、描边、字号、输入框高一致）。
- 截图：`~/Library/Application Support/NiumaHome/evidence/2026-11-08-40-evidence-scope/`：`before-bizcard-modal.jpg`（改前）、`after-00…05`（点选、重开、预览差异、锁定态、排序后预览、分段对齐）、`mockup-bizcard-scope.html`（三版样稿，常浩选 A）。
- 发布与回读：未发布。
- 与授权不一致之处、遗留问题、范围外发现：① **接上后的影响**：现有背景卡条目都没有范围字段，引用业务证据的障碍和购买准备度会先被封顶到 inferred + weak，直到常浩在背景卡里补上范围；页面顶部会提示还有几条没填。② skill 侧要跟着改（预填 `countries`、`relation`，本地预检改读字段、不再从原文推），归 my-skills 后续，本 PR 不做。③ skill 还用范围拦 observed 痛点和实际商业关系，服务端这两处这次没加（常浩定的细节④）。④ Voice 按证据自带 `strength` 算，`strong` 可单独撑 known（细节⑤）；服务端目前不产出 Voice 证据，这条分支暂时跑不到。⑤ `RULE_VERSIONS` 没加背景卡版本，02 障碍体系文本与版本未改（规则写在 07 bizcard-v1.1）。⑥ 顶部提示用了规范里的 `.warn`（左侧 4px 琥珀线），样稿是整块琥珀底，其余按样稿 A。⑦ 研判依据区显示业务证据时还不显示范围，未做。
- 本轮新坑：无。

## 月度策略：`strategy_submission` 支持按 idempotencyKey 查询（2026-11-08，Claude，由 #24 交接会话按 issue #41 派出；分支 `claude/41-submission-by-key`，常浩说「CI 过后合并」，PR #42 squash 合并为 `1497745`，关闭 #41；未发布，批 1 合起来再发布）

- 时间：开工 `2026-11-08 19:40`（事后估计：收到派单、读完 issue 的时刻，开工时没有用 `date` 记录；本节测试结果在此之后跑出）。★ 来由：skill 提交结果不明（超时、断网）又没拿到 submission id 时查不到这次提交有没有入库，只能请常浩去页面看（#41，来源 my-skills PR #76 遗留第 3 条）。
- 改了哪些文件：`server/agent-tools.mjs` 的只读工具 `strategy_submission` 增加可选参数 `idempotencyKey`，与 `id` 二选一（都没给、都给或为空回 400）；`server/strategy-service.mjs` 新增 `submissionByKey`，只按「当前凭据对应的 agent + key」查，返回形状与按 id 查一致，查不到回 `404 SUBMISSION_NOT_FOUND`（「没有这次提交」）；`tests/strategy-service.test.mjs` 新增 1 项（走真实 HTTP 路由与两个 agent 的凭据：按 key 查到且状态随拒绝变化、与按 id 查结果逐字段一致、另一个 agent 查不到、key 不存在 404、四种参数错误 400、调用全部记进 `agent_calls`）；`docs/API.md`「智能体接入」工具表与 `AGENTS.md`「AI 接入」只读工具描述同步。没有改表结构，skill 侧（my-skills）未改。
- 测试：`npm test` 原样结果 `ℹ pass 815` / `ℹ fail 0`；`npm run check:style` 通过（「样式检查通过」）。
- 验证：测试内起临时 HTTP 服务 + 临时数据目录 + 夹具时间线，用 `issueAgentToken` 签发 `claude-skill`、`codex-skill` 两个凭据实测；没有界面改动，没起正式服务，没碰 5280 和 `data/`。
- 截图：无。
- 发布与回读：未发布。
- 与授权不一致之处、遗留问题、范围外发现：① 没查到时除 404 外还带了 `code: SUBMISSION_NOT_FOUND`，好让 skill 区分「没有这次提交」和「没有这个工具」（`TOOL_UNKNOWN` 也是 404）；按 id 查不到仍是原来的 404（不带这个 code），没改。② 按 id 查的返回里本来就有 `rejectReason`（#30 加的），API.md 原表漏写，这次一并补上。③ 范围外，未修：`strategy_submissions.idempotency_key` 是全局唯一，`strategy_submit` 查重复也不分 agent——另一个 agent 用同一个 key 同一内容提交，会拿到别人的 submission（`repeated: true`），内容不同则 409；这时它按 key 也查不到（因为记录属于别人）。单用户环境里 key 由 skill 生成、撞上的概率很低，要改得动表约束或提交逻辑，等常浩决定是否另开 issue。
- 本轮新坑：无。

## 月度策略：修「提交约 10 分钟后必然过期」（2026-11-08，Claude，常浩点「修 10 分钟过期」；分支 `claude/fix-stale-fingerprint`；常浩说「合并」，PR #38 squash 合并为 `a3c008d`，关闭 #39；未发布，批 1 合起来再发布）

- 时间：开工 `2026-11-08 15:30`（事后估计：收到「修 10 分钟过期」后开 worktree 的时刻；本节测试结果在此之后跑出）。★ 来由：#31 skill 会话在隔离工作台试跑时发现，#28 的快照指纹含时间线同步时间 `syncedAt`，工作台每 10 分钟重读飞书，内容没变也会让待确认提交转 stale。
- 改了哪些文件：`server/strategy-service.mjs` 快照指纹改为只看内容（事件、异常与裁定核验、学校名单）；`tests/strategy-service.test.mjs` 新增「只改同步时间不算变化、可以确认」，反例 17 改用真实的日期变化构造。
- 测试：`npm test` 原样结果 `ℹ pass 801` / `ℹ fail 0`；`npm run check:style` 通过。
- 验证：临时数据目录 + 夹具时间线；没有界面改动。
- 截图：无。
- 发布与回读：未发布（批 1 合起来再发布）。
- 与授权不一致之处、遗留问题、范围外发现：PR #36（#29 迁移）、PR #37（#30 页面）若改到 `server/strategy-service.mjs` 或这份测试，合并时需要对齐（#36 已先合并，本分支已合入 main，`strategy-service.mjs` 自动合并无冲突，合并后 `npm test` 808/808；#37 合并后再次合入 main，`npm test` 814/814）。
- 本轮新坑：无。

## 月度用户策略批 1·1d 策略页 v2（A 报告式）（2026-11-08，Claude，由批 0 交接会话按票派出，常浩已选定样稿 A；已提交在分支 `claude/inspiring-wu-f8c8d5`，PR 待合并；未发布，批 1 合起来再发布）

- 时间：开工 `2026-11-08 14:47`（`date '+%F %H:%M'` 记录）。★ 来由：批 1 票 #30，按 #26 评论里常浩选定的 A 报告式样稿实现新版月度用户策略页。
- 改了哪些文件：新增 `src/modules/user/StrategyV2.jsx`（页面：工具栏、待确认提示条、吸顶导航、0 核心结论 / 1 全局研判 / 2 地区单元矩阵、判断条目与研判依据；没有正式版本时嵌 v1 旧视图）、`src/modules/user/StrategyV2Parts.jsx`（3 待确认提交的差异与确认 / 拒绝、附 版本与留痕及回退、存 旧版存档、业务背景卡弹窗）、`src/modules/user/strategy-v2.js`（纯逻辑：标签推导、依据已变化、证据显示、两份文档差异）、`src/styles/51-strategy-v2.css`（`index.css` 登记）；`src/modules/user/StrategyView.jsx` 把原页面改成受外层月份控制的 `StrategyV1`（去掉自己的月份切换，其余不动）；`UserPage.jsx` 入口换成 v2；接口：`server/strategy-service.mjs`、`server/routes/user.mjs` 新增 `GET …/revisions/:id`、`GET …/submissions?month=`、`GET …/evidence?month=`，拒绝可带 `reason`，版本列表带 `snapshot`；`server/db.mjs` 给 `strategy_submissions` 加 `reject_reason` 列（SCHEMA + 旧库补列）；`docs/API.md` 同步；测试 `tests/strategy-service.test.mjs` 加 1 项、新增 `tests/strategy-v2-view.test.mjs`（5 项）。
- 测试：`npm test` 原样结果 `ℹ pass 806` / `ℹ fail 0`；`npm run check:style` 通过；`npm run build && npm run smoke` 24 项 0 项有问题（审查修改后重跑，证据 `~/Library/Application Support/NiumaHome/evidence/smoke-20261108-0728`，策略页无资源失败）。
- code-review（规范 + 规格两个子 agent）后补改：① 硬违规（STYLE-GUIDE 第 5 节「时效」）：确认预览打开后改「采纳 / 保留」或「保留这条」不会作废旧预览，确认的是旧选择——改为改选即作废，已在页面复验；② 确认回读从「只比版本号」改为核对内容（非手写判断、核心结论与提交一致；采纳的手写内容换成新文、保留的仍是原文）；拒绝回读同时核对原因；③「本月未提供业务背景」改按该版本确认时的 `inputs.bizcard` 判断（原来看当前背景卡）；④ ⑤ ⑥ 两格补关联事件行；⑤ 空情境没写原因时标「空 · 未写原因」（原来一律「有原因」）；⑥ 没有正式版本但有提交时也给「版本历史」；⑦ 确认时提交已过期，回读后第 3 节写明「最近一份提交已过期，没有写入」；⑧ 样式间距、字号回到刻度（4 / 8 / 12…，11px 起），折叠开关改用 PixelIcon；抽出重复逻辑（写入锁、依据已变化、版本号、回退来源）。规格轴提出的「工具栏多了导出到飞书、续费未知提示」两项在样稿 A 的工具栏里本来就有，保留。
- 验证：隔离数据目录（scratchpad 下 `iso-data`）+ 服务端口 5391，时间线经 `lark-cli` 只读现读真实表；用脚本模拟一份迁移版本 r1（含两条「你写的」，其中一条依据版本过期、含 legacy），再用智能体凭据走真实 `strategy_submit` 提交。页面实测（真实点击与输入）：选「采纳新文 / 保留原文」→ 勾选保留依据已变化 → 预览 → 确认生成 r2 → 回读一致（接口回读：采纳的换成新文，保留的依据版本更新为当前）；拒绝 S2 并写原因 → 回读为「已拒绝」；看差异、回退到 r1 生成 r3 → 回读一致；背景卡漏写事实记录出处被拦，补齐后预览 → 确认 → 回读一致；改背景卡让提交过期：提示条标「已过期」、确认按钮不可点；预览打开后再改背景卡点确认 → 服务端 409 → 「预览已失效」；2026-11、2027-01（无 v2 版本）显示提示并保留 v1 旧视图。宽度只看 1440（只做电脑版）。开发页（Vite）的写请求会被来源校验拦下（见 L-18），写入流程改在服务端口直接打开构建产物测。
- 截图：`~/Library/Application Support/NiumaHome/evidence/2026-11-08-strategy-v2-page/`：`before-01-top.jpg`（改前）、`r1-*`（第一轮：提示条、矩阵、待确认提交、写入预览、确认后、拒绝、版本差异、背景卡拦截 / 预览 / 保存、过期提示、过期后确认、研判依据、无正式版本）、`r2-*`（第二轮：带证据的矩阵、r4 顶部）。
- 发布与回读：未发布。
- 与授权不一致之处、遗留问题、范围外发现：① 为满足样稿 A 加了三个只读接口和拒绝原因列（版本详情用于看差异与回退前查看、全部提交用于「提交记录」、引用证据用于关联事件与研判依据），票面没写，理由是现有接口拿不到这些数据。② 迁移数据才能带 `legacy`，skill 提交确认后新版本没有 legacy：页面在当前版本没有时读最早的版本，并注明来源；读取约定写在共享笔记 `30-页面读取约定.md` 给 #29、#31。③ `academic_need` 放在「⑤ 需求状态」显示（03 第 6.1 节没写它的位置）。④ Claim 没有反驳字段，研判依据里「反驳」一栏显示「未记录」；Opportunity 的 Toulmin 反驳批 2 起有。⑤ 已知代价照样稿：矩阵每列窄，② 关键节点和 ⑧ 研判依据会很长。⑥ 范围外：开发页写请求被来源校验拦（`vite.config.js` 代理简写会改写 Host，`http.mjs` 注释与实际不符），未修，见 L-18。⑦ 写入成功后整页重新读取会回到加载态再显示（页面不保留滚动位置，成功提示在顶部）。
- 本轮新坑：L-18。

## 月度用户策略批 1·1c 旧数据迁移（2026-11-08，Claude，按批 1 票 #29 推进；已提交到分支 `claude/mystifying-keller-7fcf35` 并开 PR，未合并；未切换正式数据；未发布）

- 时间：开工 `2026-11-08 14:47`（`date` 记录）。★ 来由：批 1 票 #29，按 04-迁移映射把 12 个月旧版用户情况和本地改过的月份迁成 v2 revision，可回退。
- 改了哪些文件：新增 `server/strategy-migrate.mjs`（纯函数：旧记录 → v2 文档 + legacy；迁移检查；每月差异报告）；`server/strategy-service.mjs` 加只供脚本用的 `writeMigration`（`confirmed_from=migration`，按迁移放宽校验，沿用 `writeRevision`）与 `rollbackMigration`（只删迁移版本），都不进 HTTP 路由和智能体工具；新增 `scripts/migrate-strategy-v2.mjs`（plan / apply / rollback 五步）；新增 `tests/strategy-migrate.test.mjs`（6 项：反例 16、检查能抓违规、重复写入、回退、脚本端到端含回退实测、试跑后旧记录被改则拒绝切换）；`docs/策略规则/04-迁移映射.md` 升 migration-v1.2、`09-反例测试集.md` 升 cases-v1.2、README 同步；`docs/OPERATIONS.md` 新增「月度策略 v2 迁移」一节（试跑、切换、回退命令）。
- 测试：`npm test` 原样结果 `ℹ pass 807` / `ℹ fail 0`（含 `check:style` 与交接格式检查）；`tests/strategy-migrate.test.mjs` 7 项全过。
- code-review（规范 + 规格两个子 agent）后补改：回退删除触发器的语句改为引用 `server/db.mjs` 导出的同一条（不在服务层另写表结构）；回退先预览（不带 `--confirm` 只列将删的版本和将转 stale 的提交）；机会收敛按 04 §4 映射字段（「新签 / 续费」→ 通用）；切换时覆盖率或默认优先级与报告不一致也拒绝、要求重出报告；迁移版本 `confirmed_by` 记 `migration-script`，不冒用「常浩」；内置月份与页面一致按 `strategy: null` 读取；情境编号拼接收成一个函数。未采纳：脚本读时间线快照的几行与 `strategyTimelineView` 相似，抽公共函数要动 `user-strategy.mjs`，不在本票范围。
- 验证：真实数据隔离试跑 `node scripts/migrate-strategy-v2.mjs plan --data data --out "$HOME/Library/Application Support/NiumaHome/evidence/2026-11-08-strategy-v2-migration/plan-2" --refresh-timeline`（plan-1 是审查前的第一次试跑，留作对照）：12 个月全部通过（条目 104–131 条逐月守恒，校验器 0 错误 0 提示，隔离库写入回读一致）；正式库只以只读方式做了一致备份，`data/logs/lark-calls.jsonl` 最后一条仍是 05:41（飞书重读只记在隔离副本里）。
- 截图：无（没有界面改动）。
- 发布与回读：未发布；未切换正式数据（须常浩看过差异报告并同意；切换前还须发布批 1 并同步一次时间线，见 OPERATIONS）。
- 与授权不一致之处、遗留问题、范围外发现：① **规则冲突，已改 04 为 v1.2，须常浩知悉**：旧 A2「觉得还来得及」34 条（全是「AI 判断」）换算成 `BR-M2` 后，02 §2.3 和校验器要求没有用户决策行为证据时只能 `unknown`，与 04 v1.1「AI 判断 → inferred + weak」冲突；按「只降不升」迁成 `unknown`（gap、route 指向业务背景卡），正文不动。② 04 没写的四处按推断补进 v1.2：tempNote 第二条起（44 处）进 legacy；readiness 每个迁移情境一条（other 有两个情境）；主障碍取旧版列出的第一条；legacy.regions 按旧地区 key（含 sg）存放，条目保留 `[正文, 来源]`；1.2 三栏条目加了 `origin` 字段（03 第 4 节没有这个字段）。③ 真实数据里没有「你写的」条目，manual 逐字一致只用测试夹具验证。④ 覆盖率按当前时间线重算后几乎全是「高」（11 月英国 74%、美国 100%），12 个月共 27 处旧分档与 05 §7 默认建议不一致，报告里标了 ⚠；覆盖率阈值校准是 README 延期事项（批 1 验收前），不在本票。⑤ 回退为删除迁移 revision 需临时摘掉删除触发器（I-10 的唯一例外），迁移之后已有新版本的月份拒绝回退、改用数据库备份恢复。⑥ 切换要在发布批 1、同步时间线之后用正式库重出一份报告给常浩看，之后不能再同步时间线就切换（脚本会因覆盖率变化拒绝）。⑦ `--refresh-timeline` 的飞书调用只记在隔离副本的 `logs/lark-calls.jsonl`（隔离副本就是那次运行的数据目录）。
- 本轮新坑：无。

## 月度用户策略批 1·1b-2 提交与确认（2026-11-08，Claude，常浩说「按推荐开工」后按票推进；常浩说「CI 过后合并」，PR #35 squash 合并为 `227be7d`；未发布，批 1 合起来再发布）

- 时间：开工 `2026-11-08 15:00`（事后估计：1b-1 合并后开 worktree 的时刻，开工时没有用 `date` 记录；本节测试结果都在此之后跑出）。★ 来由：批 1 第四张票 #28，打通「skill 提交 → 工作台校验 → 常浩页面确认 → 不可变 revision」。
- 改了哪些文件：新增 `server/strategy-service.mjs`（事实底稿、提交、预览、确认、拒绝、版本、业务背景卡）；`server/db.mjs` 新增 `strategy_revisions`（触发器禁止修改、删除）、`strategy_submissions` 两张表；`server/agent-tools.mjs` 新增 `strategy_facts`、`strategy_submit`、`strategy_submission`，`server/routes/agent.mjs` 把凭据对应的 agent 传给工具；`server/routes/user.mjs` 新增 `/api/v3/strategy-v2*` 页面接口；`server/routes/workspace.mjs` 把服务交给智能体路由；`AGENTS.md` 新增「AI 接入」一节；`docs/API.md` 补工具与接口；新增 `tests/strategy-service.test.mjs`（11 项，覆盖反例 4、5、17、18、19、20、24 与 I-06、I-09、I-10、回退）；`docs/策略规则/README.md` 延期表补记 I-07、I-08、I-14 改到批 2（常浩确认「同意推到批 2」）。
- 测试：`npm test` 原样结果 `ℹ pass 800` / `ℹ fail 0`；`npm run check:style` 通过。
- code-review（规范 + 规格两个子 agent）后补改：确认写入改为事务内复核、编号、回读，不一致回滚；同键并发提交撞约束时返回原 submission；skill 不能新建或冒充 `origin=manual`（I-09）；手写内容依据变化时可由常浩 `keepStale` 明确保留（I-06）；正式版本的 `content.inputs` 一律用服务端记录，规则版本与 03 第 4 节对齐（含 baseline，去掉 bizcard）；背景卡条目按 id 定身份；07 第 3 节补「缺用户观察时痛点只能 typical」「续费 unknown 的 route 指向背景卡」；补回退接口；拒绝也要明确确认。
- 验证：临时数据目录 + 夹具时间线；智能体工具走真实 HTTP 路由与凭据；没有界面改动，没起正式服务。
- 截图：无。
- 发布与回读：未发布（页面在 #30 才接入，批 1 合起来再发布）。
- 与授权不一致之处、遗留问题、范围外发现：① 正式库现有时间线快照没有原格信息，发布后须先同步一次时间线，事实底稿才能生成（接口返回 `409 TIMELINE_RESYNC` 提示）。② 迁移放宽（04 第 6 节）这张票没接：提交接口一律按非迁移数据校验，迁移由 #29 的脚本直接写 revision。③ 确认后同月其余待确认提交统一转 stale（03 第 7 节写的是「常浩改过内容后旧 submission 转 stale」，这里按「出现新版本」处理）。④ 校验不过的提交不入库，只返回 422 和前 8 条原因；完整错误清单在页面预览接口里。⑤ 只读工具 `strategy_facts` 每次现算 Evidence 与覆盖率，没有缓存。⑥ 反例 17 原场景是「常浩在页面手改后旧提交过期」，页面编辑入口要到 #30 才有；现在用「出现新版本 / 输入变化即过期」覆盖同一条规则。⑦ AGENTS「AI 接入」的「数据对象」一项只写了类别，没有逐个模块列来源，留待熟悉这些模块时补。⑧ 新增的只读工具 `strategy_submission` 不在票面清单里，是为了 skill「结果不明时先查状态」（#24 用户故事 46）。
- 本轮新坑：无。

## 月度用户策略批 1·1b-1 月度文档 v2 校验器（2026-11-08，Claude，常浩说「按推荐开工」后按票推进；常浩说「CI 过后合并」，PR #34 squash 合并为 `4a19cb4`；未发布，批 1 合起来再发布）

- 时间：开工 `2026-11-08 14:20`（事后估计：1a 合并后开 worktree 的时刻，开工时没有用 `date` 记录；本节测试结果都在此之后跑出）。★ 来由：批 1 第三张票 #27，实现 schema 2.1 第 4 节月度文档的结构校验和不变量。
- 改了哪些文件：新增 `server/strategy-validate.mjs`（`validateStrategyDoc(doc, { evidence, migrated })`，返回逐条错误、提示和「依据已变化」的 Claim；内置来源登记表 sources-v1.1 与障碍体系 barrier-v2.1 的编码和适用人群）；新增 `tests/strategy-validate.test.mjs`（13 项，含内置来源表、障碍表与 01、02 文档的一致性测试）；`docs/策略规则/03-Schema-v2.md` 两处对齐：3.2 粒度改为每地区 0–4 个情境（与 I-13 一致），第 5 节注明 I-07、I-08、I-14 随 Opportunity、Strategy 在批 2 实现；`docs/策略规则/02-障碍体系v2.md` 补一句：`targetRelation=通用` 只能用新签、续费都适用的障碍。
- 测试：`npm test` 原样结果 `ℹ pass 789` / `ℹ fail 0`；`npm run check:style` 通过。
- code-review（规范 + 规格两个子 agent）：补了三处漏检（时间线 Evidence 的国家代码 I-12；没有 business / voice 证据的障碍按 02 §2.3 限为 unknown 或 inferred + weak；正式稿顶部正文的编码提示 I-15）；priority 为 null 时理由须含「待研判」；复用 `units`，改名 `BARRIER_RELATIONS`、`REGION_PRIORITY` 避免与页面同名常量混淆。
- 验证：纯函数，夹具文档逐条改坏验证拦截；没有界面改动，没起服务。
- 截图：无。
- 发布与回读：未发布（还没接入接口，批 1 合起来再发布）。
- 与授权不一致之处、遗留问题、范围外发现：① 票 #27 验收写的是「I-01–I-14、I-17、I-18 拦截」，实际 I-07、I-08、I-14 没实现：它们约束的是 Opportunity、Strategy，批 1 不生成这两类对象，校验器直接拒收非空的 `opportunities`、`strategies`；I-14 还依赖打法卡的结构化约束（README 延期事项已排在批 2）。已在 03 第 5 节写明，须常浩知悉。② 证据强度是否超过来源登记表的上限（如时间线原表最高 partial）目前不校验，01 没有把它列成不变量。③ 覆盖率（activity）只校验值与状态一致，不重新计算；1b-2 提交时由服务端用当前快照重算后比对。④ I-09（manual 不被自动改写）、I-10（revision 不可改）是写入层的约束，放 1b-2。⑤ 迁移放宽由调用方传 `migrated`，1b-2 必须由服务端判定（只对迁移生成的 revision 放宽），不信任提交方。⑥ `priority=null`：03 第 4 节允许「迁移数据或无法判断时」为 null，04 第 6 节把它列为迁移放宽，两处口径不同；校验器按 03（非迁移数据也可为 null，但理由须写「待研判」）。
- 本轮新坑：无。

## 月度用户策略批 1·1a 证据与窗口（2026-11-08，Claude，常浩说「按推荐开工」；常浩说「CI 过后合并」，PR #33 squash 合并为 `b7872f2`；未发布，批 1 合起来再发布）

- 时间：开工 `2026-11-08 13:05`（拆完票、开 worktree 的大致时间）。★ 来由：批 1 规格 #24 第一张票 #25，把时间线快照落成 schema 2.1 的 Evidence，并按 lifecycle-v0.2 算窗口与候选行动窗口覆盖率。
- 改了哪些文件：新增 `server/strategy-evidence.mjs`（时间线 → Evidence：国家与年份、eventType 归一化，语义身份与版本指纹，核验 / 裁定只改核验状态，同名学校落库前隔离，片段重排标 ambiguous，锚点含 period）；新增 `server/strategy-lifecycle.mjs`（Evidence → 需求 / 行动窗口，补考替代锚点，地区覆盖率含 dateQuality、coverage、byCountry）；`server/timeline.mjs` 只增不改：解析结果多一个 `cellIndex`（来源格 → 地区代码、地区表、列名与同名列序号、学校、原文），`guessRe` 导出；`server/routes/user.mjs` 的时间线读取与同步接口不下发 `cellIndex`；`server/timeline-verification.mjs`、`server/timeline-rulings.mjs` 只增：多段核验 / 裁定的事件带 `segment`（原格内位置），让片段身份不随日期改动漂移；新增 `tests/strategy-evidence.test.mjs`（15 项，覆盖反例 1、3、7、8a、8b、9、10、11、12、13、21、25、26）。
- 测试：`npm test` 原样结果 `ℹ pass 776` / `ℹ fail 0`；`npm run check:style` 通过。
- code-review（规范 + 规格两个子 agent）：规范无硬违规，去掉了未用导出、重复的校名拼接；规格指出两处错误已修并补测：① 碰撞改为按「年份 + 地区表 + 学校」整校隔离（原来按完整证据 ID 判，分段不同会漏检）；② 片段位置改用原格顺序（原来按日期排，核验后会漂移），一格只有一段时不用标签作身份；另修了 period 须列名表示选课期、补考替代锚点排除不可计算的出分日、表外国家代码进同步报告。
- 验证：纯函数，用夹具表格经现有解析器得到快照后测试；没有界面改动，没起服务。
- 截图：无。
- 发布与回读：未发布（本票没有接到任何页面或接口，发布与否无影响；批 1 合起来再发布）。
- 与授权不一致之处、遗留问题、范围外发现：① 正式库里现有的时间线快照没有 `cellIndex`，要发布后再同步一次时间线才能生成 Evidence；1b 的服务层遇到没有 `cellIndex` 的快照应明确提示「请先同步时间线」。② 覆盖率 `dateQuality` 计的是该地区全部可计算事件（不只目标月重叠的），05 第 6 节写的是「参与计算的事件」，按这个口径实现。③ 「其他」类事件的锚点：列名含「截止」记 deadline，否则 anchor_unknown（只作情境信息，不生成窗口）。④ 冲突未决的「宽泛风险区间」（05 第 5 节「需要时」）未做，目前只给不出窗口的原因，留给 1b 需要时再加。⑤ 补考替代锚点用「同校、28 天内最近的出分日」近似「同一学期」。
- 本轮新坑：无。

## 月度用户策略 Skill · 批 0 规格定标（2026-11-08，Claude，常浩说「开始批 0」；常浩说「合并」，PR #23 squash 合并为 `d57c1af`；纯文档，无需发布）

- 时间：开工 `2026-11-08 11:20`（收到「开始批 0」时的大致时间）。★ 来由：策略页要新建「月度用户策略」skill，方法论 V1.1 经 GPT 两轮复审后定稿为施工方案 V3；批 0 把 V3 第 4 节落成可直接编码的规则文件（issue #22）。
- 改了哪些文件：新增 `docs/策略规则/` 下 11 个文件（README 索引；00 决策记录；01 来源登记表 8 个来源；02 障碍体系 v2，16 个障碍 + 旧编号映射 + 7 个促销目标及候选卡，47 张卡均已核对在列；03 Schema v2，五类对象、状态与证据强度、15 条不变量、写入契约；04 旧数据迁移映射与五步迁移；05 需求生命周期 lifecycle-v0.1，含锚点判定、窗口生成条件、需求活跃度阈值、策略优先级默认矩阵；06 SCOUT-8 运行规范；07 业务背景卡；08 质量标准；09 反例测试集 20 例）；`docs/用户策略规范.md` 升级 v2，v1 归档到 `docs/history/用户策略规范-v1-2026-10-19.md`；本会话写的方案文档一并入库：`docs/策略页底层逻辑-供审核-2026-11-08.md`、`docs/月度用户策略Skill-共识意见与施工方案-2026-11-08.md`（V1）、`docs/月度用户策略Skill-施工方案V2-批0规格-2026-11-08.md`、`docs/月度用户策略Skill-施工方案V3定稿-2026-11-08.md`。
- 返修（2026-11-08，常浩说「开始」按 GPT 批 0 规格验收返修）：六项「必须改」全部处理——P1-01、P1-02 → `03-Schema-v2` 升 schema 2.1（国家与年份、eventType 归一化；一个事件一条 Evidence；身份碰撞；原格修改导致核验失效；`period` 锚点；活跃度改为候选行动窗口覆盖率；空地区；`barrierRole`；窗口粒度；I-07/08/12/13/14 改写，新增 I-16（批 2）/I-17/I-18；幂等冲突 409），`01` 升 sources-v1.1；P1-03 → `05` 升 lifecycle-v0.2；P1-04 → `02` 升 barrier-v2.1（M3/R1 口径、主障碍、6 对相近障碍判定表、购买行为证据要求）；P1-05 → `06` 升 scout-v1.1（原则 1 换成 GPT 原文）；P1-06 → `04` 升 migration-v1.1（「你写的」降为 inferred + weak，新 other 的 priority 为 null，master 进 legacy）；`09` 升 cases-v1.1（#5/#6/#7/#20 改写，#8 拆 8a/8b，新增 #21–#25）；README 版本号同步，新增「延期事项」一节。
- 定向验收补改（2026-11-08，常浩说「先送 GPT 定向验收」；GPT 回「需修改」，L1 预算已用完，按意见补改后收口，**补改未复审**）：P1-R01 同名学校碰撞改为落库前隔离到同步报告「身份冲突」清单，不生成 Evidence，去掉 `identityConflict` 字段（03、05、09 #25）；P1-R02 #1 拆成「精确窗口拦截 / 月度候选机会保留」两种预期；P1-R03 05 §5 写明选课 `period` 起止已核实时候选行动窗口仍为 inferred，新增 09 #26；P2-R01 `barrierRole` 改为有障碍时恰好一个 primary、没有障碍不强造、全部 unknown 时只是研究重点，写进 I-11（03、02、06）。版本号不再升（这些版本尚未合并使用），在各自变更记录里注明「定向验收补改」。
- 测试：`npm test` 原样结果 `ℹ pass 761` / `ℹ fail 0`（定向验收补改后重跑；第一次跑时 `tests/markdown-parser.test.mjs` 一项 2 秒子进程超时，单独重跑 4/4 通过，全量重跑通过；独立 worktree `.claude/worktrees/claude+22-strategy-batch0`，不含他人改动；本批只改文档）。
- 验证：文档自查（返修后重做一遍）：跨文件的章节引用、不变量编号（I-01–I-18）、来源 ID、障碍编码、各文件版本号与 `inputs.rules` 逐一核对；47 张打法卡用脚本核对都出现在促销目标候选表里。没有代码与界面改动。
- 截图：无。
- 发布与回读：未发布（纯文档，无需发布）。
- 与授权不一致之处、遗留问题、范围外发现：① 批 0 比 V3 定稿收紧了一处：原表日期（未核实、未标推测）生成的窗口记为 `inferred`，不是 `known`，因为原表来源的证据强度上限是 `partial`（05 第 5 节）；② 来源登记表比 V3 多列了官网核验、人工裁定两个独立来源，共 8 个；③ 需求活跃度阈值（40% / 15%）和策略优先级默认矩阵是新增的候选参数，批 1 用 12 个月数据回看校准；④ 代码注释仍引用「用户策略规范第 6、7 节」，指的是 v1，规范 v2 开头已写过渡说明，批 1 改代码时同步更新注释。
- 本轮新坑：无。

## Agent 页按钮按作用范围重排（方案 A）+「导入会话」默认粘 ChatGPT 链接（2026-11-07，Claude，常浩在三版样稿里选「做 A」；常浩说「合并并发布」，PR #21 squash 合并为 `b8deee5`，已发布 nm-20261107-231835-b8deee5 回读通过）

- 时间：开工 `2026-11-07 23:05`（收到「做 A」时的大致时间）。★ 来由：右上角四个按钮作用范围不同却叠在一起，主按钮给了最少用的「新建助手」，「导入 Codex 会话」和实际用法（绑 ChatGPT 会话）不符（issue #20；三版样稿 https://claude.ai/artifact/PwPGMq2Z8kbE2Aa5S1Pssn）。
- 改了哪些文件：`src/modules/assistants/AssistantsPage.jsx`（「导入会话」「新建助手」从页面右上角移到助手列表栏头，页面标题区不再放按钮；副标题改为「角色助手 · ChatGPT 会话经 Chrome 收发，本机 Codex 只读」；ChatGPT 助手头部改为「编辑角色」在左、「在 ChatGPT 打开」在右，Codex 助手只把「编辑」改名「编辑角色」；弹窗新增「导入会话」：填 ChatGPT 会话链接 + 助手名称，走现有新建接口带 `chatgptUrl`，先预览后确认、回读；原 Codex 导入改名「从本机 Codex 导入」，两种来源在弹窗底部互相切换；编辑弹窗标题改「编辑角色」）；`src/styles/85-kb-v3.css`（`.chat-list-head`：两个按钮平分一行，栏宽不够时各占一行）。接口、表结构未改。
- 测试：`npm test` 原样结果 `ℹ pass 761` / `ℹ fail 0`（独立 worktree `.claude/worktrees/claude+20-agent-buttons`，不含他人改动；改完 CSS 后重跑同样结果）；`npm run build` 通过；`npm run smoke` 原样结果 `24 项，0 项有问题`。
- 验证：隔离服务 5290 + 临时数据目录。1440 宽：列表栏头两个按钮一行，ChatGPT 助手头部「编辑角色 · 在 ChatGPT 打开 · 删除」（自建助手才有删除），Codex 助手头部「对话/知识库 · 默认模型 · 编辑角色」。1024 宽：列表栏只有 184px，两个按钮各占一行，不溢出（第一版带「助手 · N」计数时溢出，已去掉计数）。真实点击走完「导入会话」：填链接与名称 → 预览（不显示预设说明）→ 确认 → 弹窗关闭、列表多出该助手并选中；格式不对的链接被服务端拒绝；「从本机 Codex 导入」「改为粘贴 ChatGPT 会话链接」来回切换正常。对照正式 5280 改前页面逐项核对（L-01）：按钮仍是墨色 2px 框白底、图标不变、选中项仍是墨底，没加新颜色；唯一的强调变化是页面顶部不再有黑色主按钮（方案 A 本意）。
- 截图：`~/Library/Application Support/NiumaHome/evidence/smoke-20261107-1514/19-assistants.png`（冒烟截图，Codex 助手视角；不入库）。
- 发布与回读（`2026-11-07 23:18:35` 开始）：发布前只读核对——没有 `kb-write-lock`、`mentor-reply`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；CI `test` 通过。PR #21 用 `--match-head-commit 4a9c1c2…` squash 合并为 `b8deee5`，`main` 快进；`release-app.sh`（忽略他人未跟踪文件，`NIUMA_SMOKE=1`）切到 `nm-20261107-231835-b8deee5`，自动备份 `backups/work-desk-20261107-231845-before-nm-20261107-231835-b8deee5.db`。第一次冒烟 `24 项，1 项有问题`：`/mentor/path` 截图时还在读取、主区 10 字，脚本中止在「回读未通过」、未清理旧快照；正式页面实看该页 0.25 秒就读出完整内容，单独重跑 `NIUMA_SMOKE=1 bash scripts/verify-release.sh` 得 `24 项，0 项有问题` → `回读通过：nm-20261107-231835-b8deee5`（冒烟目录被重跑覆盖，第一次的 summary 没留）。正式实看（刷新后版本 `b8deee5`）：通知助手页列表栏头「导入会话 | 新建助手」不溢出，头部「编辑角色 · 在 ChatGPT 打开」，副标题已更新，页面右上角无按钮。回滚：`bash scripts/release-app.sh --use nm-20261104-180401-af80272`（无数据改动，不用还原数据库）。
- 与授权不一致之处、遗留问题、范围外发现：① 自建的 ChatGPT 助手头部最右是「删除」而不是「在 ChatGPT 打开」（删除照旧放最后）。② 范围外：新建 / 导入时服务端因链接格式不对返回 400，弹窗却提示「结果尚未确认，请重新读取助手列表核对」，要先点重新读取才能返回修改，提示不准确，未改。③ 发布前打开着的旧页面要刷新一次才会换成新版。④ 这次发布因第一次冒烟失败没跑旧快照清理，下次发布会照常清理。
- 本轮新坑：无

## 通知助手绑定 ChatGPT 会话；修复读历史时回复只剩「ChatGPT 说：」（2026-11-07，Claude，常浩看了保存预览后说「确认保存」；常浩说「合并并同步插件」，PR #19 squash 合并为 `44e8871`，正式插件目录已同步）

- 时间：开工 `2026-11-07 14:10`（收到「绑吧」时的大致时间）。★ 来由：#15 发布后给通知助手绑链接、在正式环境验证桥。
- 改了哪些文件：`browser-extension/niuma-collect/chatgpt.js`（隐藏标题按 innerText 去掉；读历史等每条回复都有正文，最多 10 秒）；`docs/LESSONS.md`（L-17 第 2 次）。正式数据：通知助手（id 4）`chatgpt_url` 写入 `https://chatgpt.com/c/6a4bb8a9-e690-83ea-bd02-939364b22823`。
- 测试：`npm test` 原样结果 `ℹ pass 761` / `ℹ fail 0`（独立 worktree `niuma-home-render-wait`；日志 `evidence/chatgpt-bridge-20261107/npm-test.log`）。
- 验证：正式页面编辑弹窗填链接 → 预览（名称、说明不变，437 字）→ 常浩「确认保存」→ `/api/assistants` 与数据库只读回读一致。正式插件重新加载后桥 `connected:true`；正式页面读回 10 条，但最后两条回复只显示「ChatGPT 说：」，接口再读一次就完整。用 Claude in Chrome 新开该会话复现：消息出现后约 0.2 秒内回复里只有隐藏标题，其 textContent 为「ChatGPT 说：ChatGPT」、innerText 为「ChatGPT 说：」；按新逻辑去掉后为空串，等待条件成立时五条回复长度 803 / 200 / 120 / 342 / 83，与接口读回一致。修复后的插件还没装进 Chrome 实测。
- 截图：`~/Library/Application Support/NiumaHome/evidence/chatgpt-bridge-20261107/正式-通知助手回复只显示隐藏标题.jpg`（不入库）。
- 发布与回读：无需发布服务（只改插件）。PR #19 squash 合并为 `44e8871`，`main` 快进；正式插件目录 `~/Library/Application Support/NiumaHome/extension/niuma-collect/` 已同步，与仓库逐文件一致，同步前备份在 `evidence/chatgpt-bridge-20261107/extension-before/`。常浩重新加载插件后核对：经正式桥连读两次通知助手历史，第一次走「刷新标签页 → 等正文」用时 10.7 秒、第二次 0.04 秒，都是 10 条、5 条回复长度 831 / 212 / 126 / 354 / 83，没有只剩「ChatGPT 说：」的；正式页面刷新后 5 个回复气泡同样完整（截图 `evidence/chatgpt-bridge-20261107/正式-修复后通知助手历史完整.jpg`）。回滚：用该备份覆盖回去再重新加载。
- 与授权不一致之处、遗留问题、范围外发现：会话较长时 ChatGPT 只渲染最近的若干轮，这次读回的是最近 10 条（L-17 正文已记「只读页面上已加载的消息」）。面试、绩效两个会话的链接还没拿到。
- 本轮新坑：L-17

## Agent 接入 ChatGPT 会话：Chrome 插件桥接（2026-11-04，Claude，常浩说「开工」，并已知悉条款风险与改版易坏；PR #16 squash 合并为 `af80272`；常浩说「合并并发布」，已发布 nm-20261104-180401-af80272 回读通过）

- 时间：开工 `2026-11-04 16:20`（收到「开工」时的大致时间；收尾 `2026-11-04 18:05`）。★ 来由：面试 / 绩效 / 通知助手对应 ChatGPT 聊天模式里的三个会话，常浩要在牛马之家里直接对话、背后就是 ChatGPT 那个窗口（issue #15）。文案助手仍走 Codex。
- 改了哪些文件：`server/chatgpt-bridge.mjs`（新：内存任务队列，插件长轮询取任务、逐段回传；不在线立即失败，15 秒没人取、取走后 60 秒无回传都以错误结束）；`server/routes/assistants.mjs`（绑了链接的助手发消息 / 读历史走桥，切换会话返回 400；新增 `/api/v3/chatgpt-bridge/status|next|jobs/:id`，插件接口沿用收藏配对码）；`server/db.mjs`（`assistants` 补列 `chatgpt_url`，保存带上）；`server/legacy-writes.mjs`（版本号只在绑了链接时带上它，没绑的不变）；`server/index.mjs`、`server/http.mjs`（插件来源放行到桥接口）；`browser-extension/niuma-collect/chatgpt.js`（新：在会话页里按粘贴填字、核对后点发送、MutationObserver 边出边读，拒绝有草稿 / 上一条未完 / 标签页不在该会话的情况）、`background.js`（长轮询 + 30 秒闹钟兜底，找或在后台新开会话标签页，回传按顺序、20 秒报平安）、`manifest.json`（0.2.0，加 `alarms` 与 `https://chatgpt.com/*`）；`src/modules/assistants/AssistantsPage.jsx`（编辑弹窗加「ChatGPT 会话链接」，先预览后确认；ChatGPT 助手显示 ChatGPT 标签、「在 ChatGPT 打开」、桥连接状态，隐藏模型 / 会话切换 / 知识库；支持整段替换）；`tests/chatgpt-bridge.test.mjs`（新 4 项）、`tests/assistants-migration.test.mjs`（多一列）；`docs/API.md`（「ChatGPT 桥」一节）、`docs/LESSONS.md`（L-17）。
- 测试：`npm test` 原样结果 `ℹ pass 761` / `ℹ fail 0`（独立 worktree `niuma-home-chatgpt`，不含他人改动）；`npm run build` 通过。
- 验证：隔离服务 5290 + 临时数据目录 `evidence/chatgpt-bridge-20261104/data`；常浩在 Chrome 里装了指向 5290 的测试副本插件（`evidence/chatgpt-bridge-20261104/ext-test`，预填测试配对码，不入库）。1280×800 看了 Agent 页：编辑弹窗填链接 → 预览 → 确认，列表与对话头显示「ChatGPT」；插件不在线时提示「ChatGPT 桥没连上…」。真实 ChatGPT：通知助手会话只读读回 10 条（标题、段落保留）；在常浩 ChatGPT 里新建测试聊天「测试会话」（`/c/6aeb00a9-…`），插件在后台新开该标签页（未切到前台），发「介绍番茄工作法，分 3 段」，回复逐段出现、489 字收齐，回读 4 条；修复后再发一条，回读 6 条、最后一条为「第二次收到」。测出两处问题已修：新开标签页第一次读历史为空（L-17）；回复还没出段落时首段带读屏隐藏标题「ChatGPT 说：」，已改为去掉（这一处修复未在 Chrome 里复测）。
- 截图：`~/Library/Application Support/NiumaHome/evidence/chatgpt-bridge-20261104/后台标签页发送-流式中.jpg`、`后台标签页发送-回复完成.jpg`（不入库）。
- 发布与回读（`2026-11-04 18:04:01` 开始，常浩说「合并并发布」）：发布前只读核对——没有 `kb-write-lock`、`mentor-reply`，`kb-operation` 12 条 verified、2 条 aborted，无挂起。PR #16 squash 合并为 `af80272`，`main` 快进；`release-app.sh`（忽略他人未跟踪文件，`NIUMA_SMOKE=1`）切到 `nm-20261104-180401-af80272`，自动备份 `backups/work-desk-20261104-180405-before-nm-20261104-180401-af80272.db`，保留策略清理 2 项（快照 `nm-20261028-224906-533cb89`、备份 `work-desk-20261027-201724-before-nm-20261027-201723-54309fe.db`）；冒烟 `24 项，0 项有问题` → `回读通过：nm-20261104-180401-af80272`。正式实看：正式库 `assistants` 已补 `chatgpt_url` 列，四个助手均为 null；`/api/v3/chatgpt-bridge/status` 返回 `connected:false`（正式插件还没重新加载）。正式插件目录 `~/Library/Application Support/NiumaHome/extension/niuma-collect/` 已同步为 0.2.0，与仓库逐文件一致，同步前备份在 `evidence/chatgpt-bridge-20261104/extension-before/`。回滚：`bash scripts/release-app.sh --use nm-20261104-144148-3431a52`（新列留着无害，数据库不用还原），插件用上面的备份覆盖回去再重新加载。
- 发布后待常浩做：在 `chrome://extensions` 给「牛马之家 · 收藏」点重新加载、移除「牛马之家 · 桥接测试（5290）」；之后在编辑弹窗给通知助手填链接（写正式数据，先预览后确认）；面试、绩效两个会话的链接还没拿到。
- 与授权不一致之处、遗留问题、范围外发现：① 条款：OpenAI 禁止程序化提取输出，常浩已知悉并接受。② 只能读页面上已加载的消息，很长的会话可能读不全。③ 插件刚重新加载后第一次用要 15 秒左右（旧页面里没有脚本，插件会刷新一次标签页）。④ 测试聊天「测试会话」留在常浩的 ChatGPT 里，可以删。⑤ 面试、绩效两个会话在网页版侧栏和搜索里都找不到，只在桌面 ChatGPT 里看到。
- 本轮新坑：L-17

## 删除登录页（2026-11-04，Claude，常浩说「删除登录页，不需要了」，并同意一起删正式数据目录的 `data/login.json`；PR #14 squash 合并为 `3431a52`；常浩说「合并并发布」，已发布 nm-20261104-144148-3431a52 回读通过）

- 时间：开工 `2026-11-04 14:30`（收到消息时的大致时间）。★ 来由：常浩不再需要进门的鲨鱼登录页（issue #13）。
- 改了哪些文件：整体撤掉 `d69f706` 的代码部分（交接记录保留）——删 `src/modules/login/LoginPage.jsx`、`src/styles/96-login.css`、`src/vendor/ascii-sharks/`、`server/routes/login.mjs`、`tests/login.test.mjs`；`src/main.jsx` 直接渲染 `App`；`server/index.mjs` 去掉登录路由；`src/styles/index.css` 去掉引入；`scripts/smoke-pages.mjs` 去掉登录一步；`docs/API.md`、`docs/STYLE-GUIDE.md` 去掉登录页两节。
- 测试：`npm test` 原样结果 `ℹ pass 757` / `ℹ fail 0`（独立 worktree `niuma-home-remove-login`，不含他人改动）；`npm run build` 通过；`npm run smoke` `24 项，0 项有问题`。
- 验证：冒烟用隔离服务和临时数据目录，第一张截图就是首页，没有登录页。
- 截图：`~/Library/Application Support/NiumaHome/evidence/smoke-20261104-0638/01-home.png`（不入库）。
- 发布与回读（`2026-11-04 14:41:48` 开始，常浩说「合并并发布」）：发布前只读核对——没有 `kb-write-lock`、`mentor-reply`，`kb-operation` 12 条 verified、2 条 aborted，无挂起。PR #14 squash 合并为 `3431a52`，`main` 快进；`release-app.sh`（忽略他人未跟踪文件，`NIUMA_SMOKE=1`）切到 `nm-20261104-144148-3431a52`，自动备份 `backups/work-desk-20261104-144149-before-nm-20261104-144148-3431a52.db`，保留策略清理 2 项（快照 `nm-20261028-122805-49b5d8d`、备份 `work-desk-20261027-161358-before-nm-20261027-161356-e3d22fe.db`）；冒烟 `24 项，0 项有问题` → `回读通过：nm-20261104-144148-3431a52`。正式实看：首页直接进工作台（冒烟截图 `evidence/smoke-nm-20261104-144148-3431a52/01-home.png`，状态栏版本 `3431a52`）；`/api/login` 返回 404；前端产物里没有登录页代码。之后把 `data/login.json` 移到废纸篓（常浩已同意）。回滚：`bash scripts/release-app.sh --use nm-20261102-224152-d69f706`（回滚后登录页没有 `login.json` 会直接放行）。
- 与授权不一致之处、遗留问题、范围外发现：范围外——正式首页「今日日程」「交付月环节」「待我处理」都报亚古兽 lark-cli 未登录或登录已过期，与本轮无关，未处理。
- 本轮新坑：无

## 新增 ASCII 鲨鱼登录页（2026-11-02，Claude，常浩看过多版预览后定稿「C3 白雾」+ 单行登录框 + 终端标题细光标，并定了三点：账号密码放数据目录不进仓库、每个新标签页过一次、标题用终端版；PR #12 squash 合并为 `d69f706`；常浩说「合并并发布」，已发布 nm-20261102-224152-d69f706 回读通过）

- 时间：开工 `2026-11-02 22:05`（开工时没跑 `date`，按本轮开始时刻估；收尾 `2026-11-02 22:38`）。来由：常浩要把预览里的鲨鱼登录页作为牛马之家的登录页，账号密码默认填好，回车或点箭头进入。
- 改了哪些文件：`src/vendor/ascii-sharks/`（新：第三方 MIT 源码原样复制，提交 `a0074c1`，附 LICENSE 与说明，Vite 直接编译，不加依赖）；`src/modules/login/LoginPage.jsx`（新：鲨鱼背景、终端标题、单行登录框；读 `/api/login` 预填，前端比对，通过后写 `sessionStorage`；光标用 `frames()` 按帧亮灭；焦点不在框里时按回车也能进）；`src/styles/96-login.css`（新：登录页整页样式，类名都带 `login-`）、`src/styles/index.css`（登记）；`src/main.jsx`（先显示登录页，进入后渲染原 `App`）；`server/routes/login.mjs`（新：`GET /api/login` 读数据目录 `login.json`）、`server/index.mjs`（登记路由）；`tests/login.test.mjs`（新）；`scripts/smoke-pages.mjs`（先过登录页再巡检，登录页单独记一项）；`docs/API.md`、`docs/STYLE-GUIDE.md`（登录页整页例外）。正式数据目录 `data/login.json` 已写入（权限 600，被 gitignore）。
- 测试：`npm test` 原样结果 `ℹ pass 759` / `ℹ fail 0`；`npm run build` 通过（体积超 500 kB 的提示是原有的）；`npm run smoke` `25 项，0 项有问题`（含新加的「登录页」一项）。
- 验证：隔离端口 5293、临时数据目录，`login.json` 用测试密码（不是真密码）；1280×800 下看了登录页：账号与密码已预填；改错密码回车提示「账号或密码不对」、改回后提示消失；回车进入工作台；同一标签页刷新、切到 `#/settings` 不再出现登录页。
- 截图：`~/Library/Application Support/NiumaHome/evidence/smoke-login-page/00-login.png` 等冒烟截图（不入库）。
- 发布与回读（`2026-11-02 22:41:52` 开始，常浩说「合并并发布」）：发布前只读核对——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起。PR #12 squash 合并为 `d69f706`，`main` 快进；`release-app.sh`（忽略他人未跟踪文件，`NIUMA_SMOKE=1`）切到 `nm-20261102-224152-d69f706`，自动备份 `backups/work-desk-20261102-224153-before-nm-20261102-224152-d69f706.db`，保留策略清理 2 项（快照 `nm-20261028-112538-ccc8d5f`、备份 `work-desk-20261027-133322-before-nm-20261027-133320-b89001a.db`）；冒烟 `25 项，0 项有问题`（「登录页」一项 ok、回车后进入）→ `回读通过：nm-20261102-224152-d69f706`。正式实看 `http://127.0.0.1:5280/`：新标签页出现登录页，账号 `nat`、密码已预填（来自 `data/login.json`），点箭头进入首页，状态栏版本 `d69f706`。回滚：`bash scripts/release-app.sh --use nm-20261102-201455-38ea63d`（登录页无数据库改动，不用还原）。
- 与授权不一致之处、遗留问题、范围外发现：① 服务只监听本机、密码又是预填的，登录页只是进门仪式，不是安全防护，已向常浩说明。② `/api/login` 会把密码明文返回给本机页面（预填所需）。③ 登录页刻意不走位图风变量，已在 STYLE-GUIDE 记为整页例外。
- 本轮新坑：无

## 收藏插件图标放大到工具栏标准尺寸（2026-11-02，Claude，常浩看了三版方案后说「牛马之家不改，还用原来的图标，但放大到符合 Chrome 插件图标的大小」；PR 待合并、无需发布）

- 时间：开工 `2026-11-02 21:20`。来由：原插件图标的黑底板在 128 图里只占 104px（四周各留 12px 透明），工具栏里比别的插件小一圈（issue #10）。
- 改了哪些文件：`browser-extension/niuma-collect/icons/icon.svg`（新：把原 PNG 按 18×18 像素格还原，图案、颜色、圆角比例不变，底板放大到 120px、四周留 4px，和 ChatGPT 回答收藏器同尺寸）；`scripts/make-extension-icons.mjs`（新：本机 Chrome 无头截图出 512 透明底图，sips 缩成 16/32/48/128，不加依赖）；`browser-extension/niuma-collect/icons/icon-16/32/48/128.png`（由脚本重新生成）。`manifest.json` 原本就引用这四个文件，没改。
- 测试：`npm test` 原样结果 `ℹ pass 757` / `ℹ fail 0`（独立 worktree `work-desk-ext-icon`，不含他人改动）。用 Playwright Chromium 加载插件：manifest 有效，`icons` 与 `action.default_icon` 四个尺寸都返回 200。
- 验证：新 PNG 透明边 128→4px、48/32→1px、16→0px；前后对比图看了浅色、深色工具栏。
- 截图：`~/Library/Application Support/NiumaHome/evidence/插件图标放大-20261102/after.png`（不入库）。
- 发布与回读：无需发布（插件不在 5280 服务里）。已安装的插件在 `~/Library/Application Support/NiumaHome/extension/niuma-collect/`，合并后需把 `icons/` 同步过去，再到 `chrome://extensions` 点重新加载，这一步等常浩同意，未做。
- 与授权不一致之处、遗留问题、范围外发现：无。
- 本轮新坑：无。

## 飞书默认身份改为亚古兽，猛鬼兽保留自言自语与推送（2026-11-02，Claude，常浩确认清单后说「按推荐开工」；常浩说「合并并发布」「确认写入」；PR #9 合并为 `38ea63d`，已发布 `nm-20261102-201455-38ea63d` 回读与冒烟通过，正式库迁移已写入）

- 时间：开工 `2026-11-02 19:20`。来由：亚古兽是牛马之家配套的企业分身，常浩定两个应用都接入，默认亚古兽，猛鬼兽也要能读；每次调用记下用的身份（issue #8）。
- 改了哪些文件：`server/lark-identity.mjs`（两个身份 `AGUMON` / `MENGGUI` + 唯一调用入口 `larkRun`，每次调用追加一行到 `<数据目录>/logs/lark-calls.jsonl`，只记应用、身份、命令、成败、耗时）；`calendar` `timeline` `timeline-years` `campaigns` `reports` `projects`（`runLark`，带教、营收、业务图表、品牌、知识库收藏都经它）`knowledge-tree` `feishu-export` `brief-sync` `v3-settings` 切亚古兽，报错里的「猛鬼兽」同步改；`selftalk` `codex-push` 显式留猛鬼兽；`mentor.mjs`、`ai-draft.mjs`、`ProjectsPage.jsx`、`SettingsPage.jsx`、`bitmap.jsx` 带教与设置页文字「猛鬼兽」→「亚古兽」（只改字，推送相关文字不动）；`scripts/migrate-lark-identity.mjs` 改为猛鬼兽 → 亚古兽；测试 11 个文件换 profile，新增 `tests/lark-identity.test.mjs`（调用记录 + 各模块身份分配）；`AGENTS.md` `HANDOFF.md` `REQUIREMENTS.md` `docs/API.md` `docs/LESSONS.md`（L-15 记第 2 次）。
- 测试：`npm test` 原样结果 `ℹ pass 757` / `ℹ fail 0`（独立 worktree `work-desk-agumon`，不含他人改动）；`npm run check:style` 通过。
- 验证：正式库用 `sqlite3 -readonly … VACUUM INTO` 复制到临时目录演练迁移：预览「待迁移 1 条（brief-feishu-link/2026-10，actor `ou_5ad2…` → `ou_6fac…`），跳过 0 条」→ `--confirm`「已写入 1 条，回读一致」→ 再预览「待迁移 0 条」；演练备份改名为 `evidence/lark-agumon-副本演练-2026-11-02T11-24-00-567Z/`。全新临时数据目录在 5290 起服务：`/api/v3/settings` 的 `lark_profile` / `lark_app_id` 为 `cli_a965c429ef785bd3`；`/api/calendar/today` 返回「请使用亚古兽配置完成用户登录」，`lark-calls.jsonl` 记下 `亚古兽 / user / calendar +agenda / ok:false`。常浩重配亚古兽 Secret 并完成 user 登录后（`20:10` 授权，bot 回读应用名「亚古兽-Hermes」），正式库再复制一份、推送开关置 0、跑完迁移，在 5290 起服务做真实只读探测：日历、日报、时间线、促销、项目、带教、营收、业务图表、品牌、知识库树、自言自语、10 月简报共 12 个 GET 全部 200；调用记录 14 类命令全部 `ok:true`，其中 13 类为「亚古兽 / user」，自言自语为「猛鬼兽 / user」（`im +chat-messages-list`、`whoami`）。`POST /api/v3/briefs/2026-10/export-preview` 通过身份核对（迁移后的 actor 与亚古兽 whoami 一致），飞书侧只有带 `--dry-run` 的预演，没有确认。两份管培生日志用亚古兽 user 与 bot 都能读评论（bot 已有文档权限）；以 bot 发评论未实测（会写真实文档）。探测备份改名为 `evidence/lark-agumon-探测副本-2026-11-02T12-11-11-390Z/`。没碰 `data/`。
- 截图：无（只改文字，没截图）。
- 发布与回读（`2026-11-02 20:14:55` 开始）：发布前只读核对——没有 `kb-write-lock`、`mentor-reply`，`kb-operation` 12 条 verified、2 条 aborted，`feishu-export` 10 条均 success，无挂起。PR #9 squash 合并为 `38ea63d`，`main` 快进；`release-app.sh`（忽略他人未跟踪文件，`NIUMA_SMOKE=1`）切到 `nm-20261102-201455-38ea63d`，自动备份 `backups/work-desk-20261102-201456-before-nm-20261102-201455-38ea63d.db`，保留策略清理 2 项（快照 `nm-20261028-112309-ad64b2c`、备份 `work-desk-20261027-105608-before-nm-20261027-105607-14d5642.db`）；冒烟 `24 项，0 项有问题` → `回读通过：nm-20261102-201455-38ea63d`。正式实看：`/api/v3/settings` 身份为 `cli_a965c429ef785bd3`，`/api/calendar/today`、`/api/v3/mentor` 200，`data/logs/lark-calls.jsonl` 记为「亚古兽 / user」且 `ok:true`。迁移（常浩「确认写入」）：预览待迁 1 条 → `--confirm` 备份到 `evidence/lark-agumon-2026-11-02T12-17-44-398Z/work-desk.db`，「已写入 1 条，回读一致」→ 再预览 0 条。正式环境未再点简报同步（会产生预览记录），身份核对沿用副本探测结果。回滚：`bash scripts/release-app.sh --use nm-20261102-174752-ee743c9`，再用上面的迁移备份还原那一条绑定。
- 与授权不一致之处、遗留问题、范围外发现：隔离服务用后台 node 进程起（主目录预览配置是另一个仓库的受跟踪文件，没改）。`scripts/import-feishu.mjs` 是已执行过的一次性脚本，没带 `--profile`，未改。调用记录文件不做轮转，量大时再定。
- 本轮新坑：无。

## 智能体接入第一期：workdesk MCP（只读 4 个工具）（2026-11-02，Claude，常浩说「按推荐开工」；PR #7 合并为 `ee743c9`，已发布 `nm-20261102-174752-ee743c9` 回读与冒烟通过）

- 时间：开工 `2026-11-02 17:35`。来由：亚古兽（企业数字分身）要读牛马之家的带教、项目、策略数据，常浩要求做成多个 agent 共用的通用接口，技术上限定渠道和身份，不能只靠提示词。
- 改了哪些文件：`server/db.mjs`（新表 `agent_access`、`agent_calls`）、`server/agent-access.mjs`（新：凭据签发 / 校验 / 撤销、调用记录）、`server/agent-tools.mjs`（新：4 个只读工具，复用现有服务出精简视图）、`server/routes/agent.mjs`（新：`/api/v3/agent/tools*`，凭据 → 按工具授权 → 提问人必填 → 记录）、`server/routes/workspace.mjs`（登记路由）、`server/mcp-workdesk.mjs`（新：stdio MCP，只做协议转换）、`scripts/agent-token.mjs`（新：签发 / 撤销 / 列出，可直接写进 .env 不上屏）、`tests/agent-mcp.test.mjs`（新 6 项）、`docs/API.md`（「智能体接入」一节）。
- 测试：`npm test` 原样结果 `ℹ tests 755` / `ℹ pass 755` / `ℹ fail 0`（独立 worktree `work-desk-mcp`，不含他人改动）。
- 验证：正式库用 `sqlite3 .backup` 复制到临时目录，隔离 5290 起服务；`agent-token.mjs issue agumon … --write-env` 写入临时 .env（权限 600）；真实 MCP 子进程握手 → 列出 4 个工具 → 逐个调用全部成功（`mentor_trainees` 4894 字、`mentor_questions` 845 字、`project_list` 8959 字、`strategy_month` 9445 字），`agent_calls` 4 条都带提问人。没碰 `data/`。
- 截图：无（无界面改动）。
- 发布与回读（`2026-11-02 17:47:52` 开始，常浩说「合并并发布」）：发布前只读核对——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起。PR #7 squash 合并为 `ee743c9`，`main` 快进；`release-app.sh`（忽略他人未跟踪文件，`NIUMA_SMOKE=1`）切到 `nm-20261102-174752-ee743c9`，自动备份 `backups/work-desk-20261102-174753-before-nm-20261102-174752-ee743c9.db`，保留策略清理 2 项（快照 `nm-20261028-111515-0d4cef9`、备份 `work-desk-20261026-233412-before-nm-20261026-233411-8570c55.db`）；冒烟 `24 项，0 项有问题` → `回读通过：nm-20261102-174752-ee743c9`（进程 55333）。正式实看：`GET /api/v3/agent/tools` 与 `POST /api/v3/agent/tools/project_list` 不带凭据均 `401 AGENT_UNAUTHORIZED`；`/api/v3/mentor` 200；正式库已有 `agent_access`、`agent_calls` 两表，均 0 行（凭据第 2 批再签发）。回滚：`bash scripts/release-app.sh --use nm-20261028-224906-533cb89`（新表留着无害，数据库不用还原）。
- 遗留：第 2 批在 Hermes 一侧（亚古兽接入 MCP、按「飞书私聊 + 常浩本人」拦截的插件、HERMES.md §0 改状态），记在 digital-twin。注意：`/api/v3/*` 原有读接口对本机进程不设凭据，本接口的凭据只约束走 MCP 的智能体；亚古兽没有终端和本机文件工具，绕不过去。数据观察（非本轮问题）：两位管培生两条线的第一阶段（P1、T1）都显示「进行中」、超期 118 天，没有评审记录；胡贵兰后面的 P6、T5、T6 已有完成记录，所以多半是第一阶段漏录，不是进度真的停住。
- 本轮新坑：无。

## 首页改为 no-store，防 Safari 网页应用打开黑屏（2026-10-28，Claude，用户在数码世界同类修复后说「一并改」；已提交 `533cb89`，已发布 `nm-20261028-224906-533cb89` 回读与冒烟通过）

- 时间：开工 `2026-10-28 22:50`。★ 来由：数码世界每次打开黑屏，查明是 Safari 网页应用用磁盘里的旧首页；牛马之家也是网页应用，首页原来不写任何缓存头，同样有风险。
- 改了哪些文件：`server/index.mjs`（`serveStatic` 返回 `index.html`——含前端路由回落——时加 `cache-control: no-store`，其余构建文件不变）、`tests/static-cache.test.mjs`（新增：临时 dist + 临时数据目录起真实服务，查 `/`、`/marketing` 为 no-store、构建文件不是 no-store；先确认改前失败）、`docs/LESSONS.md`（L-16）。
- 测试：`npm test` 原样结果 `ℹ tests 749` / `ℹ pass 749` / `ℹ fail 0`。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。
- 验证：新测试在隔离端口和临时数据目录里起服务，没碰 `data/`。真实网页应用里的效果未验证：修好后第一次打开可能还会黑一次（磁盘里还有改前的旧首页），之后再发布打开不黑才算验证。
- 截图：无（无界面改动）。
- 发布与回读（`2026-10-28 22:49:06` 开始）：发布前只读核对——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起。`main` 无新提交，快进到 `533cb89`；`release-app.sh`（忽略他人未跟踪文件，`NIUMA_SMOKE=1`）退出码 0，切到 `nm-20261028-224906-533cb89`，自动备份 `backups/work-desk-20261028-224907-before-nm-20261028-224906-533cb89.db`，保留策略清理 2 项（快照 `nm-20261027-201723-54309fe`、备份 `work-desk-20261026-190751-before-nm-20261026-190749-d2a1ba8.db`）。回读 7 项全 ✓（进程 67241）；冒烟 `24 项，0 项有问题` → `回读通过：nm-20261028-224906-533cb89`。正式实看：`/` 与 `/marketing` 返回 `cache-control: no-store`，构建 JS 200 且不带缓存头（与改前一致）。证据目录 `~/Library/Application Support/NiumaHome/evidence/首页no-store-20261028/`、冒烟截图 `evidence/smoke-nm-20261028-224906-533cb89/`。回滚：`bash scripts/release-app.sh --use nm-20261028-122805-49b5d8d`（数据库不用还原）。
- 遗留：无。范围外：数码世界同样改了，记在它自己的 CURRENT.md（`wb-20261028-671`）。
- 本轮新坑：L-16。

## 侧栏品牌标重新设计：40px、圆角、只留牛和文件夹（2026-10-28，Claude 子会话，用户截图说「看不清，太小了，而且太方正。这里可以重新设计下么」，看样稿后说「定稿并发布」；已提交 `49b5d8d`，已发布 `nm-20261028-122805-49b5d8d` 回读与冒烟通过）

- 时间：开工 `2026-10-28 11:28`（收到消息时的大致时间）。来由：上一轮侧栏品牌标是整张应用图标缩到 28px 的方块，黑边和外圈描边占地方，主体看不清。
- 改了哪些文件：`scripts/make-icons.mjs`（`brand-mark.png` 改为从满版 `AppIcon-1024.png` 中间裁 800 方块——去掉黑边和外圈描边，只留牛和文件夹——再缩到 160，按 40px 的 4 倍出图）、`public/icons/brand-mark.png`（重新生成）、`src/styles.css`（`.brand-mark` 28px → 40px，加 `border-radius: 10px`，与应用图标圆角比例一致；面板直角的规矩不变，这是图标）、`src/ui/bitmap.jsx`（`BrandMark` 默认 `size` 28 → 40）。
- 测试：`npm test` 原样结果 `ℹ tests 748` / `ℹ pass 748` / `ℹ fail 0`；`npm run build` 通过。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。
- 验证：隔离 5290 首页，`.brand-mark` 40×40、圆角 10px、原图 160 像素已加载，品牌区高 58px；页面放大 2 倍截图给用户看后定稿。窄屏收起侧栏发布后在正式环境实看过，见下行。颜色核对（L-01）：没加新颜色，图片本身颜色不变。
- 截图：`docs/handoff/品牌标重设计-20261028/样稿-隔离5290-放大2倍.png`（不入库）。
- 发布与回读（`2026-10-28 12:27:58` 开始）：发布前只读核对——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261028-112538-ccc8d5f` 回读通过。`main` 无新提交，快进到 `49b5d8d`；`release-app.sh`（忽略他人未跟踪文件）退出码 0，切到 `nm-20261028-122805-49b5d8d`，自动备份 `backups/work-desk-20261028-122806-before-nm-20261028-122805-49b5d8d.db`，保留策略清理 2 项（快照 `nm-20261027-161356-e3d22fe`、备份 `work-desk-20261026-175805-before-nm-20261026-175804-2a86e20.db`）。回读 7 项全 ✓（进程 71042）；`NIUMA_SMOKE=1` → `24 项，0 项有问题` → `回读通过：nm-20261028-122805-49b5d8d`。正式实看：`icons/brand-mark.png` 与仓库 sha256 一致；首页 `.brand-mark` 40×40、圆角 10px、原图 160 像素，放大 2 倍截图与样稿一致；820 宽窄屏侧栏 60px，品牌标 x=9、宽 40，不溢出（证据目录 `~/Library/Application Support/NiumaHome/evidence/品牌标重设计-20261028/`）。回滚：`bash scripts/release-app.sh --use nm-20261028-112538-ccc8d5f`（数据库不用还原）。
- 遗留：无。
- 本轮新坑：无。

## 浏览器标签页图标也换成新图（2026-10-28，Claude 子会话，用户说「也换掉」；已提交 `ccc8d5f`，已发布 `nm-20261028-112538-ccc8d5f` 回读与冒烟通过）

- 时间：开工 `2026-10-28 11:27`（收到消息时的大致时间）。来由：上一轮只剩标签页图标还是 16×16「低电量牛」。
- 改了哪些文件：`scripts/make-icons.mjs`（再用 `sips` 从满版 `AppIcon-1024.png` 生成 `public/icons/favicon.png` 64×64）、`public/icons/favicon.png`（新增）、`index.html`（`<link rel="icon">` 改引用 `/icons/favicon.png`）、`public/favicon.svg`（删除，已无引用）、`src/ui/bitmap.jsx`（只改注释）。
- 测试：`npm test` 原样结果 `ℹ tests 748` / `ℹ pass 748` / `ℹ fail 0`；`npm run build` 通过，产物里没有旧 `favicon.svg`。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。
- 验证：隔离 5290 首页，`link[rel=icon]` 指向 `/icons/favicon.png`，取回 200、`image/png`、64×64；`/favicon.svg` 不再返回图片。
- 截图：无。
- 发布与回读（`2026-10-28 11:25:36` 开始）：发布前只读核对——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261028-112309-ad64b2c` 回读通过。`main` 无新提交，快进到 `ccc8d5f`；`release-app.sh`（忽略他人未跟踪文件）退出码 0，切到 `nm-20261028-112538-ccc8d5f`，自动备份 `backups/work-desk-20261028-112539-before-nm-20261028-112538-ccc8d5f.db`，保留策略清理 2 项（快照 `nm-20261027-133320-b89001a`、备份 `work-desk-20261026-172515-before-nm-20261026-172514-efee62c.db`）。回读 7 项全 ✓（进程 71451）；`NIUMA_SMOKE=1` → `24 项，0 项有问题` → `回读通过：nm-20261028-112538-ccc8d5f`。正式首页 `<link rel="icon">` 指向 `/icons/favicon.png`，与仓库 sha256 一致（证据目录 `~/Library/Application Support/NiumaHome/evidence/标签页图标-20261028/`）。回滚：`bash scripts/release-app.sh --use nm-20261028-112309-ad64b2c`。
- 遗留：用户随后说侧栏品牌标「看不清，太小了，而且太方正」，要求重新设计，另起一轮。
- 本轮新坑：无。

## 应用图标修正：程序坞仍显示旧图、去掉系统灰底板、侧栏品牌标换新（2026-10-28，Claude 子会话，用户截图程序坞和侧栏说「现在还是旧版啊」；沿用上一轮「合并并发布」的授权一并发布；已提交 `ad64b2c`，已发布 `nm-20261028-112309-ad64b2c` 回读与冒烟通过）

- 时间：开工 `2026-10-28 11:20`（收到消息时的大致时间）。来由：程序坞和侧栏品牌标都还是旧图。
- 原因：① 程序坞：用户 11:19 已重开应用，装好的 `AppIcon.icns` 也是新图，是系统图标缓存没刷新；`lsregister -f` 重新登记并重启程序坞后，`NSWorkspace iconForFile` 拿到新图，但被系统缩小并套上灰色底板——macOS 26 起，四周透明、带阴影的图标不算标准形状。② 侧栏：`BrandMark` 是手画的 16×16「低电量牛」SVG，不由应用图标生成，上一轮没动。
- 改了哪些文件：`scripts/make-icons.mjs`（`AppIcon-1024.png` 改为经 `osascript` 调 AppKit 裁出原图圆角底板 `PLATE`，透明处铺底板同色黑，画满 1024 方图，圆角交给系统切；另用 `sips` 生成侧栏用的 `public/icons/brand-mark.png` 112×112）、`desktop/macos/AppIcon-1024.png`（重新生成）、`public/icons/brand-mark.png`（新增）、`src/ui/bitmap.jsx`（`BrandMark` 改为显示 `brand-mark.png`，删掉用不到的 `BRAND_WHITE` / `BRAND_ORANGE`；方角与原品牌标一致，固定黑底，不随深色模式反色）。`favicon.svg`（标签页图标）没动。
- 测试：`npm test` 原样结果 `ℹ tests 748` / `ℹ pass 748` / `ℹ fail 0`；`npm run build` 通过。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。
- 验证：`bash scripts/build-mac-app.sh` 重装后 `lsregister -f` + `killall Dock`，`NSWorkspace iconForFile` 取到的是满版新图、无灰底板（`改前-系统图标带灰底板.png`、`改后-系统图标满版.png`）；没截程序坞本身。隔离 5290 首页：`.brand-mark` 是 `IMG`、28×28、原图 112 像素已加载，侧栏显示新图（`改后-隔离5290-侧栏.jpg`）。证据目录 `~/Library/Application Support/NiumaHome/evidence/应用图标修正-20261028/`。
- 截图：见上面证据目录。
- 发布与回读（`2026-10-28 11:23:07` 开始）：发布前只读核对——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261028-111515-0d4cef9` 回读通过。`main` 无新提交，从 `a6f8736` 快进到 `ad64b2c`；`GIT_CONFIG_*` 忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261028-112309-ad64b2c`，自动备份 `backups/work-desk-20261028-112310-before-nm-20261028-112309-ad64b2c.db`，保留策略清理 2 项（快照 `nm-20261027-105607-14d5642`、备份 `work-desk-20261024-113329-before-nm-20261024-113328-b915042.db`）。回读 7 项全 ✓（进程 68609、12 个构建文件一致）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → `24 项，0 项有问题` → `回读通过：nm-20261028-112309-ad64b2c`。正式实看：`icons/brand-mark.png`、`icon-512.png` 与仓库 sha256 一致；内置浏览器打开正式首页，页脚 `ad64b2c`，`.brand-mark` 是 `IMG`、28×28、原图 112 像素已加载（`发布后-图标核对.log`）。回滚：`bash scripts/release-app.sh --use nm-20261028-111515-0d4cef9`（数据库不用还原）。macOS 应用壳已本机重装，不随 5280 发布。
- 遗留：① 标签页图标仍是「低电量牛」，与新图标不一致，待用户定。② `PLATE` 是按这张 512 原图量的坐标，换原图要重量。
- 本轮新坑：无。

## 应用图标换成「牛趴文件夹」（2026-10-28，Claude 子会话，用户上传新图说「把牛马之家的应用图标改成最新，如上传所示」，之后说「合并并发布」；已提交 `13cdcf4`、合并 `0d4cef9`，macOS 应用已重装，已发布 `nm-20261028-111515-0d4cef9` 回读与冒烟通过）

- 时间：开工 `2026-10-28 11:05`（收到消息时的大致时间，没单独记）。来由：用户给了新的应用图标原图（512×512 PNG，圆角黑底板外透明、带橙色描边和阴影）。
- 改了哪些文件：`desktop/macos/AppIcon-source.png`（新增，用户原图原样保存）；`scripts/make-icons.mjs`（原来由 16×16 的 `favicon.svg` 按像素放大，改成用 `sips` 从原图生成：`public/icons/icon-192.png`、`icon-512.png`、`apple-touch-icon.png` 直接缩放；`desktop/macos/AppIcon-1024.png` 缩到 988 再四周补透明到 1024，圆角底板约 824 宽，与原来的程序坞图标尺寸一致）；上面四个 PNG 重新生成。浏览器标签页图标 `public/favicon.svg` 和侧栏品牌标「低电量牛」没动。
- 测试：`npm test` 原样结果 `ℹ tests 748` / `ℹ pass 748` / `ℹ fail 0`。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。
- 验证：`bash scripts/build-mac-app.sh` 重装 `~/Applications/牛马之家.app`，`codesign -v` 通过；把装好的 `AppIcon.icns` 拆开有 16–1024 全部 10 个尺寸，转 PNG 看是新图。原图只有 512，1024 那档是放大的，略软。应用当时开着（进程 40217），正在运行的程序坞图标要退出重开才换，没替用户重开。
- 截图：无（图标见 `desktop/macos/AppIcon-1024.png`）。
- 发布与回读（`2026-10-28 11:14:52` 开始）：发布前只读核对正式库——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261027-201723-54309fe` 先跑 `verify-release.sh` 回读通过（`发布前-核对.log`、`发布前-verify.log`）。`main` 上多出别的会话已发布的两个提交（`54309fe` 飞书身份迁猛鬼兽、`512db26` 其记录），先合进 `ui-v4`（`0d4cef9`，只有 `CURRENT.md` 顶部两节冲突，两节都保留；合并后 `npm test` 748 全过），主工作区 `main` 从 `512db26` 快进到 `0d4cef9`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261028-111515-0d4cef9`，自动备份 `backups/work-desk-20261028-111516-before-nm-20261028-111515-0d4cef9.db`，保留策略清理 2 项（快照 `nm-20261026-233411-8570c55`、备份 `work-desk-20261024-103422-before-nm-20261024-103421-c261bd6.db`）。脚本末尾回读 7 项全 ✓（进程 65003、156 个源码文件与 `0d4cef9` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261028-111515-0d4cef9`。正式实看：`curl` 取 `icons/icon-192.png`、`icon-512.png`、`apple-touch-icon.png` 与仓库新图 sha256 一致，`favicon.svg` 未变；内置浏览器打开 `/icons/icon-512.png` 是新图（`发布后-图标核对.log`、`发布后-正式icon-512.jpg`）。证据目录 `~/Library/Application Support/NiumaHome/evidence/应用图标发布-20261028/`。回滚：`bash scripts/release-app.sh --use nm-20261027-201723-54309fe`（数据库不用还原；只退掉网页图标）。macOS 应用壳不随 5280 发布，已本机重装。
- 遗留：① 标签页图标 `favicon.svg` 仍是 16×16「低电量牛」，与新应用图标不是同一张图，要不要也换待用户定。② 如有 1024 以上的原图，替换 `desktop/macos/AppIcon-source.png` 后跑 `node scripts/make-icons.mjs` 和 `bash scripts/build-mac-app.sh` 即可更清楚。
- 本轮新坑：无。

## 服务端飞书身份从机械邪龙兽迁到猛鬼兽（2026-10-27，Claude，用户同意迁移方案与 4 条决定：猛鬼兽机器人发推送、带教机器人评论署名猛鬼兽、历史记录不改写、codex 登录保留；PR #6 已 squash 合并 `54309fe`，已发布 nm-20261027-201723-54309fe 回读通过）

- 时间：开工 `2026-10-27 19:52`（迁移开始时按会话时间估记）。★ 来由：常浩定「飞书统一都用猛鬼兽」，服务端 11 个模块仍写死 `--profile codex` 与机械邪龙兽下的本人 open_id（issue #5）。
- 改了哪些文件：新建 `server/lark-identity.mjs`（profile / App ID / 本人 open_id 唯一出处）；`server/projects.mjs`（runLark，品牌、经营图表、带教、知识库收藏都经它）、`calendar`、`campaigns`、`reports`、`timeline`、`timeline-years`、`feishu-export`、`brief-sync`、`knowledge-tree`、`selftalk`、`codex-push`、`v3-settings` 改为引用常量，错误提示改「猛鬼兽配置」；`server/mentor.mjs` 带教回答人设、`db.mjs` / `index.mjs` / `ai-draft.mjs` 注释改猛鬼兽；前端 `SettingsPage.jsx`（飞书身份显示猛鬼兽、推送文案）、`ProjectsPage.jsx`（带教回答署名）、`CodexStrip.jsx`、`bitmap.jsx` 注释；14 个测试文件的身份断言；新增 `scripts/migrate-lark-identity.mjs` 与 `npm run migrate:lark-identity`；文档 AGENTS / HANDOFF / REQUIREMENTS / docs/API.md / LESSONS L-15。
- 测试：`npm test` 原样结果 `ℹ tests 748` / `ℹ pass 748` / `ℹ fail 0`（变基到含 8 个新提交的 main 后复跑；变基前 739 / 739 / 0，与改前基线一致）；`npm run check:style` 通过、`npm run build` 通过；`npm run smoke` 24 项 0 项有问题（证据 `~/Library/Application Support/NiumaHome/evidence/smoke-20261027-1205/`）。★
- 验证：猛鬼兽 `whoami` 为 user、tokenStatus ready、本人 open_id `ou_5ad2ac4359de95dc41b5e89edd68ae6a`；用猛鬼兽只读探测日历 agenda、日报文档 fetch、品牌多维表 table-list、项目多维表 record-list、知识库 node-get、自言自语 chat-messages-list、文档评论 list-comments 全部成功；两应用读到的自言自语是同一会话（`oc_57f3…`）同样的消息；写入所需权限（wiki 建节点、文档导入、上传、评论）猛鬼兽均有。迁移脚本在正式库副本上演练：预览 1 条（`brief-feishu-link/2026-10`，旧来源指纹 `82aa9f7f` 与库内一致）→ 备份 → 写入 → 回读一致，再跑显示 0 条待迁移。
- 截图：`docs/handoff/飞书身份迁猛鬼兽-20261027/正式5280-设置页-飞书身份.jpg`（不入库）：设置页飞书身份显示「猛鬼兽 · cli_a96f5f9ac63adcd4」、推送行写猛鬼兽机器人。
- 发布与回读：合并前推送了主工作区本地 main 的 8 个他人提交（常浩回「推」），PR 分支变基后复跑 `npm test` 748 / 748 / 0、样式与构建通过。正式库 `npm run migrate:lark-identity` 预览 1 条经常浩确认后 `--confirm`：备份 `~/Library/Application Support/NiumaHome/evidence/lark-menggui-2026-10-27T12-16-39-059Z/work-desk.db`，写入 1 条回读一致，复跑 0 条待迁移。主工作区有他人未跟踪文件，按 OPERATIONS 用 `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=status.showUntrackedFiles GIT_CONFIG_VALUE_0=no bash scripts/release-app.sh` 发布，快照 nm-20261027-201723-54309fe，回读 7 项全过。正式只读实看：`/api/v3/settings` 身份为猛鬼兽；`/api/v3/codex-push` 发送者为猛鬼兽机器人（推送开关当前为关）；`/api/calendar/today` 现读 2 条日程；自言自语 20:17 用新 open_id `ou_5ad2…` 拉取成功（来源状态已更新）；日报、项目、带教接口 200。回滚：`bash scripts/release-app.sh --use nm-20261027-161356-e3d22fe`+ 用上面的备份还原数据库。测试推送卡片未发：推送开关是关的，开启时再按决定发测试卡片并先问常浩。
- 与授权不一致之处、遗留问题、范围外发现：历史记录（1 条导出回执、5 条知识库操作、13 条过期导出预览）按决定保留旧身份；`scripts/import-feishu.mjs`（已执行过的一次性迁移）未带 `--profile`，用默认配置，没动；猛鬼兽同时被 Hermes 使用，共享应用调用额度，工作台调用量小；底栏「1 个来源异常：知识库」是 16:14（迁移前、仍用 codex 时）记下的「1 篇文档详情未完整读取」，与本次迁移无关，未处理。
- 本轮新坑：L-15。★

## 合并 main 并发布：NAS 自动挂载、营收重试、首页打字提速（2026-10-27，Claude 子会话，用户说「合并到 main 并发布到正式 5280，发布后回读、实看（含卸载 NAS 再点同步）并补记录」；已发布 `nm-20261027-161356-e3d22fe` 回读与冒烟通过）

- 时间：开工 `2026-10-27 16:13`（发布前核对开始时间）。来由：把下面两节（`b2e414b`、`e3d22fe`）上线。
- 改了哪些文件：本节只改 `CURRENT.md`（发布记录）；代码见下面两节。
- 测试：沿用下面一节的 `npm test` 结果 `ℹ tests 748` / `ℹ pass 748` / `ℹ fail 0`（`main` 快进到 `e3d22fe`，代码与 `ui-v4` 一致，没重跑）。
- 发布前核对（`2026-10-27 16:13:44`，只读）：没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261027-133320-b89001a` 跑 `verify-release.sh` 回读通过（`发布前-核对.log`、`发布前-verify.log`）。
- 发布与回读：`main` 没有 `ui-v4` 以外的新提交，主工作区 `main` 从 `89b0188` 快进到 `e3d22fe`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261027-161356-e3d22fe`，自动备份 `backups/work-desk-20261027-161358-before-nm-20261027-161356-e3d22fe.db`，保留策略清理 2 项（快照 `nm-20261026-175804-2a86e20`、备份 `work-desk-20261024-101249-before-nm-20261024-101248-197e419.db`）。脚本末尾回读 7 项全 ✓（进程 28012、155 个源码文件与 `e3d22fe` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261027-161356-e3d22fe`（`release.log`、`发布后-verify-smoke.log`，冒烟截图 `smoke-nm-20261027-161356-e3d22fe/`）。回滚：`bash scripts/release-app.sh --use nm-20261027-133320-b89001a`（数据库不用还原）。
- 验证（正式 5280 实看，页脚版本 `e3d22fe`）：① NAS：`umount /Volumes/跨部门综合资料` 后物料沉淀页显示「NAS 未挂载 · 显示上次扫描的缩略图」（上次同步 10-23 10:27）；点「同步 NAS」→ 自动挂上（`mounted by nat`），状态 ok，页面「NAS 已挂载 · 只读」、上次同步 10-27 16:15。这一步按用户要求写了正式库的 NAS 快照和缩略图。② 营收：`GET /api/v3/business/revenue?refresh=1`（与「重新读取」相同）9.0 秒读完，无 `sourceError`；业务页「更新 10-27 16:16」，不再有「更新未完成」。③ 首页 Codex 卡：切回首页重挂，光标闪约 1.1 秒、189 个字符约 1.1 秒打完。证据目录 `~/Library/Application Support/NiumaHome/evidence/NAS自动挂载发布-20261027/`（`发布后-实看.log`、`1-正式-卸载后未挂载.jpg`、`2-正式-点同步后已挂载.jpg`、`3-正式-业务页营收.jpg`）。
- 遗留：① 正式环境 NAS 扫描进行中，`/api/v3/status` 有一次 5 秒没响应，扫描完就恢复——扫描期间服务可能被缩略图处理占住，是原有扫描逻辑，本轮没改。② 营收的重试分支在正式环境没碰上偶发错误，仍只由单元测试覆盖。③ 下面两节的遗留照旧。
- 本轮新坑：无。

## 营收「飞书读取失败」加重试、首页 Codex 预警逐字打出提速（2026-10-27，Claude 子会话，用户截图问「这里显示读取失败的原因是什么，帮我修复」，又说「首页这里字体弹出的速度太慢了，再快一些。我的首页都加载完了，这个还没弹完」；已提交 `e3d22fe`，已发布 `nm-20261027-161356-e3d22fe`，见上节）

- 时间：开工 `2026-10-27 16:05`（收到消息时记录）。来由：业务页营收卡显示「更新未完成：飞书读取失败，请检查 codex 用户登录、读取权限和网络」；首页 Codex 预警卡要打十几秒。
- 原因：营收逐个读「当月策略盘」8 个组件（`lark-cli base +dashboard-block-get-data`）。用同一份代码直接读（不经数据库），连续两次都在某个组件上收到飞书通用错误码 1（`API error: [1]`），同一组件单独连读 3 次又都成功，是飞书接口偶发错误；任何一个组件碰上就整体失败。登录、权限、网络都正常，原提示是 `runLark` 对所有未知错误的统一说法，有误导。Codex 卡：`useTypeOut` 15 帧/秒、每 2 帧一个字，约 7.5 字/秒，卡里中文加英文原话 100 多字要打 15 秒左右。
- 改了哪些文件：`server/revenue.mjs`（组件列表和每个组件读取遇到 502 / 429 时等 1.5 秒重试，最多 2 次；无权限 403 不重试；仍失败报「读取仪表盘组件「X」时飞书接口出错（错误码 N），已重试 2 次，请稍后点「重新读取」」）、`tests/business-revenue.test.mjs`（重试成功、一直失败的文案、无权限不重试）、`src/ui/bitmap.jsx`（`useTypeOut` 去掉 `every`，改成每帧出 `ceil(总字数 / 20)` 个字，不论多长约 1.3 秒打完；光标先闪两次不变。首页卡和顶部横条都用它，一起变快）。
- 测试：`npm test` 原样结果 `ℹ tests 748` / `ℹ pass 748` / `ℹ fail 0`；`npm run build` 通过。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。
- 验证：营收——改后用真实 `lark-cli`（只读，不经数据库）连读 3 次都一次成功，没碰上偶发错误，重试分支只由单元测试覆盖。Codex 卡——隔离 5290 首页，切走再切回让卡片重挂：挂载后约 1.7 秒（含等数据）开始打字，189 个字符约 1.7 秒打完；打完的排版、颜色与改前一致（只改速度，L-01）。
- 截图：证据目录 `~/Library/Application Support/NiumaHome/evidence/nas-auto-mount-20261027/3-首页Codex预警打完.jpg`。
- 发布与回读：未发布。
- 遗留：① `runLark` 对其他来源（项目、带教等）的未知错误仍是「请检查 codex 用户登录、读取权限和网络」，本轮只给营收加了重试和准确提示。② lark-cli 提示 1.0.98 可更新（现 1.0.96），没动。
- 本轮新坑：无。

## 物料沉淀「同步 NAS」没挂载时自动挂载再同步（2026-10-27，Claude 子会话，用户要求「点同步 NAS 时没挂载就自动挂载、再接着同步，不用人去操作」；已提交 `b2e414b`，已发布 `nm-20261027-161356-e3d22fe`，见上两节）

- 时间：开工 `2026-10-27 15:58`（取自任务截图时间）。来由：NAS 没挂载时点「同步 NAS」只报「请在 Finder 按 ⌘K 连接」，每次都要手动挂。
- 改了哪些文件：`server/nas-materials.mjs`（扫描前目录不在、且目录在 `/Volumes/跨部门综合资料` 下时，用 `osascript -l JavaScript` 调系统 NetFS `NetFSMountURLSync` 挂 `smb://172.16.1.10/跨部门综合资料`，`UIOption=NoUI` 不弹框，30 秒超时；账号密码用钥匙串里 Finder 已存的那份（账号 changhao），代码不存凭据；挂上后接着扫；失败按返回码给原因和下一步：80 等＝钥匙串没密码或密码改了（去 Finder ⌘K 登录并记住密码）、60/64/65 等＝连不上（连公司网络）、2＝找不到共享、超时、其他错误码；其他目录不自动挂载）、`tests/nas-materials.test.mjs`（自动挂载后接着扫、已挂载不重复挂、挂载失败原样报原因且仍显示上次快照、挂上但目录不在、返回码映射、测试目录不触发真实挂载）、`docs/API.md`（末尾补一节）。前端没改：原来就把接口的错误原文显示在按钮左边。
- 测试：`npm test` 原样结果 `ℹ tests 747` / `ℹ pass 747` / `ℹ fail 0`；`npm run build` 通过。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。
- 验证：先在命令行试 NetFS：挂载成功返回 0（0.85 秒），故意写错共享名返回 2、不存在的主机返回 60、错账号返回 80，都不弹框、1.5 秒内返回。再起隔离服务 `work-desk-iso`（5290，临时数据目录，不碰 `data/`）：首次进「物料沉淀」页触发扫描并自动挂载，状态 ok；手动 `umount /Volumes/跨部门综合资料` 后刷新页面显示「NAS 未挂载 · 显示上次扫描的缩略图」，点「同步 NAS」→ 自动挂上、同步完成、显示「NAS 已挂载 · 只读」。没实测失败时页面上的文案（只有单元测试）。验证后 NAS 保持挂载状态。
- 截图：证据目录 `~/Library/Application Support/NiumaHome/evidence/nas-auto-mount-20261027/` 下 `1-卸载后未挂载.jpg`、`2-点同步后已挂载.jpg`。
- 发布与回读：未发布（正式 5280 是 gui 域 LaunchAgent，与测试同一用户会话，预计可同样挂载；发布后需在正式环境再卸载一次实看）。
- 与授权不一致之处、遗留：① 设置页「NAS 物料目录」说明仍写「Finder 用 SMB 挂载」，文案已不完全准确，没改（界面文字，未授权）。② 打开原图（`/api/v3/nas/original`）没挂载时仍只提示，不自动挂载。③ 钥匙串密码过期时会报「钥匙串里没有可用的 NAS 密码」，需要用户去 Finder 登录一次。
- 本轮新坑：无。

## 知识库柜顶待上架改成居中叠放、微错位（2026-10-27，Claude，起因是用户截图说「上面散落的左对齐，和书架左对齐，现在看着别扭」；给了三种摆法，用户选「居中叠放 + 微错位」，看结果后说「提交这处改动，并在 CURRENT.md 补一节交接」，再说「合并到 main 并发布到正式 5280，发布后回读、实看并补记录」；已提交 `b89001a`，已发布 `nm-20261027-133320-b89001a` 回读与冒烟通过）

- 时间：开工 `2026-10-27 12:11`（取自会话创建时间，开工时没单独记）。来由：柜顶每摞书左边齐平、各摞从左排起，像台阶，和下面书架的左边线一起看很僵。
- 改了哪些文件：`src/styles/70-kb.css`（`.kbs-piles` 加 `justify-content: space-evenly`，几摞沿柜顶均匀散开；`.kbs-pile` 由 `align-items: flex-start` 改 `center`，摞内居中；新增按 `nth-child(5n+…)` 的 `left` 偏移，每本左右错开 2–6px，偶数摞方向相反。用 `left` 不用 `transform`，因为 `.kbs-slot` 的 `transform` 已给「抽出」`data-pull` 用了）。JSX 和摞书逻辑没动。
- 测试：`npm test` 原样结果 `ℹ tests 745` / `ℹ pass 745` / `ℹ fail 0`；`npm run check:style` 输出「样式检查通过」；`git diff --check` 通过。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。证据目录 `~/Library/Application Support/NiumaHome/evidence/知识库柜顶摆放-20261027/`（`npm-test.log`）。
- 验证：没起隔离端口——隔离库里没有待上架的书，看不出效果；用开发页 `work-desk-dev-live`（vite 5293，`/api` 转给正式 5280，只读打开、没点拖拽或任何写操作）。内置浏览器 1440×900 看 `#/kb`：真实 7 本分成 3 / 3 / 1 三摞，每摞居中、错位可见，三摞沿柜顶均匀分布，不再贴左。窄宽度（约 800）下折成 4 / 3 两摞也正常。颜色核对（L-01）：只改位置，没动颜色和强调。
- 截图：`docs/handoff/知识库柜顶摆放-20261027/` 下 `改前-用户截图.png`、`改后-开发页5293-1440.png`、`发布后-正式5280-1440.png`（不入库）。
- 发布与回读（`2026-10-27 13:33:20` 开始）：发布前只读核对正式库——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261027-105607-14d5642` 先跑 `verify-release.sh` 回读通过（`发布前-核对.log`、`发布前-verify.log`）。`main` 没有别的新提交，主工作区 `main` 从 `7498707` 快进到 `b89001a`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261027-133320-b89001a`，自动备份 `backups/work-desk-20261027-133322-before-nm-20261027-133320-b89001a.db`，保留策略清理 2 项（快照 `nm-20261026-172514-efee62c`、备份 `work-desk-20261024-095802-before-nm-20261024-095801-281604e.db`）。脚本末尾回读 7 项全 ✓（进程 81467、155 个源码文件与 `b89001a` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261027-133320-b89001a`（`release.log`、`发布后-verify-smoke.log`，冒烟截图 `smoke-nm-20261027-133320-b89001a/`）。正式实看：内置浏览器 1440×900 打开 `#/kb`（只读）：页脚版本 `b89001a`；`.kbs-piles` 为 `space-evenly`，三摞都是 `align-items: center`，左边分别在 340 / 657 / 1021，摞内偏移 −4 / 6 / −2、5 / −5 / 3、−4px，和开发页看到的一致（`发布后-实看.log`、`发布后-正式5280-1440.png`）。证据目录 `~/Library/Application Support/NiumaHome/evidence/知识库柜顶摆放发布-20261027/`。回滚：`bash scripts/release-app.sh --use nm-20261027-105607-14d5642`（数据库不用还原）。
- 遗留：① 没试拖书到柜顶时冒出的「放回柜顶」虚线框——它是 `.kbs-piles::after`，也算一个 flex 项，拖上去时几摞可能会因 `space-evenly` 轻微挪位。② 窄屏折成两排时每排也会均匀散开，没细看 600px 以下。
- 本轮新坑：无。

## 培养路径地图改成「双脊合峰」（2026-10-27，Claude 交接会话，起因是用户「蓝色的技术线都没有通到山顶，半路没了。你注意细节……这个山还是重新优化」；上一会话连改五版都被否（「还是不行」），本会话先让独立子代理审核第五版，按审核推荐的「双脊合峰」出真实渲染样稿，用户看后说「去掉小方块，没有象征意义就不要。其他无问题，按样稿修改并提交」，看定稿截图后说「合并到 main 并发布到正式 5280，发布后回读、实看并补记录」；已提交 `ca6464b`、合并 `14d5642`，已发布 `nm-20261027-105607-14d5642` 回读与冒烟通过）

- 时间：开工 `2026-10-27 05:30`（本会话开工；上一会话五版从 `2026-10-27 05:00` 前后开始，未单独记）。来由：用户要求技术线和业务线都爬到皇冠、主峰高且明显、山顶不挤、蓝线有坡度曲折、标签引线不压线不叠、起点不挤、没有断崖。
- 前五版（都未提交，已推翻）：① 蓝线从 T6 下山沿前山到皇冠（「太奇怪」）；② 后山在 D44 拔尖插蓝旗结束（「技术线不是停在半路」）；③ 蓝线平缓直线到皇冠（「答辩前面就是一个三角，堆到一起」）；④ 山尖往 D65 右边让 38px；⑤ 主峰再拔高、蓝线台阶式上爬（「还是不行」）。独立审核（只给 V7 / V11 稿、用户原话和第五版截图）指出：两道山是同坡度的平行斜线、主峰只是一根细针且右侧断崖、皇冠为躲营地挪离了 D65、两线没汇在同一点、引线压线且 T1 / P1 看着接反；报告在共享笔记 `side-session-notes/local_86492d00-…/第五版山体独立审核.md`。
- 改了哪些文件：`src/modules/projects/mentor-path.js`（两道山脊改由地形表 `FRONT` / `BACK` 定高低：后山前段陡升、中段起伏，T6 停在肩峰、过一道 ≤ 14px 的浅鞍部再沿主峰西脊爬到皇冠；前山前段平缓、越往后越陡，D44 一个肩，P9 在主峰左肩、比皇冠低一截；皇冠对准 D65（`R` 128 → 100，去掉 `PEAK`）；主峰右坡先陡再缓、落到画框外；当前标牌最低一档也让过山脊上的帐篷，选位时连引线一起查——引线不穿过已摆的标牌、营地和另一个小人（判前去掉零长段），横段贴在自己小人头顶上方；业务线标牌先放；评审小牌离营地远、在营地正下方时加一根竖引线 `pins`；结业小牌先放在皇冠左上方）、`src/modules/projects/MentorPath.jsx`（画 `pins` 竖引线；第五版里的画法改动一并带上：路线虚实按走到哪画、引线画在营地和小人下面、太近的小桩不画、网点从各山最高处分层、山名用新摆位）、`tests/mentor-path.test.mjs`（技术线：T6 后只过浅鞍部再一路往上到皇冠、皇冠以前处处高于前山路；山顶：皇冠对准结业那天、P9 帐篷顶比皇冠底低 ≥ 16px、蓝线在帐篷上方 ≥ 8px；新增「引线不穿过另一张标牌、营地和另一个小人；小牌贴着营地或有竖引线」，先改回旧摆法确认会失败；另有第五版加的后山高于前山、小牌山名不压线、右坡坡度 ≤ 3 等）、`docs/LESSONS.md`（L-14）。样稿里 T6 之后的蓝色小方块（零星小培训）用户要求去掉，已删。
- 测试：`npm test` 原样结果 `ℹ tests 745` / `ℹ pass 745` / `ℹ fail 0`；`npm run check:style` 输出「样式检查通过」；`npm run build` 通过；`git diff --check` 通过。工作区含他人未提交改动（`.claude/launch.json`，L-07），未提交它。证据目录 `~/Library/Application Support/NiumaHome/evidence/培养路径山体优化-20261027/`（`npm-test-双脊合峰.log`、`改后6-双脊合峰-实看.log`、`双脊合峰样稿/` 里是样稿代码和截图脚本）。
- 验证：样稿在临时副本里渲染，定稿用本工作区代码起隔离 5290（正式库只读备份副本 + 假 `lark-cli`；副本里胡贵兰造成按期 D42）；临时启动项用完已还原、5290 已停。无头 Chrome 调试协议截 1440 / 1280 两种宽度、超期（林瑶 D116）和按期（胡贵兰 D42）：皇冠立在 D65 主峰上，蓝黑两线都汇到皇冠；P9 帐篷在主峰左肩、和皇冠上下分开；「师资侧评审」小牌在 P9 正下方并有竖引线；「结业答辩」在皇冠左上方，不和「今天 D116」叠；起点「初轮筛选」在 P1 下方；超期两张标牌各自引线不交叉、不穿过另一个小人；右坡没有断崖。颜色核对（L-01）：没加新颜色，竖引线用 `--panel` 衬底 + `--text-2`。
- 截图：`docs/handoff/培养路径双脊合峰样稿-20261027/` 下 `样稿-隔离5290-{超期-林瑶,按期-胡贵兰}-{1440,1280}.png`（用户认可的样稿，带小方块）、`改后-隔离5290-…`（定稿）；改前与五版截图在 `docs/handoff/培养路径山体优化-20261027/`（不入库）。
- 发布与回读（`2026-10-27 10:56:07` 开始）：发布前只读核对正式库——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261026-233411-8570c55` 先跑 `verify-release.sh` 回读通过（`发布前-verify.log`）。`main` 上多出别的会话两个只改文档的提交（`0702fb6`、`ce7a2c5`：AGENTS「Agent skills」一节、`docs/agents/`、PR 模板），先合进 `ui-v4`（`14d5642`，合并后 `npm test` 745 全过），主工作区 `main` 从 `ce7a2c5` 快进到 `14d5642`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261027-105607-14d5642`，自动备份 `backups/work-desk-20261027-105608-before-nm-20261027-105607-14d5642.db`，保留策略清理 2 项（快照 `nm-20261024-113328-b915042`、备份 `work-desk-20261024-011156-before-nm-20261024-011154-fcac8c6.db`）。脚本末尾回读 7 项全 ✓（进程 77422、155 个源码文件与 `14d5642` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261027-105607-14d5642`（`release.log`、`发布后-verify-smoke.log`，冒烟截图 `smoke-nm-20261027-105607-14d5642/`）。正式实看：无头 Chrome 1440 / 1280 宽、`#/mentor/path`，点人名切换林瑶、胡贵兰（正式库两人都超期 D116）：皇冠立在 D65 主峰上，蓝黑两线都汇到皇冠、没有小方块，P9 帐篷在主峰左肩并有竖引线连「师资侧评审」小牌，「结业答辩」在皇冠左上方，起点两张标牌引线各连各的人（`发布后-实看.log`，截图 `发布后-正式5280-{林瑶,胡贵兰}-{1440,1280}.png`）。证据目录 `~/Library/Application Support/NiumaHome/evidence/培养路径双脊合峰发布-20261027/`。回滚：`bash scripts/release-app.sh --use nm-20261026-233411-8570c55`（数据库不用还原；只退掉本轮山体和那两个文档提交）。
- 遗留：① 1280 宽超期时「侧边栏 Demo 评审 D24」放在两道山脊之间、P6 营地右上方，没有引线（样稿即如此，用户已认可）。② D64 和 D65 只差一天，P9 到皇冠那一段很陡，是按「不挪日期」的取舍。③ 仍待用户答：两人是否补录过往进度；旧种子 `docs/培养路径/林瑶.json`、`胡贵兰.json` 删不删。
- 本轮新坑：L-14。

## 培养路径结业皇冠重画、填黄色（2026-10-26，Claude，用户看正式页后要求「皇冠👑重新画下，然后用黄色，能看出来是个皇冠」，看稿后又说「有点太宽了吧，稍微窄一点」，再看稿后同意「按这个宽度提交并发布」；发布前发现 `main` 上有别的会话两个未发布提交，用户选「合并后一起发布」；已提交 `bbebb2f`、合并 `8570c55`，已发布 `nm-20261026-233411-8570c55` 回读与冒烟通过）

- 时间：开工 `2026-10-26 22:45`（收尾时记录；开工时间没单独记）。来由：地图山尖上的结业图标是 7×7 的城堡式剪影（墨色 / 橙色），看不出是皇冠。
- 改了哪些文件：`src/ui/bitmap.jsx`（`SPRITES.keep` 改名 `SPRITES.crown`，重画成三尖皇冠（先画 11×6，用户嫌宽，改成 9×6）：`#` 墨线勾边、`o` 填色；`SpriteCells` 加 `fillColor`（默认仍是底色，云不受影响），`PixelSprite` 透传 `fillColor`）、`src/modules/projects/MentorPath.jsx`（新增本地常量 `GOLD = "#FFC21A"`，和 `LOCKED` 一样只在本页用；地图山尖和图例「结业」用墨线 + 金色填；山尖点击区域 30×24；评审列表里的皇冠仍按评审结果着色、没结论时灰线，不填金，保持「灰 = 还没到」的读法）、`src/modules/projects/mentor-path.js`（标牌避让时山尖皇冠占位 30×24）、`src/styles/95-mentor-path.css`（评审列表的旗和皇冠统一占 18px 宽：皇冠比旗宽，不占位时「D65」那行文字会往右错开；带备注那行左缩进跟着改）。
- 测试：`npm test` 原样结果 `ℹ tests 739` / `ℹ pass 739` / `ℹ fail 0`，`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过。工作区含他人未提交改动（`.claude/launch.json`，期间别的会话又加了 `dw-dev-live` 一项，L-07）。证据目录 `~/Library/Application Support/NiumaHome/evidence/培养路径皇冠-20261026/`（`npm-test.log`、`改后-实看.log`）。
- 验证：隔离 5290（正式库 `sqlite3 -readonly … .backup` 副本 + 假 `lark-cli`；临时启动配置用完已还原，5290 已停）。无头 Chrome 1440 胡贵兰、1280 林瑶：页面上金色填充 2 处（山尖、图例），卡头仍 48；评审列表各行「D…」文字左边都对齐（1440 下都是 1102，1280 下都是 992）。放大看山尖：黄底墨边三尖皇冠，立在山尖上，和「结业答辩」小牌不相压。颜色核对（L-01）：只改皇冠，其他配色不变；黄色是新加的本页常量，不进全站变量。
- 截图：`docs/handoff/培养路径皇冠-20261026/` 下 `改前-正式5280-胡贵兰-1440.png`（上一轮发布后正式截图的副本）、`改后-隔离5290-胡贵兰-1440.png`、`改后-隔离5290-林瑶-1280.png`、`改后-隔离5290-地图-1440.png`、`合并后-隔离5290-胡贵兰-1440.png`、`发布后-正式5280-{林瑶,胡贵兰}-{1280,1440}.png`（不入库）。
- 提交：`bbebb2f`（只提交上面四个文件和 `CURRENT.md`，没带 `.claude/launch.json`）。发布前主工作区 `main` 在 `b265d82`，比 `ui-v4` 多两个别的会话的提交且未发布：`3d37dba` fix(health-check) 为紧邻中文标点的变量补全边界（20:49）、`b265d82` 培养路径卡片日期列改左对齐（20:03）——正是上面记的范围外问题，已有人修。`git merge-tree` 无冲突；用户选「合并后一起发布」，在 `ui-v4` 合并 `main` 得 `8570c55`（`95-mentor-path.css` 自动合并）。合并后 `npm test` 原样结果 `ℹ tests 739` / `ℹ pass 739` / `ℹ fail 0`、`npm run build` 通过（`合并后-npm-test.log`）；隔离 5290 再看一次：皇冠在、卡片安排日期列左对齐、卡头 48（`合并后-实看.log`）。
- 发布与回读（`2026-10-26 23:34:11` 开始）：发布前只读核对正式库——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261026-190749-d2a1ba8` 先跑 `verify-release.sh` 回读通过（`发布前-verify.log`）。主工作区 `main` 从 `b265d82` 快进到 `8570c55`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261026-233411-8570c55`，自动备份 `backups/work-desk-20261026-233412-before-nm-20261026-233411-8570c55.db`，保留策略清理 2 项（快照 `nm-20261024-103421-c261bd6`、备份 `work-desk-20261024-002316-before-nm-20261024-002313-87c6e99.db`）。脚本末尾回读 7 项全 ✓（进程 3934、155 个源码文件与 `8570c55` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261026-233411-8570c55`（`release.log`、`发布后-verify-smoke.log`，冒烟截图 `smoke-nm-20261026-233411-8570c55/`）。正式实看：无头 Chrome 1280 / 1440 宽、`#/mentor/path`，点人名切换林瑶、胡贵兰，四种情况金色填充都是 2 处（山尖、图例）、评审列表「D…」文字左边对齐（1280 下 992、1440 下 1102）、卡头 48、页脚版本 `8570c55`；放大看山尖是 9 格宽黄底墨边皇冠（`发布后-实看.log`）。回滚：`bash scripts/release-app.sh --use nm-20261026-190749-d2a1ba8`（数据库不用还原；会一起退掉日期列左对齐和 health-check 修正）。
- 遗留 / 下一步：① 提交与发布已完成。② 评审列表的皇冠没填金（按结果着色），如要也填金再说。③ 隔离副本里胡贵兰 D24「侧边栏 Demo 评审」已有 90 分通过的记录——只读查过，正式库里本来就有这条（`mentor-stage`），不是本轮写的。④ 仍待用户答：两人是否补录过往进度；旧种子 `docs/培养路径/林瑶.json`、`胡贵兰.json` 删不删。
- 本轮新坑：无。

## 培养路径地图拉高、三张卡底边对齐（2026-10-26，Claude，用户看正式页后要求「可以再拉高一点，这画面上的方框和山都重合了。下面三个板块要下方对齐，看的齐整一些」；用户同意「提交并发布到正式 5280，发布后实看并补记录」；已提交 `d2a1ba8`，已发布 `nm-20261026-190749-d2a1ba8` 回读与冒烟通过）

- 时间：开工 `2026-10-26 18:00`（约数：上一轮 18:00 收尾后接着做，开工时没单独记）。来由：正式页地图上两张当前标牌（P1 / T1）压在山上；下面三张卡高低不齐。根因：天空只有约 120px，标牌摆放只避开别的标牌、不看山的轮廓（业务线那张还会先试前山坡里）。
- 改了哪些文件：`src/modules/projects/mentor-path.js`（新增 `SKY = 40`：山、远山、地平线整体下移 40px，地图高 386 → 426；两张当前标牌改为都放在天上——每个候选位置先算标牌下方三层山轮廓的最高点，贴着它上方一档、再上一档、再到顶，压山的候选不要）、`src/modules/projects/MentorPath.jsx`（两层山网点起始高度跟着加 `SKY`；「进度记录」一栏加 `is-foot`）、`src/styles/95-mentor-path.css`（`.mpath-grid` 去掉 `align-items: start`，三张卡等高；卡内纵向排，`.mpath-sec.is-foot` 压到卡底）、`tests/mentor-path.test.mjs`（新增「当前标牌在天上：不压远山、后山、前山」，按期 / 超期 × 1440 / 1280 每 2px 采样；云测试原来依赖「P1 标牌压住一朵云」，标牌挪到山顶上方后不再压云，改为另放一块压住第一朵来测）。
- 测试：`npm test` 原样结果 `ℹ tests 739` / `ℹ pass 739` / `ℹ fail 0`（新测试先跑过一次失败：`onTrack 1153 biz：x=631.7… 压到山`），`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过。工作区含他人未提交改动（`.claude/launch.json`，L-07）。证据目录 `~/Library/Application Support/NiumaHome/evidence/培养路径拉高与卡片对齐-20261026/`（`npm-test.log`、`改后-实看.log`）。
- 验证：隔离 5290（正式库 `sqlite3 -readonly … .backup` 副本 + 假 `lark-cli`；临时启动配置用完已还原，5290 已停）。内置浏览器 1280 宽量：地图 SVG 高 426，两张标牌底边在山轮廓之上；三张卡上下沿都是 907–1516，前两张卡「进度记录」栏都在 1441–1514；卡头仍 48px。无头 Chrome 1280 / 1440 各看林瑶、胡贵兰（真实点人名切换）：四种情况三张卡都等高、卡头 48。颜色核对（L-01）：标牌、山、卡片配色都没动，只改位置和高度。
- 截图：`docs/handoff/培养路径拉高与卡片对齐-20261026/` 下 `改前-正式5280-林瑶-1280.png`（上一轮发布后正式截图的副本）、`改后-隔离5290-林瑶-1280.png`、`改后-隔离5290-林瑶-1440.png`、`改后-隔离5290-胡贵兰-1280.png`、`改后-隔离5290-胡贵兰-1440.png`、`发布后-正式5280-{林瑶,胡贵兰}-{1280,1440}.png`（不入库）。
- 提交：`d2a1ba8`（只提交上面四个文件和 `CURRENT.md`，没带 `.claude/launch.json`）。
- 发布与回读（`2026-10-26 19:07:49` 开始）：发布前只读核对正式库——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261026-175804-2a86e20` 先跑 `verify-release.sh` 回读通过（`发布前-verify.log`）。主工作区 `main` 从 `2928948` 快进到 `d2a1ba8`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261026-190749-d2a1ba8`，自动备份 `backups/work-desk-20261026-190751-before-nm-20261026-190749-d2a1ba8.db`，保留策略清理 2 项（快照 `nm-20261024-102250-4bb6c0c`、备份 `work-desk-20261023-224125-before-nm-20261023-224123-7925f91.db`）。脚本末尾回读 7 项全 ✓（进程 99606、155 个源码文件与 `d2a1ba8` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261026-190749-d2a1ba8`（`release.log`、`发布后-verify-smoke.log`，冒烟截图 `smoke-nm-20261026-190749-d2a1ba8/`）。正式实看：无头 Chrome 1280 / 1440 宽、`#/mentor/path`，点人名切换林瑶、胡贵兰，四种情况都量到地图 SVG 高 426、三张卡上下沿 907–1516、两条「进度记录」栏 1441–1514、卡头 48、页脚版本 `d2a1ba8`；截图里两张标牌都在山顶上方（`发布后-实看.log`）。回滚：`bash scripts/release-app.sh --use nm-20261026-175804-2a86e20`（数据库不用还原）。
- 遗留 / 下一步：① 提交与发布已完成。② 三张卡等高后，「评审与筛选」卡下方留白较多（按用户要求底边对齐的结果）。③ 超期时 P1 标牌的引线横穿到起点，会经过「后山 · 技术线」框签旁（改前也是这样）。④ 仍待用户答：两人是否补录过往进度；旧种子 `docs/培养路径/林瑶.json`、`胡贵兰.json` 删不删。
- 本轮新坑：无。

## 培养路径卡头 1280 宽折行修复（2026-10-26，Claude 交接会话，用户「修掉 1280 宽卡头折行，隔离实看后提交并发布」；提交与发布由交接会话完成，用户同意分批计划「提交、发布、实看、记录」；已提交 `2a86e20`，已发布 `nm-20261026-175804-2a86e20` 回读与冒烟通过）

- 时间：开工 `2026-10-26 17:45`（`date '+%F %H:%M'` 记录）。来由：上一节发布后正式 5280 实看，1280 宽时「同期技术线」卡头（标题 +「超出 113 个工作日」+「确认完成」）放不下，折成两行。根因是第 2 批把「记录进度」按钮加进了卡头（V11 稿卡头只有标题 + 状态标签），1280 宽时同期那张卡内容区只有约 270px。
- 改了哪些文件：`src/modules/projects/MentorPath.jsx`（`StageCard` 卡头回到「标题 + 状态标签」；按钮挪到卡底「进度记录」一栏，没有记录时写「还没有评审记录 / 带教还没确认完成」，按钮文字不变：记录评审 / 确认完成 / 改记录）、`src/styles/95-mentor-path.css`（加 `.mpath-record`：文字与按钮左右分开）。
- 测试：`npm test` 原样结果 `ℹ tests 738` / `ℹ pass 738` / `ℹ fail 0`（17:47），`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过（`npm-test.log`、`check-style.log`、`build.log`）。工作区含他人未提交改动（`.claude/launch.json` 一条，L-07）。证据目录 `~/Library/Application Support/NiumaHome/evidence/培养路径卡头折行-20261026/`。
- 验证：隔离 5290（导入后正式库 `sqlite3 .backup` 副本 + 假 `lark-cli`；副本里给胡贵兰 P1 补了一条 78 分通过，只为看「改记录」的样子；临时启动配置用完已删，5290 已停）。内置浏览器 1280 宽量三张卡卡头：林瑶、胡贵兰、选中 P1 三种情况都是 48px 一行（规范「卡头固定 48px」）；真实点击卡底「改记录」打开记录弹窗（标题、现有记录正确），Esc 关闭后可再次打开。无头截图 1280 / 1440 各两人的三张卡。颜色核对（L-01）：卡头只少了按钮，标签配色不变；按钮仍是 `btn-xs` 墨框白底。
- 截图：`docs/handoff/培养路径卡头折行-20261026/` 下 `改前-正式5280-胡贵兰-1280.png`、`改后-隔离5290-林瑶-1280.png`、`改后-隔离5290-胡贵兰-1280.png`、`改后-隔离5290-林瑶-1440.png`、`改后-隔离5290-胡贵兰-1440.png`、`发布后-正式5280-林瑶-1280.png`、`发布后-正式5280-胡贵兰-1280.png`（不入库）。
- 提交：`2a86e20`（只提交 `MentorPath.jsx`、`95-mentor-path.css`、`CURRENT.md`，`git commit -- <三个文件>`，没带 `.claude/launch.json`）。
- 发布与回读（`2026-10-26 17:58:04` 开始）：发布前只读核对正式库——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted，无挂起；当时快照 `nm-20261026-172514-efee62c` 先跑 `verify-release.sh` 回读通过（`发布前-verify.log`）。主工作区 `main` 从 `0722fe2` 快进到 `2a86e20`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261026-175804-2a86e20`，自动备份 `backups/work-desk-20261026-175805-before-nm-20261026-175804-2a86e20.db`，保留策略清理 2 项（快照 `nm-20261024-101248-197e419`、备份 `work-desk-20261023-221529-before-nm-20261023-221528-0c9e0fa.db`）。脚本末尾回读 7 项全 ✓（进程 27520、155 个源码文件与 `2a86e20` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261026-175804-2a86e20`（`release.log`、`发布后-verify-smoke.log`，冒烟截图 `smoke-nm-20261026-175804-2a86e20/`）。正式实看：无头 Chrome 1280 宽、`#/mentor/path`，点人名切换林瑶、胡贵兰，`.mpath-grid .card-head` 的 `offsetHeight` 两人都是 `当前阶段 48 / 同期技术线 48 / 评审与筛选 48`，卡头一行，按钮在卡底「进度记录」栏，页脚版本 `2a86e20`（`发布后-实看.log`）。回滚：`bash scripts/release-app.sh --use nm-20261026-172514-efee62c`（数据库不用还原）。
- 遗留 / 下一步：① 提交与发布已完成。② 范围外发现（未改）：卡片「安排 / 关键事项」的日期列用了 `.tnum`（自带右对齐），短日期（如 `D2`、`D3`）靠右、和左边的勾框之间空一大截。③ 仍待用户答：两人是否补录过往进度；旧种子 `docs/培养路径/林瑶.json`、`胡贵兰.json` 删不删。
- 本轮新坑：无。

## 培养路径接真实排期 · 第 2 步页面（V11）与编辑界面（2026-10-26，Claude 交接会话，用户同意分批计划并逐批确认：第 1 批截图「可以」、第 2 批开工、第 3 批开工、第 4 批提交并发布；已提交 `5c2fd44`、`efee62c`，已发布 `nm-20261026-172514-efee62c` 回读通过；用户同意后两人已导入正式库并回读）

- 时间：开工 `2026-10-26 16:50`（收到第 1 批同意时没跑 `date`，按会话时间回填；最早的证据是 `16:59` 的正式库副本，`17:05`、`17:18` 跑全量测试和 `17:21` 写交接时用 `date '+%F %H:%M'` 记录）。来由：上一节数据层改成按工作日排期后，页面还是 V7 按周的旧版，打开会出错；用户要求按定稿 V11 重做，并能添加带教对象、调整安排、记录进度。
- 改了哪些文件：重写 `src/modules/projects/mentor-path.js`（纯几何，从 `v11.html` 移植：横轴按工作日、营地与山脊、今天超过计划结束时钉在右端、地平线带刻度、阶段条、标牌与评审小牌避让、被标牌压住的云不画；另有调整安排草稿 `draftOf` 与顺延 `moveStage`）、`src/modules/projects/MentorPath.jsx`（V11 版面：统一表头 + 关键数字 + 地图卡 + 三张卡，点地图 / 阶段条 / 评审行切卡片；工具栏「调整安排」「添加带教对象」，卡片和评审行「记录进度」，没有路径的人「按方案生成路径」；保存后按回读结果重画）、`src/styles/95-mentor-path.css`（`.m7-*` 换成 `.mpath-*`）；新增 `src/modules/projects/MentorPathEdit.jsx`（四个写操作弹窗，都用 `useWriteFlow` / `WriteBox`，回读时重新 GET，这个人的 `path` 与预览的 `view` 完全一致才算保存；天数框回车或失焦才提交）；`src/ui/bitmap.jsx`（`SPRITES.pine` 换成 V11 的短松树，只有培养路径在用）；`src/modules/projects/ProjectsPage.jsx`（培养路径页签说明）；`server/mentor-path.mjs`（加 `generatePreview`：只给没有路径或旧版路径的人用，已有新版路径 409）、`server/routes/projects.mjs`（加 `/:name/generate/preview`、`/:name/generate`）；测试 `tests/mentor-path.test.mjs`（9 项：读法、进度格与安排、山脊、今天与钉右端、登山者、地平线带、标牌按实测尺寸互不相压、云、顺延）、`tests/helpers/mentor-path-sample.mjs`（改成用 V2.4 模板 + `derivePath` 生成按期 / 超期两份）、`tests/mentor-path-data.test.mjs`（加「按方案生成路径」1 项）；文档 `docs/API.md`「带教 · 培养路径」整节改写、`REQUIREMENTS.md` 带教一行和「改定的决定」一条、`docs/STYLE-GUIDE.md` 培养路径条目改成 V11、`docs/OPERATIONS.md`「报告与验收」加第 6 条、`docs/LESSONS.md` L-13 加「升级」、`docs/tasks/T14-培养路径真实数据.md` 注明改定。
- 测试：`npm test` 原样结果 `ℹ tests 738` / `ℹ pass 738` / `ℹ fail 0`（`npm-test-2.log`，17:18；写完文档和这节交接后 17:21 重跑，原样结果相同 `ℹ tests 738` / `ℹ pass 738` / `ℹ fail 0`，含交接格式检查，`npm-test-3.log`），`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过。工作区含他人未提交改动（`.claude/launch.json` 一条 `dw-ui-v19-preview`、`CURRENT.md` 一行、`docs/LESSONS.md` 的提升标注，L-07；状态见 `git-status-before-test.txt`）。证据目录 `~/Library/Application Support/NiumaHome/evidence/培养路径页面V11-20261026/`。
- 验证：隔离 5290（正式库 `sqlite3 .backup` 副本 + 假 `lark-cli`，首页几个飞书接口因此 502，与带教无关；临时加在 `.claude/launch.json` 的 `work-desk-iso-mentor` 用完已删，5290 已停）。副本里林瑶按真实情况导入（入职 05-12、无记录 → 超期 D115），胡贵兰假设入职 09-01 并补录 P1–P6、T1–T5（只为看按期状态，不是真实进度）。① 页面：无头 Chrome 调试协议截 1440、1280 两种宽度 × 按期 / 超期；两个页签的表头位置实测一致（标题 `(240, 96)`、页签 `(240, 146)`、说明 `(240, 202)`、管培生选择 `(240, 237)`）；第一版截图发现 1280 宽超期时 T1 标牌压住 P1 标牌，按实测尺寸（地图宽 1153 / 993，标牌 214×78）补测试复现后加了候选位置；评审名折行、云被标牌盖半截也已改。② 写操作：内置浏览器真实点击、打字走了一遍：林瑶 P1 记 82 分通过（预览列出 P1 → 已完成、P2 → 进行中）→ 撤销；胡贵兰 P7 止日 D44 → D47（P8–P10 顺延，结业 12-04 → 12-09）并改一条安排文字；给名单里没有路径的「测试乙」按方案生成路径；添加「王一」（无日志链接、入职 11-02）。每次都是保存提示「回读核对一致」、页面按新数据重画。走查中发现并改掉：天数框逐键生效会让顺延算乱（改成回车 / 失焦提交）、未入职显示「D0」（改「入职前」）、预览列表右对齐、弹窗下拉框文字被裁。颜色核对（L-01）：沿用 V11 稿的墨色 / 信号橙 / 信息蓝，超期用风险红；表头沿用带教答疑的配色。
- 截图：`docs/handoff/培养路径页面V11-20261026/` 下 `按期-胡贵兰-1440.png`、`按期-胡贵兰-1280.png`、`超期-林瑶-1440.png`、`超期-林瑶-1280.png`、`入职前-王一-1440.png`、`弹窗-记录评审预览-林瑶P1.png`、`弹窗-调整安排-表格-胡贵兰P6顺延.png`、`弹窗-调整安排预览-胡贵兰P6顺延.png`、`弹窗-添加带教对象预览.png`（不入库）。弹窗截图的状态是用合成事件摆出来的，只当画面；交互以上面内置浏览器的真实操作为准（L-13）。
- 提交：用户 2026-10-26 同意「提交培养路径相关改动和设计稿（CURRENT、LESSONS 连同里面他人的标注一起提交，launch.json 不提交）」。`5c2fd44`（代码、测试、文档，含上一节数据层与「统一表头」两节的改动）、`efee62c`（设计稿 `v10.html`、`v11.html` 与 6 张截图）；提交前暂存区为空，`.claude/launch.json`（他人一条配置）和其余他人未跟踪文件没带。
- 发布与回读（用户同意，`2026-10-26 17:25:14` 开始）：发布前只读核对正式库——没有 `kb-write-lock`，`kb-operation` 12 条 verified、2 条 aborted（比 10-24 多 1 条 10-25 的收藏，已 verified），两人的 `mentor-path` 都是旧版按周（没有 `version`），没有 `mentor-camp` / `mentor-stage` 记录；当时快照 `nm-20261024-113328-b915042` 先跑 `verify-release.sh` 回读通过。主工作区 `main` 从 `ef1f31d` 快进到 `efee62c`（`main..ui-v4` 只有本轮两个提交，已跟踪文件干净）；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261026-172514-efee62c`，自动备份 `backups/work-desk-20261026-172515-before-nm-20261026-172514-efee62c.db`，保留策略清理 2 项（快照 `nm-20261024-095801-281604e`、备份 `work-desk-20261023-214604-before-nm-20261023-214602-5d45dce.db`）。脚本末尾回读 7 项全 ✓（进程 73315、155 个源码文件与 `efee62c` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 原样结果 `24 项，0 项有问题` → `回读通过：nm-20261026-172514-efee62c`（`release.log`、`verify-smoke.log`，冒烟截图 `smoke-nm-20261026-172514-efee62c/`）。正式 `GET /api/v3/mentor/path`：两人 `path` 为 null、`legacy: true`（页面显示「按方案生成路径」），符合导入前预期。回滚：`bash scripts/release-app.sh --use nm-20261024-113328-b915042`（回滚前旧代码认不得新路径，导入后回滚须同时还原数据库备份）。
- 正式库导入（只预览，未写入）：`17:2x` 在主工作区对正式 `data/` 跑 `node scripts/import-mentor-path.mjs <姓名> --start 2026-05-12`（不带 `--confirm`），两人预览一致：V2.4、2026-05-12 入职（D1）→ D65 结业（2026-08-11）、业务线 10 段 / 技术线 6 段、6 个评审日期、今天 D115、P1 与 T1 各超出 113 个工作日、「旧版按周的路径，换成按工作日的新版」（`import-preview-林瑶.log`、`import-preview-胡贵兰.log`）；预览前后正式库 md5 不变。待用户同意后加 `--confirm`。
- 正式库导入（用户 2026-10-26 回复「预览没问题，把林瑶、胡贵兰都按 2026-05-12 入职导入正式库（加 --confirm）」，`2026-10-26 17:33:27` 开始）：主工作区对正式 `data/` 依次跑 `node scripts/import-mentor-path.mjs <姓名> --start 2026-05-12 --confirm`，两人退出码 0、输出「已写入，回读核对一致。」（`import-confirm-林瑶.log`、`import-confirm-胡贵兰.log`）。只读回读：库里两条 `mentor-path` 都是 `version 2`、`start 2026-05-12`、方案 `v2.4`；正式 `GET /api/v3/mentor/path` 两人 `legacy` 消失，`D115 / 65`、结业 `2026-08-11`、业务线 P1 与技术线 T1 各 `late 113`、`missingYears` 为空。正式 5280 实看（只读，调试协议无头 Chrome）：林瑶 1440、胡贵兰 1280 两张，页头、关键数字（D115、计划已结束 50 个工作日）、地图（今天钉在右端、两张红框标牌、评审小牌）、三张卡都正常，状态栏版本 `efee62c`。截图 `发布后-正式5280-林瑶-1440.png`、`发布后-正式5280-胡贵兰-1280.png`。发现 1280 宽时「同期技术线」卡头（标题 +「超出 113 个工作日」+「确认完成」）放不下，折成两行，待修。
- 与授权不一致 / 遗留 / 下一步：① 问用户是否补录两人的过往进度（工作台里没有任何评审记录，现在都停在 P1 超期）。⑥ 1280 宽卡头折行（见上）待用户同意后修，要再发一次版。② `.claude/launch.json` 他人一条配置仍未提交；旧版种子 `docs/培养路径/林瑶.json`、`胡贵兰.json` 已没有代码使用，删不删待用户定。③ 安排条目自己的日期不能在页面上单独改，只随整段顺延或被收进新起止。④ 节假日表只有 2026 年，2027 年通知出来后补。⑤ 「添加带教对象」在入职日早于今天很久时，新人一进来就是超期，属正常。
- 本轮新坑：无（L-13 第 2 次出现，已升级写进 docs/OPERATIONS.md「报告与验收」第 6 条）。

## 培养路径接真实排期 · 第 1 步数据层（2026-10-26，Claude，用户定：入职 2026-05-12、跳过法定节假日、按真实日期算；普通阶段由带教确认完成、改日期后面默认顺延、今天超过计划结束钉在横轴右端；要能加带教对象、能改日期和安排；未提交、未发布；页面已在上一节跟上）

- 时间：开工 `2026-10-26 16:20`（收到答复时没跑 `date`，按会话时间回填；`16:44` 跑全量测试时用 `date '+%F %H:%M'` 记录）。来由：现有路径是 24 周、B1–B7 / A1–A6 的占位，和飞书《管培生培养路径 V2.4》（业务线 P1–P10、技术线 T1–T6、65 个工作日、6 个评审节点）对不上；用户还要能加人、能按实际情况改日期和安排。
- 改了哪些文件（数据层，已完成）：新增 `server/workdays.mjs`（工作日历：2026 法定节假日与调休上班日照国务院办公厅 2025-11-04 通知录入，`workdays` / `dayIndex` / `missingYears`）、`server/mentor-plans.mjs`（V2.4 培养方案模板，照飞书原文整理）；重写 `server/mentor-path.mjs`（路径按工作日 `d: [起, 止]` 存，version 2；进度记录 kind 改为 `mentor-stage`：评审段 `{ kind: review, score, result: pass|retest|fail, at }`、其余段 `{ kind: complete, at }`；服务方法 get / addPreview·addConfirm（名单 `mentor_sources` 和路径同一事务写入）/ planPreview·planConfirm（只改入职日、日期、文字，段落不增删）/ recordPreview·recordConfirm（可 `{ clear: true }` 撤销）/ importPreview·importConfirm；旧版按周的路径 GET 时 path 为 null 并标 `legacy`）；`server/routes/projects.mjs`（新路由 `/api/v3/mentor/path/trainees[/preview]`、`/:name/plan[/preview]`、`/:name/stages/:id/record[/preview]`，删掉旧 `/nodes/:id/record`）；`server/mentor.mjs`（`mentorConfig` 最多 20 人、日志链接可空；带教答疑只读有链接的人）；`server/v3-settings.mjs`（`mentor_sources` 校验放宽为 1–20 人、链接可不填）；`src/modules/settings/SettingsPage.jsx`（该项说明文字）；`scripts/import-mentor-path.mjs`（改为 `-- <姓名> --start YYYY-MM-DD [--plan v2.4] [--confirm]`）；重写 `tests/mentor-path-data.test.mjs`（9 项：日历、模板校验、推导、GET、加人、设置、调整安排、记录进度、导入脚本）。
- 测试：`npm test` 原样结果 `ℹ tests 740` / `ℹ pass 740` / `ℹ fail 0`（`~/Library/Application Support/NiumaHome/evidence/培养路径真实排期-20261026/npm-test-backend.log`）。注意：页面 `src/modules/projects/MentorPath.jsx` 和前端几何 `src/modules/projects/mentor-path.js` 还是 V7 按周的旧版，**和新接口形状不兼容，现在打开培养路径页会出错**；`tests/mentor-path.test.mjs` 只测旧前端几何所以仍通过。工作区含他人未提交改动（`.claude/launch.json`、`CURRENT.md` 一行、`docs/LESSONS.md` 提升标注，L-07）。
- 验证：只做了单元测试；页面未实看（页面还没改）。排期核对：D1 05-12、D14 05-29、D24 06-12、D44 07-13、D64 08-10、D65 08-11；今天 10-26 = D115，计划已结束 50 个工作日；端午 06-19 不算、9-20 和 10-10 算。
- 截图：无。
- 发布与回读：未发布。正式库未写入（真实导入是最后一步，要用户看预览后同意）。
- 遗留 / 下一步（按顺序）：① 页面按 V11 定稿（`docs/design-drafts/mentor-path/v11.html`）重写 `MentorPath.jsx`、`mentor-path.js`、`95-mentor-path.css`，表头沿用上一节统一好的那套，今天超过计划结束时钉在横轴右端写「计划已结束 N 个工作日」；`tests/mentor-path.test.mjs` 与 `tests/helpers/mentor-path-sample.mjs` 换成新几何的测试；`src/ui/bitmap.jsx` 的 `SPRITES.pine` 换成 V11 的短松树（只有培养路径在用）。② 编辑界面：添加带教对象（姓名、岗位、入职日、日志链接可空、方案）、调整安排（入职日、各段起止日期，后面默认顺延可取消，安排与产出文字）、记录进度（评审段分数 + 结论 + 日期 + 备注，其余段确认完成，可撤销），都走 `useWriteFlow` 预览 → 确认 → 回读；名单里有人但没有路径（或旧版）时给「按方案生成路径」（需要再加一组 `/:name/generate` 路由接 `importPreview/importConfirm`）。③ 更新 `docs/API.md`「带教 · 培养路径」节、`REQUIREMENTS.md` 带教一行、`docs/STYLE-GUIDE.md` 培养路径版面条目（V7 → V11）。④ 隔离 5290 实看（正式库副本 + 假 lark-cli，做法见上一节），全量测试、样式检查、构建。⑤ 真实导入：`npm run import:mentor-path -- 林瑶 --start 2026-05-12` 与胡贵兰同样，先给用户看预览，同意后加 `--confirm`；两人工作台里没有任何评审记录，导入后都会停在 P1 超期，问用户是否补录过往进度。⑥ 上一节「统一表头」和 V10 / V11 设计稿也还没提交，用户还没答复提交方式。节假日表只有 2026，2027 年通知出来后要补。
- 本轮新坑：无。

## 带教「培养路径」页头和「带教答疑」统一（2026-10-26，Claude，用户嫌从带教答疑切到培养路径时表头突变，同意按「三批」先做第 1 批统一表头；未提交、未发布）

- 时间：开工 `2026-10-26 16:07`（`date '+%F %H:%M'` 记录）。来由：培养路径用自己的 `.m7-head`（20px 标题、黑底反白分段页签、下划线式管培生选择，绝对定位叠在地图上），切页签时标题左上偏 8 / 10px、字号 22→20，页签、管培生选择整体换样式和位置。同一会话里先出了视觉收敛样稿 V10、V11（`docs/design-drafts/mentor-path/v10.html`、`v11.html`，用户定稿 V11 的细节程度），那是第 3 批的依据，本轮正式页只动表头。
- 改了哪些文件：`src/modules/projects/MentorPath.jsx`（`PathPage`：页头改用 `PageHeader` + `Tabs`（带页签说明）+ `.toolbar` 里的 `.person-tabs`（名字 + 「管培生 · 第 N 周」，没有路径的人按钮置灰），关键数字 `Kpis` 放在管培生选择右边；页头和地图包进 `.m7-flow`，地图放进 `.m7-body`；营地日志抽屉留在 `.m7-flow` 外）；`src/styles/95-mentor-path.css`（删掉 `.m7-head`、`.m7-crumb`、`.m7-tabs`、`.m7-people` 四组只给旧页头用的样式；加 `.m7-flow`、`.m7-top`（留白照 `.main`）、`.m7-body`（白底 + 上边 2px 线，最少 560 高）、`.person-tabs button:disabled`；`.m7` 最小高 640→560；`.m7-page` 去掉白底）；`docs/STYLE-GUIDE.md`（「带教 · 培养路径」版面一条改成页头与带教答疑同一套）。地图本身的坐标、颜色、标牌、本周攀登卡、营地日志都没改。
- 测试：`npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`，`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过（`npm-test-1.log`、`check-style-1.log`、`build-3.log`）。工作区含他人未提交改动（`.claude/launch.json`（本轮临时加过一条 `work-desk-iso-mentor` 隔离配置，用完已删）、`CURRENT.md` 一行、`docs/LESSONS.md` 提升标注，L-07；状态见 `git-status-before-test.txt`）。证据目录 `~/Library/Application Support/NiumaHome/evidence/带教表头统一-20261026/`。
- 验证：隔离 5290（正式库 `sqlite3 .backup` 副本 + 假 `lark-cli`，首页待办、月历、日历三个接口因此 502，与带教无关）。1440×900 量两个页签：标题 `(240, 96)`、页签 `(240, 146)`、页签说明 `(240, 202)`、管培生选择 `(240, 237)` 完全一致（改前培养路径标题在 `(232, 86)`、20px）；页签行宽差 11px 是带教答疑页有竖向滚动条，不是位移。地图在 1440×900 下高 577、不出竖向滚动，打开仍滚到今天；1280×800 下整页可竖滚，滚到底能看到地平线；切到胡贵兰、点标牌打开营地日志（抽屉仍贴满右侧整高）都正常。颜色核对（L-01）：页头沿用带教答疑的配色（选中管培生墨底白字、页签白底灰线），地图配色未动，只多了页头和地图之间一条 2px 灰线。
- 截图：`docs/handoff/带教表头统一-20261026/` 下 `改前-正式5280-答疑.png`、`改前-正式5280-培养路径.png`、`改后-隔离5290-答疑.png`、`改后-隔离5290-培养路径.png`、`改后-隔离5290-培养路径-1280x800.png`、`改后-隔离5290-培养路径-1280x800-滚到底.png`、`改后-隔离5290-培养路径-胡贵兰-营地日志.png`（不入库）。
- 发布与回读：未发布。
- 与授权不一致 / 遗留 / 范围外发现：① 页头占了约 220px，地图从整屏变成页头下面一块，800 高的窗口要整页竖滚才能看到地平线；第 3 批把地图收进卡片（V11）后整页自然滚动，这个限制会消失。② 第 2 批（按飞书 V2.4 接真实排期）待用户答：两人真实入职日、是否跳过法定节假日、阶段十按 D65 还是 D70；另外 `docs/培养路径/管培生培养路径.md` 本地副本已比飞书原文旧（阶段八改名「师资侧实地轮岗」等），附录 F 的 B1–B7 / A1–A7 拆法与正文对不上，不能直接导入。③ 设计稿 `v10.html`、`v11.html` 与 `shots/v10*.png`、`v11*.png` 未提交。
- 本轮新坑：无。

## 业务页占比面积块：每块都写名字，去掉块下名单（2026-10-24，Claude，用户看正式页截图后要求「不许在块下写没写名字的，必须写进块里，写不下用很小的字」；已提交 `b915042`，已发布 `nm-20261024-113328-b915042` 回读通过）

- 时间：开工 `2026-10-24 11:15`（收到需求时没跑 `date`，按会话时间回填；`11:21` 起跑测试时用 `date '+%F %H:%M'` 记录，`11:25` 写交接）。来由：小块原来只写占比或什么都不写，名字挪到块下「块里没写名字的：…」一行；名字略长的中块用省略号截断（申诉「非常规撤…」）。
- 改了哪些文件：`src/modules/business/BusinessCharts.jsx`（`Treemap`：删掉块下名单与「只写占比」档；放不下「名称 + 占比」的小块走新的 `is-tiny` 档，名字可换行，字号从 11px 往下试到 7px，先保名字 + 占比、再只保名字，占比放不下宽度就不写；「其他 N 项」整签按实际宽度判断，放不下也走小字签；放得下的判断算上块缝 2px 与左右留白，名字按九成宽度估算排行；新增 `charWidth`、`lineCount`、`fitTiny`）；`business-charts.css`（`.bc-tile b` 去掉省略号改为换行；去掉 `.bc-tm-rest`；加 `.is-tiny` 收紧留白）；`docs/STYLE-GUIDE.md`（「占比面积块」一条改写：名字一律写在块里，7–10px 只限这里的小块，是字号刻度的例外）。大字规则（前两块 14 / 18）、颜色、网点「其他」不变。
- 测试：`npm test` 原样结果 `ℹ tests 742` / `ℹ pass 742` / `ℹ fail 0`（最后一次改完后重跑），`npm run check:style` 输出「样式检查通过」，`npm run build` 通过，`git diff --check` 通过（`npm-test-tiny-2.log`、`build-tiny-4.log`）。工作区含他人未提交改动（`.claude/launch.json`、`CURRENT.md` 一行、`docs/LESSONS.md` 的 L-01 至 L-12 提升标注，L-07）。
- 验证：隔离 5290（正式库 `sqlite3 .backup` 副本 + 假 `lark-cli`，日志 `server-5290-5.log`，看完已停）。内置浏览器真实点击切换业务线，1440 与 1280 两种宽度 × 大学 / 国课 / 申诉，逐块查「有名字、名字与占比不超出块边」：6 种组合每次 20 块全有名字、0 处溢出，页面不再出现「块里没写名字的」。第一版截图发现三处问题已改掉：「其他 31 项」整签在 1280 宽被截、最窄块的占比放不下、扁块「安心学MAX全款」折行后下半截被裁、「非常规撤课」1440 宽仍被省略号截断。
- 截图：`docs/handoff/折线图数值与悬停-20261024/` 下 `改后-隔离5290-面积块全写进块-<业务线>-<1440|1280>.png` 共 6 张（png 被 .gitignore 忽略，只在本地）。
- 提交（用户同意）：`b915042`，只含 `BusinessCharts.jsx`、`business-charts.css`、`docs/STYLE-GUIDE.md` 与 `CURRENT.md` 本节（CURRENT 用 `git show HEAD:CURRENT.md` 加本节生成 blob 写暂存区，别人的改动没带，L-07）。
- 发布（用户同意，`2026-10-24 11:33:27` 开始）：发布前只读核对正式库没有 `kb-write-lock`、`kb-operation` 11 条 verified / 2 条 aborted；主工作区 `main` 从 `705f459` 快进到 `b915042`；`GIT_CONFIG_*` 只对这次忽略他人未跟踪文件跑 `release-app.sh`，退出码 0，切到 `nm-20261024-113328-b915042`，自动备份 `backups/work-desk-20261024-113329-before-nm-20261024-113328-b915042.db`，保留策略清理 2 项（快照 `nm-20261024-011154-fcac8c6`、备份 `work-desk-20261023-201728-before-nm-20261023-201727-64a1f6c.db`）。日志 `release-5.log`。
- 回读：脚本末尾自动回读 7 项全 ✓（进程 36021、153 个源码文件与 `b915042` 一致、版本号已写进构建）；`NIUMA_SMOKE=1 bash scripts/verify-release.sh` → 7 项 ✓ + 冒烟原样结果 `24 项，0 项有问题` → `回读通过：nm-20261024-113328-b915042`（`verify-smoke-5.log`，冒烟截图 `smoke-nm-20261024-113328-b915042/`）。正式 5280 在内置浏览器真实点击切换业务线，用同一段逐块检查跑 1440 / 1280 × 大学 / 国课 / 申诉：6 种组合每次 20 块全有名字、0 处溢出、无块下名单；调试协议截图 `发布后-正式5280-面积块全写进块-<业务线>-<1440|1280>.png` 6 张（同目录，只在本地）。
- 回滚：`bash scripts/release-app.sh --use nm-20261024-103421-c261bd6`。
- 与授权不一致 / 遗留：极窄的块（如大学 SKU 1280 宽下「安心学MAX全款」约 20px 宽）名字会一两个字一行竖着排，字号 7–8px，能看清但不好看；要更好看只能改排布（例如把这类块并进「其他」），本轮没动。
- 本轮新坑：无。

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
- 提交：本提交只含 `AGENTS.md`、`CURRENT.md`、`docs/OPERATIONS.md`、`docs/templates/handoff.md` 4 个文件。`docs/LESSONS.md` 的 4 处改动在提交前被另一会话整文件提交的 `359ac18`（修 verify-release.sh、加 L-12）顺带带进仓库，内容与本轮预期一致（已核对），所以不在本提交里——同目录共用工作树的 L-07 情形，不算新坑。 提交 `8dd5d28`（`2026-10-24 00:30`，用 `git show HEAD:<file>` 加本轮改动生成 blob 写暂存区，`git diff --cached` 核对恰好 4 个文件、CURRENT 只增不删后 `git commit`，工作树里别人的 CURRENT.md 改动没带上）；主工作区 `main` 从 `359ac18` 快进到 `8dd5d28`（`main..ui-v4` 快进前只有这一个提交）。
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
