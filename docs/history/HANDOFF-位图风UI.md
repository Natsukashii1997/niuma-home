# 交接：工作台位图风 UI 改造（T09）

交接日期：2026-10-15。本文件基于当时的 git 状态、CURRENT.md 和运行中的进程核对编写。
注意：同目录下的 `HANDOFF.md` 是**另一项任务**（新增需求梳理），和本任务无关，不要混用。

## 0. 位置速查

| 项目 | 路径 / 值 |
|---|---|
| 主工作区（正式版，5280 从这里读 `dist/` 和 `data/`） | `/Users/nat/Documents/ChatGPT/个人/work/work-desk`（分支 `main`，HEAD `27ec404`） |
| **本任务工作区**（git worktree） | `/Users/nat/Documents/ChatGPT/个人/work/work-desk-ui-bitmap`（分支 `ui-bitmap`，HEAD `2700bb4`，工作区干净） |
| 视觉规范 v2 | 工作区内 `docs/STYLE-GUIDE.md` |
| 派单 | 工作区内 `docs/tasks/T09-位图风全站改造.md` |
| Codex 的 T09 交接 | 工作区内 `CURRENT.md` 第 365 行起「T09 · 2026-10-15 · Codex 交接（待验收）」；证据在 `docs/handoff/T09/`（58 个文件，含 43 张截图和验证 JSON） |
| 协作规则 | 工作区内 `AGENTS.md`（Claude 管方向、规范、验收和小于约 30 行的精修；Codex 做开发） |
| 隔离预览 | http://127.0.0.1:5292 ，进程 PID 52385（在工作区执行 `node server/index.mjs`，读工作区的 `dist/`），数据是真实库的副本：`/var/folders/19/41dqp8kj55x991m3vjqpxthc0000gn/T/tmp.vPEKVm6npK` |
| 正式服务 | http://127.0.0.1:5280 ，PID 87820，运行主工作区的 `server/index.mjs`。**本任务不得操作。** |
| 风格素材原件 | 数码世界收藏：`/Users/nat/Documents/ChatGPT/个人/work/personal-ai-workbench/data/collection/state.json` 里 id 为 `6ac9c7680000000018010efc` 的条目（字段 `getAnalysis.content` 是 GET 解析，`transcriptText` 是视频转写）；视频在同目录下的 `data/collection/versions/538ec185ea39d4ac6f9bce0ccbd06dc5/media/6ac9c7680000000018010efc/video.mp4`。约 141 秒处那一帧是「位图风底座」原文规范，已经全部写进 STYLE-GUIDE v2。 |

## 1. 目标

把个人工作台（work-desk）的界面改成用户收藏的小红书帖子「6 种像素风高级交互｜附提示词直接抄」里的位图风。要学的是**风格**（配色、字体、像素元素、6 种按帧动效），页面结构仍然按工作台的真实功能来，不照搬参考图的排布。

完成标准，按顺序：
1. Claude 验收 Codex 交付的 T09，结论为通过，或者开出返修清单且返修完成；
2. 用户在 5292 预览上最终验收；
3. 用户授权后，把 `ui-bitmap` 合并回 `main`，并让正式 5280 切换到新版本，切换后核对通过。

## 2. 关键决策与约束

**用户拍板的设计决定：**
- 要的是这种风格，不是照搬参考图的整体排布；具体结构基于工作台的真实需求。
- 首页内容用真实数据，「全部按推荐」：
  - 问候语和等宽日期行
  - 四张数字卡：本月方案录入 x/3（黑底主卡）、本月促销 SKU、本月物料、本周日报
  - 近 12 个月促销变动点阵图，当月一列标橙
  - 业务线 SKU 分布（网点比例条）
  - 今日日程（当前和下一条标橙）、最新日报、Agent 列表（1-bit 头像和所用模型）
- 中文字体用系统苹方，不打包思源黑体。
- 图标全部换成 7×7 像素图标，自己绘制，不引入图标库。
- 只做浅色，不做深色模式。
- 风格底座以视频原文规范为准：
  - 底色 `#EDEEF1`，上面铺 24px 点阵网格，圆点颜色 `#C9CCD3`
  - 面板 `#FBFBFC`，2px 描边 `#D5D8DE`，直角，无阴影
  - 墨色 `#0D0E10`，次要灰 `#7B808A`；强调色只有信号橙 `#FF4F1F`，面积 ≤ 5%
  - 数字用 Geist Pixel；层级用 Bayer 抖动网点表达，不用透明度
  - 动效一律按帧跳变，约 15 帧/秒，不用缓动

**约束（来自用户全局规则和项目约定）：**
- 所有面向用户的文字用简体中文。
- 改动大或涉及多个文件时，先给计划，等用户确认后再做。歧义一次问清，最多 3 个问题，每个附推荐答案。
- 分工按工作区内 `AGENTS.md`：Claude 只做方向、规范、验收和小于约 30 行的精修，大量开发派给 Codex；返修也由 Codex 做。
- **不碰主工作区和 5280**：主工作区的 `dist/` 正被正式服务读取，在主工作区构建会直接改掉线上界面。构建只在 worktree 里做，或用 `--outDir` 输出到临时目录。
- 测试和预览一律用隔离数据目录，真实 `data/` 只读。不 push。
- 主工作区目前有**别的任务留下的未提交改动**：`CURRENT.md` 改了 110 行，另有 `HANDOFF.md` 和 `docs/` 下几份需求草案未跟踪。本任务不要动它们，也不要 reset、stash 或 clean。

## 3. 已完成

