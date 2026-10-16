import { useState } from "react";
import { PixelIcon, StepProgress, TypeText } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Loadable, Modal, MonthSwitch, SampleBadge, StatusMark, Tag, useToast } from "../../ui/components.jsx";
import Thumb from "../../ui/Thumb.jsx";
import { deliveryMonth } from "../../constants.js";
import { SAMPLE_BRIEF, SAMPLE_PHRASES } from "../../samples/v3.js";

// 设计 brief（v3）：按月写，骨架固定 7 节。背景、受众从主线需求带入，价格从价格方案带入，带入的地方标出来源。
// 左边目录一次只看一节（也可以「全部展开」），右边常驻文案助手和句式参考。
const SECTIONS = ["项目背景与目标", "目标受众", "项目时间线", "详细文案与框架", "交付物清单与规格", "负责人与审批", "附件"];

export default function BriefView() {
  const [month, setMonth] = useState(deliveryMonth());
  const state = useApi(`/api/v3/briefs/${month}`, SAMPLE_BRIEF);
  return <Loadable state={state}>{(brief) => <Brief key={month} brief={brief} month={month} setMonth={setMonth} sample={state.isSample ? state.task : null} />}</Loadable>;
}

const Source = ({ children }) => <span className="source-tag"><PixelIcon name="link" />{children}</span>;

function Brief({ brief, month, setMonth, sample }) {
  const [sec, setSec] = useState(4);
  const [all, setAll] = useState(false);
  const [exp, setExp] = useState(null);
  const [draft, setDraft] = useState(null);
  const [toast, showToast] = useToast();
  const done = Object.values(brief.status).filter((s) => s === "done").length;
  const show = (n) => all || sec === n;
  return (
    <>
      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} mark={month === deliveryMonth() ? "交付月" : ""} />
        <span className="small muted">{brief.version} · 最后编辑 {brief.editedAt} · 7 节完成 {done} 节</span>
        <span className="spacer" />
        {sample && <SampleBadge task={sample} />}
        <Button onClick={() => showToast("已复制 brief 全文（Markdown，可直接贴进飞书）")}><PixelIcon name="copy" />复制全文</Button>
        <Button variant="primary" onClick={() => setExp("preview")}><PixelIcon name="external" />导出飞书文档</Button>
      </div>
      <div className="brief-layout">
        <nav className="brief-outline" aria-label="章节">
          {SECTIONS.map((t, i) => (
            <button key={t} type="button" className={!all && sec === i + 1 ? "active" : ""} onClick={() => { setAll(false); setSec(i + 1); }}>
              <span className="tnum">{i + 1}</span><span>{t}</span><StatusMark state={brief.status[i + 1] || "todo"} />
            </button>
          ))}
          <button type="button" className={`outline-all${all ? " active" : ""}`} onClick={() => setAll((v) => !v)}><PixelIcon name="menu" />{all ? "只看当前一节" : "全部展开"}</button>
        </nav>

        <article className="doc">
          <span className="label">design brief · {month}</span>
          <h2>{brief.title}</h2>
          {show(1) && <section><h3><span className="tnum">1</span>项目背景与目标<Source>来自主线需求</Source></h3>
            <p contentEditable suppressContentEditableWarning className="editable">{brief.background.text}</p>
            <ol className="goals">{brief.background.goals.map((g) => <li key={g} contentEditable suppressContentEditableWarning className="editable">{g}</li>)}</ol></section>}
          {show(2) && <section><h3><span className="tnum">2</span>目标受众<Source>来自主线需求</Source></h3>
            <table className="grid compact"><thead><tr><th>物料</th><th>面向人群</th><th>当前状态与待办</th></tr></thead>
              <tbody>{brief.audience.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} contentEditable suppressContentEditableWarning className="editable">{c}</td>)}</tr>)}</tbody></table></section>}
          {show(3) && <section><h3><span className="tnum">3</span>项目时间线</h3>
            <table className="grid compact"><thead><tr><th>物料</th><th>交付时间</th><th>优先级</th><th>对接人</th><th>说明</th></tr></thead>
              <tbody>{brief.timeline.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="tnum">{r[1]}</td><td><Tag tone={r[2] === "P0" ? "orange" : "neutral"}>{r[2]}</Tag></td><td>@{r[3]}</td><td>{r[4]}</td></tr>)}</tbody></table></section>}
          {show(4) && <section><h3><span className="tnum">4</span>详细文案与框架</h3>
            {brief.items.map((it) => <BriefItem key={it.id} it={it} onAsk={() => setDraft(it.title)} />)}</section>}
          {show(5) && <section><h3><span className="tnum">5</span>交付物清单与规格</h3>
            <table className="grid compact"><thead><tr><th>物料</th><th>比例</th><th>尺寸</th><th>格式</th></tr></thead>
              <tbody>{brief.specs.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="tnum">{r[1]}</td><td className="tnum">{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table></section>}
          {show(6) && <section><h3><span className="tnum">6</span>负责人与审批</h3>
            <dl className="kv">{brief.owners.flatMap((r) => [<dt key={r[0]}>{r[0]}</dt>, <dd key={`${r[0]}-v`}>{r[1]}{r[2] && <span className="signal small"> · {r[2]}</span>}</dd>])}</dl></section>}
          {show(7) && <section><h3><span className="tnum">7</span>附件</h3><div className="dashed-drop"><PixelIcon name="upload" />拖入附件，或从 NAS 选择</div></section>}
          {!all && (
            <div className="doc-pager">
              <Button disabled={sec === 1} onClick={() => setSec(sec - 1)}><PixelIcon name="left" />{sec > 1 ? SECTIONS[sec - 2] : "上一节"}</Button>
              <Button disabled={sec === 7} onClick={() => setSec(sec + 1)}>{sec < 7 ? SECTIONS[sec] : "下一节"}<PixelIcon name="right" /></Button>
            </div>
          )}
        </article>

        <aside className="brief-rail">
          <section className="card">
            <div className="card-head"><h2><PixelIcon name="agent" />文案助手</h2><a className="link" href={href("assistants")}>知识库</a></div>
            <div className="card-body stack-sm">
              {draft ? <div className="ai-box"><span className="label"><PixelIcon name="spark" />{draft} · 草稿</span>
                <TypeText key={draft} text={draft.includes("九宫格") ? "P5 留给「冲分」大字；P9 写「11.30 前，把 6 小时用在最该补的那门课」，配二维码和「先排一次考试日程」。" : "主标题「3,990 元 5 小时，课时单价不到 800」，副标题写赠课：「10 小时送 1 小时，送的是课时」。"} />
                <div className="row"><Button className="btn btn-xs" onClick={() => showToast("已插入到当前段落（示例，未写入）")}>插入</Button><button type="button" className="link-btn" onClick={() => setDraft(null)}>丢弃</button></div></div>
                : <p className="small muted">在第 4 节的物料上点「让助手起草」，草稿会出现在这里，确认后再插入。</p>}
              <div className="label">句式参考 · 点击复制</div>
              {SAMPLE_PHRASES.map(([k, t]) => <button type="button" key={k} className="phrase" onClick={() => showToast(`已复制：${t}`)}><span className="label">{k}</span>{t}</button>)}
            </div>
          </section>
        </aside>
      </div>
      <Modal open={!!exp} onClose={() => setExp(null)} icon="external" title="导出飞书文档 · 预览"
        footer={<><Button onClick={() => setExp(null)}>取消</Button><Button variant="primary" disabled={exp === "run"} onClick={() => setExp("run")}>确认导出</Button></>}>
        <dl className="kv">
          <dt>目标位置</dt><dd>常浩的知识库 / 01 营销月档案 /</dd>
          <dt>文档名</dt><dd>{month} 设计 brief · 双11 冲分节</dd>
          <dt>内容</dt><dd>7 节 · {brief.items.length} 个物料 · 参考图以图片插入</dd>
          <dt>方式</dt><dd>只新建，不覆盖已有文档；写完回读核对章节标题</dd>
        </dl>
        {exp === "run" && <div style={{ marginTop: 16 }}><StepProgress label="写入飞书（示例）" /></div>}
      </Modal>
      {toast}
    </>
  );
}

