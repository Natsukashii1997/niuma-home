"""把全部设计稿打包成一个自包含的 index.html：字体、样式、脚本、截图缩略图全部内嵌，
直接双击或在应用文件预览里打开就能用（不需要起服务、不靠页面跳转）。
用法：python3 docs/design-drafts/mentor-path/_shared/build.py（在仓库根目录执行）
源稿是 v1–v9.html / qa-side.html，改完源稿、重截 shots/ 后重新跑一次即可。"""
import base64, io, json, re
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parents[2]
SRC = ROOT / "src"

def b64(p): return base64.b64encode(Path(p).read_bytes()).decode()

# 样式：仓库三份样式 + 稿子共用样式；字体换成 data URI。第二轮的沉浸式外框样式单独放，只给 V6–V9 用
css = (SRC / "styles.css").read_text()
for name in ["Geist-Variable", "GeistMono-Variable", "GeistPixel-Square"]:
    css = css.replace(f'url("./assets/fonts/{name}.woff2")', f'url("data:font/woff2;base64,{b64(SRC / "assets/fonts" / (name + ".woff2"))}")')
css += "\n" + (SRC / "styles-v3.css").read_text() + "\n" + (SRC / "styles-layout.css").read_text() + "\n" + (HERE / "draft.css").read_text()
assert "./assets/" not in css
stage_css = (HERE / "stage.css").read_text()

# 脚本：把 ES 模块去掉 import / export，拼进同一个函数作用域
strip_import = lambda s: re.sub(r"^import .*?;\s*$", "", s, flags=re.M)
strip_export = lambda s: re.sub(r"^export ", "", s, flags=re.M)
lib = "\n".join(strip_export(strip_import(t)) for t in [
    (SRC / "ui/icons7.js").read_text(), (HERE / "data.js").read_text(), (HERE / "draft.js").read_text(), (HERE / "stage.js").read_text()])

# (文件, 标题, 一句话思路, 取舍, 分组)；分组 pick = 已选定（放最前），r2 = 第二轮（路线图占满一屏，1440×900），r1 = 第一轮，qa = 答疑
PAGES = [
    ("v7", "V7 远征登山", "横向全景山脉：前山是业务线、后山是 AI 线，一关一段坡、营地是通关点，越往右越高，两条路在山顶汇合；太阳就是今天，登山者站在现在的位置，绳桥是跨线依赖。", "情绪最强、一眼看出在爬坡 · 1280 宽时放不下的标牌收成小牌，悬停展开", "pick"),
    ("v6", "V6 地铁线路图", "两条线按真实周次铺满整屏，站点就是关卡：走过的线是实色、没走到的是空心轨道；橙线是今天，落在今天左边还没通关的站就是超期；换乘虚线是跨线依赖，终点站是结业。", "最接近 V1 + V3：清楚、克制、按时间读 · 游戏感中等", "r2"),
    ("v8", "V8 关卡长卷", "24 周横向铺开、一周 160px，一关一张大卡、卡宽就是计划周期；目标、任务、产出、评分直接写在卡上不用点开；拖动或滚轮左右走，底部小地图看全程、拖框跳转。", "信息最全、最实用 · 一屏只看到约 8 周", "r2"),
    ("v9", "V9 1-bit 世界地图", "掌机游戏式大地图：上面业务大陆（森林群山）、下面 AI 大陆（电路田），中间一条河；关卡是路上的圆点、BOSS 是城堡，跨线依赖是过河的桥，今天以后的地方盖着迷雾；点关卡弹出游戏对话框。", "游戏感最强、最好玩 · 信息要点开对话框看", "r2"),
    ("qa-side", "答疑 右侧填充", "没选中提问时，右侧显示这个人近 30 天的答疑概况：待回复数、每天提问点阵、提问主题分布、等得最久的待回复、最近已回复。", "提问主题需要机械邪龙兽归类，实现时要确认", "qa"),
    ("v1", "V1 横向地图", "两条路上的关卡格子，下方看详情。", "第一轮", "r1"),
    ("v2", "V2 纵向闯关塔", "两座塔并排，一层一关。", "第一轮", "r1"),
    ("v3", "V3 双轨路线", "按周排的双轨 + 全量明细表。", "第一轮", "r1"),
    ("v4", "V4 技能树", "两支技能树 + 能力值。", "第一轮", "r1"),
    ("v5", "V5 赛季通行证", "通行证两排等级 + 本周任务。", "第一轮", "r1"),
]

