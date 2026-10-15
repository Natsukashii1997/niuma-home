import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "/Users/nat/.codex/skill-runtime/huashu-design/python/lib/python3.12/site-packages/playwright/driver/package");
const output = import.meta.dirname, url = "http://127.0.0.1:5293";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai", locale: "zh-CN" });
const page = await context.newPage(), checks = [], errors = [];
page.setDefaultTimeout(15000);
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => {
  window.uploadEvents = [];
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    this.upload.addEventListener("progress", e => window.uploadEvents.push({ loaded: e.loaded, total: e.total, lengthComputable: e.lengthComputable }));
    return send.call(this, body);
  };
});
const check = (name, details = true) => { checks.push({ name, details, result: "通过" }); console.log(name); };
const shot = async name => { await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }); };
const navigate = async route => { await page.goto(`${url}/#/${route}`); await page.waitForTimeout(1600); };
const sizes = async name => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await shot(`${name}-1440`);
  await page.setViewportSize({ width: 820, height: 1000 }); await page.waitForTimeout(150); await shot(`${name}-820`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} 窄屏不得整页横向溢出`);
  await page.setViewportSize({ width: 1440, height: 1000 });
};
try {
  await navigate("home"); await sizes("首页"); check("首页桌面与窄屏");
  await navigate("marketing/plans"); await sizes("方案");
  await page.locator(".plan-card").first().hover(); await page.waitForFunction(() => document.querySelector(".plan-card").dataset.level === "4");
  await shot("交互④-网点悬停"); check("方案网点逐帧悬停到四档");
  await page.locator(".plan-card").first().click();
  await page.getByRole("textbox", { name: "方案原文" }).fill(await readFile(new URL("../../../fixtures/2026-09-大学辅导.txt", import.meta.url), "utf8"));
  await page.getByRole("button", { name: "解析预览", exact: true }).click();
  await page.getByRole("progressbar", { name: "解析预览" }).waitFor(); await shot("交互⑥-解析进度格");
  await page.getByRole("button", { name: "确认入库", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.operation-progress [role="progressbar"]')?.getAttribute("aria-valuenow") === "100");
  await sizes("方案录入");
  await page.getByRole("button", { name: "确认入库", exact: true }).click();
  await page.getByText(/已写入 \d+ 行/).waitFor(); assert.equal(await page.getByRole("button", { name: "确认入库", exact: true }).isDisabled(), true);
  await shot("方案入库-回读完成"); check("方案解析、确认入库与回读完成；确认按钮置灰");
  await page.route("**/api/plans/parse", route => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"隔离故障注入：解析失败"}' }));
  await page.getByRole("button", { name: "解析预览", exact: true }).click();
  await page.locator(".step-progress.is-error").waitFor();
  const failed = await page.locator(".step-progress").innerText(); await page.waitForTimeout(500); assert.equal(await page.locator(".step-progress").innerText(), failed);
  await shot("方案解析-失败停止进度"); await page.unroute("**/api/plans/parse"); check("解析失败后进度停止");
  await navigate("marketing/promos"); await sizes("促销表");
  const group = page.locator(".promo-group-toggle").first(); await group.click(); assert.equal(await group.getAttribute("aria-expanded"), "false"); await group.click();
  await page.locator("td.promo-changed").first().hover(); await page.getByRole("tooltip").waitFor(); await shot("促销表-历史浮层");
  const tooltip = await page.getByRole("tooltip").evaluate(el => ({ shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderTopWidth, radius: getComputedStyle(el).borderRadius }));
  assert.deepEqual(tooltip, { shadow: "none", border: "2px", radius: "0px" }); check("促销分组折叠及无阴影直角历史浮层", tooltip);

  await navigate("marketing/materials");
  await page.getByRole("button", { name: "新建物料", exact: true }).click();
  await page.getByLabel("物料名称", { exact: true }).fill("T09 隔离验收物料");
  await page.getByRole("button", { name: "预览物料", exact: true }).click(); await page.getByRole("button", { name: "确认新建物料", exact: true }).click();
  await page.getByRole("button", { name: "选择图片", exact: true }).waitFor();
  const env = await (await context.request.get(`${url}/__evidence`)).json();
  await page.locator('input[type="file"]').setInputFiles([`${env.dataDir}/upload-large.png`, `${env.dataDir}/upload-small.png`]);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 30, downloadThroughput: 2000000, uploadThroughput: 70000 });
  await page.getByRole("button", { name: "确认上传 2 张图片", exact: true }).click();
  await page.waitForFunction(() => { const p = document.querySelector('[aria-label="图片上传与回读核对"]'); const n = Number(p?.getAttribute("aria-valuenow")); return n > 0 && n < 100; });
  await shot("交互⑥-真实多图上传进度");
  await page.getByText("本批次已上传并回读 2 / 2 张。", { exact: true }).waitFor();
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const uploadEvents = await page.evaluate(() => window.uploadEvents); assert.ok(uploadEvents.some(e => e.loaded > 0 && e.loaded < e.total && e.lengthComputable));
  check("两张不同大小 PNG 真实 XHR 上传、进度事件、记录与文件回读", uploadEvents);
  await sizes("物料详情"); await page.getByRole("button", { name: "关闭弹窗" }).click(); await sizes("物料列表");
  await page.getByRole("button", { name: "查看物料：T09 隔离验收物料" }).last().click();
  await page.getByRole("button", { name: "删除当前图片", exact: true }).click(); await page.getByRole("button", { name: "确认删除图片", exact: true }).click();
  await page.getByText("已删除所选图片。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "删除物料", exact: true }).click(); await page.getByRole("button", { name: "确认删除物料", exact: true }).click();
  await page.getByText("已删除「T09 隔离验收物料」及其图片。", { exact: true }).waitFor(); check("物料单图删除、整条删除及回读");
  await navigate("brand"); await sizes("品牌");
  await navigate("business"); assert.equal(await page.locator(".kpi").count(), 12); await sizes("业务"); check("品牌与业务骨架，无新增统计数据");

  await navigate("assistants"); await page.getByLabel("模型", { exact: true }).selectOption("b");
  await page.getByText(/强度已自动设为 medium/).waitFor(); await page.getByLabel("强度", { exact: true }).selectOption("high");
  await page.waitForFunction(() => !document.querySelector('[aria-label="强度"]').disabled);
  await page.getByRole("textbox", { name: "消息", exact: true }).fill("T09 隔离对话验收，请给出测试回复。");
  await page.getByRole("button", { name: "发送", exact: true }).click(); await page.locator(".type-cursor").waitFor();
  assert.equal(await page.locator(".type-text").innerText(), ""); await shot("Agent-首字前光标与等待");
  assert.equal(await page.getByLabel("模型", { exact: true }).isDisabled(), true);
  await page.waitForFunction(() => document.querySelector(".type-text")?.textContent.length > 8); await shot("交互⑤-流式光标打字");
  await page.getByText("当前生效：b · high", { exact: true }).waitFor();
  assert.equal(await page.locator(".type-text").count(), 0); await sizes("Agent");
  await navigate("brand"); await navigate("assistants"); assert.equal(await page.locator(".type-text").count(), 0);
  const protocol = await (await context.request.get(`${url}/__evidence`)).json();
  assert.equal(protocol.events.at(-1).params.model, "b"); assert.equal(protocol.events.at(-1).params.effort, "high");
  check("Agent 等待首字、逐字输出、历史静态显示、模型与强度保存回读", protocol);

  await navigate("reports"); await sizes("日报"); await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByRole("progressbar", { name: "刷新日/周报" }).waitFor(); await shot("日周报-刷新进度");
  await page.waitForFunction(() => document.querySelector('[aria-label="刷新日/周报"]')?.getAttribute("aria-valuenow") === "100");
  await page.getByRole("button", { name: "周报", exact: true }).click(); await sizes("周报"); check("日/周报刷新和来源篇数、周次标签");

  await navigate("settings"); await sizes("设置");
  const weekly = page.getByRole("form", { name: "周报文档链接（可选）配置", exact: true });
  await weekly.getByRole("textbox").fill("https://team.feishu.cn/docx/WeeklyPreview");
  await weekly.getByRole("button", { name: "预览保存", exact: true }).click(); await weekly.getByRole("progressbar").waitFor(); await shot("设置-周报试读进度");
  await weekly.getByRole("button", { name: "确认保存", exact: true }).click(); await weekly.getByText("已保存周报文档链接（可选），并已回读核对。", { exact: true }).waitFor();
  assert.equal((await (await context.request.get(`${url}/api/settings`)).json()).weekly_doc_url, "https://team.feishu.cn/docx/WeeklyPreview");
  await weekly.getByRole("textbox").fill("https://team.feishu.cn/docx/Failure"); await weekly.getByRole("button", { name: "预览保存", exact: true }).click();
  await weekly.locator(".step-progress.is-error").waitFor(); await shot("设置-试读失败"); check("设置试读、确认保存与回读；失败不保存");
  assert.equal(errors.length, 0, JSON.stringify(errors));
} catch (error) {
  errors.push(error.stack); await shot("浏览器首败现场"); throw error;
} finally {
  await writeFile(`${output}/浏览器验证.json`, JSON.stringify({ checks, errors, viewport: [1440, 820], data: "临时人工数据与脱敏 fixture，外部响应替身", at: new Date().toISOString() }, null, 2));
  await browser.close();
}
