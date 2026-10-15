import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { href } from "../../router.js";
import { apiSend } from "../../api.js";
import { Button, Card, Empty, PageHeader, Tag } from "../../ui/components.jsx";
import { PROMO_FIELDS, monthLabel } from "../../constants.js";

export default function PlanEditor({ month, line }) {
  return <PlanForm key={month + "/" + line} month={month} line={line} />;
}

function PlanForm({ month, line }) {
  const path = "/api/plans/" + encodeURIComponent(month) + "/" + encodeURIComponent(line);
  const [rawText, setRawText] = useState("");
  const [rawHtml, setRawHtml] = useState("");
  const [loading, setLoading] = useState(true);
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
    edit(next, start === 0 && end === rawText.length ? html : "");
    const input = event.currentTarget;
    requestAnimationFrame(() => input.setSelectionRange(start + text.length, start + text.length));
  }

  const locked = loading || Boolean(loadError) || Boolean(busy) || needsReload;
  const mismatch = preview && preview.line !== line;
  const canSave = !locked && !saved && preview?.rows.length > 0 && !preview.unrecognized.length && !mismatch;

  async function parse() {
    if (locked || operation.current || !rawText.trim()) return;
    setSaved(false);
    operation.current = true;
    setProgress({ label: "解析预览" });
    setBusy("parse"); setError(""); setMessage(""); setPreview(null);
    try {
      setPreview(await apiSend("POST", "/api/plans/parse", { month, line, rawText }));
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
      const counts = await apiSend("PUT", path, { rawText, rawHtml, rows: preview.rows });
      const [plan, verified] = await Promise.all([
        apiSend("GET", path),
        apiSend("POST", "/api/plans/parse", { month, line, rawText }),
      ]);
      if (plan.rawText !== rawText || (plan.rawHtml || "") !== rawHtml ||
          verified.removed.length || verified.rows.some((row) => row.status !== "same")) {
        throw new Error("写后回读与确认内容不一致");
      }
      setPreview(verified);
      setSaved(true);
      setProgress({ label: "入库并回读核对", done: true });
      setMessage("已写入 " + counts.inserted + " 行，更新 " + counts.updated + " 行，删除 " + counts.removed + " 行");
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

  return (
    <div className="plan-editor">
      <a className="back-link" href={href("marketing", "plans")}><PixelIcon name="left" size={14} /> 返回方案</a>
      <PageHeader
        title={monthLabel(month) + " · " + line}
        subtitle="从飞书复制方案，粘贴到左侧；解析结果确认后才会写入促销表"
        actions={<>
          <Button onClick={copy} disabled={locked || !rawText}>复制原文</Button>
          <Button onClick={save} disabled={!canSave} variant="primary">{busy === "save" ? "入库并核对中…" : "确认入库"}</Button>
        </>}
      />
      {progress && <div className="operation-progress"><StepProgress key={progress.label} {...progress} /></div>}
      {loading && <p className="muted" role="status">正在读取已有原文…</p>}
      {(loadError || error) && <p className="error" role="alert">{loadError || error}</p>}
      {(loadError || needsReload) && <Button onClick={() => window.location.reload()}>重新载入核对</Button>}
      {message && <p role="status">{message}</p>}
      <div className="split">
        <Card title="方案原文" extra={<Button onClick={parse} disabled={locked || !rawText.trim()}>{busy === "parse" ? "解析中…" : "解析预览"}</Button>}>
          <textarea className="paste-box" aria-label="方案原文" value={rawText} disabled={locked}
            onChange={(event) => edit(event.target.value)} onPaste={paste}
            placeholder="在此粘贴飞书里的方案，例如「🟥【大学辅导板块】1. 灵活学Lite …」" />
          <p className="muted small">{rawHtml ? "已保留粘贴的原始格式。" : "当前为纯文本。"} 编辑后需重新解析；局部修改后按纯文本保存和复制。</p>
        </Card>
        <Card title="解析预览" extra={preview && <Tag>{preview.rows.length} 个 SKU</Tag>}>
          {!preview ? <Empty>粘贴原文后，点击「解析预览」查看字段与差异</Empty> : <>
            <p className="muted small">优先对比本月已有数据；本月无数据时对比该业务线上一个有数据的月份。高亮格可悬停查看旧值。</p>
            <div className="table-wrap">
              <table className="grid compact">
                <thead><tr><th>SKU</th>{PROMO_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}<th>对比状态</th></tr></thead>
                <tbody>{preview.rows.map((row, index) => <tr key={row.sku + "-" + index}>
                  <td>{row.sku}{row.alias && <div className="muted small">原文：{row.alias}</div>}</td>
                  {PROMO_FIELDS.map(([key]) => <td key={key} className={row.changed?.includes(key) ? "changed" : ""}
                    title={row.changed?.includes(key) ? "旧值（" + row.previous?.month + "）：" + (row.previous?.[key] ?? "无") : undefined}>{row[key]}</td>)}
                  <td>{row.status === "new" ? <Tag tone="orange">新 SKU</Tag> : row.status === "changed" ? <Tag tone="blue">有变化</Tag> : <Tag>无变化</Tag>}</td>
                </tr>)}</tbody>
              </table>
            </div>
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