pages = {}
for key, *_ in PAGES:
    html = (DRAFT / f"{key}.html").read_text()
    style = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
    script = re.search(r'<script type="module">(.*?)</script>', html, re.S).group(1)
    pages[key] = {"style": style, "script": strip_import(script)}

def thumb(key, w=720):
    img = Image.open(DRAFT / "shots" / f"{key}.png").convert("RGB")
    img = img.crop((0, 0, 1440, min(img.height, 900))).resize((w, w * 900 // 1440), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

esc = lambda s: s.replace("</script", "<\\/script")
def card(k, t, idea, note, group):
    big = group in ("r2", "pick")
    badge = '<span class="tag tag-orange">已选定</span>' if group == "pick" else ""
    return f'''<button class="ix-card{' is-big' if big else ''}" data-go="{k}"><img src="{thumb(k, 960 if big else 480)}" alt="{t} 截图"><span class="ix-body"><b><span class="tag tag-frame">{t.split(" ")[0]}</span>{t.split(" ", 1)[1]}{badge}</b>{f'<span class="ix-idea">{idea}</span>' if group != "r1" else ''}<span class="small">{note if group != "r1" else idea}</span></span></button>'''
sec = lambda g: "".join(card(*p) for p in PAGES if p[4] == g)
tab = lambda g, cls="": "".join(f'<button data-go="{k}" class="{cls}">{t if g != "r1" else t.split(" ")[0]}</button>' for k, t, *_, gg in PAGES if gg == g)
meta = json.dumps({k: {"title": t, "idea": idea, "stage": g in ("r2", "pick")} for k, t, idea, _, g in PAGES}, ensure_ascii=False)

out = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>培养路径设计稿 · 总览</title>
<style>{css}</style>
<style>
/* 总览壳：顶部页签切换；版本页放在内嵌框里，按 1440 宽等比缩放到窗口宽度 */
body {{ min-height: 100vh; }}
.ix-bar {{ position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: var(--s4); padding: 0 var(--s5); height: 52px; background: var(--panel); border-bottom: 2px solid var(--line); }}
.ix-bar h1 {{ font-size: 14px; white-space: nowrap; }}
.ix-tabs {{ display: flex; align-items: center; gap: var(--s2); overflow-x: auto; }}
.ix-tabs .grp {{ display: flex; border: 2px solid var(--text); }}
.ix-tabs .grp.is-old {{ border-color: var(--line); }}
.ix-tabs button {{ height: 30px; padding: 0 var(--s3); border: 0; border-left: 1px solid var(--line); background: var(--panel); font: inherit; font-size: 12px; color: var(--text-2); white-space: nowrap; cursor: pointer; }}
.ix-tabs .grp button:first-child {{ border-left: 0; }}
.ix-tabs .grp.is-old button {{ color: var(--muted); padding: 0 var(--s2); }}
.ix-tabs button.active {{ background: var(--text); color: var(--panel); }}
.ix-tabs .sep {{ font-family: var(--font-mono); font-size: 10px; color: var(--muted); white-space: nowrap; }}
.ix-wrap {{ padding: var(--s5); }}
.ix-h {{ display: flex; align-items: baseline; gap: var(--s3); margin: 0 0 var(--s3); }}
.ix-h h2 {{ font-size: 18px; }}
.ix-h span {{ font-size: 12px; color: var(--muted); }}
.ix-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap); margin-bottom: var(--s6); }}
.ix-grid.is-small {{ grid-template-columns: repeat(5, minmax(0, 1fr)); }}
.ix-grid.is-qa {{ grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }}
.ix-card {{ display: flex; flex-direction: column; padding: 0; background: var(--panel); border: 2px solid var(--line); font: inherit; color: var(--text); text-align: left; cursor: pointer; }}
.ix-card:hover {{ border-color: var(--text); }}
.ix-card img {{ display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top left; border-bottom: 1px solid var(--line); }}
.ix-body {{ display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3) var(--s4) var(--s4); }}
.ix-body b {{ display: flex; align-items: center; gap: var(--s2); font-size: 15px; }}
.ix-idea {{ font-size: 13px; line-height: 1.65; color: var(--text-2); }}
.ix-body .small {{ color: var(--muted); }}
.ix-grid.is-small .ix-body {{ padding: var(--s2) var(--s3) var(--s3); }}
.ix-grid.is-small .ix-body b {{ font-size: 13px; }}
.ix-note {{ padding: var(--s3) var(--s4); border: 1px dashed var(--signal); background: var(--panel); font-size: 12px; line-height: 1.7; }}
.ix-note ul {{ margin: var(--s1) 0 0; padding-left: var(--s4); }}
.ix-view-head {{ display: flex; align-items: baseline; gap: var(--s3); margin-bottom: var(--s3); font-size: 12px; line-height: 1.6; color: var(--muted); }}
.ix-view-head b {{ font-size: 14px; color: var(--text); white-space: nowrap; }}
.ix-stage {{ position: relative; overflow: hidden; border: 2px solid var(--text); background: var(--bg); }}
.ix-stage iframe {{ position: absolute; left: 0; top: 0; width: 1440px; border: 0; transform-origin: 0 0; background: var(--bg); }}
</style>
</head>
<body>
<header class="ix-bar"><h1>带教 · 培养路径设计稿</h1>
  <nav class="ix-tabs" id="tabs"><span class="grp"><button data-go="home" class="active">总览</button></span>
    <span class="sep">已选定</span><span class="grp">{tab("pick")}</span>
    <span class="sep">第二轮</span><span class="grp">{tab("r2")}</span>
    <span class="grp">{tab("qa")}</span>
    <span class="sep">第一轮</span><span class="grp is-old">{tab("r1")}</span></nav>
  <span class="spacer"></span><span class="sample-badge">设计稿 · 模拟数据</span></header>
