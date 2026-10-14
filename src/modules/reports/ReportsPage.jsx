import { useEffect, useRef, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Empty, Loadable, PageHeader, Segmented } from "../../ui/components.jsx";

export default function ReportsPage({ route }) {
  const [selectedId] = route;
  const [kind, setKind] = useState("日报");
  const [refresh, setRefresh] = useState(0);
  const [copyStatus, setCopyStatus] = useState(null);
  const state = useApi(refresh ? `/api/reports?refresh=1&request=${refresh}` : "/api/reports");
  const selected = state.data?.find(r => r.id === selectedId);
  const activeKind = selected?.kind || kind;
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
      <PageHeader title="日报周报" subtitle="读取飞书机器人写入的日报文档" actions={<>
        <a className="link" href={href("settings")}>设置来源</a>
        <Button disabled={state.loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} /> {state.loading ? "读取中…" : "刷新"}</Button>
      </>} />
      <Loadable state={state}>
        {(reports) => {
          const list = reports.filter(r => r.kind === activeKind);
          const current = selectedId ? selected : list[0];
          return <>
            <Segmented options={[["日报", "日报"], ["周报", "周报"]]} value={activeKind} onChange={value => {
              setKind(value);
              const first = reports.find(r => r.kind === value);
              window.location.hash = first ? href("reports", first.id) : href("reports");
            }} />
            <p className="muted small">共 {list.length} 篇{activeKind} · 按日期倒序 · 刷新可重新读取飞书文档</p>
            <div className="chat-layout">
              <aside className="chat-list" aria-label={`${activeKind}列表`}>
                {list.length ? list.map(r => <a key={r.id} href={href("reports", r.id)} className={r === current ? "active" : ""}>
                  <strong>{r.title}</strong><span className="muted small">{r.date}</span>
                </a>) : <Empty>还没有{activeKind}</Empty>}
              </aside>
              <section className="chat-panel">
                {current ? <>
                  <header className="chat-head"><strong>{current.title}</strong><Button onClick={() => copy(current)}><Copy size={14} /> 复制</Button></header>
                  {copyStatus && <p className={`report-copy small ${copyStatus.error ? "error" : "muted"}`} role="status">{copyStatus.text}</p>}
                  <div key={current.id} className="report-body pre">{current.body || "这篇报告暂无正文"}</div>
                </> : <Empty>{selectedId ? "这篇日报或周报不存在，请从列表重新选择" : `文档中暂未识别到独立的${activeKind}日期标题`}</Empty>}
              </section>
            </div>
          </>;
        }}
      </Loadable>
    </div>
  );
}
