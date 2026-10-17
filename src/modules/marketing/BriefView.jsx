import { useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Loadable, MonthSwitch, SampleBadge, StatusMark, Tag, useToast } from "../../ui/components.jsx";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { BriefAttachments } from "./BriefAttachments.jsx";
import { FeishuExport } from "../../ui/feishu-export.jsx";
import Thumb from "../../ui/Thumb.jsx";
import { deliveryMonth } from "../../constants.js";
import { SAMPLE_PHRASES } from "../../samples/v3.js";
import { briefPatch, briefText } from "./brief-edit.js";

// 设计 brief（v3）：按月写，骨架固定 7 节。背景、受众从已采纳的主线需求带入，价格从生效中的价格方案带入（演示价格不带入）。
// 页面上直接改文字和表格；改动先攒在页面里，点「预览保存」生成预览，确认后保存到工作台并回读核对。你改过的字段以后不会被自动覆盖。
// 导出飞书只新建文档：预览写清目标文件夹、标题和全文，确认后才创建。
const SECTIONS = ["项目背景与目标", "目标受众", "项目时间线", "详细文案与框架", "交付物清单与规格", "负责人与审批", "附件"];
const STATUS = [["todo", "待写"], ["part", "写了一部分"], ["done", "完成"]];
const TABLES = {
  audience: { sec: 2, cols: ["物料", "面向人群", "当前状态与待办"] },
  timeline: { sec: 3, cols: ["物料", "交付时间", "优先级", "对接人", "说明"] },
  specs: { sec: 5, cols: ["物料", "比例", "尺寸", "格式"] },
  owners: { sec: 6, cols: ["角色", "负责人", "状态"] },
};

