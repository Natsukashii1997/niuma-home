import { parseCard } from "./playbook.js";

// 打法卡片（docs/打法库/P*.md）在构建时读入；打法库页签和用户策略页共用。
const RAW = import.meta.glob("../../../docs/打法库/P*.md", { query: "?raw", import: "default", eager: true });
export const PLAYS = Object.keys(RAW).sort().map((k) => parseCard(RAW[k])).filter(Boolean);
export const PLAY_BY_ID = Object.fromEntries(PLAYS.map((p) => [p.id, p]));
