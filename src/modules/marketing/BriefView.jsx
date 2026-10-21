import { useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Loadable, MonthSwitch, StatusMark, Tag, useToast } from "../../ui/components.jsx";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { BriefAttachments } from "./BriefAttachments.jsx";
import { FeishuExport } from "../../ui/feishu-export.jsx";
import Thumb from "../../ui/Thumb.jsx";
import { currentMonth } from "../../constants.js";
import { BRIEF_SECTIONS as SECTIONS, BRIEF_HEADS, syncBriefMaterials } from "../../../server/brief-template.mjs";
import { briefPatch, briefText } from "./brief-edit.js";

const STATUS = [["todo", "待写"], ["part", "写了一部分"], ["done", "完成"]];
export default function BriefView() {
  const [month, setMonth] = useState(currentMonth());
  const state = useApi(`/api/v3/briefs/${month}`);
  const [fresh, setFresh] = useState(null); // 保存后回读到的 brief
  const [notice, setNotice] = useState("");
  const brief = fresh?.month === month ? fresh : null;
  return <Loadable state={state} name="设计 brief" big>{(b) => { const cur = brief || b; return <><SavedNote text={notice} onClose={() => setNotice("")} /><Brief key={`${month}-${cur.version}`} brief={cur} month={month} setMonth={(m) => { setFresh(null); setNotice(""); setMonth(m); }} onSaved={(back, text = "") => { setFresh(back); setNotice(text); }} onEdit={() => setNotice("")} /></>; }}</Loadable>;
}

const Source = ({ children }) => <span className="source-tag"><PixelIcon name="link" />{children}</span>;

// 看起来像正文的输入框：多行自动撑高。
function Text({ value, onChange, placeholder = "待写", className = "" }) {
  return <textarea className={`doc-input ${className}`} rows={1} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }} />;
}

