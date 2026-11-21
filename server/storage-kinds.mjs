// 存储登记表：两张通用表里各有哪些「kind」、归哪个文件管、存的是什么。
// 只是说明和检查用的清单，运行时不读它；改数据形状仍在各自的服务文件里。
// 新增一种 kind 时在这里加一行，否则 tests/storage-kinds.test.mjs 不过。
//
// 为什么要有它：业务对象除了 server/db.mjs 里的专用表（plans、promos、materials、assistants、strategy_revisions…），
// 大部分存在 v3_documents(kind, id, payload) 里，kind 字符串分散在各服务文件，看表结构看不出数据模型。
// 名字里的 v3 是 2026-10 第三轮界面改版时建表的批次号，不是版本号；表名按「已有列不改名」的规则不动。

// v3_documents：工作台自己的业务记录。经 server/local-records.mjs 的 getRecord / putRecord / listRecords 读写，个别地方直接写 SQL。
export const DOCUMENT_KINDS = {
  // 营销
  'brief': { owner: 'briefs.mjs', what: '设计 Brief，一个月一份（id = 月份）' },
  'brief-attachment': { owner: 'brief-attachments.mjs', what: 'Brief 附件的记录（文件本身在数据目录 brief-attachments/ 下）' },
  'brief-feishu-link': { owner: 'brief-sync.mjs', what: 'Brief 和飞书文档的绑定，以及上次同步时两边的基线' },
  'brief-sync-backup': { owner: 'briefs.mjs', what: '从飞书导入覆盖本地前留的备份（id = 操作编号）' },
  'brief-sync-recovery': { owner: 'brief-sync.mjs', what: 'Brief 同步中断后的恢复记录' },
  'feishu-export': { owner: 'feishu-export.mjs、brief-sync.mjs', what: '写飞书文档的操作回执（策略导出、Brief 同步共用）' },
  'feishu-export-preview': { owner: 'feishu-export.mjs、brief-sync.mjs', what: '写飞书前的预览（要跨进程重启保留，所以落库而不是放内存）' },
  'campaign': { owner: 'campaigns.mjs', what: '当前营销战役（id = current）' },
  'campaign-archive': { owner: 'campaigns.mjs', what: '历史战役' },
  'marketing-source': { owner: 'campaigns.mjs', what: '营销来源读取结果（如战役模板），id = 来源种类' },
  'price-schemes': { owner: 'price.mjs', what: '价格方案矩阵，id = SKU' },
  'refs': { owner: 'references.mjs', what: '设计参考（单条）' },
  'design-refs': { owner: 'references.mjs', what: '设计参考集合' },
  // 策略
  'user-strategy': { owner: 'user-strategy.mjs', what: '月度用户策略 v1：某月改过之后的整月记录（id = 月份）；v2 在专用表 strategy_revisions / strategy_submissions' },
  'strategy-bizcard': { owner: 'strategy-service.mjs', what: '月度用户策略 v2 的业务背景卡（id = 月份）' },
  'timeline-ruling': { owner: 'timeline-rulings.mjs', what: '对时间线异常项的人工裁定' },
  // 项目、带教
  'local-project': { owner: 'projects.mjs', what: '只存在工作台本地的项目' },
  'project-state': { owner: 'projects.mjs', what: '项目节点的本地状态（勾选、日期等），不回写飞书' },
  'mentor-path': { owner: 'mentor-path.mjs', what: '培养路径，一位带教对象一份（id = 姓名）' },
  'mentor-stage': { owner: 'mentor-path.mjs', what: '培养路径各阶段的进度记录' },
  'mentor-record': { owner: 'mentor.mjs', what: '带教周记录（id = 姓名 + 周）' },
  'mentor-draft': { owner: 'mentor.mjs', what: 'AI 生成的带教草稿（接口在，页面暂无入口）' },
  'mentor-reply': { owner: 'mentor.mjs', what: '给管培生提问的回复：发送状态与回执' },
  // 知识库
  'kb-canvas': { owner: 'knowledge-tree.mjs', what: '知识库画布 / 书架的布局' },
  'kb-operation': { owner: 'knowledge-tree.mjs、kb-collect.mjs', what: '知识库写操作和快捷收藏的操作记录' },
  'kb-write-lock': { owner: 'knowledge-tree.mjs、kb-collect.mjs', what: '知识库写入锁（id = 知识空间），同一空间一次只写一个' },
  'kb-collect-pairing': { owner: 'kb-collect-pairing.mjs', what: 'Chrome 收藏插件的配对码（id = current）' },
  // 自言自语
  'selftalk-tag': { owner: 'selftalk.mjs', what: '给自言自语条目打的普通标签' },
  'selftalk-todo': { owner: 'selftalk.mjs', what: '标成待办的自言自语（首页待办会读）' },
  'selftalk-need': { owner: 'selftalk.mjs（写）、needs.mjs（读）', what: '标成需求的自言自语；needs.mjs 把它并进需求列表，供策略导出核对来源' },
  'selftalk-digest': { owner: 'selftalk.mjs', what: '自言自语周汇总（AI 产出，确认后保存）' },
  // 公共机制
  'local-deletion': { owner: 'local-deletions.mjs', what: '软删除状态（本地项目、历史战役、自建助手），id = 对象种类:编号' },
  'legacy-write-receipt': { owner: 'legacy-writes.mjs', what: '老写接口（方案、物料、助手）的幂等回执，id = 请求编号' },
  'codex-push': { owner: 'codex-push.mjs', what: 'Codex 重置提醒的推送状态（id = state）' },
};

