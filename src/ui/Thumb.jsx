// 物料缩略图。有真实图片（src）时直接显示；没有时用版式示意（示例数据阶段），
// 示意只用墨色、网点和至多一处信号橙，避免被误认为真实物料。
export default function Thumb({ src, kind = "poster", title = "", big = "", accent = false, alt = "" }) {
  if (src) return <span className={`thumb thumb-img thumb-${kind}`}><img src={src} alt={alt || title} loading="lazy" /></span>;
  if (kind === "grid9" || kind === "grid3") {
    const n = kind === "grid9" ? 9 : 3;
    return (
      <span className={`thumb thumb-${kind}`} aria-label={`${title}（示意）`}>
        {Array.from({ length: n }, (_, i) => {
          const center = kind === "grid9" ? i === 4 : i === 0;
          const t = (i * 7 + title.length) % 3;
          return (
            <span key={i} className={`t-tile${center && accent ? " is-accent" : ""}`}>
              {center && big ? <b>{big}</b> : t === 0 ? <span className="t-ink" /> : t === 1 ? <span className="t-dither" /> : <span className="t-lines"><i /><i /></span>}
            </span>
          );
        })}
      </span>
    );
  }
  return (
    <span className={`thumb thumb-${kind}${accent ? " is-accent" : ""}`} aria-label={`${title}（示意）`}>
      <span className="t-head"><span className="t-logo" /><span className="t-corner" /></span>
      <span className="t-title">{title}</span>
      {big ? <b className="t-big">{big}</b> : <span className="t-dither t-block" />}
      <span className="t-lines"><i /><i /><i /></span>
      <span className="t-foot"><span className="t-qr" /><span className="t-lines"><i /></span></span>
    </span>
  );
}
