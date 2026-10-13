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
- `GET /api/reports` → `{ id, kind: "日报" | "周报", date, title, body }[]`，按日期倒序（T05）
- `GET /api/reports/:id` → 单篇（T05）
- `GET /api/settings` → `Record<string, string>`（已实现）
- `PUT /api/settings/:key` 请求 `{ value }` → `{ key, value }`（T07）

配置键：`brand_base_url`、`report_doc_url`、`material_types`（JSON 字符串数组）。
