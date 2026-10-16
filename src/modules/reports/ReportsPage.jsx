import { useEffect, useRef, useState } from "react";
import { FlipNumber, PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { href } from "../../router.js";
import { Button, Empty, Loadable, PageHeader, Segmented, Tag } from "../../ui/components.jsx";
import { parseMarkdown, statusTone, cleanCell } from "../../ui/markdown.js";
import { MarkdownTable } from "../../ui/Markdown.jsx";

// 报告接口的失败响应也有逐来源结果；局部保留它，不改变公共 useApi 的约定。
function useReports(path) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fetch(path).then(async response => {
      const body = await response.json();
      if (!alive) return;
      if (Array.isArray(body?.sources)) setState({ data: { reports: body.reports || [], sources: body.sources } });
      else setState({ error: body?.error || `读取失败（${response.status}）` });
    }).catch(error => alive && setState({ error: error.message }));
    return () => { alive = false; };
  }, [path]);
  return state;
}

export default function ReportsPage({ route }) {
  const [selectedId] = route;
  const [kind, setKind] = useState("日报");
  const [refresh, setRefresh] = useState(0);
  const [copyStatus, setCopyStatus] = useState(null);
  const state = useReports(`/api/reports?withSources=1${refresh ? `&refresh=1&request=${refresh}` : ""}`);
  const selected = state.data?.reports.find(r => r.id === selectedId);
  const activeKind = selected?.kind || (selectedId?.startsWith("w-") ? "周报" : kind);
  const copyVersion = useRef(0);
  useEffect(() => {
    copyVersion.current++;
    setCopyStatus(null);
    return () => { copyVersion.current++; };
  }, [selectedId, activeKind, refresh]);
  async function copy(report) {
    const version = copyVersion.current;
    try {
      await navigator.clipboard.writeText(report.body);
      if (version === copyVersion.current) setCopyStatus({ text: "已复制正文" });
    } catch {
      if (version === copyVersion.current) setCopyStatus({ error: true, text: "无法访问剪贴板，请选中正文手动复制" });
    }
  }
  return (
    <div className="reports-page">
      <PageHeader title="日/周报" actions={<>
        <a className="link" href={href("settings")}>设置来源</a>
        <Button disabled={state.loading} onClick={() => setRefresh(value => value + 1)}><PixelIcon name="refresh" /> {state.loading ? "读取中…" : "刷新"}</Button>
      </>} />
      {refresh > 0 && <div className="operation-progress"><StepProgress key={refresh} label="刷新日/周报" done={!state.loading && !state.error && state.data?.sources.every(s => s.ok)} error={state.error || state.data?.sources.filter(s => !s.ok).map(s => s.error).join("；")} /></div>}
      <Loadable state={state}>
        {({ reports, sources }) => {
          const list = reports.filter(r => r.kind === activeKind);
          const current = selectedId ? selected : list[0];
          const failedSource = sources.find(s => !s.ok && s.role === (selectedId?.startsWith("w-") ? "weekly" : "daily"));
          const listFailure = sources.find(s => !s.ok && (sources.length === 1 || s.role === (activeKind === "日报" ? "daily" : "weekly")));
          return <>
            <div className="toolbar report-toolbar">
            <Segmented options={[["日报", "日报"], ["周报", "周报"]]} value={activeKind} onChange={value => {
              setKind(value);
              const first = reports.find(r => r.kind === value);
              window.location.hash = first ? href("reports", first.id) : href("reports");
            }} />
            <div className="report-sources" aria-label="报告来源状态">
              {sources.map(source => <div key={source.role}>
                <div className="row">
                  <span className="label">{source.role === "daily" ? "日报文档" : "周报文档"}</span>
                  {source.ok ? <span className="tnum"><FlipNumber value={source.count} /> 篇{source.ignored ? ` · 忽略 ${source.ignored} 篇` : ""}</span> : <>
                    <span className="error" role="alert">{source.error}</span>
                    <Button onClick={() => setRefresh(value => value + 1)}>重试</Button>
                  </>}
                </div>
                {source.unrecognized.length > 0 && <details>
                  <summary>{source.unrecognized.length} 个标题未识别</summary>
                  <ul>{source.unrecognized.map(item => <li key={item.lineNo}>第 {item.lineNo} 行：{item.title}</li>)}</ul>
                </details>}
              </div>)}
            </div>
            <span className="spacer" />
            <span className="muted small">{listFailure ? `${activeKind}来源读取失败，请重试` : `共 ${list.length} 篇 · 按日期倒序`}</span>
            </div>
            <div className="chat-layout">
              <aside className="chat-list" aria-label={`${activeKind}列表`}>
                <div className="chat-list-inner">{list.length ? list.map(r => { const sum = summarize(r.body); return <a key={r.id} data-dither="" href={href("reports", r.id)} className={r === current ? "active" : ""}>
                  <strong className="tnum">{r.date}{r.kind === "日报" && <span className="report-wd"> {weekday(r.date)}</span>}</strong>
                  <span className="small report-sum">{sum.total ? <>{sum.total} 项{sum.pending ? <span className="signal"> · {sum.pending} 待处理</span> : ""}</> : <span className="muted">{cleanCell(r.title)}</span>}</span>
                  {r.warnings?.length > 0 && <span title={r.warnings.join("；")} tabIndex={0} aria-label={r.warnings.join("；")}><Tag tone="orange">周次提示</Tag></span>}
                </a>; }) : <Empty>{listFailure ? `${activeKind}读取失败，请重试` : `还没有${activeKind}`}</Empty>}</div>
              </aside>
              <section className="chat-panel">
                {current ? <>
                  <header className="chat-head"><strong>{cleanCell(current.title)}</strong><Button onClick={() => copy(current)}><PixelIcon name="copy" /> 复制原文</Button></header>
                  {copyStatus && <p className={`report-copy small ${copyStatus.error ? "error" : "muted"}`} role="status">{copyStatus.text}</p>}
                  <ReportBody key={current.id} body={current.body} />
                </> : <Empty>{selectedId && failedSource ? `暂时无法读取这篇报告：${failedSource.error}` : selectedId ? "这篇日报或周报不存在，请从列表重新选择" : listFailure ? `${activeKind}读取失败，请重试` : `文档中暂未识别到独立的${activeKind}日期标题`}</Empty>}
              </section>
            </div>
          </>;
        }}
      </Loadable>
    </div>
  );
}

