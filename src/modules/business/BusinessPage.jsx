import { Card, PageHeader, Tag } from "../../ui/components.jsx";
import { LINES } from "../../constants.js";

const METRICS = ["本月", "年度累计", "同比", "环比"];

// 经营策略：只占位，结构为三条业务线各一张指标卡。
export default function BusinessPage() {
  return (
    <>
      <PageHeader title="经营策略" subtitle="三条业务线的月度、年度数据与同环比，快速定位进度与卡点" actions={<Tag tone="orange">待建设</Tag>} />
      <div className="grid-3">
        {LINES.map((line) => (
          <Card key={line} title={line}>
            <div className="metric-grid">
              {METRICS.map((m) => (
                <div key={m} className="metric">
                  <span className="muted small">{m}</span>
                  <strong>—</strong>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
