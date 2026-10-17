import asyncio,json,time
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(__file__).resolve().parent
ROUTES=[('首页','home'),('用户时间线-按月','user/timeline/month'),('用户时间线-明细','user/timeline/country'),('用户时间线-异常','user/timeline/anomalies'),('用户策略','user/strategy'),('项目推进','projects/board'),('管培带教','projects/mentor'),('知识库','kb'),('营销战役','marketing/campaign'),('设计brief','marketing/brief'),('设计参考','marketing/materials/refs'),('价格记录-演示','marketing/prices'),('SKU档案-演示价格图','marketing/sku/大学辅导/灵活学Lite'),('营收-演示','business'),('助手知识库','assistants'),('自言自语','home'),('设置-待Claude接线','settings'),('Voice-来源不可用','voice')]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Shanghai',device_scale_factor=1,reduced_motion='reduce')
  results=[]
  for title,route in ROUTES:
   page=await context.new_page();errors=[];api=[];pending=set()
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('request',lambda r:pending.add(r) if '/api/' in r.url else None)
   page.on('requestfinished',lambda r:pending.discard(r))
   page.on('requestfailed',lambda r:pending.discard(r))
   page.on('response',lambda r:api.append({'path':r.url.split('5296')[-1],'status':r.status}) if '/api/v3/' in r.url else None)
   await page.goto('http://127.0.0.1:5296/#/'+route,wait_until='domcontentloaded')
   if title=='助手知识库':await page.get_by_role('button',name='知识库',exact=True).click(timeout=30000)
   if title=='自言自语':await page.get_by_role('button',name='自言自语',exact=False).click(timeout=30000)
   start=time.monotonic();quiet=0
   while time.monotonic()-start<100:
    await asyncio.sleep(.25)
    quiet=quiet+.25 if not pending else 0
    if quiet>=1:break
   await page.evaluate('document.fonts.ready')
   size=await page.evaluate('({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})')
   await page.screenshot(path=str(OUT/(title+'.png')),full_page=True,clip={'x':0,'y':0,'width':1440,'height':size['height']})
   text=await page.locator('body').inner_text()
   result={'page':title,'route':route,'viewportWidth':1440,'documentWidth':size['width'],'fullPage':True,'errors':errors,'api':api,'pending':len(pending),'sampleBadges':await page.locator('.sample-badge').count(),'undefinedShown':'undefined' in text,'file':title+'.png'}
   results.append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
   await page.close()
  await browser.close()
  (OUT/'截图验证.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
asyncio.run(main())
