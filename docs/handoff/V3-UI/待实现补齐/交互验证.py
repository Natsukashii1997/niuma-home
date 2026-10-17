# 待实现补齐的浏览器验收：真实后端（一次性副本库，页面 5298 → API 5297）验证本地写入；失败与结果不明用拦截模拟。
# Voice 话题来自合成快照（scratchpad 里的 make-voice.mjs 生成，标题带「（合成）」），不是真实采集。
# 用法：python3 交互验证.py <证据目录> [场景名...]
import asyncio, json, sys, os, re
from playwright.async_api import async_playwright

OUT = sys.argv[1]
ONLY = set(sys.argv[2:])
BASE = "http://127.0.0.1:5298/#"
results = []

def rec(name, kind, ok, detail):
    results.append({"场景": name, "方式": kind, "结果": "通过" if ok else "未通过", "说明": detail})
    print(("✓" if ok else "✗"), kind, name, "·", detail, flush=True)

async def page_with_log(browser, w=1440, h=900):
    pg = await browser.new_page(viewport={"width": w, "height": h})
    pg.errs, pg.reqs = [], []
    pg.on("pageerror", lambda e: pg.errs.append(f"pageerror: {e}"))
    pg.on("console", lambda m: pg.errs.append(f"console: {m.text}") if m.type == "error" and "status of 50" not in m.text and "status of 40" not in m.text and "ERR_FAILED" not in m.text else None)
    pg.on("request", lambda r: pg.reqs.append((r.method, r.url)))
    return pg

async def go(pg, path):
    await pg.goto("about:blank")  # 同一地址只改 hash 不会重新加载
    await pg.goto(BASE + path, wait_until="networkidle")
    await pg.wait_for_timeout(500)

async def shot(pg, name, full=True):
    if full:
        h = await pg.evaluate("document.documentElement.scrollHeight")
        await pg.set_viewport_size({"width": pg.viewport_size["width"], "height": min(h, 6000)})
        await pg.wait_for_timeout(300)
    await pg.screenshot(path=os.path.join(OUT, f"{name}.png"))
    await pg.set_viewport_size({"width": pg.viewport_size["width"], "height": 900})

async def wait_box(pg, kind, scope="", timeout=60000):
    await pg.locator(f"{scope} .write-box.is-{kind}".strip()).first.wait_for(timeout=timeout)

async def confirm_box(pg, scope=""):
    await pg.locator(f"{scope} .write-box.is-preview .write-actions .btn-primary".strip()).first.click()

def guard(pg):
    # 飞书写入与模型调用路径一律拦截，不放行到后端。
    async def block(route):
        await route.fulfill(status=599, content_type="application/json", body=json.dumps({"error": "验收脚本拦截：不放行真实写入"}))
    return [pg.route(re.compile(p), block) for p in [r"/api/v3/kb/confirm", r"/export$", r"/export-preview$", r"/exports/", r"/draft/preview$", r"/draft$", r"/digest/preview$", r"/api/v3/selftalk/digest$"]]

def want(name):
    return not ONLY or name in ONLY

