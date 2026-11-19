// 每页每个宽度一张整页截图，由 node scripts/ui-baseline.mjs shoot | compare 调起，不单独跑。等待和比较规则见 ui-baseline.mjs 开头。
import { expect, test } from '@playwright/test';
import { readPages, ROOT } from './ui-baseline.mjs';

const { pages, clock, ready } = readPages(ROOT);
for (const p of pages) {
  for (const width of p.widths) {
    test(`${p.name} @${width}`, async ({ page }) => {
      if (clock) await page.clock.setFixedTime(new Date(clock));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(p.url, { waitUntil: 'load' });
      const sel = p.ready ?? ready; // 单页应用数据是异步读的：等到这个元素出现才算内容到了
      if (sel) await page.locator(sel).first().waitFor();
      // 页面声明的字体逐个加载完再截：只等 document.fonts.ready 不够，晚渲染的内容用到新字重时才去下载，
      // 截图时可能还是浏览器合成的粗体，和下载完的真字重边缘不一样（2026-11-19 carvomoto 连拍时偶发）
      await page.evaluate(async () => { await Promise.all([...document.fonts].map(f => f.load().catch(() => {}))); await document.fonts.ready; });
      await expect(page).toHaveScreenshot(`${p.name}-${width}.png`, { fullPage: true, mask: p.mask.map(s => page.locator(s)) });
    });
  }
}
