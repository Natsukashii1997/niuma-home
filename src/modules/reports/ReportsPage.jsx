import { useState } from "react";
import { Copy } from "lucide-react";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Empty, Loadable, PageHeader, SampleBadge, Segmented } from "../../ui/components.jsx";
import { sampleReports } from "../../samples.js";

// 路由：reports | reports/<id>。内容来自飞书机器人写入的日报文档（T05）。
export default function ReportsPage({ route }) {
  const [selectedId] = route;
  const [kind, setKind] = useState("日报");
  const state = useApi("/api/reports", sampleReports);
  return (
    <>
      <PageHeader title="日报周报" subtitle="读取飞书机器人写入的日报文档" actions={state.isSample && <SampleBadge task={state.task} />} />
      <Loadable state={state}>
        {(reports) => {
          const list = reports.filter((r) => r.kind === kind);
          const current = list.find((r) => r.id === selectedId) || list[0];
          return (
            <>
              <Segmented options={[["日报", "日报"], ["周报", "周报"]]} value={kind} onChange={setKind} />
              <div className="chat-layout">
                <aside className="chat-list">
                  {list.map((r) => (
                    <a key={r.id} href={href("reports", r.id)} className={r === current ? "active" : ""}>
                      <strong>{r.title}</strong>
                      <span className="muted small">{r.date}</span>
                    </a>
                  ))}
                </aside>
                <section className="chat-panel">
                  {current ? (
                    <>
                      <header className="chat-head">
                        <strong>{current.title}</strong>
                        <Button onClick={() => navigator.clipboard.writeText(current.body)}>
                          <Copy size={14} /> 复制
                        </Button>
                      </header>
                      <div className="report-body pre">{current.body}</div>
                    </>
                  ) : (
                    <Empty>还没有{kind}</Empty>
                  )}
                </section>
              </div>
            </>
          );
        }}
      </Loadable>
    </>
  );
}