- ✅ **视觉规范 v2、基础组件、外框、首页样板**（Claude，提交 `e51c197`）。验证方式：
  - `npm test` 83 通过；
  - 在 5292 用真实数据副本预览并截图，首页数据正确，本周日报显示 3 篇；
  - 用 JS 切换路由，溶解转场的画布出现后完成切换，控制台无报错。

  涉及文件：`src/ui/bitmap.jsx`、`src/styles.css`、`src/App.jsx`、`src/main.jsx`、`src/ui/components.jsx`（`Card` 增加 `dither` 参数）、`src/modules/home/HomePage.jsx`、`src/assets/fonts/`（3 个 woff2 加 OFL 许可）、`docs/STYLE-GUIDE.md`、`docs/tasks/T09-位图风全站改造.md`、`AGENTS.md`、`CURRENT.md`。
- ⚠️ **T09 全站改造**（Codex，提交 `2700bb4`）：**还没经过 Claude 验收**。Codex 自报的结果：
  - 测试 85 通过，构建通过；
  - 源码里已经没有 lucide-react、transition、box-shadow、opacity；
  - 43 张截图，6 种交互都有过程截图；「减少动态效果」也验证过；
  - 物料上传改用 XHR 拿真实进度，新增测试 `tests/upload-image.test.mjs`。

  以上都要逐项核实。
- ✅ **之前的派单 T01–T08 和 T05B 都已在正式版上线**。见主工作区 `CURRENT.md` 第 31 行和第 327 行起的「正式切换记录」：T05B、T08 已经用户验收；其余派单的状态以该文件为准。本任务不涉及这些派单。

## 4. 卡点

没有阻塞性问题。待确认的事项：
1. **数字 0 显示成带斜线的 Ø**：这是 Geist Pixel 字体本身的写法。已经告诉过用户，用户还没表态。**待确认**是否保留。
2. **合并方式**：`ui-bitmap` 分支和主工作区的 `CURRENT.md` 都有改动，主工作区那份还没提交。合并前要先请用户决定，主工作区那份改动由原任务提交，还是保持原样、等合并时处理冲突。**待确认**。
3. 5292 预览进程现在读的是不是 Codex 最后一次构建的 `dist/`：服务每次请求都会从磁盘读文件，理论上是最新的，但没有核对过。**待确认**，验收前刷新页面看一眼即可。

## 5. 踩过的坑

- **`geist` npm 包会连带装上 Next.js 等 15 个包**。改成只复制 3 个 woff2 字体文件和 `LICENSE.txt` 到 `src/assets/fonts/`，然后卸载了这个包。
- **内置浏览器截不到原生 `<select>` 的弹出菜单**。改用系统 `screencapture` 截屏时，内置浏览器窗格是隐藏的，结果截到了用户桌面上的其他应用内容，那张图已经立即删除。以后不要这样做：遇到原生弹层，就如实记录这个截图缺口，或者请用户自己看一眼。
- **浏览器窗格隐藏时 `setInterval` 会被降频**：溶解转场看起来像「卡在半截」。已经在 `dissolve()` 里加了判断，标签页在后台时直接切换。验证动效时要让窗格保持可见，或者多等几秒再看。
- **视口模拟会在窗格宽度变化或回合结束时被重置**：重置后点击坐标就失效了，要先重新截图，或者改用 `javascript_tool` 修改 `location.hash` 来导航。
- **主工作区构建会覆盖正式 `dist/`**：验收时用 `npm run build -- --outDir "$(mktemp -d)"`，或者只在 worktree 里构建。
- 早期 `npm test` 里的接口测试要求先设置 `WORKDESK_DATA_DIR`。现在测试脚本在没设置时会自动用临时目录，两个工作区都已经包含这个改动。

## 6. 下一步（按优先级）

1. **Claude 验收 T09**。直接执行：
   ```bash
   cd "/Users/nat/Documents/ChatGPT/个人/work/work-desk-ui-bitmap" && git show --stat 2700bb4 | tail -40 && sed -n '365,420p' CURRENT.md
   ```
   然后：
   - 运行 `WORKDESK_DATA_DIR=$(mktemp -d) npm test`，以及 `npm run build -- --outDir "$(mktemp -d)"`；
   - 用 `grep -rn "lucide\|transition:\|box-shadow:" src/ package.json` 检查，应该没有结果；
   - 对照 `docs/STYLE-GUIDE.md` 和 T09 派单的验收清单，抽查 `docs/handoff/T09/` 的截图，重点是交互①–⑥、`减少动态效果-*`、`上传失败-*`；
   - 在 http://127.0.0.1:5292 刷新后实际点一遍各个模块。
2. 在工作区的 `CURRENT.md` 里写 Claude 验收记录，给出「通过」或返修清单。在 `ui-bitmap` 上提交，提交信息末尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。返修交给 Codex。
3. 请用户在 5292 最终验收，同时问清第 4 节的待确认事项 1（Ø）。
4. 用户授权后合并并切换正式版：
   - 先处理第 4 节的待确认事项 2，也就是主工作区那份未提交的改动；
   - 合并 `ui-bitmap` 到 `main`；
   - 按主工作区 `CURRENT.md`「正式切换记录」的流程做：备份 → 在主工作区构建 → 只重启 5280 进程 → 核对。

   这一步建议写成提示词交给 Codex 执行，并且在开始前和保存前停下来等用户确认。
5. 收尾：
   - 停掉 5292（`kill 52385`）；
   - 删除临时数据副本 `/var/folders/19/41dqp8kj55x991m3vjqpxthc0000gn/T/tmp.vPEKVm6npK`，删除前先问用户；
   - 合并后执行 `git worktree remove ../work-desk-ui-bitmap`。
