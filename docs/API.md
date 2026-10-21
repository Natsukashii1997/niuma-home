# 接口约定

全部为 JSON；出错返回 `{ error: "中文说明" }` 与相应状态码；未实现返回 501 `{ error, task }`。
字段名用 camelCase；月份 `YYYY-MM`；业务线取值：大学辅导 / 国际课程 / 申诉服务（促销表只有大学辅导 / 国际课程；方案原文另有申诉服务：无固定 SKU，内容记为整月特殊活动，不进方案汇总，2026-10-19 起）。

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
- `POST /api/plans/parse` 请求 `{ month, line?, rawText }` → `ParseResult`；只解析，不写库。`line` 省略时按原文【…板块】识别业务线并与该业务线对比（前端不再选业务线，2026-10-19）

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
- `PUT /api/plans/:month/:line` 请求 `{ rawText, rawHtml?, rows, special }`（rows、special 为本人确认后的解析结果，须与原文重新解析一致）→ `{ inserted, updated, removed }`；rows 可为空（申诉服务），此时 special 不能为「无」
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

## 业务 · 营收完成度与图表（飞书只读）

- `GET /api/v3/business/revenue` → `{ period, timePct, updatedAt, source, groups: { label, items }[] }`；只读飞书多维表格《策略数据表单》的仪表盘「当月策略盘」（`server/revenue.mjs`，按组件名找组件）：6 个进度组件给 `current/target`，「总转化率趋势」给本月 `rate` 与上月 `lastMonthRate`（本月还没有转化率时不返回 `conv`）。`period` 为「YYYY 年 M 月」，`timePct` 为当月已过天数占比。缓存 10 分钟，先给上次结果（含重启前快照）、过期后台重读；组件缺失或数据不全报 502。
- `GET /api/v3/business/charts[?refresh=1]` → `{ source, period: "YYYY-MM", updatedAt: "YYYY-MM-DD HH:mm", charts, stale, refreshing, sourceError? }`。仅 codex/user 读取同一「当月策略盘」，独立于上方指标缓存；完整枚举所有分页并按源布局读取 5 张折线图与 9 张占比图（后续新增 line/pie 自动纳入，当前 14 张缺失/重名/改变统计口径导致不完整时明确报错）。所有图保留 `id/name/type/sourceType/unit/sourceTable/filter/dimension/measure`；`unit` 为 currency 或 percent。折线为 `categories + series[{name,values}]`，年份是独立系列，缺月为 null；占比为 `items[{label,value}] + total + pieAvailable`，空类别显示「未填写」，零值不丢，负值/缺失值保留为明细并停止画占比。大学地区图 CLI 类型 unknown 已按真实一维实收金额结果核对并作为 pie 展示。
  - 图表按原组件配置中的字段、聚合和筛选读取；趋势与占比分别来自原图各自的数据表，不自行统一为上方营收卡口径，不派生同比/环比。完整批次成功才保存 `business-charts-v1` 快照，缓存 10 分钟；过期返回明确 stale 的旧快照并后台更新，刷新失败回传 sourceError，保持原更新时间，60 秒后才后台重试；`refresh=1` 显式现读，失败返回错误。页面在 refreshing 期间每 2 秒回读缓存，完成后更新图形。无成功快照时首次读取失败报错，不显示空图。跨月读取拒绝混合月份结果。
  - 飞书错误码 1 或限流在单个只读请求上有限重试一次；权限拒绝、无效结构不重试。持续失败提示具体图名和错误码。占比含任意缺失值时 `total=null`，显示「数据不完整」；页面占比图和列表按金额降序展示全部分类，完整数值保留源顺序。

- 一般项 `{ key, name, current, target }`；比率项 `{ key, name, rate, lastMonthRate }`（0–1 的小数），前端按「有 `rate` 即比率项」显示大号百分比和「上月 x%」，不画进度条。2026-10-18 起「总进度」组第 4 项为 `conv`「总转化率」。

## 品牌数据（2026-10-18，只读）

来源是设置里的 `brand_base_url`（留空读默认品牌表）。飞书表里每一版是一张表，表名形如 `V2026.09.01`；只读这些版本表，物料、数据汇总等其他表不读，不写飞书。

- `GET /api/v3/brand` → `{ source, readAt, versions: [{ version, table, date, items: [{ id, sort, dim, line, name, value, owner, check? }] }] }`。`versions` 最新版在前；`date` 取自表名；`check` 是「数据核对」（只有最新版有：新增 / 删减 / 保留）。有旧结果时先返回旧结果，超过十分钟后台再读。
- `POST /api/v3/brand/refresh` → 同上，现读。
- 版本之间的对比（更新、改名、下线）由页面按 `id` 计算，接口只给原始数据。没读完整（分页中断、表版本变化）返回 502，不保存半截快照。

