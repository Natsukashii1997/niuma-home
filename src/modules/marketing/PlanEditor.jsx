import { ArrowLeft, AlertTriangle } from "lucide-react";
import { href } from "../../router.js";
import { Card, PageHeader, PendingButton, SampleBadge, Tag } from "../../ui/components.jsx";
import { PROMO_FIELDS, monthLabel } from "../../constants.js";
import { samplePlanPreview } from "../../samples.js";

// 方案录入：左侧粘贴飞书方案原文，右侧显示解析预览，确认后入库。
// 粘贴读取、解析、预览、入库由 T01 实现；当前右侧为示例。
export default function PlanEditor({ month, line }) {
  const preview = samplePlanPreview;
  return (
    <>
      <a className="back-link" href={href("marketing", "plans")}>
        <ArrowLeft size={14} /> 返回方案
      </a>
      <PageHeader
        title={`${monthLabel(month)} · ${line}`}
        subtitle="从飞书复制方案，粘贴到左侧；解析结果确认后才会写入促销表"
        actions={
          <>
            <PendingButton task="T01">复制原文</PendingButton>
            <PendingButton task="T01" variant="primary">确认入库</PendingButton>
          </>
        }
      />
      <div className="split">
        <Card title="方案原文" extra={<PendingButton task="T01">解析预览</PendingButton>}>
          <div className="paste-box" contentEditable suppressContentEditableWarning data-placeholder="在此粘贴飞书里的方案，例如「🟥【大学辅导板块】1. 灵活学Lite …」" />
        </Card>
        <Card title="解析预览" extra={<SampleBadge task="T01" />}>
          <table className="grid compact">
            <thead>
              <tr>
                <th>SKU</th>
                {PROMO_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}
                <th>对比上月</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.sku}>
                  <td>{r.sku}</td>
                  {PROMO_FIELDS.map(([key]) => (
                    <td key={key} className={r.changed?.includes(key) ? "changed" : ""}>{r[key]}</td>
                  ))}
                  <td>
                    {r.status === "new" ? <Tag tone="orange">新 SKU</Tag> : r.status === "changed" ? <Tag tone="blue">有变化</Tag> : <Tag>无变化</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.unrecognized.length > 0 && (
            <div className="warn">
              <AlertTriangle size={14} /> 有 {preview.unrecognized.length} 行未识别，请手动补充
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
