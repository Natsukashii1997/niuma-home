# 交接：工作台 UI 全量改版（ui-v3）

交接日期：2026-10-16。本文件写于 worktree `/Users/nat/Documents/ChatGPT/个人/work/work-desk-ui-bitmap`，内容基于当时的 `git status`、`git diff` 和运行中的进程核对。
主工作区 `/Users/nat/Documents/ChatGPT/个人/work/work-desk` 里的 `HANDOFF.md`（新增需求梳理）和 `HANDOFF-位图风UI.md`（T09）是**更早的两项任务**，不要和本文件混用。其中 T09 已经并入 main，见下文。

## 0. 位置速查

| 项目 | 值 |
|---|---|
| 本任务工作区 | `/Users/nat/Documents/ChatGPT/个人/work/work-desk-ui-bitmap`（git worktree） |
| 分支 | `ui-v3`，从 `main` 的 `c3fa737` 新建，**全部改动未提交** |
| 主工作区 / 正式服务 | `/Users/nat/Documents/ChatGPT/个人/work/work-desk`（main）· http://127.0.0.1:5280（PID 87820）。**不得操作** |
| 开发预览（本任务） | 页面 http://127.0.0.1:5296（vite，PID 60699）· API http://127.0.0.1:5295（node，PID 63057） |
| 隔离数据目录 | `/tmp/workdesk-ui-v3.6nAf`（真实 `data/work-desk.db` 的副本） |
| 诊断报告 + 改前改后截图 | `docs/design/diagnosis/index.html`，用 http://127.0.0.1:5310/docs/design/diagnosis/index.html 打开（python 静态服务，PID 60724） |
| 需求共识 | 主工作区 `docs/需求共识-2026-10-15.md`（未跟踪文件，只读参考） |
| 接口清单（给 Codex） | `docs/tasks/V3-接口清单.md` |
| 视觉规范 | `docs/STYLE-GUIDE.md`，已改成 v2.1 |
| 其他 | 5292 是 T09 的旧预览（PID 52385，读本 worktree 的 `dist/`，已过时），可以停掉 |

## 1. 目标

在你确认过的 5280 结构上，对工作台做一次全量 UI 优化，并把需求共识里的新功能全部做出界面。分工：**UI 由 Claude 做，Codex 只按接口清单实现功能。**

完成标准：
1. 你逐页验收 UI，提出的修改意见全部改完；
2. 你同意后，在 `ui-v3` 分支提交（不 push）；
3. Codex 按 `docs/tasks/V3-接口清单.md` 把示例数据换成真实接口（不属于 Claude 的工作）；
4. 之后的合并和 5280 切换，等你另行授权。

## 2. 关键决策与约束

**你拍板的方案**（全部按诊断报告里的推荐执行，详见 `docs/design/diagnosis/index.html` 第 6 节）：
- 必须在 5280 已确认的结构上增改，不另起一套。信息架构选 A：
  - 侧栏分两组：「工作」是首页、营销、用户、品牌、业务；「协作与工具」是项目、知识库、Agent、日/周报；设置放在最下面；
  - 营销的页签：方案（月度台账）· 促销表 · 价格 · 物料 · 设计 brief · 营销战役；
  - 设计参考放在物料下面，作为一个页签。
- 位图风只是借鉴，不照搬，形式要服务于使用：
  - 像素字体每张卡最多用 1 个主数字；表格和价格一律用等宽字体、右对齐；
  - 网点不压在文字下面；
  - 图标全部重画成 16×16 网格（`src/ui/icons16.js`）；
  - 模块切换的溶解动效缩短为 3 帧，约 200ms。
- 效率优先：能就地编辑就就地编辑，支持批量、键盘、撤销；写飞书或写 NAS 之前先暂存、预览。
- 价格：课时卡分 5–200 小时 8 档，与多套价格方案组成矩阵，同一档跨方案对比。数据来自你给的「灵活学Lite」价格表。
  - 课时单价按「总价 ÷（课时 + 赠送）」算，同时显示付费单价 = 总价 ÷ 课时。
- 时间线以严谨为第一：按国家看清洗后的明细表，按月看议程；每格写完整起止日期和来源单元格；冲突和推测单独标出。
- 知识库：一棵可编辑的树加暂存区，支持拖动、多选、⌘X/⌘V、F2、⌘⇧N、⌘Z，另加规则批量。
- **只做电脑端，不做手机端**（你在 10-16 明确说的）。
- **全部 UI 由 Claude 做，不派单给 Codex 做 UI**；Codex 只实现功能。`AGENTS.md` 的分工已经按这个改了。

