# 接口约定

全部为 JSON；出错返回 `{ error: "中文说明" }` 与相应状态码；未实现返回 501 `{ error, task }`。
字段名用 camelCase；月份 `YYYY-MM`；业务线取值：大学辅导 / 国际课程 / 申诉服务。

## 营销 · 促销表（已实现）

`GET /api/promos` → `Promo[]`，按月份倒序

```ts
type Promo = { month: string; line: string; sku: string; trial: string; price: string; newDeal: string; renewal: string; updatedAt: string };
```

## 营销 · 方案（T01）

- `GET /api/plans` → `{ month, line, savedAt }[]`（已实现）
- `GET /api/plans/:month/:line` → `{ month, line, rawText, rawHtml, savedAt }`；无则 404（已实现）
- `POST /api/plans/parse` 请求 `{ month, line, rawText }` → `ParseResult`；只解析，不写库

```ts
type ParseResult = {
  line: string | null;              // 从【…板块】识别出的业务线；与请求不一致时前端提示
  rows: Array<{
    sku: string;                    // 已按 sku_aliases 换成库中名称
    alias?: string;                 // 原文写法（发生别名替换时）
    trial: string; price: string; newDeal: string; renewal: string;
    status: "new" | "changed" | "same";   // 对比库中「同月同业务线」已有行；若本月无数据则对比上一个有数据的月份
    changed?: Array<"trial" | "price" | "newDeal" | "renewal">;
    previous?: Partial<Promo>;      // 对比对象，用于悬停显示旧值
  }>;
  removed: string[];                // 库中该 月份×业务线 有、本次原文没有的 SKU（确认后将删除）
  unrecognized: Array<{ lineNo: number; text: string }>;
};
```

- `PUT /api/plans/:month/:line` 请求 `{ rawText, rawHtml?, rows }`（rows 为本人确认后的解析结果）→ `{ inserted, updated, removed }`
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
type Assistant = { id: number; name: string; kind: "copywriter" | "imported" | "custom"; instructions: string; codexThreadId: string | null; createdAt: string };
type Message = { role: "user" | "assistant"; text: string; at?: string };
```

- `GET /api/assistants` → `Assistant[]`（已实现）
- `POST /api/assistants` 请求 `{ name, instructions }` → `Assistant`（kind = custom）
- `PATCH /api/assistants/:id` 请求 `{ name?, instructions? }` → `Assistant`
- `GET /api/assistants/:id/messages` → `Message[]`（从 Codex 会话读取历史）
- `POST /api/assistants/:id/messages` 请求 `{ text }` → 流式返回（`text/event-stream`，事件 `delta` / `done` / `error`）
- `GET /api/codex/sessions` → `{ threadId, name, updatedAt, cwd }[]`（本机 Codex 会话，已导入的标 `imported: true`）
- `POST /api/assistants/import` 请求 `{ threadIds: string[] }` → `Assistant[]`

## 首页 · 日报周报 · 日历 · 配置

- `GET /api/calendar/today` → `{ time, title, place }[]`（T06）
- `GET /api/settings` → `Record<string, string>`（已实现；未配置或已清空的键不出现）
- `PUT /api/settings/:key` 请求 `{ value }` → `{ key, value }`（T07）

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
