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
    let val = mm[2].trim().replace(/^["']|["']$/g, '');
    if (!val) continue;
    obj[key] = val;
  }
  return obj;
}

function getId(fm, name) {
  for (const [k, v] of Object.entries(fm)) {
    if (k.toLowerCase() === name.toLowerCase()) {
      const s = String(v).trim();
      if (!s || s === 'null' || s === 'undefined') return null;
      return s;
    }
  }
  return null;
}

function normalizeTitle(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function main() {
  const files = (await fs.readdir(MD_DIR)).filter((f) => f.endsWith('.md'));
  const entries = [];

  for (const file of files) {
    const content = await fs.readFile(path.join(MD_DIR, file), 'utf8');
    const fm = parseFrontmatter(content);
    entries.push({
      file,
      slug: file.replace(/\.md$/, ''),
      malId: getId(fm, 'malId'),
      anilistId: getId(fm, 'anilistId'),
      kitsuId: getId(fm, 'kitsuId'),
      title: fm.title || null,
      titleEnglish: fm.titleEnglish || null,
      titleNative: fm.titleNative || null,
      type: fm.type || null,
      year: fm.year || null,
      episodes: fm.episodes || null,
    });
  }

  console.log(`Total MD: ${entries.length}\n`);

  // === Lapis 1-3: duplikat by ID ===
  const byField = (field) => {
    const map = new Map();
    for (const e of entries) {
      const v = e[field];
      if (!v) continue;
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(e);
    }
    return [...map.entries()].filter(([, list]) => list.length > 1);
  };

  const dupMal = byField('malId');
  const dupAni = byField('anilistId');
  const dupKit = byField('kitsuId');

  // === Lapis 4: duplikat by title ===
  // Bandingkan semua pasangan, pakai title + titleEnglish + titleNative
  const titleDupes = [];
  const seen = new Set();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];

      // Kalau sudah ketangkep by ID, skip
      const key = [a.slug, b.slug].sort().join('|');
      if (seen.has(key)) continue;

      // Skip kalau salah satu ID-nya sama (sudah dilaporkan)
      if (a.malId && b.malId && a.malId === b.malId) continue;
      if (a.anilistId && b.anilistId && a.anilistId === b.anilistId) continue;
      if (a.kitsuId && b.kitsuId && a.kitsuId === b.kitsuId) continue;

      // Kumpulkan semua varian judul
      const titlesA = [a.title, a.titleEnglish, a.titleNative]
        .filter(Boolean).map(normalizeTitle).filter(Boolean);
      const titlesB = [b.title, b.titleEnglish, b.titleNative]
        .filter(Boolean).map(normalizeTitle).filter(Boolean);

      // Cek apakah ada judul yang persis sama
      const match = titlesA.find((t) => titlesB.includes(t));
      if (match && match.length > 5) {
        // Verifikasi: type harus sama (kalau ada)
        if (a.type && b.type && a.type !== b.type) continue;
        seen.add(key);
        titleDupes.push({ a, b, matchedTitle: match });
      }
    }
  }

  // === Output ===
  const lines = [];
  lines.push('=== Duplikat Berdasarkan ID & Judul ===');
  lines.push(`# Total MD: ${entries.length}`);
  lines.push(`# Duplikat malId: ${dupMal.length}`);
  lines.push(`# Duplikat anilistId: ${dupAni.length}`);
  lines.push(`# Duplikat kitsuId: ${dupKit.length}`);
  lines.push(`# Duplikat judul: ${titleDupes.length}`);
  lines.push('');

  const printGroup = (label, group, idField) => {
    if (!group.length) return;
    lines.push(`=== ${label} ===`);
    for (const [id, list] of group) {
      lines.push(`${idField}: ${id} (${list.length} file)`);
      for (const e of list) lines.push(`  - ${e.slug}  (${e.file})`);
      lines.push('');
    }
  };

  printGroup('Duplikat malId', dupMal, 'malId');
  printGroup('Duplikat anilistId', dupAni, 'anilistId');
  printGroup('Duplikat kitsuId', dupKit, 'kitsuId');

  if (titleDupes.length) {
    lines.push('=== Duplikat Judul (perlu dicek manual) ===');
    for (const d of titleDupes) {
      lines.push(`Judul: "${d.matchedTitle}"`);
      lines.push(`  A: ${d.a.slug}  (malId: ${d.a.malId || '-'}, anilist: ${d.a.anilistId || '-'})`);
      lines.push(`  B: ${d.b.slug}  (malId: ${d.b.malId || '-'}, anilist: ${d.b.anilistId || '-'})`);
      lines.push('');
    }
  }

  // === Tanpa ID sama sekali ===
  const noId = entries.filter((e) => !e.malId && !e.anilistId && !e.kitsuId);
  if (noId.length) {
    lines.push(`=== MD tanpa ID sama sekali (${noId.length}) ===`);
    for (const e of noId) lines.push(`  - ${e.slug}`);
    lines.push('');
  }

  const out = lines.join('\n');
  await fs.writeFile('duplicates-all.txt', out, 'utf8');
  console.log(out);
  console.log('\n✅ duplicates-all.txt');
}

main();