async def main():
    async with async_playwright() as p:
        # 本机已缓存的无头 Chromium；环境变量 CHROMIUM 可改用其他路径
        b = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM") or None)

        # ---------- 第 1 批 · 手写主线需求：添加 → 草稿进列表 → 删除草稿 ----------
        if want("手写需求"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/user/strategy"); await pg.get_by_role("button", name="手写主线需求").wait_for(timeout=120000)
            before = await pg.locator(".need-list li").count()
            await pg.get_by_role("button", name="手写主线需求").click()
            form = pg.locator(".manual-need")
            await form.locator("label:has-text('学生分群') input").fill("英国 · 大一")
            await form.locator("label:has-text('节点') input").fill("开学")
            await form.locator("textarea").fill("（验收）新生入学后的课程适应辅导")
            await form.locator("label:has-text('痛点') input").fill("第一周听不懂课")
            n_preview = sum(1 for m, u in pg.reqs if "/manual-needs/preview" in u)
            await form.get_by_role("button", name="预览添加").click(); await wait_box(pg, "preview", ".manual-need")
            wrote = await pg.evaluate("fetch('/api/v3/manual-needs').then(r => r.json()).then(d => d.records.length)")
            await shot(pg, "批1-手写需求-添加预览", full=False)
            await confirm_box(pg, ".manual-need")
            await pg.locator(".write-box.is-saved:has-text('已添加需求草稿')").wait_for(timeout=120000)
            after = await pg.locator(".need-list li").count()
            sel = await pg.locator(".need-list button.is-sel").inner_text()
            await shot(pg, "批1-手写需求-已添加")
            rec("手写主线需求：预览不写入，确认后回读一致，以草稿进列表并选中", "实际", wrote == 0 and after == before + 1 and "草稿" in sel and "课程适应" in sel,
                f"预览后记录数={wrote}；列表 {before}→{after}；选中项含「草稿」={'草稿' in sel}")
            # 删除这条草稿
            await pg.get_by_role("button", name="删除这条草稿").click(); await wait_box(pg, "preview", ".need-detail")
            await shot(pg, "批1-手写需求-删除预览", full=False)
            await confirm_box(pg, ".need-detail"); await wait_box(pg, "saved", ".need-detail")
            left = await pg.locator(".need-list li").count()
            gone = not await pg.locator(".need-list li:has-text('课程适应')").count()
            rec("删除手写草稿：预览确认后回读不在列表里", "实际", left == before and gone, f"列表 {after}→{left}")
            # 模拟：确认时后端返回 409（预览已失效）
            await pg.get_by_role("button", name="手写主线需求").click()
            await form.locator("textarea").fill("（验收）预览失效场景")
            await form.get_by_role("button", name="预览添加").click(); await wait_box(pg, "preview", ".manual-need")
            await pg.route("**/api/v3/manual-needs/confirm", lambda r: r.fulfill(status=409, content_type="application/json", body=json.dumps({"error": "预览已失效，请重新预览"})))
            await confirm_box(pg, ".manual-need"); await wait_box(pg, "warn", ".manual-need")
            await shot(pg, "批1-手写需求-预览失效（模拟）", full=False)
            await pg.unroute("**/api/v3/manual-needs/confirm")
            still = await pg.evaluate("fetch('/api/v3/manual-needs').then(r => r.json()).then(d => d.records.length)")
            rec("手写需求：确认返回 409 显示「预览已失效」，没有写入", "模拟", still == 0, f"记录数={still}")
            await form.get_by_role("button", name="关闭").click(); await form.get_by_role("button", name="取消").click()
            rec("用户策略页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        # ---------- 第 1 批 · Voice 话题转主线需求草稿（合成话题） ----------
        if want("Voice转草稿"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/voice"); await pg.locator(".voice-detail").wait_for()
            await pg.get_by_role("button", name="转为主线需求草稿").click()
            form = pg.locator(".manual-need.is-embedded")
            pre = await form.locator("textarea").input_value()
            await form.get_by_role("button", name="预览添加").click(); await wait_box(pg, "preview", ".voice-detail")
            pv = await pg.locator(".voice-detail .write-box.is-preview").inner_text()
            await shot(pg, "批1-Voice转草稿-预览（合成话题）")
            await confirm_box(pg, ".voice-detail")
            await pg.locator(".voice-detail .write-box.is-saved").wait_for(timeout=60000)
            chip = await pg.locator(".voice-detail a.chip:has-text('已转为')").inner_text()
            await shot(pg, "批1-Voice转草稿-已转（合成话题）")
            rec("Voice 转草稿：表单按话题预填，预览写明来源，确认后话题显示已转并链到草稿", "实际（合成话题）",
                "选课系统崩溃" in pre and "留学之声 · （合成）选课系统崩溃" in pv and "已转为" in chip, f"预填需求={pre[:20]}；链接={chip[:30]}")
            # 刷新后仍显示已转，不再出现转换按钮
            await go(pg, "/voice"); await pg.locator(".voice-detail").wait_for()
            again = await pg.get_by_role("button", name="转为主线需求草稿").count()
            linked = await pg.locator(".voice-detail a.chip:has-text('已转为')").count()
            rec("Voice 已转话题：刷新后仍显示已转，不能重复转", "实际（合成话题）", again == 0 and linked == 1, f"转换按钮数={again}")
            # 点链接到用户策略，草稿选中且来源是留学之声
            await pg.locator(".voice-detail a.chip:has-text('已转为')").click()
            await pg.locator(".need-detail").wait_for(timeout=120000); await pg.wait_for_timeout(500)
            head = await pg.locator(".need-detail .card-head").inner_text()
            await shot(pg, "批1-Voice转草稿-在用户策略里（合成话题）")
            rec("Voice 草稿出现在用户策略，来源写明留学之声话题", "实际（合成话题）", "留学之声" in head and "Voice 话题" in head, head[:80])
            # 第二个话题：模拟确认时网络中断 → 结果不明并锁住
            await go(pg, "/voice"); await pg.locator(".hot-list li").nth(1).click()
            await pg.get_by_role("button", name="转为主线需求草稿").click()
            await pg.locator(".manual-need.is-embedded").get_by_role("button", name="预览添加").click(); await wait_box(pg, "preview", ".voice-detail")
            await pg.route("**/api/v3/manual-needs/confirm", lambda r: r.abort("failed"))
            await confirm_box(pg, ".voice-detail"); await wait_box(pg, "unknown", ".voice-detail")
            locked = await pg.locator(".manual-need.is-embedded textarea").is_disabled()
            await shot(pg, "批1-Voice转草稿-结果不明（模拟网络中断）", full=False)
            await pg.unroute("**/api/v3/manual-needs/confirm")
            await pg.get_by_role("button", name="重新读取核对").click(); await pg.wait_for_timeout(600)
            cleared = not await pg.locator(".voice-detail .write-box.is-unknown").count()
            rec("Voice 转草稿：提交时网络中断 → 结果不明并锁住，重新读取后解锁", "模拟", locked and cleared, f"锁住={locked} 解锁={cleared}")
            rec("Voice 页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        # ---------- 第 1 批 · 战役复盘保存 ----------
        if want("战役复盘"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/marketing/campaign"); await pg.locator(".campaign-strip").wait_for(timeout=120000)
            if await pg.locator(".campaign-create").count():
                tpl = await pg.locator(".review-box").is_disabled()
                rec("模板态：复盘框不可写，提示先创建战役", "实际", tpl, f"disabled={tpl}")
                c = pg.locator(".campaign-create")
                await c.locator("label:has-text('名称') input").fill("（验收）2026 双11 冲分节")
                await c.locator("label:has-text('开始') input").fill("2026-10-20")
                await c.locator("label:has-text('结束') input").fill("2026-11-30")
                await c.locator("label:has-text('一句话说明') input").fill("验收用战役")
                await c.get_by_role("button", name="预览创建").click(); await wait_box(pg, "preview")
                await confirm_box(pg); await pg.locator(".write-box.is-saved:has-text('战役已创建')").wait_for(timeout=60000)
            box = pg.locator(".review-box")
            await box.fill("（验收）报名比预期多两成；海报晚了三天，下次提前一周定稿。")
            await pg.get_by_role("button", name="预览保存复盘").click(); await wait_box(pg, "preview")
            await shot(pg, "批1-战役复盘-保存预览")
            await confirm_box(pg)
            await pg.locator(".write-box.is-saved:has-text('复盘已保存')").wait_for(timeout=60000)
            await shot(pg, "批1-战役复盘-已保存")
            await go(pg, "/marketing/campaign"); await pg.locator(".review-box").wait_for()
            kept = await pg.locator(".review-box").input_value()
            rec("战役复盘：预览确认后回读一致，结果显示在复盘卡片里，刷新后仍在", "实际", "海报晚了三天" in kept, kept[:30])
            # 模拟：确认时网络中断 → 结果不明并锁住
            await pg.locator(".review-box").fill(kept + "补充一句。")
            await pg.get_by_role("button", name="预览保存复盘").click(); await wait_box(pg, "preview")
            await pg.route("**/api/v3/campaigns/current", lambda r: r.abort("failed") if r.request.method == "PATCH" else r.continue_())
            await confirm_box(pg); await wait_box(pg, "unknown")
            locked = await pg.locator(".review-box").is_disabled()
            await shot(pg, "批1-战役复盘-结果不明（模拟网络中断）", full=False)
            await pg.unroute("**/api/v3/campaigns/current")
            await pg.get_by_role("button", name="重新读取核对").click(); await pg.wait_for_timeout(800)
            back = await pg.locator(".review-box").input_value()
            rec("战役复盘：提交时网络中断 → 结果不明并锁住，重新读取后以接口为准", "模拟", locked and back == kept, f"锁住={locked} 重新读取后内容=接口值 {back == kept}")
            rec("营销战役页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        # ---------- 第 2 批 · 时间线异常人工裁定（真实时间线，副本库只读同步过） ----------
        if want("异常裁定"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            api = lambda: pg.evaluate("fetch('/api/v3/timeline').then(r => r.json())")
            await go(pg, "/user/timeline/anomalies"); await pg.locator(".anomaly").first.wait_for(timeout=180000)
            count = lambda: pg.locator(".seg button:has-text('异常待确认'), [role=radio]:has-text('异常待确认'), button:has-text('异常待确认')").first.inner_text()
            c0 = await count()
            card = pg.locator(".anomaly:has(.rule-opts button:text-matches('^采用'))").first
            src = (await card.locator(".anomaly-main .tnum").first.inner_text()).strip()
            await card.locator(".rule-opts button:text-matches('^采用')").first.click()
            await card.locator(".rule-note").fill("（验收）官网校历核对")
            await card.get_by_role("button", name="预览裁定").click(); await wait_box(pg, "preview", ".anomaly")
            before = await api()
            await shot(pg, "批2-异常裁定-采用预览", full=False)
            await confirm_box(pg, ".anomaly"); await pg.locator(".anomaly .write-box.is-saved").first.wait_for(timeout=60000)
            after = await api(); c1 = await count()
            ev = [e for e in after["agenda"] if e["src"] == src]
            await shot(pg, "批2-异常裁定-已采用", full=False)
            rec("异常裁定·采用：预览不写入；确认后回读一致，这一格以「人工裁定」事件参与推导，待确认数减一", "实际",
                not any(a.get("ruling") for a in before["anomalies"]) and len(ev) == 1 and ev[0].get("ruled") and "flag" not in ev[0] and c0 != c1,
                f"{src} → {ev[0]['from'] if ev else '无'}；{c0} → {c1}")
            # 撤销
            done = pg.locator(".anomaly.is-done").first
            await done.get_by_role("button", name="撤销裁定").click(); await wait_box(pg, "preview", ".anomaly.is-done")
            await confirm_box(pg, ".anomaly"); await pg.locator(".anomaly .write-box.is-saved:has-text('撤销')").first.wait_for(timeout=60000)
            back = await api()
            rec("异常裁定·撤销：回读后这一格回到待确认，不参与推导", "实际", not any(a.get("ruling") for a in back["anomalies"]) and not any(e["src"] == src and e.get("ruled") for e in back["agenda"]), f"{src}")
            # 手填日期：一条不能解析的格子
            await go(pg, "/user/timeline/anomalies"); await pg.locator(".anomaly").first.wait_for()
            card = pg.locator(".anomaly:not(:has(.rule-opts button:text-matches('^采用'))):has(.rule-opts)").first
            src2 = (await card.locator(".anomaly-main .tnum").first.inner_text()).strip()
            await card.get_by_role("button", name="手填日期").click()
            days = card.locator(".rule-day")
            await days.nth(0).fill("2026-11-02"); await days.nth(1).fill("2026-11-06")
            await card.get_by_role("button", name="预览裁定").click(); await wait_box(pg, "preview", ".anomaly")
            await shot(pg, "批2-异常裁定-手填预览", full=False)
            await confirm_box(pg, ".anomaly"); await pg.locator(".anomaly .write-box.is-saved").first.wait_for(timeout=60000)
            got = await api()
            ev2 = [e for e in got["agenda"] if e["src"] == src2]
            rec("异常裁定·手填：不能解析的格子按手填日期生成事件", "实际", len(ev2) == 1 and ev2[0]["from"] == "2026-11-02" and ev2[0]["to"] == "2026-11-06" and ev2[0].get("ruled"), f"{src2} → {ev2[0]['from'] if ev2 else '无'}")
            # 明细表里显示「人工裁定」
            await go(pg, "/user/timeline/country"); await pg.locator(".tl-table").wait_for()
            code = next(a["cell"]["code"] for a in got["anomalies"] if a.get("ruling"))
            name = next(n for c, n in got["countries"] if c == code)
            await pg.locator(f".toolbar .chip:has-text('{name}')").first.click()
            off = pg.locator(".toolbar .chip[aria-pressed=false]:has(.ev-dot)")
            while await off.count(): await off.first.click()  # 打开全部列
            await pg.wait_for_timeout(400)
            tag = await pg.locator(".tl-cell:has-text('人工裁定')").count()
            await shot(pg, "批2-异常裁定-明细表显示人工裁定")
            rec("明细表：裁定的格子显示日期和「人工裁定」", "实际", tag >= 1, f"{name} 人工裁定格子数={tag}")
            # 模拟：确认时 409
            await go(pg, "/user/timeline/anomalies"); await pg.locator(".anomaly").first.wait_for()
            ruled_before = sum(1 for a in (await api())["anomalies"] if a.get("ruling"))
            card = pg.locator(".anomaly:not(.is-done):has(.rule-opts)").first
            await card.get_by_role("button", name="不采用").click(); await card.get_by_role("button", name="预览裁定").click(); await wait_box(pg, "preview", ".anomaly")
            await pg.route("**/api/v3/timeline/anomalies/confirm", lambda r: r.fulfill(status=409, content_type="application/json", body=json.dumps({"error": "时间线已重新同步，这条异常已变化，请重新预览"})))
            await confirm_box(pg, ".anomaly"); await wait_box(pg, "warn", ".anomaly")
            await shot(pg, "批2-异常裁定-预览失效（模拟）", full=False)
            await pg.unroute("**/api/v3/timeline/anomalies/confirm")
            n = sum(1 for a in (await api())["anomalies"] if a.get("ruling"))
            rec("异常裁定：确认返回 409 显示「预览已失效」，没有写入", "模拟", n == ruled_before, f"已裁定条数 {ruled_before} → {n}")
            rec("时间线页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        # ---------- 第 2 批 · 新建本地项目 ----------
        if want("新建项目"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/projects/board"); await pg.locator(".proj-card").first.wait_for(timeout=180000)
            n0 = await pg.locator(".proj-card").count()
            await pg.get_by_role("button", name="新建项目").click()
            await pg.locator(".proj-new input").fill("（验收）T2 价格方案复盘")
            await pg.get_by_role("button", name="预览新建").click(); await wait_box(pg, "preview", ".proj-new")
            pv = await pg.locator(".proj-new .write-box").inner_text()
            await shot(pg, "批2-新建项目-预览")
            await confirm_box(pg, ".proj-new"); await pg.locator(".write-box.is-saved:has-text('已新建本地项目')").wait_for(timeout=60000)
            n1 = await pg.locator(".proj-card").count()
            active = await pg.locator(".proj-card.active").inner_text()
            await shot(pg, "批2-新建项目-已新建")
            rec("新建项目：预览写明模板与节点数，确认后回读一致、选中新项目并标「本地」", "实际", n1 == n0 + 1 and "本地" in active and "价格方案复盘" in active and "子项" in pv, f"项目 {n0}→{n1}")
            # 本地项目的节点照常勾选
            node = pg.locator(".proj-main .node").first
            await node.locator("input[type=checkbox]").click(); await wait_box(pg, "preview")
            await confirm_box(pg); await wait_box(pg, "saved")
            await go(pg, "/projects/board"); await pg.locator(".proj-card").first.wait_for(timeout=180000)
            await pg.locator(".proj-card:has-text('价格方案复盘')").click(); await pg.wait_for_timeout(300)
            done = "is-done" in (await pg.locator(".proj-main .node").first.get_attribute("class"))
            rec("本地项目：节点勾选预览确认后保存，刷新后仍在", "实际", done, f"第一个节点已完成={done}")
            rec("项目页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        # ---------- 第 2 批 · 新开战役（归档当前战役） ----------
        if want("新开战役"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/marketing/campaign"); await pg.locator(".campaign-strip").wait_for(timeout=120000)
            if await pg.locator(".campaign-create").count():
                c = pg.locator(".campaign-create")
                await c.locator("label:has-text('名称') input").fill("（验收）2026 双11 冲分节")
                await c.locator("label:has-text('开始') input").fill("2026-10-20")
                await c.locator("label:has-text('结束') input").fill("2026-11-30")
                await c.locator("label:has-text('一句话说明') input").fill("验收用战役")
                await c.get_by_role("button", name="预览创建").click(); await wait_box(pg, "preview")
                await confirm_box(pg); await pg.locator(".write-box.is-saved:has-text('战役已创建')").wait_for(timeout=60000)
            name = (await pg.locator(".campaign-strip strong").inner_text()).strip()
            # 模拟：归档时网络中断 → 结果不明并锁住
            await pg.get_by_role("button", name="新开战役").click(); await wait_box(pg, "preview")
            await pg.route("**/api/v3/campaigns/current/archive", lambda r: r.abort("failed"))
            await confirm_box(pg); await wait_box(pg, "unknown")
            locked = await pg.get_by_role("button", name="新开战役").is_disabled()
            await pg.unroute("**/api/v3/campaigns/current/archive")
            await pg.get_by_role("button", name="重新读取核对").click(); await pg.wait_for_timeout(800)
            rec("新开战役：归档时网络中断 → 结果不明并锁住，重新读取后解锁", "模拟", locked and await pg.get_by_role("button", name="新开战役").is_enabled(), f"锁住={locked}")
            # 真实归档
            await pg.get_by_role("button", name="新开战役").click(); await wait_box(pg, "preview")
            await shot(pg, "批2-新开战役-预览", full=False)
            await confirm_box(pg); await pg.locator(".write-box.is-saved:has-text('归档为历史')").wait_for(timeout=60000)
            start = await pg.locator(".campaign-create label:has-text('开始') input").input_value()
            hist = await pg.locator(".campaign-history").inner_text()
            await shot(pg, "批2-新开战役-已归档回到模板")
            rec("新开战役：确认后旧战役进「历史战役」，页面回到模板、开始日期默认下月 1 日", "实际", name in hist and start.endswith("-01"), f"历史含「{name}」；开始={start}")
            rec("营销战役页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        # ---------- 第 3 批 · brief 附件 ----------
        if want("brief附件"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            files = os.environ.get("SAMPLE_DIR", ".")
            await go(pg, "/marketing/brief"); await pg.locator(".doc-pager, .outline-all").first.wait_for(timeout=120000)
            await pg.get_by_role("button", name="附件").first.click(); await pg.locator(".brief-files").wait_for()
            async def items():
                return await pg.evaluate("() => { const m = [...document.querySelectorAll('.label')].map(x => x.textContent).find(t => /design brief · /.test(t)).split('· ')[1].trim(); return fetch(`/api/v3/briefs/${m}/attachments`).then(r => r.json()).then(d => d.items); }")
            await pg.locator(".brief-files input[type=file]").set_input_files(os.path.join(files, "附件样图.png"))
            await wait_box(pg, "preview", ".brief-files")
            before = await items()
            await shot(pg, "批3-brief附件-上传预览", full=False)
            await confirm_box(pg, ".brief-files"); await wait_box(pg, "saved", ".brief-files")
            after = await items()
            loaded = await pg.locator(".brief-file-list img").first.evaluate("img => img.complete && img.naturalWidth > 0")
            rec("brief 附件·上传：预览不写入；确认后回读一致，缩略图能打开", "实际", len(before) == 0 and len(after) == 1 and loaded, f"附件 {len(before)}→{len(after)}；缩略图可显示={loaded}")
            await pg.locator(".brief-files input[type=file]").set_input_files(os.path.join(files, "规格说明.pdf"))
            await wait_box(pg, "preview", ".brief-files"); await confirm_box(pg, ".brief-files"); await wait_box(pg, "saved", ".brief-files")
            await shot(pg, "批3-brief附件-已上传两个")
            dl = await pg.evaluate("() => fetch(document.querySelectorAll('.brief-file-list a.link')[3].href).then(r => [r.status, r.headers.get('content-disposition')])")
            rec("brief 附件：PDF 可下载，下载头带原文件名", "实际", dl[0] == 200 and "attachment" in dl[1] and "%E8%A7%84" in dl[1], f"{dl}")
            # 重复上传同一文件被拦下
            await pg.locator(".brief-files input[type=file]").set_input_files(os.path.join(files, "附件样图.png"))
            await wait_box(pg, "error", ".brief-files")
            msg = await pg.locator(".brief-files .write-box.is-error").inner_text()
            rec("brief 附件：同一文件重复上传在预览时拦下", "实际", "上传过" in msg, msg.replace("\n", " ")[:60])
            await pg.locator(".brief-files .write-box.is-error").get_by_role("button", name="关闭").click()
            # 删除
            await pg.locator(".brief-file-list li").first.get_by_role("button", name="删除").click(); await wait_box(pg, "preview", ".brief-files")
            await shot(pg, "批3-brief附件-删除预览", full=False)
            await confirm_box(pg, ".brief-files"); await wait_box(pg, "saved", ".brief-files")
            left = await items()
            rec("brief 附件·删除：预览确认后回读不在列表里", "实际", len(left) == 1 and left[0]["name"] == "规格说明.pdf", f"剩 {[x['name'] for x in left]}")
            # 模拟：上传确认时网络中断 → 结果不明并锁住
            await pg.locator(".brief-files input[type=file]").set_input_files(os.path.join(files, "附件样图.png"))
            await wait_box(pg, "preview", ".brief-files")
            await pg.route(re.compile(r"/attachments/confirm$"), lambda r: r.abort("failed"))
            await confirm_box(pg, ".brief-files"); await wait_box(pg, "unknown", ".brief-files")
            locked = await pg.locator(".brief-files .dashed-drop").get_attribute("aria-disabled")
            await shot(pg, "批3-brief附件-结果不明（模拟网络中断）", full=False)
            await pg.unroute(re.compile(r"/attachments/confirm$"))
            await pg.get_by_role("button", name="重新读取核对").click(); await pg.wait_for_timeout(600)
            rec("brief 附件：提交时网络中断 → 结果不明并锁住，重新读取后解锁", "模拟", locked == "true" and not await pg.locator(".brief-files .write-box.is-unknown").count(), f"锁住={locked}")
            rec("brief 页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        # ---------- 第 3 批 · 从数码世界收藏导入（真实收藏，只读；写入只到副本库） ----------
        if want("数码世界导入"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            refs = lambda: pg.evaluate("fetch('/api/v3/refs').then(r => r.json())")
            await go(pg, "/marketing/materials/refs"); await pg.get_by_role("button", name="从数码世界收藏导入").wait_for(timeout=60000)
            before = await refs()
            await pg.get_by_role("button", name="从数码世界收藏导入").click(); await pg.locator(".modal .chip:has-text('全部')").wait_for(timeout=30000)
            hint = await pg.locator(".modal-body > p.small").nth(1).inner_text()
            on = await pg.locator(".modal .chip.is-on").inner_text()
            await shot(pg, "批3-数码世界导入-默认设计参考分组（真实为空）", full=False)
            rec("打开弹窗默认筛到数码世界「设计参考」分组；分组为空时写明怎么用", "实际（真实收藏只读）", on.startswith("设计参考") and "设计参考" in hint, f"{on.split()[0]}；{hint[:40]}")
            await pg.locator(".modal .chip:has-text('全部')").click(); await pg.locator(".dw-list li").first.wait_for()
            total = await pg.locator(".dw-list li").count()
            await pg.locator(".modal .chip:has-text('AI学习')").click(); await pg.wait_for_timeout(200)
            ai = await pg.locator(".dw-list li").count()
            await pg.locator(".modal .chip:has-text('全部')").click(); await pg.wait_for_timeout(200)
            await pg.locator(".dw-list li:has-text('像素风') input").check()
            await pg.locator(".dw-list li:has-text('Top 10 Skills') input").check()
            foot = await pg.locator(".modal-foot").inner_text()
            await shot(pg, "批3-数码世界导入-勾选", full=False)
            rec("数码世界导入：只读列出全部收藏，可按分类筛选，勾选后显示图片数（视频只取封面）", "实际（真实收藏只读）", total == 6 and ai == 3 and "12 张" in foot, f"共 {total} 条；AI学习 {ai} 条；{foot.splitlines()[0][:30]}")
            await pg.get_by_role("button", name=re.compile("加到画布")).click()
            await pg.locator(".modal .dw-list").wait_for(state="detached", timeout=60000)
            new = await pg.locator(".ref.is-new").count()
            wrote = len((await refs())["items"]) == len(before["items"])
            rec("加到画布：12 张图进画布但还没保存", "实际", new == 12 and wrote, f"新图 {new} 张；接口未写入={wrote}")
            await pg.get_by_role("button", name="预览保存").click(); await wait_box(pg, "preview")
            pv = await pg.locator(".write-box.is-preview").inner_text()
            await shot(pg, "批3-数码世界导入-保存预览", full=False)
            await confirm_box(pg); await pg.locator(".write-box.is-saved:has-text('画布已保存')").wait_for(timeout=120000)
            after = await refs()
            got = [i for i in after["items"] if i.get("source", "").startswith("数码世界笔记")]
            await shot(pg, "批3-数码世界导入-已保存")
            rec("画布保存：预览写明 12 张新图，确认后回读一致，来源记笔记编号与小红书链接", "实际", "12 张" in pv and len(got) == 12 and all("xiaohongshu.com" in i["source"] and i["src"].startswith("/api/v3/refs/images/") for i in got), f"带数码世界来源的参考项 {len(got)} 个")
            await pg.get_by_role("button", name="从数码世界收藏导入").click(); await pg.locator(".modal .chip:has-text('全部')").click(); await pg.locator(".dw-list li").first.wait_for()
            done = await pg.locator(".dw-list li.is-done:has-text('已导入') input:disabled").count()
            await shot(pg, "批3-数码世界导入-已导入不可重复", full=False)
            rec("再次打开：已导入的两条标「已导入」，不能再勾选", "实际", done == 2, f"已导入且禁用 {done} 条")
            await pg.locator(".modal .icon-btn").click()
            # 模拟：「设计参考」分组里有两条（一条已导入）→ 默认只勾选没导入的那条
            async def fake(route):
                r = await route.fetch(); d = await r.json()
                for n in d["notes"]:
                    if "像素风" in n["title"] or "卡帕西" in n["title"]: n["group"] = "设计参考"
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(d))
            await pg.route("**/api/v3/refs/digiworld", fake)
            await pg.get_by_role("button", name="从数码世界收藏导入").click(); await pg.locator(".dw-list li").first.wait_for()
            rows = await pg.locator(".dw-list li").count()
            checked = await pg.locator(".dw-list li input:checked").count()
            pick = await pg.locator(".dw-list li:has(input:checked)").inner_text()
            await shot(pg, "批3-数码世界导入-默认勾选设计参考（模拟分组）", full=False)
            await pg.unroute("**/api/v3/refs/digiworld"); await pg.locator(".modal .icon-btn").click()
            rec("「设计参考」分组有收藏时：默认只显示这个分组，并勾选其中还没导入的", "模拟（分组归属）", rows == 2 and checked == 1 and "卡帕西" in pick, f"显示 {rows} 条，默认勾选 {checked} 条：{pick.splitlines()[0][:16]}")
            # 模拟：数码世界数据校验失败
            await pg.route("**/api/v3/refs/digiworld", lambda r: r.fulfill(status=503, content_type="application/json", body=json.dumps({"error": "数码世界收藏数据校验失败（可能正在写入），请稍后重试", "code": "DIGIWORLD_UNAVAILABLE"})))
            await pg.get_by_role("button", name="从数码世界收藏导入").click(); await pg.locator(".modal .risk-text").wait_for()
            msg = await pg.locator(".modal .risk-text").inner_text()
            await shot(pg, "批3-数码世界导入-读取失败（模拟）", full=False)
            await pg.unroute("**/api/v3/refs/digiworld")
            rec("数码世界数据校验失败时写明原因，不列出任何收藏", "模拟", "校验失败" in msg and not await pg.locator(".dw-list").count(), msg[:40])
            rec("设计参考页无页面报错", "实际", not pg.errs, "; ".join(pg.errs) or "无")
            await pg.close()

        await b.close()
        name = "交互验证-" + "-".join(sorted(ONLY)) if ONLY else "交互验证"
        with open(os.path.join(OUT, f"{name}.json"), "w") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
        print("通过", sum(r["结果"] == "通过" for r in results), "/", len(results))

asyncio.run(main())
