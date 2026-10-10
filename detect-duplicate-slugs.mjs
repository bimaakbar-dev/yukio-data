// detect-duplicate-content.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MD_DIR = 'src/content/anime';

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = m[1] ?? '';
  const get = (key) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
    const match = fm.match(re);
    if (!match) return null;
    return match[1].trim().replace(/^["']|["']$/g, '');
  };
  return {
    title: get('title'),
    titleEnglish: get('titleEnglish'),
    titleNative: get('titleNative'),
    malId: get('malId'),
    kitsuId: get('kitsuId'),
    anilistId: get('anilistId'),
  };
}

async function main() {
  console.log('=== Deteksi Duplikat by External ID ===\n');
  console.log(`Scan: ${MD_DIR}\n`);

  const files = (await fs.readdir(MD_DIR)).filter((f) => f.endsWith('.md'));
  console.log(`Total MD: ${files.length}\n`);

  const entries = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(MD_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    entries.push({
      slug: file.replace(/\.md$/, ''),
      title: fm.title ?? '',
      titleEnglish: fm.titleEnglish ?? '',
      malId: fm.malId,
      kitsuId: fm.kitsuId,
      anilistId: fm.anilistId,
    });
  }

  // Group by malId
  const byMal = new Map();
  for (const e of entries) {
    if (!e.malId) continue;
    if (!byMal.has(e.malId)) byMal.set(e.malId, []);
    byMal.get(e.malId).push(e);
  }
  const dupMal = [...byMal.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  // Group by kitsuId
  const byKitsu = new Map();
  for (const e of entries) {
    if (!e.kitsuId) continue;
    if (!byKitsu.has(e.kitsuId)) byKitsu.set(e.kitsuId, []);
    byKitsu.get(e.kitsuId).push(e);
  }
  const dupKitsu = [...byKitsu.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]));

  // Group by anilistId
  const byAnilist = new Map();
  for (const e of entries) {
    if (!e.anilistId) continue;
    if (!byAnilist.has(e.anilistId)) byAnilist.set(e.anilistId, []);
    byAnilist.get(e.anilistId).push(e);
  }
  const dupAnilist = [...byAnilist.entries()]
    .filter(([, arr]) => arr.length > 1)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  // No malId same title exact
  const byTitle = new Map();
  for (const e of entries) {
    const t = (e.title ?? '').toLowerCase().trim();
    if (!t) continue;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(e);
  }
  const dupTitle = [...byTitle.entries()].filter(([, arr]) => arr.length > 1);

  // Build report
  const lines = [];
  lines.push('=== Deteksi Duplikat by External ID ===');
  lines.push(`Total MD: ${files.length}`);
  lines.push('');
  lines.push(`Duplikat by malId    : ${dupMal.length} grup`);
  lines.push(`Duplikat by kitsuId  : ${dupKitsu.length} grup`);
  lines.push(`Duplikat by anilistId: ${dupAnilist.length} grup`);
  lines.push(`Duplikat by title    : ${dupTitle.length} grup`);
  lines.push('');

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`1. DUPLIKAT BY malId — ${dupMal.length} grup`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  if (dupMal.length === 0) {
    lines.push('(tidak ada)');
  } else {
    for (const [malId, arr] of dupMal) {
      lines.push(`malId=${malId} (${arr.length} anime):`);
      for (const e of arr) {
        lines.push(`  ${e.slug}`);
        lines.push(`      title: "${e.title}"`);
      }
      lines.push('');
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`2. DUPLIKAT BY kitsuId — ${dupKitsu.length} grup`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  if (dupKitsu.length === 0) {
    lines.push('(tidak ada)');
  } else {
    for (const [kitsuId, arr] of dupKitsu) {
      lines.push(`kitsuId=${kitsuId} (${arr.length} anime):`);
      for (const e of arr) {
        lines.push(`  ${e.slug}`);
        lines.push(`      title: "${e.title}"`);
      }
      lines.push('');
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`3. DUPLIKAT BY anilistId — ${dupAnilist.length} grup`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  if (dupAnilist.length === 0) {
    lines.push('(tidak ada)');
  } else {
    for (const [anilistId, arr] of dupAnilist) {
      lines.push(`anilistId=${anilistId} (${arr.length} anime):`);
      for (const e of arr) {
        lines.push(`  ${e.slug}`);
        lines.push(`      title: "${e.title}"`);
      }
      lines.push('');
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`4. DUPLIKAT BY title (exact lowercase) — ${dupTitle.length} grup`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  if (dupTitle.length === 0) {
    lines.push('(tidak ada)');
  } else {
    for (const [title, arr] of dupTitle) {
      lines.push(`"${title}" (${arr.length} anime):`);
      for (const e of arr) {
        lines.push(`  ${e.slug}`);
        lines.push(`      malId=${e.malId ?? '-'}  kitsuId=${e.kitsuId ?? '-'}`);
      }
      lines.push('');
    }
  }

  const out = lines.join('\n');
  await fs.writeFile('file.txt', out, 'utf8');

  console.log(out);
  console.log(`\n✅ file.txt written (${out.length} bytes)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