**禁止事项**：
- 不碰主工作区和 5280，不在主工作区构建，不 push；
- 测试只用隔离数据目录；
- 不改功能逻辑和数据；新增依赖要先问你；
- 你确认过的设计不推翻；
- 回复一律用简体中文。

## 3. 已完成

- ✅ **全量诊断报告**：`docs/design/diagnosis/index.html`，包括定级、数据逻辑关联、方向线框、已定事项，以及第 7 节「执行结果」的改前改后截图。已经用无头浏览器截图核对过显示效果。
- ✅ **基础层**：
  - 16px 图标：`src/ui/icons16.js`，56 个；`PixelIcon` 改为只按 16 或 32 渲染，在 `src/ui/bitmap.jsx`；
  - 溶解动效改为 3 帧；
  - 新侧栏分组，见 `src/App.jsx`；
  - 公共组件 `Modal`、`useToast`、`MonthSwitch`、`StatusMark`、`Placeholder`，在 `src/ui/components.jsx`；
  - 轻量 Markdown 渲染：`src/ui/markdown.js`、`src/ui/Markdown.jsx`；
  - 示例缩略图：`src/ui/Thumb.jsx`；
  - 全局样式：`src/styles-v3.css`，在 `src/main.jsx` 里 `styles.css` 之后引入；
  - 月份工具 `deliveryMonth`、`daysToDeadline`、`shiftMonth`，在 `src/constants.js`。
- ✅ **现有页面改版**：
  - 首页：主角改成交付月卡、待我处理、日报事项；
  - 方案改成月度台账：`src/modules/marketing/PlansView.jsx`；
  - 方案录入：粘贴后自动解析，变化格显示旧值；
  - 促销表：网点不压字，长文本两行可展开，整行和整组复制，分组时隐藏重复列；
  - Agent：模型设置收进按钮，加知识库页签和常用开场；
  - 日/周报：Markdown 渲染成事项表，可以按状态、T 线、关键词筛选；
  - 设置：分组的紧凑行，点编辑才展开。
- ✅ **新页面**：
  - 营销：价格、物料（物料墙、营销物料、设计参考画布、本地物料）、设计 brief、营销战役；
  - 用户：时间线（明细表、议程、异常）、主线需求、策略占位、留学之声；
  - 项目：项目推进、管培带教；
  - 知识库整理；
  - 自言自语抽屉：`src/modules/selftalk/SelfTalk.jsx`；
  - Codex 预警横条：`src/modules/home/CodexStrip.jsx`。

  这些页面的数据接口都还没实现：后端 `server/routes/v3.mjs` 对 `/api/v3/*` 一律返回 501，前端自动改用 `src/samples/v3.js` 里的示例数据，并标「示例」。
- ✅ **验证**：
  - `WORKDESK_DATA_DIR=$(mktemp -d) npm test`：85 项通过、0 失败；
  - `npx vite build --outDir "$(mktemp -d)"`：通过；
  - 用无头 Chromium 截了 21 个路由的 1440 宽截图，没有页面报错（只有预期中的 501）；
  - 用脚本实测了关键交互：知识库拖动、按规则整理、撤销；价格格子改价；战役节点勾选；画布拖拽；抽屉快捷键 E；Codex 详情弹窗；设置展开；Agent 知识库页签。
- ✅ **文档**：
  - `docs/STYLE-GUIDE.md` 改为 v2.1；
  - `AGENTS.md` 的分工改为「UI 由 Claude 做，Codex 做功能」；
  - 新增 `docs/tasks/V3-接口清单.md`。
- ⚠️ **未验证**：
  - 方案录入「粘贴后自动解析」，原因是模拟剪贴板粘贴受限；
  - 1280 宽下的显示；
  - 「减少动态效果」模式下新页面的表现。
- ⚠️ **你还没验收**：你已经说「有修改意见，侧栏打开我来逐页反馈」，但具体意见还没给出。

## 4. 卡点

