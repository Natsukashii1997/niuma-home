import { Fragment, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiRead, apiSend } from "../../api.js";
import { Button, DateInput, Modal, NodeCheck, Segmented } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { draftOf, mmdd, moveStage } from "./mentor-path.js";

// 带教 · 培养路径的四个写操作（用户 2026-10-26）：添加带教对象、按方案生成路径、调整安排、记录进度。
// 都走「预览 → 确认 → 回读」：回读重新取 GET /api/v3/mentor/path，这个人的路径和预览里的 view 完全一致才算保存；只写工作台本地。
export const PATH_API = "/api/v3/mentor/path";
const enc = encodeURIComponent;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const STATUS = { done: "已完成", doing: "进行中", todo: "未开始" };
const RESULT = { pass: "通过", retest: "限期复核", fail: "不通过" };
const dText = ([a, b]) => (a === b ? `D${a}` : `D${a}–D${b}`);
const stagesOf = (path) => path.lines.flatMap((l) => l.stages);
export const recordText = (r) => (r.kind === "review" ? `${r.score} 分 · ${RESULT[r.result]} · ${r.at}` : `确认完成 · ${r.at}`);

// 预览 → 确认 → 回读：确认后重新读整页数据，按名字找到这个人的路径和预览比对
function useSave(name, onSaved) {
  const flow = useWriteFlow();
  const confirm = (url, text, target = name) => flow.confirm((pv) => apiSend("POST", url, { previewId: pv.previewId, confirm: true }), async (receipt, pv) => {
    const fresh = await apiRead(PATH_API);
    if (!same(fresh.trainees.find((t) => t.name === target)?.path, pv.view)) return false;
    onSaved(fresh, text(pv), target);
    return true;
  });
  const reread = async () => { const fresh = await apiRead(PATH_API); flow.resolve(); onSaved(fresh, null); };
  return { flow, confirm, reread, locked: flow.busy || flow.phase === "unknown" };
}

function Foot({ problem, locked, onClose, onPreview, label = "预览", extra }) {
  return (
    <div className="mpath-form-foot">
      <span className={`small ${problem ? "mpath-warn" : "muted"}`}>{problem ?? "预览确认后才保存；只存工作台本地"}</span>
      <span className="spacer" />
      {extra}
      <Button onClick={onClose} disabled={locked}>取消</Button>
      <Button variant="primary" onClick={onPreview} disabled={Boolean(problem) || locked}><PixelIcon name="eye" />{label}</Button>
    </div>
  );
}

// 排期一览：添加对象和生成路径的预览共用
function Schedule({ view }) {
  const reviews = stagesOf(view).filter((s) => s.review);
  const cur = view.lines.map((l) => l.stages.find((s) => s.status === "doing")).filter(Boolean);
  return <>
    <dt>方案</dt><dd>{view.plan.name} · 合格 {view.pass} 分 · 带教 {view.reviewer}</dd>
    <dt>排期</dt><dd className="tnum">{view.start} 入职（D1）→ D{view.days} 结业（{view.end}）；按工作日算，跳过法定节假日、调休上班日照常算</dd>
    <dt>评审</dt><dd className="tnum">{reviews.map((s) => `D${s.d[1]} ${s.review}（${mmdd(s.dates[1])}）`).join("、")}</dd>
    <dt>今天</dt><dd className="tnum">{view.todayD < 1 ? `还没入职（${view.start} 是 D1）` : `D${view.todayD}`}{view.todayD >= 1 && cur.map((s) => `；${s.id} ${s.short}${s.late ? `，超出计划 ${s.late} 个工作日` : ""}`).join("")}</dd>
    {view.missingYears.length > 0 && <><dt>注意</dt><dd className="mpath-warn">节假日表没有 {view.missingYears.join("、")} 年的数据，这段日子只跳过周末</dd></>}
  </>;
}

/* ---------- 添加带教对象 ---------- */

