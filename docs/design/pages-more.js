/* 设计参考画布、项目（推进 / 带教）、知识库整理、Agent、日/周报、设置。 */
(() => {
  const { D, esc, icon, tag, card } = P;

  /* ================= 设计参考画布 ================= */
  const rs = { zoom: 1, filter: "", sel: "r4" };
  const ALL_TAGS = [...new Set(D.REFS.flatMap((r) => r.tags))];
  P.pages.refs = {
    render() {
      const sel = D.REFS.find((r) => r.id === rs.sel);
      return `${P.head({ title: "设计参考", sub: "看到的好素材、好版式放进来，对接海报时直接找参考 · 排版不由工作台代做", actions: `<button class="btn" type="button">${icon("upload")} 上传</button><button class="btn" type="button">${icon("copy")} 粘贴截图</button><button class="btn" type="button">${icon("star")} 从数码世界收藏导入</button>` })}
      <div class="canvas-tools"><span class="label">${icon("filter", 10)} 标签</span><button class="chip${rs.filter ? "" : " is-on"}" type="button" data-tagf="">全部 <span class="num">${D.REFS.length}</span></button>${ALL_TAGS.map((t) => `<button class="chip" type="button" data-tagf="${t}" style="${rs.filter === t ? "background:var(--text);color:var(--panel);border-color:var(--text)" : ""}">${t}</button>`).join("")}
        <span class="spacer"></span><span class="label">拖动卡片移动 · 拖动空白处平移 · 吸附 8px 网格</span></div>
      <div class="canvas-wrap" id="cw">
        <div class="canvas-board" id="board" style="transform:scale(${rs.zoom})">
          ${D.REF_ZONES.map((z) => `<div class="zone" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px"><span>${z.name}</span></div>`).join("")}
          ${D.REFS.map((r) => `<figure class="ref${rs.filter && !r.tags.includes(rs.filter) ? " is-dim" : ""}${r.id === rs.sel ? " is-sel" : ""}" data-ref="${r.id}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;margin:0">
            ${P.poster(r.kind, { big: r.big, title: r.title, seed: r.x % 7, accent: r.accent })}<figcaption><span>${esc(r.title)}</span><span class="mono">${r.tags[0]}</span></figcaption></figure>`).join("")}
        </div>
        <div class="canvas-mini">${sel ? `<div class="row"><b>${esc(sel.title)}</b>${sel.tags.map((t) => tag(t)).join("")}</div><div class="row" style="margin-top:6px"><span class="mono small muted">来自小红书收藏 · 10-12</span><span class="spacer"></span><a class="btn btn-xs" href="#/month/brief">${icon("brief")} 加入 11 月 brief</a></div>` : ""}</div>
        <div class="canvas-zoom"><button type="button" data-zoom="-1" aria-label="缩小">−</button><span>${Math.round(rs.zoom * 100)}%</span><button type="button" data-zoom="1" aria-label="放大">+</button></div>
      </div>`;
    },
    mount(root) {
      const cw = P.$("#cw", root);
      root.addEventListener("click", (e) => {
        const f = e.target.closest("[data-tagf]"); if (f) { rs.filter = f.dataset.tagf; return P.redraw(); }
        const z = e.target.closest("[data-zoom]"); if (z) { rs.zoom = Math.min(1.5, Math.max(0.5, rs.zoom + Number(z.dataset.zoom) * 0.25)); return P.redraw(); }
      });
      // 悬浮：一帧跳到抬起态（错位网点「影子」加深），不用过渡。
      P.$$(".ref", root).forEach((el) => {
        el.addEventListener("pointerenter", () => el.classList.add("is-lift"));
        el.addEventListener("pointerleave", () => el.classList.remove("is-lift"));
      });
      let drag = null;
      cw.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".canvas-zoom, .canvas-mini")) return;
        const el = e.target.closest(".ref");
        if (el) {
          const r = D.REFS.find((x) => x.id === el.dataset.ref);
          drag = { el, r, sx: e.clientX, sy: e.clientY, ox: r.x, oy: r.y, moved: false };
        } else drag = { pan: true, sx: e.clientX, sy: e.clientY, ox: cw.scrollLeft, oy: cw.scrollTop };
        cw.setPointerCapture(e.pointerId);
        cw.classList.toggle("is-panning", !!drag.pan);
      });
      cw.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = (e.clientX - drag.sx) / rs.zoom, dy = (e.clientY - drag.sy) / rs.zoom;
        if (drag.pan) { cw.scrollLeft = drag.ox - (e.clientX - drag.sx); cw.scrollTop = drag.oy - (e.clientY - drag.sy); return; }
        drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 3;
        drag.r.x = Math.round((drag.ox + dx) / 8) * 8; drag.r.y = Math.round((drag.oy + dy) / 8) * 8;
        drag.el.style.left = `${drag.r.x}px`; drag.el.style.top = `${drag.r.y}px`;
      });
      cw.addEventListener("pointerup", () => {
        if (drag && !drag.pan && !drag.moved) { rs.sel = drag.r.id; drag = null; return P.redraw(); }
        drag = null; cw.classList.remove("is-panning");
      });
    },
  };

  /* ================= 项目 ================= */
  const PROJ_NODES = [
    { ph: "启动", t: "项目定义", owner: "林瑶", done: true, due: "07-20" }, { ph: "启动", t: "问题树拆解", owner: "胡贵兰", done: true, due: "07-22" },
    { ph: "启动", t: "立项定义审核", owner: "常浩", gate: true, done: true, due: "07-22" },
    { ph: "计划", t: "WBS 任务拆解", owner: "胡贵兰", done: true, due: "09-30", kids: ["W1 访谈提纲", "W2 销售端访谈", "W3 调研问卷", "W4 字段设计", "W5 原型", "W6 评审"] },
    { ph: "计划", t: "方案审核定稿", owner: "常浩", gate: true, due: "10-28" },
    { ph: "调研", t: "多线调研执行", owner: "胡贵兰", due: "10-18", soon: true, kids: ["导师端", "销售端", "教务"] },
    { ph: "调研", t: "调研结论审核", owner: "常浩", gate: true, due: "" },
    { ph: "实施", t: "产品方案设计", owner: "胡贵兰", due: "" }, { ph: "实施", t: "设计对接与交付", owner: "林瑶", due: "" },
    { ph: "实施", t: "研发对接与开发", owner: "—", due: "" }, { ph: "收尾", t: "复盘与知识沉淀", owner: "常浩", due: "" },
  ];
  let person = 0;
  P.pages.projects = {
    render(sub) {
      if (sub === "mentor") return mentor();
      const phases = ["启动", "计划", "调研", "实施", "收尾"];
      return `${P.head({ title: "项目推进", sub: "标准流程：项目推进、营销战役两套模板 · 节点到期前 2 天在工作台提醒 · 门禁只提醒不拦截", actions: `<button class="btn btn-primary" type="button">${icon("plus")} 新建项目 · 套用模板</button>` })}
      ${P.tabs("projects")}
      <div class="proj-layout">
        <div>${[["T2 选课工具", "项目推进模板", "调研中", 4, 11, true], ["双11 冲分节", "营销战役模板", "实施中", 5, 17, false], ["T1 带教工作台", "项目推进模板", "已结项", 17, 17, false]].map(([n, t, s, d, all, act]) => `<div class="proj-card${act ? " active" : ""}" data-dither><div class="row"><strong>${n}</strong><span class="spacer"></span>${tag(s, s === "已结项" ? "green" : "blue")}</div><span class="label">${t}</span>${P.ditherBar(d / all)}<span class="mono small muted">${d}/${all} 节点</span></div>`).join("")}</div>
        <div>
          <div class="phase-band">${phases.map((p, i) => `<div class="${i < 2 ? "done" : i === 2 ? "cur" : ""}"><b>${p}</b><span class="label" style="color:inherit">${i < 2 ? "DONE" : i === 2 ? "NOW" : "—"}</span></div>`).join("")}</div>
          <div class="filter-bar"><span class="segmented"><button class="active" type="button">全部节点</button><button type="button">我的门禁 3</button><button type="button">2 天内 2</button></span><span class="spacer"></span><span class="label">模板说明待补 · 未设日期的节点不提醒</span></div>
          <section class="card">${phases.map((p) => `<div class="phase"><div class="phase-name">${p}</div><div class="phase-nodes">${PROJ_NODES.filter((n) => n.ph === p).map((n) => `
            <div class="node${n.done ? " is-done" : ""}${n.gate ? " is-gate" : ""}"><span>${P.avatar(n.owner, 20)}</span><span class="box"></span><span class="t">${n.t} <span class="small muted">· ${n.owner}</span></span>
              <span>${n.gate && !n.done ? tag("等你审核", "orange") : n.gate ? tag("门禁") : ""}</span><span class="due${n.soon ? " is-soon" : ""}">${n.due || '<span class="muted">未设日期</span>'}</span>
              ${n.kids ? `<div class="kids">${n.kids.map((k, i) => tag(k, i < 2 ? "green" : i === 2 && p === "计划" ? "orange" : "")).join("")}</div>` : ""}
              <div class="node-desc">节点说明 · 交付物 · 检查项：待补</div></div>`).join("")}</div></div>`).join("")}</section>
        </div>
      </div>`;
    },
    mount(root, sub) {
      if (sub !== "mentor") return;
      root.addEventListener("click", (e) => { const b = e.target.closest("[data-person]"); if (b) { person = Number(b.dataset.person); P.redraw(); } if (e.target.closest("[data-save]")) P.toast("已保存本周带教记录（存在工作台，不回写飞书）"); });
      P.typeText(P.$("#coach-fb", root), person === 0
        ? "这周九宫格推进很快，6/9 格已经能用。P4–P6 横幅卡住，是因为还没定「冲分节」主视觉的那句话——先和我对一下主张，再写横幅，会比反复改文案省时间。"
        : "销售端 4 位访谈整理得很扎实，9 条痛点可以直接进字段设计。导师端约不上，别等：先用 Q&A 合集里已有的 13 条导师答复做初稿，周一前把缺口列给我。");
    },
  };
  const mentor = () => {
    const p = D.TRAINEES[person];
    return `${P.head({ title: "管培带教", sub: "读胡贵兰、林瑶最近 30 天的飞书日志 · 带教 Agent 只出草稿，不自动发送", actions: `<button class="btn" type="button">${icon("refresh")} 刷新日志</button>` })}
      ${P.tabs("projects")}
      <div class="person-tabs">${D.TRAINEES.map((t, i) => `<button type="button" class="person-tab${i === person ? " active" : ""}" data-person="${i}">${P.avatar(t.name, 30)}<span style="text-align:left"><b>${t.name}</b><br><span class="label">${t.role}</span></span></button>`).join("")}</div>
      <div class="mentor-layout">
        ${card({ title: `${p.name} · 日志`, icon: "reports", extra: `<span class="label">最近 30 天 · ${p.logs.length} 篇</span><button class="btn btn-xs" type="button">加载更早</button>`, body: p.logs.map((l) => `<div class="log${l.flag === "卡点" ? " is-flag" : ""}"><span class="mono">${l.d}</span><span class="bullet"></span><div>${esc(l.t)} ${l.flag ? tag(l.flag, l.flag === "卡点" ? "orange" : "blue") : ""}</div></div>`).join("") })}
        <section class="card"><div class="card-head"><h2>${icon("mentor")} 带教 Agent · WK 42</h2><div class="card-extra">${tag("草稿", "orange")}<a class="link" href="#/agents">对话</a></div></div>
          <div class="coach-block"><h4>${icon("alert")} 发现的卡点</h4><ul>${person === 0 ? "<li>九宫格 P4–P6 横幅文案未定（10-15）</li><li>不确定折扣九宫格是否要和去年一致</li>" : "<li>W3 导师端访谈约不上，已拖 2 天（10-15）</li><li>字段设计第一版等待审阅</li>"}</ul></div>
          <div class="coach-block"><h4>${icon("search")} 建议追问</h4><ul>${person === 0 ? "<li>「冲分节」想让学生记住哪一句话？</li><li>P4–P6 横幅和 P5 大字是否重复？</li>" : "<li>导师端约不上的原因是时间还是意愿？</li><li>Q&A 合集里的导师答复能覆盖哪些问题？</li>"}</ul>
            <p class="small muted" style="margin:8px 0 0">${icon("link", 10)} 引用：Q&A 合集 · 3 条相关</p></div>
          <div class="coach-block"><h4>${icon("send")} 反馈草稿</h4><div class="ai-box"><span id="coach-fb"></span></div></div>
          <div class="coach-block"><h4>${icon("edit")} 你的结论</h4><label class="field"><textarea rows="3" placeholder="写下这周对 ${p.name} 的判断与下周重点"></textarea></label>
            <div class="row" style="margin-top:10px"><span class="label">历史：WK 41 · WK 40 · WK 39</span><span class="spacer"></span><button class="btn btn-primary btn-sm" type="button" data-save>保存本周记录</button></div></div>
        </section>
      </div>`;
  };

  /* ================= 知识库整理 ================= */
  const opTag = { new: ["新建目录", "blue"], move: ["移动", "orange"], rename: ["重命名", "blue"], "move rename": ["移动 + 重命名", "orange"] };
  const tree = (nodes, after) => `<ul class="tree${nodes === D.KB_BEFORE || nodes === D.KB_AFTER ? " root" : ""}">${nodes.map((n) => {
    const cls = after && n.op ? ` is-${n.op.split(" ")[0]}` : "";
    return `<li><div class="tn${cls}">${icon(n.file ? "file" : "folder")}<span>${esc(n.name)}</span>${after && n.from ? `<span class="from">← ${esc(n.from)}</span>` : ""}${after && n.op ? `<span class="op">${tag(opTag[n.op][0], opTag[n.op][1])}</span>` : ""}</div>${n.kids ? tree(n.kids, after) : ""}</li>`;
  }).join("")}</ul>`;
  P.pages.kb = {
    render() {
      return `${P.head({ title: "知识库整理", sub: "范围：常浩的知识库 · 先在工作台整理，预览确认后同步飞书 · 第一批只做移动、重命名、新建目录", actions: `<button class="btn" type="button">${icon("refresh")} 重新读取飞书</button><button class="btn" type="button">${icon("spark")} AI 建议整理</button>` })}
      <div class="kb-layout">
        ${card({ title: "当前 · 飞书", icon: "kb", extra: `<span class="label">读取于 10-16 09:30</span>`, body: tree(D.KB_BEFORE, false) })}
        <div class="kb-arrow">${icon("right")}</div>
        ${card({ title: "整理后 · 预览", icon: "edit", extra: tag("未同步", "orange"), body: tree(D.KB_AFTER, true) })}
        <section class="card"><div class="card-head"><h2>${icon("check")} 本次变更</h2></div><div class="card-body op-sum">
          <div class="row"><span>移动</span><span class="num">5</span></div><div class="row"><span>重命名</span><span class="num">3</span></div><div class="row"><span>新建目录</span><span class="num">2</span></div>
          <div class="row muted"><span>删除</span><span class="small">不支持 · 移到「99 待清理」</span></div>
          <div class="hr"></div>
          <div class="warn small" style="margin:0">${icon("alert")}<span>移动后飞书链接不变；「99 待清理」里的文档需要你在飞书手动删除。</span></div>
          <label class="row small" style="margin-top:6px"><input type="checkbox" id="kb-ok"> 我已核对预览，确认同步</label>
          <button class="btn btn-primary" type="button" id="kb-sync" disabled>${icon("send")} 同步到飞书</button>
          <div id="kb-p"></div>
        </div></section>
      </div>`;
    },
    mount(root) {
      const ok = P.$("#kb-ok", root), btn = P.$("#kb-sync", root);
      ok.addEventListener("change", () => { btn.disabled = !ok.checked; });
      btn.addEventListener("click", () => { btn.disabled = true; P.runProgress(P.$("#kb-p", root), { label: "同步飞书", doneLabel: "已执行 10 项变更并回读目录树" }); });
    },
  };

  /* ================= Agent ================= */
  let agentTab = "kb";
  P.pages.agents = {
    render() {
      const kbDocs = [["句式", "标题句式 · 冲刺类", 1240], ["句式", "价格表述 · 赠课写法", 860], ["范文", "2025 双11 私信海报文案", 2310], ["brief 范本", "双11 第二批设计 Brief", 6420], ["范文", "选课季九宫格 9 格文案", 1980], ["句式", "行动号召 20 条", 640]];
      const kb = `<div class="card-body stack" style="gap:14px">
          <div class="row"><span class="label">知识量</span><span class="spacer"></span><span class="num">18,240</span><span class="small muted">/ 30,000 字 · 每次对话全量带入</span></div>${P.ditherBar(18240 / 30000, "tall")}
          <div class="drop">${icon("upload")} 拖入或粘贴文字（.md / .txt / .docx）· 你传什么，助手就学着写成什么样</div>
          <ul class="list kb-docs">${kbDocs.map(([t, n, w]) => `<li>${tag(t, t === "brief 范本" ? "blue" : "")}<span style="flex:1">${n}</span><span class="mono">${w.toLocaleString()} 字</span><button class="icon-btn" type="button" title="移除">${icon("close")}</button></li>`).join("")}</ul>
          <p class="small muted" style="margin:0">超过阈值后改为按话题检索再带入，阈值在开发时实测。</p></div>`;
      const chat = `<div class="chat-messages"><div class="bubble user">给 11 月价格图写一句主标题，突出送 1 小时</div><div class="bubble assistant"><span id="agent-a"></span></div></div>
        <div class="chat-input"><textarea rows="2" placeholder="输入消息，Enter 发送"></textarea><button class="btn btn-primary" type="button">${icon("send")} 发送</button></div>`;
      return `${P.head({ title: "Agent", sub: "本机 Codex · 只读沙箱 · 不联网", actions: `<button class="btn" type="button">${icon("plus")} 新建助手</button>` })}
      <div class="chat-layout">
        <nav class="chat-list">${[["文案助手", "知识库 6 篇", true], ["带教 Agent", "胡贵兰 · 林瑶", false]].map(([n, s, a]) => `<a href="#/agents" class="${a ? "active" : ""}" data-dither><span class="row">${P.avatar(n, 24)}<span><strong>${n}</strong><br><span class="small muted">${s}</span></span></span>${tag("gpt-6.1-sol")}</a>`).join("")}</nav>
        <section class="chat-panel"><div class="chat-head"><div class="row">${P.avatar("文案助手", 28)}<strong>文案助手</strong>${tag("high")}</div>
          <span class="segmented"><button type="button" data-at="chat" class="${agentTab === "chat" ? "active" : ""}">对话</button><button type="button" data-at="kb" class="${agentTab === "kb" ? "active" : ""}">知识库 · 6</button></span></div>
          ${agentTab === "kb" ? kb : chat}</section>
      </div>`;
    },
    mount(root) {
      root.addEventListener("click", (e) => { const b = e.target.closest("[data-at]"); if (b) { agentTab = b.dataset.at; P.redraw(); } });
      const a = P.$("#agent-a", root);
      if (a) P.typeText(a, "三个方向供你挑：\n1. 「4000 元 5 小时，再送 1 小时」\n2. 「6 小时冲刺，只付 5 小时」\n3. 「期末还剩 3 周：多送你 1 小时」\n第 2 条最直接，课时单价 667 元可放副标题。");
    },
  };

  /* ================= 日/周报 ================= */
  P.pages.reports = {
    render() {
      const days = [["2026-10-15", "周四", true], ["2026-10-14", "周三"], ["2026-10-13", "周二"], ["2026-10-12", "周一"], ["WK 41 周报", "10-05 — 10-11"]];
      return `${P.head({ title: "日/周报", sub: "读取飞书日报与周报 · 只读", actions: `<button class="btn" type="button">${icon("refresh")} 刷新</button>` })}
      <div class="chat-layout reports-page">
        <nav class="chat-list">${days.map(([d, s, a]) => `<a href="#/reports" class="${a ? "active" : ""}"><strong>${d}</strong><span class="small muted">${s}</span></a>`).join("")}</nav>
        <section class="chat-panel"><div class="chat-head"><strong>2026-10-15（周四）</strong><button class="btn btn-sm" type="button">${icon("copy")} 复制</button></div>
          <div class="report-body"><table class="grid compact"><thead><tr><th>#</th><th>事项</th><th>负责方</th><th>状态</th><th>截止</th></tr></thead><tbody>
            <tr><td>1</td><td>双11 九宫格文案</td><td>林瑶</td><td>${tag("进行中", "blue")}</td><td class="mono">10-18</td></tr>
            <tr><td>2</td><td>W3 调研问卷</td><td>胡贵兰</td><td>${tag("卡点", "orange")}</td><td class="mono">10-18</td></tr>
            <tr><td>3</td><td>11 月价格方案评审</td><td>常浩</td><td>${tag("待评审", "orange")}</td><td class="mono">10-16</td></tr>
            <tr><td>4</td><td>价格图 brief</td><td>常浩</td><td>${tag("已定稿", "green")}</td><td class="mono">10-15</td></tr></tbody></table></div></section>
      </div>`;
    },
  };

  /* ================= 设置 ================= */
  P.pages.settings = {
    render() {
      const row = (k, v, a = "") => `<div class="set-row"><span class="label">${k}</span><span class="mono">${v}</span><span>${a}</span></div>`;
      return `${P.head({ title: "设置", sub: "数据源、留学之声、推送、价格底线与常用入口 · 每项独立编辑、预览后保存" })}
      <div class="set-grid">
        ${card({ title: "数据源", icon: "link", body: [row("时间线", "2026海外大学时间线 · 地区明细表", tag("只读", "blue")), row("NAS", "172-16-1-10 · QuickConnect", tag("内网", "blue")), row("物料目录", "/营销物料/YYYY-MM/…", `<button class="btn btn-xs" type="button">编辑</button>`), row("多维表格", "项目启动模版 · 2 张模板表", tag("只读", "blue")), row("知识库", "常浩的知识库", tag("预览后写", "orange")), row("日报/周报", "飞书文档 × 2", tag("只读", "blue"))].join("") })}
        ${card({ title: "留学之声", icon: "voice", body: [row("运行", "本机 · Node + PostgreSQL", tag("运行中", "green")), row("预算", "¥10 / 月 · 已用 ¥3.42", `<button class="btn btn-xs" type="button">编辑</button>`), row("信源", "Reddit 15 · 官网 8", `<button class="btn btn-xs" type="button">管理</button>`), row("上榜门槛", "独立参与方 ≥ 5", ""), row("院校名单", "与时间线共用 · 48 所", "")].join("") })}
        ${card({ title: "推送", icon: "send", body: [row("机械邪龙兽", "lark profile · codex", tag("已连接", "green")), row("推送内容", "仅 Codex 重置预警 · 四种阶段", ""), row("其他提醒", "只在工作台显示，不推送", "")].join("") })}
        ${card({ title: "价格底线与入口", icon: "price", body: [row("毛利率底线", "30%（演示值）", `<button class="btn btn-xs" type="button">编辑</button>`), row("成本口径", "待你确定", tag("待定", "orange")), row("品牌入口", "飞书多维表格 · 品牌资产", `<a class="link" href="#/settings">${icon("external", 10)} 打开</a>`)].join("") })}
      </div>`;
    },
  };
})();
