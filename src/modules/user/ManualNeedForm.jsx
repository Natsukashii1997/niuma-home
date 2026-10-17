import { useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend } from "../../api.js";
import { Button } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";

// 手写主线需求：只有「需求」必填；其余留空时由后端补「待确认」「手写」「本月全月」。以草稿进入列表，采纳流程照旧。
const NEED_FIELDS = [["seg", "学生分群", "如：英国 · 大一，留空为「待确认」", 50], ["node", "节点", "如：开学、Final，留空为「手写」", 50], ["when", "时间", "如：2026-11-03 → 2026-11-20，留空为本月全月", 60]];
// embedded：放在别的卡片里（如 Voice 话题详情）时不再套一层卡片。
export function ManualNeedForm({ month, initial = {}, voiceId, title = "手写主线需求", embedded = false, onSaved, onReread, onClose }) {
  const [f, setF] = useState({ seg: "", node: "", when: "", need: "", pain: "", todo: "", ...initial });
  const flow = useWriteFlow();
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); flow.reset(); };
  const locked = flow.busy || flow.phase === "unknown";
  const preview = () => flow.preview(() => apiSend("POST", "/api/v3/manual-needs/preview", { month, ...f, ...(voiceId && { voiceId }) }));
  const confirm = () => flow.confirm(
    (pv) => apiSend("POST", "/api/v3/manual-needs/confirm", { previewId: pv.previewId, confirm: true }),
    (receipt, pv) => onSaved(pv.value.need),
  );
  const reread = async () => { await onReread(); flow.resolve(); };
  const hint = `${month} · 先作为草稿进入主线需求，采纳后才能拆策略、关联促销`;
  const body = (
    <>
        <div className="create-grid">
          {NEED_FIELDS.map(([k, label, ph, max]) => <label key={k}><span className="label">{label}</span><input value={f[k]} onChange={set(k)} placeholder={ph} maxLength={max} disabled={locked} /></label>)}
          <label className="is-wide"><span className="label">需求（必填）</span><textarea className="review-box" value={f.need} onChange={set("need")} placeholder="学生这时候需要什么帮助" maxLength={500} disabled={locked} /></label>
          <label><span className="label">痛点</span><input value={f.pain} onChange={set("pain")} maxLength={500} disabled={locked} /></label>
          <label className="span-2"><span className="label">学生的待办</span><input value={f.todo} onChange={set("todo")} maxLength={500} disabled={locked} /></label>
        </div>
        <div className="row">
          <span className="small muted">{f.need.trim() ? "预览确认后才添加；只存工作台，不回写飞书" : "至少填写「需求」"}</span>
          <span className="spacer" />
          <Button onClick={onClose} disabled={locked}>取消</Button>
          <Button variant="primary" disabled={!f.need.trim() || locked} onClick={preview}><PixelIcon name="eye" />预览添加</Button>
        </div>
        <WriteBox flow={flow} title="添加需求草稿预览" confirmLabel="确认添加" onConfirm={confirm} onRepreview={preview} onReread={reread}>
          {(pv) => <dl className="kv">
            <dt>需求</dt><dd>{pv.value.need.need}</dd>
            <dt>分群 · 节点</dt><dd>{pv.value.need.seg} · {pv.value.need.node}</dd>
            <dt>时间</dt><dd className="tnum">{pv.value.need.when}</dd>
            {pv.value.need.pain && <><dt>痛点</dt><dd>{pv.value.need.pain}</dd></>}
            {pv.value.need.todo && <><dt>学生的待办</dt><dd>{pv.value.need.todo}</dd></>}
            <dt>来源</dt><dd>{pv.value.need.source}</dd>
            <dt>状态</dt><dd>草稿（采纳前不计入交付月完成数）</dd>
            <dt>写到哪里</dt><dd>工作台本地，{pv.value.month} 的主线需求</dd>
          </dl>}
        </WriteBox>
    </>
  );
  if (embedded) return <div className="manual-need is-embedded"><div className="label"><PixelIcon name="plus" />{title} · <span className="muted">{hint}</span></div>{body}</div>;
  return (
    <section className="card manual-need">
      <div className="card-head"><h2><PixelIcon name="plus" />{title}</h2><span className="small muted">{hint}</span></div>
      <div className="card-body">{body}</div>
    </section>
  );
}
