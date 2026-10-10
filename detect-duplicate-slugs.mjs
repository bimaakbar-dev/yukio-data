// detect-duplicate-by-id.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MD_DIR = 'src/content/anime';

function parseFm(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = m[1] ?? '';
  const get = (k) => {
    const re = new RegExp(`^${k}:\\s*(.+)$`, 'm');
    const match = fm.match(re);
    if (!match) return null;
    return match[1].trim().replace(/^["']|["']$/g, '');
  };
  return {
    title: get('title'),
    malId: get('malId'),
    kitsuId: get('kitsuId'),
    anilistId: get('anilistId'),
  };
}

async function main() {
  const files = (await fs.readdir(MD_DIR)).filter((f) => f.endsWith('.md'));
  const entries = [];

  for (const file of files) {
    const content = await fs.readFile(path.join(MD_DIR, file), 'utf8');
    const fm = parseFm(content);
    entries.push({
      slug: file.replace(/\.md$/, ''),
      title: fm.title ?? '',
      malId: fm.malId,
      kitsuId: fm.kitsuId,
      anilistId: fm.anilistId,
    });
  }

  console.log(`Total MD: ${entries.length}\n`);

  // Group by malId
  const byMal = new Map();
  for (const e of entries) {
    if (!e.malId) continue;
    if (!byMal.has(e.malId)) byMal.set(e.malId, []);
    byMal.get(e.malId).push(e);
  }
  const dupMal = [...byMal.entries()].filter(([, a]) => a.length > 1).sort();

  // Group by kitsuId
  const byKitsu = new Map();
  for (const e of entries) {
    if (!e.kitsuId) continue;
    if (!byKitsu.has(e.kitsuId)) byKitsu.set(e.kitsuId, []);
    byKitsu.get(e.kitsuId).push(e);
  }
  const dupKitsu = [...byKitsu.entries()].filter(([, a]) => a.length > 1).sort();

  const lines = [];
  lines.push('# Duplikat by External ID');
  lines.push(`# Total MD: ${entries.length}`);
  lines.push(`# Duplikat malId: ${dupMal.length} grup`);
  lines.push(`# Duplikat kitsuId: ${dupKitsu.length} grup`);
  lines.push('');

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`1. DUPLIKAT by malId — ${dupMal.length} grup`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  for (const [malId, arr] of dupMal) {
    lines.push(`malId=${malId}:`);
    for (const e of arr) {
      lines.push(`  ${e.slug}`);
      lines.push(`      title: "${e.title}"`);
    }
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`2. DUPLIKAT by kitsuId — ${dupKitsu.length} grup`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  for (const [kitsuId, arr] of dupKitsu) {
    lines.push(`kitsuId=${kitsuId}:`);
    for (const e of arr) {
      lines.push(`  ${e.slug}`);
      lines.push(`      title: "${e.title}"`);
    }
    lines.push('');
  }

  const out = lines.join('\n');
  await fs.writeFile('file.txt', out, 'utf8');
  console.log(out);
  console.log(`\n✅ file.txt written`);
}

main();