function BriefItem({ it, onAsk }) {
  if (it.kind === "skip") return <div className="brief-item"><h4>{it.title}</h4><div className="dashed-drop"><PixelIcon name="close" />{it.note}</div></div>;
  return (
    <div className="brief-item">
      <h4>{it.title}{it.priceFrom && <Source>{it.priceFrom}</Source>}<span className="spacer" /><button type="button" className="link-btn" onClick={onAsk}><PixelIcon name="spark" />让助手起草</button></h4>
      {it.blocks && (
        <table className="grid compact brief-blocks"><thead><tr><th>涉及板块</th><th>内容</th><th>说明 · 示例</th></tr></thead>
          <tbody>{it.blocks.map((b) => <tr key={b[0]}><td className="k">{b[0]}</td><td contentEditable suppressContentEditableWarning className="editable">{b[1]}</td><td contentEditable suppressContentEditableWarning className="editable muted">{b[2]}</td></tr>)}</tbody></table>
      )}
      {it.cells && (
        <div className="p9">
          {[0, 1, 2].map((i) => <Cell key={i} n={i} text={it.cells[i]} />)}
          <div className="p9-cell span3"><b>P4–P6 · 横跨三格</b><span contentEditable suppressContentEditableWarning className="editable">{it.cells[3]}</span></div>
          {[6, 7, 8].map((i) => <Cell key={i} n={i} text={it.cells[i]} />)}
        </div>
      )}
      <div className="ref-strip">
        {it.refs.map((r) => <figure key={r.title} className="ref-slot"><Thumb kind={r.kind} big={r.big} title={r.title} accent={r.accent} /><figcaption>参考 · {r.title}</figcaption></figure>)}
        {it.reuse ? <figure className="ref-slot is-reuse"><Thumb kind="poster" big={it.reuse.big} title={it.reuse.title} /><figcaption>沿用往期 · {it.reuse.month} {it.reuse.title}</figcaption></figure>
          : <a className="ref-slot is-add" href={href("marketing", "materials")}><PixelIcon name="plus" />从物料墙选择沿用</a>}
        <a className="ref-slot is-add" href={href("marketing", "materials", "refs")}><PixelIcon name="canvas" />从设计参考添加</a>
      </div>
    </div>
  );
}

function Cell({ n, text }) {
  return <div className={`p9-cell${text ? "" : " is-empty"}`}><b>P{n + 1}</b><span contentEditable suppressContentEditableWarning className="editable">{text || "待写"}</span></div>;
}
