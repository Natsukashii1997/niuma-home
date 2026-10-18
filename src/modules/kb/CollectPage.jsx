import { useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiRead, apiSend, useApi } from "../../api.js";
import { Button, Card, Loadable, Tag } from "../../ui/components.jsx";

// 知识库快捷收藏（T12）：粘贴飞书文档链接，点「收藏」就在「常浩的知识库」一级目录下建一个指向原文的快捷方式；原文不移动、不复制。
// 用户 2026-10-18 确认这一项点击即收藏，不走预览确认；但只写一次、不自动重试、写后回读，结果不明时锁住，只能只读核对。
// 平时在 Chrome 里用扩展「牛马之家 · 收藏」：飞书文档页右下角的按钮，调同一个接口。

const DOC_PATH = /^\/(wiki|docx|sheets|base|slides|mindnotes|file)\/[A-Za-z0-9]+/;
const REASON = { chosen: "按你选的目录", matched: "按关键词命中", first: "命中多个目录，取规则表里排最前的", fallback: "没命中关键词，放兜底目录" };

// 本地先挡掉明显不是飞书文档的链接（后端还会再校验一次）。
function checkLink(text) {
  let u;
  try { u = new URL(text.trim()); } catch { return { error: "这不是一个链接：请粘贴飞书文档的完整链接（https://…）" }; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || u.port || !(host.endsWith(".feishu.cn") || host.endsWith(".larksuite.com"))) return { error: "只收飞书文档链接（feishu.cn / larksuite.com 的 https 链接）" };
  if (!DOC_PATH.test(u.pathname)) return { error: "这个飞书链接不是文档：支持知识库、文档、表格、多维表格、幻灯片、思维笔记和文件" };
  return { url: u.href };
}

