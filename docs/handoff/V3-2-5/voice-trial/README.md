# AIHOT 免费人工试运行

2026-10-16 实测。仅复用已安装 Colima 0.10.3 / Lima 2.2.1 / Docker CLI 29.8.2，未安装新的宿主工具。Node 实际执行版本 24.16.0。运行的是固定官方源码的只读查询与一次 RSS 读取，未运行原版 API main、worker、seed、模型、付费采集或定时任务。

## 当前真实状态

- 官方提交：`c8704e5313e6b051560365226b3919d7e0ada5ea`。
- 官方源码归档 SHA256：`6d76db67bf7fe289a34a19db23da9c96cfbae642dad1a67929ffeed66ccd773c`。
- 镜像：`postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`，本机 arm64。
- 临时运行目录：`/tmp/workdesk-voice-trial-20261016`；源代码在 `source-path.txt` 指向的 `upstream/KKKKhazix-AIHOT-c8704e5`。
- 独立 VM：`colima-workdesk-voice`；磁盘在临时目录的 `lima/`。Colima 控制元数据在 `~/.colima/workdesk-voice`，随用户批准的隔离运行环境创建。没有使用或修改 `multica` profile。Docker 全局 context 仍为 `default`；仅新增独立 context，所有实际 Docker 操作显式传 `--host`。
- 目前保留运行：只读 API `127.0.0.1:5397`，隔离 PostgreSQL `127.0.0.1:5497`。容器 `workdesk-voice-db-20261016`，同名独立 volume，restart policy 为 `no`。未添加开机自启。
- 官方迁移 60 项；公开健康/热点/条目均 200，真实空库；未生成日报返回 404，POST 返回 405，admin 不注册返回 404。
- 官方 `fetchRss` 免费读取 UKVI 成功：20 条、20 条带日期、作者 0。只作政策背景，没有写入 articles/publications，也不算学生讨论。
- 追加官方 `fetchRss` 读取 College Confidential 国际学生分类成功：25条、25条作者与日期、23作者账号；最近日期2026-04-27，48小时内0条。这里只证明候选的当前公开RSS窗口可读，不证明全范围、真实学生身份或同话题5人。
- 三条学生讨论候选试读全部失败：两个 Reddit RSS 连接重置、Academia feed 403；无法判断是否存在合格话题。`sourceReads.complete=false`，业务统计未知为 null。引擎健康不能证明 Voice 业务采集成功。
- 试读后的数据库 `receipt_attempts=0`、`receipts=0`、`pgboss` schema=0、启用源=0；模型/付费调用 0；新增调度 0。零费用结论只覆盖本次隔离试运行，不代表现有引擎具备 10 元/月金额硬门禁。
- npm audit 对固定生产依赖返回 0 漏洞；这只是当前公告扫描结果，不是绝对安全证明。

可复核的脱敏结果在 [evidence](./evidence/)。正文、原始 RSS、环境文件、新生成数据库密码、node_modules、数据库与 VM 不入仓库。源文件没有被改写，只在固定源码根目录复制本目录三个 `trial-*.ts` 入口。

## 继续使用与停止

工作台配置：`WORKDESK_VOICE_SNAPSHOT=/tmp/workdesk-voice-trial-20261016/workdesk-export.json`。当前应明确返回 `VOICE_SOURCE_UNAVAILABLE`，不能显示假话题或“成功但无话题”。快照 48 小时后过期，不能仅重写 checkedAt 延期；须重新执行来源读取并刷新证据。

访问只读引擎：<http://127.0.0.1:5397/health>、<http://127.0.0.1:5397/api/v1/hot-topics>。API 不自行采集，开着它不会产生后台模型任务。

停止 API：先 `lsof -nP -iTCP:5397 -sTCP:LISTEN` 核对 PID 的命令为本目录试运行 `node trial-api.ts`，再向该 PID 发送 TERM；本次最终核验 PID=33054（重启后须重新核对，不能盲用历史 PID）。停止容器与专用 VM：

```sh
docker --host unix:///Users/nat/.colima/workdesk-voice/docker.sock stop workdesk-voice-db-20261016
LIMA_HOME=/tmp/workdesk-voice-trial-20261016/lima colima stop workdesk-voice
```

保留数据重启（临时目录仍存在时）：

```sh
LIMA_HOME=/tmp/workdesk-voice-trial-20261016/lima colima start workdesk-voice --activate=false
docker --host unix:///Users/nat/.colima/workdesk-voice/docker.sock start workdesk-voice-db-20261016
python3 docs/handoff/V3-2-5/voice-trial/run.py trial-api.ts
```

`run.py` 仅继承 PATH，加载本次新生成 engine.env，拒绝任意未审查入口，不读取用户密钥或默认 AIHOT 配置。API 应在独立终端前台运行，退出时 Ctrl-C；不创建自动化或 launchd。

## 从零复现的精确步骤

这些命令仅适用于已批准的本次隔离试运行；不要改成正式路径，不要运行官方 compose/seed/worker。重新创建环境时重新审查固定版本是否变化；已有环境不得覆盖密码文件。

1. 创建 `/tmp/workdesk-voice-trial-20261016`，下载官方固定归档：`curl --fail --location https://api.github.com/repos/KKKKhazix/AIHOT/tarball/c8704e5313e6b051560365226b3919d7e0ada5ea --output /tmp/workdesk-voice-trial-20261016/source-complete.tar.gz`。以 `shasum -a 256` 核对上方摘要；解包前拒绝绝对路径、`..`、软硬链接，仅使用 Python `tarfile.extractall(filter='data')` 解入专用 `upstream/`。把实际解包绝对路径写到 `source-path.txt`。
2. 核对 5397、5497 均空闲。运行本目录 `configure.py` 生成全新隔离数据库身份，文件权限 0600；不打印密码、不复用任何现有账户。`empty.npmrc` 与 `empty-global.npmrc` 必须是两个不同空文件。
3. 在固定源码目录执行以下依赖安装；禁用全部生命周期脚本，不安装开发依赖。396 个 lock 条目中 fsevents 声明了安装脚本，因 `--ignore-scripts` 未执行。安装实际 180 个包。

