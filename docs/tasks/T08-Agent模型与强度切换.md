# T08 Agent 模型与推理强度切换

派单日期：2026-10-14（Claude）。前置：T04（已交付，待验收）。接口见 `docs/API.md`「助手」。

## 目标

在「Agent」页面切换每个助手使用的模型和推理强度，交互与 Codex 里 `/model` 一致：可选项是当前账号实际可用的模型，以及该模型支持的强度；改动从下一条消息起生效。

## 已核实的协议事实（codex-cli 0.160.1，`codex app-server generate-json-schema`）

- `model/list`（参数 `cursor`、`limit`、`includeHidden`）返回 `Model[]`。每个模型的必填字段有：`id`、`model`、`displayName`、`description`、`hidden`、`isDefault`、`defaultReasoningEffort`，以及 `supportedReasoningEfforts: { reasoningEffort, description }[]`。
- `turn/start` 接受 `model` 和 `effort`，作用于「本轮及之后的轮次」，与 Codex 里切换模型的语义相同。
- `thread/start`、`thread/resume` 的响应里都有当前生效的 `model` 和 `reasoningEffort`。
- 本机 Codex 默认配置在 `~/.codex/config.toml`，工作台**只读**，不得修改。
- 实施时以本机重新生成的 schema 为准；如字段与上面不一致，先停下写进交接。

## 范围

1. **数据**：`assistants` 表新增两列 `model TEXT`、`effort TEXT`，都可以为空，为空表示「跟随 Codex 默认配置」。
   - 在 `server/db.mjs` 的 SCHEMA 里加上这两列，同时为已有数据库补迁移：先用 `PRAGMA table_info` 检查列是否存在，不存在时 `ALTER TABLE … ADD COLUMN`。只加列，不改已有列。
   - 迁移必须能在真实库上安全执行：可以重复执行，执行后已有行的这两列为空。
2. **后端**
   - `server/codex.mjs` 封装 `model/list`：分页取完，不含隐藏模型，缓存 10 分钟。
   - 接口 `GET /api/codex/models`，形状见 API.md。
   - `PATCH /api/assistants/:id` 增加可选字段 `model`、`effort`，两者都允许传 `null` 表示恢复默认。校验规则：
     - `model` 必须在当前模型列表里
     - `effort` 必须在该模型的 `supportedReasoningEfforts` 里
     - 只传 `effort` 时，按已保存的 `model` 校验
     - `model` 为空时，`effort` 也必须为空：跟随默认时不单独指定强度，与 Codex 默认配置保持一致
   - 发送消息时，助手设置了 `model` 或 `effort`，就在 `turn/start` 里带上；没设置就不传，沿用会话现有设置。只读沙箱、`approvalPolicy: never` 等只读约束一律不变。
   - 新增 `GET /api/assistants/:id/runtime`：已有会话时，从 `thread/resume` 读出当前生效的模型和强度；没有会话时返回 `null`。用于页面显示实际生效值。
   - 某个助手正在回复时拒绝修改设置，返回 409。
3. **页面**（`AssistantsPage.jsx` 对话区顶部）
   - 两个下拉框：「模型」和「强度」。
     - 模型选项：「跟随默认」+ 模型列表（显示 `displayName`，悬停显示 `description`）
     - 强度选项：所选模型支持的强度，显示原值和说明；选「跟随默认」时强度框置灰
   - 换模型时，强度自动设为该模型的 `defaultReasoningEffort`，并给出提示。
   - 修改后立即保存（`PATCH`），保存成功后回读核对；失败时恢复原值并显示原因。正在回复时两个下拉框不可用。
   - 下拉框旁用小字显示「当前生效：<模型> · <强度>」，取自 runtime 接口；没有会话时显示「跟随 Codex 默认」。
   - 从 Codex 导入的会话，修改时提示：「将同时改变该 Codex 会话之后的模型与强度，与在 Codex 中切换一致。」
   - 已保存的模型不在当前列表里（下架或换账号）时，显示警告并阻止发送，直到重新选择或恢复默认。
4. 模型列表读取失败时，下拉框显示失败原因，并保留当前已保存的值，不能显示成空列表。

## 验收

- [ ] 测试（假的 app-server，不真实调用模型）：
  - 模型列表分页与隐藏过滤、缓存
  - `PATCH` 的各项校验：模型不存在、强度不受支持、`model` 为空但 `effort` 有值、`null` 恢复默认、回复中 409
  - `turn/start` 参数：有设置时带 `model / effort`，无设置时不带，只读字段始终存在
  - runtime 接口读取生效值
- [ ] 迁移测试：在一个只有旧表结构（没有新列）的数据库上打开两次，列只加一次，已有行数据不变。
- [ ] 手动（隔离数据目录）：
  - 切换到列表里的另一个模型和强度，发一条消息，回复正常
  - runtime 显示的生效值与所选一致
  - 恢复默认后再发一条消息
  - 截图放 `docs/handoff/T08/`：下拉框展开、生效值、保存失败、模型不可用警告
- [ ] `npm test`、`npm run build` 通过。

## 数据边界

- 开发与验证使用隔离数据目录；真实 `data/` 只读核对，前后记录 SHA-256。
- 真实库的列迁移会在正式服务重启时自动执行，因此**本单交付不包含重启 5280**。正式切换要另行由用户授权：先备份数据库，重启后核对只新增了两列、其他表的数据没有变化。
- 不修改 `~/.codex/config.toml`，不 push。

## 不做

- 不改 Codex 全局默认模型；不做 service tier（速度档）切换；不在每条消息上标注所用模型。
- 不放开只读限制。
