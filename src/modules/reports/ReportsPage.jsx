import { useEffect, useRef, useState } from "react";
import { FlipNumber, PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { href } from "../../router.js";
import { Button, Empty, Loadable, PageHeader, Segmented, Tag } from "../../ui/components.jsx";

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
      <PageHeader title="日报周报" subtitle="读取飞书中的日报与周报文档" actions={<>
        <a className="link" href={href("settings")}>设置来源</a>
        <Button disabled={state.loading} onClick={() => setRefresh(value => value + 1)}><PixelIcon name="refresh" size={14} /> {state.loading ? "读取中…" : "刷新"}</Button>
      </>} />
      {refresh > 0 && <div className="operation-progress"><StepProgress key={refresh} label="刷新日/周报" done={!state.loading && !state.error && state.data?.sources.every(s => s.ok)} error={state.error || state.data?.sources.filter(s => !s.ok).map(s => s.error).join("；")} /></div>}
      <Loadable state={state}>
        {({ reports, sources }) => {
          const list = reports.filter(r => r.kind === activeKind);
          const current = selectedId ? selected : list[0];
          const failedSource = sources.find(s => !s.ok && s.role === (selectedId?.startsWith("w-") ? "weekly" : "daily"));
          const listFailure = sources.find(s => !s.ok && (sources.length === 1 || s.role === (activeKind === "日报" ? "daily" : "weekly")));
          return <>
            <div className="report-sources stack" aria-label="报告来源状态">
              {sources.map(source => <div key={source.role}>
                <div className="row">
                  <strong>{source.role === "daily" ? "日报文档" : "周报文档"}：</strong>
                  {source.ok ? <span><FlipNumber value={source.count} /> 篇{source.ignored ? ` · 忽略 ${source.ignored} 篇其他类型` : ""}</span> : <>
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
            <Segmented options={[["日报", "日报"], ["周报", "周报"]]} value={activeKind} onChange={value => {
              setKind(value);
              const first = reports.find(r => r.kind === value);
              window.location.hash = first ? href("reports", first.id) : href("reports");
            }} />
            <p className="muted small">{listFailure ? `${activeKind}来源读取失败，请重试` : `共 ${list.length} 篇${activeKind} · 按日期倒序`} · 刷新可重新读取飞书文档</p>
            <div className="chat-layout">
              <aside className="chat-list" aria-label={`${activeKind}列表`}>
                {list.length ? list.map(r => <a key={r.id} data-dither="" href={href("reports", r.id)} className={r === current ? "active" : ""}>
                  <strong>{r.title}</strong><span className="muted small">{r.date}</span>
                  {r.warnings?.length > 0 && <span title={r.warnings.join("；")} tabIndex={0} aria-label={r.warnings.join("；")}><Tag tone="orange">周次提示</Tag></span>}
                </a>) : <Empty>{listFailure ? `${activeKind}读取失败，请重试` : `还没有${activeKind}`}</Empty>}
              </aside>
              <section className="chat-panel">
                {current ? <>
                  <header className="chat-head"><strong>{current.title}</strong><Button onClick={() => copy(current)}><PixelIcon name="copy" size={14} /> 复制</Button></header>
                  {copyStatus && <p className={`report-copy small ${copyStatus.error ? "error" : "muted"}`} role="status">{copyStatus.text}</p>}
                  <div key={current.id} className="report-body pre">{current.body || "这篇报告暂无正文"}</div>
                </> : <Empty>{selectedId && failedSource ? `暂时无法读取这篇报告：${failedSource.error}` : selectedId ? "这篇日报或周报不存在，请从列表重新选择" : listFailure ? `${activeKind}读取失败，请重试` : `文档中暂未识别到独立的${activeKind}日期标题`}</Empty>}
              </section>
            </div>
          </>;
        }}
      </Loadable>
    </div>
  );
}
