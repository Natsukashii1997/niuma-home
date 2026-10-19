# 接口约定

全部为 JSON；出错返回 `{ error: "中文说明" }` 与相应状态码；未实现返回 501 `{ error, task }`。
字段名用 camelCase；月份 `YYYY-MM`；业务线取值：大学辅导 / 国际课程 / 申诉服务（促销表和方案只有大学辅导 / 国际课程，2026-10-19 起）。

## 营销 · 促销表（已实现）

`GET /api/promos` → `Promo[]`，按月份倒序

```ts
type Promo = { month: string; line: string; sku: string; trial: string; price: string; newDeal: string; renewal: string;
  special: string;                  // 特殊活动：该 SKU 下不属于试听/正价/新签活动/续费活动的条目，没有为「无」
  updatedAt: string };
```

固定 SKU（`server/plan-parser.mjs` 的 `PROMO_SKUS`）：大学辅导 = 灵活学Lite、安心学Max、学考无忧Pass、补考护航Pass、选课指导、论文稳Pass、先修班课；国际课程 = 灵活学Lite、安心学Max。「课时卡」两条线都记作灵活学Lite。

## 营销 · 方案（T01）

- `GET /api/plans` → `{ month, line, special, savedAt }[]`（已实现）；`special` 是该 业务线×月份 的整月特殊活动，没有为「无」
- `GET /api/plans/:month/:line` → `{ month, line, rawText, rawHtml, special, savedAt }`；无则 404（已实现）
- `POST /api/plans/parse` 请求 `{ month, line, rawText }` → `ParseResult`；只解析，不写库

```ts
type ParseResult = {
  line: string | null;              // 从【…板块】识别出的业务线；与请求不一致时前端提示
  rows: Array<{
    sku: string;                    // 已按 sku_aliases 换成库中名称
    alias?: string;                 // 原文写法（发生别名替换时）
    trial: string; price: string; newDeal: string; renewal: string; special: string;
    status: "new" | "changed" | "same";   // 对比库中「同月同业务线」已有行；若本月无数据则对比上一个有数据的月份
    changed?: Array<"trial" | "price" | "newDeal" | "renewal" | "special">;
    previous?: Partial<Promo>;      // 对比对象，用于悬停显示旧值
  }>;                              // 按固定 SKU 清单排序；原文没提到的 SKU 也有一行，各栏「无」
  special: string;                  // 整月特殊活动：不是固定 SKU 的编号块（如「双11活动」）连同子项原文，多块空行分隔；没有为「无」
  removed: string[];                // 库中该 月份×业务线 有、本次原文没有的 SKU（确认后将删除）
  unrecognized: Array<{ lineNo: number; text: string }>;
};
```

- 解析规则：标题行（编号行，或不带列表符号、不带冒号的单独一行）是固定 SKU（「A/B」合写拆成两行、字段相同）→ SKU 块；SKU 下「试听/正价/新签活动/续费活动：」进对应栏（也认「新签：」「续费（新价格用户）：」「学科正价：」这类变体，变体的标签留在值里，同栏多条换行连接），其他「标签：内容」进该 SKU 的 `special`；不是固定 SKU 的编号行、或空行后的单独一行开一个整月特殊活动块，块里各行（含新签、续费）原样进整月 `special`，但块里出现试听或正价时视为清单外 SKU，记未识别。
- 前端：解析出的业务线和当前选中的不同时，带着原文自动切到那条业务线重新解析。
- `PUT /api/plans/:month/:line` 请求 `{ rawText, rawHtml?, rows, special }`（rows、special 为本人确认后的解析结果，须与原文重新解析一致）→ `{ inserted, updated, removed }`
  - 单事务：保存原文；按 rows 覆盖该 月份×业务线 的促销行（不在 rows 内的删除）。

## 营销 · 物料（T03）

```ts
type Material = { id: number; month: string; line: string; name: string; type: string; skus: string[]; note: string; images: Array<{ id: number; url: string }>; createdAt: string };
```