<main class="ix-wrap">
  <section id="home">
    <div class="ix-h"><h2>已选定 · V7 远征登山</h2><span>按 1440×900 设计，1280×800 也不重叠。点卡片进入，可悬停营地、点开营地日志、点山顶和大本营。</span></div>
    <div class="ix-grid">{sec("pick")}<div class="ix-note"><b>这一轮 V7 调了什么</b><ul>
      <li>太阳 = 今天：挂在第 8 周的位置，橙色虚线垂到地面；橙色只表示「现在」（太阳、登山者、正在爬的营地和标牌）。</li>
      <li>标牌分轻重：已通关细边、带通关日期和星；正在爬橙色粗边；未解锁灰虚线；周期写成 W7–9。</li>
      <li>营地站在平台上：路线在每个营地处走一小段平路，旗子、帐篷、城堡立在线上方并带白边，不再压线；营地之间不再密集锯齿，已爬过的实线 5px，两条路停在雪线下。</li>
      <li>标牌自动避让：放不下时先左右滑、再推开、换到营地另一侧，最后收成一行小牌（悬停展开）。1440 宽 13 块全是完整标牌，1280 宽 A1、A2、B5 收成小牌。</li>
      <li>「超期 1 周」挂在登山者脚下，不压营地；绳桥从营地平台边上出发、不穿过别的营地，悬停时的说明避开标牌和登山者。</li>
      <li>右下「本周攀登」：两条线各爬到哪段坡、坡上百分比、差几分、是否超期；卡片落在时间轴上方，图例一行。</li>
      <li>悬停营地或标牌：整段坡高亮，相关绳桥加深并显示说明；点开是营地日志，顶部按周进度，可切上一营地 / 下一营地（键盘 ← →）。</li>
      <li>山顶可点（结业条件、两条线均分），大本营可点（规则）。</li></ul></div></div>
    <div class="ix-h"><h2>第二轮 · 其余三版</h2><span>按 1440×900 设计；侧栏收成图标条，详情点开才出现。点卡片进入，可直接点关卡看详情。</span></div>
    <div class="ix-grid">{sec("r2")}</div>
    <div class="ix-h"><h2>答疑页</h2><span>右侧没选中提问时的填充</span></div>
    <div class="ix-grid is-qa">{sec("qa")}<div class="ix-note"><b>第二轮共同的取舍</b><ul>
      <li>路线图占满主区：去掉了下方的详情面板和数字条，关键数字收进页头一行；详情点关卡后从右侧（V9 是底部对话框）弹出。</li>
      <li>为了给路线图让地方，这页的侧栏收成 56px 图标条；也可以保持原来的侧栏，只是图会窄 150px。</li>
      <li>样式按你说的跳出了一部分：V6 用了圆形站点和蓝色 AI 线，V7 / V9 用了插画和像素画。保留的是墨色 + 信号橙、Geist 字体、像素图标、按帧动效（没有 CSS transition）。</li>
      <li>数据和第一轮一样（胡贵兰，第 8 周，业务 7 关 + AI 6 关，3 处跨线依赖），只比较呈现方式。</li></ul></div></div>
    <div class="ix-h"><h2>第一轮（已看过）</h2><span>你觉得 V1、V3 相对更对，第二轮从这两版出发</span></div>
    <div class="ix-grid is-small">{sec("r1")}</div>
  </section>
  <section id="view" hidden>
    <div class="ix-view-head"><b id="vt"></b><span id="vi"></span></div>
    <div class="ix-stage" id="stage"></div>
  </section>