// kind 是拼出来的：前缀或后缀固定，其余部分是编号。
export const DOCUMENT_KIND_PATTERNS = [
  { pattern: /^assistant-knowledge:\d+$/, owner: 'assistant-knowledge.mjs', what: '某个助手的知识条目，冒号后是助手编号' },
  { pattern: /^assistant-conversation:\d+$/, owner: 'assistant-conversations.mjs', what: '某个助手的会话列表，冒号后是助手编号' },
  { pattern: /^(refs|design-refs)-save$/, owner: 'references.mjs', what: '设计参考保存 / 导入的幂等回执' },
];

// v3_snapshots：外部来源最近一次成功读取的结果，一个 kind 只有一行，服务重启后先用它顶上。
export const SNAPSHOT_KINDS = {
  'timeline': { owner: 'timeline.mjs', what: '用户时间线（飞书表格）' },
  'nas': { owner: 'nas-materials.mjs', what: 'NAS 物料扫描结果' },
  'selftalk': { owner: 'selftalk.mjs', what: '自言自语（飞书私聊）' },
  'mentor': { owner: 'mentor.mjs', what: '管培生日志' },
  'projects': { owner: 'projects.mjs', what: '项目推进（飞书来源）' },
  'kb': { owner: 'knowledge-tree.mjs', what: '飞书知识库目录树' },
  'brand': { owner: 'brand.mjs', what: '品牌数据' },
  'revenue': { owner: 'revenue.mjs', what: '业务页营收完成度' },
  'business-charts-v1': { owner: 'business-charts.mjs', what: '业务页图表数据' },
};
export const SNAPSHOT_KIND_PATTERNS = [
  { pattern: /^reports:/, owner: 'routes/workspace.mjs', what: '日报 / 周报解析结果，冒号后是飞书文档地址' },
];

const known = (table, patterns, kind) => Object.hasOwn(table, kind) || patterns.some(p => p.pattern.test(kind));
export const isDocumentKind = kind => known(DOCUMENT_KINDS, DOCUMENT_KIND_PATTERNS, kind);
export const isSnapshotKind = kind => known(SNAPSHOT_KINDS, SNAPSHOT_KIND_PATTERNS, kind);
