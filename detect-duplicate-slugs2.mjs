import { promises as fs } from 'node:fs';
import path from 'node:path';

const MD_DIR = 'src/content/anime';
const YEAR_TOLERANCE = 1; // tahun sama atau beda max 1 tahun

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

function getYear(fm) {
  const v = fm.year;
  if (!v) return null;
  const n = parseInt(String(v).replace(/["']/g, ''), 10);
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : null;
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

  // === 1. Baca file paralel ===
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
          year: getYear(fm),
          episodes: fm.episodes || null,
        };
      })
    );
    for (let k = 0; k < slice.length; k++) entries[i + k] = results[k];
  }

  // === 2. Precompute normalized titles ===
  for (const e of entries) {
    e._norms = [
      e.title && normalizeTitle(e.title),
      e.titleEnglish && normalizeTitle(e.titleEnglish),
      e.titleNative && normalizeTitle(e.titleNative),
    ].filter(Boolean);
  }

  // === 3. Group by ID (tetap semua, tidak difilter tahun) ===
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

  // === 4. Title matching — hanya dalam bucket tahun yang sama/berdekatan ===
  // Bucket per tahun: 1969, 1970, ..., 2027
  const yearBuckets = new Map();
  const noYear = [];

  for (const e of entries) {
    if (!e.year) { noYear.push(e); continue; }
    let arr = yearBuckets.get(e.year);
    if (!arr) { arr = []; yearBuckets.set(e.year, arr); }
    arr.push(e);
  }

  console.log(`Bucket tahun: ${yearBuckets.size}, tanpa tahun: ${noYear.length}`);

  const pairSet = new Set();
  const titleDupes = [];

  // Bandingkan hanya antar tahun yang berdekatan (±YEAR_TOLERANCE)
  const years = [...yearBuckets.keys()].sort((a, b) => a - b);

  for (const y of years) {
    // Kumpulkan semua entry dari tahun y, y+1, ..., y+tolerance
    const combined = [];
    for (let d = 0; d <= YEAR_TOLERANCE; d++) {
      const arr = yearBuckets.get(y + d);
      if (arr) combined.push(...arr);
    }
    if (combined.length < 2) continue;

    // Group by normalized title dalam bucket ini
    const localTitleMap = new Map();
    for (const e of combined) {
      for (const norm of e._norms) {
        if (norm.length <= 5) continue;
        let arr = localTitleMap.get(norm);
        if (!arr) { arr = []; localTitleMap.set(norm, arr); }
        arr.push(e);
      }
    }

    for (const [norm, list] of localTitleMap) {
      if (list.length < 2) continue;

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.slug === b.slug) continue;

          // Cek tahun benar-benar dalam toleransi
          if (Math.abs((a.year || 0) - (b.year || 0)) > YEAR_TOLERANCE) continue;

          // Skip kalau ID sama (sudah dilaporkan)
          if (a.malId && b.malId && a.malId === b.malId) continue;
          if (a.anilistId && b.anilistId && a.anilistId === b.anilistId) continue;
          if (a.kitsuId && b.kitsuId && a.kitsuId === b.kitsuId) continue;

          // Skip kalau type beda
          if (a.type && b.type && a.type !== b.type) continue;

          const key = a.slug < b.slug ? `${a.slug}|${b.slug}` : `${b.slug}|${a.slug}`;
          if (pairSet.has(key)) continue;
          pairSet.add(key);

          titleDupes.push({ a, b, matchedTitle: norm });
        }
      }
    }
  }

  console.log(`Group by title: ${Date.now() - t0} ms`);

  // === 5. Output ===
  const lines = [];
  lines.push('=== Duplikat Berdasarkan ID & Judul (filter tahun) ===');
  lines.push(`# Total MD: ${entries.length}`);
  lines.push(`# Tahun: ${years[0] ?? '?'} - ${years[years.length - 1] ?? '?'}`);
  lines.push(`# Toleransi tahun: ±${YEAR_TOLERANCE}`);
  lines.push(`# Duplikat malId: ${dupMal.length}`);
  lines.push(`# Duplikat anilistId: ${dupAni.length}`);
  lines.push(`# Duplikat kitsuId: ${dupKit.length}`);
  lines.push(`# Duplikat judul: ${titleDupes.length}`);
  lines.push(`# MD tanpa tahun: ${noYear.length}`);
  lines.push('');

  const printGroup = (label, group, idField) => {
    if (!group.length) return;
    lines.push(`=== ${label} ===`);
    for (const [id, list] of group) {
      lines.push(`${idField}: ${id} (${list.length} file)`);
      for (const e of list) {
        lines.push(`  - ${e.slug}  (tahun: ${e.year ?? '-'}, type: ${e.type ?? '-'})`);
      }
      lines.push('');
    }
  };

  printGroup('Duplikat malId', dupMal, 'malId');
  printGroup('Duplikat anilistId', dupAni, 'anilistId');
  printGroup('Duplikat kitsuId', dupKit, 'kitsuId');

  if (titleDupes.length) {
    // Urutkan berdasarkan tahun
    titleDupes.sort((x, y) => (x.a.year || 0) - (y.a.year || 0));

    lines.push('=== Duplikat Judul (perlu dicek manual) ===');
    let currentYear = null;
    for (const d of titleDupes) {
      const y = Math.min(d.a.year || 0, d.b.year || 0);
      if (y !== currentYear) {
        lines.push('');
        lines.push(`--- Tahun ${y} ---`);
        currentYear = y;
      }
      lines.push(`Judul: "${d.matchedTitle}"`);
      lines.push(`  A: ${d.a.slug}  (tahun: ${d.a.year}, type: ${d.a.type}, malId: ${d.a.malId || '-'})`);
      lines.push(`  B: ${d.b.slug}  (tahun: ${d.b.year}, type: ${d.b.type}, malId: ${d.b.malId || '-'})`);
    }
    lines.push('');
  }

  if (noYear.length) {
    lines.push(`=== MD tanpa tahun (${noYear.length}) ===`);
    for (const e of noYear) lines.push(`  - ${e.slug}`);
    lines.push('');
  }

  const out = lines.join('\n');
  await fs.writeFile('file.txt', out, 'utf8');
  console.log(`\nSelesai dalam ${Date.now() - t0} ms`);
  console.log(`✅ duplicates-all.txt (${out.length} bytes)`);
}

main();