- `GET /api/materials?month=&line=&type=` → `Material[]`
- `POST /api/materials` 请求 `{ month, line, name, type, skus?, note? }` → `Material`
- `PATCH /api/materials/:id` → `Material`
- `DELETE /api/materials/:id` → `{ ok: true }`（同时删除图片文件）
- `POST /api/materials/:id/images` 请求体为图片二进制，`content-type: image/*`，可选 `?name=` → `{ id, url }`
- `DELETE /api/materials/:id/images/:imageId` → `{ ok: true }`
- `GET /api/images/:file` → 图片文件（只允许 data/images 下的文件名）

## 助手（T04）

```ts
type Assistant = { id: number; name: string; kind: "copywriter" | "imported" | "custom"; instructions: string; codexThreadId: string | null; createdAt: string;
  model: string | null; effort: string | null;   // T08 新增；null = 跟随 Codex 默认配置（不把解析出的默认值写进数据库）
  preset: "copywriter" | "interview" | "performance" | "notice" | null };   // 2026-10-18：预设助手（文案 / 面试 / 绩效 / 通知），启动时只补缺，说明为空才填初稿
type CodexModel = { id: string; model: string; displayName: string; description: string; isDefault: boolean;
  defaultEffort: string; efforts: Array<{ value: string; description: string }> };   // T08，来自 app-server model/list，不含隐藏模型
type Message = { role: "user" | "assistant"; text: string; at?: string };
```

- `GET /api/assistants` → `Assistant[]`（已实现）
- `POST /api/assistants` 请求 `{ name, instructions }` → `Assistant`（kind = custom）
- `PATCH /api/assistants/:id` 请求 `{ name?, instructions?, model?, effort? }` → `Assistant`
  - T08：`model` / `effort` 可传 `null` 恢复默认；`model` 须在模型列表中，`effort` 须为该模型支持的强度；`model` 为 `null` 时 `effort` 也须为 `null`；助手回复中返回 409。
- `GET /api/assistants/:id/messages` → `Message[]`（从 Codex 会话读取历史）
- `POST /api/assistants/:id/messages` 请求 `{ text }` → 流式返回（`text/event-stream`，事件 `delta` / `done` / `error`）
- `GET /api/codex/sessions` → `{ threadId, name, updatedAt, cwd }[]`（本机 Codex 会话，已导入的标 `imported: true`）
- `POST /api/assistants/import` 请求 `{ threadIds: string[] }` → `Assistant[]`
- `GET /api/codex/models` → `CodexModel[]`（T08，缓存 10 分钟；读取失败返回错误，不返回空数组）
- `GET /api/assistants/:id/runtime` → `{ model: string, effort: string | null } | null`（T08，当前会话实际生效值，取自 `thread/resume`；无会话时为 `null`）
- 发送消息（T08 规则，2026-10-15 校准）：每轮向 `turn/start` 显式传入解析后的 `model` 与 `effort`。`model` 为 `null` 时，用 `config/read`（`includeLayers: false`，不传 `cwd`，排除项目配置层）只读解析非项目有效配置；配置未指定模型时取 `CodexModel.isDefault`；强度为空时取对应模型的 `defaultEffort`（显式选了模型、强度为空时同样如此）。默认值读取失败、模型不可用或强度不受支持时，以 SSE `error` 事件返回原因，且不发起 `turn/start`。
- 页面上保存值（`Assistant.model / effort`）与生效值（runtime）分开显示；保存后不提前宣称已生效。

## 首页 · 日报周报 · 日历 · 配置

- `GET /api/calendar/today` → `{ time, title, place }[]`（T06）
- `GET /api/settings` → `Record<string, string>`（已实现；未配置或已清空的键不出现）
- `POST /api/settings/:key/preview` 请求 `{ value }` → `{ previewId, expiresAt, key, before, value }`（V3 键已实现；下列旧四键由 T11-1 接入，同一形状，`before` 为当前值或 `null`）
- `PUT /api/settings/:key` 请求 `{ previewId, confirm: true }` → `{ key, value }`。预览 10 分钟有效；旧值已变返回 409，预览失效返回 409；同一令牌重复确认返回同一回执，不重复写入；事务内写入并回读一致才返回成功。
  - **T11-1 起，旧四键也只接受令牌确认**；直接 `{ value }` 返回 400（`请先预览配置，再确认保存`）且不写库。T07 原「请求 `{ value }` 直接保存」作废，前端由 Claude 同步改为预览 → 确认 → 回读。

