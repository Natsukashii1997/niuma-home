// 样式、监听与时间显示硬规则检查：只查机器能判定的几条（AGENTS.md「规则」、docs/STYLE-GUIDE.md 动效与文案、LESSONS L-03）。
// 阴影、圆角、渐变的现有合法用法多（内描边、网点背景、圆点），机检会误报，仍靠人工。
// 用法：npm run check:style；npm test 里的 tests/style-rules.test.mjs 也会跑。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = {
  motion: '动效只用 src/ui/bitmap.jsx 的按帧组件，不写 CSS transition / animation / @keyframes（AGENTS.md 规则、STYLE-GUIDE 动效）',
  library: '不引入图标库、UI 框架、CSS-in-JS 或动画库，图标只用 PixelIcon（AGENTS.md 规则）',
  listen: '只监听 127.0.0.1（AGENTS.md 规则）',
  time: '页面上的时间用 src/constants.js 的 beijingTime 按北京时间显示，不直接截取 ISO 字符串（LESSONS L-03）；截取的确实是北京时间字符串时，在行内注释写「北京时间」',
};
const MOTION = /@keyframes\b|\b(transition|animation)([A-Z-][\w-]*)?\s*:/;
// 截取 *At 字段当日期时间显示，或把 ISO 的 T 换成空格：多半把 UTC 当成了北京时间
const TIME = [/\b\w*(?:At|_at)\.slice\(\s*(?:0\s*,\s*1[06]|5\s*,\s*16|11\s*,\s*16)\s*\)/, /\.replace\(\s*["']T["']\s*,\s*["'] ["']\s*\)/];
const TIME_OK = /\/[/*]\s*北京时间/;
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
const LISTEN_OK = /\.listen\(\s*[\w.]+\s*,\s*['"]127\.0\.0\.1['"]/;
const BANNED = ['lucide', 'lucide-react', 'react-icons', '@heroicons', '@fortawesome', '@mui', 'antd', '@ant-design', '@chakra-ui', '@radix-ui',
  'bootstrap', 'react-bootstrap', 'tailwindcss', 'styled-components', '@emotion', 'framer-motion', 'motion', 'gsap'];
const banned = name => BANNED.some(b => name === b || name.startsWith(`${b}/`));

function files(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : files(file, exts);
    return exts.includes(path.extname(entry.name)) ? [file] : [];
  });
}

export function checkStyle(root) {
  const found = [];
  const hit = (file, line, kind, text) => found.push({ file: path.relative(root, file), line, kind, rule: RULES[kind], text: text.trim() });
  const scan = (file, kindOf) => fs.readFileSync(file, 'utf8').split('\n').forEach((text, i) => { const kind = kindOf(text); if (kind) hit(file, i + 1, kind, text); });
  for (const file of files(path.join(root, 'src'), ['.css', '.js', '.jsx', '.mjs']))
    scan(file, text => MOTION.test(text) ? 'motion'
      : TIME.some(r => r.test(text)) && !TIME_OK.test(text) ? 'time'
      : [...text.matchAll(IMPORT)].some(m => banned(m[1])) ? 'library' : null);
  for (const file of files(path.join(root, 'server'), ['.js', '.mjs']))
    scan(file, text => text.includes('.listen(') && !LISTEN_OK.test(text) ? 'listen' : null);
  const pkgFile = path.join(root, 'package.json');
  if (fs.existsSync(pkgFile)) {
    const text = fs.readFileSync(pkgFile, 'utf8'), pkg = JSON.parse(text), lines = text.split('\n');
    const at = key => lines.findIndex(line => line.includes(`"${key}":`)) + 1;
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(banned)) hit(pkgFile, at(name), 'library', name);
    // 开发页 / 预览页须带 --host 127.0.0.1；vite build 不监听端口
    for (const [name, command] of Object.entries(pkg.scripts ?? {}))
      if (/\bvite\b(?!\s+build)/.test(command) && !/--host\s+127\.0\.0\.1\b/.test(command)) hit(pkgFile, at(name), 'listen', `${name}: ${command}`);
  }
  return found;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = checkStyle(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  for (const v of found) console.error(`${v.file}:${v.line}  ${v.text}\n  ↳ ${v.rule}`);
  if (found.length) { console.error(`样式检查未通过：${found.length} 处`); process.exitCode = 1; }
  else console.log('样式检查通过');
}
