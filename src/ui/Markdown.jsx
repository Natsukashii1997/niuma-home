import { parseMarkdown, statusTone, cleanCell } from "./markdown.js";

// 行内：**加粗**、`代码`；其余原样。
function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => (p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p));
}

// 表格里「状态」列显示成标签。
function Cell({ text, head }) {
  if (/状态/.test(head || "")) {
    const tone = statusTone(text);
    return <span className={`state state-${tone || "none"}`}>{cleanCell(text) || "—"}</span>;
  }
  return <Inline text={cleanCell(text)} />;
}

export function MarkdownTable({ head, rows }) {
  return (
    <div className="md-table">
      <table className="grid compact">
        <thead><tr>{head.map((h, i) => <th key={i}>{cleanCell(h)}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Cell text={c} head={head[j]} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Markdown({ text, skipFirstHeading = false }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === "heading") return skipFirstHeading && i === 0 ? null : <h4 key={i} className={`md-h md-h${b.level}`}><Inline text={cleanCell(b.text)} /></h4>;
        if (b.type === "table") return <MarkdownTable key={i} head={b.head} rows={b.rows} />;
        if (b.type === "list") { const L = b.ordered ? "ol" : "ul"; return <L key={i}>{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</L>; }
        return <p key={i} className="pre"><Inline text={b.text} /></p>;
      })}
    </div>
  );
}