配置键：`brand_base_url`、`report_doc_url`、`material_types`（JSON 字符串数组）、`weekly_doc_url`（T05B，可选）。
`weekly_doc_url` 是唯一允许空值的键：`value` 为空字符串表示清空，删除该行，返回 `{ key, value: "" }`。其余键空值仍返回 400。
链接校验：`report_doc_url` 保存时沿用 T07 原规则（HTTPS 飞书域名，不限路径），读取时才要求是 `/docx/<token>` 或 `/wiki/<token>`；`weekly_doc_url` 保存和读取都要求 HTTPS 飞书 `/docx/<token>` 或 `/wiki/<token>`，不含账号、端口、空白（2026-10-14 校准，见 docs/handoff/T05B/合同冲突核查.md）。

### 日报周报（T05，T05B 补充）

```ts
type Report = {
  id: string; kind: "日报" | "周报"; date: string; title: string; body: string;
  // T05B 新增，均为可选，旧调用方可忽略：
  source?: "daily" | "weekly";       // 来自哪个来源角色；单文档模式均为 "daily"
  startDate?: string; endDate?: string; // 日期范围（周报）；date = startDate
  week?: number; weekYear?: number;  // 「第N周 YYYY.W」中的 N 与 YYYY
  warnings?: string[];               // 周次与日期不一致等提示，仍收录
};
type ReportSource = {
  role: "daily" | "weekly"; url: string; ok: boolean;
  count: number;                     // 本来源收录篇数
  ignored: number;                   // 双来源模式下不属于本角色而未收录的篇数
  unrecognized: Array<{ lineNo: number; title: string }>;
  fetchedAt?: string; status?: number; error?: string; // 失败时给出 status 与 error
};
```

- `GET /api/reports` → `Report[]`，按 `date` 倒序，同日先日报后周报。**兼容旧调用**：任一已配置来源失败时整体返回错误，不返回部分结果。
- `GET /api/reports?withSources=1` → `{ reports: Report[], sources: ReportSource[] }`（T05B）。
  - 部分来源失败：200，`reports` 只含成功来源，失败来源在 `sources` 中 `ok: false`。
  - 全部失败：返回日报来源的错误状态码，body 为 `{ error, sources }`。
  - 理由：双来源后需要表达「部分成功」，数组形状无法表达；用查询参数新增形状，旧路径与旧形状不变。
- `refresh=1` 可与上述两种调用组合：重读全部已配置来源（同一链接只读一次）。
- `GET /api/reports/:id` → 单篇。ID 以 `w-` 开头时属于周报来源，否则属于日报来源（单文档模式下全部属于日报来源）。所属来源读取失败时返回该来源的错误，不返回 404。
- `POST /api/reports/source-preview` 请求 `{ role: "daily" | "weekly", url }` → `{ url, sameAsDaily: boolean, count, latest?: { title, date }, unrecognized }`。只读试读，不写库、不影响缓存。读取失败时返回相应错误状态码与 `{ error }`。

读取模式与链接比较：两条链接规范化后（`URL` 解析，主机名小写，去掉查询参数、`#` 及末尾 `/`）相同，或未配置 `weekly_doc_url`，为**单文档模式**：只读日报文档，日报周报都从中识别。否则为**双来源模式**：每个来源只收录本角色的篇目。

ID：日报来源及单文档模式沿用 T05 算法（无前缀）；周报来源为 `w-` + `sha256("周报|" + date + "|" + title)` 前 20 位 + `-` + 同键序号。合并后有重复 ID 时返回 500。