export function AddTrainee({ plans, today, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", role: "管培生", start: today, logUrl: "", plan: plans[0]?.id ?? "" });
  const { flow, confirm, reread, locked } = useSave(f.name.trim(), onSaved);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); flow.reset(); };
  const problem = !f.name.trim() ? "要填姓名" : !f.role.trim() ? "要填岗位" : !f.start ? "要填入职日" : f.logUrl.trim() && !/^https?:\/\/\S+$/.test(f.logUrl.trim()) ? "日志链接要以 http:// 或 https:// 开头" : null;
  const preview = () => flow.preview(() => apiSend("POST", `${PATH_API}/trainees/preview`, { ...f, name: f.name.trim(), role: f.role.trim(), logUrl: f.logUrl.trim() }));
  return (
    <Modal open onClose={onClose} icon="plus" title="添加带教对象">
      <div className="mpath-form">
        <div className="mpath-form-grid">
          <label className="field"><span>姓名</span><input value={f.name} maxLength={20} disabled={locked} onChange={(e) => set("name", e.target.value)} /></label>
          <label className="field"><span>岗位</span><input value={f.role} maxLength={20} disabled={locked} onChange={(e) => set("role", e.target.value)} /></label>
          <label className="field"><span>入职日（D1）</span><DateInput value={f.start} disabled={locked} onChange={(v) => set("start", v)} /></label>
          <label className="field"><span>培养方案</span><select value={f.plan} disabled={locked} onChange={(e) => set("plan", e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="field is-wide"><span>日志链接（可不填；不填就不进带教答疑）</span><input value={f.logUrl} maxLength={500} placeholder="飞书日志文档链接" disabled={locked} onChange={(e) => set("logUrl", e.target.value)} /></label>
        </div>
        <Foot problem={problem} locked={locked} onClose={onClose} onPreview={preview} />
        <WriteBox flow={flow} title="添加预览" confirmLabel="确认添加" onConfirm={() => confirm(`${PATH_API}/trainees`, (pv) => `已添加 ${pv.entry.name}，回读核对一致`, f.name.trim())} onRepreview={preview} onReread={reread}>
          {(pv) => <dl className="kv mpath-kv">
            <dt>写到哪里</dt><dd>工作台本地 · 带教名单新增一人，并生成这个人的培养路径</dd>
            <dt>名单</dt><dd>{pv.entry.name} · {pv.entry.role} · {pv.entry.url ? "有日志链接，进带教答疑" : "没有日志链接，不进带教答疑"}</dd>
            <Schedule view={pv.view} />
          </dl>}
        </WriteBox>
      </div>
    </Modal>
  );
}

/* ---------- 按方案生成路径（名单里有人但没有路径，或还是旧版按周的路径） ---------- */

export function GeneratePath({ trainee, plans, today, onClose, onSaved }) {
  const [f, setF] = useState({ start: today, plan: plans[0]?.id ?? "" });
  const { flow, confirm, reread, locked } = useSave(trainee.name, onSaved);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); flow.reset(); };
  const base = `${PATH_API}/${enc(trainee.name)}/generate`;
  const preview = () => flow.preview(() => apiSend("POST", `${base}/preview`, f));
  return (
    <Modal open onClose={onClose} icon="route" title={`按方案生成路径 · ${trainee.name}`}>
      <div className="mpath-form">
        <div className="mpath-form-grid">
          <label className="field"><span>入职日（D1）</span><DateInput value={f.start} disabled={locked} onChange={(v) => set("start", v)} /></label>
          <label className="field"><span>培养方案</span><select value={f.plan} disabled={locked} onChange={(e) => set("plan", e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div>
        <Foot problem={f.start ? null : "要填入职日"} locked={locked} onClose={onClose} onPreview={preview} />
        <WriteBox flow={flow} title="生成预览" confirmLabel="确认生成" onConfirm={() => confirm(base, () => `已为 ${trainee.name} 生成培养路径，回读核对一致`)} onRepreview={preview} onReread={reread}>
          {(pv) => <dl className="kv mpath-kv">
            <dt>写到哪里</dt><dd>工作台本地 · {trainee.name}的培养路径{trainee.legacy ? "（替换旧版按周的路径）" : ""}；进度记录不动</dd>
            <Schedule view={pv.view} />
            {pv.orphans.length > 0 && <><dt>对不上</dt><dd className="mpath-warn">{pv.orphans.join("、")} 的旧进度记录在新方案里没有对应的段，页面上不再显示</dd></>}
          </dl>}
        </WriteBox>
      </div>
    </Modal>
  );
}

/* ---------- 记录进度：评审段记分数和结论，其余段确认完成；可以撤销 ---------- */

export function RecordStage({ name, s, pass, today, onClose, onSaved }) {
  const r = s.record, isReview = Boolean(s.review);
  const [f, setF] = useState(() => ({ score: r?.score ?? "", result: r?.result ?? "pass", at: r?.at ?? today, note: r?.note ?? "" }));
  const [clear, setClear] = useState(false);
  const { flow, confirm, reread, locked } = useSave(name, onSaved);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); flow.reset(); };
  const score = /^\d{1,3}$/.test(String(f.score).trim()) ? Number(f.score) : null;
  const problem = isReview && (score == null || score > 100) ? "分数要是 0–100 的整数"
    : isReview && f.result === "pass" && score < pass ? `「通过」要达到 ${pass} 分`
    : !f.at ? "要填日期" : f.at > today ? "日期不能晚于今天" : null;
  const base = `${PATH_API}/${enc(name)}/stages/${enc(s.id)}/record`;
  const body = () => (isReview ? { kind: "review", score, result: f.result, at: f.at, note: f.note } : { kind: "complete", at: f.at, note: f.note });
  const preview = (undo = false) => { setClear(undo); flow.preview(() => apiSend("POST", `${base}/preview`, undo ? { clear: true } : body())); };
  const done = (pv) => { const now = stagesOf(pv.view).find((x) => x.id === s.id); return now.record ? `已记录 ${s.id}：${recordText(now.record)}，回读核对一致` : `已撤销 ${s.id} 的记录，回读核对一致`; };
  return (
    <Modal open onClose={onClose} icon="edit" title={`记录进度 · ${s.id} ${s.title}`}>
      <div className="mpath-form">
        <p className="small muted">{isReview ? `${s.review}：合格标准 ${s.pass}` : "这一段不设评审，由带教确认完成"}{r && ` · 现有记录：${recordText(r)}`}</p>
        <div className="mpath-form-grid">
          {isReview && <label className="field"><span>分数（0–100）</span><input inputMode="numeric" value={f.score} disabled={locked} onChange={(e) => set("score", e.target.value)} /></label>}
          {isReview && <div className="field"><span>结论（{pass} 分合格）</span><Segmented options={Object.entries(RESULT)} value={f.result} onChange={(v) => !locked && set("result", v)} /></div>}
          <label className="field"><span>{isReview ? "评审日期" : "完成日期"}</span><DateInput value={f.at} max={today} disabled={locked} onChange={(v) => set("at", v)} /></label>
          <label className="field is-wide"><span>备注（可不填，200 字内）</span><input value={f.note} maxLength={200} disabled={locked} onChange={(e) => set("note", e.target.value)} /></label>
        </div>
        <Foot problem={problem} locked={locked} onClose={onClose} onPreview={() => preview(false)} label={isReview ? "预览评审" : "预览确认完成"}
          extra={r && <Button onClick={() => preview(true)} disabled={locked}>撤销这条记录</Button>} />
        <WriteBox flow={flow} title={clear ? "撤销预览" : "记录预览"} confirmLabel={clear ? "确认撤销" : "确认记录"} onConfirm={() => confirm(base, done)} onRepreview={() => preview(clear)} onReread={reread}>
          {(pv) => {
            const now = stagesOf(pv.view).find((x) => x.id === s.id).record;
            return <dl className="kv mpath-kv">
              <dt>写到哪里</dt><dd>工作台本地 · {name}的培养路径 · {s.id} {s.title}</dd>
              <dt>记录</dt><dd>{r && <span className="diff-old">{recordText(r)}</span>}{r && " → "}<b>{now ? recordText(now) : "没有记录"}</b>{now?.note && <span className="muted"> · {now.note}</span>}</dd>
              <dt>状态</dt><dd>{pv.effects.length ? pv.effects.map((e) => `${e.id} ${e.title}：${STATUS[e.from]} → ${STATUS[e.to]}`).join("；") : "不变"}</dd>
            </dl>;
          }}
        </WriteBox>
      </div>
    </Modal>
  );
}

