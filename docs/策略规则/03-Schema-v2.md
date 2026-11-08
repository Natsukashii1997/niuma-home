# 03 · Schema v2 `schema 2.1`

月度用户策略的数据结构。代码（批 1 起）按本文实现存储、校验和展示；skill 按本文产出提交内容。

## 1. 总体结构

```
Evidence 事实与证据 ──▶ Scenario 用户情境 ──▶ Claim 研判 ──▶ Opportunity 机会 ──▶ Strategy 方案
                         （对象之间只用 ID 引用）
                                   │
              View Projection：投影成「五大地区 + 其他 × 8 字段」和促销四部分
```

- **Evidence** 由工作台代码从时间线、核验、裁定、业务背景卡生成，skill 只引用、不创建。
- **Scenario / Claim / Opportunity / Strategy** 由 skill 产出，经提交、预览、确认后写入。
- **地区不是情境。** 一个地区单元可以包含多个情境；「其他」组下的新加坡、马来西亚等保留各自国家代码。

## 2. 通用枚举

### 2.1 地区与国家

| 地区 key | 名称 | 包含国家代码 | 业务权重顺序 |
|---|---|---|---|
| `uk` | 英国 | `uk` | 1 |
| `us` | 美国 | `us` | 2 |
| `hk` | 香港 | `hk` | 3 |
| `au` | 澳洲 | `au` | 4 |
| `ca` | 加拿大 | `ca` | 5 |
| `other` | 其他 | `sg` `my` `nz` `mo` `ie` 及以后新增国家 | 6 |

**国家与年份归一化**：时间线快照里的国家代码是大写，后加年份带后缀（如 `UK`、`UK@2027`，见 `server/timeline.mjs`）。生成 Evidence 时必须经过下表归一化，不能假定两者天然相同：

| 时间线代码 | Evidence `country` | 地区 key |
|---|---|---|
| `US`（含源表「美东」「美西」） | `us` | `us` |
| `UK` | `uk` | `uk` |
| `HK` | `hk` | `hk` |
| `AU` | `au` | `au` |
| `CA` | `ca` | `ca` |
| `SG` / `MY` / `NZ` / `MO` / `IE` | `sg` / `my` / `nz` / `mo` / `ie` | `other` |
| 其他新代码 | 小写原代码 | `other` |

后缀 `@<年份>` 拆出来，写进 Evidence 的 `year` 字段；没有后缀的，取首年来源的年份。表外的代码出现时，归一化照常进行，同时在同步报告里列出，提醒补登本表。

### 2.2 status（判断状态）

| 值 | 含义 |
|---|---|
| `known` | 有足够证据，可以作出判断 |
| `inferred` | 有间接依据，作有条件的推断 |
| `unknown` | 依据不足，暂不判断 |
| `not_applicable` | 该问题对这个情境不适用 |

### 2.3 evidenceStrength（证据强度）

| 值 | 判定标准 | 典型来源 |
|---|---|---|
| `strong` | 直接证据，且适用对象匹配 | 官网核实或人工裁定的日期；业务背景卡里的事实记录 |
| `partial` | 间接证据，或样本有限、未经核验 | 业务观察；飞书原表未核实的日期；单一来源 |
| `weak` | 只有常识推断或类比 | AI 依据规律推断；参照往年；管理判断 |
| `none` | 没有证据 | — |

单条证据的强度上限见 [01-来源登记表](01-来源登记表.md)。多条**独立**证据互相印证时，可以升一级，最高 `strong`。同一事件的原表日期、官网核验、人工裁定是同一事实的不同状态，不是独立证据，不能叠加升级（见 3.1「一个事件一条 Evidence」）。

### 2.4 关系与人群

- `targetRelation`（策略面向的人群，研究设定）：`新签` / `续费` / `通用`。
- `observedRelation.value`（经证据支持的用户关系）：`新签` / `续费` / `unknown`。

## 3. 对象定义

