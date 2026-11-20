# 词汇表与代码地图

第一次读这个项目，先看这一页。它解决两件事：同一个词在不同地方指什么，以及某个页面对应哪些文件。和代码对不上时以代码为准，并顺手改这页。

## 一、容易读错的词

| 词 | 在这里指什么 | 不是什么 |
|---|---|---|
| `v3` | 2026-10 第三轮界面改版的批次号。出现在接口路径 `/api/v3/…`、表名 `v3_documents`、文件名 `v3-common.mjs`、测试名 `v3-*.test.mjs` 里 | 不是接口版本。没有 `v3` 前缀的老接口（`/api/plans`、`/api/promos`、`/api/materials`、`/api/reports`）仍在用，不是废弃接口 |
| 策略（strategy） | 代码里有三样：① 月度用户策略 v2（`strategy-service.mjs`，接口 `/api/v3/strategy-v2`，现在页面用的）；② 月度用户策略 v1（`user-strategy.mjs`，接口 `/api/v3/user-strategy`，v2 没有正式版本的月份才显示）；③ 单条需求下的策略（`needs.mjs`，接口 `/api/v3/needs/:id/strategy`，页面入口 2026-10 已去掉） | v2 的校验、迁移仍引用 v1 的函数（`units`、`strategyWindow`），v1 不能直接删 |
| Agent | 页面上的「Agent」页是聊天助手，代码里叫 assistants（`routes/assistants.mjs`、`codex.mjs`、`chatgpt-bridge.mjs`）。服务端文件名里的 agent（`routes/agent.mjs`、`agent-access.mjs`、`agent-tools.mjs`）指外部 AI 经 workdesk MCP 连进来 | 两者没有关系 |
| Voice | 「留学之声」：外部学生讨论的汇总（`voice.mjs`，接口 `/api/v3/voice`），来源没接通时显示模拟数据 | 「内部原声」是另一件事：公司企微会话存档的只读拉取（`internal-voice.mjs`），目前没有页面 |
| 自言自语（selftalk） | 常浩和猛鬼兽的飞书私聊记录，可标成待办或需求，可做周汇总 | 不属于 Voice |
| 需求（needs） | 从时间线推导、或手写的「主线需求」。后端和接口还在，页面入口已去掉 | |
| 方案（plans）/ 促销表（promos） | 营销页「月度促销」：粘贴的方案原文（plans）和解析出的逐 SKU 促销行（promos） | 不是「价格方案」。价格方案在「价格档案」页签，存储 kind 是 `price-schemes` |
| 营销战役（campaign） | 页面上放在「项目」页的页签里；服务端和营销的价格、Brief 放在同一个路由文件 `routes/v3-marketing.mjs` | |
| 交付月（delivery） | 首页那一行四个环节：价格方案、物料、Brief、营销战役（`routes/delivery.mjs`，接口 `/api/v3/months/:month`） | |
| 示例 / 演示 | 页面上的「示例」标识来自后端的演示口径：数据里带 `origin: "demo"`（价格、营收） | 早期「接口回 501 就显示前端自带示例」的机制已退役 |
| 亚古兽 | 默认的飞书应用身份（读写飞书都用它）；另指带教页回答提问的 AI 人设（`docs/亚古兽/`） | |
| 猛鬼兽 | 另一个飞书应用身份，只用于读自言自语的私聊和推送 Codex 重置提醒 | 两个身份只在 `server/lark-identity.mjs` 定义 |
| digiworld | 另一个项目「数码世界」。这里只读它的收藏数据，用来导入设计参考（`server/digiworld.mjs`），不调它的接口、不写它的文件 | |
| T01 … T14、V3-6 | 旧派单编号，正文在 `docs/tasks/`。代码注释和测试名（`t10-*`、`t12-*`）里会出现 | 新活不再开派单，开 GitHub issue |
| `#30` 这类编号 | GitHub issue 或 PR 号，`gh issue view 30` 能查 | |
| 预览 → 确认 → 回读 | 写操作的固定流程：先 `…/preview` 拿到 `previewId` 和将要写入的内容，再带 `previewId` 确认，写完重新读一次核对 | 老写接口（方案、物料、助手）是另一套：请求头带请求编号和版本号的直接保存（`legacy-writes.mjs`） |
| 快照（snapshot） | 两种：① `v3_snapshots` 表里外部来源最近一次成功读取的结果；② 发布用的代码快照目录（`releases/nm-<时间>-<提交号>`） | |
| kind | `v3_documents` / `v3_snapshots` 两张通用表里区分记录种类的字符串，全部登记在 `server/storage-kinds.mjs` | |

## 二、从页面找到代码

接口全部在 `server/app-routes.mjs` 装配，每个路由组一行。下表的服务文件都在 `server/`，页面文件都在 `src/modules/`。

