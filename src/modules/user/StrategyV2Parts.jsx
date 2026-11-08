import { Fragment, useState } from "react";
import { apiSend } from "../../api.js";
import { beijingTime } from "../../constants.js";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { Button, Loadable, Modal, Tag } from "../../ui/components.jsx";
import { WriteBox } from "../../ui/write-flow.jsx";
import { PLAY_BY_ID } from "./playbook-cards.js";
import { BIZCARD_FIELDS, BIZCARD_HINT, BIZ_RELATIONS, BIZ_TYPES, COUNTRY_NAME, MAIN_COUNTRIES, REGIONS, bizScope, bizScopeText, claimText, countChanges, diffDocs, isStale, legacyText, nextRevNo, revNo, rollbackSource, scopeMissingCount } from "./strategy-v2.js";

// v2 策略页的写入与留痕区块：第 3 节待确认提交、附 版本与留痕、存 旧版存档、业务背景卡。
// 写入一律「预览 → 确认 → 回读」：确认、拒绝、回退、背景卡都由常浩在页面明确确认，回读核对一致才算完成。
const API = "/api/v3/strategy-v2";
// 有写入在进行或结果不明时，其他写入入口一律锁住。
export const flowsLocked = (flows) => Object.values(flows).some((f) => f.busy || f.phase === "unknown");
const fail = (message) => Object.assign(new Error(message), { status: 422 });
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- 第 3 节：待确认提交 ---------- */
// 把预览接口的结果整理成页面要的三组：A 改动你写的内容、B 依据已变化、C 其他差异；另算拦截项。
export function reviewModel(p, base, evidenceById) {
  const doc = p.document, manual = p.manualChanges || [];
  const manualIds = new Set(manual.map((m) => m.id));
  const baseClaims = base?.claims || [];
  // 依据已变化的手写内容：确认时须常浩明确保留（keepStale），否则 422（I-06）。
  const flagged = new Set(p.changed || []);
  const staleManual = baseClaims.filter((c) => c.origin === "manual" && (flagged.has(c.id) || isStale(c, evidenceById)));
  const staleManualIds = new Set(staleManual.map((c) => c.id));
  // 旧判断依据已变化、提交把它移出或重写的（只作说明）。
  const docClaims = new Map(doc.claims.map((c) => [c.id, c]));
  const staleMoved = baseClaims.filter((c) => c.origin !== "manual" && isStale(c, evidenceById) && JSON.stringify(docClaims.get(c.id)) !== JSON.stringify(c))
    .map((c) => ({ c, after: docClaims.get(c.id) || null }));
  const others = diffDocs(base, doc, { omit: [...manualIds] });
  // 手写内容上的 I-06 可以靠「保留」解决，不算拦截。
  const blocking = (p.errors || []).filter((e) => !(e.rule === "I-06" && staleManualIds.has(e.at)));
  return { doc, manual, staleManual, staleMoved, others, blocking, counts: countChanges(others) };
}

export function SubmissionReview({ month, sub, pending, pick, pv, flows, revision, revs, ctx, onSaved, model }) {
  return (
    <>
      {pending.length > 1 && <div className="s2-subpick"><span className="label">待确认 {pending.length} 份</span>
        {pending.map((s) => <Button key={s.id} className={`btn btn-sm${s.id === sub.id ? " btn-primary" : ""}`} onClick={() => pick(s.id)}>{s.id}</Button>)}</div>}
      <Loadable state={pv} name="提交预览">{(p) => <ReviewBody key={sub.id} month={month} sub={sub} p={p} model={model} flows={flows} revision={revision} revs={revs} ctx={ctx} onSaved={onSaved} />}</Loadable>
    </>
  );
}

// 确认回读：正式稿内容与预览一致——非手写的判断、核心结论与提交相同；采纳的手写内容换成提交的新文，保留的仍是原文。
function confirmedAsPreviewed(content, { model: m, acceptManual }) {
  const manualIds = new Set(m.manual.map((x) => x.id));
  const plain = (list) => JSON.stringify(list.filter((c) => !manualIds.has(c.id)));
  if (plain(content.claims) !== plain(m.doc.claims) || JSON.stringify(content.brief) !== JSON.stringify(m.doc.brief)) return false;
  const byId = new Map(content.claims.map((c) => [c.id, c]));
  return m.manual.every((x) => (acceptManual.includes(x.id) ? JSON.stringify(byId.get(x.id) ?? null) === JSON.stringify(x.after) : byId.get(x.id)?.text === x.before.text));
}