缓存：按规范化链接分别缓存 10 分钟；链接变更或清空只作废该来源的缓存；读取失败作废该来源的缓存，下次请求重试，不返回旧内容。

## 本地项目与历史战役 · 删除与恢复（T10-B2，软删除）

来源：`docs/handoff/T10/删除接口约定.md`（Codex 实现，Claude 2026-10-18 收入本文件）。只允许操作本机创建的项目（`local-project`）和本机历史战役归档；飞书来源、当前战役一律拒绝。软删除只写生命周期记录，原内容全文保留，可恢复。

| 对象 | 方法与地址 | 用途 |
|---|---|---|
| 本地项目 | `GET /api/v3/local-projects` | `{ items }`，只列未删除本地项目 |
| 本地项目 | `GET /api/v3/local-projects?deleted=true` | `{ items }`，已删除对象，每项带 `deletion` |
| 本地项目 | `POST /api/v3/local-projects/:id/remove-preview` | 请求 `{}`，返回删除预览 |
| 本地项目 | `DELETE /api/v3/local-projects/:id` | 请求 `{ previewId, confirm: true }` |
| 本地项目 | `POST /api/v3/local-projects/:id/restore-preview` | 请求 `{}`，返回恢复预览 |
| 本地项目 | `POST /api/v3/local-projects/:id/restore` | 请求 `{ previewId, confirm: true }` |
| 历史战役 | `GET /api/v3/campaigns/history` | 既有 `{ items }`，默认隐藏已删除 |
| 历史战役 | `GET /api/v3/campaigns/history?deleted=true` | 已删除归档，每项带 `deletion` |
| 历史战役 | `POST /api/v3/campaigns/history/:id/remove-preview` | 请求 `{}` |
| 历史战役 | `DELETE /api/v3/campaigns/history/:id` | 请求 `{ previewId, confirm: true }` |
| 历史战役 | `POST /api/v3/campaigns/history/:id/restore-preview` | 请求 `{}` |
| 历史战役 | `POST /api/v3/campaigns/history/:id/restore` | 请求 `{ previewId, confirm: true }` |

- 预览 → `{ previewId, expiresAt, action, kind, id, before, value }`，`value` 是将被操作的完整当前对象；有效期 10 分钟。
- 确认 → `{ ok: true, id, kind, action, deleted, revision, at }`；单事务写入并回读一致才返回。同一令牌重复确认返回原回执。前端确认后**必须重新读取默认列表和 `deleted=true` 列表**核对对象位置，不以回执代替回读。
- `/api/v3/projects` 默认隐藏已删除本地项目。恢复只恢复原 ID；项目恢复遇同名或同 ID 冲突拒绝，历史战役允许不同 ID 同名。
- 错误体 `{ error, code }`：

| HTTP / code | 含义 |
|---|---|
| `400 LOCAL_DELETE_INPUT_INVALID` | 请求体不合约 |
| `403 LOCAL_SOURCE_REQUIRED` | 非本地对象、飞书记录或来源含糊 |
| `409 LOCAL_SOURCE_CONFLICT` | 本地与已知飞书来源同 ID 冲突 |
| `404 LOCAL_OBJECT_NOT_FOUND` | 对象不存在 |
| `409 LOCAL_OBJECT_DELETED` | 已删除对象不能再编辑或再次删除 |
| `409 LOCAL_OBJECT_NOT_DELETED` | 对象未删除，不能恢复 |
| `409 LOCAL_DELETE_PREVIEW_STALE` | 预览过期、对象/动作不符或期间内容/生命周期变化 |
| `409 LOCAL_RESTORE_CONFLICT` | 恢复内容变化或项目名称冲突 |
| `409 CAMPAIGN_CURRENT_PROTECTED` | 当前战役不能经历史删除路径操作 |
| `409 CAMPAIGN_ARCHIVED` | 已归档战役不能由旧编辑令牌重建为当前战役 |
| `500 LOCAL_DELETE_READBACK_FAILED` | 写后回读不一致，不能宣称成功 |