/* ---------- 调整安排：入职日、各段起止（止日推后时后面的段默认一起顺延）、目标 / 安排 / 产出文字 ---------- */

export function EditPlan({ name, path, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => draftOf(path));
  const [cascade, setCascade] = useState(true);
  const [open, setOpen] = useState(null);   // 展开改文字的段
  const { flow, confirm, reread, locked } = useSave(name, onSaved);
  const change = (next) => { setDraft(next); flow.reset(); };
  const patch = (id, fn) => change({ ...draft, lines: draft.lines.map((l) => ({ ...l, stages: l.stages.map((x) => (x.id === id ? fn(x) : x)) })) });
  const was = Object.fromEntries(stagesOf(path).map((s) => [s.id, s]));
  // 日期按现在的日历算；改了入职日或超出现有日历的，预览时由后端算
  const day = (d) => (draft.start === path.start && path.calendar[d - 1] ? mmdd(path.calendar[d - 1]) : "");
  const dayText = ([a, b]) => (!day(a) || !day(b) ? "预览后显示日期" : a === b ? day(a) : `${day(a)} – ${day(b)}`);
  const bad = draft.lines.flatMap((l) => l.stages).find((x) => !(x.d[0] >= 1 && x.d[0] <= x.d[1]));
  const problem = !draft.start ? "要填入职日" : bad ? `${bad.id} 的起止不对：起要在止之前，都从 D1 起算` : same(draft, draftOf(path)) ? "还没有改动" : null;
  const preview = () => flow.preview(() => apiSend("POST", `${PATH_API}/${enc(name)}/plan/preview`, draft));
  return (
    <Modal open onClose={onClose} wide icon="calendar" title={`调整安排 · ${name}`}>
      <div className="mpath-form">
        <div className="mpath-form-head">
          <label className="field"><span>入职日（D1）</span><DateInput value={draft.start} disabled={locked} onChange={(v) => change({ ...draft, start: v })} /></label>
          <label className="mpath-check"><NodeCheck checked={cascade} onChange={(e) => setCascade(e.target.checked)} label="后面的段一起顺延" />改某段的止日时，后面开始的段（两条线）一起顺延或提前</label>
        </div>
        <table className="mpath-plan">
          <thead><tr><th>编号</th><th>阶段</th><th>起</th><th>止</th><th>日期</th><th /></tr></thead>
          {draft.lines.map((l, li) => (
            <tbody key={l.key}>
              <tr className="is-line"><td colSpan={6}>{li ? "技术线" : "业务线"}</td></tr>
              {l.stages.map((x) => {
                const moved = !same(x.d, was[x.id].d), wordy = open === x.id;
                return (
                  <Fragment key={x.id}>
                    <tr className={moved ? "is-moved" : ""}>
                      <td><i className={`mpath-id${li ? " is-ai" : ""}`}>{x.id}</i></td>
                      <td>{x.title}{x.review && <span className="small muted"> · {x.review}</span>}</td>
                      {[0, 1].map((k) => <td key={k}><span className="mpath-d">D<DayInput value={x.d[k]} disabled={locked} label={`${x.id} ${k ? "止" : "起"}`} onCommit={(n) => change(moveStage(draft, x.id, k, n, cascade))} /></span></td>)}
                      <td className="mono small">{moved && <span className="diff-old">{dText(was[x.id].d)}</span>} {dayText(x.d)}</td>
                      <td><Button variant="xs" disabled={locked} onClick={() => setOpen(wordy ? null : x.id)}>{wordy ? "收起" : "改文字"}</Button></td>
                    </tr>
                    {wordy && <tr className="is-words"><td /><td colSpan={5}>
                      <label className="field"><span>目标</span><textarea rows={3} value={x.goal} maxLength={300} disabled={locked} onChange={(e) => patch(x.id, (y) => ({ ...y, goal: e.target.value }))} /></label>
                      {x.steps.map((st, k) => <label key={k} className="field"><span>安排 {st.d ? dText(st.d) : ""}</span><input value={st.text} maxLength={60} disabled={locked} onChange={(e) => patch(x.id, (y) => ({ ...y, steps: y.steps.map((z, j) => (j === k ? { ...z, text: e.target.value } : z)) }))} /></label>)}
                      <label className="field"><span>产出（一行一条）</span><textarea rows={Math.max(2, x.out.length)} value={x.out.join("\n")} disabled={locked} onChange={(e) => patch(x.id, (y) => ({ ...y, out: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) }))} /></label>
                    </td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          ))}
        </table>
        <Foot problem={problem} locked={locked} onClose={onClose} onPreview={preview} />
        <WriteBox flow={flow} title="调整预览" confirmLabel="确认调整" onConfirm={() => confirm(`${PATH_API}/${enc(name)}/plan`, (pv) => `已调整 ${name}的安排，结业 ${pv.endAfter}，回读核对一致`)} onRepreview={preview} onReread={reread}>
          {(pv) => {
            const now = Object.fromEntries(stagesOf(pv.view).map((s) => [s.id, s]));
            return <dl className="kv mpath-kv">
              <dt>写到哪里</dt><dd>工作台本地 · {name}的培养路径；进度记录不动</dd>
              {pv.startChanged && <><dt>入职日</dt><dd className="tnum"><span className="diff-old">{path.start}</span> → <b>{pv.view.start}</b></dd></>}
              <dt>挪了日期</dt><dd className="tnum mpath-kv-list">{pv.moved.length ? pv.moved.map((id) => <span key={id}>{id} <span className="diff-old">{dText(was[id].d)}</span> → <b>{dText(now[id].d)}</b>（{mmdd(now[id].dates[0])}{now[id].d[1] > now[id].d[0] && ` – ${mmdd(now[id].dates[1])}`}）</span>) : "没有"}</dd>
              <dt>改了文字</dt><dd>{pv.edited.length ? pv.edited.map((id) => `${id} ${now[id].short}`).join("、") : "没有"}</dd>
              <dt>结业</dt><dd className="tnum">{pv.endBefore === pv.endAfter ? pv.endAfter : <><span className="diff-old">{pv.endBefore}</span> → <b>{pv.endAfter}</b></>}（D{pv.view.days}）</dd>
            </dl>;
          }}
        </WriteBox>
      </div>
    </Modal>
  );
}

// 第几个工作日：离开输入框或按回车才提交（逐位输入的中间值不能触发顺延），Esc 还原
function DayInput({ value, onCommit, label, disabled }) {
  const [v, setV] = useState(String(value));
  const [was, setWas] = useState(value);
  if (was !== value) { setWas(value); setV(String(value)); }
  const commit = () => { const n = Number(v); if (/^\d{1,3}$/.test(v.trim()) && n >= 1 && n !== value) onCommit(n); else setV(String(value)); };
  return <input className="set-input" inputMode="numeric" value={v} disabled={disabled} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setV(String(value)); }} />;
}