| 侧栏 | 页签 | 页面目录 | 路由文件 | 主要服务文件 | 数据存哪 |
|---|---|---|---|---|---|
| 首页 | | `home/` | `routes/workspace.mjs`、`routes/delivery.mjs` | `home-todo.mjs`、`calendar.mjs`、`codex-reset.mjs` | 只读汇总，不单独存 |
| 策略 | 用户时间 | `user/` | `routes/user.mjs` | `timeline*.mjs` | 快照 `timeline`；裁定 `timeline-ruling` |
| 策略 | 用户策略 | `user/` | `routes/user.mjs` | v2：`strategy-*.mjs`；v1：`user-strategy.mjs` | v2：表 `strategy_revisions`、`strategy_submissions`，`strategy-bizcard`；v1：`user-strategy` |
| 策略 | 促销打法 | `user/` | 无（内容在前端 `playbook*.js`） | | 不存库 |
| 营销 | 月度促销 | `marketing/` | `routes/marketing.mjs` | `plan-parser.mjs`、`db.mjs` | 表 `plans`、`promos`、`sku_aliases` |
| 营销 | 价格档案 | `marketing/` | `routes/v3-marketing.mjs` | `price.mjs` | `price-schemes` |
| 营销 | 物料沉淀 | `marketing/` | `routes/materials.mjs`、`routes/nas.mjs`、`routes/references.mjs` | `nas-materials.mjs`、`references.mjs` | 表 `materials`、`material_images`；快照 `nas`；`refs`、`design-refs` |
| 营销 | 设计 Brief | `marketing/` | `routes/v3-marketing.mjs` | `briefs.mjs`、`brief-*.mjs` | `brief`、`brief-attachment`、`brief-feishu-link` |
| Voice | | `voice/` | `routes/workspace.mjs` | `voice.mjs` | 不存库（读外部快照文件） |
| 项目 | 项目推进 | `projects/` | `routes/projects.mjs` | `projects.mjs` | 快照 `projects`；`project-state`、`local-project` |
| 项目 | 营销战役 | `projects/`（视图在 `marketing/CampaignView.jsx`） | `routes/v3-marketing.mjs` | `campaigns.mjs` | `campaign`、`campaign-archive` |
| 带教 | 带教答疑、培养路径 | `projects/`（`MentorPage`、`MentorPath*.jsx`） | `routes/mentor.mjs` | `mentor.mjs`、`mentor-path.mjs`、`mentor-plans.mjs` | 快照 `mentor`；`mentor-*` |
| 品牌 | | `brand/` | `routes/brand.mjs` | `brand.mjs` | 快照 `brand` |
| 业务 | | `business/` | `routes/workspace.mjs` | `revenue.mjs`、`business-charts.mjs` | 快照 `revenue`、`business-charts-v1` |
| Agent | | `assistants/` | `routes/assistants.mjs`、`routes/assistant-knowledge.mjs` | `codex.mjs`、`chatgpt-bridge.mjs`、`assistant-*.mjs` | 表 `assistants`；`assistant-knowledge:<编号>`、`assistant-conversation:<编号>` |
| 日/周报 | | `reports/` | `routes/workspace.mjs` | `reports.mjs`、`report-parser.mjs` | 快照 `reports:<文档地址>` |
| 飞书知识库 | | `kb/` | `routes/kb.mjs` | `knowledge-tree.mjs`、`kb-collect*.mjs` | 快照 `kb`；`kb-*` |
| 设置 | | `settings/` | `routes/workspace.mjs` | `v3-settings.mjs`、`ai-executor.mjs` | 表 `settings` |
| 顶栏 | 自言自语 | `selftalk/` | `routes/selftalk.mjs` | `selftalk.mjs` | 快照 `selftalk`；`selftalk-*` |

没有页面的部分：

| 功能 | 路由文件 | 服务文件 | 数据存哪 |
|---|---|---|---|
| 外部 AI 经 MCP 读写（workdesk MCP） | `routes/agent.mjs` | `mcp-workdesk.mjs`、`agent-access.mjs`、`agent-tools.mjs` | 表 `agent_access`、`agent_calls` |
| 内部原声（企微会话存档拉取） | `routes/internal-voice.mjs` | `internal-voice.mjs` | 表 `chat_conversations`、`chat_messages`、`chat_pull_runs` |
| Codex 重置提醒推送 | `routes/workspace.mjs` | `codex-push.mjs`、`codex-reset.mjs` | 表 `codex_push`；`codex-push` |
| Chrome 收藏插件 | `routes/kb.mjs`（`/api/v3/kb/collect*`） | `kb-collect*.mjs` | `kb-operation`、`kb-collect-pairing` |

## 三、几条贯穿全项目的机制

| 机制 | 在哪 | 一句话 |
|---|---|---|
| 路由 | `server/http.mjs`、`server/app-routes.mjs` | `route(方法, 路径, 处理函数)`；按注册顺序取第一个匹配；没匹配上的 `/api/v3/*` 回 501，其余 404 |
| 路由包装 | `server/http.mjs` 的 `respond`、`readBody`、`failure` | 返回值写成 200；`throw failure(状态码, 文案)` 原样回给页面 |
| 通用存储 | `server/local-records.mjs` | `getRecord` / `putRecord` / `listRecords` 读写 `v3_documents`；`createLocalChanges` 是它上面的「预览 → 确认」 |
| 外部来源读取 | `server/projects.mjs` 的 `createConfiguredReader` | 读飞书等外部来源，成功结果存 `v3_snapshots`，重启后先用旧结果 |
| 飞书访问 | `server/lark-identity.mjs` 的 `larkRun` | 一律经本机 `lark-cli`，每次调用记一行日志 |
| AI 调用 | `server/ai-executor.mjs` | 执行方（Codex / Claude）可在设置里切换，每次调用留痕 |
| 前端读写 | `src/api.js`、`src/ui/write-flow.jsx` | `useApi` 读；`useWriteFlow` + `WriteBox` 走「预览 → 确认 → 回读」 |
| 测试替身 | 各 `create…Service(db, options)` 的第二个参数 | 测试通过 `options` 换掉外部读取（假的 lark-cli、假时钟） |