## 营销 · 价格记录（2026-10-18 改为固定 4 张表）

- `GET /api/v3/price/skus` → `[{ id, line, name, label, unitOrig, tiers, origin }]`，固定 4 张，顺序即页签顺序：`uni-lite` 大学辅导·灵活学Lite、`uni-max` 大学辅导·安心学Max、`intl-lite` 国际课程·灵活学Lite（`label` 为「课时卡」）、`intl-comp` 国际课程·竞赛课时卡。不再读飞书 SKU 表（设置里的 `price_sku_table_id` 价格页已不用）。`origin`：`local` 已保存、`demo` 演示矩阵（两张 Lite，`fixtures/v3-demo-price.json`）、`empty` 还没有价格（`unitOrig: null`，档位 5–200h）。SKU 档案按 `line + name` 匹配。
- `GET /api/v3/price/schemes?sku=` → `{ sku, floorMargin, costPerHour, schemes, origin }`；空表返回 `schemes: []`、`origin: "empty"`，不报错。
- `POST /api/v3/price/schemes/preview?sku=` body `{ unitOrig, tiers, schemes }` → 预览；`PUT /api/v3/price/schemes?sku=` body `{ previewId, confirm: true }` → 写入，页面再回读核对。整张矩阵一起保存：页面里新增、插入、删除方案都只改草稿。必须填满才能保存：原价为空、任一方案有空格（`null`）或一个方案都没有时返回 400，空格的报错写明方案名和缺几档。

## 机械邪龙兽推送 · Codex 重置（2026-10-19）

- 开关是 V3 配置键 `codex_push_enabled`：`"0"` 关（默认）/ `"1"` 开，走上面的预览 → 确认 → 回读；其他值返回 400。
- `GET /api/v3/codex-push` → `{ enabled, interval, sender, recipient, enabledSince, lastCheck: { at, error } | null, nextCheck, baseline, lastPush: { eventId, status, stage, summary, attempts, error, at } | null }`
  - 时间均为北京时间文字 `YYYY-MM-DD HH:mm`；`nextCheck` 关闭时为 `null`，刚开启尚未检查时为 `"10 分钟内"`。
  - `baseline: true` 表示已开启、还没完成第一次成功检查（第一次成功检查只把已有事件记为不推）。
  - `lastPush.status`：`sent` 已发出 / `failed` 飞书明确拒绝（`error` 为原因，最多试 3 次）/ `unknown` 超时或输出无法确认，不自动重发，需到飞书核对。跳过的事件不出现在这里。
- 规则（server/codex-push.mjs，服务启动后每 10 分钟看一次开关）：开着且距上次检查满 4 小时才读 aihot.news；同一重置事件只推一次（表 `codex_push`，重启不重推）；一次检查发现多条新事件只推最新一条；关闭期间出现的事件在重新开启时记为基线，不补推。
- 发送：`lark-cli --profile codex im +messages-send --as bot --user-id <本人 open_id> --msg-type interactive --content <卡片 2.0 JSON> --idempotency-key codex-reset-<事件哈希>`，不在代码里写 token。

## 业务 · 营收完成度（演示数据）

- `GET /api/v3/business/revenue` → `{ period, timePct, updatedAt, groups: { label, items }[], origin: "demo", task }`，响应头 `x-workdesk-data-origin: demo`；数据取自 `fixtures/v3-demo-revenue.json`，待正式营收表。
- 一般项 `{ key, name, current, target }`；比率项 `{ key, name, rate, lastMonthRate }`（0–1 的小数），前端按「有 `rate` 即比率项」显示大号百分比和「上月 x%」，不画进度条。2026-10-18 起「总进度」组第 4 项为 `conv`「总转化率」。

## 品牌数据（2026-10-18，只读）

来源是设置里的 `brand_base_url`（留空读默认品牌表）。飞书表里每一版是一张表，表名形如 `V2026.09.01`；只读这些版本表，物料、数据汇总等其他表不读，不写飞书。

