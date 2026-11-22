# 操作手册

[AGENTS.md](../AGENTS.md) 只放怎么开始和「做什么事之前读哪份」；操作细节都在这里，做对应的事之前读对应一节。各节原文 2026-10-24 从 AGENTS.md 搬来，含义不变；新规矩按 [LESSONS.md](LESSONS.md)「怎么升级」写：一句话硬约束进 AGENTS.md，操作细节进这里。

## 派单流程（可选）

- 派单流程保留为可选：需要拆分时由一方写 `docs/tasks/T*.md`，另一方认领（在 CURRENT.md 标「进行中」）→ 实现 + 测试 + 截图 → 交接 → 验收 → 用户最终验收。
- 历史：2026-10-16 起曾按「Claude 做 UI、Codex 做后端」分工，2026-10-18 起改为按授权前后端一起做。

## 接口占位机制

- **接口占位机制**：未实现的接口在路由里写 `pending("T0x")`，返回 501 `{ error, task }`，页面按普通读取失败显示。实现接口 = 把 `pending(...)` 换成真实处理函数。没有注册的 `/api/v3/*` 也回 501：由 `server/http.mjs` 的 `unmatched` 在「全部路由都没匹配」时处理，不在路由表里，新模块注册在哪都不会被它抢走（#73）。
- 早期「前端收到 501 就显示自带示例」的做法已退役（2026-11-20 #73 删掉 `useApi` 的示例参数）。页面上的「示例」标识现在只来自后端的演示口径（数据里 `origin: "demo"`）；`src/samples.js` 只剩 Voice 模拟数据。
- 未实现的按钮用 `<PendingButton task="T0x">`；实现时换成 `<Button>`。

## 写接口与接外部来源

- 请求来源校验在 `server/index.mjs` 对全部 `/api/` 统一做（`http.mjs` 的 `checkOrigin`：Host 本机、Origin 同源；扩展只在收藏路由放行），新接口不用自己做；正文上限与错误响应也在那里（[API.md](API.md)「请求来源要求」）。
- 接外部只读来源一律 `createConfiguredReader(…, { staleWhileRevalidate: true })` 落快照，页面先回旧数据再后台刷新，不让用户等现读（[LESSONS](LESSONS.md) L-10）。

## 发布

- 正式环境是 launchd 常驻服务 `cn.niuma-home.server`（端口 5280），运行 `~/Library/Application Support/NiumaHome/releases/` 下的固定快照，数据目录是 `~/Library/Application Support/NiumaHome/data/`（不在仓库里，见下面「数据目录」）。
- 只在用户同意后发布：在主工作区（`main`）执行 `bash scripts/release-app.sh`。脚本会生成快照、做界面基线对比、备份数据库，再切换服务，并按保留策略清理旧快照。
- 发布前界面基线对比（2026-11-19 起）：新快照建好后、备份数据库之前，脚本用这份快照起隔离服务（临时数据、假 lark-cli、端口 5296，不碰正式服务），把 `docs/design/pages.json` 里的页面和基线逐页比。基线图不提交进仓库（同下面「交接写法」10-23 那条，常浩 11-19 再确认），放本机持久目录 `~/Library/Application Support/NiumaHome/ui-baseline/`，换电脑要重拍；月度用户策略页先不进基线（隔离环境没有 v2 演示数据）。不一致就删掉这份快照、不切换。界面改动经常浩同意的：`npm run build && node scripts/ui-baseline.mjs shoot` 重拍、在 `docs/DECIDED.md` 加一行、提交，再发布。主工作区要先 `npm install`（`@playwright/test`），本机有 Playwright 的 Chromium（没有就 `npx playwright install chromium`）。
- 发布不换数据目录：`release-app.sh` 沿用当前服务配置里的 `WORKDESK_DATA_DIR`，显式给了这个环境变量才用给的那个；全新安装（还没有服务配置）用 `~/Library/Application Support/NiumaHome/data/`。
- 数码世界数据目录（只读它的收藏）不沿用服务配置：`release-app.sh` 每次按 `WORKDESK_DIGIWORLD_DIR` 重写服务配置，没给就用默认的 `~/Library/Application Support/PersonalAIWorkbench/data`（数码世界 2026-11-21 迁出代码仓库后的位置，#95）。
- 脚本要求工作区干净。主工作区有别人留下的未跟踪文件时，不要删改它们，只对这一次运行忽略未跟踪文件：`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=status.showUntrackedFiles GIT_CONFIG_VALUE_0=no bash scripts/release-app.sh`。

## 发布回读

- 发布后回读：`release-app.sh` 末尾会自动跑 `scripts/verify-release.sh`（只读，可随时单独再跑），核对 launchd 与运行中进程指向新快照、只监听 127.0.0.1、首页与全部构建文件逐字节一致、快照源码与提交一致、错误日志为空、版本号正确；本轮相关接口与页面仍须人工实看。

## 回滚