### 3.1 Evidence

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `evidenceId` | string | 是 | `EV-` + 身份指纹前 16 位。身份 = 年份 + 地区表 + 学校键 + 列名 + 同名列序号 + 片段身份。**不含单元格地址和原文**。学校键 = 中文校名 + 缩写（与时间线 `schoolName()` 的结果一致） |
| `evidenceVersion` | string | 是 | 有效事实指纹 = 有效起止日期 + 日期精度 + 事件类型 + 锚点类型 + 适用对象限定 + 核验状态 + 原列名 |
| `kind` | enum | 是 | `timeline` / `business` / `voice` |
| `sourceId` | string | 是 | 这条证据当前**生效的**来源：时间线事件已被官网核实为 `SRC-official`，已被人工裁定为 `SRC-ruling`，否则为 `SRC-timeline`；业务背景卡为 `SRC-bizcard` |
| `year` | number | 时间线类必填 | 来源年份，见 2.1 归一化 |
| `country` | string | 时间线类必填 | 归一化后的国家代码（2.1） |
| `school` | string | 时间线类必填 | 中文校名（含缩写），与时间线一致 |
| `header` | string | 时间线类必填 | 源表原列名 |
| `eventType` | enum | 时间线类必填 | Final / 期中 / Essay 截止 / 补考 / 出分 / 选课 / 开学 / Reading Week / 期中假 / 其他。**归一化规则**：取 `server/timeline.mjs` 的 `eventType()` 结果；结果在前 9 个值之内的照用，不在之内的（该函数对不认识的列名会原样返回列名，如「教学日结束」「Withdraw 截止」）一律记为「其他」，原列名保留在 `header` |
| `anchorType` | enum | 时间线类必填 | `start` / `end` / `deadline` / `period` / `release` / `anchor_unknown`，判定见 [05-需求生命周期](05-需求生命周期.md) 第 3 节 |
| `dates` | object | 是 | `{ from, to, precision }`；`precision` ∈ `day` / `month` / `none`；`month` 时 from、to 为空，另给 `months: ["2026-12"]` |
| `verification` | enum | 时间线类必填 | `verified`（官网核实）/ `ruled`（人工裁定）/ `source`（原表日期）/ `guess`（推测）/ `conflict`（冲突未决） |
| `scope` | string | 否 | 适用对象限定，如「仅研究生」「仅国际生」 |
| `ambiguous` | boolean | 是 | 同一格多段重排、拆分、合并，无法与旧片段对应时为 `true`，并生成新 ID；身份碰撞时也为 `true` |
| `identityConflict` | boolean | 否 | 同一快照内与其他 Evidence 身份碰撞时为 `true` |
| `text` | string | business 类必填 | 业务背景卡原文 |
| `bizType` | enum | business 类必填 | `事实记录` / `业务观察` / `管理判断` |
| `source` | object | 是 | `{ ref, raw, snapshot }`：单元格地址或背景卡条目、原文、来源快照指纹。只用于溯源，不参与身份计算 |

**片段身份**：一格只有一段，就是这一格；多段时，用片段标签（如「T1」「Semester 2」）定位，没有标签才用序号。新旧片段数量或标签不一致时，标 `ambiguous`，生成新 ID，不复用旧 ID。

**一个事件一条 Evidence**：官网核验、人工裁定不单独生成 Evidence，而是改变该事件 Evidence 的 `verification`、有效日期和 `sourceId`。同一事实不会被重复算作独立证据。

**身份唯一与碰撞处理**：
- 同一快照内 `evidenceId` 必须唯一。生成时检测到重复，不允许静默合并事件。
- 碰撞的主要来源是同一地区表里出现两条同名学校记录。这种情况下，碰撞的各条 Evidence 都标 `ambiguous=true`、`identityConflict=true`，在同步报告里列出，提醒修正飞书原表；在此之前它们不能作为 `known` 判断的依据，也不能作为窗口依据（I-07、I-18）。
- 不用行号或出现顺序区分同名学校：行顺序会随编辑变化，用它区分反而会让身份漂移。

**和核验、裁定记录键的关系**：官网核验与人工裁定沿用现有记录键（含异常描述的指纹），不与 `evidenceId` 混用。核验、裁定的结果以 `verification` 和有效日期进入 `evidenceVersion`。

**原格修改与核验失效**：现有核验、裁定记录按「来源格 + 原文 + 问题」的指纹对应。飞书原格措辞一改，即使日期没变，对应的核验或裁定也会失效，`verification` 从 `verified` / `ruled` 退回 `source`（或 `guess` / `conflict`），`evidenceVersion` 随之变化。只有原格没有关联核验或裁定时，「措辞改了、日期没变」才不改变版本（见 09 第 8a、8b 例）。

