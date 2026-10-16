/* 用户洞察：用户时间线（按月 / 按国家 / 搜索提问）、主线需求、用户策略（结构待定）、留学之声。 */
(() => {
  const { D, esc, icon, tag, card } = P;
  const cc = (c) => `<span class="cc" title="${D.COUNTRIES[c]}">${c}</span>`;

  P.pages.insight = {
    render(sub) { return (VIEWS[sub] || VIEWS.timeline).render(); },
    mount(root, sub) { (VIEWS[sub] || VIEWS.timeline).mount?.(root); },
  };

  /* ================= 用户时间线 ================= */
  const tl = { view: "month", country: "AU", off: new Set() };
  const TYPES = ["Final", "选课", "Essay", "出分", "开学"];
  const monthView = () => {
    const evs = D.EVENTS.filter((e) => !tl.off.has(e.c) && !tl.off.has(e.type));
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const day = i - 5; // 2026-11-01 为周日；周一开头，前面补 6 天（10-26 至 10-31）
      const inMonth = day >= 1 && day <= 30;
      const label = day < 1 ? 31 + day : day > 30 ? day - 30 : day;
      const key = inMonth ? `11-${String(day).padStart(2, "0")}` : "";
      const starts = inMonth ? evs.filter((e) => e.from === key) : [];
      const chips = starts.slice(0, 4).map((e) => `<span class="ev${["AU", "NZ"].includes(e.c) && e.type === "Final" ? " is-hot" : ""}" title="${esc(`${D.COUNTRIES[e.c]} · ${e.s} · ${e.type} · ${e.from} → ${e.to}`)}">${cc(e.c)}<span>${esc(e.s)} ${e.type}${e.to !== e.from ? ` →${e.to.slice(3)}` : ""}</span></span>`).join("");
      cells.push(`<div class="cal-d${inMonth ? "" : " is-out"}"><span class="dn">${label}</span>${chips}${starts.length > 4 ? `<span class="more">+${starts.length - 4} 个</span>` : ""}</div>`);
    }
    const countryCounts = Object.keys(D.COUNTRIES).map((c) => [c, D.EVENTS.filter((e) => e.c === c).length]);
    return `<div class="tl-layout">
      <aside class="tl-filter"><span class="section-title">国家</span>${countryCounts.map(([c, n]) => `<label><input type="checkbox" data-toggle="${c}"${tl.off.has(c) ? "" : " checked"}> ${cc(c)} ${D.COUNTRIES[c]}<span class="num">${n}</span></label>`).join("")}
        <div class="hr"></div><span class="section-title">事件类型</span>${TYPES.map((t) => `<label><input type="checkbox" data-toggle="${t}"${tl.off.has(t) ? "" : " checked"}> ${t}<span class="num">${D.EVENTS.filter((e) => e.type === t).length}</span></label>`).join("")}
        <div class="hr"></div><span class="small muted">黑底 = 已推出主线需求的节点；虚线 = 跨月延续。</span></aside>
      <div><div class="cal">${["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => `<div class="cal-h">${d}</div>`).join("")}${cells.join("")}</div></div></div>`;
  };
  const countryView = () => {
    const cm = D.COUNTRY_MATRIX[tl.country];
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    let k = cm.seed;
    const rows = cm.schools.map((s) => `<div class="s">${esc(s)}</div>${months.map((m) => {
      k = (k * 9301 + 49297) % 233280;
      const n = [0, 1, 1, 2, 2, 3][k % 6];
      const final = m === 11 && n > 0;
      return `<div class="cell${m === 11 ? " is-cur" : ""}" title="${esc(`${s} · ${m} 月 · ${n} 个节点`)}">${Array.from({ length: n }, (_, j) => `<i data-cm class="${final && j === 0 ? "is-final" : j === 1 ? "is-light" : ""}"></i>`).join("")}</div>`;
    }).join("")}`).join("");
    return `<div class="filter-bar"><span class="segmented">${Object.keys(D.COUNTRY_MATRIX).map((c) => `<button type="button" data-country="${c}" class="${c === tl.country ? "active" : ""}">${D.COUNTRIES[c]}</button>`).join("")}</span><span class="spacer"></span><span class="label">${cm.schools.length} 所 · 2026 全年</span></div>
      <div class="cm" style="grid-template-columns:120px repeat(12,minmax(0,1fr))"><div class="h">学校</div>${months.map((m) => `<div class="h${m === 11 ? " is-cur" : ""}">${m}月</div>`).join("")}${rows}</div>
      <div class="legend-row"><span class="legend"><i></i>考试 / 选课等节点</span><span class="legend"><i style="background:none;border:2px solid var(--text)"></i>出分 / 开学</span><span class="legend"><i style="background:var(--signal)"></i>下月关键节点</span><span class="legend">网点列 = 下月</span></div>`;
  };
  const askView = () => `<div class="card"><div class="card-body">
      <form class="ask-box" id="ask"><input value="英国本科 11 月在忙什么？哪些学校最集中？" aria-label="提问"><button class="btn btn-primary" type="submit">${icon("search")} 提问</button></form>
      <div class="ask-chips">${["澳洲 S2 期末哪几天最集中", "12 月哪些国家放假", "美国春季选课窗口", "港校考试周和 Reading Week"].map((q) => `<button class="chip" type="button" data-q="${q}">${q}</button>`).join("")}</div>
      <div class="answer"><span id="ask-a"></span></div>
      <div class="section-title" style="margin-top:16px">依据 · 时间线原始节点</div>
      <table class="grid compact"><thead><tr><th>国家</th><th>学校</th><th>事件</th><th>日期</th></tr></thead><tbody>${D.EVENTS.filter((e) => e.c === "UK").map((e) => `<tr><td>${cc(e.c)}</td><td>${e.s}</td><td>${e.type}</td><td class="mono">${e.from} → ${e.to}</td></tr>`).join("")}</tbody></table>
    </div></div>`;
  const timeline = {
    render() {
      return `${P.head({ title: "用户时间线", sub: "来源：飞书《2026海外大学时间线》地区明细表 · 只读同步 · 首版只看本科", actions: `<button class="btn" type="button" data-anom>${icon("alert")} 异常清单 <span class="signal num">${D.ANOMALIES.length}</span></button><button class="btn" type="button" data-sync>${icon("refresh")} 同步飞书</button>` })}
      ${P.tabs("insight")}
      <div class="filter-bar"><span class="segmented">${[["month", "按月"], ["country", "按国家"], ["ask", "搜索提问"]].map(([k, l]) => `<button type="button" data-view="${k}" class="${tl.view === k ? "active" : ""}">${l}</button>`).join("")}</span>
        ${tl.view === "month" ? `<span class="month-switch"><a href="#/insight/timeline">${icon("left", 10)} 10 月</a><span class="is-cur">2026 · 11 月</span><a href="#/insight/timeline">12 月 ${icon("right", 10)}</a></span>` : ""}
        <span class="spacer"></span><span id="sync-p" style="min-width:220px"></span><span class="label">上次同步 10-14 · 每周一自动</span></div>
      ${tl.view === "month" ? monthView() : tl.view === "country" ? countryView() : askView()}`;
    },
    mount(root) {
      root.addEventListener("change", (e) => { const t = e.target.dataset.toggle; if (!t) return; if (tl.off.has(t)) tl.off.delete(t); else tl.off.add(t); P.redraw(); });
      root.addEventListener("click", (e) => {
        const v = e.target.closest("[data-view]"); if (v) { tl.view = v.dataset.view; return P.redraw(); }
        const c = e.target.closest("[data-country]"); if (c) { tl.country = c.dataset.country; return P.redraw(); }
        if (e.target.closest("[data-sync]")) return P.runProgress(P.$("#sync-p", root), { label: "同步时间线", doneLabel: "已同步 · 4 张明细表 · 新增 0" });
        const q = e.target.closest("[data-q]"); if (q) { P.$("#ask input", root).value = q.dataset.q; answer(root); }
        if (e.target.closest("[data-anom]")) P.openModal(`<div class="card-head"><h2>${icon("alert")} 异常清单 · 待你确认</h2><button class="icon-btn" type="button" data-close aria-label="关闭">${icon("close")}</button></div>
          <div class="modal-body"><p class="small muted" style="margin-top:0">导入时发现的冲突，工作台不自行猜测。确认后写入工作台，不改飞书原表。</p>
          <table class="grid compact"><thead><tr><th>学校</th><th>问题</th><th>出处</th><th>处理</th></tr></thead><tbody>${D.ANOMALIES.map((a) => `<tr><td>${a.s}</td><td>${esc(a.issue)}</td><td class="mono">${a.sheet}</td><td><span class="segmented"><button type="button" class="active">待定</button><button type="button">采用 A</button><button type="button">采用 B</button></span></td></tr>`).join("")}</tbody></table></div>`, "is-wide");
      });
      const form = P.$("#ask", root);
      if (form) { form.addEventListener("submit", (e) => { e.preventDefault(); answer(root); }); answer(root); }
      if (tl.view === "country") {
        const dots = P.$$("i[data-cm]", root);
        dots.forEach((d) => { d.style.visibility = "hidden"; });
        const batch = Math.max(1, Math.ceil(dots.length / 15));
        if (P.reduced()) dots.forEach((d) => { d.style.visibility = ""; });
        else P.frames((f) => { dots.slice(0, f * batch).forEach((d) => { d.style.visibility = ""; }); if (f * batch >= dots.length) return false; });
      }
    },
  };
  const answer = (root) => P.typeText(P.$("#ask-a", root), "11 月英国本科集中在第一轮 Essay 提交：曼彻斯特 11.03 起、布里斯托 11.09 起、UCL 11.10 起，截止都在 11.27–11.28。3 所学校重叠 18 天，建议主线需求写「Essay 结构与引用规范」，提前 10 天（10.24 起）开始触达。");

  /* ================= 主线需求 ================= */
  const needs = {
    render() {
      return `${P.head({ title: "主线需求 · 2026-11", sub: "由「事件 → 需求」对照表从 11 月事件推导 · AI 草稿需要你采纳后才生效", actions: `<button class="btn" type="button" data-rederive>${icon("refresh")} 重新推导</button><button class="btn btn-primary" type="button">${icon("plus")} 手写一条</button>` })}
      ${P.tabs("insight")}
      <div class="chain">${[["用户时间线", "24 个 11 月事件"], ["对照表", "6 类事件"], ["主线需求", "4 条 · 2 已采纳"], ["促销方案", "3 条关联"], ["物料", "6 项 · 3 项关联"]].map(([a, b], i) => `<div class="${i === 2 ? "is-cur" : ""}"><span class="label">0${i + 1}</span><b>${a}</b><span class="small">${b}</span></div>`).join("")}</div>
      <div class="need-grid">${D.NEEDS.map((n, i) => `<article class="need${n.status === "AI 草稿" ? " is-draft" : ""}">
        <div class="need-top"><span class="num">0${i + 1}</span><div><h3>${esc(n.seg)} · ${esc(n.node)}</h3><span class="mono small muted">${n.when} · ${n.source}</span></div><span class="spacer"></span>${tag(n.status, n.status === "已采纳" ? "green" : "orange")}</div>
        <dl class="need-body"><dt>需求</dt><dd>${esc(n.need)}</dd><dt>痛点</dt><dd>${esc(n.pain)}</dd><dt>待办</dt><dd>${esc(n.todo)}</dd></dl>
        <div class="need-foot"><span class="mono">促销 ${n.promos} · 物料 ${n.mats}</span><span class="spacer"></span>${n.status === "已采纳" ? `<button class="btn btn-xs" type="button">${icon("edit")} 编辑</button>` : `<button class="btn btn-xs" type="button">丢弃</button><button class="btn btn-xs" type="button">${icon("edit")} 修改</button><button class="btn btn-xs" type="button" data-adopt>${icon("check")} 采纳</button>`}</div></article>`).join("")}</div>
      <div style="height:var(--gap)"></div>
      ${card({ title: "事件 → 需求 对照表", icon: "target", extra: `<span class="label">AI 起草 · 你确认后基本不动</span><button class="btn btn-xs" type="button">${icon("plus")} 新增事件类型</button>`, body: `<div class="table-wrap" style="border:0"><table class="grid compact"><thead><tr><th>事件类型</th><th>提前天数</th><th>需求</th><th>痛点</th><th>待办</th><th>状态</th></tr></thead><tbody>${D.EVENT_MAP.map((r) => `<tr><td><b>${r.type}</b></td><td class="num-cell" style="font-family:var(--font-pixel);font-size:16px">${r.lead}</td><td>${r.need}</td><td>${r.pain}</td><td>${r.todo}</td><td>${tag(r.status, r.status === "已确认" ? "green" : "orange")}</td></tr>`).join("")}</tbody></table></div>
        <p class="small muted" style="margin:10px 0 0">先按事件类型写；个别国家确实不同时再细分为「国家 × 事件类型」。</p>` })}`;
    },
    mount(root) {
      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-adopt]")) { const art = e.target.closest(".need"); art.classList.remove("is-draft"); P.toast("已采纳（原型演示）：促销方案现在可以关联这条需求"); e.target.closest("[data-adopt]").disabled = true; }
        if (e.target.closest("[data-rederive]")) P.toast("已按对照表重新推导：4 条，无变化");
      });
    },
  };

  /* ================= 用户策略（结构待定） ================= */
  const strategy = {
    render() {
      const row = (n, mk, pd, op) => `<div class="strat-row"><div><b>${esc(n.seg)} · ${esc(n.node)}</b><p class="small muted" style="margin:4px 0 0">${esc(n.need)}</p></div><div><ul>${mk.map((x) => `<li>${x}</li>`).join("")}</ul></div><div><ul>${pd.map((x) => `<li>${x}</li>`).join("")}</ul></div><div><ul>${op.map((x) => `<li>${x}</li>`).join("")}</ul></div></div>`;
      return `${P.head({ title: "用户策略 · 2026-11", sub: "主线需求 → 策略 → 营销 / 产品 / 运营行动项 · 只写做什么和为什么", actions: `<button class="btn" type="button">${icon("search")} 问策略</button><button class="btn btn-primary" type="button">${icon("external")} 导出飞书文档</button>` })}
      ${P.tabs("insight")}
      <div class="sample-note" style="margin-bottom:var(--gap)">${icon("alert")}<span><b>示例框架</b>：策略的具体结构待深入讨论，参考文档已记录。下面的行动项为 AI 草稿，不含负责人和时间，由你拆单时补。</span></div>
      <section class="card"><div class="strat-row h"><div>主线需求</div><div>营销</div><div>产品</div><div>运营</div></div>
        ${row(D.NEEDS[0], ["价格图主打「5 小时 + 送 1 小时」", "九宫格唤起「期末还剩 3 周」"], ["冲刺课包按科目拆分", "考前 72 小时答疑通道"], ["业务私信话术：先问考试日程", "排课预留 11.02–11.20 晚间档"])}
        ${row(D.NEEDS[1], ["朋友圈三宫格：引用格式避坑"], ["Essay 结构审读单次服务"], ["导师端准备英式论文范例"])}
        ${row(D.NEEDS[2], ["选课季避坑指南复用 9 月版"], ["选课评估表模板"], ["选课窗口前 7 天群发提醒"])}
      </section>`;
    },
  };

  /* ================= 留学之声 ================= */
  const vs = { scope: "all", tab: "hot", sel: "v1" };
  const spark = (seed) => `<span class="spark">${Array.from({ length: 8 }, (_, i) => `<i style="height:${4 + ((seed * (i + 3) * 7) % 14)}px"></i>`).join("")}</span>`;
  const trendTag = (t) => ({ surge: `<span class="trend surge">SURGE</span>`, rising: `<span class="trend rising">${icon("up", 8)} RISING</span>`, up: `<span class="trend up">${icon("up", 8)} UP</span>`, down: `<span class="trend down">DOWN</span>`, flat: `<span class="trend down">FLAT</span>` }[t]);
  const voice = {
    render() {
      const list = D.VOICE.filter((v) => vs.scope === "all" || (vs.scope === "country" ? v.tags.includes("AU") : v.tags.includes("UQ")));
      const sel = D.VOICE.find((v) => v.id === vs.sel) || list[0];
      const hot = `<div class="voice-layout"><ol class="hot-list">${list.map((v, i) => `<li class="hot${v.id === sel.id ? " is-sel" : ""}" data-topic="${v.id}" data-dither>
          <span class="rank">${String(i + 1).padStart(2, "0")}</span>
          <div><strong>${esc(v.title)}</strong><div class="tag-row">${v.tags.map((t, j) => (j === 0 ? `<span class="cc">${t}</span>` : tag(t))).join("")}<span class="mono small muted">${v.part} 个独立来源</span></div></div>
          <div class="heat"><b>${v.heat.toFixed(1)}</b>${trendTag(v.trend)}${spark(i + 2)}</div></li>`).join("")}</ol>
        <section class="card"><div class="card-head"><h2>${icon("voice")} 话题详情</h2><div class="card-extra">${trendTag(sel.trend)}</div></div><div class="card-body stack" style="gap:14px">
          <div><h3 style="font-size:16px;font-weight:600;margin-bottom:6px">${esc(sel.title)}</h3><span class="mono small muted">热度 ${sel.heat} · ${sel.part} 个独立参与方 · 48 小时窗口</span></div>
          <div class="ai-box"><span class="label">${icon("spark")} 共性摘要</span>多所学校公布的期末时间比往年早 1 周，讨论集中在「复习时间不够」「先补哪门」。少数个案（个别课程改考核方式）已过滤。</div>
          <div><div class="section-title">代表来源</div><ul class="list src-list"><li><span>「Finals moved up a week?? anyone else panicking」</span><span class="mono">r/UQreddit · 142 赞 · 10-15</span></li><li><span>「Study plan for 3 finals in 5 days」</span><span class="mono">r/usyd · 88 赞 · 10-15</span></li><li><span>S2 2026 Examination timetable released</span><span class="mono">官网校历 · UniMelb · 10-14</span></li></ul></div>
          <div><div class="section-title">关联主线需求</div><a class="chip" href="#/insight/needs">${icon("link")} 澳洲 · 本科 · S2 Final（已采纳）</a></div>
          <div class="row"><button class="btn btn-sm" type="button" data-to-need>${icon("plus")} 转为主线需求草稿</button><span class="spacer"></span><span class="label">信源 ${esc(sel.src)}</span></div>
        </div></section></div>`;
      const daily = `<section class="card"><div class="card-head"><h2>${icon("reports")} 留学日报 · 2026-10-16</h2><div class="card-extra"><span class="label">覆盖 10-15 08:00 — 10-16 08:00 · 前 12 条</span></div></div><div class="card-body">
          <div class="ai-box" style="margin-bottom:14px"><span class="label">${icon("spark")} 今日总述</span><span id="daily-ai"></span></div>
          <ol class="list">${D.VOICE.map((v, i) => `<li><span class="num" style="width:28px">${i + 1}</span><span style="flex:1">${esc(v.title)}</span>${v.tags.slice(0, 1).map((t) => `<span class="cc">${t}</span>`).join("")}<span class="mono small muted">${v.part} 源</span></li>`).join("")}</ol></div></section>`;
      const trend = (label, cols, vals) => `<section class="card"><div class="card-head"><h2>${icon("up")} ${label}</h2><div class="card-extra"><span class="label">话题：澳洲 S2 期末周提前</span></div></div><div class="card-body"><div id="trend-m" data-cols='${JSON.stringify(cols)}' data-vals='${JSON.stringify(vals)}'></div>
          <div class="hr"></div><div class="section-title">上升最快</div><ul class="list">${D.VOICE.slice(0, 3).map((v) => `<li><span style="flex:1">${esc(v.title)}</span>${trendTag(v.trend)}</li>`).join("")}</ul></div></section>`;
      const body = vs.tab === "hot" ? hot : vs.tab === "daily" ? daily : vs.tab === "week" ? trend("周趋势 · 近 7 天热度", ["10", "11", "12", "13", "14", "15", "16"], [8, 12, 15, 22, 41, 63, 86]) : trend("月趋势 · 近 8 周", ["W35", "W36", "W37", "W38", "W39", "W40", "W41", "W42"], [5, 9, 7, 14, 20, 26, 48, 86]);
      return `${P.head({ title: "留学之声", sub: "基于 AIHOT 引擎 · 只看多数人的共性：独立参与方 ≥ 5 才上榜，同一人 / 同一矩阵只算一次", actions: `<span class="segmented">${[["all", "整体"], ["country", "国家 · 澳洲"], ["school", "学校 · UQ"]].map(([k, l]) => `<button type="button" data-scope="${k}" class="${vs.scope === k ? "active" : ""}">${l}</button>`).join("")}</span>` })}
      ${P.tabs("insight")}
      <div class="voice-top">
        <div class="kpi is-hero"><span class="label">今日上榜话题</span><span class="kpi-value"><span class="flip-number" data-flip="18"></span></span><span class="kpi-foot"><span>新增 5 · SURGE 1</span></span></div>
        <div class="kpi"><span class="label">独立参与方 · 48h</span><span class="kpi-value"><span class="flip-number" data-flip="214"></span></span><span class="kpi-foot"><span>个案已过滤 37</span></span></div>
        <div class="kpi"><span class="label">信源</span><span class="kpi-value"><span class="flip-number" data-flip="23"></span></span><span class="kpi-foot"><span>Reddit 15 · 官网 8 · 免费</span></span></div>
        <div class="kpi"><span class="label">本月模型费用</span><span class="kpi-value">¥<span class="flip-number" data-flip="3.42"></span><small> / 10</small></span><span class="budget">${P.ditherBar(0.342)}<span class="label">三级熔断 · 分 / 时 / 天</span></span></div>
      </div>
      <div class="filter-bar"><span class="segmented">${[["hot", "热榜"], ["daily", "日报"], ["week", "周趋势"], ["month", "月趋势"]].map(([k, l]) => `<button type="button" data-tab="${k}" class="${vs.tab === k ? "active" : ""}">${l}</button>`).join("")}</span><span class="spacer"></span><span class="label">本机运行 · 上次抓取 10:12 · 下次 10:42</span></div>
      ${body}`;
    },
    mount(root) {
      root.addEventListener("click", (e) => {
        const s = e.target.closest("[data-scope]"); if (s) { vs.scope = s.dataset.scope; return P.redraw(); }
        const t = e.target.closest("[data-tab]"); if (t) { vs.tab = t.dataset.tab; return P.redraw(); }
        const tp = e.target.closest("[data-topic]"); if (tp) { vs.sel = tp.dataset.topic; return P.redraw(); }
        if (e.target.closest("[data-to-need]")) P.toast("已生成主线需求草稿，待你在主线需求页采纳");
      });
      const d = P.$("#daily-ai", root);
      if (d) P.typeText(d, D.VOICE_DAILY.join("；") + "。");
      const tm = P.$("#trend-m", root);
      if (tm) { const cols = JSON.parse(tm.dataset.cols), vals = JSON.parse(tm.dataset.vals); P.dotMatrix(tm, cols.map((c, i) => ({ label: c, value: vals[i] })), { highlight: cols.length - 1, rows: 12, unit: " 热度" }); }
    },
  };

  const VIEWS = { timeline, needs, strategy, voice };
})();