export default function BriefView() {
  const [month, setMonth] = useState(deliveryMonth());
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
  const [all, setAll] = useState(false);
  const [draft, setDraft] = useState(() => structuredClone(brief));
  const [toast, showToast] = useToast();
  const flow = useWriteFlow();
  const patch = briefPatch(brief, draft);
  const changed = Object.keys(patch);
  const edit = (fn) => { if (flow.busy || flow.phase === "unknown") return; setDraft((d) => { const n = structuredClone(d); fn(n); return n; }); flow.reset(); onEdit(); };
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
        <MonthSwitch month={month} onChange={(m) => { if (!changed.length || confirm_(`${month} 有 ${changed.length} 处改动还没保存，切换月份会丢掉。继续？`)) setMonth(m); }} mark={month === deliveryMonth() ? "交付月" : ""} />
        <span className="small muted">{brief.version} · {brief.editedAt ? `最后保存 ${brief.editedAt}` : "还没保存过"} · 7 节完成 {done} 节</span>
        <span className="spacer" />
        <Button onClick={() => copy(briefText(draft), " brief 全文")}><PixelIcon name="copy" />复制全文</Button>
        <Button variant="primary" disabled={!changed.length || flow.busy || flow.phase === "unknown"} onClick={preview}><PixelIcon name="eye" />预览保存{changed.length ? `（${changed.length} 处）` : ""}</Button>
      </div>
      <WriteBox flow={flow} title="brief 保存预览" onConfirm={confirm} onRepreview={preview} onReread={reread}>
        {(pv) => <dl className="kv">
          <dt>月份</dt><dd className="tnum">{month} · 保存后版本 {pv.value.version}</dd>
          <dt>改动</dt><dd>{changed.map((k) => FIELD_LABEL[k] || k).join("、")}</dd>
          <dt>写到哪里</dt><dd>工作台本地；改过的字段以后不会被需求或价格自动覆盖</dd>
        </dl>}
      </WriteBox>
      <div className="brief-layout">
        <nav className="brief-outline" aria-label="章节">
          {SECTIONS.map((t, i) => (
            <button key={t} type="button" className={!all && sec === i + 1 ? "active" : ""} onClick={() => { setAll(false); setSec(i + 1); }}>
              <span className="tnum">{i + 1}</span><span>{t}</span><StatusMark state={draft.status[i + 1] || "todo"} />
            </button>
          ))}
          <button type="button" className={`outline-all${all ? " active" : ""}`} onClick={() => setAll((v) => !v)}><PixelIcon name="menu" />{all ? "只看当前一节" : "全部展开"}</button>
        </nav>

        <article className="doc">
          <span className="label">design brief · {month}</span>
          <h2><Text value={draft.title} onChange={(v) => edit((d) => { d.title = v; })} placeholder="标题" className="is-title" /></h2>
          {show(1) && <section>{head(1, draft.background.from && <Source>来自 {draft.background.from}</Source>)}
            <Text value={draft.background.text} onChange={(v) => edit((d) => { d.background.text = v; })} placeholder="背景：交付月要解决什么问题（已采纳的主线需求会带入这里）" />
            <ol className="goals">{draft.background.goals.map((g, k) => <li key={k}><Text value={g} onChange={(v) => edit((d) => { d.background.goals[k] = v; })} /><button type="button" className="icon-btn" title="删掉这条目标" onClick={() => edit((d) => { d.background.goals.splice(k, 1); })}><PixelIcon name="close" /></button></li>)}</ol>
            <button type="button" className="link-btn" onClick={() => edit((d) => { d.background.goals.push(""); })}><PixelIcon name="plus" />加一条目标</button></section>}
          {Object.entries(TABLES).map(([key, t]) => show(t.sec) && (
            <section key={key}>{head(t.sec)}
              <RowsTable cols={t.cols} rows={draft[key]} onChange={(fn) => edit((d) => fn(d[key]))} />
            </section>
          )).slice(0, 2)}
          {show(4) && <section>{head(4)}
            {!draft.items.length ? <p className="small muted">没有带入的物料：交付月还没有已采纳的主线需求，或没有生效中的真实价格方案（演示价格不会带入）。</p>
              : draft.items.map((it, k) => <BriefItem key={it.id} it={it} onChange={(fn) => edit((d) => fn(d.items[k]))} />)}</section>}
          {Object.entries(TABLES).map(([key, t]) => show(t.sec) && (
            <section key={key}>{head(t.sec)}
              <RowsTable cols={t.cols} rows={draft[key]} onChange={(fn) => edit((d) => fn(d[key]))} />
            </section>
          )).slice(2)}
          {show(7) && <section>{head(7)}<BriefAttachments month={month} /></section>}
          {!all && (
            <div className="doc-pager">
              <Button disabled={sec === 1} onClick={() => setSec(sec - 1)}><PixelIcon name="left" />{sec > 1 ? SECTIONS[sec - 2] : "上一节"}</Button>
              <Button disabled={sec === 7} onClick={() => setSec(sec + 1)}>{sec < 7 ? SECTIONS[sec] : "下一节"}<PixelIcon name="right" /></Button>
            </div>
          )}
          <div className="doc-export">
            <FeishuExport key={month} what=" brief " disabled={changed.length > 0} disabledNote="有改动还没保存：先保存，导出的是已保存的版本"
              previewPath={`/api/v3/briefs/${month}/export-preview`} confirmPath={`/api/v3/briefs/${month}/export`} statusBase={`/api/v3/briefs/${month}/exports`} />
            {changed.length > 0 && <span className="small muted">有改动还没保存；导出的是已保存的版本，先保存再导出。</span>}
          </div>
        </article>

        <aside className="brief-rail">
          <section className="card">
            <div className="card-head"><h2><PixelIcon name="agent" />文案助手</h2><a className="link" href={href("assistants")}>去对话</a></div>
            <div className="card-body stack-sm">
              <p className="small muted">需要起草时去 Agent 页和文案助手对话，确认后的文字再贴回对应段落。这里不自动生成。</p>
              <div className="label">句式参考 · 点击复制 <SampleBadge /></div>
              <p className="small muted">演示句式，不是知识库里沉淀的内容。</p>
              {SAMPLE_PHRASES.map(([k, t]) => <button type="button" key={k} className="phrase" onClick={() => copy(t, `：${t}`)}><span className="label">{k}</span>{t}</button>)}
            </div>
          </section>
        </aside>
      </div>
      {toast}
    </>
  );
}

const FIELD_LABEL = { title: "标题", background: "项目背景与目标", audience: "目标受众", timeline: "项目时间线", items: "详细文案与框架", specs: "交付物清单与规格", owners: "负责人与审批", status: "各节状态" };
const confirm_ = (text) => window.confirm(text);

function RowsTable({ cols, rows, onChange }) {
  return (
    <>
      <table className="grid compact brief-table">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}<th aria-label="操作" /></tr></thead>
        <tbody>
          {!rows.length && <tr><td colSpan={cols.length + 1} className="muted small">还没有内容</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}><Text value={c} placeholder="" onChange={(v) => onChange((list) => { list[i][j] = v; })} /></td>)}
              <td className="row-del"><button type="button" className="icon-btn" title="删掉这一行" onClick={() => onChange((list) => { list.splice(i, 1); })}><PixelIcon name="close" /></button></td></tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="link-btn" onClick={() => onChange((list) => { list.push(cols.map(() => "")); })}><PixelIcon name="plus" />加一行</button>
    </>
  );
}

function BriefItem({ it, onChange }) {
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
        <a className="ref-slot is-add" href={href("marketing", "materials", "refs")}><PixelIcon name="canvas" />去设计参考</a>
      </div>
      {it.kind === "price" && <Tag tone="neutral">价格来自生效中的价格方案</Tag>}
    </div>
  );
}
