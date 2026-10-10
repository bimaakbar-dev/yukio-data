// detect-duplicate-malid.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const MD_DIR = 'src/content/anime';

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};

  const obj = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!mm) continue;

    const key = mm[1].trim();
    let val = mm[2].trim();

    if (!val) continue;

    // buang kutip
    val = val.replace(/^["']|["']$/g, '');
    obj[key] = val;
  }
  return obj;
}

function getMalId(fm) {
  for (const [key, value] of Object.entries(fm)) {
    const norm = key.toLowerCase().replace(/[_-]/g, '');
    if (norm === 'malid') {
      const v = String(value).trim();
      if (!v || v === 'null' || v === 'undefined') return null;
      return v;
    }
  }
  return null;
}

async function main() {
  const files = (await fs.readdir(MD_DIR)).filter((f) => f.endsWith('.md'));

  const entries = [];

  for (const file of files) {
    const fullPath = path.join(MD_DIR, file);
    const content = await fs.readFile(fullPath, 'utf8');
    const fm = parseFrontmatter(content);

    entries.push({
      file,
      slug: file.replace(/\.md$/, ''),
      malId: getMalId(fm),
    });
  }

  const byMalId = new Map();

  for (const entry of entries) {
    if (!entry.malId) continue;

    if (!byMalId.has(entry.malId)) {
      byMalId.set(entry.malId, []);
    }
    byMalId.get(entry.malId).push(entry);
  }

  const duplicates = [];

  for (const [malId, list] of byMalId.entries()) {
    if (list.length > 1) {
      duplicates.push({ malId, list });
    }
  }

  // urutkan berdasarkan malId numerik kalau memungkinkan
  duplicates.sort((a, b) => {
    const na = Number(a.malId);
    const nb = Number(b.malId);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a.malId).localeCompare(String(b.malId));
  });

  const noMalId = entries.filter((e) => !e.malId);

  const lines = [];

  lines.push('=== Duplikat Berdasarkan malId ===');
  lines.push(`# Total MD: ${files.length}`);
  lines.push(`# malId unik: ${byMalId.size}`);
  lines.push(`# Duplikat malId: ${duplicates.length}`);
  lines.push(`# MD tanpa malId: ${noMalId.length}`);
  lines.push('');

  for (const d of duplicates) {
    lines.push(`malId: ${d.malId} (${d.list.length} file)`);
    for (const e of d.list) {
      lines.push(`  - ${e.slug}  (${e.file})`);
    }
    lines.push('');
  }

  if (noMalId.length > 0) {
    lines.push('=== MD tanpa malId ===');
    for (const e of noMalId) {
      lines.push(`  - ${e.slug}  (${e.file})`);
    }
    lines.push('');
  }

  const out = lines.join('\n');

  await fs.writeFile('file.txt', out, 'utf8');
  console.log(out);
  console.log(`\n✅ file.txt (${out.length} bytes)`);
}

main();
