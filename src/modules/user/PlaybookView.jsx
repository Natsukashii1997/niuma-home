import { useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { href } from "../../router.js";
import { Card, Placeholder, Segmented } from "../../ui/components.jsx";
import { BARRIERS, CATEGORIES, MECHANISMS } from "./playbook.js";
import { PLAYS } from "./playbook-cards.js";

// 打法库：卡片正文是 docs/打法库/P*.md，结构与分类见 docs/打法库/README.md。
// 卡片第二行的障碍、阶段是隐藏标签，只用于筛选和排序，页面上不展示（用户 2026-10-20）。
const README = Object.values(import.meta.glob("../../../docs/打法库/README.md", { query: "?raw", import: "default", eager: true }))[0] || "";
// 列表底部只放库说明里的「价格秩序」「呈现手段」两节
const NOTES = README.split(/\n(?=## )/).filter((s) => /^## [三四]、/.test(s)).map((s) => {
  const [head, ...rest] = s.split("\n");
  return { title: head.replace(/^## [三四]、/, ""), body: rest.join("\n") };
});

const STAGES = [["", "全部阶段"], ["新签", "新签"], ["续费", "续费"]];
const mechName = (m) => MECHANISMS[m]?.[0] || m;
// 选中某个障碍时：主障碍排前（0），辅障碍其次（1），不相关为 -1；没选障碍时都算 0。
const rank = (p, bar) => (!bar || p.barriers.main.includes(bar) ? 0 : p.barriers.sub.includes(bar) ? 1 : -1);
// 列表卡只放定位的开头：第一句太短（如「早鸟价是一笔双向交易。」）时带上第二句
const leadOf = (s) => { const [a = s, b = ""] = s.match(/[^。]+。/g) || []; return a.length < 24 ? a + b : a; };

export function Playbook({ route }) {
  const id = route[0];
  if (!id) return <PlayList />;
  const play = PLAYS.find((p) => p.id === id);
  if (!play) return <Placeholder icon="search" title={`没有编号为 ${id} 的打法`} action={<a className="back-link" href={href("user", "playbook")}>回到促销打法</a>} />;
  return <PlayDetail play={play} />;
}

function PlayList() {
  const [bar, setBar] = useState("");
  const [stage, setStage] = useState("");
  const [q, setQ] = useState("");
  const kw = q.trim().toLowerCase();
  // 「通用」同时属于新签和续费
  const base = PLAYS.filter((p) => (!stage || p.stage === stage || p.stage === "通用")
    && (!kw || `${p.name}${p.lead}${p.mechs.map(mechName).join("")}`.toLowerCase().includes(kw)));
  const count = (b) => base.filter((p) => rank(p, b) >= 0).length;
  const list = base.filter((p) => rank(p, bar) >= 0);
  return (
    <>
      <div className="filter-bar plb-bars">
        <button type="button" className={`chip${!bar ? " is-on" : ""}`} onClick={() => setBar("")}>全部障碍 <span className="tnum">{base.length}</span></button>
        {BARRIERS.map(([group, groupName, items]) => (
          <span key={group} className="plb-bar-group">
            <span className="label">{group} {groupName}</span>
            {items.map(([code, name]) => (
              <button key={code} type="button" className={`chip${bar === code ? " is-on" : ""}`} aria-pressed={bar === code} onClick={() => setBar(bar === code ? "" : code)}>
                {code} {name} <span className="tnum">{count(code)}</span>
              </button>
            ))}
          </span>
        ))}
      </div>
      <div className="filter-bar">
        <Segmented options={STAGES} value={stage} onChange={setStage} />
        <label className="search-box"><PixelIcon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜打法或心理机制，如 早鸟 / 损失厌恶" aria-label="搜索打法" />{q && <button type="button" className="icon-btn" onClick={() => setQ("")} aria-label="清除搜索"><PixelIcon name="close" /></button>}</label>
        <span className="small muted">{list.length} / {PLAYS.length} 种{bar ? "，主要解决该障碍的排在前面" : ""}</span>
      </div>
      {!list.length && <Placeholder icon="search" title="没有符合条件的打法">换一个障碍、阶段或关键词试试。</Placeholder>}
      {CATEGORIES.map(([name, question], i) => {
        const items = list.filter((p) => p.cat === i + 1).sort((a, b) => rank(a, bar) - rank(b, bar));
        if (!items.length) return null;
        return (
          <section key={name}>
            <div className="section-head plb-cat-head">
              <span className="label tnum">{String(i + 1).padStart(2, "0")}</span>
              <h2>{name}</h2>
              <span className="small muted">回答「{question}」</span>
              <span className="label tnum plb-cat-count">{items.length} 种</span>
            </div>
            <div className="plb-grid cols-4-4-4">{items.map((p) => <PlayTile key={p.id} play={p} />)}</div>
          </section>
        );
      })}
      {NOTES.length > 0 && (
        <div className="plb-notes cols-6-6">
          {NOTES.map((n) => <Card key={n.title} title={n.title}><CardDoc text={n.body} /></Card>)}
        </div>
      )}
    </>
  );
}

function PlayTile({ play }) {
  return (
    <a className="plb-tile" href={href("user", "playbook", play.id)} data-dither="">
      <span className="plb-tile-head"><strong className="plb-tile-name">{play.name}</strong><span className="label tnum">{play.id}</span></span>
      <p className="plb-tile-lead">{leadOf(play.lead)}</p>
      <span className="plb-tile-mechs">
        {play.mechs.map((m, i) => <span key={m} className={i ? "" : "is-main"}>{mechName(m)}</span>)}
      </span>
    </a>
  );
}

function PlayDetail({ play }) {
  const [catName, question] = CATEGORIES[play.cat - 1];
  const siblings = PLAYS.filter((p) => p.cat === play.cat);
  return (
    <>
      <a className="back-link" href={href("user", "playbook")}><PixelIcon name="left" />促销打法 · {catName}</a>
      <div className="plb-detail cols-9-3">
        <Card title={<><span className="label tnum">{play.id}</span>{play.name}</>} className="plb-doc-card">
          <CardDoc text={play.body} />
        </Card>
        <div className="plb-side">
          <Card title="心理机制">
            <ul className="plb-mech-list">
              {play.mechs.map((m, i) => (
                <li key={m}>
                  <span className="plb-mech-name">{mechName(m)}<span className="label">{i ? "辅" : "主"}</span></span>
                  <span className="small muted">{MECHANISMS[m]?.[1]}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={`${catName} · ${siblings.length} 种`}>
            <p className="small muted plb-side-q">回答「{question}」</p>
            <ul className="plb-sib-list">
              {siblings.map((p) => (
                <li key={p.id}>
                  <a href={href("user", "playbook", p.id)} className={p.id === play.id ? "is-on" : ""} aria-current={p.id === play.id ? "page" : undefined}>
                    <span className="label tnum">{p.id}</span>{p.name}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// 卡片 Markdown 只用到：## / ### 标题、段落、两级列表、表格、**加粗**；按这几种写一个专用渲染，
// 不改公共 Markdown 组件（它不支持嵌套列表，表格首列样式也是给编号列用的）。
function Inline({ text }) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((s, i) => (s.startsWith("**") ? <strong key={i}>{s.slice(2, -2)}</strong> : s));
}

function parseDoc(text) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    if (h) { blocks.push({ type: `h${h[1].length}`, text: h[2] }); i += 1; continue; }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i += 1) {
        if (!/^\s*\|[\s|:-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      }
      blocks.push({ type: "table", head: rows[0], rows: rows.slice(1) });
      continue;
    }
    if (/^\s*- /.test(line)) {
      const items = [];
      for (; i < lines.length && /^\s*- /.test(lines[i]); i += 1) {
        const text = lines[i].replace(/^\s*- /, "");
        if (/^\s{2,}- /.test(lines[i]) && items.length) items[items.length - 1].sub.push(text);
        else items.push({ text, sub: [] });
      }
      blocks.push({ type: "list", items });
      continue;
    }
    if (/^>\s?/.test(line)) { blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") }); i += 1; continue; }
    if (/^```/.test(line)) { i += 1; const code = []; for (; i < lines.length && !/^```/.test(lines[i]); i += 1) code.push(lines[i]); i += 1; blocks.push({ type: "code", text: code.join("\n") }); continue; }
    blocks.push({ type: "para", text: line });
    i += 1;
  }
  return blocks;
}

function CardDoc({ text }) {
  return (
    <div className="md plb-doc">
      {parseDoc(text).map((b, i) => {
        if (b.type === "h2") return <h3 key={i} className="md-h md-h2">{b.text}</h3>;
        if (b.type === "h3") return <h4 key={i} className="md-h md-h3">{b.text}</h4>;
        if (b.type === "quote") return <p key={i} className="plb-quote"><Inline text={b.text} /></p>;
        if (b.type === "code") return <pre key={i} className="plb-code">{b.text}</pre>;
        if (b.type === "list") return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inline text={it.text} />{it.sub.length > 0 && <ul>{it.sub.map((s, k) => <li key={k}><Inline text={s} /></li>)}</ul>}</li>)}</ul>;
        if (b.type === "table") return (
          <div key={i} className="plb-table">
            <table className="grid compact">
              <thead><tr>{b.head.map((c, j) => <th key={j}><Inline text={c} /></th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return <p key={i}><Inline text={b.text} /></p>;
      })}
    </div>
  );
}