- `GET /api/v3/brand` → `{ source, readAt, versions: [{ version, table, date, items: [{ id, sort, dim, line, name, value, owner, check? }] }] }`。`versions` 最新版在前；`date` 取自表名；`check` 是「数据核对」（只有最新版有：新增 / 删减 / 保留）。有旧结果时先返回旧结果，超过十分钟后台再读。
- `POST /api/v3/brand/refresh` → 同上，现读。
- 版本之间的对比（更新、改名、下线）由页面按 `id` 计算，接口只给原始数据。没读完整（分页中断、表版本变化）返回 502，不保存半截快照。

## 知识库 · 画布（2026-10-18）

知识库页默认是画布：根目录下的目录是分组，其余根节点是散卡。拖动整理**拖完即写**（用户确认，不走预览确认），但每次只写一项、写锁、身份核验、目录指纹、写后回读、结果不明锁住，和目录整理共用同一套操作记录。

- `POST /api/v3/kb/quick` 请求 `{ ops: [op] }`（恰好一项；`op` 与 `/api/v3/kb/preview` 相同：`move` / `rename` / `mkdir`）→ 与 `/api/v3/kb/confirm` 相同的回执（`state`、`completed`、`created`、`tree`…）。只读目录结构生成计划（不读正文），然后走确认路径。结果不明返回 `409 KB_RESULT_UNKNOWN` 并附 `receipt`，核对沿用 `operations/:id/reconcile`。
- `GET /api/v3/kb/layout` → `{ order: string[] }`；`PUT /api/v3/kb/layout` 请求 `{ order }`（不重复的节点 ID，最多 200 个）。分组顺序只存本机，不写飞书（飞书不支持调同级顺序）；排过序的根目录节点也视为分组。
- `GET /api/v3/kb/tree` 的 `docs[id]` 新增 `shortcut: boolean`（是不是快捷方式节点）。

## 知识库 · 快捷收藏（T12）

在「常浩的知识库」（设置键 `kb_collect_space`）的一级目录下，为一篇飞书文档创建**快捷方式**；原文不移动、不复制。归类规则在设置键 `kb_collect_rules`：`[{ nodeToken, title, keywords: string[] }]`，用现有 V3 设置的预览 → 确认 → 回读来修改。

**一键收藏（用户 2026-10-18 确认）**：快捷收藏不走「先预览、后确认」，点击即创建；仍然只创建一次、不自动重试、写后回读、结果不明时锁住并核对。入口只有 Chrome 扩展「牛马之家 · 收藏」（飞书文档页右下角按钮）；知识库页的粘贴框已删除（用户 2026-10-18），页面只保留「最近收藏」。

- `POST /api/v3/kb/collect` 请求 `{ url, requestId, targetNodeToken? }`。
  - `requestId`：客户端生成的 UUID。同一 `requestId` 重复请求，返回同一结果，不重复创建（双击、扩展重发都靠它）。
  - 目录：带 `targetNodeToken` 时用它（必须在规则表里）。不带时自动归类（用户 2026-10-18 改）：只命中一个目录才放进它；命中多个或都没命中，算「不明确」，放在知识空间根目录（画布散卡区），由用户在画布上拖进分组。规则表仍保留一个无关键词的目录，但不再用来兜底。匹配用原文标题及其上级目录标题，不区分大小写。
  - 查重：目标空间里已有指向同一原文的快捷方式，或原文本身就在目标空间里，都不创建。
  - 这篇文档有结果不明、尚未核对的记录时，不创建，返回 `409 COLLECT_PENDING` 并附 `receipt`。

```ts
// 200
{
  status: "created" | "duplicate";
  operationId: string;          // duplicate 时也给，便于记录
  title: string; objType: string; location: string;   // location：知识库名或「我的文档库」
  parentNodeToken: string; parentTitle: string;       // created：新建位置；duplicate：已在的位置
  url: string;                  // created：新快捷方式链接；duplicate：已有节点链接
  duplicateKind?: "shortcut" | "inSpace";
  reason: "chosen" | "matched" | "unclear" | "first" | "fallback"; // 用户所选 / 唯一命中 / 不明确放根目录；first、fallback 只出现在 2026-10-18 之前的旧记录
  matched: Array<{ nodeToken: string; title: string; keywords: string[] }>;
  at: string;
}
```

