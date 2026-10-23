import { useState } from "react";
import { apiSend } from "../../api.js";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { Button, Modal } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";

// 时间表年份（用户 2026-10-23）：列出已登记的每年飞书时间表，并登记新的一年。
// 先只读检查（解析链接、校验 4 张地区明细 + 12 张月历、试解析），确认后才写入，写入后自动同步全部年份并回读。
export function TimelineYears({ tl, open, onClose, onSynced }) {
  const [url, setUrl] = useState("");
  const flow = useWriteFlow();
  const years = tl.years || [];
  const check = () => flow.preview(() => apiSend("POST", "/api/v3/timeline/years/preview", { url: url.trim() }));
  const confirm = () => flow.confirm(
    (p) => apiSend("POST", "/api/v3/timeline/years/confirm", { previewId: p.previewId, confirm: true }),
    async (receipt, p) => {
      if (receipt.syncError) return `已登记 ${p.summary.year} 年，但同步没完成：${receipt.syncError}。稍后在用户时间页点「同步」`;
      const back = await apiSend("GET", "/api/v3/timeline");
      if (!back.years?.some((y) => y.year === p.summary.year)) return false;
      onSynced(back);
      setUrl("");
      return true;
    });
  return (
    <Modal open={open} onClose={onClose} wide icon="calendar" title="时间表年份">
      <table className="grid compact tl-years">
        <thead><tr><th>年份</th><th>飞书表</th><th className="r">学校</th><th className="r">日期</th><th className="r">AI 推测</th></tr></thead>
        <tbody>{years.map((y) => <tr key={y.year}>
          <td className="tnum">{y.year}</td>
          <td>{y.url ? <a className="link" href={y.url} target="_blank" rel="noreferrer">{y.title}<PixelIcon name="external" /></a> : y.title}</td>
          <td className="r tnum">{y.schools}</td><td className="r tnum">{y.events}</td><td className="r tnum">{y.anomalies}</td>
        </tr>)}</tbody>
      </table>
      <div className="label tl-years-add">添加年份</div>
      <p className="small muted">粘贴新一年的飞书时间线表链接。表名要带年份（如「2027海外大学时间线」），结构和现在的表一样：4 张地区明细 + 12 张月历。先只读检查，确认后才登记；登记后自动同步，并照常生成 AI 推测待核项。</p>
      <div className="row tl-years-input">
        <input className="set-input" value={url} onChange={(e) => { setUrl(e.target.value); flow.reset(); }} placeholder="https://….feishu.cn/wiki/…" aria-label="飞书时间线表链接" />
        <Button onClick={check} disabled={!url.trim() || flow.phase === "previewing" || flow.phase === "confirming"}>检查</Button>
      </div>
      <WriteBox flow={flow} title="登记前检查" confirmLabel="确认登记并同步" savedText="已登记并同步，回读核对一致" onConfirm={confirm} onRepreview={check} onReread={() => { flow.resolve(); }}>
        {(p) => <dl className="kv">
          <dt>年份</dt><dd className="tnum">{p.summary.year}</dd>
          <dt>飞书表</dt><dd>{p.summary.title}</dd>
          <dt>结构</dt><dd>{p.summary.regionSheets} 张地区明细 · {p.summary.calendarSheets} 张月历</dd>
          <dt>内容</dt><dd className="tnum">{p.summary.schools} 所学校 · {p.summary.events} 条日期 · {p.summary.anomalies} 条 AI 推测待核</dd>
          <dt>日期范围</dt><dd className="tnum">{p.summary.from || "—"} → {p.summary.to || "—"}</dd>
        </dl>}
      </WriteBox>
    </Modal>
  );
}