```sh
npm ci --ignore-scripts --omit=dev --no-audit --no-fund --workspace=@aihot/api --workspace=@aihot/backend --workspace=@aihot/contracts --workspace=@aihot/industry --workspace=@aihot/site --userconfig=/tmp/workdesk-voice-trial-20261016/empty.npmrc --globalconfig=/tmp/workdesk-voice-trial-20261016/empty-global.npmrc --cache=/tmp/workdesk-voice-trial-20261016/npm-cache --registry=https://registry.npmjs.org
```

4. 启动独立运行时，不切全局 context、不开目录挂载、SSH agent 或共享 SSH 配置：

```sh
LIMA_HOME=/tmp/workdesk-voice-trial-20261016/lima colima start workdesk-voice --activate=false --template=false --ssh-agent=false --ssh-config=false --mount none --cpus 2 --memory 2 --disk 10 --root-disk 10 --runtime docker --vm-type vz --binfmt=false --save-config=true
```

本次 Colima 忽略了 `COLIMA_HOME` 自定义目录，控制元数据最终在上述专用 `~/.colima/workdesk-voice`。不要为此移动/修改其他 profile。

5. 本次 VM 首启有两个已定位环境问题：`/etc/resolv.conf` 指向不存在的 `/run/systemd/resolve/stub-resolv.conf`，根据该 VM DHCP 实际 DNS `192.168.5.2` 补了该文件；Docker pull 需要宿主已运行的本地网络代理，通过 VM 网关 `192.168.5.2:8086` 连接。仅给专用 VM 的 `/etc/systemd/system/docker.service.d/workdesk-trial-proxy.conf` 设置 HTTP_PROXY/HTTPS_PROXY，NO_PROXY=localhost,127.0.0.1，然后重启该 VM 内 Docker。这些地址是本次事实，环境变化须重新只读核对，不能猜新地址或读取代理凭据。API/RSS 环境可选 `EGRESS_PROXY_URL=http://127.0.0.1:8086`；仅连接已核验的本机代理，不绕过网站限制。
6. 仅运行 PostgreSQL 镜像（本次已固定 digest）：

```sh
docker --host unix:///Users/nat/.colima/workdesk-voice/docker.sock run -d --name workdesk-voice-db-20261016 --label workdesk.trial=voice-20261016 --security-opt no-new-privileges --publish 127.0.0.1:5497:5432 --env-file /tmp/workdesk-voice-trial-20261016/db.env --mount type=volume,source=workdesk-voice-db-20261016,target=/var/lib/postgresql/data postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
```

7. 复制本目录 `trial-api.ts`、`trial-probe.ts`、`trial-evidence.ts` 到固定源码根；从 worktree 执行下面命令。迁移后不执行 seed。API 命令占用前台，验证与单次读取在另一终端执行。

```sh
python3 docs/handoff/V3-2-5/voice-trial/run.py scripts/migrate.ts
python3 docs/handoff/V3-2-5/voice-trial/run.py trial-api.ts
python3 docs/handoff/V3-2-5/voice-trial/verify-api.py
python3 docs/handoff/V3-2-5/voice-trial/run.py trial-probe.ts /tmp/workdesk-voice-trial-20261016/official-free-read.json
python3 docs/handoff/V3-2-5/voice-trial/run.py trial-probe.ts /tmp/workdesk-voice-trial-20261016/official-student-candidate-read.json cc
python3 docs/handoff/V3-2-5/voice-trial/run.py trial-evidence.ts /tmp/workdesk-voice-trial-20261016/database-evidence.json
```

8. 学生源每次须完整读取后生成 `student-source-probes/results.json`；本次固定三条来源与实际失败结果保留在 evidence。候选失败不能从记录删掉来伪装成功，也不能用政策源替换。再执行 `export.py`，其已知证据校验通过后原子写快照。该脚本不会采集，不可拿旧来源结果冒充新一轮完整读取。

## 准入与限制

已完整读取 skill-admission 合同及 skill-governance-audit；此候选没有 SKILL.md、未安装或激活 Skill，因此 Skill frontmatter/creator 结构校验不适用。以源码、依赖、网络、凭据、入口和最小行为审查替代，不声称获得 Skill 安装绿灯。

审查覆盖 root/workspace manifests、锁文件 lifecycle、API main 的 heartbeat/watchdog、worker/schedules、迁移 SQL、seed、模型 valve、provider receipts/budgets、RSS/network guard。手写入口只引用官方读路径；SQL 扫描未发现外部程序/远程 DB 操作，只有本地 `pg_trgm` 扩展。依赖没有安装 hook，API 没有启动 worker/pg-boss，也没有媒体代理、管理端或外部写入端。正式化仍需独立学生源访问许可、作者归一、至少 5 独立参与者、七天真实历史及人民币月金额硬门禁；此试运行没有证明这些条件成立。

最终运行核验：根代理恢复只读API后，于北京时间21:37核对health=200，5295/5296/5397/5497全部仅127.0.0.1，见[evidence/最终运行核验.json](evidence/最终运行核验.json)。没有重新采集或刷新旧来源时间。
