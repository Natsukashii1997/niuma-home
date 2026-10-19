import { Fragment, useEffect, useState } from "react";
import { useApi } from "../../api.js";
import { deliveryMonth } from "../../constants.js";
import { USER_STRATEGY } from "../../samples.js";
import { Loadable, MonthSwitch, PendingButton, SampleStrip, Tag } from "../../ui/components.jsx";

// 用户策略（2026-10-19 重做，结构见 docs/用户策略规范.md）：
// 0 核心结论 → 1 全局研判 → 2 用户洞察（地区矩阵）→ 3 机会收敛 → 4 促销策略 → 附 依据与待确认。
// 每条内容是 [正文, 来源]；来源只在「推测」时着色，其余灰字，避免满屏标签。
const SECTIONS = [["us-0", "0", "核心结论"], ["us-1", "1", "全局研判"], ["us-2", "2", "用户洞察"], ["us-3", "3", "机会收敛"], ["us-4", "4", "促销策略"], ["us-a", "附", "依据与待确认"]];
const TIER_TONE = { 主战场: "ink", 次要: "frame", 平稳: "neutral" };
const TEMP = { 冷: 1, 温: 2, 热: 3 };
const ROWS = [["node", "用户节点"], ["task", "待办任务"], ["pain", "核心痛点"], ["temp", "需求温度"], ["barrier", "决策障碍"], ["opp", "机会点"], ["master", "硕士关注"]];
const BARRIERS = [
  ["A 动机不足", [["A1", "没意识到需要"], ["A2", "觉得还来得及"], ["A3", "不信任效果"], ["A4", "有替代品"]]],
  ["B 能力受限", [["B1", "嫌贵"], ["B2", "怕选错"], ["B3", "没时间"], ["B4", "需要家长同意"]]],
  ["C 触发缺失", [["C1", "没被触达 / 不知道我们能帮"]]],
];

export function Strategy() {
  const [month, setMonth] = useState(deliveryMonth);
  const state = useApi(`/api/v3/user-strategy?month=${month}`, USER_STRATEGY);
  return (
    <div className="us-page">
      <div className="us-bar">
        <MonthSwitch month={month} onChange={setMonth} />
        {state.data && <><Tag tone="amber">{state.data.status}</Tag><span className="small muted tnum">生成于 {state.data.generatedAt}</span></>}
        <span className="us-bar-actions">
          <PendingButton task="T13-用户策略生成">生成草稿</PendingButton>
          <PendingButton task="T13-用户策略生成">定稿</PendingButton>
          <PendingButton task="T13-用户策略生成">导出到飞书</PendingButton>
        </span>
      </div>
      {state.isSample && <SampleStrip task={`${state.task || "T13"} · 示例只有 ${USER_STRATEGY.month}`} />}
      <Loadable state={state} name="用户策略" big>{(d) => <Report d={d} />}</Loadable>
    </div>
  );
}

function Report({ d }) {
  const active = useActiveSection();
  const go = (id) => document.getElementById(id)?.scrollIntoView({ block: "start" });
  return (
    <>
      <nav className="us-nav" aria-label="段落导航">
        {SECTIONS.map(([id, no, name]) => (
          <button key={id} type="button" className={active === id ? "is-cur" : ""} onClick={() => go(id)}><b>{no}</b>{name}</button>
        ))}
      </nav>
      <Summary d={d} />
      <Overview d={d} />
      <Insight d={d} />
      <Opportunities d={d} />
      <Promo d={d} />
      <Appendix d={d} />
    </>
  );
}

// 吸顶导航高亮：取最靠上的、已进入视口上半部的段落。
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  useEffect(() => {
    const onScroll = () => {
      let cur = SECTIONS[0][0];
      for (const [id] of SECTIONS) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return active;
}

function Sec({ id, no, title, desc, children }) {
  return (
    <section id={id} className="card us-sec">
      <div className="card-head"><h2><span className="us-no">{no}</span>{title}</h2>{desc && <span className="small muted">{desc}</span>}</div>
      <div className="card-body">{children}</div>
    </section>
  );
}

const Src = ({ s }) => <span className={`us-src${s === "推测" ? " is-guess" : ""}`}>{s}</span>;
const Items = ({ list }) => (list.length ? <ul className="us-items">{list.map(([t, s], i) => <li key={i}>{t}<Src s={s} /></li>)}</ul> : <span className="muted">—</span>);

function Temp({ from, to }) {
  const cells = (lv) => <span className="us-temp" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={n <= TEMP[lv] ? "on" : ""} />)}</span>;
  return <span className="us-temp-row"><b>{from}</b>{cells(from)}{to && to !== from && <><span className="muted">→</span><b>{to}</b>{cells(to)}</>}</span>;
}