function ReviewBody({ month, sub, p, model: m, flows, revision, revs, ctx, onSaved }) {
  const [choice, setChoice] = useState({}); // 手写内容：accept 采纳新文 / keep 保留原文
  const [keep, setKeep] = useState({}); // 依据已变化的手写内容：true = 保留
  const [reason, setReason] = useState("");
  const base = revision?.content;
  const next = nextRevNo(revs?.length);
  const needKeep = m.staleManual.filter((c) => choice[c.id] !== "accept");
  const undecided = m.manual.filter((x) => !choice[x.id]).length;
  const unkept = needKeep.filter((c) => !keep[c.id]).length;
  const locked = flowsLocked(flows);
  // 改了选择，旧的确认预览作废（STYLE-GUIDE 第 5 节「时效」）。
  const decide = (set, value) => { flows.confirm.reset(); set(value); };
  const canConfirm = !p.stale && !m.blocking.length && !undecided && !unkept && !locked;
  const hint = p.stale ? "提交已过期（基础版本、输入或 schema 已变化），不能确认；请让 skill 重新生成"
    : m.blocking.length ? `校验拦截 ${m.blocking.length} 条，不能确认`
    : undecided ? `先处理「改动你写的内容」${undecided} 条，才能确认`
    : unkept ? `先决定「依据已变化」的手写内容 ${unkept} 条是否保留`
    : `确认后进入「预览 → 确认 → 回读」，生成 ${next}`;

  const previewConfirm = () => { flows.reject.reset(); return flows.confirm.preview(async () => {
    const fresh = await apiSend("GET", `${API}/submissions/${sub.id}/preview`);
    if (fresh.submission.state !== "pending") throw fail(`这份提交已是 ${fresh.submission.state}，请重新读取`);
    if (fresh.stale) throw fail("提交已过期：基础版本、时间线输入或 schema 已变化，不能确认；请让 skill 重新生成后再预览");
    const fm = reviewModel(fresh, base, ctx.ev);
    if (fm.blocking.length) throw fail(`校验拦截 ${fm.blocking.length} 条，不能确认`);
    const acceptManual = fm.manual.filter((x) => choice[x.id] === "accept").map((x) => x.id);
    const keepStale = fm.staleManual.filter((c) => choice[c.id] !== "accept" && keep[c.id]).map((c) => c.id);
    return { model: fm, acceptManual, keepStale, kept: fm.manual.length - acceptManual.length };
  }); };
  const confirm = async () => {
    let made = null;
    const ok = await flows.confirm.confirm(
      (x) => apiSend("POST", `${API}/submissions/${sub.id}/confirm`, { confirm: true, acceptManual: x.acceptManual, keepStale: x.keepStale }),
      async (receipt, x) => { made = receipt.revision.id; const fresh = await apiSend("GET", `${API}?month=${month}`); return fresh.revision?.id === made && fresh.revision.submissionId === sub.id && confirmedAsPreviewed(fresh.revision.content, x); });
    if (ok) { flows.confirm.resolve(); onSaved(`已确认 ${sub.id}，生成 ${revNo(made)}，回读核对一致`); }
  };
  const previewReject = () => { flows.confirm.reset(); return flows.reject.preview(async () => {
    const fresh = await apiSend("GET", `${API}/submissions/${sub.id}/preview`);
    if (fresh.submission.state !== "pending") throw fail(`这份提交已是 ${fresh.submission.state}，请重新读取`);
    return { reason: reason.trim() };
  }); };
  const reject = async () => {
    const ok = await flows.reject.confirm((x) => apiSend("POST", `${API}/submissions/${sub.id}/reject`, { confirm: true, reason: x.reason }),
      async (receipt, x) => { const list = await apiSend("GET", `${API}/submissions?month=${month}`); const s = list.find((y) => y.id === sub.id); return s?.state === "rejected" && (s.rejectReason || "") === x.reason; });
    if (ok) { flows.reject.resolve(); onSaved(`已拒绝 ${sub.id}，正式版本不变，回读核对一致`); }
  };
  // 结果不明、或确认时提交已过期（过期的提交不能再预览）：都重新读取当前状态。
  const reread = (flow) => () => { flow.resolve(); onSaved(""); };

  const d = sub.declared || {};
  return (
    <div className="write-box s2-review">
      <div className="write-head"><PixelIcon name="alert" /><strong>{sub.id} · 确认后生成 {next}，当前 {revision ? revNo(revision.id) : "（尚无正式版本）"} 保持不变直到你确认</strong></div>
      <div className="s2-sub-top">
        <dl className="kv">
          <dt>提交编号</dt><dd className="mono">{sub.id}</dd>
          <dt>提交凭据</dt><dd><span className="mono">{sub.agent}</span> <span className="s2-decl">服务端按凭据记录</span></dd>
          <dt>执行方 · 模型</dt><dd>{d.executor || "未声明"} · <span className="mono">{d.model || "未声明"}</span> <span className="s2-decl">AI 自报，仅作声明{d.skillVersion ? ` · ${d.skillVersion}` : ""}</span></dd>
          <dt>提交时间</dt><dd className="tnum">{beijingTime(sub.submittedAt)}</dd>
          <dt>基于版本</dt><dd><span className="mono">{sub.baseRevision || "无"}</span>{p.stale ? <span className="s2-warn-text">（已不是当前正式版本或输入已变，提交已过期）</span> : "（与当前一致）"}</dd>
          <dt>Schema</dt><dd className="mono">{m.doc.schemaVersion}</dd>
        </dl>
        <div>
          <div className="s2-val"><span className="label">校验</span> <Tag tone={m.blocking.length ? "red" : "green"}>拦截 {m.blocking.length}</Tag> <Tag>提示 {p.warnings.length}</Tag>
            {(m.blocking.length > 0 || p.warnings.length > 0) && <ul className="us-items small">
              {m.blocking.map((e, i) => <li key={`e${i}`} className="s2-risk">{e.rule} · {e.at}：{e.message}</li>)}
              {p.warnings.slice(0, 8).map((e, i) => <li key={`w${i}`}>{e.rule} · {e.at}：{e.message}（提示，不拦截）</li>)}
              {p.warnings.length > 8 && <li className="muted">另有 {p.warnings.length - 8} 条提示</li>}
            </ul>}
          </div>
          <p className="small s2-sub-count">共 {m.counts.add} 处新增 · {m.counts.mod} 处修改 · {m.counts.del} 处删除 · 改动你写的 {m.manual.length} 条</p>
        </div>
      </div>

      <h4 className="s2-h4">A · 改动你写的内容 <span className="small muted">不会自动改写，逐条选</span></h4>
      {m.manual.length ? m.manual.map((x) => (
        <div key={x.id} className="s2-manual s2-chg">
          <div className="small muted">{x.id}{x.after ? "" : " · 提交删掉了这条"}</div>
          <div className="s2-mrow">
            <div><span className="label">你写的</span><p>{claimText(x.before)}</p></div>
            <div><span className="label">提交建议</span><p>{x.after ? <ins>{claimText(x.after)}</ins> : <del>删除这条</del>}</p></div>
            <div className="s2-choice" role="radiogroup" aria-label={`${x.id} 怎么处理`}>
              <label><input type="radio" name={`m-${x.id}`} checked={choice[x.id] === "accept"} onChange={() => decide(setChoice, { ...choice, [x.id]: "accept" })} disabled={locked} /> 采纳新文</label>
              <label><input type="radio" name={`m-${x.id}`} checked={choice[x.id] === "keep"} onChange={() => decide(setChoice, { ...choice, [x.id]: "keep" })} disabled={locked} /> 保留我写的原文</label>
            </div>
          </div>
        </div>
      )) : <p className="small muted">这份提交没有改动你写的内容。</p>}

      <h4 className="s2-h4">B · 依据已变化</h4>
      {needKeep.length || m.staleMoved.length ? <>
        {needKeep.map((c) => (
          <div key={c.id} className="s2-stale s2-chg is-del">
            <div className="small muted">{c.id} · 你写的，引用的证据版本已变</div>
            <p>{c.text}</p>
            <label className="s2-keep"><input type="checkbox" checked={Boolean(keep[c.id])} onChange={(e) => decide(setKeep, { ...keep, [c.id]: e.target.checked })} disabled={locked} /> 保留这条（正文不动，依据版本更新为当前）</label>
          </div>
        ))}
        {m.staleMoved.map(({ c, after }) => (
          <div key={c.id} className="s2-stale s2-chg is-del">
            <div className="small muted">{c.id} · 旧判断依据已变化，{after ? "提交已重写" : "提交已移出"}</div>
            <del>{claimText(c)}</del>{after && <><br /><ins>{claimText(after)}</ins></>}
          </div>
        ))}
      </> : <p className="small muted">没有依据已变化的内容。</p>}

      <h4 className="s2-h4">C · 其他差异 · {m.others.length} 处</h4>
      <DiffTable list={m.others} beforeLabel={`当前 ${revision ? revNo(revision.id) : "（无）"}`} afterLabel={`提交 ${sub.id}`} />

      <div className="write-actions s2-decision">
        <span className={`small s2-dec-hint${canConfirm ? "" : " muted"}`}>{hint}</span>
        <input className="s2-reason-input" value={reason} maxLength={200} onChange={(e) => { setReason(e.target.value); flows.reject.reset(); }} placeholder="拒绝原因（一句话，可空）" disabled={locked} aria-label="拒绝原因" />
        <Button className="btn btn-sm" onClick={previewReject} disabled={locked}>拒绝提交</Button>
        <Button className="btn btn-sm btn-primary" onClick={previewConfirm} disabled={!canConfirm}>确认并生成 {next}</Button>
      </div>
      <WriteBox flow={flows.confirm} title={`确认 ${sub.id} · 写入预览`} confirmLabel={`确认并生成 ${next}`} onConfirm={confirm} onRepreview={reread(flows.confirm)} onReread={reread(flows.confirm)}>
        {(x) => <dl className="kv">
          <dt>写入</dt><dd>新版本 {next}（不可修改；当前 {revision ? revNo(revision.id) : "无"} 保留在历史里）</dd>
          <dt>你写的</dt><dd>{x.model.manual.length ? `采纳新文 ${x.acceptManual.length} 条 · 保留原文 ${x.kept} 条` : "没有改动"}</dd>
          <dt>依据已变化</dt><dd>{x.keepStale.length ? `保留 ${x.keepStale.length} 条（依据版本更新为当前）` : "无需保留"}</dd>
          <dt>其他差异</dt><dd>新增 {x.model.counts.add} · 修改 {x.model.counts.mod} · 删除 {x.model.counts.del}</dd>
          <dt>其他提交</dt><dd>同月其余待确认提交会转为「已过期」</dd>
        </dl>}
      </WriteBox>
      <WriteBox flow={flows.reject} title={`拒绝 ${sub.id} · 预览`} confirmLabel="确认拒绝" onConfirm={reject} onRepreview={previewReject} onReread={reread(flows.reject)}>
        {(x) => <dl className="kv"><dt>结果</dt><dd>{sub.id} 标为「已拒绝」，正式版本 {revision ? revNo(revision.id) : "（无）"} 不变</dd><dt>原因</dt><dd>{x.reason || <span className="muted">未写</span>}</dd></dl>}
      </WriteBox>
    </div>
  );
}

