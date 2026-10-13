import { useState } from "react";
import { ImageIcon, Plus } from "lucide-react";
import { useApi } from "../../api.js";
import { Empty, FilterBar, Loadable, PendingButton, SampleBadge, Select, Tag } from "../../ui/components.jsx";
import { LINES, monthLabel } from "../../constants.js";
import { sampleMaterials } from "../../samples.js";

// 物料：按月份分组的卡片网格，可按月份、业务线、类型筛选。新建、上传图片由 T03 实现。
export default function MaterialsView() {
  const state = useApi("/api/materials", sampleMaterials);
  return (
    <Loadable state={state}>
      {(items) => <MaterialGrid items={items} isSample={state.isSample} task={state.task} />}
    </Loadable>
  );
}

function MaterialGrid({ items, isSample, task }) {
  const [filter, setFilter] = useState({ month: "", line: "", type: "" });
  const set = (k) => (v) => setFilter((f) => ({ ...f, [k]: v }));
  const shown = items.filter((m) => (!filter.month || m.month === filter.month) && (!filter.line || m.line === filter.line) && (!filter.type || m.type === filter.type));
  const months = [...new Set(shown.map((m) => m.month))].sort().reverse();

  return (
    <>
      <FilterBar>
        <Select label="月份" value={filter.month} options={[...new Set(items.map((m) => m.month))].sort().reverse()} onChange={set("month")} />
        <Select label="业务线" value={filter.line} options={LINES} onChange={set("line")} />
        <Select label="类型" value={filter.type} options={[...new Set(items.map((m) => m.type))]} onChange={set("type")} />
        {isSample && <SampleBadge task={task} />}
        <div className="spacer" />
        <PendingButton task="T03" variant="primary">
          <Plus size={14} /> 新建物料
        </PendingButton>
      </FilterBar>
      {months.length === 0 && <Empty>还没有物料</Empty>}
      <div className="stack">
        {months.map((month) => (
          <section key={month}>
            <h3 className="section-title">{monthLabel(month)}</h3>
            <div className="material-grid">
              {shown
                .filter((m) => m.month === month)
                .map((m) => (
                  <article key={m.id} className="material-card">
                    <div className="material-thumb">
                      <ImageIcon size={28} strokeWidth={1.4} />
                      <span>{m.images} 张图</span>
                    </div>
                    <div className="material-info">
                      <strong>{m.name}</strong>
                      <div className="tag-row">
                        <Tag tone="blue">{m.type}</Tag>
                        <Tag>{m.line}</Tag>
                        {m.skus.map((s) => <Tag key={s}>{s}</Tag>)}
                      </div>
                      {m.note && <p className="muted small">{m.note}</p>}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
