// Validate local photo drop-ins for "real photo" mode.
//
//   1. Put images in assets/custom/ named <ingredient-id>.{jpg,jpeg,png,webp,avif}
//      e.g. assets/custom/tomato.jpg, assets/custom/provolone.png
//   2. npm run assets:ingest   → shows what matched, what didn't, and near-miss suggestions
//   3. npm run dev             → matched ingredients render as photos
//
// assets/custom/ is gitignored: these images stay on your machine and are never committed.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets', 'custom');
const source = readFileSync(join(root, 'src', 'data', 'ingredients.ts'), 'utf8');
const ids = [...source.matchAll(/id: '([a-z0-9-]+)',\s*name: '([^']+)'/g)].map((m) => ({
  id: m[1],
  name: m[2],
}));
const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const files = readdirSync(dir).filter((f) => EXT.has(extname(f).toLowerCase()));
const byId = new Map(ids.map((i) => [i.id, i]));

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

const matched = [];
const unknown = [];
for (const f of files) {
  const id = f.slice(0, -extname(f).length).toLowerCase();
  if (byId.has(id)) matched.push({ id, file: f });
  else {
    const best = ids.map((i) => ({ id: i.id, d: lev(id, i.id) })).sort((a, b) => a.d - b.d)[0];
    unknown.push({ file: f, suggestion: best && best.d <= 4 ? best.id : null });
  }
}

writeFileSync(
  join(root, 'assets', 'manifest.local.json'),
  `${JSON.stringify({ generated: new Date().toISOString(), matched }, null, 2)}\n`,
);

console.log(`\nPhoto drop-ins in assets/custom/  (${files.length} image${files.length === 1 ? '' : 's'})\n`);
for (const m of matched) console.log(`  ✓ ${m.file.padEnd(28)} → ${byId.get(m.id).name}`);
for (const u of unknown)
  console.log(
    `  ✗ ${u.file.padEnd(28)}   unknown id${u.suggestion ? ` — did you mean "${u.suggestion}"?` : ''}`,
  );
const missing = ids.filter((i) => !matched.some((m) => m.id === i.id));
console.log(
  `\n${matched.length}/${ids.length} ingredients have photos. ${missing.length ? `Procedural art covers the rest.` : 'Full photo mode!'}`,
);
if (!files.length) console.log('\nValid names:\n  ' + ids.map((i) => i.id).join(', '));
console.log('');
