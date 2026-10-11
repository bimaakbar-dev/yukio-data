// scripts/migrate-rating.mjs
// One-time migration:
//   rating: 8.4  →  stats.score: 8.4  (hapus rating)
// Kalau rating sudah enum (PG-13 dll) atau tidak ada → skip.
// Tanpa dependency — pakai node:* builtin.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content/anime';
const DRY = process.env.DRY_RUN === '1';

if (!existsSync(DIR)) {
  console.error(`Directory not found: ${DIR}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function parseRatingValue(raw) {
  let v = raw.replace(/\s+#.*$/, '').trim();
  v = v.replace(/^["']|["']$/g, '');
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 10) return null;
  return v;
}

function migrate(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { end = i; break; }
  }
  if (end === -1) return null;

  const fm = lines.slice(1, end);
  const rest = lines.slice(end);

  let ratingValue = null;
  let ratingIdx = -1;
  for (let i = 0; i < fm.length; i++) {
    const m = fm[i].match(/^rating:\s*(.+?)\s*$/);
    if (m) {
      ratingValue = parseRatingValue(m[1]);
      ratingIdx = i;
      break;
    }
  }
  if (ratingValue === null) return null;

  let statsIdx = -1;
  let statsEnd = fm.length;
  for (let i = 0; i < fm.length; i++) {
    if (/^stats:\s*$/.test(fm[i])) {
      statsIdx = i;
      for (let j = i + 1; j < fm.length; j++) {
        if (/^[A-Za-z_]/.test(fm[j])) { statsEnd = j; break; }
      }
      break;
    }
  }

  let scoreIdx = -1;
  if (statsIdx !== -1) {
    for (let i = statsIdx + 1; i < statsEnd; i++) {
      if (/^\s+score:\s*/.test(fm[i])) { scoreIdx = i; break; }
    }
  }

  let newFm = fm.slice();
  if (scoreIdx !== -1) {
    newFm[scoreIdx] = newFm[scoreIdx].replace(/:\s*.+$/, `: ${ratingValue}`);
  } else if (statsIdx !== -1) {
    newFm.splice(statsIdx + 1, 0, `  score: ${ratingValue}`);
  } else {
    newFm.push('stats:');
    newFm.push(`  score: ${ratingValue}`);
  }

  newFm = newFm.filter((line) => !/^rating:\s*\d/.test(line));

  return ['---', ...newFm, ...rest].join('\n');
}

const files = walk(DIR);
let migrated = 0, skipped = 0, errors = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');
    const result = migrate(content);
    if (result === null || result === content) { skipped++; continue; }
    if (!DRY) writeFileSync(file, result, 'utf8');
    migrated++;
    if (migrated <= 20 || DRY) console.log(`${DRY ? '[dry] ' : ''}${file}`);
  } catch (err) {
    errors++;
    console.error(`[error] ${file}: ${err.message}`);
  }
}

console.log('');
console.log(`Total scanned : ${files.length}`);
console.log(`Migrated      : ${migrated}`);
console.log(`Skipped       : ${skipped}`);
console.log(`Errors        : ${errors}`);
console.log(`Mode          : ${DRY ? 'DRY RUN (tidak ada file berubah)' : 'WRITE'}`);