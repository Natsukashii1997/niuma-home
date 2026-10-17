import { useEffect, useRef, useState } from "react";
import { apiSend } from "../../api.js";
import { Button } from "../../ui/components.jsx";

// 强度说明来自 Codex（英文），界面上用中文短说明，原文放在悬停提示里。
const EFFORT_ZH = { minimal: "最快", low: "快速", medium: "均衡", high: "深入推理", xhigh: "最深推理" };

export default function ModelControls({ assistant, busy, version, reloadAssistants, onBlocked }) {
  const [models, setModels] = useState(null), [listError, setListError] = useState("");
  const [choice, setChoice] = useState({ model: assistant.model, effort: assistant.effort });
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [runtime, setRuntime] = useState(undefined), [runtimeError, setRuntimeError] = useState("");
  const [retry, setRetry] = useState(0), [runtimeRetry, setRuntimeRetry] = useState(0);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setChoice({ model: assistant.model, effort: assistant.effort }); }, [assistant.model, assistant.effort]);
  useEffect(() => {
    let live = true; setListError(""); setModels(null);
    apiSend("GET", "/api/codex/models").then((rows) => { if (live) setModels(rows); }, (e) => { if (live) setListError(e.message); });
    return () => { live = false; };
  }, [retry]);
  useEffect(() => {
    let live = true;
    if (!busy) {
      setRuntimeError(""); setRuntime(undefined);
      apiSend("GET", `/api/assistants/${assistant.id}/runtime`).then((value) => { if (live) setRuntime(value); }, (e) => { if (live) setRuntimeError(e.message); });
    }
    return () => { live = false; };
  }, [assistant.id, busy, version, runtimeRetry]);
  const selected = models?.find((m) => m.model === choice.model);
  const unavailable = !!(models && choice.model && !selected);
  const blocked = saving || uncertain || !models || unavailable;
  useEffect(() => { onBlocked(blocked); }, [blocked, onBlocked]);

  const save = async (next, automatic = false) => {
    if (lock.current || busy || uncertain) return;
    lock.current = true; setSaving(true); setError(""); setNotice("");
    const before = choice; setChoice(next);
    try {
      await apiSend("PATCH", `/api/assistants/${assistant.id}`, next);
      const rows = await reloadAssistants();
      const actual = rows.find((a) => a.id === assistant.id);
      if (!actual || actual.model !== next.model || actual.effort !== next.effort) throw new Error("设置回读与所选值不一致");
      if (alive.current) setNotice(`已保存并回读。${automatic ? `强度已自动设为 ${next.effort}。` : ""}${next.model === null ? "下一条消息将恢复 Codex 全局默认模型与强度。" : "从下一条消息起生效。"}`);
    } catch (e) {
      if (alive.current) { setChoice(before); setError(`保存或回读失败：${e.message}。已恢复原显示，请重新读取设置核对。`); setUncertain(true); }
    } finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  const recover = async () => {
    if (lock.current || busy) return;
    lock.current = true; setSaving(true);
    try {
      const actual = (await reloadAssistants()).find((a) => a.id === assistant.id);
      if (!actual) throw new Error("助手不存在");
      if (alive.current) { setChoice({ model: actual.model, effort: actual.effort }); setUncertain(false); setError(""); setNotice("已重新读取并核对保存值。"); }
    } catch (e) { if (alive.current) setError(`重新读取失败：${e.message}`); }
    finally { lock.current = false; if (alive.current) setSaving(false); }
  };
  return <div className="assistant-models">
    <div className="row assistant-model-row">
      <label className="material-field">模型<select aria-label="模型" value={choice.model ?? ""} disabled={busy || saving || uncertain || !models} onChange={(e) => {
        const model = models.find((m) => m.model === e.target.value);
        save(model ? { model: model.model, effort: model.defaultEffort } : { model: null, effort: null }, !!model);
      }}>
        <option value="">跟随默认</option>
        {choice.model && !selected && <option value={choice.model}>{choice.model}{models ? "（当前不可用）" : "（已保存）"}</option>}
        {models?.map((m) => <option key={m.id} value={m.model} title={m.description}>{m.displayName}</option>)}
      </select></label>
      <label className="material-field">强度<select aria-label="强度" value={choice.effort ?? ""} disabled={busy || saving || uncertain || !selected} onChange={(e) => save({ model: choice.model, effort: e.target.value || null })}>
        <option value="">{selected ? `模型默认（${selected.defaultEffort}）` : choice.model ? "等待模型列表" : "跟随默认"}</option>
        {choice.effort && !selected?.efforts.some((e) => e.value === choice.effort) && <option value={choice.effort}>{choice.effort}（已保存）</option>}
        {selected?.efforts.map((e) => <option key={e.value} value={e.value} title={e.description}>{EFFORT_ZH[e.value] ? `${e.value} · ${EFFORT_ZH[e.value]}` : e.value}</option>)}
      </select></label>
      <span className="muted small" role="status">{runtimeError ? `生效值读取失败：${runtimeError}` : runtime === undefined ? "正在读取生效值…" : runtime === null ? "跟随 Codex 默认" : `当前生效：${runtime.model} · ${runtime.effort ?? "默认"}`}</span>
      {runtimeError && <Button disabled={busy} onClick={() => setRuntimeRetry((n) => n + 1)}>重读生效值</Button>}
    </div>
    {assistant.kind === "imported" && <p className="muted small">将同时改变该 Codex 会话之后的模型与强度，与在 Codex 中切换一致。</p>}
    {!models && !listError && <p className="muted small">正在读取账号可用模型…</p>}
    {listError && <div className="row"><p className="error" role="alert">模型列表读取失败：{listError}。已保存值保留。</p><Button disabled={busy} onClick={() => setRetry((n) => n + 1)}>重读模型列表</Button></div>}
    {unavailable && <p className="assistant-model-warning" role="alert">已保存的模型「{choice.model}」当前不可用，已阻止发送。请重新选择或恢复默认。</p>}
    {saving && <p className="muted small" role="status">正在保存并回读…</p>}
    {notice && <p className="muted small" role="status">{notice}</p>}
    {error && <div className="row"><p className="error" role="alert">{error}</p><Button disabled={busy || saving} onClick={recover}>重新读取设置</Button></div>}
  </div>;
}