### 3.2 Scenario

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `SCN-<月份>-<地区>-<两位序号>`，如 `SCN-2026-12-uk-01`；同月内稳定，refresh 不重新编号 |
| `region` | enum | 是 | 地区 key |
| `countries` | string[] | 是 | 国家代码，至少一个 |
| `schools` | string[] | 否 | 代表学校；为空表示该国家整体 |
| `academicStage` | enum | 是 | `undergraduate` / `postgraduate` |
| `phase` | string | 是 | 学业阶段，如「Term 1 结课与作业」 |
| `keyTask` | string | 是 | 一句话关键任务 |
| `targetRelation` | enum | 是 | `新签` / `续费` / `通用` |
| `observedRelation` | object | 是 | `{ value, evidenceRefs }`；`value≠unknown` 时只接受 business 类证据 |
| `evidenceRefs` | string[] | 是 | 支撑「这个情境存在」的 Evidence，至少一个 |

**粒度**：合并任务、困难和时间窗相同的用户群。每个地区 1–4 个情境；超过 4 个，说明拆得过细。

### 3.3 Claim

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `CLM-<月份>-<序号>` |
| `scenario` | string | 是 | Scenario ID |
| `claimType` | enum | 是 | `task` / `academic_need` / `pain` / `need_strength` / `readiness` / `barrier` |
| `text` | string | 是 | 正文，不超过 40 字，结论先行 |
| `status` | enum | 是 | 见 2.2 |
| `evidenceStrength` | enum | 是 | 见 2.3 |
| `evidenceRefs` | string[] | 视 status | `known` 时至少一个 |
| `refVersions` | object | 视 evidenceRefs | `{ evidenceId: evidenceVersion }`，提交时记录，用于依赖检查 |
| `rule` | string | 否 | 推导用到的规则，如 `lifecycle-v0.2/Final` |
| `dependsOn` | string[] | 否 | 依赖的其他 Claim |
| `limitations` | string | 视 status | `inferred` 时必填 |
| `gap` | string | 视 status | `unknown` 时必填 |
| `route` | object | 视 status | `unknown` 时必填：`{ status: available / unavailable / research, source, suggestion, reason }` |
| `painKind` | enum | 仅 pain | `typical`（典型困难）/ `observed`（已被反馈、诊断或记录观察到） |
| `level` | enum | 仅 need_strength、readiness | `高` / `中` / `低`；status 为 unknown 时为空 |
| `barrierCode` | string | 仅 barrier | v2 编码（`BR-…`），见 [02-障碍体系v2](02-障碍体系v2.md) |
| `targetRelation` | enum | 仅 barrier、readiness | 这条判断针对的人群 |
| `barrierRole` | enum | 仅 barrier | `primary` / `secondary`。同一情境、同一 `targetRelation` 下最多一个 `primary`；障碍可以多标签并存，但主障碍只有一个 |
| `origin` | enum | 是 | `skill` / `manual`（常浩写的）/ `migrated`（旧数据迁移） |

**页面标签由展示层推导，不存储**：
- `task` + `known` → 客观任务。
- `academic_need` + `known` + `strong`，且证据来自 business 或 voice → 已验证需求；其余 → 潜在需求。
- `pain` 的 `painKind=observed` → 实际困难；`typical` → 典型困难。

### 3.4 Opportunity（批 2 实现，批 1 只预留）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `OPP-<月份>-<序号>` |
| `priority` | enum | 是 | `P0` / `P1` / `P2`，决策等级，不是分数 |
| `name` | string | 是 | 不超过 20 字 |
| `targetRelation` | enum | 是 | 同 2.4 |
| `line` | string | 是 | 业务线，目前固定「大学辅导」 |
| `scenarios` | string[] | 是 | 至少一个 |
| `claims` | string[] | 是 | 支撑这个机会的 Claim，至少一个 |
| `window` | object | 是 | `{ granularity: day / month, from, to, months, basis: [evidenceId], status }`。`day` 为精确日期窗口，`month` 为月度候选机会（只给月份，不给精确行动日期），条件见 I-07 |
| `dimensions` | object | 是 | 六维判断：时间相关性、用户需求、业务重要性、服务适配、商业价值、证据充分性，每维一句 |
| `rationale` | string | 是 | 为什么是这个优先级 |
| `toulmin` | object | P0、P1 必填 | `{ claim, grounds, warrant, backing, qualifier, rebuttal }` |

允许某地区当月没有 P0。

