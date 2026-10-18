# T12 · Codex 后端交接

日期：2026-10-18。工作区 `/Users/nat/Documents/ChatGPT/个人/work/work-desk-t10`，分支 `codex/t10-final`，HEAD `c118a0bf24ee13677cc1984f896f5100ace3163c` 未改变。

后端实现及工程验证完成，待 Claude 接线复测。**真实首跑被 CLI 权限预检阻塞：`wiki:space:read` 缺失。** 未真实收藏、未由 5280 采用、未发布，用户验收未完成。

## 实现

- `server/kb-collect.mjs`：一次请求收藏、来源解析、全树分页查重、规则归类、自选目录、持久 requestId、只调用一次创建、严格回读、最近50条，以及未知结果的只读核对。输入快捷方式会归一到实体原文；不移动、不复制原文。
- `server/kb-collect-config.mjs`：默认空间和七条规则；关键词规范化与上限；规则预览时真实只读验证节点属于目标空间。
- `server/kb-collect-pairing.mjs`：配对码首次读取时生成，持久保存在数据目录数据库的私有 `v3_documents` 记录；预览确认轮换、写后回读、Host/Origin与扩展请求头校验。没有日志输出配对码，没有 CORS 放行头。
- `server/knowledge-tree.mjs`：收藏复用已有 `kb-operation`、`kb-write-lock`、身份检查及操作查询/核对入口。
- `server/projects.mjs`：仅安全保留 CLI 的数字上游错误码，以识别未挂载 Wiki 的云盘来源；不透出原始错误。
- `server/routes/projects.mjs`：接入收藏、最近记录、配对读取及轮换端点，鉴权先于请求体和链接解析。
- `server/v3-settings.mjs`：新增两个默认键；只为收藏规则增加异步节点预检，保留旧设置的同步行为及预览确认回读。
- `tests/t12-collect.test.mjs`：32项新回归，使用假 CLI 命令替身，覆盖合同场景、并发/重启、数据库故障、未知回执与恢复、配对和设置。

接口路径及成功形状保持 API 合同；没有实现已撤回的 collect/preview、collect/confirm。源文件增量见 `t12-code.patch`，以开工时未提交文件为基线，包含本轮8个实现/测试文件，不混入旧成果。

## 验证与证据

- `WORKDESK_DATA_DIR=$(mktemp -d) npm test`：373通过、0失败、0跳过、0TODO；原341项保留，新32项。见 `npm-test.log`。
- `npx vite build --outDir "$(mktemp -d)"`：通过；构建输出在临时目录。保留既有大于500kB的分包提示，未扩展到前端优化。见 `vite-build.log`。
- `git diff --check`：通过。文件保护核对见 `scope-verification.json`。
- 两路独立静态审查各发现一项问题，均修复并复核；首败与修复见 `首败与复核.md`。
- `readonly-preview.json`：真实“我的文档库”docx元信息只读预览；目标全树76个节点，样本未查到重复，多命中按规则首项选择“管培带教”。标识已打码。源标题很长，证据只保留首行，未读文档正文。
- `node-create-dry-run.json`：真实源与目录的带 `--dry-run` 命令输出；exit3，`authorization / missing_scope / wiki:space:read`。未真实提交，不能当作创建验证通过。
- 本轮无新增界面截图；既有Claude截图未改变。真实后端接线、扩展端到端和用户验收留给Claude，不能用后端测试或旧替身截图替代。

## 需 Claude 校准的补充约束与遗留

1. 权限阻塞：只读可成功，创建命令的dry-run预检仍缺 `wiki:space:read`。保持当前 profile/user/应用，不自动改授权。用户在场首跑前须核对并解决；本轮未扩大权限。
2. 为复用旧知识库整理的互斥机制，未知结果保留**整个目标空间**的现有写锁，而非仅阻止该原文。该原文跨目标空间也不能绕过未知记录。其他文档在同空间可能收到同一 `COLLECT_PENDING` 回执。请 Claude 在 API 文档补充这一保守限制；不另建锁体系。
3. 规则要求节点标识唯一、恰有一个空关键词兜底目录；关键词按大小写不敏感去重、去空白，规范化后计数。规则预览绑定目标空间；空间键允许独立修改，以便先改空间再迁移规则。收藏时会再检查实际目录。请 Claude 在设置说明补充；API文档本轮未改。
4. 旧版 `obj_type:doc` 的 Wiki 来源：若已在目标空间仍正常查重；如需新建，因当前CLI不支持该创建类型，提交前返回422 `COLLECT_SOURCE_UNSUPPORTED`，零创建、不留未知锁。请 Claude 补充支持类型说明。
5. 未知请求的原 requestId 永远重放原502回执，包括核对成功之后；通过操作查询/核对看到 `state:verified`，再以新请求判断重复。这样不会悄悄重发原请求。
6. 同源门禁只接受现有本地运行地址（127.0.0.1/localhost/IPv6 loopback）；外来Host即使不带Origin也拒绝，防止配对码泄露。Vite页面端口与后端端口可以不同，保留代理Host。
7. 源/目标读取不完整时停止；目录超过2000节点沿用既有读取上限。配对码重新生成与规则设置仍需预览确认。结果不明且找不到唯一符合身份的新节点时继续锁定，不自动重建或清锁。
8. `kb_collect_space` 没有设置页入口、扩展尚未安装到用户Chrome、T11-2/T11-3及其他原遗留不在本轮实现范围。

唯一下一步：**Claude 接线复测 T12**。顺序与权限边界见 `首跑清单.md`；真实首跑是一篇“我的文档库”文档和一篇云盘文档，必须用户在场、Claude陪同。本轮不提交、不push、不合并、不发布、不重启正式服务、不调用模型、不发消息、不新增常驻/定时任务。
