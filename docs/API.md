# 接口约定

全部为 JSON；出错返回 `{ error: "中文说明", code?: "错误码" }` 与相应状态码；未实现返回 501 `{ error, task }`。
字段名用 camelCase；月份 `YYYY-MM`；业务线取值：大学辅导 / 国际课程 / 申诉服务（促销表只有大学辅导 / 国际课程；方案原文另有申诉服务：无固定 SKU，内容记为整月特殊活动，不进方案汇总，2026-10-19 起）。

## 请求来源要求（2026-10-23，全部 `/api/` 路由）

- Host 必须是本机（`127.0.0.1` / `localhost` / `[::1]`，可带端口）；浏览器带 `Origin` 时必须等于 `http://<Host>`（Vite 开发页代理保留页面 Host，5281 也能过）。不满足返回 `403 ORIGIN_REJECTED`。不带 `Origin` 的本机请求（curl、脚本）照旧放行。
- `chrome-extension://` 来源只能访问 `/api/v3/kb/collect*`，并仍须带配对码 `x-niuma-collect-code`（见「知识库 · 快捷收藏」）。
- 请求正文：写了 `content-type` 的必须是 `application/json`，否则 `415`（浏览器跨站简单请求带的 `text/plain` 会被拒）；不带 content-type 的（curl、脚本）按 JSON 解析；超过 2MB 返回 `413`。
- 处理失败：带状态码的预期拒绝原样返回；其余返回 `500 { error: "服务内部错误，详情见服务日志", code: "INTERNAL" }`，细节只进服务日志。

## 旧写入口保存保护（2026-10-22）

以下 9 个写入口必须带 `X-Workdesk-Request-Id`（8–128 位字母、数字、`_`、`-`）：助手新建、助手 PATCH、会话导入；物料新建、PATCH、DELETE、上传图片、删除图片；方案 PUT。每次用户操作在发送前持久保存编号和原草稿，同一操作恢复时沿用编号。

其中助手 PATCH、物料 PATCH/DELETE、上传/删除图片、方案 PUT 还必须带 `X-Workdesk-Base-Version`（64 位小写十六进制）。版本来自读取结果或方案解析结果的 `writeVersion`，与最新业务内容不符时停止，不自动换基线覆盖。

- 同编号、同方法/路径、同内容与同基线返回原结果；同编号但请求变化返回 `409 WRITE_ID_REUSED`。版本变化返回 `409 WRITE_CONFLICT`。
- 缺少编号返回 `428 WRITE_ID_REQUIRED`；缺少有效基线返回 `428 WRITE_BASE_REQUIRED`。旧页面需刷新采用保护，已有内容不受影响。
- `GET /api/legacy-writes/:requestId` → `{ id, scope, fingerprint, result, completedAt }`，只读完成回执。`404 WRITE_RECEIPT_UNKNOWN` 只表示未查到回执，不代表操作未执行。未知结果先核对；用户显式重试时只发送原编号、原请求、原基线。已知冲突保持停止，刷新也不解除。
- 回执与 SQLite 业务写入在同一事务；回执与业务回读一致后才清理浏览器操作记录。图片删除/上传失败做文件补偿；这是可捕获异常保护，不保证强制断电时文件系统与数据库原子一致。
- 新版 `/api/v3` 的既有预览/确认合同仍适用；此段不替代它们。

## 营销 · 促销表（已实现）

`GET /api/promos` → `Promo[]`，按月份倒序

```ts
type Promo = { month: string; line: string; sku: string; trial: string; price: string; newDeal: string; renewal: string;
  special: string;                  // 特殊活动：该 SKU 下不属于试听/正价/新签活动/续费活动的条目，没有为「无」
  updatedAt: string };
```

固定 SKU（`server/plan-parser.mjs` 的 `PROMO_SKUS`）：大学辅导 = 灵活学Lite、安心学Max、学考无忧Pass、补考护航Pass、选课指导、论文稳Pass、先修班课；国际课程 = 灵活学Lite、安心学Max。「课时卡」两条线都记作灵活学Lite。

## 营销 · 方案（T01）

- `GET /api/plans` → `{ month, line, special, savedAt, writeVersion }[]`（已实现）；`special` 是该 业务线×月份 的整月特殊活动，没有为「无」
- `GET /api/plans/:month/:line` → `{ month, line, rawText, rawHtml, special, savedAt, writeVersion }`；无则 404（已实现）
- `POST /api/plans/parse` 请求 `{ month, line?, rawText }` → `ParseResult`；只解析，不写库。`line` 省略时按原文【…板块】识别业务线并与该业务线对比（前端不再选业务线，2026-10-19）

