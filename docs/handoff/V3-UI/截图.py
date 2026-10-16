# 用法：shot.py <输出目录> <名称>=<地址>[|动作] ...
# 动作：k:<按键> 按键；t:<文字> 输入；w:<毫秒> 等待。用 ; 分隔多个动作。
import sys, asyncio
from playwright.async_api import async_playwright
out = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for arg in sys.argv[2:]:
            name, rest = arg.split("=", 1)
            url, _, acts = rest.partition("|")
            pg = await b.new_page(viewport={"width": 1440, "height": 900})
            errs = []
            pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
            pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
            await pg.goto(url, wait_until="networkidle")
            await pg.wait_for_timeout(900)
            full = True
            for a in filter(None, acts.split(";")):
                k, _, v = a.partition(":")
                if k == "k": await pg.keyboard.press(v)
                elif k == "t": await pg.keyboard.type(v)
                elif k == "w": await pg.wait_for_timeout(int(v))
                elif k == "v": full = False
                elif k == "c": await pg.click(v)
            await pg.wait_for_timeout(400)
            if full:  # 视口拉到整页高度再截，固定在底部的状态栏才会落在页尾
                h = await pg.evaluate("document.documentElement.scrollHeight")
                await pg.set_viewport_size({"width": 1440, "height": h})
                await pg.wait_for_timeout(400)
            await pg.screenshot(path=f"{out}/{name}.png")
            errs = [e for e in errs if "status of 501" not in e]
            print(name, "errors:", errs or "无")
            await pg.close()
        await b.close()
asyncio.run(main())