### 3.5 Strategy（批 2 实现）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | `STR-<月份>-<序号>` |
| `tier` | enum | 是 | `主推` / `辅助` / `特殊场景` |
| `audience` | object | 是 | `{ regions, scenarios, targetRelation }` |
| `opportunityRefs` | string[] | 是 | 至少一个 |
| `barrierRefs` | string[] | 是 | 针对的障碍 Claim |
| `promotionGoal` | enum | 是 | 七个目标之一 |
| `playbookCardRefs` | string[] | 是 | 打法卡编号 |
| `window` | object | 是 | 活动适用时间及依据 |
| `eligibility` | string | 是 | 适用人群与条件 |
| `constraints` | string | 是 | 价格、权益、交付与合规边界 |
| `evidenceRefs` | string[] | 是 | 支撑依据 |
| `rationale` | string | 是 | 为什么选这个方案 |
| `alternatives` | array | 是 | `[[打法卡编号, 不采用理由]]`，理由必须是实质性的 |
| `status` | enum | 是 | `推荐` / `附条件推荐` / `候选待确认` / `不采用` |
| `signals` | string | 附条件推荐、候选待确认必填 | 看到什么加码、看到什么撤回 |
| `startCondition` / `exitCondition` | string | 特殊场景必填 | 启用与退出条件 |
| `toulmin` | object | 主推、辅助必填 | 同 Opportunity |
| `baselineDiff` | object | 否 | 与 `baseline-v1` 的差异及分类 |

## 4. 月度文档（一份 revision 的内容）

```jsonc
{
  "schemaVersion": "2.1",
  "month": "2026-12",
  "window": { "from": "2026-12-01", "to": "2026-12-31", "preheatTo": "2027-01-14" },  // 默认展示范围
  "inputs": {
    "timelineSnapshot": "<快照指纹>",
    "evidenceVersions": { "EV-…": "<版本>" },          // 本月引用的全部 Evidence 及版本
    "bizcard": "<背景卡版本指纹 | null>",
    "rules": { "sources": "sources-v1.1", "barrier": "barrier-v2.1", "lifecycle": "lifecycle-v0.2",
               "scout": "scout-v1.1", "quality": "quality-v1", "baseline": "baseline-v1" }
  },
  "producedBy": { "declared": { "executor": "Claude", "model": "…", "skillVersion": "…" } },
                                                       // 只作声明；服务端另记 submission 元数据
  "brief": {                                           // 正式稿顶部
    "judgement": { "text": "…", "claims": ["CLM-…"] },   // 一句话月度判断，≤100 字
    "common":   [{ "text": "…", "status": "…", "evidenceStrength": "…", "evidenceRefs": [] }],
    "diff":     [ /* 同上 */ ],
    "external": [ /* 同上 */ ]
  },
  "regions": [                                       // 六个地区单元都必须存在
    { "key": "uk",
      "priority": { "value": "主战场", "default": "主战场", "reason": "…" },
      "activity": { "value": "高", "status": "inferred", "ratio": 0.46,
                    "dateQuality": { "verified": 3, "ruled": 0, "source": 9, "guess": 1 },
                    "coverage": { "schools": 28, "calculable": 24, "active": 11 },
                    "byCountry": null },             // 仅 other 地区：各国贡献 { sg: {...}, my: {...} }
      "scenarios": ["SCN-…"],
      "emptyReason": null }                          // scenarios 为空时必填，附数据覆盖情况
  ],
  "scenarios": [], "claims": [], "opportunities": [], "strategies": [],
  "research": { "rejected": [], "assumptions": [], "notes": [] },   // 内部研判记录，不在正式稿展示
  "legacy": null                                     // 迁移来的旧版内容，见 04-迁移映射
}
```

- `regions[].priority`：当月策略优先级（主战场 / 次要 / 平稳；迁移数据或无法判断时可为 `null`，`reason` 写「待研判」）。`default` 是按 [05-需求生命周期](05-需求生命周期.md) 第 7 节矩阵得出的初始参考；`value` 与 `default` 不同时，`reason` 必填。默认值只是参考，不直接生成 P0 / P1 机会，也不决定促销主打法。
- `regions[].activity`：当月需求活跃度，底层含义是「候选行动窗口覆盖率」，不是已验证的实际用户需求。计算得出时 `status` 恒为 `inferred`；分母为零时 `value`、`status` 为 `unknown`。`dateQuality` 和 `coverage` 分别表达日期证据质量和学校覆盖情况。计算规则见 05 第 6 节。
- `regions[].scenarios` 可以为空数组：某地区当月没有足够证据形成独立情境时，不编造学生群体，`emptyReason` 写「当前没有足够证据形成独立情境」并附覆盖情况。

