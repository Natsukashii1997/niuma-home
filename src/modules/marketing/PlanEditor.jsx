import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend } from "../../api.js";
import { Button, Card, PhaseSteps } from "../../ui/components.jsx";
import { SpecialBlock, TABLE_FIELDS } from "./PromosView.jsx";
import { legacyState, legacyWrite, recoverLegacy, retryLegacy } from "../../ui/legacy-write.js";

// 方案录入：嵌在「月度促销」上半部分，四步 粘贴 → 解析 → 处理 → 确认。
// 不选业务线：直接粘贴，按原文里的【…板块】自动识别是大学辅导、国际课程还是申诉服务，写入对应业务线（用户 2026-10-19）。
// onLine(业务线 | null)：解析出、还没入库的业务线，给上方状态块标出「录入中」。
export default function PlanEditor({ month, onSaved, onLine }) {
  return <PlanForm key={month} month={month} onSaved={onSaved} onLine={onLine} />;
}

const FLOW = [
  ["粘贴", "从飞书复制整份方案，粘到下方原文框"],
  ["解析", "粘贴后自动解析，改了原文再点「解析预览」"],
  ["处理", "核对标「改」的格子，修正未识别的行"],
  ["确认", "确认入库，写入促销表并回读核对"],
];

function PlanForm({ month, onSaved, onLine }) {
  const scope = `monthplan:${month}`;
  const [initialWrite] = useState(() => legacyState(scope));
  const [rawText, setRawText] = useState(initialWrite.pending?.body?.rawText || "");
  const [rawHtml, setRawHtml] = useState(initialWrite.pending?.body?.rawHtml || "");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(null);
  const [preview, setPreview] = useState(initialWrite.pending?.context?.preview || null);
  const [error, setError] = useState(initialWrite.error || (initialWrite.pending ? "上次入库尚未核对，已恢复原文与预览，请重新载入核对。" : ""));
  const [message, setMessage] = useState("");
  const [needsReload, setNeedsReload] = useState(!!initialWrite.pending || !!initialWrite.error);
  const [saved, setSaved] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const operation = useRef(false);
  const line = preview?.line || null;
  const path = line && "/api/plans/" + encodeURIComponent(month) + "/" + encodeURIComponent(line);
  useEffect(() => { onLine?.(saved ? null : line); }, [line, saved]); // eslint-disable-line react-hooks/exhaustive-deps

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
    edit(next, start === 0 && end === rawText.length ? html : "");
    const input = event.currentTarget;
    requestAnimationFrame(() => input.setSelectionRange(start + text.length, start + text.length));
    // v3：粘贴后自动解析（规则解析，不调用 AI），省去再点一次「解析预览」。
    if (next.trim()) setTimeout(() => parse(next), 0);
  }

  const locked = Boolean(busy) || needsReload;
  const mismatch = preview && !line;
  const hasContent = preview && (preview.rows.length > 0 || preview.special !== "无"); // 申诉服务没有 SKU，只有整月特殊活动
  const canSave = !locked && !saved && hasContent && !preview.unrecognized.length && !mismatch;

  async function parse(text = rawText) {
    if (locked || operation.current || !text.trim()) return;
    setSaved(false);
    operation.current = true;
    setProgress({ label: "解析预览" });
    setBusy("parse"); setError(""); setMessage(""); setPreview(null);
    try {
      setPreview(await apiSend("POST", "/api/plans/parse", { month, rawText: text }));
      setProgress({ label: "解析预览", done: true });
    } catch (e) { setError(e.message); setProgress({ label: "解析预览", error: e.message }); }
    finally { operation.current = false; setBusy(""); }
  }

  async function verify(result, op) {
    const body = op.body, sourceLine = op.context.preview.line;
    const [plan, verified] = await Promise.all([
      apiSend("GET", op.path),
      apiSend("POST", "/api/plans/parse", { month, line: sourceLine, rawText: body.rawText }),
    ]);
    const matches = plan.rawText === body.rawText && (plan.rawHtml || "") === body.rawHtml && plan.special === body.special && verified.special === body.special &&
      !verified.removed.length && verified.rows.every(row => row.status === "same") && plan.writeVersion === result.writeVersion;
    if (matches) setPreview(verified);
    return matches;
  }
  async function recover() {
    if (operation.current) return;
    operation.current = true; setBusy("read");
    try {
      const result = await recoverLegacy(scope, verify);
      setNeedsReload(false); setError("");
      if (result) { setSaved(true); setMessage("已核对原操作，促销方案已保存，没有重复入库。"); onSaved?.(); }
    } catch (error) { setError(`重新核对未完成：${error.message}。原文与预览已保留。`); setCanRetry(error.code === "WRITE_RECEIPT_UNKNOWN"); }
    finally { operation.current = false; setBusy(""); }
  }

  async function retryOriginal() {
    if (operation.current || !canRetry) return;
    operation.current = true; setBusy("save"); setCanRetry(false);
    try {
      await retryLegacy(scope, verify);
      setNeedsReload(false); setError(""); setSaved(true); setMessage("已核对原操作，促销方案已保存，没有重复入库。"); onSaved?.();
    } catch (error) { setError(`${error.message}。原文与预览已保留，请重新核对。`); setCanRetry(error.code === "WRITE_RECEIPT_UNKNOWN"); }
    finally { operation.current = false; setBusy(""); }
  }

  async function save() {
    if (!canSave || operation.current) return;
    operation.current = true;
    setProgress({ label: "入库并回读核对" });
    setBusy("save"); setError(""); setMessage("");
    try {
      const counts = await legacyWrite(scope, { method: "PUT", path, body: { rawText, rawHtml, rows: preview.rows, special: preview.special }, baseVersion: preview.writeVersion, context: { preview } }, verify);
      setSaved(true);
      setProgress({ label: "入库并回读核对", done: true });
      setMessage("已写入 " + counts.inserted + " 行，更新 " + counts.updated + " 行，删除 " + counts.removed + " 行");
      onSaved?.();
    } catch (e) {
      setNeedsReload(true); setCanRetry(e.code === "WRITE_RECEIPT_UNKNOWN");
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

  const issues = preview ? (!hasContent || preview.unrecognized.length > 0 || mismatch) : false;
  const stage = saved ? 4 : preview ? (issues ? 2 : 3) : rawText.trim() ? 1 : 0;

  return (
    <div className="plan-editor">
      <PhaseSteps items={FLOW.map(([name, hint], i) => ({ key: name, name, note: hint, state: i < stage ? "done" : i === stage ? "cur" : "todo" }))} />
      <div className="toolbar">
        <span className="small muted">写入 {month} · {line || "粘贴后按【…板块】自动识别业务线"}</span>
      </div>
      {progress && <div className="operation-progress"><StepProgress key={progress.label} {...progress} /></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {needsReload && <div className="row"><Button disabled={!!busy} onClick={recover}>重新载入核对</Button>{canRetry && <Button disabled={!!busy} onClick={retryOriginal}>重试原操作</Button>}</div>}
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
            {preview.rows.length > 0 && <div className="table-wrap">
              <table className="grid compact plan-preview-table">
                <colgroup>{["17%", "14%", "23%", "23%", "23%"].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead><tr><th>SKU</th>{TABLE_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{preview.rows.map((row, index) => <tr key={row.sku + "-" + index}>
                  <td>{row.sku}{row.alias && <div className="muted small">原文：{row.alias}</div>}</td>
                  {TABLE_FIELDS.map(([key]) => <td key={key} className={row.changed?.includes(key) ? "changed" : ""}>
                    {row[key]}
                    {row.changed?.includes(key) && <span className="prev-value">{row.previous?.month}：<s>{row.previous?.[key] ?? "无"}</s></span>}
                  </td>)}
                </tr>)}</tbody>
              </table>
            </div>}
            {(preview.special !== "无" || preview.rows.some((row) => row.special !== "无")) &&
              <SpecialBlock line={line} month={month} text={preview.special} skus={preview.rows.filter((row) => row.special !== "无")} />}
            {!hasContent && <div className="warn">没有识别到 SKU 或活动，请检查原文中的编号行。</div>}
            {line === "申诉服务" && <p className="muted small">申诉服务只存原文和活动，不进方案汇总。</p>}
            {preview.removed.length > 0 && <div className="warn"><PixelIcon name="alert" size={14} /><span>将删除的 SKU：{preview.removed.join("、")}。确认入库后删除。</span></div>}
            {mismatch && <div className="warn"><PixelIcon name="alert" size={14} /><span>未识别到业务线：原文开头要有「【大学辅导板块】」「【国际课程板块】」或「【申诉服务板块】」。请修改原文后重新解析。</span></div>}
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
