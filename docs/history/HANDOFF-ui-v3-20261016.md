# 交接：工作台 UI 全量改版（ui-v3）

更新日期：2026-10-16。本文件在 worktree `/Users/nat/Documents/ChatGPT/个人/work/work-desk-ui-bitmap`。
主工作区 `/Users/nat/Documents/ChatGPT/个人/work/work-desk` 里的 `HANDOFF.md`（新增需求梳理）和 `HANDOFF-位图风UI.md`（T09）是**更早的两项任务**，不要和本文件混用。

## 0. 位置速查

| 项目 | 值 |
|---|---|
| 本任务工作区 | `/Users/nat/Documents/ChatGPT/个人/work/work-desk-ui-bitmap`（git worktree） |
| 分支 | `ui-v3`，从 `main` 的 `c3fa737` 新建；**已提交，未 push** |
| 主工作区 / 正式服务 | `/Users/nat/Documents/ChatGPT/个人/work/work-desk`（main）· http://127.0.0.1:5280（PID 87820）。**不得操作** |
| 开发预览（本任务） | 页面 http://127.0.0.1:5296（vite，PID 60699）· API http://127.0.0.1:5295（node，PID 63057） |
| 隔离数据目录 | `/tmp/workdesk-ui-v3.6nAf`（真实 `data/work-desk.db` 的副本） |
| 诊断报告 + 改前改后截图 | `docs/design/diagnosis/index.html`（第 7 节是最终结果），用 http://127.0.0.1:5310/docs/design/diagnosis/index.html 打开（python 静态服务，PID 60724） |
| 接口清单（给 Codex） | `docs/tasks/V3-接口清单.md` |
| 视觉规范 | `docs/STYLE-GUIDE.md` v2.2（第 1 节语义色，第 6 节版式规则） |
| 其他 | 5292 是 T09 的旧预览（PID 52385，已过时），可以停掉 |

## 1. 目标与完成情况

在用户确认过的 5280 结构上全量优化 UI，并给需求共识里的新功能做出界面。分工：**UI 由 Claude 做，Codex 只按接口清单实现功能。**

| 完成标准 | 状态 |
|---|---|
| 用户逐页验收，修改意见全部改完 | ✅ 3 轮逐页修改 + 1 轮版式统一，均已验收 |
| 在 `ui-v3` 提交（不 push） | ✅ 已提交（见 `git log`） |
| Codex 按接口清单把示例数据换成真实接口 | ✅ 后端 `bcddbe2`（第 2–5 批、营收演示、状态接口）；前端接线与验收见 `docs/handoff/V3-UI/`，待用户验收 |
| 合并回 main、切换 5280 | ⏳ 等用户另行授权 |

## 2. 关键决策与约束

**用户已定的方案**（不要推翻）：
- 侧栏：「工作」= 首页、营销、用户、Voice、品牌、业务；「协作与工具」= 项目、知识库、Agent、日/周报；设置在最下面。
- 首页：Codex 重置大卡（顶部重置横条也保留）、待我处理、交付月、今日日程、用户之声词云、Agent。**业务营收完成度在「业务」页**，不在首页。
- 营销页签顺序：营销战役 · 月度促销 · 价格记录 · 物料沉淀 · 设计 brief。月度促销 = 上半「当月促销」（选月份、业务线，粘贴 → 解析 → 处理 → 确认）+ 下半「方案汇总」（原促销表）。营销战役顶部是月底交付倒计时条（本月每天一格，右边完成 x/6）。
- 用户：用户时间线（按月时间轴 · 明细表 · 异常）+ 用户策略（主线需求已并入，需求 → 拆解 → 营销 / 产品 / 运营行动）。来源单元格默认收起。
- Voice：留学之声独立成侧栏模块，放在用户下面。
- 知识库：在原有拖动整理之上加了搜索、详情面板、健康检查。
- 图标：7×7 实心像素（`src/ui/icons7.js`，C 方案，选型记录在 `docs/design/icons-compare.html`）。
- 配色：黑灰橙为基调，加语义色（绿达成、红风险、蓝信息、琥珀待处理）；时间线事件另有类别色。
- 版式：8 条规则见 `STYLE-GUIDE.md` 第 6 节，实现集中在 `src/styles-layout.css`（最后加载，只管位置、尺寸、间距）。
- **只做电脑端，不做手机端。全部 UI 由 Claude 做**，Codex 只实现功能。