## 5. 不变量（校验代码逐条实现，违反即拦截）

| 编号 | 不变量 |
|---|---|
| I-01 | `status=known` ⇒ `evidenceStrength=strong` 且 `evidenceRefs` 非空 |
| I-02 | `status=inferred` ⇒ `evidenceStrength ∈ {partial, weak}` 且 `limitations` 非空 |
| I-03 | `status=unknown` ⇒ `gap` 非空、`route.status` 有值；`route.source` 非空时必须在来源登记表内；`route.status=available` 时 `route.source` 必填 |
| I-04 | `status=not_applicable` ⇒ `limitations` 写明不适用的原因 |
| I-05 | `observedRelation.value≠unknown` ⇒ 其 `evidenceRefs` 至少一条是 business 类 Evidence |
| I-06 | Claim 的 `refVersions` 与当前 Evidence 版本不一致 ⇒ 状态转为「依据已变化」，不能进入新 revision，须重新研判或由常浩确认保留 |
| I-07 | **禁止虚构精度，不禁止粗粒度研判**。① 精确日期窗口（`window.granularity=day`）的依据必须是 `precision=day`、`verification≠conflict`、`anchorType≠anchor_unknown`、`ambiguous=false` 的 Evidence。② 只有月份或锚点不明的 Evidence，可以支撑月度候选机会（`granularity=month`），但不能产出精确行动日期。③ 冲突未决的日期不能被选为任何窗口的依据，只能作为「冲突未决」的风险说明。④ 带时间限制的促销（限时、截止、早鸟、倒计时类）必须有符合 ① 的具体时间依据 |
| I-08 | Strategy `status=推荐` ⇒ 同时满足：引用的 Opportunity 至少一个是 P0 或 P1；`barrierRefs` 非空；每个被引用的障碍 Claim 是 `known`，或 `inferred + partial`；通过 I-14（批 2 起还要通过 I-16）。被引用的障碍里有 `inferred + weak` 的，最多「附条件推荐」；有 `unknown` 的，最多「候选待确认」。没有可匹配购买障碍的用户策略方向，写在用户策略段落里，不生成促销 Strategy |
| I-09 | `origin=manual` 的内容不会被 submission 自动改写；submission 对它的修改在预览里单独列出，常浩逐条确认 |
| I-10 | revision 写入后不可修改；review、rating 只能追加 |
| I-11 | barrier Claim 的 `barrierCode` 必须在障碍体系 v2 内，且其适用人群与 `targetRelation` 相容 |
| I-12 | Evidence 的 `country` 和 Scenario 的 `countries` 里的每个值，都必须是 2.1 归一化表里的具体国家代码，不允许 `other` 或未归一化的大写代码 |
| I-13 | 六个地区单元都必须存在，`activity`、`priority` 字段必填（值可以是 unknown 或 null，见第 4 节）；`scenarios` 可以为空，为空时 `emptyReason` 必填 |
| I-14 | Strategy 引用的打法卡，阶段必须与 `audience.targetRelation` 相容。组合冲突只在**目标人群和时间都重叠**的方案之间判断：两个 Strategy 的 `targetRelation` 相同、`audience` 的地区或情境有交集、`window` 有重叠时，不能违反卡片「不宜组合」，也不能同时使用两种直接降价；面向不同地区、不同人群或时间不重叠的方案，不算冲突 |
| I-15 | 正文字段（text、name、rationale）里不写障碍编码、打法编号、机制编号；只提示，不拦截 |
| I-16 | （批 2 定义）时间适用性：打法卡的结构化时间条件（如早鸟价「距开课 4–8 周」）与引用的需求窗口、行动窗口比对，不满足的方案不能是「推荐」或「附条件推荐」。批 2 先给 47 张卡补结构化时间条件，再定本条的判定细则 |
| I-17 | 引用完整性：Claim、Opportunity、Strategy 里引用的每个 ID（Evidence、Scenario、Claim、Opportunity、打法卡）都必须存在于当前文档或当前快照里；悬空引用直接拦截 |
| I-18 | 同一快照内 `evidenceId` 唯一；`identityConflict=true` 或 `ambiguous=true` 的 Evidence 不能作为 `known` 判断的依据，也不能作为精确窗口的依据 |

