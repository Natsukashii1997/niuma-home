import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend } from "../../api.js";
import { Button, Card, PhaseSteps, Tag } from "../../ui/components.jsx";
import { PROMO_LINES } from "../../constants.js";
import { SpecialBlock, TABLE_FIELDS } from "./PromosView.jsx";

// 方案录入：嵌在「月度促销」上半部分，四步 粘贴 → 解析 → 处理 → 确认。
// carry：从另一条业务线带过来的原文（粘贴的原文板块和当前业务线不同时自动切过来）；onSwitchLine(业务线, { rawText, rawHtml }) 发起切换。
export default function PlanEditor({ month, line, onSaved, carry = null, onSwitchLine }) {
  return <PlanForm key={month + "/" + line} month={month} line={line} onSaved={onSaved} carry={carry} onSwitchLine={onSwitchLine} />;
}

const FLOW = [
  ["粘贴", "从飞书复制整份方案，粘到下方原文框"],
  ["解析", "粘贴后自动解析，改了原文再点「解析预览」"],
  ["处理", "核对标「改」的格子，修正未识别的行"],
  ["确认", "确认入库，写入促销表并回读核对"],
];

function PlanForm({ month, line, onSaved, carry, onSwitchLine }) {
  const path = "/api/plans/" + encodeURIComponent(month) + "/" + encodeURIComponent(line);
  const [rawText, setRawText] = useState(carry?.rawText || "");
  const [rawHtml, setRawHtml] = useState(carry?.rawHtml || "");
  const [loading, setLoading] = useState(!carry);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [saved, setSaved] = useState(false);
  const operation = useRef(false);

  useEffect(() => {
    if (carry) { parse(carry.rawText, carry.rawHtml).then(() => setMessage(`原文是「${line}」的方案，已自动切到${line}`)); return; }
    let active = true;
    async function load() {
      try {
        const response = await fetch(path);
        if (response.status === 404) return;
        const plan = await response.json();
        if (!response.ok) throw new Error(plan.error || "原文读取失败");
        if (active) {
          setRawText(plan.rawText);
          setRawHtml(plan.rawHtml || "");
        }
      } catch (e) {
        if (active) setLoadError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [path]);

  function edit(text, html = "") {
    setProgress(null);
    setSaved(false);
    setRawText(text);
    setRawHtml(html);
    setPreview(null);
    setMessage("");
    setError("");
  }

  function paste(event) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const html = event.clipboardData.getData("text/html");
    const { selectionStart: start, selectionEnd: end } = event.currentTarget;
    const next = rawText.slice(0, start) + text + rawText.slice(end);
    // 整份粘贴保留原始 HTML；局部修改退回纯文本，避免复制出过期格式内容。
    const nextHtml = start === 0 && end === rawText.length ? html : "";
    edit(next, nextHtml);
    const input = event.currentTarget;
    requestAnimationFrame(() => input.setSelectionRange(start + text.length, start + text.length));
    // v3：粘贴后自动解析（规则解析，不调用 AI），省去再点一次「解析预览」。
    if (next.trim()) setTimeout(() => parse(next, nextHtml), 0);
  }

  const locked = loading || Boolean(loadError) || Boolean(busy) || needsReload;
  const mismatch = preview && preview.line !== line;
  const canSave = !locked && !saved && preview?.rows.length > 0 && !preview.unrecognized.length && !mismatch;

  async function parse(text = rawText, html = rawHtml) {
    if (locked || operation.current || !text.trim()) return;
    setSaved(false);
    operation.current = true;
    setProgress({ label: "解析预览" });
    setBusy("parse"); setError(""); setMessage(""); setPreview(null);
    try {
      const result = await apiSend("POST", "/api/plans/parse", { month, line, rawText: text });
      // 原文是另一条业务线的方案：带着原文切过去，在那条线上重新解析和对比
      if (result.line && result.line !== line && PROMO_LINES.includes(result.line) && onSwitchLine) {
        onSwitchLine(result.line, { rawText: text, rawHtml: html });
        return;
      }
      setPreview(result);
      setProgress({ label: "解析预览", done: true });
    } catch (e) { setError(e.message); setProgress({ label: "解析预览", error: e.message }); }
    finally { operation.current = false; setBusy(""); }
  }

  async function save() {
    if (!canSave || operation.current) return;
    operation.current = true;
    setProgress({ label: "入库并回读核对" });
    setBusy("save"); setError(""); setMessage("");
    try {
      const counts = await apiSend("PUT", path, { rawText, rawHtml, rows: preview.rows, special: preview.special });
      const [plan, verified] = await Promise.all([
        apiSend("GET", path),
        apiSend("POST", "/api/plans/parse", { month, line, rawText }),
      ]);
      if (plan.rawText !== rawText || (plan.rawHtml || "") !== rawHtml || plan.special !== preview.special || verified.special !== preview.special ||
          verified.removed.length || verified.rows.some((row) => row.status !== "same")) {
        throw new Error("写后回读与确认内容不一致");
      }
      setPreview(verified);
      setSaved(true);
      setProgress({ label: "入库并回读核对", done: true });
      setMessage("已写入 " + counts.inserted + " 行，更新 " + counts.updated + " 行，删除 " + counts.removed + " 行");
      onSaved?.();
    } catch (e) {
      setPreview(null);
      setNeedsReload(true);
      setProgress({ label: "入库并回读核对", error: "入库结果未确认，请重新载入核对" });
      setError("入库结果未确认，请重新载入原文核对后再试。" + e.message);
    } finally { operation.current = false; setBusy(""); }
  }

  async function copy() {
    if (locked || operation.current) return;
    operation.current = true;
    setBusy("copy"); setError(""); setMessage("");
    try {
      if (rawHtml) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/plain": new Blob([rawText], { type: "text/plain" }),
          "text/html": new Blob([rawHtml], { type: "text/html" }),
        })]);
      } else { await navigator.clipboard.writeText(rawText); }
      setMessage(rawHtml ? "已复制原文（含文本与 HTML 格式）" : "已复制原文（纯文本）");
    } catch { setError("复制未完成，请检查浏览器剪贴板权限，或在原文框内全选复制"); }
    finally { operation.current = false; setBusy(""); }
  }

  const issues = preview ? (!preview.rows.length || preview.unrecognized.length > 0 || mismatch) : false;
  const stage = saved ? 4 : preview ? (issues ? 2 : 3) : rawText.trim() ? 1 : 0;

  return (
    <div className="plan-editor">
      <PhaseSteps items={FLOW.map(([name, hint], i) => ({ key: name, name, note: hint, state: i < stage ? "done" : i === stage ? "cur" : "todo" }))} />
      <div className="toolbar">
        <span className="small muted">写入 {month} · {line}</span>
      </div>
      {progress && <div className="operation-progress"><StepProgress key={progress.label} {...progress} /></div>}
      {loading && <p className="muted" role="status">正在读取已有原文…</p>}
      {(loadError || error) && <p className="error" role="alert">{loadError || error}</p>}
      {(loadError || needsReload) && <Button onClick={() => window.location.reload()}>重新载入核对</Button>}
      {message && <p role="status">{message}</p>}
      <div className="split cols-5-7">
        <Card title="方案原文" extra={<Button onClick={() => parse()} disabled={locked || !rawText.trim()}>{busy === "parse" ? "解析中…" : "解析预览"}</Button>}>
          <textarea className="paste-box" aria-label="方案原文" value={rawText} disabled={locked}
            onChange={(event) => edit(event.target.value)} onPaste={paste}
            placeholder="在此粘贴飞书里的方案，例如「🟥【大学辅导板块】1. 灵活学Lite …」" />
          <p className="muted small">{rawHtml ? "已保留粘贴的原始格式。" : "当前为纯文本。"} 局部修改后按纯文本保存和复制。</p>
        </Card>
        <Card title="解析预览" extra={<>
          <Button onClick={copy} disabled={locked || !rawText}>复制原文</Button>
          <Button onClick={save} disabled={!canSave} variant="confirm">{busy === "save" ? "入库并核对中…" : "确认入库"}</Button>
        </>}>
          {!preview ? <div className="parse-empty"><p className="small muted">解析后显示：各 SKU 字段、与上月的差异</p><div className="state-loading" aria-hidden="true"><i /><i /><i /></div></div> : <>
            <p className="muted small">优先对比本月已有数据；本月无数据时对比该业务线上一个有数据的月份。标「改」的格子下方是旧值。</p>
            <div className="table-wrap">
              <table className="grid compact plan-preview-table">
                <colgroup>{["16%", "13%", "21%", "19%", "19%", "12%"].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead><tr><th>SKU</th>{TABLE_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}<th>对比状态</th></tr></thead>
                <tbody>{preview.rows.map((row, index) => <tr key={row.sku + "-" + index}>
                  <td>{row.sku}{row.alias && <div className="muted small">原文：{row.alias}</div>}</td>
                  {TABLE_FIELDS.map(([key]) => <td key={key} className={row.changed?.includes(key) ? "changed" : ""}>
                    {row[key]}
                    {row.changed?.includes(key) && <span className="prev-value">{row.previous?.month}：<s>{row.previous?.[key] ?? "无"}</s></span>}
                  </td>)}
                  <td>{row.status === "new" ? <Tag tone="orange">新 SKU</Tag> : row.status === "changed" ? <Tag tone="blue">有变化</Tag> : <Tag>无变化</Tag>}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {(preview.special !== "无" || preview.rows.some((row) => row.special !== "无")) &&
              <SpecialBlock line={line} month={month} text={preview.special} skus={preview.rows.filter((row) => row.special !== "无")} />}
            {!preview.rows.length && <div className="warn">没有识别到 SKU，请检查原文中的编号行。</div>}
            {preview.removed.length > 0 && <div className="warn"><PixelIcon name="alert" size={14} /><span>将删除的 SKU：{preview.removed.join("、")}。确认入库后删除。</span></div>}
            {mismatch && <div className="warn"><PixelIcon name="alert" size={14} /><span>{preview.line ? "原文业务线为「" + preview.line + "」，与当前「" + line + "」不一致。" : "未识别到业务线，请补充正确的【…板块】标题。"} 请修改原文后重新解析。</span></div>}
            {preview.unrecognized.length > 0 && <div className="warn"><PixelIcon name="alert" size={14} /><div>
              <strong>有 {preview.unrecognized.length} 行未识别（含重复 SKU），暂不可入库。请修改原文后重新解析：</strong>
              <ul>{preview.unrecognized.map((item) => <li key={item.lineNo}>第 {item.lineNo} 行：<span className="pre">{item.text}</span></li>)}</ul>
            </div></div>}
          </>}
        </Card>
      </div>
    </div>
  );
}
