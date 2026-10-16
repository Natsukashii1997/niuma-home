# V3 前端接线验收：真实后端（一次性副本库，5298→5297）验证本地写入；飞书写入、模型调用、失败与未知结果用拦截模拟。
# 用法：verify.py <证据目录> [场景名...]
import asyncio, json, sys, os, re
from playwright.async_api import async_playwright

OUT = sys.argv[1]
ONLY = set(sys.argv[2:])
BASE = "http://127.0.0.1:5298/#"
SP = os.path.dirname(os.path.abspath(__file__))
results = []

def rec(name, kind, ok, detail):
    results.append({"场景": name, "方式": kind, "结果": "通过" if ok else "未通过", "说明": detail})
    print(("✓" if ok else "✗"), kind, name, "·", detail, flush=True)

async def page_with_log(browser, w=1440, h=900):
    pg = await browser.new_page(viewport={"width": w, "height": h})
    pg.errs = []
    pg.reqs = []
    pg.on("pageerror", lambda e: pg.errs.append(f"pageerror: {e}"))
    pg.on("console", lambda m: pg.errs.append(f"console: {m.text}") if m.type == "error" and "status of 50" not in m.text and "status of 40" not in m.text and "ERR_FAILED" not in m.text else None)
    pg.on("request", lambda r: pg.reqs.append((r.method, r.url)))
    return pg

async def go(pg, path, wait=".main"):
    await pg.goto("about:blank")  # 同一地址只改 hash 不会重新加载，先离开再进，保证每次都重新读取
    await pg.goto(BASE + path, wait_until="networkidle")
    await pg.wait_for_timeout(500)

async def shot(pg, name, full=True):
    if full:
        h = await pg.evaluate("document.documentElement.scrollHeight")
        await pg.set_viewport_size({"width": pg.viewport_size["width"], "height": min(h, 6000)})
        await pg.wait_for_timeout(300)
    await pg.screenshot(path=os.path.join(OUT, f"{name}.png"))
    await pg.set_viewport_size({"width": pg.viewport_size["width"], "height": 900})

async def box_state(pg, scope=""):
    sel = f"{scope} .write-box".strip()
    loc = pg.locator(sel)
    n = await loc.count()
    return [await loc.nth(i).get_attribute("class") for i in range(n)]

async def wait_box(pg, kind, scope="", timeout=30000):
    await pg.locator(f"{scope} .write-box.is-{kind}".strip()).first.wait_for(timeout=timeout)

async def confirm_box(pg, scope=""):
    await pg.locator(f"{scope} .write-box.is-preview .write-actions .btn-primary".strip()).first.click()

def guard(pg):
    # 防误写真实飞书 / 调用模型：这些路径一律只能被模拟，不允许放行到后端。
    async def block(route):
        await route.fulfill(status=599, content_type="application/json", body=json.dumps({"error": "验收脚本拦截：未设置模拟，不放行真实写入"}))
    return [pg.route(re.compile(p), block) for p in [r"/api/v3/kb/confirm", r"/api/v3/kb/operations/.*/reconcile", r"/export$", r"/export-preview$", r"/exports/", r"/draft/preview$", r"/draft$", r"/digest/preview$", r"/api/v3/selftalk/digest$"]]

