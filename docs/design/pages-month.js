/* 月档案：月度总览、价格档案、物料（NAS）、设计 brief、营销战役。月份是主轴，本月准备下个月。 */
(() => {
  const { D, esc, icon, tag, card, money, signed } = P;
  const monthSwitch = `<span class="month-switch"><a href="#/month/overview" title="10 月档案">${icon("left", 10)} 2026-10</a><span class="is-cur">2026-11</span><a href="#/month/overview" title="12 月档案">2026-12 ${icon("right", 10)}</a></span>`;
  const skuOf = (id) => D.SKUS.find((s) => s.id === id);
  const pct = (v, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

  P.pages.month = {
    render(sub) { return (VIEWS[sub] || VIEWS.overview).render(); },
    mount(root, sub) { (VIEWS[sub] || VIEWS.overview).mount?.(root); },
  };

  /* ================= 月度总览 ================= */
  const overview = {
    render() {
      const today = 16;
      const track = Array.from({ length: 31 }, (_, i) => `<i class="${i + 1 < today ? "past" : i + 1 === today ? "today" : i + 1 === 31 ? "end" : ""}" title="10-${String(i + 1).padStart(2, "0")}"></i>`).join("");
      const col = (title, cls, sub, needs, promo, thumbs) => `<section class="card compare-col ${cls}"><div class="card-head"><h2>${title}</h2><div class="card-extra">${sub}</div></div><div class="card-body">
        <div class="section-title">主线需求</div><ul class="list">${needs.map((n) => `<li class="small">${n}</li>`).join("")}</ul>
        <div class="section-title" style="margin-top:14px">促销</div><p class="small" style="margin:0 0 12px">${promo}</p>
        <div class="section-title">物料</div><div class="thumb-row">${thumbs}</div></div></section>`;
      return `${P.head({ title: "11 月档案", sub: "2026-11 · 准备中 · 10 月内完成，月底前交付确认版物料和促销方案", actions: `${monthSwitch}<button class="btn" type="button">${icon("plus")} 新建 12 月档案</button>` })}
      ${P.tabs("month")}
      <div class="campaign-strip">${icon("bolt", 16)}<span class="label">营销战役</span><strong>双11 冲分节</strong><span class="mono small muted">2026-10-01 → 11-30</span><span class="small">10、11 月的促销方案和物料归入战役</span><span class="spacer"></span><a class="link" href="#/month/campaign">查看战役</a></div>
      <div class="deadline-bar">
        <div><span class="label">距月底交付</span><div class="big"><span class="flip-number" data-flip="15"></span><small class="muted" style="font-size:14px;font-family:var(--font-sans)"> 天</small></div></div>
        <div><div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="label">10 月 · 已过 15 天</span><span class="label">10-31 交付</span></div><div class="deadline-track">${track}</div></div>
        <div style="text-align:right"><span class="label">完成</span><div class="big"><span class="flip-number" data-flip="2"></span><small class="muted" style="font-size:14px">/6</small></div></div>
      </div>
      <div class="stepper">${D.MONTH_STEPS.map((s, i) => `<a class="step is-${s.state}" href="${s.href}" data-dither>
        <span class="step-no"><b>0${i + 1}</b><span class="step-dot"></span></span><strong>${s.name}</strong><span class="small muted">${s.meta}</span></a>`).join("")}</div>
      <div class="row" style="margin:6px 0 10px"><span class="section-title" style="margin:0">参照往期 · 去年同月为主，上个月为辅</span><span class="spacer"></span><span class="label">勾选的项目会带入 11 月档案</span></div>
      <div class="compare-cols">
        ${col(`${icon("archive")} 2025-11 去年同月`, "is-main", tag("主参照", "green"), ["澳洲 S2 期末冲刺", "美国春季选课", "港校考试周串讲"], "双11 · 5 小时包 3900 元直降；10 小时包满减", [P.poster("price", { big: "3900", seed: 1, accent: true }), P.poster("event", { big: "11.11", seed: 2, accent: true }), P.poster("trial", { seed: 3 }), P.poster("grid9", { seed: 2 })].join(""))}
        ${col(`${icon("calendar")} 2026-10 上个月`, "", tag("辅助"), ["英国 Reading Week 前 Essay", "澳洲 S2 期中", "美国期中考试"], "常规价 · 5 小时包 4500；双11 预热海报", [P.poster("price", { big: "4500", seed: 4 }), P.poster("event", { big: "11.11", seed: 5, accent: true }), P.poster("course", { seed: 1 }), P.poster("grid3", { seed: 3 })].join(""))}
        <section class="card compare-col"><div class="card-head"><h2>${icon("check")} 11 月沿用决定</h2><div class="card-extra"><span class="num">4/7</span></div></div><div class="card-body">
          <ul class="list reuse-list">${[["澳洲 S2 期末冲刺 · 主线需求", true, "2025-11"], ["港校考试周串讲 · 主线需求", true, "2025-11"], ["双11 直降 + 加赠玩法", true, "2025-11"], ["试听海报 v1", true, "2026-08"], ["价格图版式", false, "2026-10"], ["折扣九宫格", false, "2025-11 未出"], ["选课海报", false, "本月不出"]].map(([t, on, from]) => `<li><label><input type="checkbox"${on ? " checked" : ""}> <span>${t}</span></label><span class="mono small muted">${from}</span></li>`).join("")}</ul>
          <div class="warn small">${icon("alert")}<span>去年 11 月没出「折扣九宫格」，今年已列入物料清单。</span></div>
        </div></section>
      </div>`;
    },
  };

  /* ================= 价格档案 ================= */
  const ps = { sku: "U5", line: "全部", sel: ["p4", "p5"] };
  const rowsOf = (sku) => D.PRICES.filter((p) => p.sku === sku);
  const cmpRows = [
    ["优惠价", (r) => r.price, (v) => money(v)], ["折扣", (r, c) => c.discount, (v) => pct(v)], ["课时 + 赠送", (r, c) => c.hours + r.gift, (v) => `${v}h`],
    ["课时单价", (r, c) => c.unit, (v) => money(v)], ["补贴", (r, c) => c.subsidy, (v) => money(v)], ["每课时补贴", (r, c) => c.unitSubsidy, (v) => money(v)], ["毛利率", (r, c) => c.margin, (v) => pct(v, 1)],
  ];
  const label = (r) => `${r.from.slice(0, 7)} ${r.event || "常规"}`;
  const cmpHTML = () => {
    const [a, b] = ps.sel.map((id) => D.PRICES.find((p) => p.id === id));
    if (!a || !b) return `<div class="empty">在时间轴或表格里选两条同课时的记录，这里显示逐项差价。</div>`;
    const ca = D.calc(a), cb = D.calc(b);
    return `<div class="cmp-panel">
      <div class="h">字段</div><div class="h">A · ${label(a)}</div><div class="h">B · ${label(b)}</div><div class="h" style="text-align:right">B − A</div>
      ${cmpRows.map(([k, get, fmt]) => {
        const va = get(a, ca), vb = get(b, cb), d = va == null || vb == null ? null : vb - va;
        const dTxt = d == null ? "—" : k === "折扣" || k === "毛利率" ? `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d * 100).toFixed(1)}pt` : k === "课时 + 赠送" ? `${d > 0 ? "+" : ""}${d}h` : signed(d);
        return `<div class="k">${k}</div><div class="v">${fmt(va)}</div><div class="v">${fmt(vb)}</div><div class="d${d < 0 ? " is-down" : ""}">${dTxt}</div>`;
      }).join("")}</div>`;
  };
  const prices = {
    render() {
      const sku = skuOf(ps.sku), rows = rowsOf(ps.sku);
      const groups = D.LINES.map((l) => `<span class="label">${l}</span>${D.SKUS.filter((s) => s.line === l).map((s) => `<a href="#/month/prices" data-sku="${s.id}" class="${s.id === ps.sku ? "active" : ""}"><span>${s.name.split(" · ")[1]}</span><span class="num">${rowsOf(s.id).length}</span></a>`).join("")}`).join("");
      const tl = rows.map((r) => `<div class="pt-node${r.event ? " is-event" : ""}${r.status === "草稿" ? " is-draft" : ""}${ps.sel.includes(r.id) ? " is-sel" : ""}" data-pick="${r.id}" title="点击加入对比">
        <span class="mono">${r.from.slice(2, 7).replace("-", ".")} – ${r.to.slice(5, 7)}月</span><span class="num">${money(r.price)}</span><span class="small">${r.event || "常规"}${r.gift ? ` · 赠 ${r.gift}h` : ""}</span></div>`).join("");
      const table = rows.map((r) => {
        const c = D.calc(r), breach = c.margin != null && c.margin < D.FLOOR;
        return `<tr class="${ps.sel.includes(r.id) ? "is-sel" : ""}">
          <td class="c"><input type="checkbox" data-pick="${r.id}" aria-label="加入对比"${ps.sel.includes(r.id) ? " checked" : ""}></td>
          <td class="mono small nowrap">${r.from.slice(5)} → ${r.to.slice(5)}<span class="diff">${r.from.slice(0, 4)}</span></td>
          <td>${r.event ? tag(r.event, "blue") : '<span class="muted small">常规</span>'}</td>
          <td class="num-cell">${money(r.orig)}</td><td class="num-cell">${money(r.price)}</td><td class="num-cell">${pct(c.discount)}</td>
          <td class="num-cell">${c.hours}${r.gift ? `<span class="signal">+${r.gift}</span>` : ""}</td>
          <td class="num-cell">${money(c.unit)}${r.gift ? `<span class="diff">付费 ${money(c.unitPaid)}</span>` : ""}</td>
          <td class="num-cell">${money(c.subsidy)}</td><td class="num-cell">${money(c.unitSubsidy)}</td>
          <td class="num-cell${breach ? " is-breach" : ""}">${pct(c.margin, 1)}${breach ? `<span class="diff is-down">低于 30%</span>` : ""}</td>
          <td class="small">${r.play || "—"}</td>
          <td>${tag(r.status, r.status === "草稿" ? "orange" : r.status === "生效中" ? "green" : "")}</td></tr>`;
      }).join("");
      return `${P.head({ title: "价格档案", sub: "记录每个节点的价格，同课时两两对比 · 底线：毛利率 ≥ 30%（演示值，口径由你定）", actions: `<button class="btn" type="button">${icon("download")} 导出表格</button><button class="btn btn-primary" type="button" data-new-price>${icon("plus")} 新增价格节点</button>` })}
      ${P.tabs("month")}
      <div class="price-layout">
        <nav class="sku-list" aria-label="SKU">${groups}</nav>
        <div class="stack" style="gap:var(--gap)">
          ${card({ title: `${esc(sku.name)} · 价格时间轴`, icon: "timeline", extra: `<span class="legend"><span class="step-dot" style="width:10px;height:10px;display:inline-block"></span>常规</span><span class="legend"><i style="width:10px;height:10px;background:var(--text);display:inline-block"></i>活动</span><span class="legend signal"><i style="width:10px;height:10px;border:2px solid var(--signal);display:inline-block"></i>草稿</span>`, body: `<div class="price-timeline">${tl}</div>` })}
          ${card({ title: "对比", icon: "filter", extra: `<span class="label">只对比同课时 · 已选 ${ps.sel.length}/2</span>`, body: `<div id="cmp">${cmpHTML()}</div>` })}
          <div class="table-wrap"><table class="grid compact price-table"><thead><tr><th></th><th>生效时间段</th><th>活动</th><th class="r">原价</th><th class="r">优惠价</th><th class="r">折扣</th><th class="r">课时+赠送</th><th class="r">课时单价</th><th class="r">补贴</th><th class="r">每课时补贴</th><th class="r">毛利率</th><th>玩法</th><th>状态</th></tr></thead><tbody>${table}</tbody></table></div>
          ${rows.filter((r) => r.reason).map((r) => `<div class="warn">${icon("alert")}<span><b>${skuOf(r.sku).name} · ${r.event}</b> 毛利率 ${pct(D.calc(r).margin, 1)}，低于底线。原因：${esc(r.reason)}</span></div>`).join("")}
          <section class="card"><div class="card-head"><h2>${icon("spark")} 玩法建议 · 依据 11 月主线需求</h2><div class="card-extra">${tag("AI 草稿", "orange")}<button class="btn btn-xs" type="button" data-regen>${icon("refresh")} 重新生成</button></div></div>
            <div class="card-body stack" style="gap:12px"><div class="ai-box"><span class="label">${icon("spark")} 建议</span><span id="play-ai"></span></div>
            <div class="play-grid">${D.PLAYS.map((p, i) => `<div class="play${i === 0 || i === 2 ? " is-pick" : ""}"><h4>${i === 0 || i === 2 ? icon("check") : ""}${p.name}<span class="spacer"></span><span class="label">${esc(p.fit)}</span></h4><p>${esc(p.logic)}</p><p class="muted" style="margin-top:4px">风险：${esc(p.risk)}</p></div>`).join("")}</div>
            <p class="small muted" style="margin:0">没有往期效果数据，建议只依据主线需求和玩法逻辑，由你判断。</p></div></section>
        </div>
      </div>`;
    },
    mount(root) {
      P.typeText(P.$("#play-ai", root), "11 月主线需求以「澳洲 S2 期末冲刺」为主（10 校，11.02 起），需求明确、时间紧，适合门槛最低的直降；5 小时包建议 4000 元并加赠 1 小时，课时单价降到 667 元，同时守住 4500 的常规价锚点。10 小时包用满减会跌破 30% 底线，建议限量 30 单。");
      root.addEventListener("click", (e) => {
        const sku = e.target.closest("[data-sku]");
        if (sku) { e.preventDefault(); ps.sku = sku.dataset.sku; const rows = rowsOf(ps.sku); ps.sel = rows.slice(-2).map((r) => r.id); return P.redraw(); }
        const pick = e.target.closest("[data-pick]");
        if (pick) {
          const id = pick.dataset.pick;
          ps.sel = ps.sel.includes(id) ? ps.sel.filter((x) => x !== id) : [...ps.sel, id].slice(-2);
          return P.redraw();
        }
        if (e.target.closest("[data-new-price]")) openNewPrice();
        if (e.target.closest("[data-regen]")) P.typeText(P.$("#play-ai", root), "重新生成：若想守住 10 小时包毛利，可改用加赠 2 小时、价格保持 8800，课时单价 733 元，毛利率 43.2%。");
      });
    },
  };
  const openNewPrice = () => {
    const m = P.openModal(`<div class="card-head"><h2>${icon("plus")} 新增价格节点</h2><button class="icon-btn" type="button" data-close aria-label="关闭">${icon("close")}</button></div>
      <div class="modal-body stack" style="gap:16px">
        <div class="form-grid">
          <label class="field span-2"><span>SKU</span><select name="sku">${D.SKUS.map((s) => `<option value="${s.id}"${s.id === "U10" ? " selected" : ""}>${s.name}</option>`).join("")}</select></label>
          <label class="field"><span>活动名（日常价留空）</span><input name="event" value="双11"></label>
          <label class="field"><span>玩法</span><select>${D.PLAYS.map((p) => `<option>${p.name}</option>`).join("")}</select></label>
          <label class="field"><span>生效开始</span><input value="2026-11-01"></label>
          <label class="field"><span>生效结束</span><input value="2026-11-30"></label>
          <label class="field span-2"><span>关联主线需求（必填）</span><select>${D.NEEDS.map((n) => `<option>${n.seg} · ${n.node}</option>`).join("")}</select></label>
          <label class="field"><span>原价</span><input name="orig" type="number" value="10000"></label>
          <label class="field"><span>优惠价</span><input name="price" type="number" value="7800"></label>
          <label class="field"><span>赠送课时</span><input name="gift" type="number" value="2"></label>
          <label class="field"><span>成本（可选）</span><input name="cost" type="number" value="5600"></label>
        </div>
        <div><div class="section-title">自动计算</div><div class="calc-out" id="calc-out"></div></div>
        <label class="field" id="reason-field"><span>破底线原因（必填才能保存）</span><textarea rows="2" name="reason" placeholder="例：引流款，接受低毛利；限量 30 单"></textarea></label>
      </div>
      <div class="modal-foot"><button class="btn" type="button" data-close>取消</button><button class="btn btn-primary" type="button" id="save-price">保存为草稿</button></div>`, "is-wide");
    const val = (n) => Number(P.$(`[name=${n}]`, m).value || 0);
    const update = () => {
      const hours = skuOf(P.$("[name=sku]", m).value).hours;
      const orig = val("orig"), price = val("price"), gift = val("gift"), cost = val("cost");
      const margin = cost ? (price - cost) / price : null, breach = margin != null && margin < D.FLOOR;
      const cells = [["折扣", pct(price / orig)], ["课时单价", money(Math.round(price / (hours + gift)))], ["补贴", money(orig - price)], ["每课时补贴", money(Math.round((orig - price) / hours))], ["付费课时单价", money(Math.round(price / hours))], ["课时 + 赠送", `${hours}+${gift}h`], ["毛利", money(cost ? price - cost : null)], ["毛利率", pct(margin, 1), breach]];
      P.$("#calc-out", m).innerHTML = cells.map(([k, v, b]) => `<div class="${b ? "is-breach" : ""}"><span class="label">${k}${b ? " · 破底线" : ""}</span><b>${v}</b></div>`).join("");
      P.$("#reason-field", m).hidden = !breach;
      P.$("#save-price", m).disabled = breach && !P.$("[name=reason]", m).value.trim();
    };
    m.addEventListener("input", update);
    update();
    P.$("#save-price", m).addEventListener("click", () => { m.close(); P.toast("已保存为草稿（原型演示，未写入）"); });
  };

  /* ================= 物料 ================= */
  let matView = "product";
  const cellHTML = (month, t) => {
    const it = (D.PRODUCT[month] || {})[t.key];
    const cur = month === "2026-11";
    if (!it) return `<div class="wall-empty">${icon("close")}<span>本月未出</span></div>`;
    if (it.pending) return `<div class="wall-cell"><div class="wall-empty is-pending">${icon("clock")}<span>待交付 · 战役版</span><span class="mono" style="font-size:10px">brief 第 4 节</span></div></div>`;
    if (it.decision) return `<div class="wall-empty">${icon(it.decision === "沿用常规" ? "refresh" : "close")}<span>${it.decision}</span>${it.decision === "沿用常规" ? `<span class="mono" style="font-size:10px">→ 2026-08 v1</span>` : ""}</div>`;
    return `<div class="wall-cell${cur ? " is-cur-col" : ""}" data-view="${month}|${t.key}" data-dither>${P.poster(t.key, { big: it.big, title: t.name, seed: it.v + month.length, accent: it.accent })}
      <span class="meta"><span>v${it.v}</span>${it.reuse ? `<span>沿用 ${it.reuse.slice(5)} 月</span>` : "<span>新做</span>"}</span></div>`;
  };
  const materials = {
    render() {
      const months = D.MONTHS;
      const wall = `<div class="wall"><div class="wh">类型</div>${months.map((m) => `<div class="wh${m === "2026-11" ? " is-cur" : ""}"><span>${m}</span><span>${m === "2026-11" ? "准备中" : m === "2026-10" ? "本月" : ""}</span></div>`).join("")}
        ${D.PRODUCT_TYPES.map((t) => `<div class="wt">${t.name}<span class="label">${t.fixed ? "每月固定" : "活动时出"}</span></div>${months.map((m) => `<div>${cellHTML(m, t)}</div>`).join("")}`).join("")}</div>`;
      const mk = `<div class="filter-bar"><span class="segmented"><button class="active" type="button">全部月份</button><button type="button">2026-11</button><button type="button">2026-10</button><button type="button">2026-09</button></span><span class="spacer"></span><span class="label">朋友圈 · 按场景</span></div>
        <div class="mk-grid">${D.MARKETING.map((x, i) => `<div class="mk-card" data-dither data-view="${x.month}|${x.kind}">${P.poster(x.kind, { seed: i + 1, big: i === 0 ? "冲分" : i === 1 ? "11.11" : "", accent: i < 2 })}
          <div class="mk-info"><strong>${esc(x.scene)}</strong><div class="row"><span class="mono small muted">${x.month} · ${x.kind === "grid9" ? "九宫格" : "三宫格"} · ${x.count} 张</span><span class="spacer"></span>${tag(x.status, x.status === "已交付" ? "green" : "orange")}</div></div></div>`).join("")}</div>`;
      return `${P.head({ title: "物料", sub: "原件在公司 NAS，工作台只读扫描、本地只存缩略图 · 按类型和月份排", actions: `<span class="segmented"><button type="button" data-mat="product" class="${matView === "product" ? "active" : ""}">产品物料 · 私信</button><button type="button" data-mat="marketing" class="${matView === "marketing" ? "active" : ""}">营销物料 · 朋友圈</button></span><button class="btn" type="button" data-scan>${icon("refresh")} 重新扫描 NAS</button>` })}
      ${P.tabs("month")}
      <div class="nas-bar"><span class="ok">NAS 已连接 · 内网</span><span>${icon("folder")} /营销物料/YYYY-MM/产品物料|营销物料/类型/</span><span>缩略图缓存 38 MB</span><span>上次扫描 10-16 09:12</span><span class="spacer" style="flex:1"></span><span id="scan" style="min-width:220px"></span></div>
      ${matView === "product" ? wall : mk}
      ${matView === "product" ? `<div class="legend-row"><span class="legend"><span class="changed-dot" style="border-left-color:var(--signal)"></span>待交付</span><span class="legend">${icon("refresh", 10)} 沿用常规</span><span class="legend">${icon("close", 10)} 本月不出 / 未出</span><span class="legend">黑框 = 11 月</span></div>` : ""}`;
    },
    mount(root) {
      root.addEventListener("click", (e) => {
        const mv = e.target.closest("[data-mat]");
        if (mv) { matView = mv.dataset.mat; return P.redraw(); }
        if (e.target.closest("[data-scan]")) return P.runProgress(P.$("#scan", root), { label: "扫描 NAS", doneLabel: "扫描完成 · 新增 0 张" });
        const v = e.target.closest("[data-view]");
        if (v) {
          const [month, kind] = v.dataset.view.split("|");
          const t = D.PRODUCT_TYPES.find((x) => x.key === kind);
          const it = (D.PRODUCT[month] || {})[kind] || {};
          const name = t ? t.name : kind === "grid9" ? "九宫格" : "三宫格";
          P.openModal(`<div class="card-head"><h2>${icon("image")} ${month} · ${name}</h2><button class="icon-btn" type="button" data-close aria-label="关闭">${icon("close")}</button></div>
            <div class="modal-body viewer"><div class="viewer-stage">${P.poster(kind, { big: it.big, title: name, seed: 3, accent: it.accent })}</div>
            <div class="stack" style="gap:14px"><dl class="kv"><dt>NAS 路径</dt><dd class="mono small">/营销物料/${month}/${t ? "产品物料" : "营销物料"}/${name}/v${it.v || 1}.jpg</dd><dt>尺寸</dt><dd>1080 × 1920 · JPG</dd><dt>版本</dt><dd>${tag("v" + (it.v || 1), "green")} ${it.v > 1 ? tag("v" + (it.v - 1)) : ""}</dd><dt>来源</dt><dd>${it.reuse ? `沿用 ${it.reuse}` : "新做"}</dd></dl>
              <button class="btn btn-primary" type="button" data-close>${icon("brief")} 在 11 月 brief 中沿用</button><button class="btn" type="button">${icon("external")} 打开原图（需内网）</button>
              <p class="small muted" style="margin:0">本地只缓存缩略图；不在内网时可看缩略图，原图需连公司网络。</p></div></div>`, "is-wide");
        }
      });
    },
  };

  /* ================= 设计 brief ================= */
  const SECTIONS = [["项目背景与目标", "done"], ["目标受众", "done"], ["项目时间线", "done"], ["详细文案与框架", "part"], ["交付物清单与规格", "done"], ["负责人与审批", "part"], ["附件", ""]];
  const af = (t) => `<span class="autofill">${icon("link", 8)} ${t}</span>`;
  const refStrip = (a, b, reuse) => `<div class="ref-strip"><div class="ref-slot">${P.poster(a.kind, { big: a.big, seed: 2, accent: a.accent })}<span class="small">参考 · ${a.t}</span></div><div class="ref-slot">${P.poster(b.kind, { big: b.big, seed: 4 })}<span class="small">参考 · ${b.t}</span></div>
    ${reuse ? `<div class="ref-slot">${P.poster(reuse.kind, { big: reuse.big, seed: 5 })}<span class="small">沿用往期 · ${reuse.t}</span></div>` : `<div class="ref-slot is-add">${icon("plus")}<span>从 NAS 选择沿用往期</span></div>`}</div>`;
  const brief = {
    render() {
      return `${P.head({ title: "11 月设计 brief", sub: "按月写 · 骨架来自《双11 第二批设计 Brief》7 节 · 背景、受众、价格自动带入", actions: `<button class="btn" type="button" data-copy>${icon("copy")} 复制全文</button><button class="btn btn-primary" type="button" data-export>${icon("external")} 导出飞书文档</button>` })}
      ${P.tabs("month")}
      <div class="brief-layout">
        <nav class="brief-outline" aria-label="章节">${SECTIONS.map(([t, s], i) => `<a href="#/month/brief" class="${i === 3 ? "active" : ""}"><span class="num">${i + 1}</span><span>${t}</span><span class="st ${s}"></span></a>`).join("")}
          <div class="hr"></div><div style="padding:0 8px 8px"><span class="label">完成度</span><div style="margin-top:6px">${P.ditherBar(4.5 / 7, "tall")}</div><p class="small muted" style="margin:6px 0 0">7 节中 4 节完成</p></div></nav>
        <article class="doc">
          <span class="label">DESIGN BRIEF · 2026-11 · 双11 冲分节</span>
          <h2 style="margin-top:6px">大学辅导 11 月私信海报与朋友圈营销海报 设计 Brief</h2>
          <p class="small muted">需求对接 常浩 · 版本 v0.3 · 最后编辑 10-16 11:02</p>

          <h3><span class="num">1</span>项目背景与目标 ${af("来自主线需求")}</h3>
          <p>11 月澳洲 10 所学校进入 S2 期末周（11.02 起），英国第一轮 Essay 集中提交，美国春季选课窗口开放。学生此刻最需要的是「把剩下两三周用在刀刃上」。本批物料从需求唤起、产品理解、案例证明到行动决策，承接双11 冲分节。</p>
          <p><b>目标一</b> 私信场景让业务一张图讲清 11 月价格与赠课。<b>目标二</b> 朋友圈用九宫格唤起「期末冲刺」情绪。<b>目标三</b> 物料统一「冲分节」视觉，区别于常规月份。</p>

          <h3><span class="num">2</span>目标受众 ${af("来自主线需求")}</h3>
          <table class="grid compact"><thead><tr><th>物料</th><th>面向人群</th><th>当前状态与待办</th></tr></thead><tbody>
            <tr><td>价格图</td><td>澳洲 · 本科（S2 Final）</td><td>复习材料多、时间碎；需要列考试日程、排冲刺计划</td></tr>
            <tr><td>冲分节九宫格</td><td>澳洲、英国本科</td><td>期末与 Essay 同时压身；想知道「现在补还来得及吗」</td></tr></tbody></table>

          <h3><span class="num">3</span>项目时间线</h3>
          <table class="grid compact"><thead><tr><th>物料</th><th>交付时间</th><th>优先级</th><th>对接人</th><th>说明</th></tr></thead><tbody>
            <tr><td>价格图</td><td class="mono">10-24</td><td>${tag("P0", "orange")}</td><td>@林瑶</td><td>私信承接，先出</td></tr>
            <tr><td>冲分节九宫格</td><td class="mono">10-28</td><td>${tag("P1")}</td><td>@林瑶</td><td>11-01 朋友圈首发</td></tr></tbody></table>

          <h3><span class="num">4</span>详细文案与框架</h3>
          <h4>4.1 价格图 ${af("价格来自价格档案")}</h4>
          <table class="grid compact"><thead><tr><th>涉及板块</th><th>内容</th><th>说明 · 示例</th></tr></thead><tbody>
            <tr><td class="k">顶栏</td><td class="editable" contenteditable>路觅 Logo · 双11 冲分节角标</td><td>角标右上，橙色只用在角标</td></tr>
            <tr><td class="k">价格区 · 50%</td><td class="editable" contenteditable><b>4000 元 / 5 小时</b>，另送 1 小时（共 6 小时）</td><td>4000 单独突出；「送 1 小时」写清是赠课时，不是降价</td></tr>
            <tr><td class="k">信息区 · 30%</td><td class="editable" contenteditable>适合 S2 期末冲刺 · 课时单价 667 元 · 11.01–11.30</td><td>课时单价小字</td></tr>
            <tr><td class="k">底栏 · 20%</td><td class="editable" contenteditable>slogan + 二维码承接</td><td>固定元素</td></tr></tbody></table>
          ${refStrip({ kind: "price", big: "¥3999", t: "数字做主角", accent: true }, { kind: "event", big: "11.11", t: "斜切角标" }, { kind: "price", big: "4500", t: "2026-10 价格图 v3" })}

          <h4>4.2 冲分节九宫格</h4>
          <div class="p9">${["P1 · 「期末还剩 3 周」", "P2 · 考试日程倒计时", "P3 · 薄弱科目自测"].map((t) => `<div><b>${t.split(" · ")[0]}</b>${t.split(" · ")[1]}</div>`).join("")}
            <div class="span3"><b>P4–P6 横跨三格</b>冲分节主视觉：大字「冲分」，橙色只用在「分」</div>
            ${["P7 · 学员案例：UQ 从 58 到 76", "P8 · 价格与赠课", "P9 · "].map((t) => `<div class="${t.endsWith("· ") ? "is-empty" : ""}"><b>${t.split(" · ")[0]}</b>${t.split(" · ")[1] || "待写"}</div>`).join("")}</div>
          <p class="small muted" style="margin-top:8px">整体色调：墨黑 + 冷灰，橙色只做焦点。</p>
          ${refStrip({ kind: "grid9", big: "冲分", t: "中心格大字", accent: true }, { kind: "grid9", t: "棋盘交替" }, null)}

          <h4>4.3 选课海报</h4>
          <div class="dashed-box small">${icon("close")} 按战役决定：本月不出。</div>

          <h3><span class="num">5</span>交付物清单与规格</h3>
          <table class="grid compact"><thead><tr><th>物料</th><th>比例</th><th>尺寸</th><th>格式</th></tr></thead><tbody>
            <tr><td>价格图</td><td>9:16</td><td class="mono">1080 × 1920</td><td>JPG</td></tr><tr><td>冲分节九宫格</td><td>1:1</td><td class="mono">1080 × 1080</td><td>9 张独立图 + 1 张预览图</td></tr></tbody></table>

          <h3><span class="num">6</span>负责人与审批</h3>
          <dl class="kv"><dt>需求对接</dt><dd>常浩</dd><dt>内容确认</dt><dd>常浩 · <span class="signal">待确认</span></dd><dt>设计对接</dt><dd>林瑶</dd></dl>

          <h3><span class="num">7</span>附件</h3>
          <div class="dashed-box small">${icon("upload")} 拖入附件或从 NAS 选择</div>
        </article>
        <aside class="brief-rail">
          <section class="card"><div class="card-head"><h2>${icon("agent")} 文案助手</h2><div class="card-extra">${tag("句式库 12 篇")}</div></div>
            <div class="card-body stack" style="gap:10px">
              <div class="ai-box"><span class="label">${icon("spark")} 4.2 · P9 草稿</span><span id="brief-ai" class="small"></span></div>
              <button class="btn btn-sm" type="button" data-gen>${icon("spark")} 生成当前段落</button>
              <div class="section-title" style="margin:6px 0 0">句式参考 · 点击插入</div>
              ${[["标题", "「还剩 3 周，够把一门课拉回来」"], ["价格表述", "「4000 元 5 小时，再送 1 小时」"], ["紧迫感", "「11.30 截止，名额按排课余量放」"], ["行动号召", "「扫码，先排一次考试日程」"]].map(([k, t]) => `<div class="phrase"><span class="label">${k}</span>${t}</div>`).join("")}
            </div></section>
          <section class="card"><div class="card-head"><h2>${icon("canvas")} 设计参考</h2><div class="card-extra"><a class="link" href="#/refs">画布</a></div></div>
            <div class="card-body small muted">从画布拖入参考图，或在物料页选择「沿用往期」。</div></section>
        </aside>
      </div>`;
    },
    mount(root) {
      const run = () => P.typeText(P.$("#brief-ai", root), "P9 · 「11.30 前，把 6 小时用在最该补的那门课」——配二维码和「先排一次考试日程」按钮。");
      run();
      P.$("[data-gen]", root).addEventListener("click", run);
      P.$("[data-copy]", root).addEventListener("click", () => P.toast("已复制 brief 全文到剪贴板（原型演示）"));
      P.$("[data-export]", root).addEventListener("click", () => {
        const m = P.openModal(`<div class="card-head"><h2>${icon("external")} 导出飞书文档 · 预览</h2><button class="icon-btn" type="button" data-close aria-label="关闭">${icon("close")}</button></div>
          <div class="modal-body stack" style="gap:12px"><dl class="kv"><dt>目标位置</dt><dd>常浩的知识库 / 01 营销月档案 /</dd><dt>文档名</dt><dd>2026-11 设计 brief · 双11 冲分节</dd><dt>内容</dt><dd>7 节 · 2 个物料 · 参考图 4 张（以图片插入）</dd><dt>操作</dt><dd>新建文档，不覆盖已有文档</dd></dl>
          <div id="export-p"></div></div>
          <div class="modal-foot"><button class="btn" type="button" data-close>取消</button><button class="btn btn-primary" type="button" id="do-export">确认导出</button></div>`);
        P.$("#do-export", m).addEventListener("click", (e) => { e.target.disabled = true; P.runProgress(P.$("#export-p", m), { label: "写入飞书", doneLabel: "已新建文档并回读 7 节" }); });
      });
    },
  };

  /* ================= 营销战役 ================= */
  const campaign = {
    render() {
      const c = D.CAMPAIGN;
      const phases = c.phases.map((p) => `<div class="phase"><div class="phase-name">${p.name}<span class="label">${p.nodes.filter((n) => n.done).length}/${p.nodes.length}</span></div><div class="phase-nodes">${p.nodes.map((n) => `
        <div class="node${n.done ? " is-done" : ""}${n.gate ? " is-gate" : ""}"><span class="num">${n.n}</span><span class="box"></span><span class="t">${n.t}</span>
          <span>${n.gate ? tag("门禁 · 等你审核", n.done ? "" : "orange") : ""}</span><span class="due${n.due === "10-17" ? " is-soon" : ""}">${n.due || '<span class="muted">未设日期</span>'}</span>
          ${n.kids ? `<div class="kids">${n.kids.map((k) => tag(k)).join("")}</div>` : ""}
          <div class="node-desc">节点说明待补</div></div>`).join("")}</div></div>`).join("");
      const choices = ["沿用常规", "用战役版替代", "本月不出"];
      return `${P.head({ title: "营销战役 · 双11 冲分节", sub: `${c.span} · 横跨 10、11 月 · 模板：营销战役（17 节点）`, actions: `<button class="btn" type="button">${icon("plus")} 新开战役</button>` })}
      ${P.tabs("month")}
      <div class="sample-note" style="margin-bottom:var(--gap)">${icon("alert")}<span>模板内容先空着：节点说明、交付物和偏移天数待补。只有手动填了日期的节点会在首页提醒；门禁节点只提醒、不拦截。</span></div>
      <div class="home-grid">
        <section class="card col-8"><div class="card-head"><h2>${icon("bolt")} 战役节点</h2><div class="card-extra"><span class="label">5 / 17 完成</span></div></div>${phases}</section>
        <div class="col-4 stack" style="gap:var(--gap)">
          ${card({ title: "常规物料怎么处理", icon: "image", body: `<table class="grid compact choice-table"><tbody>${c.routine.map((r) => `<tr><td>${r.type}</td><td><span class="segmented">${choices.map((ch) => `<button type="button" class="${ch === r.choice ? "active" : ""}" title="${ch}">${ch.replace("用战役版", "").replace("本月", "")}</button>`).join("")}</span></td></tr>`).join("")}</tbody></table>
            <p class="small muted" style="margin:10px 0 0">每次开战役时逐项决定；结果同步到 11 月物料墙。</p>` })}
          ${card({ title: "挂在哪些月", icon: "month", body: `<ul class="list">${c.months.map((m) => `<li><span class="mono">${m}</span><span class="small">${m === "2026-10" ? "预热物料 · 价格图沿用常规" : "战役价格 · 九宫格 · 价格图战役版"}</span><span class="spacer"></span><a class="link" href="#/month/overview">档案</a></li>`).join("")}</ul>` })}
          ${card({ title: "复盘", icon: "archive", body: `<div class="dashed-box small">战役结束后在这里写复盘，资产自动归档到 2026-11 月档案。</div>` })}
        </div>
      </div>`;
    },
    mount(root) {
      root.addEventListener("click", (e) => {
        const b = e.target.closest(".choice-table .segmented button");
        if (!b) return;
        P.$$("button", b.parentElement).forEach((x) => x.classList.toggle("active", x === b));
      });
    },
  };

  const VIEWS = { overview, prices, materials, brief, campaign };
})();
