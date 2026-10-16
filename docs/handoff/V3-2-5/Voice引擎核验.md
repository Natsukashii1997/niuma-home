# Voice 引擎核验与部署候选

日期：2026-10-16。先完成只读审查；随后用户明确批准免费人工试运行，已完成隔离引擎启动与真实读取验证。未调用付费模型，未新增定时任务。不能把示例话题或 aihot.news 的 AI 新闻当作留学生真实讨论。

## 当前试运行结论

固定官方提交 `c8704e5313e6b051560365226b3919d7e0ada5ea` 已在独立 Colima/PostgreSQL 环境启动，只读 API 为 `127.0.0.1:5397`、DB 为 `127.0.0.1:5497`；主工作区与 5280 未碰。60 项官方迁移成功，健康、热点、条目接口已真实回读；日报不存在返回404，写入返回405，管理路由未注册。完整复现、停止与恢复方法见 [voice-trial/README.md](./voice-trial/README.md)，脚本和脱敏证据均已随交接保存，不依赖 `/tmp` 中间产物才能理解结果。

官方 RSS 读取器已成功读取 UKVI 20条带日期记录，仅作政策背景。首轮三条学生源试读：Reddit studyAbroad/UniUK 连接重置，Academia国际学生分类403；因此业务采集未完成，不能从引擎空库推出“无合格话题”。真实导出 `/tmp/workdesk-voice-trial-20261016/workdesk-export.json` 保留 `sourceReads.complete=false` 和错误、未知统计null；工作台应返回 `VOICE_SOURCE_UNAVAILABLE`。引擎可读、免费单次读取、业务来源可用性分别报告。

试读后隔离数据库 `receipt_attempts=0`、`receipts=0`、`pgboss` schema=0、启用源=0。模型、付费采集、推送全部关闭；未运行官方 seed、API main 或 worker。180个依赖包以禁用生命周期脚本方式安装，生产依赖公告核查0漏洞；没有安装任何 Skill 或新宿主工具。零费用只覆盖本次免费试运行，下面的10元/月硬门禁缺口仍未解决。

下方两个方案和“尚未配置”建议为**试运行前的研究记录**；当前配置状态以上述实际证据为准，不能沿用“daemon未启动”作为现状。

## 初始两个候选方案（A 已获授权并做免费试运行）

建议先选 **A：人工触发的最小真实试运行**。目前既没有可运行引擎，也没有已验收的学生讨论源；直接常驻运行仍不能保证出现合格话题。

| | A · 人工触发试运行（推荐） | B · 常驻自动 Voice |
|---|---|---|
| 完成目标 | 用真实学生讨论证据验证一个话题从采集、去重、聚类、费用留痕到工作台展示；不足 5 个独立参与者就空榜 | 持续采集、更新热榜/词云/日线，保留失败与费用状态 |
| 最小运行条件 | 本机 Docker 兼容 daemon、隔离 PostgreSQL 17、基于固定源码构建的应用镜像；API/Web仅回环地址 | 与 A 相同，额外常驻 worker |
| 当前缺项 | 仅确认 Docker CLI 29.8.2 已安装；daemon不可用。若没有可启用的 runtime，需要另行确认安装，不能把CLI存在当作Docker服务就绪 | 同 A |
| 引擎改动 | 留学行业包、学生作者/矩阵归并、5参与者门槛、人民币月预算硬门禁、只读 Voice 导出；增加无cron的单次处理入口，worker短暂运行至本轮任务结束 | 同 A，并增加明确的调度白名单、完整采集水位和下一次计划时间 |
| 模型费用 | 首先关模型做免费源单次试读；获得费用授权后，由用户在引擎自己的凭据位置填写一个模型供应商key。月累计+未知预留不超过10元；当前没有可复用的已确认价格/密钥 | 同 A；常驻不增加预算，但到上限必须停模型、显示预算耗尽，不能保证每日都产出摘要 |
| 定时任务 | 不新增。不能直接运行原版worker入口，因为它会自动注册cron；需无cron入口或schedule allowlist全部关闭 | 需要周期worker和新增调度。与当前“不要直接新增定时”约束冲突，必须另行明确授权后实施 |
| 5个独立来源能否达到 | 目前不能证明。五家新闻发布机构已可读取，但不是五个学生，也不保证同一话题在48小时内有五个独立参与者 | 自动化只能积累证据，不能保证达标；同一人、同一矩阵、转载链必须归一，空榜是合法结果 |

安装/启用按 `/Users/nat/.codex/contracts/skill-admission.md` 完成固定版本与依赖/Hook审查；免费试运行的审查、范围及证据详见上述README。两方案都不触碰 work-desk 主工作区、5280或真实 data/。