- 实现补充（Codex 交付，Claude 2026-10-18 确认）：
  - 结果不明的锁是**整个目标空间**的写锁（与知识库整理共用），期间同一空间里其他文档的收藏、整理也返回 `409 COLLECT_PENDING`，附的是那条未核对记录的回执；核对后解锁。
  - 原请求的 `requestId` 永远重放原来的回执（含 502）；核对确认 `verified` 后，用新的 `requestId` 再收藏会得到 `duplicate`。
  - 旧版文档（`obj_type: doc`）可以查重，但新建快捷方式不支持，提交前返回 `422 COLLECT_SOURCE_UNSUPPORTED`，零创建、不留锁。
  - 输入链接本身是快捷方式时，归一到它指向的原文。
  - 规则：`nodeToken` 不重复，恰好一个无关键词的兜底目录；关键词不分大小写去重、去首尾空白后计数。规则预览时逐个核对目录在收藏目标空间里存在；预览后空间被改则规则确认失败，需重新预览。
- `GET /api/v3/kb/collect/recent` → `{ items: Array<{ operationId, title, parentTitle, url?, status: "ok" | "duplicate" | "unknown" | "failed", at }> }`，最近 50 条，只读本地记录。
- 结果不明后的核对沿用 `GET /api/v3/kb/operations/:id`、`POST /api/v3/kb/operations/:id/reconcile`。核对返回 `state: "verified"` 表示快捷方式已建好并指向原文，其余视为没有建成。
- 错误体 `{ error, code, receipt? }`：

| HTTP / code | 含义 |
|---|---|
| `400 COLLECT_URL_INVALID` | 不是飞书文档链接 |
| `404 COLLECT_SOURCE_UNREADABLE` | 原文档读不到（无权限或不存在） |
| `422 COLLECT_SOURCE_UNSUPPORTED` | 不是知识库节点（如云盘文档），首跑验证前暂不支持 |
| `400 COLLECT_TARGET_INVALID` | 所选目录不在规则表或已不存在 |
| `409 COLLECT_PENDING` | 这篇文档上次结果不明，先核对；附 `receipt` |
| `403 COLLECT_PAIRING_REQUIRED` | 扩展请求没有带对配对码（见下） |
| `502 COLLECT_RESULT_UNKNOWN` | 已提交但结果不明，附 `receipt`；不自动重试，先核对 |

### 扩展配对码

- 配对码：64 位小写十六进制，首次读取时由后端生成，存在工作台数据目录里，不写日志、不出现在错误信息里。
- 来源校验：`Origin` 以 `chrome-extension://` 开头的请求，必须带请求头 `X-Niuma-Collect-Code` 且等于配对码，否则 `403 COLLECT_PAIRING_REQUIRED`；带其他外来 `Origin` 的请求一律 `403`；同源（牛马之家页面）或没有 `Origin` 的请求照常处理。适用于 `POST /api/v3/kb/collect`，且配对码校验排在链接校验之前（扩展用空链接请求检查配对：得到 `400 COLLECT_URL_INVALID` 即配对正确，不会写入）。不加任何跨域放行响应头。
- `GET /api/v3/kb/collect/pairing` → `{ code, createdAt }`：只给牛马之家页面（扩展来源一律 `403`）。
- `Host` 也要是本机地址（`127.0.0.1`、`localhost`、`[::1]`，任意端口），否则即使没有 `Origin` 也 `403`。`recent`、`pairing` 系列只给本站页面。
- 重新生成走预览 → 确认 → 回读：`POST /api/v3/kb/collect/pairing/preview` → `{ previewId, expiresAt }`；`POST /api/v3/kb/collect/pairing/rotate` `{ previewId, confirm: true }` → `{ code, createdAt }`，旧码立即失效。
