import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || "/Users/nat/.codex/skill-runtime/huashu-design/python/lib/python3.12/site-packages/playwright/driver/package");
const output = import.meta.dirname, url = "http://127.0.0.1:5293";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Shanghai", locale: "zh-CN" });
const page = await context.newPage(), checks = [], errors = [];
page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message));
const check = (name, details = true) => { checks.push({ name, details, result: "通过" }); console.log(name); };
const shot = async name => page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
try {
  // 仅冻结浏览器计时器来保留真实中间帧，不改 DOM、不合成图像。
  const time = new Date("2026-10-15T18:20:00+08:00");
  await page.clock.install({ time }); await page.clock.pauseAt(time);
  await page.goto(`${url}/#/home`); await page.locator(".dot-col").first().waitFor();
  await page.clock.runFor(201);
  assert.ok(await page.locator(".flip-number .flash").count()); await shot("交互①-数字停止橙色帧");
  const during = await page.locator(".dot-col i.on").count(); assert.ok(during > 0);
  await shot("交互②-点阵点亮中"); await page.clock.runFor(1300);
  const after = await page.locator(".dot-col i.on").count(); assert.ok(after > during);
  check("真实数字停帧与点阵中间态，浏览器时钟冻结截图", { during, after });
  await page.getByRole("link", { name: "品牌", exact: true }).click(); await page.clock.runFor(70);
  const dissolve = await page.locator("canvas").evaluate(canvas => {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let on = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) on++;
    return { display: getComputedStyle(canvas).display, filled: on, total: pixels.length / 4 };
  });
  assert.ok(dissolve.filled > 0 && dissolve.filled < dissolve.total); await shot("交互③-模块溶解中");
  await page.clock.runFor(500); check("模块切换溶解过程", dissolve);
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.getByRole("link", { name: "首页", exact: true }).click();
  await page.locator(".dot-col").first().waitFor();
  const reducedNumbers = await page.locator(".flip-number").evaluateAll(list => list.map(el => ({ target: el.getAttribute("aria-label"), shown: el.textContent })));
  assert.ok(reducedNumbers.every(n => n.target === n.shown)); assert.equal(await page.locator(".flip-number .flash").count(), 0);
  assert.equal(await page.locator(".dot-col i.on").count(), after);
  assert.equal(await page.locator("canvas").evaluate(el => getComputedStyle(el).display), "none");
  await shot("减少动态效果-首页直接终态");
  await page.getByRole("link", { name: "营销", exact: true }).click(); await page.locator(".plan-card").first().hover();
  assert.equal(await page.locator(".plan-card").first().getAttribute("data-level"), "4");
  await page.mouse.move(2, 2); assert.equal(await page.locator(".plan-card").first().getAttribute("data-level"), "0");
  check("减少动态：数字/点阵直达终态、无溶解、悬停立即4档并复原", reducedNumbers);
  await page.clock.resume();

  await page.goto(`${url}/#/assistants`); await page.getByRole("textbox", { name: "消息", exact: true }).fill("长段隔离验证");
  await page.getByRole("button", { name: "发送", exact: true }).click(); await page.locator(".type-cursor").waitFor();
  assert.equal(await page.locator(".type-cursor.off").count(), 0);
  const waiting = await page.locator('.assistant-wait [role="progressbar"]').innerText();
  await page.waitForTimeout(350); assert.equal(await page.locator('.assistant-wait [role="progressbar"]').innerText(), waiting);
  await shot("减少动态效果-静态等待光标与进度");
  await page.waitForFunction(() => document.querySelector(".type-text")?.textContent.length > 1000);
  const length = await page.locator(".type-text").evaluate(el => el.textContent.length); assert.equal(length, "长段隔离验证：逐字展开仍应跟随到最新内容。\n".repeat(90).length);
  await page.waitForFunction(() => !document.querySelector(".type-text"));
  check("减少动态：真实delta立即全量显示；等待不闪烁、不伪报完成；流结束无光标", { waiting, length });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("textbox", { name: "消息", exact: true }).fill("长段滚动验证"); await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".type-text")?.textContent.length > 800);
  const scroll = await page.locator(".chat-messages").evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight, bottomGap: el.scrollHeight - el.scrollTop - el.clientHeight }));
  assert.ok(scroll.scrollHeight > scroll.height && scroll.bottomGap < 40); await shot("Agent-长段逐字输出跟随滚动");
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(100);
  assert.equal(await page.locator(".type-text").evaluate(el => el.textContent.length), length); assert.equal(await page.locator(".type-cursor.off").count(), 0);
  await page.waitForFunction(() => !document.querySelector(".type-text")); check("长delta逐字展开保持滚动；运行中切换减少动态效果立即终态", scroll);

  // 异常上传：第2张收到 HTTP 500 + JSON null，第3张不得继续发送。
  await page.goto(`${url}/#/marketing/materials`); await page.getByRole("button", { name: "新建物料", exact: true }).click();
  await page.getByLabel("物料名称", { exact: true }).fill("T09 上传失败验证");
  await page.getByRole("button", { name: "预览物料", exact: true }).click(); await page.getByRole("button", { name: "确认新建物料", exact: true }).click();
  await page.getByRole("button", { name: "选择图片", exact: true }).waitFor();
  const env = await (await context.request.get(`${url}/__evidence`)).json();
  await page.locator('input[type="file"]').setInputFiles([`${env.dataDir}/upload-small.png`, `${env.dataDir}/upload-large.png`, `${env.dataDir}/upload-small.png`]);
  let uploads = 0;
  await page.route("**/api/materials/*/images?name=*", route => {
    uploads++; return uploads === 2 ? route.fulfill({ status: 500, contentType: "application/json", body: "null" }) : route.continue();
  });
  await page.getByRole("button", { name: "确认上传 3 张图片", exact: true }).click(); await page.locator(".step-progress.is-error").waitFor();
  await page.waitForTimeout(400); assert.equal(uploads, 2);
  assert.equal(await page.getByRole("button", { name: "确认上传 3 张图片", exact: true }).isDisabled(), true);
  assert.ok((await page.locator(".material-dialog").innerText()).includes("已确认 1 / 3 张"));
  const failureProgress = await page.getByRole("progressbar").getAttribute("aria-valuenow");
  await shot("上传失败-部分完成停止后续并锁定"); check("上传第二张失败后停止；第一张已回读、第三张未发、锁定重发", { uploads, failureProgress });
  await page.unroute("**/api/materials/*/images?name=*");

  // 窄屏报告间距精修后回拍；设置完成后的隔离库来源保持真实接口回读。
  await page.goto(`${url}/#/reports`); await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
  for (const [kind, name] of [["日报", "日报"], ["周报", "周报"]]) {
    await page.getByRole("button", { name: kind, exact: true }).click();
    for (const width of [1440, 820]) { await page.setViewportSize({ width, height: 1000 }); await shot(`${name}-${width}`); }
  }
  assert.equal(errors.length, 0); check("日报/周报窄屏多余留白已收紧并回拍");
} catch (error) {
  errors.push(error.stack); await shot("交互验证首败现场"); throw error;
} finally {
  await writeFile(`${output}/动效与失败验证.json`, JSON.stringify({ checks, errors, at: new Date().toISOString(), method: "真实构建与组件；前三种动效用浏览器时钟冻结中间帧；减少动态用浏览器媒体偏好模拟" }, null, 2));
  await browser.close();
}