**禁止事项**：不碰主工作区和 5280，不在主工作区构建，不 push；测试只用隔离数据目录；不改功能逻辑和数据，新增依赖先问；回复一律用简体中文。

## 3. 已完成

- **页面**：首页、营销（5 个页签）、用户（时间线、用户策略）、Voice、品牌（占位）、业务（营收完成度 + 业务线占位）、项目（推进、带教）、知识库、Agent、日/周报、设置、自言自语抽屉、Codex 预警横条。
- **公共层**：`src/styles-layout.css`（版式层）、`StatStrip` 概况数字条（`src/ui/components.jsx`）、`icons7.js`、语义色变量（`src/styles.css`）。
- **示例数据**：`src/samples/v3.js`；后端 `server/routes/v3.mjs` 对 `/api/v3/*` 一律返回 501，前端自动显示示例并标「示例」。
- **验证**（最后一次）：`WORKDESK_DATA_DIR=$(mktemp -d) npm test` 85 项通过；`npx vite build --outDir "$(mktemp -d)"` 通过；18 个页面 1440 宽截图无页面报错；版式测量脚本显示并排板块底边差为 0、卡头只有 48px 一种。
- **文档**：`STYLE-GUIDE.md` v2.2、`V3-接口清单.md`（已同步所有新字段与路径）、诊断报告第 7 节（轮次、改前改后、剩余问题）。

## 4. 剩余问题与待用户决定

1. **真实数据**：所有 v3 接口都是示例。营收完成度需要用户提供飞书多维表格（接口 `GET /api/v3/business/revenue`）。
2. **价格口径真实值**：毛利底线和课时成本仍是演示值 25%、440 元（`SAMPLE_PRICE_SCHEMES`）。
3. **未验证**：方案录入「粘贴后自动解析」需要用户实际粘贴一次；NAS 访问方式未实测。
4. **日/周报**：原文档内容太杂，用户说之后再整理。
5. **业务页**：三条业务线指标卡仍是占位。
6. **预览服务配置**：仓库 `.claude/launch.json` 只有 5280 的 `work-desk` 配置，**不能用**；重启预览用第 6 节命令。是否把 5295/5296 写进 `.claude/launch.json` 由用户决定。

## 5. 踩过的坑

- **原型 v3 被否定**（`docs/design/index.html`、`proto.css`、`pages-*.js` 等）：只做记录。其中 Codex 重置卡、战役横条、月底倒计时条、留学之声的形式是用户点名要沿用的，已在正式代码里实现。
- **v3 新路由要重启 API 才生效**，否则 `/api/v3/*` 返回 404 而不是示例。
- **预览工具读的是会话最初目录里的 launch.json**；无头截图更可靠（playwright 驱动：`/Users/nat/.codex/skill-runtime/huashu-design/python/bin/python3`）。
- **全页截图里的吸顶元素**（时间轴表头、知识库暂存条）会盖住内容，不是页面问题；时间轴表头已取消吸顶。
- **`.tnum` 默认右对齐**：在非表格场景（时间线格子、卡片里的日期）要显式左对齐。
- **共用类名**：营销战役与项目推进的节点清单共用 `.node-list`，改一处会影响两处。
- **时区**：按周、按日计算一律用本地日期函数，不用 `toISOString()`。

## 6. 下一步

1. **交给 Codex**：按 `docs/tasks/V3-接口清单.md` 逐个实现接口，实现一个删一个示例常量，确认页面「示例」标记消失；UI 有改动需求先在交接里提出。
2. **合并回 main、切换 5280**：等用户另行授权。
3. **收尾（删除前先问用户）**：停掉 5292（`kill 52385`）、5310（`kill 60724`）；删除临时数据 `/tmp/workdesk-ui-v3.6nAf` 和 T09 的 `/var/folders/19/41dqp8kj55x991m3vjqpxthc0000gn/T/tmp.vPEKVm6npK`。

预览服务不在时，在 worktree 根目录分别后台运行（`/tmp/workdesk-ui-v3.6nAf` 不在时，新建临时目录并只读复制主工作区 `data/work-desk.db`）：

```bash
WORKDESK_DATA_DIR=/tmp/workdesk-ui-v3.6nAf PORT=5295 node server/index.mjs
```

```bash
WORKDESK_API_PORT=5295 npx vite --host 127.0.0.1 --port 5296 --strictPort
```