## 官方源码事实

- 官方仓库：<https://github.com/KKKKhazix/AIHOT>
- 核验提交：`c8704e5313e6b051560365226b3919d7e0ada5ea`。
- 临时非激活资料：`/tmp/workdesk-aihot-static-20261016/`；完整静态研究见该目录 `review.md`，本机来源实测见 `source-probes/`。这些临时文件不是已部署产物。
- Docker只读检查：Client 29.8.2，Server=null，`/var/run/docker.sock` 不存在。未启动daemon。根 `package.json` 要求 Node `>=24.11`；当前只有Node24大版本事实，部署前还需核实次版本。
- 默认compose首启setup会迁移并执行seed；[`scripts/seed.ts`](https://github.com/KKKKhazix/AIHOT/blob/c8704e5313e6b051560365226b3919d7e0ada5ea/scripts/seed.ts) 导入 `industry/sources.json` 的AI示范源、默认启用。部署前必须替换行业包，不能把AI示范源混入Voice。
- 默认compose宿主Web映射为 `${PORT:-3000}:3000`，候选须明确改为 `127.0.0.1:<核实空闲的端口>:3000`；不公开API/DB，不启用Caddy。

## 10元/月必须新增统一硬门禁

现有 `budgets` 只限制请求次数，不是月金额。不能通过前端写 `limit:10`、降低抓取频率或设置日请求数来声称硬控10元。

- [`providers/receipts.ts:97-115`](https://github.com/KKKKhazix/AIHOT/blob/c8704e5313e6b051560365226b3919d7e0ada5ea/packages/backend/src/providers/receipts.ts#L97) 按每服务最近分钟/小时/日 live attempt 计数；缺少预算行意味着无限制。
- 同文件125–153行在发请求前使用事务锁并登记attempt，是统一月金额门禁应放的位置；需跨模型、向量、付费采集服务共用一个人民币月总额，不能仅放在worker定时入口。
- `database/migrations/0036_open_source_defaults.sql` 默认llm/embedding是300次/分钟、6000次/小时、40000次/日；`admin/settings.ts:68-76` 仅支持三种次数，任一为0才停该服务。
- [`providers/llm.ts:192`](https://github.com/KKKKhazix/AIHOT/blob/c8704e5313e6b051560365226b3919d7e0ada5ea/packages/backend/src/providers/llm.ts#L192) 返回cost=null，不能汇总成“已花0元”。
- 最小门禁：北京时间月份；事务内检查“已结算金额+pending/unknown预留+本次最坏成本≤10元”；输入/输出token有硬上限；模型价格或汇率未知则拒绝；未知结果保留预留，重试重新预留；实际、估算、预留分别留痕。供应商、价格依据、用户亲自配置key及费用授权是付费运行前提。

`.env.example:127-128` 默认开启 `COLLECT_ENABLED=true` 和 `MODEL_CALLS_ENABLED=true`，不可直接照抄。[`apps/worker/src/schedules.ts`](https://github.com/KKKKhazix/AIHOT/blob/c8704e5313e6b051560365226b3919d7e0ada5ea/apps/worker/src/schedules.ts) 每5分钟处理/翻译/热榜、每半小时报告等；COLLECT_ENABLED=false只关采集，其他调度仍注册。手动源预览也可能付费，不受自动采集开关保护。试运行须关闭模型、所有付费采集、飞书推送和IndexNow，待相应授权/门禁完成后逐项启用。

## 独立来源与免费英文信源

[`events/hot.ts:57-60,105-129,183-185`](https://github.com/KKKKhazix/AIHOT/blob/c8704e5313e6b051560365226b3919d7e0ada5ea/packages/backend/src/events/hot.ts#L57) 默认48小时窗口、24小时半衰期、上榜门槛2人且至少1个editorial。作者归并仅内置DEV/HN，其他按signal_group、owner、source依次归并。需改为5并补学生社区作者规则；subreddit数量、文章数、点赞数不能当独立人数。

本机已GET实测的五家免费英文发布机构候选：

| 来源 | 地址与方式 | 结果 |
|---|---|---|
| IRCC | [官方RSS说明](https://www.canada.ca/en/immigration-refugees-citizenship/news/rss.html)中的Atom地址 | HTTP200、50条、首条2026-10-15 |
| UKVI | <https://www.gov.uk/government/organisations/uk-visas-and-immigration.atom> | HTTP200 Atom、20条、首条2026-10-16 |
| DHS Study in the States | <https://studyinthestates.dhs.gov/blog> | HTTP200 HTML；有完整time datetime，需覆盖置顶与普通列表并去重 |
| ICEF Monitor | <https://monitor.icef.com/> | HTTP200 HTML；需详情页补真实日期，列表日期不能推测 |
| The PIE News | <https://thepienews.com/feed/> | HTTP200 RSS、10条、首条2026-10-16 |

这些是政策/行业事实源，可以辅助核实背景，**不能替代留学生个人讨论**。当前尚未取得学生社区源的完整采集、作者归一和同话题5人证据。澳洲教育部RSS本机HTTP2错误、HTTP1.1超时，UCAS搜索403，未计入可用候选，也未绕过限制。部署前仍需预览验证列表/详情解析与源许可，不把单次HTTP200当作采集验收。

用户授权的追加候选核验：从 [College Confidential 官方国际学生分类页](https://talk.collegeconfidential.com/c/international-students/55) 的 RSS 声明发现 [分类 feed](https://talk.collegeconfidential.com/c/international-students/55.rss) 和 [全站 feed](https://talk.collegeconfidential.com/latest.rss)。两者分别25条/23作者账号、30条/28作者账号，作者与日期均齐全；两个列表不能相加，作者账号也不等于已验证学生。随后用官方 AIHOT `fetchRss` 实测国际学生分类，同样解析25条/23作者账号，最近发布日期2026-04-27，48小时内0条。RSS无next，只证明本次公开窗口可读，没有完整历史、七天趋势或同话题5人证据；本轮先作为候选证据，不删除首轮三源失败来伪装业务成功。

[The Student Room 官方论坛](https://www.thestudentroom.co.uk/forum.php/) 实读403，未发现可核官方RSS，未猜私有接口或绕过限制。另 [Reddit 官方2026-10-08公告](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026) 明确 RSS 将于2026-11-13停止，不能作为长期稳定方案；Data API也正在迁移Developer Platform，不能假定匿名免费API长期可用。

## 只读接口与工作台差距

长期公开API定义：[`apps/api/src/routes/v1.ts`](https://github.com/KKKKhazix/AIHOT/blob/c8704e5313e6b051560365226b3919d7e0ada5ea/apps/api/src/routes/v1.ts)、`site/public/openapi-v1.json`。

- `/api/v1/items`：`{schemaVersion:1,query,items,page:{count,hasMore,nextCursor}}`；item含id/title/summary/source/links/publishedAt/discoveredAt等。须完整分页并保留null。
- `/api/v1/hot-topics`：`{schemaVersion:1,count,items:[{rank,id,title,source,links,sourceCount,signalCount,participantCount,sourceNames,latestAt}]}`。无heat/trend/spark，不能由rank伪造。
- `/api/v1/stories/:publicId`：`{schemaVersion:1,story:{publicId,title,status,sourceCount,reportCount,firstReportAt,latestAt,latest,digest,digestUpdatedAt,links,reports,storyline,related}}`；reports最多50，合并308。
- `/api/v1/dailies/latest`：`{schemaVersion:1,report:{date,generatedAt,windowStart,windowEnd,links,attribution,lead,sections,flashes}}`；未生成404，不能编造摘要。
- 网站内部 `/api/site/hot` 有 `{computedAt,windowHours,entries:[{story,heat,trend,trendPct,badges,participantCount,sourceCount,sourceNames,spark,summary,...}]}`，spark是近24小时25点且可为null。`/api/site/stories/:publicId` 有7天按小时heat、whyHot、timeline、topics。它们不是长期v1契约；fork固定版本后可复用，但要导出明确的只读Voice契约。
- 尚缺完整月费用/预留、真实下一次计划、低于5被过滤数、全体参与者去重数、国家/学校/类型及关键词规则。不能用样例或0填未知。

Claude UI接线前置：`src/modules/voice/VoicePage.jsx` 直接访问`v.hot[0].id`，空榜会崩；DAYS固定10-10到10-16；spark硬按7点；trend不支持new/unknown。须支持空榜、真实日期和缺历史，不能后端塞假条目绕过。

## 初始未配置时的接口建议（保留决策依据）

建议当前注册真实 `GET /api/v3/voice`，明确返回HTTP503，例如 `{error:"留学之声引擎尚未部署并完成数据源验收",code:"VOICE_NOT_CONFIGURED"}`；不访问aihot.news、不启动引擎、不产生费用。设置状态仍为`off`。503是尚不可用，不应触发501示例fallback；待本机引擎通过真实来源/预算验收再返回完整成功shape。

此阶段不得返回200空数组伪装已接通：既没有真实引擎读取成功，当前UI空榜也尚不兼容。Claude须把503显示为可理解的未配置状态；后续真实读取成功而无合格话题时，应返回200合法空榜并正常渲染。