const rulesOf = (settings) => { try { const a = JSON.parse(settings?.values?.kb_collect_rules || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };

function timeText(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "时间未知" : d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function CollectPage() {
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  // { kind: "busy" | "created" | "duplicate" | "error" | "unknown", ... }
  const [res, setRes] = useState(null);
  const [check, setCheck] = useState("");
  const pending = useRef(null); // 结果不明且没有操作记录时（断网），保留同一个 requestId，重新查询不会重复创建
  const settings = useApi("/api/v3/settings");
  const rules = rulesOf(settings.data);
  const recent = useApi("/api/v3/kb/collect/recent");
  const locked = res?.kind === "busy" || res?.kind === "unknown";

  async function collect(req) {
    setCheck("");
    setRes({ kind: "busy" });
    let r;
    try { r = await apiSend("POST", "/api/v3/kb/collect", req); }
    catch (e) {
      // 断网、5xx、结果不明、上次未核对：锁住。有操作记录就只读核对；没有就保留 requestId 重新查询。
      if (e.receipt || !e.status || e.status >= 500 || e.code === "COLLECT_PENDING") {
        pending.current = e.receipt ? null : req;
        setRes({ kind: "unknown", error: e.message, receipt: e.receipt });
        return;
      }
      setRes({ kind: "error", error: e.message });
      return;
    }
    pending.current = null;
    // 回读：本地操作记录里同一条记录要标为成功（或已在库中），目录一致。
    try {
      const back = await apiRead("/api/v3/kb/collect/recent");
      recent.reload();
      const item = back.items?.find((x) => x.operationId === r.operationId);
      const ok = item && item.status === (r.status === "created" ? "ok" : "duplicate") && item.parentTitle === r.parentTitle;
      setRes(ok ? { kind: r.status, r } : { kind: "unknown", error: "已提交，但本地记录和返回结果不一致", receipt: { operationId: r.operationId } });
    } catch (e) {
      setRes({ kind: "unknown", error: `已提交，但回读失败：${e.message}`, receipt: { operationId: r.operationId } });
    }
  }
  const submit = () => {
    const c = checkLink(text);
    if (c.error) { setRes({ kind: "error", error: c.error, local: true }); return; }
    collect({ url: c.url, requestId: crypto.randomUUID(), ...(target ? { targetNodeToken: target } : {}) });
  };

  // 只读核对操作记录，绝不重新创建。id 不传时核对当前锁住的那一条。
  async function reconcile(id) {
    const opId = id || res?.receipt?.operationId;
    if (!opId) {
      // 没有操作记录（请求可能没到后端）：用同一个 requestId 再问一次，后端按 requestId 只执行一次。
      if (pending.current) { collect(pending.current); return; }
      setCheck("没有操作记录编号，无法自动核对；请到飞书「常浩的知识库」人工检查。工作台不会重试。");
      return;
    }
    setCheck("正在只读核对…");
    try {
      const r = await apiSend("POST", `/api/v3/kb/operations/${encodeURIComponent(opId)}/reconcile`, {});
      if (res?.kind === "unknown" && opId === res.receipt?.operationId) setRes(null);
      recent.reload();
      setCheck(r.state === "verified" ? "已核对：快捷方式已建好，指向原文档" : "已核对：没有建成快捷方式；需要的话再点一次收藏");
    } catch (e) { setCheck(`仍未能核实：${e.message}。保持锁定，不会重试。`); }
  }

  return (
    <div className="kb-collect">
      <Card title={<><PixelIcon name="star" />收藏一篇飞书文档</>} extra={<span className="small muted kb-collect-hint">在 Chrome 里，点飞书文档右下角的「收藏」也行</span>}>
        <div className="stack-sm">
          <form className="kb-collect-input" onSubmit={(e) => { e.preventDefault(); if (!locked) submit(); }}>
            <label className="search-box"><PixelIcon name="link" /><input value={text} onChange={(e) => { setText(e.target.value); if (!locked) setRes(null); }} placeholder="粘贴飞书文档链接" aria-label="飞书文档链接" /></label>
            <select className="kb-collect-target" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="收藏到哪个目录" disabled={locked}>
              <option value="">自动归类</option>
              {rules.map((r) => <option key={r.nodeToken} value={r.nodeToken}>{r.title}</option>)}
            </select>
            <Button variant="primary" type="submit" disabled={!text.trim() || locked}><PixelIcon name="star" />收藏</Button>
          </form>
          <p className="small muted">点「收藏」就在「常浩的知识库」对应目录下建快捷方式，原文不移动、不复制；只建一次，建完回读核对。</p>
          <Result res={res} onClose={() => setRes(null)} onReconcile={() => reconcile()} />
          {check && <p className={`small ${/仍未能|无法/.test(check) ? "warn-text" : "muted"}`}>{check}</p>}
        </div>
      </Card>
      <Recent state={recent} onReconcile={reconcile} locked={res?.kind === "busy"} />
    </div>
  );
}

function Result({ res, onClose, onReconcile }) {
  if (!res) return null;
  if (res.kind === "busy") return <div className="write-box"><StepProgress label="正在收藏并回读" /></div>;
  const close = <><span className="spacer" /><button type="button" className="link-btn" onClick={onClose}>关闭</button></>;
  if (res.kind === "created" || res.kind === "duplicate") {
    const { r } = res;
    return (
      <div className="write-box is-saved" role="status">
        <div className="write-head"><PixelIcon name="check" /><strong>{res.kind === "created" ? `已收藏到「${r.parentTitle}」，回读核对一致` : `已经在知识库里了：「${r.parentTitle}」`}</strong>{close}</div>
        <dl className="kv">
          <dt>原文档</dt><dd>{r.title}<Tag>{r.location}</Tag></dd>
          {res.kind === "created"
            ? <><dt>为什么放这</dt><dd>{REASON[r.reason] || r.reason}{r.matched?.length > 0 && <span className="small muted">（{r.matched.map((m) => `${m.title}：${m.keywords.join("、")}`).join("；")}）</span>}</dd></>
            : <><dt>说明</dt><dd>{r.duplicateKind === "inSpace" ? "原文就在知识库里" : "已有指向它的快捷方式"}，没有新建</dd></>}
        </dl>
        {r.url && <a className="small" href={r.url} target="_blank" rel="noreferrer"><PixelIcon name="external" />在飞书打开</a>}
      </div>
    );
  }
  if (res.kind === "unknown") return (
    <div className="write-box is-unknown" role="alert">
      <div className="write-head"><PixelIcon name="alert" /><strong>结果不明，已停止</strong></div>
      <p className="write-msg">{res.error}。不会自动重试，也不要重复点收藏；先核对实际是否已经建好。</p>
      {res.receipt && <p className="write-msg small">操作记录：{res.receipt.operationId || "已保存在本机"}</p>}
      <div className="write-actions"><Button variant="primary" onClick={onReconcile}><PixelIcon name="refresh" />{res.receipt ? "只读核对" : "重新查询结果"}</Button></div>
    </div>
  );
  return (
    <div className="write-box is-error" role="alert">
      <div className="write-head"><PixelIcon name="alert" /><strong>{res.local ? "链接不对" : "没有收藏"}</strong>{close}</div>
      <p className="write-msg">{res.error}</p>
    </div>
  );
}

const STATUS = { ok: ["green", "已收藏"], duplicate: ["neutral", "已在库中"], failed: ["red", "未收藏"] };
function Recent({ state, onReconcile, locked }) {
  return (
    <Card className="kb-collect-recent" title={<><PixelIcon name="clock" />最近收藏</>}>
      <Loadable state={state} name="最近收藏">{(d) => d.items.length ? (
        <ol className="list kb-recent">
          {d.items.map((x) => (
            <li key={x.operationId}>
              <span className="kb-recent-main">
                <span className="kb-recent-title">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : x.title}</span>
                <span className="small muted">{x.parentTitle ? `${x.parentTitle} · ` : ""}{timeText(x.at)}</span>
              </span>
              {x.status === "unknown"
                ? <><Tag tone="amber">结果不明</Tag><button type="button" className="link-btn" disabled={locked} onClick={() => onReconcile(x.operationId)}>只读核对</button></>
                : <Tag tone={(STATUS[x.status] || STATUS.failed)[0]}>{(STATUS[x.status] || STATUS.failed)[1]}</Tag>}
            </li>
          ))}
        </ol>
      ) : <p className="small muted">还没有收藏记录</p>}</Loadable>
    </Card>
  );
}