没有技术报错。等你决定的事：
1. **逐页修改意见**：还没收到，这是下一步的输入。
2. **是否在 `ui-v3` 提交**：你验收通过后再问。
3. **价格口径的真实值**：毛利底线和课时成本，现在是演示值 25% 和 440 元，写在 `src/samples/v3.js` 的 `SAMPLE_PRICE_SCHEMES`。
4. **新会话怎么启动预览服务（待确认）**：本会话的预览服务配置写在临时目录的 launch.json 里，那个目录会随本会话被清理。仓库里的 `.claude/launch.json` 只有一个 `work-desk` 配置，它会在 5280 端口执行 `npm start`，**不能用**。新会话如果要重启预览，用下面第 6 节的命令；要不要把配置写进 `.claude/launch.json`（这是被跟踪的文件），请你决定。

## 5. 踩过的坑

- **原型 v3 被你否定了**：`docs/design/index.html`、`proto.css`、`core.js`、`pages-*.js`、`README.md`、`T10-派单草稿.md`。原因有五：它另起了信息架构、照搬了参考风格、知识库没有拖动所以低效、价格模型错了、时间线不严谨。这些文件只做记录，**不要再照它开发**。
- **v3 新路由要重启 API 才生效**：加了 `server/routes/v3.mjs` 以后，API 服务需要重启，否则 `/api/v3/*` 返回 404「接口不存在」，前端显示的也是这个，而不是示例数据。
- **预览工具读的是会话最初目录里的 launch.json**：`preview_start` 按名字找配置时，读的是会话最初那个临时目录下的 launch.json；在 worktree 的 `.claude/launch.json` 里加配置不生效，找不到名字时还会回落到第一个配置。
- **内置浏览器窗格太窄**：1440 视口会被缩放显示，截图看不清细节。核对时改用无头 Chromium 截全页图。脚本在临时目录里，会被清理；playwright 驱动的路径是 `/Users/nat/.codex/skill-runtime/huashu-design/python/lib/python3.12/site-packages/playwright/driver/package`。
- **时区问题**：用 `toISOString()` 按周分组时，北京时间会被算成前一天，议程的周显示成了 11-01。已改用本地日期函数 `ymd()`，见 `src/modules/user/UserPage.jsx`。
- **CSS 类名冲突**：`.hot` 曾经和点阵图的 `i.hot` 冲突，导致圆点被放大；留学之声的样式已经限定在 `.hot-list` 里面。
- **`[hidden]` 被覆盖**：组件自己设了 `display` 时，`[hidden]` 不生效，所以全局加了 `[hidden]{display:none!important}`。
- **示例标记文字太长**：「示例 · V3-接口清单」会挤坏标题，已改为只显示「示例」，编号放进悬停提示。

## 6. 下一步（按优先级）

1. **收集你的逐页修改意见，并整理成清单给你确认，先不改代码。**
   - 先确认预览可以打开：`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5296/` 返回 200，就说明服务还在。
   - 如果服务不在了（进程退出或者机器重启），在 worktree 根目录分别后台运行：

     ```bash
     WORKDESK_DATA_DIR=/tmp/workdesk-ui-v3.6nAf PORT=5295 node server/index.mjs
     ```

     ```bash
     WORKDESK_API_PORT=5295 npx vite --host 127.0.0.1 --port 5296 --strictPort
     ```

     如果 `/tmp/workdesk-ui-v3.6nAf` 已经不存在，就新建一个临时目录，再复制一份 `/Users/nat/Documents/ChatGPT/个人/work/work-desk/data/work-desk.db` 进去。**只读复制，不写原文件。**
   - 然后用内置浏览器打开 http://127.0.0.1:5296/#/home，让你逐页点看。
2. **按你确认的清单修改 UI。**
   - 每轮改完都要：重新截 1440 宽的图做对比；跑 `WORKDESK_DATA_DIR=$(mktemp -d) npm test` 和 `npx vite build --outDir "$(mktemp -d)"`；
   - 最多改 3 轮；
   - 遵守第 2 节的全部约束。
3. **你验收通过后，问你是否在 `ui-v3` 分支提交**，提交信息末尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。不 push。
4. **更新 `docs/design/diagnosis/index.html` 第 7 节**的改后截图和剩余问题。
5. **之后交给 Codex 实现功能**：按 `docs/tasks/V3-接口清单.md`。另外，合并回 main、切换 5280，都要等你另行授权。
6. **收尾，删除前都先问你**：
   - 停掉不再需要的服务：5292（`kill 52385`）、5310（`kill 60724`）；
   - 删除临时数据：`/tmp/workdesk-ui-v3.6nAf`，以及 T09 的临时数据 `/var/folders/19/41dqp8kj55x991m3vjqpxthc0000gn/T/tmp.vPEKVm6npK`。