I-15 只提示，其余都是拦截级；I-16 在批 2 生效。写作规范的字数、禁用词沿用现有规则，只提示不拦截。

## 6. 展示映射

### 6.1 地区单元 8 字段

| 页面字段 | 来源 |
|---|---|
| ① 用户情境 | 该地区的 Scenario（显示目标人群；`observedRelation` 有证据时另外标出） |
| ② 关键节点 | 情境引用的 Evidence，按锚点日期排序，显示核验状态 |
| ③ 待办任务 | `claimType=task` |
| ④ 核心痛点 | `claimType=pain`，显示典型困难或实际困难 |
| ⑤ 需求状态 | `need_strength` + `readiness`，unknown 照实显示「未知」及缺口 |
| ⑥ 决策障碍 | `claimType=barrier`，按 `targetRelation` 分新签、续费 |
| ⑦ 机会点 | 引用该地区情境的 Opportunity |
| ⑧ 研判依据 | 以上对象的 evidenceRefs、rule、limitations、gap，折叠显示 |

### 6.2 促销四部分（批 2）

| 部分 | 来源 |
|---|---|
| 4.1 本月促销总判断 | 新签、续费各一段，引用主推 Strategy 与对应障碍 |
| 4.2 主推方案 | `tier=主推` |
| 4.3 辅助与地区特殊方案 | `tier=辅助`、`特殊场景` |
| 4.4 适用边界与不采用的方案 | 各 Strategy 的 `alternatives`、`constraints`，加三条底线（毛利、价格锚点、合规） |

## 7. 版本、提交与评价

| 对象 | 性质 | 字段 |
|---|---|---|
| `revision` | 不可变 | `revisionId`、`month`、`schemaVersion`、`content`（第 4 节文档）、`contentHash`、`inputs`、`createdAt`、`confirmedBy`、`submissionId`（人工修改产生的 revision 为空） |
| `submission` | 待确认 | `submissionId`、`month`、`agent`（来自凭据，服务端记录）、`declared`（AI 自报的执行方与模型）、`baseRevision`、`inputFingerprint`、`schemaVersion`、`idempotencyKey`、`content`、`submittedAt`、`state`（`pending` / `confirmed` / `rejected` / `stale`） |
| `review` | 追加 | `reviewId`、`revisionId`、`round`（全面复审 / 返修验收）、`reviewer`、`findings`、`conclusion`、`at` |
| `rating` | 追加 | `ratingId`、`revisionId`、`grade`（A–D）、`reasons`、`feedbackLevel`（内容级 / 规则级）、`at` |

**写入契约**：

1. 智能体凭据只授权提交工具（`strategy_submit`）；它只能创建 submission，不能改 revision。
2. 确认接口不在智能体工具里，只供页面调用。同源校验只是浏览器请求的安全措施，不是身份认证。
3. 确认时，`baseRevision`、`inputFingerprint`、`schemaVersion` 任一与当前不一致，submission 转为 `stale`，要求重新预览。
4. 同一 `idempotencyKey`、同一内容重复提交，返回已有的同一个 submission；同一 `idempotencyKey`、内容不同，明确报冲突（409），不能静默返回旧结果，让调用方误以为新内容已保存。常浩在提交之后改过内容，旧 submission 转为 `stale`。
5. 服务端独立记录提交时间、凭据对应的智能体、确认时间和确认来源；AI 自报的执行方、模型只作声明。

**安全目标**：在单用户可信本机环境中，阻止默认智能体工具误操作，提供提交与确认的流程隔离，保留可审计记录；不声称可以防御拥有同一用户环境下任意本地执行权限的恶意进程。

## 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| schema 2.0 | 2026-11-08 | 初版 |
| schema 2.1 | 2026-11-08 | 批 0 返修（GPT 验收 P1-01、P1-02）：增加国家与年份归一化、eventType 归一化；一个事件一条 Evidence，`kind` 去掉 official / ruling；身份碰撞处理与原格修改导致核验失效的说明；`anchorType` 增加 `period`；需求活跃度改为「候选行动窗口覆盖率」，status 恒为 inferred，增加 dateQuality、coverage、byCountry；地区允许空情境；`barrierRole`；窗口粒度；修订 I-07、I-08、I-12、I-13、I-14；新增 I-16（批 2）、I-17、I-18；幂等冲突报 409 |
