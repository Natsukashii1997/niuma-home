/* 首页：月底交付倒计时、Codex 重置预警、等你审核、项目提醒，保留促销点阵、日程、日报、Agent。
   动效：① 数字滚动 + ② 点阵亮起（一页最多两种）。 */
(() => {
  const { D, esc, icon, tag, card } = P;

  // 原型里的「现在」= 2026-10-16 + 真实时分，倒计时按北京时间每分钟刷新。
  const fakeNow = () => { const d = new Date(); return new Date(`2026-10-16T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00+08:00`); };
  const countdown = () => {
    const ms = Math.max(0, new Date(D.CODEX.next) - fakeNow());
    const m = Math.floor(ms / 60000);
    return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), mi: m % 60 };
  };
  const cdHTML = () => {
    const c = countdown();
    const p = (n) => String(n).padStart(2, "0");
    return `<span><b>${p(c.d)}</b><em>DAYS</em></span><i class="sep">:</i><span><b>${p(c.h)}</b><em>HRS</em></span><i class="sep">:</i><span><b>${p(c.mi)}</b><em>MIN</em></span>`;
  };
  const stages = ["预告", "确认", "修正", "撤回"];

  const greet = () => { const h = new Date().getHours(); return h < 6 ? "夜深了" : h < 12 ? "上午好" : h < 18 ? "下午好" : "晚上好"; };

  P.pages.home = {
    render() {
      const steps = D.MONTH_STEPS;
      const done = steps.filter((s) => s.state === "done").length, doing = steps.filter((s) => s.state === "doing").length;
      return `${P.head({ hero: true, title: `${greet()}，常浩`, sub: "FRI 16 OCT 2026 · DAY 289 · WK 42 · 正在准备 11 月", actions: `<button class="btn" type="button" data-open-drawer>${icon("chat")} 自言自语 3</button><a class="btn btn-primary" href="#/month/overview">${icon("month")} 打开 11 月档案</a>` })}
      <div class="home-grid">
        <div class="kpi-grid col-12">
          <a class="kpi is-hero kpi-deadline" href="#/month/overview" data-dither>
            <span class="label">距月底交付 · 11 月档案</span>
            <span class="kpi-value"><span class="flip-number" data-flip="15"></span><small> 天</small></span>
            <span class="kpi-steps">${steps.map((s) => `<i class="${s.state}" title="${s.name}"></i>`).join("")}</span>
            <span class="kpi-foot"><span>${done}/6 完成 · ${doing} 进行中</span><span>10-31 截止</span></span>
          </a>
          <a class="kpi" href="#/month/prices" data-dither><span class="label">本月促销 SKU</span><span class="kpi-value"><span class="flip-number" data-flip="6"></span></span>
            <span class="kpi-foot"><span>■ 11 月草稿 2 条</span><span class="signal">1 条破底线</span></span></a>
          <a class="kpi" href="#/month/materials" data-dither><span class="label">本月物料 · NAS</span><span class="kpi-value"><span class="flip-number" data-flip="18"></span><small> 张</small></span>
            <span class="kpi-foot"><span>■ 11 月待交付 6 项</span><span>3 项沿用</span></span></a>
          <a class="kpi" href="#/reports" data-dither><span class="label">本周日报</span><span class="kpi-value"><span class="flip-number" data-flip="4"></span><small> 篇</small></span>
            <span class="kpi-foot"><span>WK 42 · 自 10-12</span><span>周报待生成</span></span></a>
        </div>

        <section class="card col-8">
          <div class="card-head"><h2>${icon("alert")} Codex 重置预警</h2><div class="card-extra">${tag(D.CODEX.stage, "orange")}<button class="link" type="button" data-codex>历史与规则</button></div></div>
          <div class="codex-card">
            <div class="codex-main">
              <div class="row"><span class="label">TIBO · @${D.CODEX.author}</span><span class="spacer"></span><span class="label">发布 ${D.CODEX.posted} · 检查 ${D.CODEX.checked}</span></div>
              <blockquote class="codex-quote">“${esc(D.CODEX.quote)}”</blockquote>
              <p class="codex-zh">${esc(D.CODEX.quoteZh)}</p>
              <div class="row"><span class="stage-row">${stages.map((s) => tag(s, s === D.CODEX.stage ? "green" : "")).join("")}</span><span class="spacer"></span><span class="label">下次检查 明天 10:00 · 机械邪龙兽已推送</span></div>
            </div>
            <div class="codex-count">
              <span class="label">下次重置 · 北京时间</span>
              <strong>10 月 18 日 周日 09:00 前</strong>
              <div class="countdown" id="codex-cd">${cdHTML()}</div>
            </div>
          </div>
        </section>

        ${card({ cls: "col-4", title: "等你审核", icon: "gate", extra: `<span class="num">${D.GATES.length}</span>`, body: `<ul class="list gate-list">${D.GATES.map((g) => `<li><div><strong>${esc(g.node)}</strong><span class="small muted">${esc(g.project)} · ${g.type}</span></div><span class="due${g.soon ? " is-soon" : ""}">${g.due}</span></li>`).join("")}</ul>
          <p class="small muted" style="margin:10px 0 0">门禁只提醒、不拦截后续节点。</p>` })}

        ${card({ cls: "col-8", title: "促销变动 · 近 12 个月", icon: "price", extra: `<a class="link" href="#/month/prices">价格档案</a>`, body: `<div class="row" style="margin-bottom:12px"><span class="label">每月价格节点数 · 2025-11 — 2026-10</span><span class="spacer"></span><span class="card-figure"><span class="flip-number" data-flip="3"></span></span></div><div id="home-matrix"></div>` })}

        ${card({ cls: "col-4", title: "项目提醒 · 2 天内", icon: "project", extra: `<a class="link" href="#/projects/board">项目</a>`, body: `<ul class="list remind-list">${D.REMINDERS.map((r) => `<li><span class="left-days${r.left <= 1 ? " is-soon" : ""}">${r.left}</span><div><strong>${esc(r.node)}</strong><span class="small muted">${esc(r.project)} · ${r.owner}</span></div><span class="due">${r.due}</span></li>`).join("")}</ul>
          <p class="small muted" style="margin:10px 0 0">左侧数字为剩余天数，只在工作台提醒。</p>` })}

        ${card({ cls: "col-4", title: "今日日程", icon: "calendar", extra: `<a class="link" href="#/home">飞书</a>`, body: `<ul class="list calendar-list today-list">${D.SCHEDULE.map((s) => `<li class="${s.now ? "is-now" : ""}"><span class="list-time">${s.time}</span><span>${esc(s.title)}</span><span class="small muted">${esc(s.note)}</span></li>`).join("")}</ul>` })}
        ${card({ cls: "col-4", title: "最新日报", icon: "reports", extra: `<a class="link" href="#/reports">全部</a>`, body: `<p class="label" style="margin:0 0 6px">2026-10-15 · 周四</p><p style="margin:0 0 8px;font-weight:600">双11 物料进入制作，价格方案待评审</p>
          <ul class="list"><li><span class="small">九宫格文案 6/9 格完成</span><span class="spacer"></span>${tag("林瑶")}</li><li><span class="small">W3 调研问卷导师端未约到</span><span class="spacer"></span>${tag("卡点", "orange")}</li><li><span class="small">11 月价格草稿 2 条待评审</span><span class="spacer"></span>${tag("常浩")}</li></ul>` })}
        ${card({ cls: "col-4", title: "Agent", icon: "agent", extra: `<a class="link" href="#/agents">全部</a>`, body: `<ul class="list agent-list">
          <li>${P.avatar("文案助手")}<span>文案助手</span><span class="agent-model">gpt-6.1-sol · 知识库 12 篇</span></li>
          <li>${P.avatar("带教 Agent")}<span>带教 Agent</span><span class="agent-model">gpt-6.1-sol · 本周 2 条</span></li></ul>` })}
      </div>`;
    },
    mount(root) {
      P.dotMatrix(P.$("#home-matrix", root), ["N", "D", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O"].map((l, i) => ({ label: l, value: [4, 1, 2, 1, 1, 1, 2, 3, 2, 1, 2, 3][i], hint: `${i < 2 ? 2025 : 2026}-${String(((i + 10) % 12) + 1).padStart(2, "0")}` })), { highlight: 11, unit: " 个节点" });
      const cd = P.$("#codex-cd", root);
      const id = setInterval(() => { if (!document.body.contains(cd)) return clearInterval(id); cd.innerHTML = cdHTML(); }, 60000);
      P.$("[data-open-drawer]", root).addEventListener("click", () => P.openDrawer());
      P.$("[data-codex]", root).addEventListener("click", () => P.openModal(`
        <div class="card-head"><h2>${icon("alert")} Codex 重置预警 · 历史与规则</h2><button class="icon-btn" type="button" data-close aria-label="关闭">${icon("close")}</button></div>
        <div class="modal-body">
          <dl class="kv" style="margin-bottom:16px">
            <dt>数据源</dt><dd class="mono">aihot.news/api/v1/codex-resets/recent ${tag("正常", "blue")}</dd>
            <dt>检查</dt><dd>每天 10:00，服务启动时补查一次；睡眠错过 10:00，醒来后补查补推</dd>
            <dt>推送</dt><dd>预告、确认、修正、撤回四种阶段，由机械邪龙兽私信常浩；同一条帖子只推一次</dd>
            <dt>失效</dt><dd>接口不可用时，首页显示「数据源不可用，最后一次成功更新于 X」，并推送一次提醒</dd>
          </dl>
          <div class="section-title">最近帖子 · 北京时间</div>
          <ul class="list">${[{ stage: D.CODEX.stage, time: D.CODEX.posted, text: D.CODEX.quote }, ...D.CODEX.history].map((h) => `<li style="align-items:flex-start"><span class="list-time">${h.time}</span>${tag(h.stage, h.stage === "撤回" ? "orange" : h.stage === "确认" ? "green" : "blue")}<span class="mono small" style="flex:1">${esc(h.text)}</span></li>`).join("")}</ul>
        </div>`));
    },
  };
})();