- 回滚：`bash scripts/release-app.sh --use <上一份快照名>`，在交接里写明。回滚只换代码快照，数据目录沿用当前服务配置里的那个。

## 数据目录

- 正式数据目录是 `~/Library/Application Support/NiumaHome/data/`，和快照、备份、证据在同一个上级目录；以服务配置为准，查法：
  ```sh
  /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:WORKDESK_DATA_DIR" ~/Library/LaunchAgents/cn.niuma-home.server.plist
  ```
- 仓库里的 `data/` 只是开发用的本地库（`server/db.mjs` 的默认值是当前目录下的 `data/`）：不带环境变量直接 `npm start` 或跑命令行脚本，读写的是它，不是正式数据。
- 命令行脚本要操作正式数据时必须显式指定数据目录，适用于 `scripts/agent-token.mjs`、`scripts/internal-voice-pull.mjs`、`scripts/import-*.mjs`、`scripts/migrate-*.mjs`（后者用 `--data`）。会写入的命令先停服务或确认服务没在写同一份数据：
  ```sh
  DATA=$(/usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:WORKDESK_DATA_DIR" ~/Library/LaunchAgents/cn.niuma-home.server.plist)
  WORKDESK_DATA_DIR="$DATA" node scripts/agent-token.mjs list
  ```
- `verify-release.sh`、`health-check.sh` 从服务配置里读数据目录，不用带。

## 数据目录迁移（一次性，#83）

正式数据目录原来是开发工作区里的 `data/`：被 `.gitignore` 忽略，一次 `git clean -fdx` 就没了。`scripts/move-data-dir.sh` 把它搬到上面的位置。

1. **预览（只读）**：`bash scripts/move-data-dir.sh`，打印从哪搬到哪、文件数和总字节数、各库各表行数。
2. **执行**（会停服务一两分钟，常浩同意后在主工作区做）：`bash scripts/move-data-dir.sh --confirm`。步骤：停服务 → 确认没有别的进程还开着库 → 备份主库到证据目录 → `ditto` 复制 → 核对文件数、总字节数、各库 `quick_check`、各表行数 → 用当前快照重新生成服务配置（指向新目录）并启动、回读 → 原目录改名为 `data.migrated-<日期>`。
3. **动手之前就拒绝的情况**：找不到服务配置、目标目录不为空、数据目录已在目标位置、错误日志不为空（切换后的回读会不过）。核对不过、还有进程开着库：删掉新目录，服务按原配置起回来，原目录不动。切换失败：改回原目录；改回也失败时两边都留着，按提示人工处理。
4. **证据**：`~/Library/Application Support/NiumaHome/evidence/数据目录迁移-<时间>/`（迁移前主库备份、两边的文件概况和各表行数、切换日志）。
5. **回退**（会丢掉迁移之后的写入）：脚本结束时会打印这条命令：把 `data.migrated-<日期>` 改回 `data`，再 `WORKDESK_DATA_DIR=<原目录> bash scripts/release-app.sh --use <当前快照名>`。
6. **原目录 `data.migrated-<日期>` 不自动删**：确认新位置跑稳后，常浩说删再删。
- 和内部原声拆库（#82）放在同一个维护窗口时，先拆库（主库变小）再搬目录。
- 演练用一次性目录和任务名，不碰正式服务：`NIUMA_BASE`、`NIUMA_LABEL`、`PORT`、`NIUMA_NEW_DATA_DIR` 可覆盖；自动测试见 `tests/move-data-dir.test.mjs`。

## 月度策略 v2 迁移（一次性，批 1·1c）

把旧版用户情况（`docs/用户情况/` 12 个内置月份 + `v3_documents` 里本地改过的月份）按 [04-迁移映射](策略规则/04-迁移映射.md) migration-v1.2 写成 v2 revision（`confirmed_from=migration`）。脚本 `scripts/migrate-strategy-v2.mjs`；旧版记录与内置 JSON 只读，迁移和回退都不改它们，页面在 1d 改读 v2 之前照常显示旧版。

1. **试跑（只读正式数据）**：在主工作区执行，`<正式数据目录>` 的查法见上面「数据目录」，`--out` 用一个新的证据目录（非空会拒绝）。正式库的时间线快照没有原格信息时加 `--refresh-timeline`：只在隔离副本里重读一次飞书时间线（只读），快照和飞书调用日志都只写进隔离副本。
   ```sh
   node scripts/migrate-strategy-v2.mjs plan --data "<正式数据目录>" --out "$HOME/Library/Application Support/NiumaHome/evidence/<日期>-strategy-v2-migration/plan-<n>" --refresh-timeline
   ```
   产出：`backup/`（12 个 JSON、`v1-records.json`、`work-desk.db` 与 `summary.json` 里的校验和）、`isolated-data/`（迁移后的隔离库）、`reports/<月份>.md`（每月差异报告）、`migrated/<月份>.json`、`SUMMARY.md`。任何月份检查不过，退出码为 1。