const KIND = { add: ["新增", "orange"], mod: ["修改", "neutral"], del: ["删除", "red"] };
function DiffTable({ list, beforeLabel, afterLabel }) {
  if (!list.length) return <p className="small muted">没有其他差异。</p>;
  return (
    <div className="table-wrap">
      <table className="grid s2-diff">
        <thead><tr><th className="s2-diff-where">位置</th><th>{beforeLabel}</th><th>{afterLabel}</th></tr></thead>
        <tbody>{list.map((x, i) => (
          <tr key={i}>
            <td>{x.where} <Tag tone={KIND[x.kind][1]}>{KIND[x.kind][0]}</Tag></td>
            <td>{x.before ? <del>{x.before}</del> : <span className="muted">—</span>}</td>
            <td className={x.kind === "del" ? "" : `s2-chg${x.kind === "add" ? " is-add" : ""}`}>{x.after || <span className="muted">—</span>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ---------- 附：版本与留痕 ---------- */
const SUB_STATE = { pending: ["待确认", "amber"], confirmed: ["已确认", "green"], rejected: ["已拒绝", "red"], stale: ["已过期", "neutral"] };
export function Versions({ review, subs }) {
  const { month, revs = [], revision, flows, onSaved } = review;
  const bySub = Object.fromEntries(subs.map((s) => [s.id, s]));
  const [diff, setDiff] = useState(null); // { id, list } | { id, error }
  const locked = flowsLocked(flows);
  const showDiff = async (id) => {
    if (diff?.id === id) { setDiff(null); return; }
    try { const old = await apiSend("GET", `${API}/revisions/${id}`); setDiff({ id, list: diffDocs(old.content, revision.content) }); }
    catch (e) { setDiff({ id, error: e.message }); }
  };
  const [target, setTarget] = useState(null); // 回退预览挂在被点的那一行下面
  const previewRollback = (id) => { setTarget(id); flows.rollback.reset(); return flows.rollback.preview(async () => {
    const old = await apiSend("GET", `${API}/revisions/${id}`);
    const cur = await apiSend("GET", `${API}?month=${month}`);
    if (cur.revision?.id !== revision?.id) throw fail("正式版本已变化，请重新读取后再回退");
    return { id, old, list: diffDocs(revision.content, old.content), pending: cur.submissions.length };
  }); };
  const rollback = async () => {
    let from = null, made = null;
    const ok = await flows.rollback.confirm((x) => { from = x.id; return apiSend("POST", `${API}/${month}/rollback`, { confirm: true, revisionId: x.id }); },
      async (receipt) => { made = receipt.revision.id; const fresh = await apiSend("GET", `${API}?month=${month}`); return fresh.revision?.id === made && fresh.revision.confirmedFrom === `rollback:${from}`; });
    if (ok) { flows.rollback.resolve(); setDiff(null); onSaved(`已回退：${revNo(from)} 的内容写成新版本 ${revNo(made)}，回读核对一致`); }
  };
  const next = nextRevNo(revs.length);
  return (
    <>
      <h3 className="us-h3">版本</h3>
      {revs.length ? <div className="table-wrap"><table className="grid s2-vers">
        <thead><tr><th>版本</th><th>来源</th><th>执行方 · 模型（声明）</th><th>提交凭据</th><th>提交时间</th><th>确认时间 · 方式</th><th>时间线快照</th><th>对应提交</th><th /></tr></thead>
        <tbody>{revs.map((v) => { const s = bySub[v.submission_id], cur = v.id === revision?.id, back = rollbackSource(v.confirmed_from); return (
          <Fragment key={v.id}>
            <tr className={cur ? "is-cur" : ""}>
              <td className="s2-nowrap"><b className="mono">{revNo(v.id)}</b> {cur && <Tag tone="ink">当前</Tag>}<div className="s2-decl">{v.id}</div></td>
              <td>{back ? `回退自 ${revNo(back)}` : s ? "skill 提交" : <Tag tone="frame">{v.confirmed_from === "migration" ? "迁移" : v.confirmed_from || "人工"}</Tag>}</td>
              <td>{s ? <>{s.declared?.executor || "未声明"} · <span className="mono">{s.declared?.model || "未声明"}</span><div className="s2-decl">AI 自报，仅作声明{s.declared?.skillVersion ? ` · ${s.declared.skillVersion}` : ""}</div></> : "—"}</td>
              <td>{s ? <><span className="mono">{s.agent}</span><div className="s2-decl">服务端按凭据记录</div></> : "—"}</td>
              <td className="tnum">{s ? beijingTime(s.submittedAt) : "—"}</td>
              <td className="tnum">{beijingTime(v.created_at)}<div className="s2-decl">{v.confirmed_by || ""} · {back ? "回退" : s ? "页面确认" : v.confirmed_from || ""}</div></td>
              <td className="mono">{v.snapshot || "—"}</td>
              <td className="mono">{v.submission_id || "—"}</td>
              <td className="s2-nowrap">{cur ? <span className="muted small">—</span> : <>
                <Button className="btn btn-xs" onClick={() => showDiff(v.id)}>{diff?.id === v.id ? "收起差异" : "看差异"}</Button>{" "}
                <Button className="btn btn-xs" onClick={() => previewRollback(v.id)} disabled={locked}>回退到此版</Button></>}</td>
            </tr>
            {diff?.id === v.id && <tr className="s2-diff-row"><td colSpan={9}>
              {diff.error ? <span className="s2-risk small">差异读取失败：{diff.error}</span>
                : <><p className="small muted">从 {revNo(v.id)} 到当前 {revNo(revision.id)} 的变化</p><DiffTable list={diff.list} beforeLabel={revNo(v.id)} afterLabel={`当前 ${revNo(revision.id)}`} /></>}
            </td></tr>}
            {target === v.id && flows.rollback.phase !== "idle" && <tr className="s2-diff-row"><td colSpan={9}>
              <WriteBox flow={flows.rollback} title="回退 · 写入预览" confirmLabel={`确认回退并生成 ${next}`} onConfirm={rollback} onRepreview={() => previewRollback(target)} onReread={() => { flows.rollback.resolve(); onSaved(""); }}>
                {(x) => <>
                  <dl className="kv"><dt>写入</dt><dd>把 {revNo(x.id)} 的内容写成新版本 {next}；当前 {revNo(revision?.id)} 和全部历史保留，不改写</dd>
                    <dt>变化</dt><dd>{(() => { const c = countChanges(x.list); return `相对当前：新增 ${c.add} · 修改 ${c.mod} · 删除 ${c.del}`; })()}</dd>
                    {x.pending > 0 && <><dt>待确认提交</dt><dd className="s2-warn-text">同月 {x.pending} 份待确认提交会转为「已过期」</dd></>}</dl>
                  <DiffTable list={x.list.slice(0, 12)} beforeLabel={`当前 ${revNo(revision?.id)}`} afterLabel={`回退后（= ${revNo(x.id)}）`} />
                  {x.list.length > 12 && <p className="small muted">另有 {x.list.length - 12} 处</p>}
                </>}
              </WriteBox>
            </td></tr>}
          </Fragment>); })}</tbody>
      </table></div> : <p className="small muted">还没有正式版本。</p>}
      <h3 className="us-h3">提交记录</h3>
      {subs.length ? <div className="table-wrap"><table className="grid">
        <thead><tr><th>提交编号</th><th>状态</th><th>执行方 · 模型（声明）</th><th>凭据</th><th>提交时间</th><th>基于</th><th>结果</th></tr></thead>
        <tbody>{subs.map((s) => { const made = revs.find((v) => v.submission_id === s.id); return (
          <tr key={s.id}><td className="mono">{s.id}</td><td><Tag tone={SUB_STATE[s.state]?.[1]}>{SUB_STATE[s.state]?.[0] || s.state}</Tag></td>
            <td>{s.declared?.executor || "未声明"} · <span className="mono">{s.declared?.model || "未声明"}</span><div className="s2-decl">声明</div></td>
            <td className="mono">{s.agent}</td><td className="tnum">{beijingTime(s.submittedAt)}</td><td className="mono">{s.baseRevision ? revNo(s.baseRevision) : "无"}</td>
            <td>{s.state === "confirmed" ? <>生成 <b className="mono">{revNo(made?.id)}</b></> : s.state === "rejected" ? (s.rejectReason || <span className="muted">未写原因</span>) : s.state === "stale" ? "已过期（基础版本或输入已变化）" : "等你确认"}
              {s.decidedAt && <div className="s2-decl">{beijingTime(s.decidedAt)}</div>}</td></tr>); })}</tbody>
      </table></div> : <p className="small muted">本月还没有提交。</p>}
    </>
  );
}

/* ---------- 存：旧版存档（只读，docs/策略规则/04-迁移映射.md） ---------- */
const OPP_COLS = ["优先级", "机会", "地区", "业务线", "新签 / 续费", "窗口", "依据"];
const oppRow = (o) => (Array.isArray(o) ? o : [o.priority, o.name, o.region, o.line, o.kind || o.relation, o.window, o.rationale]);
const Items = ({ list }) => (list?.length ? <ul className="us-items">{list.map((t, i) => <li key={i}>{legacyText(t)}</li>)}</ul> : <p className="muted small">无</p>);
const KNOWN = new Set(["judgement", "opportunities", "regions", "promo"]);
export function LegacyArchive({ legacy }) {
  const regions = legacy.regions || {};
  // 先按六个地区排，迁移数据若保留了旧地区键（如 sg），排在后面照样显示。
  const order = [...REGIONS.filter(([k]) => regions[k]), ...Object.keys(regions).filter((k) => !REGIONS.some(([x]) => x === k)).map((k) => [k, COUNTRY_NAME[k] || k])];
  const extra = Object.keys(legacy).filter((k) => !KNOWN.has(k));
  return (
    <div className="s2-lg">
      <p className="s2-note"><PixelIcon name="lock" />迁移来的旧版内容。只读：不参与校验与匹配，不能修改。</p>
      {legacy.judgement && <div className="s2-lg-block"><h5 className="label">旧版核心结论</h5><p>{legacyText(legacy.judgement)}</p></div>}
      {legacy.opportunities?.length > 0 && <div className="s2-lg-block"><h5 className="label">旧版机会收敛（批 2 前暂存）</h5>
        <div className="table-wrap"><table className="grid"><thead><tr>{OPP_COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{legacy.opportunities.map((o, i) => <tr key={i}>{oppRow(o).map((x, j) => <td key={j} className={j === 5 ? "tnum" : ""}>{legacyText(x ?? "")}</td>)}</tr>)}</tbody></table></div></div>}
      {Object.keys(regions).length > 0 && <div className="s2-lg-block"><h5 className="label">旧版地区内容（用户节点 · 机会点 · 硕士关注）</h5>
        {order.map(([k, name]) => { const r = regions[k]; return (
          <div key={k} className="s2-lg-region">
            <div className="s2-lg-name"><b>{name}</b>{r.tier && <Tag tone="frame">旧分档 {legacyText(r.tier)}</Tag>}
              {r.tiers && Object.entries(r.tiers).map(([c, t]) => <span key={c} className="small"><Tag tone="frame">旧 {c} · {t?.value || "—"}</Tag> <span className="muted">{t?.reason}</span></span>)}</div>
            <div className="s2-lg-cols">
              <div><h5 className="label">用户节点</h5><Items list={r.node} /></div>
              <div><h5 className="label">地区机会点</h5><Items list={r.opp} /></div>
              <div><h5 className="label">硕士关注</h5><Items list={r.master} /></div>
            </div>
          </div>); })}</div>}
      <div className="s2-lg-block"><h5 className="label">旧版促销</h5><LegacyPromo promo={legacy.promo} /></div>
      {extra.map((k) => <div key={k} className="s2-lg-block"><h5 className="label">{k}</h5><p className="small s2-json">{JSON.stringify(legacy[k])}</p></div>)}
    </div>
  );
}
const playNames = (ids = []) => ids.map((id) => PLAY_BY_ID[id]?.name || id).join(" + ");
function LegacyPromo({ promo }) {
  if (!promo || typeof promo !== "object") return <p className="muted small">本月未生成，无存档。</p>;
  const lines = promo.promo?.lines || {};
  return (
    <dl className="kv">
      {promo.goal && <><dt>本月目标</dt><dd>{promo.goal}</dd></>}
      {promo.plays?.length > 0 && <><dt>核心打法</dt><dd>{promo.plays.map((x) => (Array.isArray(x) ? `${x[0]}：${x[1]}` : legacyText(x))).join("；")}</dd></>}
      {Object.entries(lines).map(([line, rows]) => <Fragment key={line}><dt>{line}</dt><dd>{rows.map(([role, ids]) => `${role} ${playNames(ids)}`).join("；")}</dd></Fragment>)}
      <dt>说明</dt><dd className="muted">旧促销与 v2 方案口径不同，不可比较</dd>
    </dl>
  );
}

/* ---------- 业务背景卡（docs/策略规则/07-业务背景卡.md）：先预览、后确认 ---------- */
const emptyCard = () => Object.fromEntries(BIZCARD_FIELDS.map((f) => [f, []]));
export function BizcardModal({ open, onClose, month, card, flow, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [moreCountries, setMoreCountries] = useState(() => new Set());
  const value = draft || { ...emptyCard(), ...structuredClone(card || {}) };
  const locked = flow.busy || flow.phase === "unknown" || flow.phase === "preview" || flow.phase === "confirming";
  const edit = (field, fn) => { flow.reset(); setDraft({ ...value, [field]: fn(value[field] || []) }); };
  const set = (field, i, patch) => edit(field, (l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const close = () => { setDraft(null); onClose(); };
  const body = () => Object.fromEntries(Object.entries(value).map(([f, list]) => [f, list.filter((e) => e.text?.trim()).map((e) => ({ ...(e.id && { id: e.id }), text: e.text.trim(), type: e.type, ...(e.basis?.trim() && { basis: e.basis.trim() }),
    ...(e.countries?.length && { countries: e.countries }), ...(e.relation && { relation: e.relation }) }))]).filter(([, list]) => list.length));
  const missing = scopeMissingCount(value);
  const preview = () => flow.preview(() => apiSend("POST", `${API}/${month}/bizcard/preview`, body()));
  const confirm = async () => {
    const ok = await flow.confirm((pv) => apiSend("POST", `${API}/${month}/bizcard/confirm`, { confirm: true, previewId: pv.previewId }),
      async (receipt, pv) => { const fresh = await apiSend("GET", `${API}?month=${month}`); return sameJson(fresh.bizcard, pv.value); });
    if (ok) { flow.resolve(); setDraft(null); onClose(); onSaved(`${month} 业务背景卡已保存，回读核对一致`); }
  };
  return (
    <Modal open={open} onClose={close} title={`${month} 业务背景卡`} icon="edit" wide
      footer={!locked && <><span className="small muted spacer">每个字段都可以留空；事实记录须写出处；适用范围可不填，不填按范围不明</span><Button onClick={close}>取消</Button><Button variant="primary" onClick={preview}>预览</Button></>}>
      <p className="small muted s2-biz-intro">时间线之外唯一的业务证据来源。条目进入系统后成为 business 类证据：事实记录 = 强，业务观察 = 中，管理判断 = 弱（只当待检验的假设）。购买判断（障碍、购买准备度）只用适用范围对得上情境的事实记录和业务观察。缺「存量用户情况」时续费判断一律未知；缺「用户观察」时痛点只能是典型困难。</p>
      {missing > 0 && <p className="warn s2-biz-warn"><b>{missing} 条事实记录 / 业务观察还没填适用范围</b><span>引用它们的障碍和购买准备度最高只到「推断 · 弱」。补上国家和人群后，下次研判才能用。</span></p>}
      {BIZCARD_FIELDS.map((field) => (
        <section key={field} className="s2-biz-field">
          <div className="s2-biz-head"><b>{field}</b><span className="small muted">{BIZCARD_HINT[field]}</span>
            <Button className="btn btn-xs" onClick={() => edit(field, (l) => [...l, { text: "", type: "业务观察", basis: "" }])} disabled={locked}><PixelIcon name="plus" />加一条</Button></div>
          {(value[field] || []).length === 0 && <p className="small muted">未填写</p>}
          {(value[field] || []).map((e, i) => { const key = e.id || `${field}-n${i}`, scope = bizScope(e), countries = e.countries || [];
            const shown = moreCountries.has(key) ? Object.keys(COUNTRY_NAME) : [...MAIN_COUNTRIES, ...countries.filter((c) => !MAIN_COUNTRIES.includes(c))];
            return (
            <div key={key} className="s2-biz-row">
              <textarea rows={2} value={e.text} placeholder="一句话写清内容" onChange={(ev) => edit(field, (l) => l.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))} disabled={locked} aria-label={`${field} 第 ${i + 1} 条`} />
              <select value={e.type} onChange={(ev) => edit(field, (l) => l.map((x, j) => (j === i ? { ...x, type: ev.target.value } : x)))} disabled={locked} aria-label="证据类型">{BIZ_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <input value={e.basis || ""} placeholder={e.type === "事实记录" ? "记录出处（必填）" : "依据或来源（可空）"} onChange={(ev) => edit(field, (l) => l.map((x, j) => (j === i ? { ...x, basis: ev.target.value } : x)))} disabled={locked} aria-label="依据" />
              <button type="button" className="icon-btn" onClick={() => edit(field, (l) => l.filter((_, j) => j !== i))} disabled={locked} aria-label="删除这条"><PixelIcon name="close" /></button>
              <div className="s2-biz-scope">
                <span className="label">适用范围</span>
                <span className="s2-biz-chips" role="group" aria-label="适用国家">
                  {shown.map((c) => { const on = countries.includes(c);
                    return <button key={c} type="button" className={`chip${on ? " is-on" : ""}`} aria-pressed={on} title={`${COUNTRY_NAME[c]}（${c}）`} disabled={locked}
                      onClick={() => set(field, i, { countries: on ? countries.filter((x) => x !== c) : [...countries, c] })}>{COUNTRY_NAME[c] || c}</button>; })}
                  {!moreCountries.has(key) && <button type="button" className="chip s2-biz-more" disabled={locked} onClick={() => setMoreCountries((m) => new Set([...m, key]))}>其他国家…</button>}
                </span>
                <span className="s2-biz-sep" />
                <div className="segmented" role="group" aria-label="适用人群">
                  {BIZ_RELATIONS.map((r) => <button key={r} type="button" className={e.relation === r ? "active" : ""} aria-pressed={e.relation === r} disabled={locked}
                    onClick={() => set(field, i, { relation: e.relation === r ? "" : r })}>{r}</button>)}
                </div>
                <span className="s2-biz-state">{scope.state === "ok" ? <Tag tone="green">已填 · 对得上的情境可用</Tag>
                  : scope.state === "missing" ? <span title="引用它的障碍和购买准备度最高推断 · 弱"><Tag tone="amber">{scope.text} · 最高推断·弱</Tag></span>
                  : <span className="small muted">管理判断：范围可不填</span>}</span>
              </div>
            </div>
          ); })}
        </section>
      ))}
      <WriteBox flow={flow} title="背景卡 · 保存预览" confirmLabel="确认保存" onConfirm={confirm} onRepreview={preview} onReread={() => { flow.resolve(); setDraft(null); onClose(); onSaved(""); }}>
        {(pv) => <BizcardDiff before={pv.before} after={pv.value} />}
      </WriteBox>
    </Modal>
  );
}
function BizcardDiff({ before, after }) {
  const rows = BIZCARD_FIELDS.map((f) => [f, before?.[f] || [], after?.[f] || []]).filter(([, b, a]) => JSON.stringify(b) !== JSON.stringify(a));
  if (!rows.length) return <p className="small muted">和当前保存的内容相同，没有改动。</p>;
  const line = (e) => { const scope = bizScopeText(e); return `${e.text}（${e.type}${e.basis ? ` · ${e.basis}` : ""}${scope ? ` · 范围 ${scope}` : ""}）`; };
  return <dl className="kv">{rows.map(([f, b, a]) => <Fragment key={f}><dt>{f}</dt><dd>
    {b.filter((x) => !a.some((y) => y.id === x.id)).map((x) => <div key={x.id}><del>{line(x)}</del></div>)}
    {a.map((x) => { const old = b.find((y) => y.id === x.id); return old && JSON.stringify(old) === JSON.stringify(x) ? <div key={x.id} className="muted">{line(x)}</div>
      : <div key={x.id}>{old && <><del>{line(old)}</del><br /></>}<ins className="s2-ins">{line(x)}</ins> <Tag tone={old ? "neutral" : "orange"}>{old ? "改" : "新"}</Tag></div>; })}
  </dd></Fragment>)}</dl>;
}