function Brief({ brief, month, setMonth, onSaved, onEdit }) {
  const [sec, setSec] = useState(1);
  const [all, setAll] = useState(true);
  const [draft, setDraft] = useState(() => structuredClone(brief));
  const [rewrite, setRewrite] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generation, setGeneration] = useState(null);
  const [generationError, setGenerationError] = useState("");
  const [exportLocked, setExportLocked] = useState(false);
  const [toast, showToast] = useToast();
  const flow = useWriteFlow();
  const patch = briefPatch(brief, draft);
  const changed = Object.keys(patch);
  const edit = (fn) => { if (generating || exportLocked || flow.busy || flow.phase === "unknown") return; setDraft((d) => { const n = structuredClone(d); fn(n); return n; }); flow.reset(); onEdit(); };
  const locked=generating || exportLocked || flow.busy || flow.phase==='unknown';
  const materialChange=(materials)=>edit(d=>Object.assign(d,syncBriefMaterials(d,materials)));
  const generate=async(overwrite=false)=>{
    if(locked)return;
    setGenerating(true);setGenerationError('');setRewrite(false);
    try {
      const result=await apiSend('POST',`/api/v3/briefs/${month}/generate`,{patch:briefPatch(brief,draft),overwrite});
      setDraft(result.value);setGeneration(result);flow.reset();onEdit();
    }catch(e){setGenerationError(e.message);}finally{setGenerating(false);}
  };
  const done = Object.values(draft.status).filter((s) => s === "done").length;
  const show = (n) => all || sec === n;
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); showToast(`已复制${label}`); } catch { showToast("复制失败：浏览器不允许写剪贴板"); } };
  const preview = () => flow.preview(() => apiSend("POST", `/api/v3/briefs/${month}/preview`, { patch }));
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/v3/briefs/${month}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await apiSend("GET", `/api/v3/briefs/${month}`);
      const ok = back.version === pv.value.version && Object.keys(patch).every((k) => JSON.stringify(back[k]) === JSON.stringify(pv.value[k]));
      if (ok) onSaved(back, `已保存为 ${back.version}，回读核对一致`);
      return ok;
    },
  );
  const reread = async () => { const back = await apiSend("GET", `/api/v3/briefs/${month}`); flow.resolve(); onSaved({ ...back }); };
  const head = (n, extra) => (
    <h3><span className="tnum">{n}</span>{SECTIONS[n - 1]}{extra}
      <span className="spacer" />
      <select className="sec-status" value={draft.status[n] || "todo"} onChange={(e) => edit((d) => { d.status[n] = e.target.value; })} aria-label={`第 ${n} 节状态`}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </h3>
  );
  return (
    <>
      <div className="toolbar">
        <MonthSwitch month={month} onChange={(m) => { if (!locked && (!changed.length || confirm_(`${month} 有 ${changed.length} 处改动还没保存，切换月份会丢掉。继续？`))) setMonth(m); }} mark={month === currentMonth() ? "本月" : ""} />
        <span className="small muted">{brief.version} · {brief.editedAt ? `最后保存 ${brief.editedAt}` : "还没保存过"} · 7 节完成 {done} 节</span>
        <span className="spacer" />
        <Button onClick={() => copy(briefText(draft), " brief 全文")}><PixelIcon name="copy" />复制全文</Button>
        <Button variant="primary" disabled={!changed.length || locked} onClick={preview}><PixelIcon name="eye" />预览保存{changed.length ? `（${changed.length} 处）` : ""}</Button>
      </div>
      <WriteBox flow={flow} title="brief 保存预览" onConfirm={confirm} onRepreview={preview} onReread={reread}>
        {(pv) => <dl className="kv">
          <dt>月份</dt><dd className="tnum">{month} · 保存后版本 {pv.value.version}</dd>
          <dt>改动</dt><dd>{changed.map((k) => FIELD_LABEL[k] || k).join("、")}</dd>
          <dt>写到哪里</dt><dd>工作台本地；已填写内容会保留，内部生成只补充空白项</dd>
        </dl>}
      </WriteBox>
      <div className="brief-layout">
        <nav className="brief-outline" aria-label="章节">
          <button type="button" className={`outline-all${all ? " active" : ""}`} onClick={() => setAll(true)}><PixelIcon name="menu" />全部展开</button>
          {SECTIONS.map((t, i) => (
            <button key={t} type="button" className={!all && sec === i + 1 ? "active" : ""} onClick={() => { setAll(false); setSec(i + 1); }}>
              <span className="tnum">{i + 1}</span><span>{t}</span><StatusMark state={draft.status[i + 1] || "todo"} />
            </button>
          ))}
        </nav>

        <article className="doc">
          <span className="label">design brief · {month}</span>
          <h2><Text value={draft.title} onChange={(v) => edit((d) => { d.title = v; })} placeholder="标题" className="is-title" /></h2>
          {show(1) && <section>{head(1)}{draft.background.from && <p className="small muted">来源：{draft.background.from}</p>}
            <Text value={draft.background.text} onChange={(v) => edit((d) => { d.background.text = v; })} placeholder="根据同月用户策略生成一段背景，也可以直接填写" />
            <ol className="goals">{draft.background.goals.map((g, k) => <li key={k}><Text value={g} onChange={(v) => edit((d) => { d.background.goals[k] = v; })} /><button type="button" className="icon-btn" title="删掉这条目标" onClick={() => edit((d) => { d.background.goals.splice(k, 1); })}><PixelIcon name="close" /></button></li>)}</ol>
            <button type="button" className="link-btn" onClick={() => edit((d) => { d.background.goals.push(""); })}><PixelIcon name="plus" />加一条目标</button></section>}
          {show(2) && <section>{head(2)}
            <p className="small muted">先填写物料名称，再点右侧「内部生成建议」。名称会同步到第三、四部分。</p>
            <RowsTable cols={BRIEF_HEADS.audience} rows={draft.audience} onChange={fn=>edit(d=>fn(d.audience))} allowRows={false}
              onName={(i,name)=>materialChange(draft.materials.map((m,k)=>k===i?{...m,name}:m))}
              onRemove={i=>{if(confirm_('删除这份物料及对应受众、交付安排和文案框架？'))materialChange(draft.materials.filter((_,k)=>k!==i));}} />
            <Button disabled={locked} onClick={()=>materialChange([...draft.materials,{id:crypto.randomUUID(),name:''}])}><PixelIcon name="plus"/>添加物料</Button>
          </section>}
          {show(3) && <section>{head(3)}<RowsTable cols={BRIEF_HEADS.timeline} rows={draft.timeline} onChange={fn=>edit(d=>fn(d.timeline))} allowRows={false} fixedFirst /></section>}
          {show(4) && <section>{head(4)}
            {!draft.items.length ? <p className="small muted">在第二部分填写物料名称后，这里会为每份物料创建独立框架；可直接带到飞书继续填写。</p>
              : draft.items.map((it, k) => <BriefItem key={it.id} it={it} index={k} onChange={(fn) => edit((d) => fn(d.items[k]))} />)}</section>}
          {show(5) && <section>{head(5)}<RowsTable cols={draft.specs[0]?.length===4?['物料','比例','尺寸','格式']:BRIEF_HEADS.specs} emptyHint={false} rows={draft.specs} onChange={fn=>edit(d=>fn(d.specs))} /></section>}
          {show(6) && <section>{head(6)}<RowsTable cols={draft.owners[0]?.length===3?['角色','负责人','状态']:BRIEF_HEADS.owners} header={false} rows={draft.owners} onChange={fn=>edit(d=>fn(d.owners))} allowRows={false} fixedFirst /></section>}
          {show(7) && <section>{head(7)}<BriefAttachments month={month} /></section>}
          {!all && (
            <div className="doc-pager">
              <Button disabled={sec === 1} onClick={() => setSec(sec - 1)}><PixelIcon name="left" />{sec > 1 ? SECTIONS[sec - 2] : "上一节"}</Button>
              <Button disabled={sec === 7} onClick={() => setSec(sec + 1)}>{sec < 7 ? SECTIONS[sec] : "下一节"}<PixelIcon name="right" /></Button>
            </div>
          )}
          <div className="doc-export">
            <FeishuExport key={month} oneClick onLockChange={setExportLocked} what=" Brief " disabled={changed.length > 0 || generating || flow.busy || flow.phase==='unknown'} disabledNote="有改动还没保存：先保存，导出的是已保存的版本"
              previewPath={`/api/v3/briefs/${month}/export-preview`} confirmPath={`/api/v3/briefs/${month}/export`} statusBase={`/api/v3/briefs/${month}/exports`} />
            {changed.length > 0 && <span className="small muted">有改动还没保存；导出的是已保存的版本，先保存再导出。</span>}
          </div>
        </article>

        <aside className="brief-rail">
          <section className="card">
            <div className="card-head"><h2><PixelIcon name="agent" />Brief 内容建议</h2></div>
            <div className="card-body stack-sm">
              <p className="small muted">读取 {month} 的用户策略，综合物料名称补充背景、目的、面向人群与当前待办。已有文字保留。</p>
              <p className="small muted">工作台内部规则生成，可按实际需求修改。交付时间、负责人、详细文案及后三节可留空。</p>
              <Button variant="primary" disabled={locked || !brief.strategySource?.available} onClick={()=>generate()}>{generating?'正在生成…':'内部生成建议'}</Button>
              {brief.strategySource?.available && <button className="link-btn" disabled={locked} onClick={()=>setRewrite(!rewrite)}>重新生成第一、二部分</button>}
              {rewrite && <div className="stack-sm"><p className="small warn-text">将替换背景、目的和受众文字，其他部分保留。</p><Button disabled={locked} onClick={()=>generate(true)}>确认重新生成</Button><button className="link-btn" onClick={()=>setRewrite(false)}>取消</button></div>}
              {!brief.strategySource?.available && <p className="small warn-text">这个月份还没有用户策略，请先在用户策略页补充。</p>}
              {generation && <p className="small muted">已补充草稿 · 来源：{generation.source.month} 用户策略。检查后保存即可。</p>}
              {generation?.warnings.map(w=><p className="small warn-text" key={w}>{w}</p>)}
              {generationError && <p role="alert" className="small risk-text">{generationError}</p>}
              <a className="link" href={href('user','strategy')}>查看用户策略</a>
            </div>
          </section>
        </aside>
      </div>
      {toast}
    </>
  );
}

