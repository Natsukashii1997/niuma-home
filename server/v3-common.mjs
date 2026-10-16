export const failure = (status, message) => Object.assign(new Error(message), { status });
export const beijingText = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
export const validMonth = month => typeof month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);
export function requireMonth(month) {
  if (!validMonth(month)) throw failure(400, '月份须为 YYYY-MM');
  return month;
}
export function saveSnapshot(db, kind, payload, at) {
  db.prepare('INSERT INTO v3_snapshots (kind,payload,updated_at) VALUES (?,?,?) ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(kind, JSON.stringify(payload), at);
}
