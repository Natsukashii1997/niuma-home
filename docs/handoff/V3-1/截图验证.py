import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright

OUT=Path(__file__).resolve().parent
ROUTES=[('首页','home','section.delivery'),('用户时间线-按月','user/timeline/month','.tl-intro'),('用户时间线-明细表','user/timeline/country','.tl-intro'),('用户时间线-异常','user/timeline/anomalies','.tl-intro'),('用户策略','user/strategy','.flow-chain'),('营销战役-倒计时','marketing/campaign','.deadline-bar')]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Asia/Shanghai',device_scale_factor=1,reduced_motion='reduce')
  results=[]
  for title,route,selector in ROUTES:
   page=await context.new_page();errors=[];api=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('response',lambda r:api.append({'path':r.url.split('5296')[-1],'status':r.status}) if '/api/v3/' in r.url else None)
   await page.goto('http://127.0.0.1:5296/#/'+route,wait_until='domcontentloaded')
   await page.locator(selector).wait_for(timeout=120000)
   if route=='home':await page.locator('.codex-card').wait_for(timeout=120000)
   await page.wait_for_function("!document.body.innerText.includes('读取中') && !document.body.innerText.includes('加载中')",timeout=120000)
   await page.evaluate('document.fonts.ready')
   size=await page.evaluate('({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight})')
   await page.screenshot(path=str(OUT/(title+'.png')),full_page=True,clip={'x':0,'y':0,'width':1440,'height':size['height']})
   if route.endswith('anomalies'):
    for name,y in [('top',0),('middle',int(size['height']/2)),('bottom',size['height'])]:
     await page.evaluate('(y)=>scrollTo(0,y)',y)
     await page.screenshot(path='/tmp/workdesk-v3-anomalies-'+name+'.png')
   text=await page.locator('body').inner_text()
   scope=page.locator('section.delivery') if route=='home' else page.locator('.toolbar') if route.startswith('user/') else page.locator('.deadline-bar')
   relevant='\n'.join(await scope.all_inner_texts())
   result={'page':title,'url':page.url,'viewportWidth':1440,'documentWidth':size['width'],'horizontalOverflow':size['width']>1440,'fullPage':True,'errors':errors,'api':api,'batchAreaSampleBadge':'示例' in relevant,'file':title+'.png'}
   if route=='home':result['codexSampleBadge']='示例' in await page.locator('section').filter(has=page.locator('.codex-card')).inner_text()
   if route=='marketing/campaign':result['bodySampleExpected']='示例' in text
   if route.startswith('user/timeline'):result['sourceShown']='飞书《2026海外大学时间线》' in text
   results.append(result)
   await page.close()
  await browser.close()
  (OUT/'截图验证.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
  print(json.dumps(results,ensure_ascii=False,indent=2))
asyncio.run(main())