/* ---------- 0 核心结论 ---------- */
function Summary({ d }) {
  const s = d.summary;
  return (
    <Sec id="us-0" no="0" title="核心结论" desc={`${d.month} · 一屏读完`}>
      <p className="us-judge">{s.judgement}</p>
      <div className="us-summary">
        <div><span className="label">本月目标 · AI 建议，可改</span><p>{s.goal}</p></div>
        <div><span className="label">主打法</span>
          <dl className="us-plays">{s.plays.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        </div>
      </div>
    </Sec>
  );
}

/* ---------- 1 全局研判 ---------- */
const day = (s) => Date.UTC(...s.split("-").map((n, i) => (i === 1 ? n - 1 : +n))) / 86400000;
function Overview({ d }) {
  const o = d.overview;
  const start = day(d.window.from), end = day(d.window.preheatTo), total = end - start + 1;
  const pos = (from, to) => ({ left: `${((day(from) - start) / total) * 100}%`, width: `${((day(to) - day(from) + 1) / total) * 100}%` });
  const pre = pos(shiftDay(d.window.to, 1), d.window.preheatTo);
  const ticks = [];
  for (let t = start; t <= end; t += 7) ticks.push(t);
  const tier = Object.fromEntries(o.tiers.map(([k, t]) => [k, t]));
  return (
    <Sec id="us-1" no="1" title="全局研判" desc="时间窗：目标月整月 + 下月前 14 天（提前预热）">
      <h3 className="us-h3">1.1 时间全景</h3>
      <div className="us-gantt">
        <div className="us-g-head">
          <span />
          <div className="us-g-track">
            <span className="us-g-pre" style={pre} />
            {ticks.map((t) => <span key={t} className="us-g-tick tnum" style={{ left: `${((t - start) / total) * 100}%` }}>{mmdd(t)}</span>)}
          </div>
        </div>
        {o.lanes.map(([key, name, bars]) => {
          const placed = stack(bars);
          return (
            <div key={key} className="us-g-row">
              <span className="us-g-name">{name}<Tag tone={TIER_TONE[tier[key]]}>{tier[key]}</Tag></span>
              <div className="us-g-track" style={{ height: 12 + 24 * placed.lanes }}>
                <span className="us-g-pre" style={pre} />
                {o.markers.map(([dt]) => <i key={dt} className="us-g-mark" style={{ left: pos(dt, dt).left }} />)}
                {placed.bars.map(([[from, to, cat, label, guess], lane]) => (
                  <span key={label} className={`us-g-bar ev-${cat}${guess ? " is-guess" : ""}`} style={{ ...pos(from, to), top: 6 + 24 * lane }} title={`${label} ${from.slice(5)} → ${to.slice(5)}${guess ? "（推测）" : ""}`}>{label}</span>
                ))}
              </div>
            </div>
          );
        })}
        <div className="us-g-foot small muted">
          竖线为外部节点：{o.markers.map(([dt, n]) => `${n} ${dt.slice(5)}`).join(" · ")}；网点区为提前预热（{shiftDay(d.window.to, 1).slice(5)} → {d.window.preheatTo.slice(5)}）；虚线框为推测日期。
        </div>
      </div>

      <h3 className="us-h3">1.2 共性与差异</h3>
      <div className="us-cols">
        <div><span className="label">共性</span><Items list={o.common} /></div>
        <div><span className="label">差异</span><Items list={o.diff} /></div>
        <div><span className="label">外部变量</span><Items list={o.external} /></div>
      </div>

      <h3 className="us-h3">1.3 地区分档 <span className="small muted">权重 × 本月节点密度；权重：英国 ≥ 美国 &gt; 香港 &gt; 澳洲 &gt; 加拿大 &gt; 新加坡 &gt; 其他</span></h3>
      <ul className="us-tiers">
        {["主战场", "次要", "平稳"].map((t) => (
          <li key={t}><Tag tone={TIER_TONE[t]}>{t}</Tag>
            <span>{o.tiers.filter(([, x]) => x === t).map(([k, , why]) => <span key={k} className="us-tier-item"><b>{d.regions.find((r) => r.key === k)?.name}</b>{why}</span>)}</span>
          </li>
        ))}
      </ul>
    </Sec>
  );
}
// 同一地区时间重叠的节点条分行放，避免互相遮挡。
function stack(bars) {
  const ends = [];
  const placed = bars.map((b) => {
    let lane = ends.findIndex((e) => e < b[0]);
    if (lane < 0) lane = ends.length;
    ends[lane] = b[1];
    return [b, lane];
  });
  return { bars: placed, lanes: ends.length };
}
const mmdd = (t) => new Date(t * 86400000).toISOString().slice(5, 10).replace("-", "/");
const shiftDay = (s, n) => new Date((day(s) + n) * 86400000).toISOString().slice(0, 10);

/* ---------- 2 用户洞察：行 = 6 格，列 = 地区（按权重） ---------- */
function Insight({ d }) {
  const rows = ROWS.filter(([k]) => k !== "master" || d.regions.some((r) => r.master.length));
  return (
    <Sec id="us-2" no="2" title="用户洞察" desc="痛点是学业阻力，决策障碍是购买阻力">
      <details className="us-legend">
        <summary className="small">决策障碍词表（动机 × 能力 × 触发）· 来源标注</summary>
        <div className="us-legend-body">
          {BARRIERS.map(([g, list]) => <div key={g}><span className="label">{g}</span>{list.map(([c, t]) => <span key={c} className="us-bar-item"><b className="us-code">{c}</b>{t}</span>)}</div>)}
          <div><span className="label">来源</span><span className="small">时间线 · 规则推导 · 原声 · AI 判断 · <span className="us-src is-guess">推测</span> · 你写的</span></div>
        </div>
      </details>
      <div className="table-wrap us-matrix-wrap">
        <table className="grid us-matrix">
          <colgroup><col className="us-c-head" />{d.regions.map((r) => <col key={r.key} />)}</colgroup>
          <thead><tr><th>维度</th>{d.regions.map((r) => <th key={r.key}><span className="us-m-region">{r.name}</span><Tag tone={TIER_TONE[r.tier]}>{r.tier}</Tag></th>)}</tr></thead>
          <tbody>
            {rows.map(([k, label]) => (
              <tr key={k}>
                <th scope="row">{label}</th>
                {d.regions.map((r) => (
                  <td key={r.key}>
                    {k === "temp" ? <><Temp from={r.temp[0]} to={r.temp[1]} /><Items list={r.tempNote} /></>
                      : k === "barrier" ? <ul className="us-items">{r.barrier.map(([c, t, s]) => <li key={c}><b className="us-code">{c}</b>{t}<Src s={s} /></li>)}</ul>
                      : <Items list={r[k]} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sec>
  );
}

/* ---------- 3 机会收敛 ---------- */
function Opportunities({ d }) {
  return (
    <Sec id="us-3" no="3" title="机会收敛" desc="跨地区合并、排序，收敛为本月目标">
      <div className="table-wrap">
        <table className="grid us-opps">
          <thead><tr><th>优先级</th><th>机会</th><th>地区</th><th>业务线</th><th>新签 / 续费</th><th>窗口</th><th>依据</th></tr></thead>
          <tbody>{d.opportunities.map(([p, name, region, line, kind, win, why]) => (
            <tr key={name}><td><Tag tone={p === "P0" ? "orange" : "neutral"}>{p}</Tag></td><td><strong>{name}</strong></td><td>{region}</td><td>{line}</td><td>{kind}</td><td className="tnum">{win}</td><td className="small">{why}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="us-goal"><span className="label">→ 本月目标 · AI 建议，可改</span><p>{d.summary.goal}</p><PendingButton task="T13-用户策略生成">修改目标</PendingButton></div>
    </Sec>
  );
}

/* ---------- 4 促销策略 ---------- */
function Promo({ d }) {
  const p = d.promo;
  return (
    <Sec id="us-4" no="4" title="促销策略" desc="只给打法与理由；定价归价格模块">
      <h3 className="us-h3">4.1 打法组合</h3>
      <div className="us-lines">
        {Object.entries(p.lines).map(([line, plays]) => (
          <div key={line} className="us-line">
            <div className="us-line-head">{line}</div>
            <ul>{plays.map(([role, play, how, scope]) => (
              <li key={play}><span className="label">{role}</span><div><strong>{play}</strong><p className="small">{how}</p><span className="us-scope small muted">{scope}</span></div></li>
            ))}</ul>
          </div>
        ))}
      </div>

      <h3 className="us-h3">4.2 选择逻辑 <span className="small muted">决策障碍 → 心理机制 → 打法 → 作用路径</span></h3>
      <div className="table-wrap">
        <table className="grid us-logic">
          <thead><tr><th>决策障碍</th><th>心理机制</th><th>打法</th><th>作用路径</th></tr></thead>
          <tbody>{p.logic.map(([b, m, play, path]) => <tr key={b}><td><strong>{b}</strong></td><td>{m}</td><td>{play}</td><td>{path}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="us-cols is-2">
        <div><h3 className="us-h3">4.3 不选什么</h3>
          <ul className="us-items">{p.exclude.map(([play, why]) => <li key={play}><strong>不做{play}</strong>：{why}</li>)}</ul>
        </div>
        <div><h3 className="us-h3">4.4 底线</h3>
          <ul className="us-items">{p.floor.map(([k, t]) => <li key={k}><strong>{k}</strong>：{t}</li>)}</ul>
        </div>
      </div>
    </Sec>
  );
}

/* ---------- 附 依据与待确认 ---------- */
function Appendix({ d }) {
  return (
    <Sec id="us-a" no="附" title="依据与待确认" desc="节点日期来自飞书《2026 海外大学时间线》">
      <div className="us-cols is-2">
        <div><span className="label">推测项</span><ul className="us-items">{d.appendix.guesses.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div><span className="label">待确认</span><ul className="us-items">{d.appendix.pending.map((t) => <li key={t}>{t}</li>)}</ul></div>
      </div>
    </Sec>
  );
}