## 知识库 · 画布（2026-10-18）

知识库页的「同步飞书」调用 `POST /api/v3/kb/refresh`，等待强制读取并直接采用响应中的目录与文档详情；普通 `GET /api/v3/kb/tree` 仍用于初始缓存读取。同步期间保留当前内容并禁止写操作，成功更新目录和同步时间（同一分钟也必须替换），失败保留上次内容和时间并提示；`sourceError` 单独提示部分详情未完整读取。存在写队列、未知写入锁或正在编辑目录名称时，禁止发起同步。

知识库页默认是画布：根目录下的目录是分组，其余根节点是散卡。拖动整理**拖完即写**（用户确认，不走预览确认），但每次只写一项、写锁、身份核验、目录指纹、写后回读、结果不明锁住，和目录整理共用同一套操作记录。

- `POST /api/v3/kb/quick` 请求 `{ ops: [op] }`（恰好一项；`op` 与 `/api/v3/kb/preview` 相同：`move` / `rename` / `mkdir`）→ 与 `/api/v3/kb/confirm` 相同的回执（`state`、`completed`、`created`、`tree`…）。只读目录结构生成计划（不读正文），然后走确认路径。结果不明返回 `409 KB_RESULT_UNKNOWN` 并附 `receipt`，核对沿用 `operations/:id/reconcile`。
- `GET /api/v3/kb/layout` → `{ order: string[] }`；`PUT /api/v3/kb/layout` 请求 `{ order }`（不重复的节点 ID，最多 200 个）。分组顺序只存本机，不写飞书（飞书不支持调同级顺序）；排过序的根目录节点也视为分组。
- `GET /api/v3/kb/tree` 的 `docs[id]` 新增 `shortcut: boolean`（是不是快捷方式节点）。`space` 与 `spaceId` 来自实际空间元数据，读取时核验与配置一致；界面名称与画布状态跟随该身份。

## 知识库 · 快捷收藏（T12）

在设置键 `kb_collect_space` 指定的知识库中，为一篇飞书文档创建**快捷方式**；原文不移动、不复制。归类规则在设置键 `kb_collect_rules`：`[{ nodeToken, title, keywords: string[] }]`，用现有 V3 设置的预览 → 确认 → 回读来修改。规则为 `[]` 时全部放根目录，不沿用其他空间的目录。

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
  - 规则：允许 `[]` 表示不自动分类；非空表的 `nodeToken` 不重复，恰好一个无关键词目录；关键词不分大小写去重、去首尾空白后计数。规则预览时逐个核对目录在收藏目标空间里存在；预览后空间被改则规则确认失败，需重新预览。
- `GET /api/v3/kb/collect/recent` → `{ items: Array<{ operationId, title, parentTitle, url?, status: "ok" | "duplicate" | "unknown" | "failed", at }> }`，当前收藏目标空间最近 50 条，只读本地记录；其他空间的历史记录保留但不混入当前列表。
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

## 项目推进 · 来源（2026-10-19）

- `GET /api/v3/projects` 读飞书「AI管培工作台 / 📑 任务事项」表（`tblc3pkZfjaOnOwY`；原「🅰️ 项目推进」表只是空白模板）。只放「项目类型」为产品项目的项目，营销战役在营销页。
- 节点新增字段：`startDate`、`doneDate`（实际完成时间）、`overdue`（飞书「逾期状态」公式原文）、`deliverables: [{ title, url? }]`、`milestone`。「是否完成」勾选框为空按未完成（`statusKnown` 恒为 true），与飞书「任务完成度」同一口径。
- 项目新增：`completion`（飞书「任务完成度」，0–1）、`taskCount` / `taskDone`（含子项的全部任务）；`phases` 按飞书「环节阶段」选项顺序；`phase` 为第一个还有未完成节点的阶段（不含「监控」），全部完成为 -1。

## 管培带教 · 卡点与提问回复（2026-10-19）