const FIELD_LABEL = { materials:"物料名称", title: "标题", background: "项目背景与目标", audience: "目标受众", timeline: "项目时间线", items: "详细文案与框架", specs: "交付物清单与规格", owners: "负责人与审批", status: "各节状态" };
const confirm_ = (text) => window.confirm(text);

function RowsTable({ cols, rows, onChange, allowRows=true, fixedFirst=false, onName, onRemove, emptyHint=true, header=true }) {
  return (
    <>
      <table className="grid compact brief-table">
        {header && <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}{((allowRows && rows.length>0) || onRemove) && <th aria-label="操作" />}</tr></thead>}
        <tbody>
          {!rows.length && emptyHint && <tr><td colSpan={cols.length + ((allowRows || onRemove)?1:0)} className="muted small">还没有内容</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{j===0 && fixedFirst?<span>{c}</span>:<Text value={c} placeholder={j===0 && onName?"输入物料名称":""} onChange={(v) => j===0 && onName?onName(i,v):onChange((list) => { list[i][j] = v; })} />}</td>)}
              {(allowRows || onRemove) && <td className="row-del"><button type="button" className="icon-btn" title="删掉这一行" onClick={() => onRemove?onRemove(i):onChange((list) => { list.splice(i, 1); })}><PixelIcon name="close" /></button></td>}</tr>
          ))}
        </tbody>
      </table>
      {allowRows && <button type="button" className="link-btn" onClick={() => onChange((list) => { list.push(cols.map(() => "")); })}><PixelIcon name="plus" />加一行</button>}
    </>
  );
}

