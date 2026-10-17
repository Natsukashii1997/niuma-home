/* 外框：窗口条、侧栏、路由（#/模块/子页）、自言自语抽屉。换模块用像素溶解，模块内换子页直接切换。 */
(() => {
  const { D } = P;
  const MODULES = [
    { group: "WORK" },
    { key: "home", label: "首页", icon: "home" },
    { key: "month", label: "月档案", icon: "month", badge: "D-15", subs: [["overview", "月度总览"], ["prices", "价格档案"], ["materials", "物料"], ["brief", "设计 brief"], ["campaign", "营销战役"]] },
    { key: "insight", label: "用户洞察", icon: "insight", subs: [["timeline", "用户时间线"], ["needs", "主线需求"], ["strategy", "用户策略"], ["voice", "留学之声"]] },
    { key: "refs", label: "设计参考", icon: "canvas" },
    { group: "TEAM" },
    { key: "projects", label: "项目", icon: "project", badge: "3", subs: [["board", "项目推进"], ["mentor", "管培带教"]] },
    { key: "kb", label: "知识库", icon: "kb" },
    { key: "agents", label: "Agent", icon: "agent" },
    { key: "reports", label: "日/周报", icon: "reports" },
  ];
  const ALL = [...MODULES.filter((m) => m.key), { key: "settings", label: "设置", icon: "settings" }];
  P.MODULES = ALL;
  const modOf = (k) => ALL.find((m) => m.key === k) || ALL[0];

  const parse = () => {
    const [k, s] = location.hash.replace(/^#\/?/, "").split("/");
    const m = modOf(k);
    const sub = m.subs ? (m.subs.find(([key]) => key === s) ? s : m.subs[0][0]) : s || "";
    return { m, sub };
  };

  // 页头与页签（各页面共用）
  P.head = ({ title, sub = "", actions = "", hero = false }) => `<div class="${hero ? "home-hero" : "page-header"}">
    <div><h1>${title}</h1>${sub ? `<p class="${hero ? "label" : "page-subtitle"}">${sub}</p>` : ""}</div>
    <div class="page-actions">${actions}</div></div>`;
  P.tabs = (mkey) => {
    const m = modOf(mkey);
    const cur = parse().sub;
    return `<nav class="tabs" aria-label="${m.label}">${m.subs.map(([k, l]) => `<a href="#/${m.key}/${k}" class="${k === cur ? "active" : ""}">${l}</a>`).join("")}</nav>`;
  };

  const sidebar = P.$("#sidebar");
  const renderSidebar = (cur) => {
    sidebar.innerHTML = `<div class="brand"><span class="brand-mark">W</span><span class="brand-name"><strong>工作台</strong><span class="label">WORK DESK</span></span></div>
      ${MODULES.map((m) => m.group ? `<div class="nav-group label">${m.group}</div>` : `<a href="#/${m.key}" class="${m.key === cur ? "active" : ""}" title="${m.label}">
        ${P.icon(m.icon)}<span class="nav-label">${m.label}</span>${m.badge ? `<span class="nav-badge num">${m.badge}</span>` : ""}</a>`).join("")}
      <div class="spacer"></div>
      <a href="#/settings" class="${cur === "settings" ? "active" : ""}" title="设置">${P.icon("settings")}<span class="nav-label">设置</span></a>
      <div class="sidebar-foot label">LOCAL · 127.0.0.1</div>`;
  };

  const main = P.$("#main");
  let shownKey = null;
  const draw = () => {
    const { m, sub } = parse();
    P.stopAll();
    const page = P.pages[m.key];
    // 每次重画换一个新容器，页面在容器上挂的事件随旧容器一起丢弃，不会重复绑定。
    const el = document.createElement("div");
    el.className = "page";
    el.innerHTML = page.render(sub);
    main.replaceChildren(el);
    main.dataset.page = m.key;
    renderSidebar(m.key);
    const subLabel = m.subs ? ` / <b>${m.subs.find(([k]) => k === sub)[1]}</b>` : "";
    P.$("#chrome-path").innerHTML = `work-desk / ${m.subs ? m.label : `<b>${m.label}</b>`}${subLabel}`;
    document.title = `${m.label} · 工作台原型`;
    page.mount?.(el, sub);
    P.$$("[data-flip]", el).forEach((f) => P.flip(f));
    shownKey = m.key;
  };
  P.redraw = () => { const y = scrollY; draw(); scrollTo(0, y); };
  const route = () => {
    const { m } = parse();
    if (shownKey && m.key !== shownKey) P.dissolve(P.$("#dissolve"), main, () => { draw(); scrollTo(0, 0); });
    else draw();
  };

  /* ---------- 自言自语抽屉 ---------- */
  const drawer = P.$("#selftalk"), toggle = P.$("#selftalk-toggle");
  let filter = "all";
  const tagLabel = { star: ["有价值", "blue"], todo: ["已转待办", "green"], need: ["已转主线需求", "green"], archived: ["已归档", ""] };
  const renderDrawer = () => {
    const list = D.SELFTALK.filter((s) => filter === "all" || (filter === "open" ? !s.tag : filter === "star" ? s.tag === "star" : s.tag === "archived"));
    let lastDay = "";
    drawer.innerHTML = `<div class="st-head"><div><h2>${P.icon("chat")} 自言自语</h2><p class="label">发给自己的飞书消息 · 最近 10 天</p></div>
        <button class="icon-btn" type="button" data-st-close aria-label="关闭">${P.icon("close")}</button></div>
      <div class="st-digest"><div class="row"><span class="label">本周值得回看 · AI</span><span class="spacer"></span><span class="tag">WK 42</span></div>
        <p id="st-digest-text"></p></div>
      <div class="st-filter segmented">${[["all", "全部"], ["open", "未处理"], ["star", "有价值"], ["archived", "已归档"]].map(([k, l]) => `<button type="button" data-st-filter="${k}" class="${filter === k ? "active" : ""}">${l}</button>`).join("")}</div>
      <ol class="st-list">${list.map((s) => {
        const day = s.day !== lastDay ? `<li class="st-day label">${s.day}</li>` : "";
        lastDay = s.day;
        const t = tagLabel[s.tag];
        return `${day}<li class="st-item${s.tag === "archived" ? " is-archived" : ""}" data-dither>
          <div class="row"><span class="mono small muted">${s.time}</span>${s.link ? P.tag("链接", "blue") : ""}${t ? P.tag(t[0], t[1]) : ""}<span class="spacer"></span>
            <button class="icon-btn${s.tag === "star" ? " is-on" : ""}" type="button" title="标记有价值" data-st-act="star" data-id="${s.id}">${P.icon("star")}</button>
            <button class="icon-btn" type="button" title="归档" data-st-act="archived" data-id="${s.id}">${P.icon("archive")}</button></div>
          <p>${P.esc(s.text)}</p>
          ${s.tag === "archived" || s.tag === "todo" || s.tag === "need" ? "" : `<div class="st-actions"><button type="button" class="btn btn-xs" data-st-act="todo" data-id="${s.id}">转为待办</button><button type="button" class="btn btn-xs" data-st-act="need" data-id="${s.id}">转为主线需求草稿</button></div>`}
        </li>`;
      }).join("")}</ol>
      <div class="st-foot"><button class="btn btn-sm" type="button" data-st-refresh>${P.icon("refresh")} 拉取新消息</button><span class="label">上次拉取 10-16 09:45</span></div>`;
    P.$("#st-digest-text").textContent = "3 条值得回看：双11 价格图要写清「送 1 小时课时」；W3 调研拖期需要追问胡贵兰；英国 Essay 季可补一条「引用规范」主线需求。";
  };
  drawer.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.stClose !== undefined) return setDrawer(false);
    if (b.dataset.stFilter) { filter = b.dataset.stFilter; return renderDrawer(); }
    if (b.dataset.stRefresh !== undefined) { P.toast("已拉取：没有新的自发消息"); return; }
    const item = D.SELFTALK.find((s) => s.id === b.dataset.id);
    if (!item) return;
    const act = b.dataset.stAct;
    item.tag = item.tag === act ? "" : act;
    renderDrawer();
    if (act === "todo" || act === "need") P.toast(act === "todo" ? "已加入待办（原型演示，未写入）" : "已生成主线需求草稿，待你在 11 月档案中采纳");
  });
  const setDrawer = (open) => {
    drawer.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("drawer-open", open);
    if (open) renderDrawer();
  };
  toggle.addEventListener("click", () => setDrawer(drawer.hidden));
  P.openDrawer = () => setDrawer(true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden && !P.$("#modal").open) setDrawer(false); });

  // 窗口条时间
  const tick = () => { const d = new Date(); P.$("#chrome-time").textContent = `FRI 16 OCT · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  tick(); setInterval(tick, 30000);

  P.$$("[data-icon]").forEach((el) => { el.outerHTML = P.icon(el.dataset.icon); });
  P.installDither();
  addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#/home"; else route();
})();
