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
  const v = fm[name];
  if (!v) return null;
  const s = String(v).trim();
  return s && s !== 'null' && s !== 'undefined' ? s : null;
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
  const t0 = Date.now();
  const files = (await fs.readdir(MD_DIR)).filter((f) => f.endsWith('.md'));
  console.log(`Total MD: ${files.length}`);

  // === 1. Baca semua file secara paralel (batched) ===
  const entries = new Array(files.length);
  const BATCH = 200;

  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (file) => {
        const content = await fs.readFile(path.join(MD_DIR, file), 'utf8');
        const fm = parseFrontmatter(content);
        return {
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
        };
      })
    );
    for (let k = 0; k < slice.length; k++) {
      entries[i + k] = results[k];
    }
  }
  console.log(`Baca file: ${Date.now() - t0} ms`);

  // === 2. Precompute normalized titles (sekali saja per entry) ===
  for (const e of entries) {
    e._norms = [
      e.title && normalizeTitle(e.title),
      e.titleEnglish && normalizeTitle(e.titleEnglish),
      e.titleNative && normalizeTitle(e.titleNative),
    ].filter(Boolean);
  }

  // === 3. Group by ID (O(n)) ===
  const groupBy = (field) => {
    const map = new Map();
    for (const e of entries) {
      const v = e[field];
      if (!v) continue;
      let arr = map.get(v);
      if (!arr) { arr = []; map.set(v, arr); }
      arr.push(e);
    }
    return [...map.entries()].filter(([, list]) => list.length > 1);
  };

  const dupMal = groupBy('malId');
  const dupAni = groupBy('anilistId');
  const dupKit = groupBy('kitsuId');
  console.log(`Group by ID: ${Date.now() - t0} ms`);

  // === 4. Group by title (O(n)) ===
  // Bikin map: normalizedTitle → entry[], untuk SEMUA varian judul
  const titleBuckets = new Map();
  for (const e of entries) {
    for (const norm of e._norms) {
      if (norm.length <= 5) continue; // skip judul terlalu pendek
      let arr = titleBuckets.get(norm);
      if (!arr) { arr = []; titleBuckets.set(norm, arr); }
      arr.push(e);
    }
  }

  // Kumpulkan pasangan dari bucket yang punya >1 entry
  const pairSet = new Set();
  const titleDupes = [];

  for (const [norm, list] of titleBuckets) {
    if (list.length < 2) continue;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.slug === b.slug) continue;

        // Skip kalau salah satu ID sama (sudah dilaporkan di grup ID)
        if (a.malId && b.malId && a.malId === b.malId) continue;
        if (a.anilistId && b.anilistId && a.anilistId === b.anilistId) continue;
        if (a.kitsuId && b.kitsuId && a.kitsuId === b.kitsuId) continue;

        // Verifikasi type sama (kalau ada)
        if (a.type && b.type && a.type !== b.type) continue;

        const key = a.slug < b.slug ? `${a.slug}|${b.slug}` : `${b.slug}|${a.slug}`;
        if (pairSet.has(key)) continue;
        pairSet.add(key);

        titleDupes.push({ a, b, matchedTitle: norm });
      }
    }
  }
  console.log(`Group by title: ${Date.now() - t0} ms`);

  // === 5. Output ===
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

  const noId = entries.filter((e) => !e.malId && !e.anilistId && !e.kitsuId);
  if (noId.length) {
    lines.push(`=== MD tanpa ID sama sekali (${noId.length}) ===`);
    for (const e of noId) lines.push(`  - ${e.slug}`);
    lines.push('');
  }

  const out = lines.join('\n');
  await fs.writeFile('duplicates-all.txt', out, 'utf8');
  console.log(`\nSelesai dalam ${Date.now() - t0} ms`);
  console.log(`✅ duplicates-all.txt (${out.length} bytes)`);
}

main();