```ts
type ParseResult = {
  writeVersion: string;            // 当前月份与业务线的保存基线；PUT 时原样带入版本头
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
- `PUT /api/plans/:month/:line` 请求 `{ rawText, rawHtml?, rows, special }`（rows、special 为本人确认后的解析结果，须与原文重新解析一致）→ `{ inserted, updated, removed, writeVersion }`；rows 可为空（申诉服务），此时 special 不能为「无」
  - 单事务：保存原文；按 rows 覆盖该 月份×业务线 的促销行（不在 rows 内的删除）。

## 营销 · 物料（T03）

```ts
type Material = { id: number; month: string; line: string; name: string; type: string; skus: string[]; note: string; images: Array<{ id: number; url: string }>; createdAt: string; writeVersion: string };
```

- `GET /api/materials?month=&line=&type=` → `Material[]`
- `POST /api/materials` 请求 `{ month, line, name, type, skus?, note? }` → `Material`
- `PATCH /api/materials/:id` → `Material`
- `DELETE /api/materials/:id` → `{ ok: true, id }`（同时删除图片文件）
- `POST /api/materials/:id/images` 请求体为图片二进制，`content-type: image/*`，可选 `?name=` → `{ id, url, materialId, writeVersion }`
- `DELETE /api/materials/:id/images/:imageId` → `{ ok: true, materialId, writeVersion }`
- `GET /api/images/:file` → 图片文件（只允许 data/images 下的文件名）

## 助手（T04）

```ts
type Assistant = { id: number; name: string; kind: "copywriter" | "imported" | "custom"; instructions: string; codexThreadId: string | null; createdAt: string; writeVersion: string;
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
- `GET /api/assistants/:id/messages[?threadId=历史ID]` → `Message[]`（从 Codex 会话读取历史；历史 ID 必须属于本助手）
- `GET /api/assistants/:id/conversations` → `{ currentThreadId, items:[{threadId,name,savedAt,current}] }`。当前会话与本地保留的历史会话。
- `POST /api/assistants/:id/conversations/new` 请求 `{expectedThreadId}`；`POST .../conversations/select` 请求 `{expectedThreadId,threadId}`。返回同上形状；仅切换本地关联，不删除旧会话、不调用模型。新会话首条消息才采用最新已保存知识。回复中或当前关联已变化返回409；跨助手历史ID拒绝。
- `POST /api/assistants/:id/messages` 请求 `{ text, expectedThreadId? }` → 流式返回（`text/event-stream`，事件 `delta` / `done` / `error`）
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
  - 部分来源失败：200；正式服务开启旧快照优先时，`reports` 保留失败来源上次完整结果，来源标记 `ok:false,retained:true,stale:true,error`，不记读取成功。没有完整旧结果的来源不提供篇目。
  - 全部失败且没有可用完整旧结果：返回日报来源的错误状态码，body 为 `{ error, sources }`；仍有旧结果时200并明确各来源失败状态。
  - 理由：双来源后需要表达「部分成功」，数组形状无法表达；用查询参数新增形状，旧路径与旧形状不变。
- `refresh=1` 可与上述两种调用组合：重读全部已配置来源（同一链接只读一次）。
- `GET /api/reports/:id` → 单篇。ID 以 `w-` 开头时属于周报来源，否则属于日报来源（单文档模式下全部属于日报来源）。所属来源读取失败时返回该来源的错误，不返回 404。
- `POST /api/reports/source-preview` 请求 `{ role: "daily" | "weekly", url }` → `{ url, sameAsDaily: boolean, count, latest?: { title, date }, unrecognized }`。只读试读，不写库、不影响缓存。读取失败时返回相应错误状态码与 `{ error }`。

读取模式与链接比较：两条链接规范化后（`URL` 解析，主机名小写，去掉查询参数、`#` 及末尾 `/`）相同，或未配置 `weekly_doc_url`，为**单文档模式**：只读日报文档，日报周报都从中识别。否则为**双来源模式**：每个来源只收录本角色的篇目。

ID：日报来源及单文档模式沿用 T05 算法（无前缀）；周报来源为 `w-` + `sha256("周报|" + date + "|" + title)` 前 20 位 + `-` + 同键序号。合并后有重复 ID 时返回 500。

缓存：按规范化链接分别缓存10分钟，来源变化不沿用旧来源数据。正式服务过期先给完整旧结果并标 `stale:true,refreshing:true`，后台成功后更新；后台失败保留旧结果/旧成功时间，记录本次失败并冷却60秒，手动刷新可重试。页面每1.5秒回读正在更新的来源，结束后停止。底层关闭旧快照优先模式时保持原契约：读取失败清缓存、下次请求重试。Markdown对飞书转义列表统一解析，避免索引不推进导致周报卡死。

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

## 营销 · 价格档案（2026-10-21 图片价格与稳分系列）

- `GET /api/v3/price/skus` → `[{ id, line, name, label, groupId?, groupLabel?, aliases?, unitOrig, tiers, origin }]`。四个主分组、六个产品：`uni-lite` 大学辅导·灵活学Lite；稳分系列（`groupId: uni-score`）含 `uni-max` 安心学Max、`uni-exam-pass` 学考无忧Pass、`uni-resit-pass` 补考护航Pass；`intl-lite` 国际课程·课程课时卡、`intl-comp` 国际课程·竞赛课时卡。SKU 档案按业务线和名称或 aliases 匹配；intl-lite 兼容旧名称“灵活学Lite”“课时卡”的已保存价格。
- 读取顺序：本地已保存矩阵 → 用户提供的价格截图档案（`fixtures/v3-provided-prices.json`）→ 演示。`origin` 为 `local` / `provided` / `demo` / `empty`。五张新图价仅作内置来源快照，不自动写业务记录或伪造需求；大学灵活学Lite演示价格保持原样。不读飞书 SKU 表。
- `GET /api/v3/price/schemes?sku=` → `{ sku, unitOrig, tiers, floorMargin, costPerHour, costOrigin, schemes, origin, source? }`。`costOrigin` 独立标记成本及毛利参数是否已确认（`local` / `demo`），不能因成本未确认把用户图价标成演示；`source` 仅用于未被本地保存覆盖的图片档案。
- `POST /api/v3/price/schemes/preview?sku=` body `{ unitOrig, tiers, schemes }` → 预览；`PUT /api/v3/price/schemes?sku=` body `{ previewId, confirm: true }` → 保存，再 GET 回读。整张矩阵一起保存，仍检查原价、严格升序档位、每格正数总价、非负整数赠课；空方案或未填满不能保存。
- 方案状态新增 `已记录`：表示价格档案，不代表已生效；可同时留空 from/to，也可填完整有效起止期。其余状态继续要求合法日期。2026-10-21用户要求移除「关联需求」「破底线原因」：所有价格方案不再需要这两个输入或必填校验，旧客户端提交的 needId/need/breachReason 在预览时移除；毛利偏低仍可在表格提示，但不阻挡保存。已记录档案不进入月度政策或自动生成的设计 Brief。
- 图片未给生效期，不沿用演示双11日期。学考无忧Pass 30课时的95折、85折分别保存为34,913、31,238元，按源图取整金额。

## 猛鬼兽推送 · Codex 重置（2026-10-19）

- 开关是 V3 配置键 `codex_push_enabled`：`"0"` 关（默认）/ `"1"` 开，走上面的预览 → 确认 → 回读；其他值返回 400。
- `GET /api/v3/codex-push` → `{ enabled, interval, sender, recipient, enabledSince, lastCheck: { at, error } | null, nextCheck, baseline, lastPush: { eventId, status, stage, summary, attempts, error, at } | null }`
  - 时间均为北京时间文字 `YYYY-MM-DD HH:mm`；`nextCheck` 关闭时为 `null`，刚开启尚未检查时为 `"10 分钟内"`。
  - `baseline: true` 表示已开启、还没完成第一次成功检查（第一次成功检查只把已有事件记为不推）。
  - `lastPush.status`：`sent` 已发出 / `failed` 飞书明确拒绝（`error` 为原因，最多试 3 次）/ `unknown` 超时或输出无法确认，不自动重发，需到飞书核对。跳过的事件不出现在这里。
- 规则（server/codex-push.mjs，服务启动后每 10 分钟看一次开关）：开着且距上次检查满 4 小时才读 aihot.news；同一重置事件只推一次（表 `codex_push`，重启不重推）；一次检查发现多条新事件只推最新一条；关闭期间出现的事件在重新开启时记为基线，不补推。
- 发送：`lark-cli --profile cli_a96f5f9ac63adcd4 im +messages-send --as bot --user-id <本人 open_id> --msg-type interactive --content <卡片 2.0 JSON> --idempotency-key codex-reset-<事件哈希>`，不在代码里写 token。

## 业务 · 营收完成度与图表（飞书只读）

- `GET /api/v3/business/revenue[?refresh=1]` → `{ period, timePct, updatedAt, source, groups: { label, items }[], stale, refreshing, sourceError, fetchedAt }`；只读飞书多维表格《策略数据表单》的仪表盘「当月策略盘」（`server/revenue.mjs`，按组件名找组件）：6 个进度组件给 `current/target`，「总转化率趋势」给本月 `rate` 与上月 `lastMonthRate`（本月还没有转化率时不返回 `conv`）。`period` 为「YYYY 年 M 月」，`timePct` 为当月已过天数占比。缓存10分钟，先给上次完整结果（含重启前快照）、过期后台重读；失败保留完整结果及旧更新时间并明确 `sourceError`，60秒冷却后才自动重试。营收 `refresh=1`、品牌 `POST /api/v3/brand/refresh` 强制重读；页面在 `refreshing` 时每1.5秒回读，完成或失败后停止。无完整结果时组件缺失/数据不全报502。品牌同样返回这四个新状态字段；品牌版本选择按table ID保持，所选版本消失回到最新版本。
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

知识库页是书柜：根目录下的目录是分组（书柜的一层），其余根节点横放在柜顶「待上架」。拖动整理**拖完即写**（用户确认，不走预览确认），但每次只写一项、写锁、身份核验、目录指纹、写后回读、结果不明锁住，和目录整理共用同一套操作记录。

- `POST /api/v3/kb/quick` 请求 `{ ops: [op] }`（恰好一项；`op` 与 `/api/v3/kb/preview` 相同：`move` / `rename` / `mkdir`）→ 与 `/api/v3/kb/confirm` 相同的回执（`state`、`completed`、`created`、`tree`…）。只读目录结构生成计划（不读正文），然后走确认路径。结果不明返回 `409 KB_RESULT_UNKNOWN` 并附 `receipt`，核对沿用 `operations/:id/reconcile`。
- `GET /api/v3/kb/layout` → `{ order: string[] }`；`PUT /api/v3/kb/layout` 请求 `{ order }`（不重复的节点 ID，最多 200 个）。分组顺序只存本机，不写飞书（飞书不支持调同级顺序）；排过序的根目录节点也视为分组。
- `GET /api/v3/kb/tree` 的 `docs[id]` 新增 `shortcut: boolean`（是不是快捷方式节点）。`space` 与 `spaceId` 来自实际空间元数据，读取时核验与配置一致；界面名称与画布状态跟随该身份。

## 知识库 · 快捷收藏（T12）

在设置键 `kb_collect_space` 指定的知识库中，为一篇飞书文档创建**快捷方式**；原文不移动、不复制。归类规则在设置键 `kb_collect_rules`：`[{ nodeToken, title, keywords: string[] }]`，用现有 V3 设置的预览 → 确认 → 回读来修改。规则为 `[]` 时全部放根目录，不沿用其他空间的目录。

**一键收藏（用户 2026-10-18 确认）**：快捷收藏不走「先预览、后确认」，点击即创建；仍然只创建一次、不自动重试、写后回读、结果不明时锁住并核对。入口只有 Chrome 扩展「牛马之家 · 收藏」（飞书文档页右下角按钮）；知识库页的粘贴框已删除（用户 2026-10-18），页面只保留「最近收藏」。

- `POST /api/v3/kb/collect` 请求 `{ url, requestId, targetNodeToken? }`。
  - `requestId`：客户端生成的 UUID。同一 `requestId` 重复请求，返回同一结果，不重复创建（双击、扩展重发都靠它）。
  - 目录：带 `targetNodeToken` 时用它（必须在规则表里）。不带时自动归类（用户 2026-10-18 改）：只命中一个目录才放进它；命中多个或都没命中，算「不明确」，放在知识空间根目录（书柜顶上的「待上架」），由用户在画布上拖进分组。规则表仍保留一个无关键词的目录，但不再用来兜底。匹配用原文标题及其上级目录标题，不区分大小写。
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

## 管培带教 · 提问回复（2026-10-21）

- `GET /api/v3/mentor` 每人新增 `items: [{ id, kind: "提问", text, date, log, src, reply }]`：`id` 是飞书文档里原话所在段落的 block ID，`src` 是 `文档链接#blockId`；`reply` 为本机回复记录 `{ state: "sent" | "sending" | "unknown", as, text, display, commentId?, at, error? }` 或 null。
- 只列提问，旧快照中普通卡点陈述不再列出；实际含问句的旧条目保留原文及原段落 ID。兼容字段 `blocks` 返回空数组，`asks` 为提问摘要。完整日志证据、历史回复和周记录不删除。
- `POST /api/v3/mentor/:name/items/:id/answer` 请求 `{}` → `{ text, generatedAt, model }`：猛鬼兽（本机 Codex）只读这条所在那天的日志作答；`**…**` 为重点。不保存、不发送。
- `POST /api/v3/mentor/:name/items/:id/reply/preview` 请求 `{ text, as: "user" | "bot" }` → `{ previewId, expiresAt, value: { quote, date, log, doc, as, text, display } }`；`text` 去掉 `**` 记号后发送。这一条结果不明时返回 409 `REPLY_UNKNOWN`。
- `POST /api/v3/mentor/:name/items/:id/reply` 请求 `{ previewId, confirm: true }` → 回复记录（`state: "sent"`）。用 `lark-cli drive +add-comment --block-id <id>` 在原话那一段挂评论（user = 常浩本人，bot = 猛鬼兽应用），只发一次，再按评论编号回读核对；同一预览重复确认返回同一回执。授权被拒（确定没执行）清掉记录；其他失败或回读不一致记为 `unknown` 并返回 502 `REPLY_UNKNOWN`。
- `POST /api/v3/mentor/:name/items/:id/reply/reconcile` 请求 `{}`：只读翻这篇文档的划词评论，找到同一段、同样内容的评论记为 `sent`；没找到清掉记录（`{ state: "none", checked: true }`），可重新发送。

## 带教 · 培养路径（T14；2026-10-26 改为按工作日排期，照飞书《管培生培养路径 V2.4》）

数据全放工作台本地（用户 2026-10-23 确认），不回写飞书。每位带教对象一份路径：`v3_documents`（kind `mentor-path`，id 为姓名，`version: 2`）；每段一条进度记录：`v3_documents`（kind `mentor-stage`，id 为 `姓名:阶段编号`）。没有新表。

- 工作日历在 `server/workdays.mjs`：跳过周末和法定节假日，调休上班日照常算（2026 年照国务院办公厅 2025-11-04 通知录入）；没录的年份只跳过周末，GET 返回 `missingYears` 提示。`D1` = 入职日（入职日不是工作日就从下一个工作日算起）。
- 培养方案模板在 `server/mentor-plans.mjs`（目前只有 `v2.4`：业务线 P1–P10、技术线 T1–T6、65 个工作日、6 个评审节点、70 分合格）。新加的人整份复制模板，之后入职日、各段日期和安排文字各改各的，改模板不影响已有的人。
- 旧版按周的路径（没有 `version`）GET 时 `path` 为 null 并标 `legacy: true`，页面给「按方案生成路径」；旧版营地记录（kind `mentor-camp`）不再读取，保留不删。

### 读取

- `GET /api/v3/mentor/path` → `{ today: "YYYY-MM-DD", plans: [{ id, name }], trainees: [{ name, role, hasLog, path | null, legacy? }] }`。
  - 名单沿用带教来源（设置 `mentor_sources`，1–20 人，日志链接可不填）；`hasLog` 为 false 的人不进带教答疑。`today` 按北京时间由后端给，页面不读浏览器时间。
  - `path`：`{ version: 2, plan: { id, name, source? }, start, pass, reviewer, days, end, todayD, calendar, missingYears, lines }`。`days` 是计划最后一天（结业）是第几个工作日，`end` 是那天的日期；`todayD` 是今天第几个工作日（入职前为 0）；`calendar[d - 1]` 是第 d 个工作日的日期，覆盖到 `max(days, todayD)`。
  - `lines`：两条线依次是 `{ key: "biz", name: "业务线" }`、`{ key: "ai", name: "技术线" }`，各带 `stages`。
  - `stages[]`：`{ id, short, title, d: [起, 止], dates: [起日期, 止日期], review?, pass?, with?, goal, steps: [{ d?, dates?, text }], out: [], status, late, record }`。`review` 是这一段末尾的评审节点名、`pass` 是合格标准；技术线的 `with` 是同期绑定的业务阶段；`steps` 的 `d` 可省略（整段都在做）。
  - 后面几项由进度记录和今天推出，不另存：
    - `status`：评审段结论为「通过」、其余段带教已确认完成为 `done`；每条线第一段没完成的为 `doing`，其后都是 `todo`。限期复核、不通过仍是 `doing`。
    - `late`：`doing` 的段今天已过计划结束日时，超出的工作日数；否则 0。
    - `record`：这一段的进度记录或 null（见下）。

### 写入（都走预览 → 确认 → 回读）

预览返回 `{ previewId, expiresAt, ..., view }`：`view` 是写入后这个人的 `path`（与 GET 同形），页面回读时重新 GET，这个人的 `path` 和 `view` 完全一致才算保存。确认请求都是 `{ previewId, confirm: true }`；预览 10 分钟内有效，同一预览重复确认返回同一回执；预览之后这个人的路径或任何进度记录变了，返回 409，须重新预览。

- **添加带教对象**：`POST /api/v3/mentor/path/trainees/preview` 请求 `{ name, role = "管培生", start, logUrl?, plan = "v2.4" }` → `{ previewId, expiresAt, entry, view }`，`entry` 是要加进名单的一条 `{ name, role, year, url? }`。确认 `POST /api/v3/mentor/path/trainees`：名单和路径在同一个事务里写入，写完回读名单。重名、名单已满（20 人）、这个人已经有路径分别 409 / 400 / 409。
- **按方案生成路径**：`POST /api/v3/mentor/path/:name/generate/preview` 请求 `{ start, plan = "v2.4" }` → `{ previewId, expiresAt, view, orphans }`，`orphans` 是新方案里对不上的旧进度记录的段编号。确认 `POST /api/v3/mentor/path/:name/generate`。只给名单里还没有路径、或还是旧版按周路径的人用：名单里没有 404，已有新版路径 409（改日期和安排走「调整安排」）。进度记录不动。
- **调整安排**：`POST /api/v3/mentor/path/:name/plan/preview` 请求 `{ start?, lines? }`（改后的整份；段落的增删、换序、编号不能改）→ `{ previewId, expiresAt, moved, edited, startChanged, endBefore, endAfter, view }`：`moved` 是挪了日期的段，`edited` 是改了文字（简称、名称、目标、安排、产出、评审名称或合格标准）的段。确认 `POST /api/v3/mentor/path/:name/plan`。校验：同一条线各段按工作日先后排、不重叠（中间可空几天），安排的日期落在本段之内，没有改动 400。「后面的段一起顺延」由页面算好再整份提交（`src/modules/projects/mentor-path.js` 的 `moveStage`），后端不另做。旧路径进 `history`（最近 10 份）。
- **记录进度**：`POST /api/v3/mentor/path/:name/stages/:id/record/preview` 请求
  - 评审段：`{ kind: "review", score: 0–100 整数, result: "pass" | "retest" | "fail", at: "YYYY-MM-DD", note? }`，「通过」须达到合格分；
  - 其余段：`{ kind: "complete", at, note? }`（带教确认完成）；
  - 撤销：`{ clear: true }`。
  - `at` 是实际发生的日期，可以补录过去，不能晚于今天；备注最多 200 字。→ `{ previewId, expiresAt, view, effects }`，`effects` 是状态会变的段 `[{ id, title, from, to }]`。确认 `POST /api/v3/mentor/path/:name/stages/:id/record`。存的记录 `{ name, stage, kind, at, note?, score?, result?, recordedAt, history? }`，旧记录进 `history`（最近 20 条）。错误：段落类型和请求不符、内容不合规、没有改动 400；没有这一段 404。
- **命令行导入**：`npm run import:mentor-path -- <姓名> --start YYYY-MM-DD [--plan v2.4] [--confirm]`，和「按方案生成路径」用同一套预览（排期、评审日期、今天第几个工作日、现有路径），默认只预览，加 `--confirm` 才写入并回读；它也能替换已有的新版路径。

## 策略 · 月度用户策略（T13，2026-10-20）

结构与写作规范见 `docs/用户策略规范.md`。分两层：

- **用户情况**（核心判断、1 全局研判、2 用户洞察、3 机会收敛）按月内置在 `docs/用户情况/YYYY-MM.json`，随版本发布；内置客观数据可由 `node scripts/user-insight-facts.mjs YYYY-MM` 初始化；GET时从当前来源最近完整时间线快照及人工裁定派生时间全景、节点数和推测清单，保留人工正文与已生成促销。第一次修改时整月复制到本地 `v3_documents`（kind `user-strategy`，id 为月份），之后以本地为准。
- **促销策略**（本月目标、核心打法、4.1–4.4）由按钮生成，存在当月记录的 `strategy` 下。

接口：

- `GET /api/v3/user-strategy?month=YYYY-MM` → `{ month, window, origin: "内置" | "已修改", updatedAt?, summary: { judgement }, overview: { markers, common, diff, external, tiers, lanes, counts }, regions: [{ key, name, tier, temp: [起, 止], node, task, pain, tempNote, barrier, opp, master }], opportunities: [[优先级, 机会, 地区, 业务线, 新签/续费, 窗口, 依据]], appendix: { guesses, pending }, strategy: null | { status: "草稿" | "定稿", generatedAt, finalizedAt?, model, goal, plays: [[栏, 文字]], promo: { lines: { 新签, 续费 }, logic, exclude, floor }, warnings } }`；没有内置也没有本地记录时返回 `{ month, status: "未准备" }`。GET 不调用模型。
  - 普通条目 `[正文, 来源]`，来源 ∈ 时间线 / 规则推导 / 原声 / AI 判断 / 推测 / 你写的；`barrier` 为 `[障碍编号, 描述, 来源]`。
  - `promo.lines.*` 每行 `[角色, [打法编号], 做法, 适用]`；`logic` 每行 `[障碍编号, 栏, [机制编号], [打法编号], 作用路径]`；`exclude` 每行 `[[打法编号], 理由]`。编号来自 `src/modules/user/playbook.js` 与 `docs/打法库/P*.md`。
- `POST /api/v3/user-strategy/generate/preview` 请求 `{ month, confirmOverwrite? }` → `{ previewId, expiresAt, before, value, overwrite }`。按当月用户洞察与打法库内部匹配（`matchPromo`，不调用模型，结果确定），规则见 docs/用户策略规范.md 第 7 节；`strategy.model` 为「内部匹配」。匹配结果结构或编号不合规返回 500 `STRATEGY_INVALID`，不保存；字数、禁用词、正文编号、阶段错栏写进 `strategy.warnings`，不拦截。促销已定稿时必须带 `confirmOverwrite: true`，否则 409。用户情况原样保留。
- `POST /api/v3/user-strategy/:month/edit/preview` 请求 `{ path, lines }` → 预览。`path` 允许 `summary.judgement`、`strategy.goal`（生成后）、`overview.common|diff|external|tiers`、`opportunities`、`regions.<地区>.node|task|pain|temp|barrier|opp|master`。`lines` 一行一条，与原条正文相同的行沿用原来源，其余标「你写的」；`temp` 第一行写温度（「温 → 热」或「热」）；`barrier` 每行「障碍名称：具体描述」（也接受「A2 描述」）；`tiers` 每行「地区 | 分档 | 依据」，7 个地区各一行；`opportunities` 每行「P0 | 机会 | 地区 | 业务线 | 新签/续费 | 窗口 | 依据」。
- `POST /api/v3/user-strategy/:month/finalize/preview` 请求 `{}` → 预览（促销策略改为定稿；还没生成时 409）。
- `POST /api/v3/user-strategy/:month/confirm` 请求 `{ previewId, confirm: true }` → 写入后回读的整份记录；记录在预览后被改过返回 409；同一预览重复确认返回同一回执。


### 物料沉淀直接保存（2026-10-21 用户授权）

- 旧 `/api/v3/refs` 画布改名过往营销，原 GET 和 preview/confirm 兼容保留。新增 `GET /api/v3/refs/state` 返回 `{value,revision}`；`PUT /api/v3/refs` 接收 `{requestId,baseRevision,value}`，立即压缩并本地保存，返回 `{requestId,value,revision}`。
- `GET /api/v3/refs/saves/:id` 返回已提交收据或null；`GET /api/v3/refs/operations/:id` 区分pending/saved/absent，saved含receipt。网络未知只查询，不自动重复写入；未完成草稿保留，确认未保存后由用户继续保存。
- 版本在压缩前后和提交事务核对，防止覆盖其他窗口；requestId绑定请求内容，收据与记录同事务保存（保留最近100项）。成功自动保存释放旧预览对象，频繁拖动不消耗待确认额度。图片仅允许本记录既有合法引用或受校验的新图片。
- 删除按本次旧引用减新引用清理本机图片文件；仍被保留项引用的不删。文件创建、删除和回读在数据库事务提交前完成；失败尽力回滚全部文件步骤并报告恢复异常。不会扫描清理历史孤儿，也不会删除数码世界/NAS原图。
- 新设计参考是独立 `design-refs/canvas` 记录与 `design-refs/` 图目录；对应state、PUT、saves、operations、images路由与上面一致。value仍为zones/items，zones是有序分组，items一帖一卡，post含来源id/作者/正文/type/公开url，gallery保留全部本地图片。
- 图片缓存优先压至单张1,000,000字节：过往营销、设计参考每张图及NAS缩略图有界降低JPEG质量/长边；仍超限保留最小有效结果，不因体积拒收。画布state和NAS读取响应包含`warning`，依据实际已存文件提醒超限数量；提醒不阻断编辑/查看，可关闭。NAS缩略图先写临时文件再原子替换，编码异常且无有效结果时才失败。NAS原图、数码世界原图和Brief原附件不受此规则改写。
- `GET /api/v3/design-refs/source` 只读源收藏元信息，默认分组设计参考；列表不返回正文或原图磁盘路径。`POST /api/v3/design-refs/import`接收`{requestId,baseRevision,ids}`（1–20篇），仅将所选帖子正文与图片复制进独立本机收藏；视频只复制封面，播放打开原帖。来源链接剔除token/signature/auth查询参数。
- 本轮直接保存仅作用于这两个本机素材页，不改变其他模块写入门禁；公共成功提示3秒按帧淡出，错误、待确认与静态完成状态保留。

### 设计 Brief 模板（2026-10-21）

- `GET /api/v3/briefs/:month`：七节模板，新增 `materials:[{id,name}]` 主表。`audience/timeline/items` 与主表同序、同名，以稳定编号保留改名后的人工内容。新建不再自动从旧需求或价格方案拼物料；旧记录按精确名称迁移，未配对项独立保留。
- `POST /api/v3/briefs/:month/generate {patch,overwrite?:false}`：只读草稿建议，不写数据库、不调用 Codex 或大模型；读取同月用户策略，补背景/目标和受众表空白；`overwrite:true` 明确重写第一、二节，其余节不变。缺少同月策略返回409。返回 `value,warnings,source`，页面自动保存生成结果；旧preview/confirm接口兼容保留。
- 新物料 `kind:'framework',blocks:[]`；第四节每个物料一个小节和三列表头「涉及板块/内容/说明/示例」。第五节两列「交付物/规格建议」；第六节固定需求对接/内容确认/设计对接；附件可空。
- Brief 的 export-preview/export 采用原生XML标题和表格（旧收据和需求策略导出仍兼容Markdown）。界面“双向同步”连续调用预检、单次确认及回读；Brief 预检提交 `{baseVersion}`（旧客户端 `{}` 兼容），服务端检查当前版本并固定到路觅策略知识库 / 营销对接Brief（space `7672588453183261977`，node `KiDLwRP8eixgJfkNHvDcGwpQnog`），拒绝前端改目的地。点击创建先flush串行自动保存、回读当前版本，再提交预检；保存失败或版本冲突不导出。完全空白物料占位跳过，未命名且已填内容仍须补名。创建后额外核对 Wiki 空间、父节点、文档身份和标题。需求策略仍使用指定文件夹。按月绑定原文档：首次创建，后续按内容单元更新同一Docx；无变化不写飞书。未知状态只核对原文档，不重建。
- XML回读保留章节、表头/表体、行列、空格子、合并信息和段落换行，忽略自动ID及默认样式；差异进入unknown。附件仅列文件名，不自动上传本机文件。

- `POST /api/v3/briefs/:month/autosave {baseVersion,requestId,patch}`：只写本地。事务内比较版本、校验全稿、写后回读；成功返回 Brief（含version/editedAt/saveRequestId）。重复同一请求回放，不重复增版；同编号不同内容拒绝400，旧基线409 `BRIEF_SAVE_CONFLICT`。旧preview/confirm仍保留兼容。
- Brief 编辑停止输入600ms后自动保存；保存期间新增输入串行补存，不用响应替换当前输入框。按月/页面恢复日志，Web Locks隔离复制标签页，回读确认丢失响应；冲突须明确选择，导出不会绕过。切月等待保存，外层避免新月份短暂使用旧接口数据。
- XML列宽来自模板revision118：受众221/300/300、交付140/140/140/192/192、新物料文案统一使用参考4.1的145/289/377、规格230/450、负责人135/545。七节h1、物料h2，每表至少3正文行，原有多行保留。带列宽的导出用full XML回读核对列宽/行数/层级，旧收据继续原口径。

- Brief同步：GET的`feishuDocument`增加`syncedAt/synced/pending`；本地`brief-feishu-link`保存固定文档、上次本地源、实际接受的远端XML、物料ID对应标题和表格行、当前操作。`synced`表示本地源与上次已处理源一致，包括明确保留飞书的选择；不以已有链接推断已同步。附件变化也刷新元数据，显示北京时间。
- export-preview返回`operationId/previewId/mode:new-only|update|unchanged`。旧唯一成功收据迁移；旧物料缺少ID时仅按唯一名称对应，先同步一次再改名/删除，不按位置猜配。第一篇创建前也拒绝重复物料名。
- 第四节按物料ID分别处理标题、正文、新增、删除；第二三节按物料行/单元格比较。未涉及云端内容保持原块；增删物料时只重建纯文本表格，保留云端表头、列宽和额外行。遇资源或同名独有行不能安全处理时在写前阻断。
- 双改返回409 `EXPORT_REMOTE_CONFLICT`与`conflict:{id,document,sections:[{key,label,local,remote}]}`；提交`{resolveConflict:id,resolutions:{[key]:"local"|"remote"}}`逐项明确选择，缺少选择返回400 `EXPORT_CONFLICT_CHOICE_REQUIRED`，不得默认采用本地。选择绑定两端内容/身份/期限；云端独改回填后成为新的共同基线；此后仅一端修改可继续同步，两端再次同改才要求选择。第四、五、六节表格结构稳定时按单元格合并，不同格互不覆盖；无法可靠定位时保留原文档并报告结构或内容冲突。
- 双向同步：云端全文核对通过后，标准七节的文字/表格内容回填原 Brief，回填与绑定/收据同事务提交。`feishuSupplement` 按章节保留表外段落、未知行及图片/链接等复杂内容的只读摘要，完整 XML 留在同步快照；不将资源或未知结构强行压成可编辑字段。正文缩进与空行在语义未变时保持原值。每次导入前在 `brief-sync-backup` 保存原本地稿，并使旧 `lastSave` 回执失效；自动保存丢包恢复必须同时匹配 requestId 和 baseVersion+1，不能将云端回填的新版本误认成旧保存成功。
- 收据与 GET 的 `feishuDocument.localSync` 返回 `status:applied|unchanged|pending`、版本及说明。回填发现另一页面保存了新版时不覆盖新稿，返回 pending 并保留下一次合并所需基线；前端 `acceptSync()` 只在无未保存输入且读取期间无新输入时接纳服务端版本。重复确认按导入后指纹核验，旧确认不能覆盖后来草稿。逐格冲突键含行列号，选择采用飞书只影响该冲突格。
- 每步预演、紧邻写前重读、先落发送记录、单次写入、全文回读。收据持久化`steps/completed/checkpoint/attempt`，HTTP不返回XML快照。块操作从下往上执行，标题走drive改名。revision_id不是原子CAS，同步期间须暂缓编辑飞书；需求策略仍new-only。
- `GET .../exports/pending`找回本月未完成操作；GET/reconcile也可用previewId查找。`POST .../exports/:id/reconcile`只读：全量匹配则success；已发送步骤明确匹配写后状态且剩余从未发送则resumable；回读仍像写前不证明未执行，保持unknown。旧收据无逐步证据只做全文核对。
- `POST .../exports/:id/resume`仅接受resumable且无未决attempt，继续原冻结快照，当前新草稿保留待下次同步；身份、配置和绑定须一致。核对与继续互斥，防旧状态覆盖新的发送标记。首次发送前失败记aborted，可重新预检；不会因失败另建文档。

### 用户时间线完整读取（2026-10-21）

- `GET /api/v3/timeline` / `POST /api/v3/timeline/sync` 现在须完整读取4张地区明细与12张月历；范围、行列数、截断标记、前后版本均核验，任一读取失败不覆盖上次成功快照。
- 原有 `agenda/table/anomalies` 兼容。多个明确时段成为独立agenda记录，同一src可有多条；`detail`保留适用条件，条件待确认不参与自动需求推导。`table[].cellRanges[slot]`保留多个窗口及条件；禁止把中间空档并成连续区间。
- 新增 `coverage:{schools,regionSheets,calendarSheets}`；`anomalies[].c/monthHints`支持原文涉及月份的待确认列表。`*-MM`为历史/未定学年的月索引，不能当成确定日期。
- 新增 `calendarEntries:[{month,raw,src,schools,countries}]`，只保存月历原文与检索关联，不能通过摆放格位确定日期或替换地区表。不认识的学校原文仍完整保留。
- 人工采用多时段保留整格segments；单段条件同样保留标签。手填明确替换整格，排除清除所有同源分段。已有裁定仍按原文与问题指纹生效。


### 时间线官网核查叠加（2026-10-21）

- `GET /api/v3/timeline` / `POST /api/v3/timeline/sync` 返回本地版本化官网证据叠加后的日期。原始飞书快照不改；人工裁定在官网证据之后应用。
- 新增 `verifications:{checked,confirmed,unresolved,stale}`；核查注解为 `verification:{status,checkedAt,reason,scope,academicYear,sources:[{url,title}]}`。确认事件有 `verified:true`，不同分段保留 `detail`、完整年份及自己的来源格。
- 官网记录要求表格身份（title+token指纹）、school/country/src及原文问题指纹都一致，合法日期及HTTPS官网依据齐全才应用；来源变化后不借用旧学校/旧表证据。
- 月视图无确定日期的项仅作为 `pending/from:null` 展示，保留原文和“待确认”，不写入agenda；已有推测/冲突事件也计入本月待确认学校数。取消单独本月待确认区块。

## 2026-10-22 完整性修复补充

- 用户策略 GET 增加 `timelineEvidence:{status:current|changed|unavailable,fingerprint,syncedAt,basedOnSyncedAt,message}`。读取不写本地正文；无匹配完整快照时保留旧依据并提示。预览确认核对时间证据指纹；Brief指纹不受仅同步时间变化影响，日期依据变化只提示核对，不自动重写正文。
- NAS扫描任一子目录无法完整读取即失败，保留上次完整快照与成功时间；真实空目录仍可正常扫描。
- 画布失败草稿按浏览器标签页持久化到IndexedDB，跨路由保留；存储故障明确提示且全局离开保护持续生效。结果不明先查operation/receipt，不自动重复写；远端删除冲突保留本地草稿。仅已核实未写入的失败项可以移除。
- Brief附件选择即自动完成本地preview/confirm和回读，复制全文采用已保存附件名；同步前等待本月附件队列完成，同步中禁止再加入附件。失败队列跨内部路由保留，关闭/刷新有全局保护；文件未声明跨浏览器重启持久化。飞书仍仅写附件名，不上传文件。
- 自聊撤销预览与回执增加关联记录的撤回/保留说明；未被后续使用的派生草稿随同撤回，已编辑待办、已采纳需求保留。并发变化拒绝，写入事务失败整体回滚。
- 新项目模板只复制任务结构/名称/阶段/节点类型；清空负责人、开始与完成日期、逾期和交付物。
- 带教未知回复核对必须同时匹配评论ID（已有时）、段落锚点、完整正文且分页完整；不足时保持unknown，不自动重发。

## 2026-10-23 时间线多年份

- 设置 `timeline_years`：首年之后登记的年份 `[{year,title,token,url}]`（`timeline_source` 仍是首年，默认 2026）。只读展示，不能经 `/api/v3/settings` 写入，只能用下面的登记接口。
- 只登记首年时来源身份、快照、裁定与旧版完全一致；有后加年份时来源身份为全部年份来源的 JSON 数组。
- 后加年份按自己的年份解析无年份日期；地区代码记作 `UK@2027`，来源格记作 `2027·英国 爱尔兰!S2`，人工裁定与官网核验按格子对应，不串年。官网核验只对应首年。
- `GET /api/v3/timeline` / `POST /api/v3/timeline/sync` 新增 `years:[{year,title,url,tag,schools,events,anomalies}]`（`tag` 首年为空、其余为年份字符串）；`agenda/anomalies/calendarEntries/countries/table/nodes/terms` 为各年合并。同步依次只读全部年份，任一年失败都不替换快照。
- `POST /api/v3/timeline/years/preview {url}`：飞书 `/wiki/` 或 `/sheets/` 链接 → 只读解析表名（须含年份）、校验 4 张地区明细 + 12 张月历并试解析，返回 `{previewId,expiresAt,summary:{year,title,url,schools,regionSheets,calendarSheets,events,anomalies,from,to}}`；同一年或同一张表已登记返回 409。不写入。
- `POST /api/v3/timeline/years/confirm {previewId,confirm:true}`：预览后年份配置有变化返回 409；写入 `timeline_years` 并回读，再同步全部年份，返回 `{saved,years,syncedAt}`；同步失败不回滚登记，返回 `{saved,years:null,syncError}`。

## 2026-10-23 审核后接口调整

- `GET /api/v3/voice`：来源未接通不再返回 503，改为 `200 { unavailable: true, code: "VOICE_…", error }`，页面据此显示模拟数据并标明；合格空榜仍是 `200 { empty: true, hot: [] }`；其余读取失败仍按状态码返回。
- `GET /api/v3/home/todo`：每项 `{ kind, text, sub?, due, dueDate?, href, urgent? }`。`text` 是主行（节点名 / 方案名），`sub` 是次行小字（项目 · 负责人 · 到期，或 SKU 名）；原先拼在 `text` 里的项目名移到 `sub`。
- `GET /api/v3/mentor`：先回落库快照（`v3_snapshots.mentor`），超过 5 分钟后台重读飞书；`POST /api/v3/mentor/refresh` 仍现读。
- `GET /api/reports`：解析结果落库（`v3_snapshots` 的 `reports:<文档 URL>`），服务重启后先回上次完整结果，再按 staleWhileRevalidate 刷新。

## 2026-10-27 NAS 同步自动挂载

- `POST /api/v3/nas/scan`（以及首次 `GET /api/v3/nas` 触发的扫描）：NAS 目录不在、且目录位于 `/Volumes/跨部门综合资料` 下时，先用系统 NetFS 不弹框挂载 `smb://172.16.1.10/跨部门综合资料`，挂上后接着扫描。账号密码只用钥匙串里 Finder 存过的那份，代码与数据库都不存。其他目录不自动挂载。
- 挂载失败仍是 `503 { error }`，`error` 以「NAS 未挂载，自动挂载失败：」开头，后接原因与下一步：钥匙串没密码或密码已改（去 Finder ⌘K 登录一次并记住密码）、连不上 172.16.1.10（连公司网络）、找不到共享、超时或其他错误码。上次快照照常显示。
