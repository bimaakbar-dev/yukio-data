// detect-duplicate-slugs.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MD_DIR = 'src/content/anime';
const DATA_DIR = 'data/anime';

function normalizeSlug(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[-_.\s]+/g, '');   // buang dash, underscore, dot, spasi
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

function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

async function listMdSlugs() {
  const entries = await fs.readdir(MD_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.replace(/\.md$/, ''));
}

async function listDataSlugs() {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

async function main() {
  console.log('=== Deteksi Slug Duplikat ===\n');

  const mdSlugs = (await listMdSlugs()).sort();
  const dataSlugs = new Set(await listDataSlugs());

  console.log(`Total MD   : ${mdSlugs.length}`);
  console.log(`Total data : ${dataSlugs.size}\n`);

  // =====================================================
  // DETEKSI 1: Slug duplikat (normalized)
  // =====================================================
  const byNormalized = new Map();
  for (const slug of mdSlugs) {
    const norm = normalizeSlug(slug);
    if (!norm) continue;
    if (!byNormalized.has(norm)) byNormalized.set(norm, []);
    byNormalized.get(norm).push(slug);
  }

  const exactDup = [...byNormalized.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort();

  // =====================================================
  // DETEKSI 2: Slug mirip (fuzzy, high threshold)
  // =====================================================
  const similar = [];
  const slugs = [...mdSlugs];
  const FUZZY_THRESHOLD = 0.9;

  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      const a = slugs[i];
      const b = slugs[j];
      if (Math.abs(a.length - b.length) > 5) continue;
      const sim = similarity(a, b);
      if (sim >= FUZZY_THRESHOLD && sim < 1) {
        // Skip kalau sudah di deteksi normalized
        if (normalizeSlug(a) === normalizeSlug(b)) continue;
        similar.push({ a, b, sim });
      }
    }
  }
  similar.sort((x, y) => y.sim - x.sim);

  // =====================================================
  // OUTPUT
  // =====================================================
  const lines = [];
  lines.push('# Laporan Slug Duplikat');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Total MD: ${mdSlugs.length}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`1. DUPLIKAT EXACT (normalized) — ${exactDup.length} grup`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  if (exactDup.length === 0) {
    lines.push('(tidak ada)');
  } else {
    for (const [norm, arr] of exactDup) {
      lines.push(`"${norm}"`);
      for (const s of arr) {
        const hasData = dataSlugs.has(s) ? '[DATA]' : '      ';
        lines.push(`  ${hasData}  ${s}`);
      }
      lines.push('');
    }
  }
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`2. SLUG MIRIP (fuzzy ≥ ${(FUZZY_THRESHOLD * 100).toFixed(0)}%) — ${similar.length} pasangan`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  if (similar.length === 0) {
    lines.push('(tidak ada)');
  } else {
    for (const s of similar) {
      lines.push(`${(s.sim * 100).toFixed(1)}%  ${s.a}  ↔  ${s.b}`);
    }
  }

  const output = lines.join('\n');
  await fs.writeFile('file.txt', output, 'utf8');

  console.log(output);
  console.log(`\n📄 file.txt written (${output.length} bytes)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
