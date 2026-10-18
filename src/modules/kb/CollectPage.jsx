import { useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Card, Loadable, Tag } from "../../ui/components.jsx";

// 最近收藏（T12）：收藏只走 Chrome 扩展「牛马之家 · 收藏」（飞书文档页右下角的按钮），工作台不再提供粘贴链接收藏（用户 2026-10-18）。
// 只命中一个目录的进那一组；不明确的放知识库根目录，在画布散卡区，拖进分组即可。
// 结果不明的记录可以在这里只读核对，绝不重新创建。

function timeText(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "时间未知" : d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

const STATUS = { ok: ["green", "已收藏"], duplicate: ["neutral", "已在库中"], failed: ["red", "未收藏"] };

export function CollectRecent({ onVerified }) {
  const state = useApi("/api/v3/kb/collect/recent");
  const [check, setCheck] = useState("");
  const [busy, setBusy] = useState(false);
  async function reconcile(id) {
    setBusy(true); setCheck("正在只读核对…");
    try {
      const r = await apiSend("POST", `/api/v3/kb/operations/${encodeURIComponent(id)}/reconcile`, {});
      state.reload();
      setCheck(r.state === "verified" ? "已核对：快捷方式已建好，指向原文档" : "已核对：没有建成快捷方式；需要的话在飞书文档页再点一次收藏");
      if (r.state === "verified") onVerified?.();
    } catch (e) { setCheck(`仍未能核实：${e.message}。保持锁定，不会重试。`); }
    finally { setBusy(false); }
  }
  return (
    <Card className="kb-collect-recent" title={<><PixelIcon name="clock" />最近收藏</>}>
      <p className="small muted kbc-collect-tip"><PixelIcon name="star" />在 Chrome 打开飞书文档，点右下角「收藏」。归类明确的进对应分组，不明确的放进散卡区。</p>
      {check && <p className={`small ${/仍未能/.test(check) ? "warn-text" : "muted"}`}>{check}</p>}
      <Loadable state={state} name="最近收藏">{(d) => d.items.length ? (
        <ol className="list kb-recent">
          {d.items.map((x) => (
            <li key={x.operationId}>
              <span className="kb-recent-main">
                <span className="kb-recent-title">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : x.title}</span>
                <span className="small muted">{x.parentTitle ? `${x.parentTitle} · ` : ""}{timeText(x.at)}</span>
              </span>
              {x.status === "unknown"
                ? <><Tag tone="amber">结果不明</Tag><button type="button" className="link-btn" disabled={busy} onClick={() => reconcile(x.operationId)}>只读核对</button></>
                : <Tag tone={(STATUS[x.status] || STATUS.failed)[0]}>{(STATUS[x.status] || STATUS.failed)[1]}</Tag>}
            </li>
          ))}
        </ol>
      ) : <p className="small muted">还没有收藏记录</p>}</Loadable>
    </Card>
  );
}