const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const weekday = (date) => { const d = new Date(`${date}T00:00:00`); return Number.isNaN(d.getTime()) ? "" : WD[d.getDay()]; };

// 找「事项」表；统计总数和待处理（待处理 / 卡点）数，列表里显示。
function itemTable(blocks) { return blocks.find((b) => b.type === "table" && b.head.some((h) => /事项/.test(h))); }
function summarize(body) {
  const t = itemTable(parseMarkdown(body));
  if (!t) return { total: 0, pending: 0 };
  const si = t.head.findIndex((h) => /状态/.test(h));
  return { total: t.rows.length, pending: si < 0 ? 0 : t.rows.filter((r) => ["todo", "block"].includes(statusTone(r[si]))).length };
}

// 正文（v3）：渲染 Markdown；「事项」表上方可以按状态、T 线和关键词筛选。
function ReportBody({ body }) {
  const blocks = parseMarkdown(body || "");
  const table = itemTable(blocks);
  const [status, setStatus] = useState("all");
  const [line, setLine] = useState("");
  const [q, setQ] = useState("");
  if (!body) return <div className="report-body"><Empty>这篇报告暂无正文</Empty></div>;
  const si = table ? table.head.findIndex((h) => /状态/.test(h)) : -1;
  const li = table ? table.head.findIndex((h) => /主题|T线/.test(h)) : -1;
  const lines = table && li >= 0 ? [...new Set(table.rows.map((r) => cleanCell(r[li])).filter(Boolean))] : [];
  const counts = { all: table?.rows.length || 0 };
  table?.rows.forEach((r) => { const t = statusTone(r[si]) || "none"; counts[t] = (counts[t] || 0) + 1; });
  const rows = table ? table.rows.filter((r) => (status === "all" || (statusTone(r[si]) || "none") === status) && (!line || cleanCell(r[li]) === line) && (!q || r.join(" ").includes(q))) : [];
  return (
    <div className="report-body md">
      {blocks.map((b, i) => {
        if (b === table) return (
          <div key={i} className="report-items-block">
            <div className="report-filter">
              <Segmented options={[["all", `全部 ${counts.all}`], ["doing", `进行中 ${counts.doing || 0}`], ["todo", `待处理 ${counts.todo || 0}`], ["block", `卡点 ${counts.block || 0}`], ["done", `已完成 ${counts.done || 0}`]]} value={status} onChange={setStatus} />
              <input className="report-search" placeholder="搜索事项、人名" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索事项" />
            </div>
            {lines.length > 1 && <div className="tag-row report-lines"><span className="label">T 线</span><button type="button" className={`chip${!line ? " is-on" : ""}`} onClick={() => setLine("")}>全部</button>{lines.map((l) => <button key={l} type="button" className={`chip${line === l ? " is-on" : ""}`} onClick={() => setLine(line === l ? "" : l)}>{l}</button>)}</div>}
            {rows.length ? <MarkdownTable head={table.head} rows={rows} /> : <Empty>没有符合筛选的事项</Empty>}
          </div>
        );
        if (b.type === "heading") return <h4 key={i} className={`md-h md-h${b.level}`}>{cleanCell(b.text)}</h4>;
        if (b.type === "table") return <MarkdownTable key={i} head={b.head} rows={b.rows} />;
        if (b.type === "list") { const L = b.ordered ? "ol" : "ul"; return <L key={i}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</L>; }
        return <p key={i} className="pre">{b.text}</p>;
      })}
    </div>
  );
}