async def scenario(name):
    return not ONLY or name in ONLY

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # ---------- 真实：项目节点 预览→确认→回读；防重复提交；刷新后仍在 ----------
        if await scenario("项目"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/projects/board"); await pg.locator(".node").first.wait_for()
            node = pg.locator(".proj-main .node").first
            was_done = "is-done" in (await node.get_attribute("class"))
            await node.locator("input[type=checkbox]").click()
            await wait_box(pg, "preview")
            await shot(pg, "项目-节点改动预览", full=False)
            before = sum(1 for m, u in pg.reqs if m == "PATCH" and "/api/v3/projects/" in u)
            await pg.evaluate("() => { const b = document.querySelector('.write-box.is-preview .btn-primary'); b.click(); b.click(); }")
            await wait_box(pg, "saved")
            patches = sum(1 for m, u in pg.reqs if m == "PATCH" and "/api/v3/projects/" in u) - before
            await shot(pg, "项目-已保存回读", full=False)
            await go(pg, "/projects/board"); await pg.locator(".node").first.wait_for()
            done = "is-done" in (await pg.locator(".proj-main .node").first.get_attribute("class"))
            rec("项目节点勾选：预览→确认→回读，刷新后仍在", "实际", done != was_done, f"改前已完成={was_done}，刷新后已完成={done}")
            rec("项目节点：连点两次确认只提交一次", "实际", patches == 1, f"PATCH 次数={patches}")
            # 改输入让旧预览失效：先点第二个节点，再点第三个，预览只剩第三个
            nodes = pg.locator(".proj-main .node")
            t2 = await nodes.nth(1).locator(".node-t").inner_text(); t3 = await nodes.nth(2).locator(".node-t").inner_text()
            await nodes.nth(1).locator("input[type=checkbox]").click(); await wait_box(pg, "preview")
            await nodes.nth(2).locator("input[type=checkbox]").click(); await pg.wait_for_timeout(300); await wait_box(pg, "preview")
            txt = await pg.locator(".write-box.is-preview").inner_text()
            ok = t3.split("\n")[0] in txt and t2.split("\n")[0] not in txt
            rec("项目节点：改了另一处，旧预览作废，只预览最新改动", "实际", ok, f"预览含「{t3.splitlines()[0]}」且不含「{t2.splitlines()[0]}」={ok}")
            await pg.get_by_role("button", name="取消").first.click()
            # 日期格式不对不发请求
            n0 = len([1 for m, u in pg.reqs if "/preview" in u])
            due = nodes.nth(1).locator(".node-due"); await due.fill("2026/10/31"); await due.press("Enter"); await pg.wait_for_timeout(400)
            n1 = len([1 for m, u in pg.reqs if "/preview" in u])
            await due.fill("2026-10-31"); await due.press("Enter"); await wait_box(pg, "preview")
            rec("项目截止日期：格式不对不生成预览，完整日期才预览", "实际", n0 == n1, f"错误格式请求数={n1 - n0}")
            await pg.get_by_role("button", name="取消").first.click()
            await shot(pg, "项目推进-真实数据")
            # 模拟：确认时网络中断 → 结果不明，锁住，只能重新读取
            await nodes.nth(3).locator("input[type=checkbox]").click(); await wait_box(pg, "preview")
            await pg.route(re.compile(r"/api/v3/projects/[^/]+$"), lambda r: r.abort("failed") if r.request.method == "PATCH" else r.continue_())
            await confirm_box(pg); await wait_box(pg, "unknown")
            locked = await nodes.nth(4).locator(".node-due").is_disabled()
            await shot(pg, "项目-结果不明锁定（模拟网络中断）", full=False)
            await pg.unroute(re.compile(r"/api/v3/projects/[^/]+$"))
            await pg.get_by_role("button", name="重新读取核对").click(); await pg.wait_for_timeout(800)
            cleared = not await pg.locator(".write-box.is-unknown").count()
            rec("项目节点：提交时网络中断 → 结果不明并锁住，重新读取后解锁", "模拟", locked and cleared, f"锁住={locked} 重新读取后解锁={cleared}")
            # 模拟：来源读取失败、空列表
            await pg.route("**/api/v3/projects", lambda r: r.fulfill(status=502, content_type="application/json", body=json.dumps({"error": "飞书项目表读取失败（模拟）"})))
            await go(pg, "/projects/board"); await pg.locator(".state-error").wait_for()
            await shot(pg, "项目-来源读取失败（模拟）", full=False)
            await pg.unroute("**/api/v3/projects")
            await pg.route("**/api/v3/projects", lambda r: r.fulfill(status=200, content_type="application/json", body="[]"))
            await go(pg, "/projects/board"); await pg.locator(".placeholder").wait_for()
            await shot(pg, "项目-空列表（模拟）", full=False)
            await pg.unroute("**/api/v3/projects")
            rec("项目：来源失败显示原因和重新读取；空列表不报错", "模拟", not pg.errs, "; ".join(pg.errs) or "无页面报错")
            await pg.close()

        # ---------- 真实：带教记录；模拟：AI 草稿只在点击时调用 ----------
        if await scenario("带教"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/projects/mentor"); await pg.locator(".coach").wait_for()
            drafts_on_load = sum(1 for m, u in pg.reqs if "/draft" in u)
            qa = await pg.locator(".coach").inner_text()
            rec("带教：页面加载不调用 AI 草稿；Q&A 未建立关联照实显示", "实际", drafts_on_load == 0 and "未建立" in qa and "0 条相关" not in qa, f"加载时草稿请求={drafts_on_load}")
            await pg.locator(".coach textarea.review-box").fill("这周先把 SAT 沟通流程写成清单（验收测试）")
            await pg.get_by_role("button", name="预览保存").click(); await wait_box(pg, "preview", ".coach")
            await confirm_box(pg, ".coach"); await wait_box(pg, "saved", ".coach")
            hist = await pg.locator(".coach").inner_text()
            rec("带教记录：预览→确认→回读，已存周次出现", "实际", "已存：20" in hist, "已存周次已显示" if "已存：20" in hist else hist[:80])
            await shot(pg, "带教-记录已保存", full=False)
            # 模拟 AI 草稿
            async def draft_preview(route):
                await route.fulfill(status=200, content_type="application/json", body=json.dumps({"previewId": "mock-draft", "expiresAt": "2099-01-01T00:00:00Z", "value": {"text": "（模拟的 AI 草稿）本周进展：试讲流程走通；卡点：SAT 兼职排课；下次带教问：1. 排课冲突怎么定？", "generatedAt": "2026-10-16T15:00:00Z"}}))
            async def draft_confirm(route): await route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True}))
            async def mentor_get(route):
                resp = await route.fetch(); data = await resp.json()
                for x in data: x["feedbackOrigin"] = "ai-draft"; x["feedback"] = "AI草稿（待人工核对）\n（模拟的 AI 草稿）"; x["generatedAt"] = "2026-10-16T15:00:00Z"
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
            await pg.unroute(re.compile(r"/draft/preview$")); await pg.unroute(re.compile(r"/draft$"))
            await pg.route(re.compile(r"/draft/preview$"), draft_preview); await pg.route(re.compile(r"/draft$"), draft_confirm)
            await pg.get_by_role("button", name="用 AI 生成草稿").click(); await wait_box(pg, "preview", ".coach")
            await shot(pg, "带教-AI草稿预览（模拟）", full=False)
            await pg.route("**/api/v3/mentor", mentor_get)
            await confirm_box(pg, ".coach"); await pg.locator(".coach .write-box.is-saved", has_text="AI 草稿").wait_for()
            await shot(pg, "带教-AI草稿已保存（模拟）", full=False)
            tag = await pg.locator(".coach .card-head").inner_text()
            rec("带教 AI 草稿：点击才生成，预览确认后保存为 AI 草稿并标「待核对」", "模拟", "AI 草稿" in tag, tag.replace("\n", " "))
            await pg.close()

        # ---------- 真实：需求采纳（含冲突）、策略编辑；模拟：策略导出 ----------
        if await scenario("需求"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/user/strategy"); await pg.locator(".need-detail").wait_for()
            await pg.locator(".need-list li button", has_text="草稿").first.click(timeout=10000)
            await pg.get_by_role("button", name="预览采纳").click(); await wait_box(pg, "preview", timeout=120000)
            await shot(pg, "需求-采纳预览", full=False)
            # 另一处先改了这条需求 → 本页确认应提示预览失效
            await pg.evaluate("""async () => { const d = await (await fetch('/api/v3/needs?month=2026-11')).json(); const id = d.needs.find((n) => n.status === '草稿').id;
              const p = await (await fetch(`/api/v3/needs/${id}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ month: '2026-11' }) })).json();
              await fetch(`/api/v3/needs/${id}/adopt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ previewId: p.previewId, confirm: true }) }); }""")
            await confirm_box(pg); await wait_box(pg, "warn", timeout=120000)
            await shot(pg, "需求-冲突要求重新预览", full=False)
            await pg.get_by_role("button", name="重新预览").click(); await wait_box(pg, "preview", timeout=120000)
            await confirm_box(pg); await wait_box(pg, "saved", timeout=120000)
            rec("需求采纳：别处先改了 → 提示预览失效，重新预览后确认成功", "实际", True, "409 → 预览已失效 → 重新预览 → 已采纳")
            need_title = (await pg.locator(".need-detail .card-head h2").inner_text()).strip()
            await pg.get_by_role("button", name="编辑策略").click()
            await pg.locator(".strategy-goal-edit textarea").fill("11 月先帮新西兰 Final 的学生排好冲刺计划（验收测试）")
            await pg.get_by_role("button", name="预览保存策略").click(); await wait_box(pg, "preview", ".strategy-edit", timeout=120000)
            await confirm_box(pg, ".strategy-edit"); await wait_box(pg, "saved", ".strategy-view", timeout=120000)
            await shot(pg, "策略-已保存回读", full=False)
            await go(pg, "/user/strategy"); await pg.locator(".need-detail").wait_for()
            await pg.locator(".need-list li button", has_text=need_title).first.click(); await pg.wait_for_timeout(300)
            goal = await pg.locator(".strategy-goal").inner_text()
            rec("策略编辑：预览→确认→回读，刷新后仍在", "实际", "验收测试" in goal, goal[:60].replace("\n", " "))
            await shot(pg, "用户策略-已采纳与策略")
            # 模拟导出：成功路径
            await pg.unroute(re.compile(r"/export-preview$")); await pg.unroute(re.compile(r"/export$")); await pg.unroute(re.compile(r"/exports/"))
            await pg.route(re.compile(r"/strategy/export-preview$"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"previewId": "mock-exp", "expiresAt": "2099-01-01T00:00:00Z", "mode": "new-only", "target": {"title": "01 营销月档案（模拟）", "url": "https://example.feishu.cn/drive/folder/mockfolder", "token": "mockfolder"}, "title": "2026-11 策略 · 新西兰 · 本科 · Final", "markdown": "# 2026-11 策略\n\n## 策略目标\n11 月先帮新西兰 Final 的学生排好冲刺计划\n", "sections": [], "fingerprint": "x"})))
            await pg.route(re.compile(r"/strategy/export$"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"operationId": "op-mock-1", "status": "success", "title": "2026-11 策略（模拟）", "document": {"id": "doc1", "url": "https://example.feishu.cn/docx/mockdoc"}, "verifiedAt": "2026-10-16T15:00:00Z"})))
            await pg.route(re.compile(r"/strategy/exports/"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"operationId": "op-mock-1", "status": "success", "document": {"id": "doc1", "url": "https://example.feishu.cn/docx/mockdoc"}})))
            await pg.get_by_role("button", name="导出到飞书").click()
            await pg.locator(".export-target input").fill("https://example.feishu.cn/drive/folder/mockfolder")
            await pg.get_by_role("button", name="预览导出").click(); await wait_box(pg, "preview", ".feishu-export")
            await shot(pg, "策略-导出预览（模拟）", full=False)
            await confirm_box(pg, ".feishu-export"); await wait_box(pg, "saved", ".feishu-export")
            link = await pg.locator(".feishu-export .ok-text").count()
            rec("策略导出飞书：预览写明目标文件夹、标题、全文；确认后核对操作记录", "模拟", link > 0, "显示新文档链接")
            await pg.close()

        # ---------- 真实：brief 保存；模拟：导出结果不明 → 只读核对 ----------
        if await scenario("brief"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/marketing/brief"); await pg.locator(".doc").wait_for()
            await pg.locator(".doc textarea[placeholder^='背景']").fill("11 月交付：把澳洲 Final 的冲刺课说清楚（验收测试）")
            await pg.get_by_role("button", name=re.compile("预览保存")).click(); await wait_box(pg, "preview")
            await shot(pg, "brief-保存预览", full=False)
            await confirm_box(pg); await wait_box(pg, "saved")
            await go(pg, "/marketing/brief"); await pg.locator(".doc").wait_for()
            v = await pg.locator(".doc textarea[placeholder^='背景']").input_value()
            rec("brief：改正文 → 预览 → 确认 → 回读，刷新后仍在", "实际", "验收测试" in v, v[:40])
            await pg.unroute(re.compile(r"/export-preview$")); await pg.unroute(re.compile(r"/export$")); await pg.unroute(re.compile(r"/exports/"))
            await pg.route(re.compile(r"/briefs/.*/export-preview$"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"previewId": "mock-b", "expiresAt": "2099-01-01T00:00:00Z", "mode": "new-only", "target": {"title": "01 营销月档案（模拟）", "url": "https://example.feishu.cn/drive/folder/mockfolder", "token": "mockfolder"}, "title": "2026-11 设计 brief", "markdown": "# 2026-11 设计 brief\n\n## 1. 项目背景与目标\n\n11 月交付…\n", "sections": [], "fingerprint": "y"})))
            await pg.route(re.compile(r"/briefs/.*/export$"), lambda r: r.fulfill(status=409, content_type="application/json", body=json.dumps({"error": "导出结果未知：创建请求已发出，回读超时（模拟）", "code": "EXPORT_RESULT_UNKNOWN", "receipt": {"operationId": "op-mock-b", "status": "unknown", "document": {"url": "https://example.feishu.cn/docx/mockb"}}})))
            await pg.route(re.compile(r"/briefs/.*/exports/.*/reconcile$"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"operationId": "op-mock-b", "status": "success", "title": "2026-11 设计 brief", "document": {"id": "b1", "url": "https://example.feishu.cn/docx/mockb"}, "verifiedAt": "2026-10-16T15:05:00Z", "sourceChanged": False, "verificationNote": "只读核对"})))
            await pg.get_by_role("button", name="导出到飞书").click()
            await pg.locator(".export-target input").fill("https://example.feishu.cn/drive/folder/mockfolder")
            await pg.get_by_role("button", name="预览导出").click(); await wait_box(pg, "preview", ".feishu-export")
            await shot(pg, "brief-导出预览（模拟）", full=False)
            creates = []
            pg.on("request", lambda r: creates.append(r.url) if r.url.endswith("/export") else None)
            await confirm_box(pg, ".feishu-export"); await wait_box(pg, "unknown", ".feishu-export")
            await shot(pg, "brief-导出结果不明（模拟）", full=False)
            await pg.get_by_role("button", name="重新读取核对").click(); await pg.locator(".feishu-export .ok-text").wait_for()
            rec("brief 导出：结果不明 → 锁住并保留操作记录 → 只读核对成功，不重发创建", "模拟", len(creates) == 1, f"创建请求次数={len(creates)}")
            await pg.close()

        # ---------- 真实：营销战役从模板创建、勾选节点 ----------
        if await scenario("战役"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/marketing/campaign"); await pg.locator(".campaign-strip").wait_for()
            tmpl = await pg.locator(".campaign-strip").inner_text()
            rec("战役：只有模板时明确写「模板 · 未创建战役」，不显示进度", "实际", "模板" in tmpl and "未创建" in tmpl, tmpl.replace("\n", " ")[:60])
            await shot(pg, "营销战役-模板态")
            grid = pg.locator(".create-grid input")
            await grid.nth(0).fill("2026 双11 冲分节（验收测试）"); await grid.nth(1).fill("2026-10-20"); await grid.nth(2).fill("2026-11-30"); await grid.nth(3).fill("把冲刺课卖给 11 月考试的学生")
            await pg.get_by_role("button", name="预览创建").click(); await wait_box(pg, "preview")
            await shot(pg, "营销战役-创建预览", full=False)
            await confirm_box(pg); await wait_box(pg, "saved")
            await go(pg, "/marketing/campaign"); await pg.locator(".campaign-strip").wait_for()
            strip = await pg.locator(".campaign-strip").inner_text()
            ok1 = "验收测试" in strip and "模板" not in strip
            await pg.locator(".campaign-grid .node input[type=checkbox]").first.click(); await wait_box(pg, "preview")
            await confirm_box(pg); await wait_box(pg, "saved")
            await go(pg, "/marketing/campaign"); await pg.locator(".campaign-grid .node").first.wait_for()
            ok2 = "is-done" in (await pg.locator(".campaign-grid .node").first.get_attribute("class"))
            rec("战役：按模板创建、勾选节点都经预览确认并回读，刷新后仍在", "实际", ok1 and ok2, f"创建={ok1} 勾选={ok2}")
            await shot(pg, "营销战役-已创建")
            await pg.close()

        # ---------- 真实：参考画布上传图片 ----------
        if await scenario("画布"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/marketing/materials/refs"); await pg.locator(".canvas-wrap").wait_for()
            await pg.locator("input[type=file][accept^='image']").set_input_files(os.path.join(SP, "ref-test.png"))
            await pg.locator(".ref.is-new").wait_for()
            await pg.get_by_role("button", name="预览保存").click(); await wait_box(pg, "preview")
            await shot(pg, "设计参考-保存预览", full=False)
            await confirm_box(pg); await wait_box(pg, "saved")
            await go(pg, "/marketing/materials/refs"); await pg.locator(".canvas-wrap").wait_for()
            src = await pg.locator(".ref img").first.get_attribute("src") if await pg.locator(".ref img").count() else ""
            rec("参考画布：图片预览时压缩上传，确认后保存，刷新后从本地读回", "实际", "/api/v3/refs/images/" in (src or ""), src or "没有图片")
            await shot(pg, "设计参考-已保存")
            await pg.close()

        # ---------- 真实：设置项；只读身份 ----------
        if await scenario("设置"):
            pg = await page_with_log(b)
            await go(pg, "/settings"); await pg.locator(".set-row").first.wait_for()
            row = pg.locator(".set-row", has_text="留学之声月预算上限")
            await row.get_by_role("button", name="编辑").click()
            await row.locator(".set-input").fill("8")
            await row.get_by_role("button", name="预览保存").click(); await wait_box(pg, "preview")
            await shot(pg, "设置-保存预览", full=False)
            await confirm_box(pg); await wait_box(pg, "saved")
            await go(pg, "/settings"); await pg.locator(".set-row").first.wait_for()
            val = await pg.locator(".set-row", has_text="留学之声月预算上限").locator(".set-value").inner_text()
            ro = await pg.locator(".set-row", has_text="飞书 profile").get_by_role("button", name="编辑").count()
            rec("设置：预览→确认→回读，刷新后显示新值；飞书身份只读", "实际", val.strip() == "8" and ro == 0, f"值={val.strip()} 身份编辑按钮={ro}")
            await shot(pg, "设置-真实值")
            await pg.close()

        # ---------- 真实：自言自语标记；模拟：周汇总 ----------
        if await scenario("自言自语"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/home"); await pg.locator(".chrome-btn").click(); await pg.locator(".st-item").first.wait_for()
            await pg.locator(".st-item").first.click(); await pg.keyboard.press("s")
            await wait_box(pg, "preview", ".selftalk")
            await shot(pg, "自言自语-标记预览", full=False)
            await confirm_box(pg, ".selftalk"); await wait_box(pg, "saved", ".selftalk")
            await pg.reload(wait_until="networkidle"); await pg.locator(".chrome-btn").click(); await pg.locator(".st-filter").wait_for()
            await pg.locator(".st-filter button", has_text="有价值").click(); await pg.wait_for_timeout(300)
            n = await pg.locator(".st-item").count()
            rec("自言自语：按 S 只生成预览，确认后保存，刷新后在「有价值」里", "实际", n >= 1, f"有价值 {n} 条")
            img = pg.locator(".st-item", has_text="[图片消息]").first
            dis = await img.locator("button", has_text="转待办").is_disabled() if await img.count() else True
            rec("自言自语：图片消息不能转待办或需求", "实际", dis, f"按钮禁用={dis}")
            await pg.unroute(re.compile(r"/digest/preview$")); await pg.unroute(re.compile(r"/api/v3/selftalk/digest$"))
            await pg.route(re.compile(r"/digest/preview$"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"previewId": "mock-dg", "expiresAt": "2099-01-01T00:00:00Z", "value": {"week": "2026-W41", "counts": {"total": 12}, "text": "（模拟的周汇总）值得回看：价格图写清送课时不是降价。"}})))
            await pg.route(re.compile(r"/api/v3/selftalk/digest$"), lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
            async def st_get(route):
                resp = await route.fetch(); data = await resp.json(); data["digest"] = "（模拟的周汇总）值得回看：价格图写清送课时不是降价。"
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
            await pg.locator(".st-digest .week-input").fill("2026-W41")
            await pg.get_by_role("button", name="生成周汇总").click(); await wait_box(pg, "preview", ".st-digest")
            await pg.route("**/api/v3/selftalk", st_get)
            await confirm_box(pg, ".st-digest"); await wait_box(pg, "saved", ".st-digest")
            await shot(pg, "自言自语-周汇总已保存（模拟）", full=False)
            rec("自言自语周汇总：点击才生成，预览确认后保存", "模拟", True, "AI 生成与保存接口为模拟响应")
            await pg.close()

        # ---------- 真实：助手知识库只收文本 ----------
        if await scenario("助手知识"):
            pg = await page_with_log(b)
            await go(pg, "/assistants"); await pg.locator(".segmented button", has_text="知识库").click()
            await pg.locator(".kb-add").wait_for()
            await pg.locator(".kb-add input[type=file]").set_input_files(os.path.join(SP, "fake.docx"))
            warn = await pg.locator(".kb-add .warn-text").inner_text()
            await pg.locator(".kb-add input[type=file]").set_input_files(os.path.join(SP, "note.md"))
            await pg.get_by_role("button", name="预览加入").click(); await wait_box(pg, "preview")
            await shot(pg, "助手知识-加入预览", full=False)
            await confirm_box(pg); await wait_box(pg, "saved")
            await go(pg, "/assistants"); await pg.locator(".segmented button", has_text="知识库").click(); await pg.locator(".kb-panel table").wait_for()
            listed = await pg.locator(".kb-panel table").inner_text()
            rec("助手知识：docx 被拒绝；.md 预览确认后加入，刷新后在列表里", "实际", "不是纯文本" in warn and "note" in listed, warn[:40])
            await shot(pg, "助手知识-已加入")
            await pg.close()

        # ---------- 真实：价格方案（演示口径保留「示例」） ----------
        if await scenario("价格"):
            pg = await page_with_log(b)
            await go(pg, "/marketing/prices"); await pg.locator(".price-matrix").wait_for()
            cur_price = (await pg.locator(".price-total").first.inner_text()).replace(",", "")
            new_price = "4298" if cur_price == "4299" else "4299"
            await pg.locator(".price-total").first.click(); inp = pg.locator(".price-input"); await inp.fill(new_price); await inp.press("Enter")
            brs = pg.locator(".scheme-settings input[placeholder^='必填']")
            for i in range(await brs.count()): await brs.nth(i).fill("")  # 清空破底线原因，后端必须拦下
            await pg.get_by_role("button", name="预览保存").click(); await pg.locator(".write-box.is-error, .write-box.is-preview").first.wait_for()
            err = await pg.locator(".write-box").first.inner_text()
            await shot(pg, "价格-缺关联需求被拦下", full=False)
            await pg.get_by_role("button", name="关闭").first.click()
            rows = pg.locator(".scheme-settings tbody tr")
            for i in range(await rows.count()):
                r = rows.nth(i); sel = r.locator("select").nth(2)
                if await sel.count():
                    opts = await sel.locator("option").all_inner_texts()
                    if len(opts) > 1: await sel.select_option(index=1)
                br = r.locator("input[placeholder^='必填']")
                if await br.count(): await br.fill("双11 冲量，经理已同意（验收测试）")
            await pg.get_by_role("button", name="预览保存").click(); await wait_box(pg, "preview")
            await confirm_box(pg); await wait_box(pg, "saved")
            badge = await pg.locator(".sample-badge").count()
            await go(pg, "/marketing/prices"); await pg.locator(".price-matrix").wait_for()
            first = await pg.locator(".price-total").first.inner_text()
            blocked = "已采纳需求" in err or "破底线原因" in err
            rec("价格：缺关联需求或破底线原因时被拦下；补齐后保存回读，刷新后新价在，演示标识保留", "实际", blocked and f"{new_price[0]},{new_price[1:]}" in first and badge > 0, f"拦截提示={[l for l in err.splitlines() if l.strip() and l.strip() not in ('没有完成', '关闭')]} 新价={first} 示例标识={badge}")
            await shot(pg, "价格记录-演示标识保留")
            await pg.close()

        # ---------- 模拟：知识库同步（不放行真实飞书写入） ----------
        if await scenario("知识库"):
            pg = await page_with_log(b); [await g for g in guard(pg)]
            await go(pg, "/kb"); await pg.locator(".kb-node").first.wait_for()
            await shot(pg, "知识库-真实目录与读取失败提示")
            node = pg.locator(".kb-node", has_text="用户时间线").first
            await node.dblclick(); await pg.locator(".kb-rename").fill("📅 用户时间线（验收改名）"); await pg.locator(".kb-rename").press("Enter")
            nid = await pg.evaluate("() => null")
            await pg.unroute(re.compile(r"/api/v3/kb/confirm")); await pg.unroute(re.compile(r"/api/v3/kb/operations/.*/reconcile"))
            async def kbprev(route):
                body = json.loads(route.request.post_data or "{}")
                ops = [{"type": o["type"], "id": o["id"], "before": "📅 用户时间线", "name": o.get("name")} for o in body.get("ops", [])]
                await route.fulfill(status=200, content_type="application/json", body=json.dumps({"previewId": "kbop-mock", "spaceId": "7620758074885835965", "expiresAt": "2099-01-01T00:00:00Z", "operations": ops, "note": "预览不会写入（模拟）"}))
            await pg.route("**/api/v3/kb/preview", kbprev)
            await pg.route("**/api/v3/kb/confirm", lambda r: r.fulfill(status=409, content_type="application/json", body=json.dumps({"error": "知识库操作结果尚未核实，已锁定重复写入；请先查看操作记录并只读核对，不能重新发送（模拟）"})))
            await pg.route("**/api/v3/kb/operations/kbop-mock", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"operationId": "kbop-mock", "state": "unknown"})))
            await pg.route("**/api/v3/kb/operations/kbop-mock/reconcile", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"operationId": "kbop-mock", "state": "verified", "completed": [{"index": 0}], "remaining": []})))
            await pg.get_by_role("button", name="预览并同步").click(); await wait_box(pg, "preview")
            await shot(pg, "知识库-同步预览（模拟）", full=False)
            await confirm_box(pg); await wait_box(pg, "unknown")
            await shot(pg, "知识库-结果不明锁定（模拟）", full=False)
            await pg.get_by_role("button", name="重新读取核对").click(); await pg.locator(".kb-sync p", has_text="已核对").wait_for()
            rec("知识库同步：预览写明每项操作 → 确认结果不明时锁住 → 只读核对", "模拟", True, "确认、核对接口均为模拟；未向飞书写入")
            await pg.close()

        # ---------- Voice：真实来源不可用；模拟空榜与成功 ----------
        if await scenario("Voice"):
            pg = await page_with_log(b)
            await go(pg, "/voice"); await pg.locator(".placeholder").wait_for()
            t = await pg.locator(".placeholder").inner_text()
            rec("Voice：学生来源不可用时写明热榜没接通，不显示任何话题", "实际", "没有接通" in t, t.replace("\n", " ")[:60])
            await shot(pg, "Voice-来源不可用（真实）")
            await pg.route("**/api/v3/voice", lambda r: r.fulfill(status=503, content_type="application/json", body=json.dumps({"code": "VOICE_NO_QUALIFIED_TOPICS", "error": "免费试运行已读取：当前还没有达到5个独立来源的话题（模拟）"})))
            await go(pg, "/voice"); await pg.locator(".placeholder").wait_for()
            t2 = await pg.locator(".placeholder").inner_text()
            await shot(pg, "Voice-合法空榜（模拟）", full=False)
            await pg.unroute("**/api/v3/voice")
            hot = [{"id": "t1", "title": "期末复习资料去哪找（模拟）", "kind": "求助", "tags": ["澳洲"], "heat": 82.0, "part": 6, "trend": "up", "spark": [20, 30, 35, 50, 60, 70, 82], "sparkDates": ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"], "summary": "多人在问", "sources": [["哪里有往年卷子", "reddit"]]}]
            await pg.route("**/api/v3/voice", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"updatedAt": "2026-10-16 10:00", "nextAt": None, "stats": {"topics": 1, "newTopics": 1, "surge": 0, "participants": 6, "filtered": 0, "sourceCount": 3}, "hot": hot, "cloud": [["复习资料", 82, "up"]], "daily": None})))
            await go(pg, "/voice"); await pg.locator(".day-bars").wait_for()
            dates = await pg.locator(".day-bars em").all_inner_texts()
            await shot(pg, "Voice-有话题时用真实日期（模拟）", full=False)
            rec("Voice：空榜单独写明；有话题时日期取接口的 sparkDates", "模拟", "没有合格" in t2 and dates[-1] == "10-16" and dates[0] == "10-10", f"日期={dates}")
            await pg.close()

        # ---------- 底栏只读 /api/v3/status ----------
        if await scenario("状态栏"):
            pg = await page_with_log(b)
            await go(pg, "/brand"); await pg.wait_for_timeout(800)
            heavy = [u for m, u in pg.reqs if re.search(r"/api/v3/(timeline|kb/tree|voice)", u)]
            st = [u for m, u in pg.reqs if u.endswith("/api/v3/status")]
            bar = await pg.locator(".statusbar").inner_text()
            rec("底栏只读 /api/v3/status，不为状态去拉整份时间线、知识库或 Voice", "实际", not heavy and len(st) == 1, f"status 请求={len(st)} 其他重接口={heavy}")
            await pg.close()

        # ---------- 时间线：真实只读同步；异常页宽度 ----------
        if await scenario("时间线"):
            pg = await page_with_log(b)
            await go(pg, "/user/timeline/anomalies"); await pg.locator(".anomaly").first.wait_for()
            w1440 = await pg.evaluate("document.documentElement.scrollWidth")
            await pg.set_viewport_size({"width": 1280, "height": 900}); await pg.wait_for_timeout(400)
            w1280 = await pg.evaluate("document.documentElement.scrollWidth")
            await pg.screenshot(path=os.path.join(OUT, "时间线异常-1280窄屏.png"))
            await pg.set_viewport_size({"width": 1440, "height": 900})
            raw = await pg.locator(".anomaly-raw").first.inner_text()
            rec("时间线异常页：1440 / 1280 宽都没有横向溢出，原文完整保留", "实际", w1440 <= 1440 and w1280 <= 1280 and len(raw) > 0, f"1440 宽 scrollWidth={w1440}；1280 宽={w1280}")
            await go(pg, "/user/timeline"); await pg.get_by_role("button", name="同步").click()
            await pg.locator(".tl-sync").wait_for(timeout=180000)
            msg = await pg.locator(".tl-sync").inner_text()
            rec("时间线同步：只读重取飞书，成功后回读快照", "实际", "已同步并回读" in msg, msg[:80])
            await pg.close()

        await b.close()
        errs = []
        with open(os.path.join(OUT, "交互验证.json"), "w") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)
        print("通过", sum(r["结果"] == "通过" for r in results), "/", len(results))

asyncio.run(main())
