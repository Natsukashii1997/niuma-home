# T04 助手接入 Codex

## 目标

在工作台里直接和本机 Codex 对话（使用本人 Codex 账号与额度）：文案助手、从 Codex 导入的已命名会话、新建助手。全部只读。

## 背景

- 本机 `codex-cli 0.160.1`，有 `codex app-server`（JSON-RPC，Codex App / IDE 插件使用的协议）。协议可用 `codex app-server generate-ts` 或 `generate-json-schema` 生成，以实际生成结果为准。
- 之前的探查记录可参考（只读）：`~/Documents/ChatGPT/个人/outputs/Codex-Hermes-项目监工-独立试点-规划-v0.1/T01-app-server-idle-probe.md`。
- 表：`assistants`（kind：copywriter / imported / custom；`codex_thread_id`）。已预置「文案助手」。
- 页面骨架：`src/modules/assistants/AssistantsPage.jsx`。接口：docs/API.md「助手」。

## 范围

1. 新建 `server/codex.mjs`：管理一个 app-server 子进程（按需启动、异常退出后下次请求时重启），封装：列出会话、读取会话历史、新建会话、在会话上发送一轮并流式返回。
2. **权限：所有会话一律只读沙箱、不请求审批**（sandbox read-only，approval never）；工作目录为 `data/assistants/<id>/`（新建、文案助手）或导入会话原有目录。若协议要求审批，自动拒绝。
3. 助手预设说明：新建会话时作为开发者 / 系统说明传入（以协议支持方式为准）；修改说明只影响之后新建的会话，交接里说明实际行为。
4. 接口：实现 API.md「助手」全部接口；发送消息以 SSE 流式返回。
5. 页面：
   - 输入框可用，Enter 发送、Shift+Enter 换行；回复流式显示；出错显示原因且保留输入。
   - 「新建助手」弹窗：名称 + 预设说明。
   - 助手详情可编辑名称与预设说明（文案助手同样可编辑，说明内容待用户提供，先留空）。
   - 「导入 Codex 会话」弹窗：列出本机会话（显示名称、最近更新时间、目录），勾选导入；已导入的置灰。
6. 删除 `samples.js` 里的 `sampleMessages`；`PendingButton` 换成 `Button`。

## 验收

- [ ] 手动：文案助手里发一句话并收到流式回复；导入一个已命名的 Codex 会话并能看到历史、继续对话；新建助手并对话。截图放 `docs/handoff/T04/`。
- [ ] 手动：让助手「在当前目录新建一个文件」，确认被拒绝且无文件产生；交接里附结果。
- [ ] 关闭再打开工作台，会话历史仍可读取。
- [ ] 测试：`server/codex.mjs` 的消息组装与流式事件转换（用假的 app-server 输入输出，不真实调用 Codex）。

## 不做

- 不做审批弹窗、写文件或执行命令。
- 不做助手之间共享记忆；文案助手不自动带入方案内容。
- 不做模型选择（用 Codex 默认配置）。