- `GET /api/v3/mentor` 每人新增 `items: [{ id, kind: "卡点" | "提问", text, date, log, src, reply }]`：`id` 是飞书文档里原话所在段落的 block ID，`src` 是 `文档链接#blockId`；`reply` 为本机回复记录 `{ state: "sent" | "sending" | "unknown", as, text, display, commentId?, at, error? }` 或 null。
- `POST /api/v3/mentor/:name/items/:id/answer` 请求 `{}` → `{ text, generatedAt, model }`：机械邪龙兽（本机 Codex）只读这条所在那天的日志作答；`**…**` 为重点。不保存、不发送。
- `POST /api/v3/mentor/:name/items/:id/reply/preview` 请求 `{ text, as: "user" | "bot" }` → `{ previewId, expiresAt, value: { quote, date, log, doc, as, text, display } }`；`text` 去掉 `**` 记号后发送。这一条结果不明时返回 409 `REPLY_UNKNOWN`。
- `POST /api/v3/mentor/:name/items/:id/reply` 请求 `{ previewId, confirm: true }` → 回复记录（`state: "sent"`）。用 `lark-cli drive +add-comment --block-id <id>` 在原话那一段挂评论（user = 常浩本人，bot = 机械邪龙兽应用），只发一次，再按评论编号回读核对；同一预览重复确认返回同一回执。授权被拒（确定没执行）清掉记录；其他失败或回读不一致记为 `unknown` 并返回 502 `REPLY_UNKNOWN`。
- `POST /api/v3/mentor/:name/items/:id/reply/reconcile` 请求 `{}`：只读翻这篇文档的划词评论，找到同一段、同样内容的评论记为 `sent`；没找到清掉记录（`{ state: "none", checked: true }`），可重新发送。

## 策略 · 月度用户策略（T13，2026-10-20）

结构与写作规范见 `docs/用户策略规范.md`。分两层：

- **用户情况**（核心判断、1 全局研判、2 用户洞察、3 机会收敛）按月内置在 `docs/用户情况/YYYY-MM.json`，随版本发布；时间窗、时间全景节点条、各地区节点数、推测节点由 `node scripts/user-insight-facts.mjs YYYY-MM` 按时间线算好写进文件。第一次修改时整月复制到本地 `v3_documents`（kind `user-strategy`，id 为月份），之后以本地为准。
- **促销策略**（本月目标、核心打法、4.1–4.4）由按钮生成，存在当月记录的 `strategy` 下。

接口：

- `GET /api/v3/user-strategy?month=YYYY-MM` → `{ month, window, origin: "内置" | "已修改", updatedAt?, summary: { judgement }, overview: { markers, common, diff, external, tiers, lanes, counts }, regions: [{ key, name, tier, temp: [起, 止], node, task, pain, tempNote, barrier, opp, master }], opportunities: [[优先级, 机会, 地区, 业务线, 新签/续费, 窗口, 依据]], appendix: { guesses, pending }, strategy: null | { status: "草稿" | "定稿", generatedAt, finalizedAt?, model, goal, plays: [[栏, 文字]], promo: { lines: { 新签, 续费 }, logic, exclude, floor }, warnings } }`；没有内置也没有本地记录时返回 `{ month, status: "未准备" }`。GET 不调用模型。
  - 普通条目 `[正文, 来源]`，来源 ∈ 时间线 / 规则推导 / 原声 / AI 判断 / 推测 / 你写的；`barrier` 为 `[障碍编号, 描述, 来源]`。
  - `promo.lines.*` 每行 `[角色, [打法编号], 做法, 适用]`；`logic` 每行 `[障碍编号, 栏, [机制编号], [打法编号], 作用路径]`；`exclude` 每行 `[[打法编号], 理由]`。编号来自 `src/modules/user/playbook.js` 与 `docs/打法库/P*.md`。
- `POST /api/v3/user-strategy/generate/preview` 请求 `{ month, confirmOverwrite? }` → `{ previewId, expiresAt, before, value, overwrite }`。按当月用户洞察与打法库内部匹配（`matchPromo`，不调用模型，结果确定），规则见 docs/用户策略规范.md 第 7 节；`strategy.model` 为「内部匹配」。匹配结果结构或编号不合规返回 500 `STRATEGY_INVALID`，不保存；字数、禁用词、正文编号、阶段错栏写进 `strategy.warnings`，不拦截。促销已定稿时必须带 `confirmOverwrite: true`，否则 409。用户情况原样保留。
- `POST /api/v3/user-strategy/:month/edit/preview` 请求 `{ path, lines }` → 预览。`path` 允许 `summary.judgement`、`strategy.goal`（生成后）、`overview.common|diff|external|tiers`、`opportunities`、`regions.<地区>.node|task|pain|temp|barrier|opp|master`。`lines` 一行一条，与原条正文相同的行沿用原来源，其余标「你写的」；`temp` 第一行写温度（「温 → 热」或「热」）；`barrier` 每行「障碍名称：具体描述」（也接受「A2 描述」）；`tiers` 每行「地区 | 分档 | 依据」，7 个地区各一行；`opportunities` 每行「P0 | 机会 | 地区 | 业务线 | 新签/续费 | 窗口 | 依据」。
- `POST /api/v3/user-strategy/:month/finalize/preview` 请求 `{}` → 预览（促销策略改为定稿；还没生成时 409）。
- `POST /api/v3/user-strategy/:month/confirm` 请求 `{ previewId, confirm: true }` → 写入后回读的整份记录；记录在预览后被改过返回 409；同一预览重复确认返回同一回执。