</main>
<script type="text/plain" id="css">{esc(css)}</script>
<script type="text/plain" id="css2">{esc(stage_css)}</script>
<script type="text/plain" id="lib">{esc(lib)}</script>
{"".join(f'<script type="text/plain" id="style-{k}">{esc(p["style"])}</script><script type="text/plain" id="page-{k}">{esc(p["script"])}</script>' for k, p in pages.items())}
<script>
const META = {meta};
const text = (id) => document.getElementById(id).textContent.replace(/<\\\\\\/script/g, "<\\/script");
function pageHTML(key) {{
  const S = "<" + "script>", E = "<" + "/script>";
  const extra = META[key].stage ? `<style>${{text("css2")}}</style>` : "";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${{text("css")}}</style>${{extra}}<style>${{text("style-" + key)}}</style></head><body><div id="app"></div>${{S}}(() => {{ "use strict";\\n${{text("lib")}}\\n{{\\n${{text("page-" + key)}}\\n}}\\n}})();${{E}}</body></html>`;
}}
const stage = document.getElementById("stage");
let frame = null, cur = "home";
function fit() {{
  if (!frame) return;
  const scale = Math.min(1, stage.clientWidth / 1440);
  frame.style.transform = `scale(${{scale}})`;
  let h = 900;
  if (!META[cur].stage) {{ try {{ h = frame.contentDocument.documentElement.scrollHeight || h; }} catch (e) {{}} }}
  frame.style.height = `${{h}}px`;
  stage.style.height = `${{Math.ceil(h * scale)}}px`;
}}
function go(key) {{
  cur = key;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.go === key));
  document.getElementById("home").hidden = key !== "home";
  document.getElementById("view").hidden = key === "home";
  stage.innerHTML = ""; frame = null;
  if (key !== "home") {{
    document.getElementById("vt").textContent = META[key].title;
    document.getElementById("vi").textContent = META[key].idea;
    frame = document.createElement("iframe");
    frame.title = META[key].title;
    frame.style.height = "900px";
    frame.onload = () => {{ fit(); setTimeout(fit, 400); setTimeout(fit, 1200); }};
    frame.srcdoc = pageHTML(key);
    stage.appendChild(frame);
    fit();
  }}
  scrollTo(0, 0);
}}
document.addEventListener("click", (e) => {{ const b = e.target.closest("[data-go]"); if (b) go(b.dataset.go); }});
addEventListener("resize", fit);
const start = location.hash.slice(1);
if (META[start]) go(start);
</script>
</body>
</html>
'''
(DRAFT / "index.html").write_text(out)
print("index.html", round(len(out.encode()) / 1024), "KB")