function BriefItem({ it, index, onChange }) {
  if (it.kind === 'framework') return <div className="brief-item"><h4>4.{index+1} {it.title || '待填写物料名称'}</h4><RowsTable cols={BRIEF_HEADS.blocks} emptyHint={false} rows={it.blocks} onChange={fn=>onChange(x=>fn(x.blocks))}/></div>;
  if (it.kind === "skip") return <div className="brief-item"><h4>{it.title}</h4><Text value={it.note} onChange={(v) => onChange((x) => { x.note = v; })} /></div>;
  return (
    <div className="brief-item">
      <h4>{it.title}{it.priceFrom && <Source>{it.priceFrom}</Source>}</h4>
      {it.blocks && (
        <table className="grid compact brief-blocks"><thead><tr><th>涉及板块</th><th>内容</th><th>说明 · 示例</th></tr></thead>
          <tbody>{it.blocks.map((b, i) => <tr key={i}><td className="k">{b[0]}</td><td><Text value={b[1]} onChange={(v) => onChange((x) => { x.blocks[i][1] = v; })} /></td><td><Text value={b[2]} className="muted" onChange={(v) => onChange((x) => { x.blocks[i][2] = v; })} /></td></tr>)}</tbody></table>
      )}
      {it.cells && (
        <div className="p9">
          {it.cells.map((c, i) => <div key={i} className={`p9-cell${c ? "" : " is-empty"}`}><b>P{i + 1}</b><Text value={c} onChange={(v) => onChange((x) => { x.cells[i] = v; })} /></div>)}
        </div>
      )}
      <div className="ref-strip">
        {(it.refs || []).map((r) => <figure key={r.title} className="ref-slot"><Thumb kind={r.kind} big={r.big} title={r.title} accent={r.accent} /><figcaption>参考 · {r.title}</figcaption></figure>)}
        {it.reuse ? <figure className="ref-slot is-reuse"><Thumb kind="poster" big={it.reuse.big} title={it.reuse.title} /><figcaption>沿用往期 · {it.reuse.month} {it.reuse.title}</figcaption></figure> : null}
        <a className="ref-slot is-add" href={href("marketing", "materials", "design")}><PixelIcon name="canvas" />去设计参考</a>
      </div>
      {it.kind === "price" && <Tag tone="neutral">价格来自生效中的价格方案</Tag>}
    </div>
  );
}
