// Style guard: forbids hard-coded white/black/slate utilities and #fff/#000 in src/.
// Escape hatch: put `/* style-guard-ignore */` or `// style-guard-ignore` on the same line.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
// Class names are case-sensitive; hex colours are not.
const RE_CLASS = /\b(?:bg-white|text-white|bg-black|text-black|text-slate-\d+|bg-slate-\d+|border-slate-\d+|divide-slate-\d+)\b/g;
const RE_HEX = /#(?:fff|ffffff|000|000000)\b/gi;
// Ignore marker must be a real comment, not any substring.
const IGNORE = /\/\/\s*style-guard-ignore\b|\/\*\s*style-guard-ignore\s*\*\//;
const EXT = /\.(ts|tsx|css)$/;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.test(e.name)) yield p;
  }
}

let hits = 0;
for (const file of walk(ROOT)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (IGNORE.test(line)) return;
    for (const m of [...line.matchAll(RE_CLASS), ...line.matchAll(RE_HEX)]) {
      hits++;
      console.log(`${path.relative(process.cwd(), file).replace(/\\/g, '/')}:${i + 1}: ${m[0]}`);
    }
  });
}
console.log(`\nstyle guard: ${hits} violation(s)`);
process.exit(hits ? 1 : 0);