2. **交常浩看 `SUMMARY.md` 和各月报告，得到他明确同意**，才做下一步。
3. **切换（写正式库）**：正式切换前要用正式库自己的时间线重出一份报告：先发布含批 1 代码的版本、在时间线页同步一次（正式库快照要有原格信息），再按第 1 步试跑（不加 `--refresh-timeline`），交常浩看过同意后**中间不要再同步时间线**，马上执行下面的命令。脚本先把正式库备份到 `<证据目录>/apply-<时间>/work-desk-before-apply.db`，再逐月重跑迁移：旧记录迁来的内容或按时间线重算的覆盖率、默认优先级，任何一项与报告不一致就一条都不写，要求重新试跑出报告；某月已有 revision 时不覆盖。迁移版本的 `confirmed_by` 记 `migration-script`，结果写进 `apply-log.json`。
   ```sh
   node scripts/migrate-strategy-v2.mjs apply --data "<正式数据目录>" --report "<试跑证据目录>" --confirm
   ```
4. **回退**：先不带 `--confirm` 预览，列出将删除的迁移版本和将转为 stale 的同月待确认提交，不改数据；确认后带 `--out --confirm` 执行：先把正式库备份到 `--out`，再删除迁移写入的 revision，同月待确认的 submission 转为 stale（可用 `--months 2026-01,2026-02` 只退部分月份）。某月在迁移之后已有其他版本（skill 提交经确认、页面回退）时整体拒绝，一条不删，改用下面的数据库恢复。
   ```sh
   node scripts/migrate-strategy-v2.mjs rollback --data "<正式数据目录>"
   node scripts/migrate-strategy-v2.mjs rollback --data "<正式数据目录>" --out "<证据目录>" --confirm
   ```
   最后手段（会丢掉切换之后的全部写入，先确认）：停服务 `launchctl bootout gui/$(id -u)/cn.niuma-home.server`，用 `cp "<证据目录>/apply-<时间>/work-desk-before-apply.db" "<正式数据目录>/work-desk.db"` 恢复，再 `bash scripts/release-app.sh --use <当前快照名>` 拉起服务。
- revision 平时不可删（I-10）：回退命令在同一事务里临时摘掉删除触发器、删完立即恢复，是迁移切换的唯一例外；测试见 `tests/strategy-migrate.test.mjs`。

## 内部原声拉取（#49）

- token：macOS 钥匙串 `niuma-home.lumist` / `lumist-pat`（会话存档 PAT，`lst_` 开头）。换 token：`security add-generic-password -U -s niuma-home.lumist -a lumist-pat -w`（回车后按提示输入，不写在命令行里），再用 `security find-generic-password -s niuma-home.lumist -a lumist-pat -w | head -c 8` 核对前缀。token 不进仓库、日志和页面。
- 自动拉取：设置 `internal_voice_auto` 走预览 → 确认 → 回读改成 `1`；每日巡检会查最近 8 天有没有成功的每周拉取。
- 手动拉取：服务在跑时走 `POST /api/v3/internal-voice/pull/preview` → `confirm`。隔离数据目录试拉用命令行：`WORKDESK_DATA_DIR=<目录> node scripts/internal-voice-pull.mjs 2026-11-02 2026-11-08`；**不要**对正在被服务使用的数据目录再开命令行拉。
- 量：一周两条业务线约 1 万多个会话请求，并发 3，几十分钟；一次最多 31 天。

- 存在哪（2026-11-20，#82）：会话三张表（`chat_conversations`、`chat_messages`、`chat_pull_runs`）在数据目录下的 `internal-voice.db`，不在主库 `work-desk.db` 里；设置项 `internal_voice_auto` 仍在主库。发布前备份和每日备份只备主库，会话库没有例行备份（来源是企微存档，可以重拉；常浩 2026-11-20 定）。
- 一次性迁移（主库里还留着旧的会话表时才需要）：先 `node scripts/migrate-voice-db.mjs --data <数据目录>` 预览；停服务后 `node scripts/migrate-voice-db.mjs --data <数据目录> --backup <备份文件> --confirm` 执行（整库备份 → 复制 → 核对行数 → 主库删表并收缩）。还有进程开着主库时脚本会拒绝。没迁移之前新代码照旧读主库里的旧表，不影响使用。回退：停服务，把那份备份放回 `work-desk.db`，删掉 `internal-voice.db`。

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
6. 交互要用真实输入核对：点击、打字、按键用内置浏览器的真实操作，或调试协议的 `Input.dispatchKeyEvent` / `Input.dispatchMouseEvent`；截图用调试协议等页面画完（图已画出 + `document.fonts.status === "loaded"`）再截。无头浏览器里程序调 `focus()` / `blur()` 不发事件，合成事件只能用来摆出截图要的状态，不能当交互验证的证据（[LESSONS](LESSONS.md) L-13）。

没做就写「未做」，一条诚实的「未做」比一条编出来的「已做」有用。
