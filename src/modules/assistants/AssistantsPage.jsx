import { useEffect, useRef, useState } from "react";
import { BitAvatar, PixelIcon, StepProgress, TypeText } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Empty, Loadable, PageHeader, SampleBadge, Segmented, Tag, useToast } from "../../ui/components.jsx";
import { SAMPLE_KNOWLEDGE } from "../../samples/v3.js";
import { consumeMessageStream } from "./message-stream.js";
import ModelControls from "./ModelControls.jsx";
import { assistantListReader } from "./assistant-list.js";

const KIND_LABEL = { copywriter: "文案", imported: "Codex 导入", custom: "自建" };
const STARTERS = ["给 11 月价格图写 3 个主标题，突出「送课时不是降价」", "把这段方案改写成发给业务的私信话术", "按 brief 的 P1–P9 结构，起草冲分节九宫格文案"];

// 知识库（v3）：只收文字；新建会话时全量带入助手指令，超过阈值提示改为检索。接口未实现时显示示例。
function KnowledgePanel({ assistant }) {
  const state = useApi(`/api/v3/assistants/${assistant.id}/knowledge`, SAMPLE_KNOWLEDGE);
  const [toast, showToast] = useToast();
  return <div className="kb-panel"><Loadable state={state}>{(kb) => {
    const total = kb.docs.reduce((n, d) => n + d.chars, 0);
    return <>
      <div className="row kb-meter"><span className="label">知识量</span><span className="tnum">{total.toLocaleString()} / {kb.limit.toLocaleString()} 字</span><span className="small muted">新建会话时全量带入；改动后新会话生效</span><span className="spacer" />{state.isSample && <SampleBadge task={state.task} />}</div>
      <span className="dither-bar"><span className="dither-bar-fill" style={{ width: `${Math.min(100, (total / kb.limit) * 100)}%` }} /></span>
      <label className="drop-zone"><PixelIcon name="upload" />拖入或选择文字文件（.md / .txt / .docx），也可以直接粘贴<input type="file" hidden accept=".md,.txt,.docx" onChange={() => showToast("已加入知识库（示例，未写入）")} /></label>
      <table className="grid compact"><thead><tr><th>类型</th><th>标题</th><th className="r">字数</th><th>加入时间</th><th /></tr></thead>
        <tbody>{kb.docs.map((d) => <tr key={d.title}><td><Tag tone={d.kind === "brief 范本" ? "blue" : "neutral"}>{d.kind}</Tag></td><td>{d.title}</td><td className="r">{d.chars.toLocaleString()}</td><td className="tnum small muted">{d.at}</td><td><button type="button" className="icon-btn" title="移除" onClick={() => showToast(`已移除「${d.title}」（示例）`)}><PixelIcon name="close" /></button></td></tr>)}</tbody></table>
      {toast}
    </>;
  }}</Loadable></div>;
}
export default function AssistantsPage({ route }) {
  const state = useApi("/api/assistants");
  return <Loadable state={state}>{(list) => <AssistantDesk initial={list} selectedId={route[0]} />}</Loadable>;
}
function AssistantDesk({ initial, selectedId }) {
  const [list, setList] = useState(initial), [modal, setModal] = useState(null);
  const current = list.find((a) => String(a.id) === selectedId) || list[0];
  const [reload] = useState(() => assistantListReader(() => apiSend("GET", "/api/assistants"), setList));
  const saved = async (id) => { await reload(); setModal(null); if (id) window.location.hash = href("assistants", String(id)).slice(1); };
  return <div className="assistant-page">
    <PageHeader title="Agent" subtitle="本机 Codex · 只读，不改文件、不执行命令" actions={<>
      <Button onClick={() => setModal({ type: "import" })}><PixelIcon name="download" /> 导入 Codex 会话</Button>
      <Button variant="primary" onClick={() => setModal({ type: "new" })}><PixelIcon name="plus" /> 新建助手</Button>
    </>} />
    <div className="chat-layout">
      <aside className="chat-list" aria-label="助手列表">{list.map((a) => <a key={a.id} data-dither="" href={href("assistants", String(a.id))} className={a.id === current?.id ? "active" : ""}><BitAvatar seed={a.name} /><strong>{a.name}</strong><Tag>{KIND_LABEL[a.kind]}</Tag></a>)}</aside>
      {current && <Conversation key={current.id} assistant={current} reloadAssistants={reload} edit={() => setModal({ type: "edit", assistant: current })} />}
    </div>
    {modal && <AssistantDialog key={`${modal.type}-${modal.assistant?.id || ""}`} modal={modal} close={() => setModal(null)} saved={saved} reload={reload} />}
  </div>;
}
function Conversation({ assistant, edit, reloadAssistants }) {
  const [messages, setMessages] = useState([]), [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [settingsBlocked, setSettingsBlocked] = useState(true), [runtimeVersion, setRuntimeVersion] = useState(0);
  const [tab, setTab] = useState("chat"), [modelOpen, setModelOpen] = useState(false);
  const lock = useRef(false), controller = useRef(null), bottom = useRef(null);
  const read = async () => apiSend("GET", `/api/assistants/${assistant.id}/messages`);
  useEffect(() => {
    let live = true;
    read().then((rows) => { if (live) setMessages(rows); }, (e) => { if (live) { setError(e.message); setUncertain(true); } }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.current?.abort(); };
  }, [assistant.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages, pending]);
  const reload = async () => {
    if (lock.current) return;
    lock.current = true; setLoading(true);
    try { setMessages(await read()); setPending(null); setUncertain(false); setError(""); }
    catch (e) { setError(e.message); setUncertain(true); }
    finally { setLoading(false); lock.current = false; }
  };
  const send = async () => {
    if (lock.current || loading || uncertain || settingsBlocked || !draft.trim()) return;
    lock.current = true; setBusy(true); setError("");
    const text = draft.trim(); const abort = new AbortController(); controller.current = abort;
    setPending({ text, replies: [] });
    try {
      const response = await fetch(`/api/assistants/${assistant.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: abort.signal });
      await consumeMessageStream(response, (event, data) => {
        if (event !== "delta") return;
        setPending((old) => {
          const replies = [...old.replies], index = replies.findIndex((r) => r.id === data.itemId);
          if (index < 0) replies.push({ id: data.itemId, text: data.text });
          else replies[index] = { ...replies[index], text: replies[index].text + data.text };
          return { ...old, replies };
        });
      });
      setMessages(await read()); setPending(null); setDraft("");
    } catch (e) { setError(`${e.message}。输入已保留，请先重新读取历史核对，避免重复发送。`); setUncertain(true); }
    finally { lock.current = false; setBusy(false); controller.current = null; setRuntimeVersion((n) => n + 1); }
  };
  return <section className="chat-panel" aria-label={`${assistant.name}对话`}>
    <header className="chat-head"><div className="row"><BitAvatar seed={assistant.name} /><strong>{assistant.name}</strong><Tag>只读</Tag></div>
      <div className="row">
        <Segmented options={[["chat", "对话"], ["kb", "知识库"]]} value={tab} onChange={setTab} />
        <Button aria-expanded={modelOpen} onClick={() => setModelOpen((v) => !v)}><PixelIcon name="settings" />{assistant.model || "默认模型"}{assistant.effort ? ` · ${assistant.effort}` : ""}</Button>
        <Button disabled={busy} onClick={edit}><PixelIcon name="edit" />编辑</Button>
      </div></header>
    <div className={modelOpen ? "model-panel is-open" : "model-panel"}><ModelControls assistant={assistant} busy={busy} version={runtimeVersion} reloadAssistants={reloadAssistants} onBlocked={setSettingsBlocked} /></div>
    {tab === "kb" ? <KnowledgePanel assistant={assistant} /> : <>
    <div className="chat-messages" aria-busy={busy || loading}>
      {loading && <p className="muted">正在读取历史…</p>}
      {!loading && !messages.length && !pending && <div className="chat-starters"><p className="muted small">常用开场，点一下填进输入框：</p>{STARTERS.map((t) => <button key={t} type="button" className="phrase" onClick={() => setDraft(t)}>{t}</button>)}</div>}
      {messages.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
      {pending && <><div className="bubble user">{pending.text}</div>{(pending.replies.length ? pending.replies : [{ text: "" }]).map((m, i) => <div key={i} className="bubble assistant"><TypeText text={m.text} streaming={busy && i === Math.max(0, pending.replies.length - 1)} onReveal={() => bottom.current?.scrollIntoView({ block: "nearest" })} /></div>)}</>}
      <div ref={bottom} />
    </div>
    {busy && pending && !pending.replies.length && <div className="assistant-wait"><StepProgress label="等待回复首字" /></div>}
    <div className="assistant-status" role="status">{busy ? "Codex 正在回复…" : "Enter 发送 · Shift+Enter 换行"}</div>
    {error && <div className="assistant-status"><p className="error" role="alert">{error}</p><Button disabled={busy || loading} onClick={reload}>重新读取历史</Button></div>}
    <footer className="chat-input"><textarea aria-label="消息" placeholder="输入消息，确认后发送" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} maxLength={50000} rows={3} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); } }} /><Button variant="primary" disabled={busy || loading || uncertain || settingsBlocked || !draft.trim()} onClick={send}><PixelIcon name="send" /> 发送</Button></footer>
    </>}
  </section>;
}
function AssistantDialog({ modal, close, saved, reload }) {
  const importing = modal.type === "import", editing = modal.type === "edit";
  const [name, setName] = useState(modal.assistant?.name || ""), [instructions, setInstructions] = useState(modal.assistant?.instructions || "");
  const [sessions, setSessions] = useState([]), [selected, setSelected] = useState([]), [search, setSearch] = useState("");
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(importing), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false);
  const dialog = useRef(null), lock = useRef(false);
  useEffect(() => { const node = dialog.current; node.showModal(); return () => node.close(); }, []);
  useEffect(() => { if (!importing) return; let live = true; apiSend("GET", "/api/codex/sessions").then((rows) => { if (live) setSessions(rows); }, (e) => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [importing]);
  const confirm = async () => {
    if (lock.current || uncertain) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = importing ? await apiSend("POST", "/api/assistants/import", { threadIds: selected }) : await apiSend(editing ? "PATCH" : "POST", editing ? `/api/assistants/${modal.assistant.id}` : "/api/assistants", { name: name.trim(), instructions });
      const rows = await reload();
      const expected = importing ? result : [result];
      if (!expected.every((item) => rows.some((row) => row.id === item.id && row.name === item.name && row.instructions === item.instructions))) throw new Error("保存结果与回读不一致");
      await saved(expected[0]?.id);
    } catch (e) { setError(`${e.message}。结果尚未确认，请重新读取助手列表核对。`); setUncertain(true); }
    finally { lock.current = false; setBusy(false); }
  };
  const recover = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { await reload(); close(); } catch (e) { setError(`重新读取失败：${e.message}`); }
    finally { lock.current = false; setBusy(false); }
  };
  const title = importing ? "导入 Codex 会话" : editing ? "编辑助手" : "新建助手";
  return <dialog ref={dialog} className="material-dialog assistant-dialog" aria-labelledby="assistant-dialog-title" onCancel={(e) => { e.preventDefault(); if (!busy) close(); }}>
    <div className="chat-head"><h2 id="assistant-dialog-title">{title}</h2><Button disabled={busy} onClick={close}>关闭</Button></div>
    <form className="assistant-form" onSubmit={(e) => { e.preventDefault(); setPreview(true); setError(""); }}>
      <fieldset className="material-fields" disabled={busy || uncertain || preview}>
        {importing ? <><label className="material-field" htmlFor="session-search">筛选会话名称<input id="session-search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          {loading ? <p className="muted">正在读取本机会话…</p> : <div className="assistant-sessions">{sessions.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())).map((s) => <label key={s.threadId} className="assistant-session" data-dither=""><input type="checkbox" disabled={s.imported} checked={selected.includes(s.threadId)} onChange={(e) => { setSelected((old) => e.target.checked ? [...old, s.threadId] : old.filter((id) => id !== s.threadId)); }} /><span><strong>{s.name}</strong>{s.imported && <Tag>已导入</Tag>}<small>{new Date(s.updatedAt).toLocaleString("zh-CN")} · {s.cwd}</small></span></label>)}</div>}
          {!loading && !sessions.length && !error && <Empty>没有可导入的已命名会话。</Empty>}
        </> : <><label className="material-field" htmlFor="assistant-name">名称<input id="assistant-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="material-field" htmlFor="assistant-instructions">预设说明<textarea id="assistant-instructions" rows={6} maxLength={20000} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label></>}
      </fieldset>
      <p className="muted small">{importing ? "仅导入会话关联；历史仍由 Codex 保存。被其他 Codex 客户端占用时无法续聊，请先在原客户端结束占用。" : "预设说明仅在该助手首次创建 Codex 会话时传入；修改不会改变已有会话，也不会清空历史。"}</p>
      {preview && <div className="settings-preview"><h3 className="section-title">{importing ? "导入预览" : "保存预览"}</h3>{importing ? sessions.filter((s) => selected.includes(s.threadId)).map((s) => <p key={s.threadId}>{s.name}<br /><span className="muted small">{s.cwd}</span></p>) : <><strong>{name.trim()}</strong><pre className="pre">{instructions || "（预设说明为空）"}</pre></>}</div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">{uncertain ? <Button type="button" disabled={busy} onClick={recover}>重新读取助手列表</Button> : preview ? <><Button type="button" disabled={busy} onClick={() => setPreview(false)}>返回修改</Button><Button type="button" variant="primary" disabled={busy} onClick={confirm}>{importing ? "确认导入" : "确认保存"}</Button></> : <Button type="submit" variant="primary" disabled={loading || (importing ? !selected.length : !name.trim())}>{importing ? "预览导入" : "预览保存"}</Button>}</div>
      {busy && <p className="muted" role="status">正在保存并回读…</p>}
    </form>
  </dialog>;
}
