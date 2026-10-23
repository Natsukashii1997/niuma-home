# 操作手册

[AGENTS.md](../AGENTS.md) 只放怎么开始和「做什么事之前读哪份」；操作细节都在这里，做对应的事之前读对应一节。各节原文 2026-10-24 从 AGENTS.md 搬来，含义不变；新规矩按 [LESSONS.md](LESSONS.md)「怎么升级」写：一句话硬约束进 AGENTS.md，操作细节进这里。

## 派单流程（可选）

- 派单流程保留为可选：需要拆分时由一方写 `docs/tasks/T*.md`，另一方认领（在 CURRENT.md 标「进行中」）→ 实现 + 测试 + 截图 → 交接 → 验收 → 用户最终验收。
- 历史：2026-10-16 起曾按「Claude 做 UI、Codex 做后端」分工，2026-10-18 起改为按授权前后端一起做。

## 接口占位机制

- **接口占位机制**：未实现的接口在路由里写 `pending("T0x")`，返回 501；前端 `useApi(path, sample)` 收到 501 时显示示例并标「示例 · T0x」。实现接口 = 把 `pending(...)` 换成真实处理函数，前端示例自动消失。实现后删掉 `samples.js` 里对应的示例。
- 未实现的按钮用 `<PendingButton task="T0x">`；实现时换成 `<Button>`。

## 写接口与接外部来源

- 请求来源校验在 `server/index.mjs` 对全部 `/api/` 统一做（`http.mjs` 的 `checkOrigin`：Host 本机、Origin 同源；扩展只在收藏路由放行），新接口不用自己做；正文上限与错误响应也在那里（[API.md](API.md)「请求来源要求」）。
- 接外部只读来源一律 `createConfiguredReader(…, { staleWhileRevalidate: true })` 落快照，页面先回旧数据再后台刷新，不让用户等现读（[LESSONS](LESSONS.md) L-10）。

## 发布

- 正式环境是 launchd 常驻服务 `cn.niuma-home.server`（端口 5280），运行 `~/Library/Application Support/NiumaHome/releases/` 下的固定快照，数据目录是主工作区的 `data/`。
- 只在用户同意后发布：在主工作区（`main`）执行 `bash scripts/release-app.sh`。脚本会先备份数据库，再生成快照、切换服务，并按保留策略清理旧快照。
- 脚本要求工作区干净。主工作区有别人留下的未跟踪文件时，不要删改它们，只对这一次运行忽略未跟踪文件：`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=status.showUntrackedFiles GIT_CONFIG_VALUE_0=no bash scripts/release-app.sh`。

## 发布回读

- 发布后回读：`release-app.sh` 末尾会自动跑 `scripts/verify-release.sh`（只读，可随时单独再跑），核对 launchd 与运行中进程指向新快照、只监听 127.0.0.1、首页与全部构建文件逐字节一致、快照源码与提交一致、错误日志为空、版本号正确；本轮相关接口与页面仍须人工实看。

## 回滚

- 回滚：`bash scripts/release-app.sh --use <上一份快照名>`，在交接里写明。

## 每日巡检

- 每日巡检：launchd 任务 `cn.niuma-home.health` 每天 08:30 跑 `scripts/health-check.sh`（不调用模型，不碰数据）：发布回读 7 项 + 数据库完整性 + 磁盘余量 + 每日数据库备份（`backups/work-desk-<日期>-daily.db`，写后回读，只留 7 份）+ 昨天有没有巡检记录（巡检自己停了也要有人知道）；结果追加到 `~/Library/Application Support/NiumaHome/evidence/health/<年-月>.log`，未通过才弹本机通知。在主工作区执行 `bash scripts/health-check.sh --install` / `--uninstall` 安装或卸载；任务借服务外壳 `NiumaHomeServer.app` 的 node 启动（[LESSONS](LESSONS.md) L-08）。

## 每周整理

- 每周整理：桌面应用定时任务「【每周五】牛马之家说明书整理提案」（`niuma-weekly-review`，每周五 18:00 后几分钟）读 LESSONS / AGENTS / CURRENT 与巡检日志，**只出提案、不改仓库**：提案写到 `~/Library/Application Support/NiumaHome/evidence/weekly-review/<日期>.md`，结尾用 git 指纹自证未改；同目录 `decisions.md` 记每条提案的采纳 / 否决 / 待定（编号 `W<日期>-<序号>`），整理只读它、不重复提已决定的。用户回复采纳哪几条，当时的会话按上面的规矩动手，并在 `decisions.md` 追加一行。应用关着时到点不跑，下次打开时补跑。提示词在 `~/.claude/scheduled-tasks/niuma-weekly-review/SKILL.md`。

## 交接写法

AGENTS.md「交接格式」定了在 CURRENT.md 顶部新增一节、骨架照抄 [templates/handoff.md](templates/handoff.md)、`tests/handoff-format.test.mjs` 查三行；每一行怎么写：

- 标题写明内容、日期、谁做的、用户是否同意、发布状态
- 时间：开工 `YYYY-MM-DD HH:mm`（`date '+%F %H:%M'` 记录；早于它的构建、截图、测试结果不算本轮的）
- 改了哪些文件（一句话说明各自做了什么）
- 测试：命令与结果（通过 / 失败数）
- 验证：隔离端口与数据、看了哪些宽度和页面
- 截图：放在 `docs/handoff/<本轮名>/`，列出文件名；截图不提交进仓库（用户 2026-10-23 确认），只留在本地
- 发布与回读、回滚命令（如已发布）
- 与授权不一致之处、遗留问题、范围外发现
- 本轮新坑：无 / L-xx（写进 [docs/LESSONS.md](LESSONS.md)，格式和升级规则见该文件开头）

## 报告与验收（防伪造，实施方和验收方都照做）

1. 先写盘，再报告：交接和验证记录先写进 CURRENT.md 或证据目录，再在对话里说；对话里说了、文件里没有的，按没做算。
2. 开工先记时间：验证记录写明开始时刻（`date '+%F %H:%M'`）；早于它的构建、截图、测试结果不算本轮的。
3. 说跑过命令，就贴原样结果：测试至少照抄通过数和失败数那两行，不改写成「测试通过」。
4. 沿用别人的结果要明说：验收方没有重新跑测试、构建或截图，就写「沿用某某的结果」，不写成自己核过。
5. 数字和实施方的记录一字不差时，写明自己是怎么独立得到的（跑了什么命令、看了哪个文件）。

没做就写「未做」，一条诚实的「未做」比一条编出来的「已做」有用。
