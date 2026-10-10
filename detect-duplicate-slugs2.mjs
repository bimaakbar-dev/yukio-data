// detect-duplicate-slugs2.mjs
import { promises as fs } from 'node:fs';

const MD_DIR = 'src/content/anime';

// Hapus suffix yang menandakan season/part/versi
const SUFFIX_PATTERNS = [
  /[-_\s]+(season|part|chapter|movie|the-movie|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)[-_\s]*\d*$/i,
  /[-_\s]+(season|part|chapter|movie)[-_\s]+(i{1,3}|iv|v|vi{0,3}|ix|x)$/i,
  /[-_\s]+(i{2,3}|iv|vi{0,3}|ix)$/i,          // ii, iii, iv, vi, vii, ix
  /[-_\s]+(2nd|3rd|4th|5th|6th|7th|8th|9th|10th)[-_\s]+season$/i,
  /[-_\s]+\d+$/i,                              // -2, -3
];

function stripSuffix(slug) {
  let s = slug;
  let changed = true;
  let safety = 0;
  while (changed && safety < 5) {
    changed = false;
    safety++;
    for (const re of SUFFIX_PATTERNS) {
      const next = s.replace(re, '');
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }
  return s;
}

function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/[-_.\s]+/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      m[i][j] = Math.min(
        m[i - 1][j] + 1,
        m[i][j - 1] + 1,
        m[i - 1][j - 1] + cost
      );
    }
  }
  return m[b.length][a.length];
}

async function main() {
  const files = (await fs.readdir(MD_DIR)).filter((f) => f.endsWith('.md'));
  const slugs = files.map((f) => f.replace(/\.md$/, '')).sort();

  console.log(`Total slug: ${slugs.length}\n`);

  const stripped = new Map();
  for (const s of slugs) stripped.set(s, stripSuffix(s));

  const found = [];
  const MAX_DIST = 4; // max edit distance (perbedaan karakter)

  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i];
      const b = slugs[j];
      const sa = stripped.get(a);
      const sb = stripped.get(b);

      // Skip kalau base sama → beda season, bukan dup
      if (sa === sb) continue;

      // Skip kalau normalize sama (sudah dihandle sebelumnya)
      if (normalize(a) === normalize(b)) continue;

      // Skip kalau panjang beda jauh
      if (Math.abs(sa.length - sb.length) > 6) continue;

      const dist = levenshtein(sa, sb);
      if (dist > 0 && dist <= MAX_DIST) {
        const max = Math.max(sa.length, sb.length);
        const sim = 1 - dist / max;
        found.push({
          a,
          b,
          sa,
          sb,
          dist,
          sim,
        });
      }
    }
  }

  found.sort((x, y) => {
    if (x.dist !== y.dist) return x.dist - y.dist;
    return y.sim - x.sim;
  });

  const lines = [];
  lines.push('=== Duplikat Berdasarkan Nama File (filtered) ===');
  lines.push(`# Total MD: ${files.length}`);
  lines.push(`# Kandidat: ${found.length} pasang`);
  lines.push(`# (season differences sudah difilter)`);
  lines.push('');

  for (const f of found) {
    lines.push(`${(f.sim * 100).toFixed(1)}%  dist=${f.dist}`);
    lines.push(`  A: ${f.a}`);
    lines.push(`  B: ${f.b}`);
    if (f.sa !== f.a || f.sb !== f.b) {
      lines.push(`  → base: ${f.sa}  |  ${f.sb}`);
    }
    lines.push('');
  }

  const out = lines.join('\n');
  await fs.writeFile('file.txt', out, 'utf8');
  console.log(out);
  console.log(`\n✅ file.txt (${out.length} bytes)`);
}

main();
