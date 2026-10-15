/**
 * fetch-raw.mjs — re-download the upstream datasets into ./raw/.
 *
 * You only need this to regenerate the published data from source. The built
 * files under public/data are committed, so a plain clone runs without it.
 *
 *   node scripts/fetch-raw.mjs
 *   node scripts/build-data.mjs
 *   node scripts/build-japanese.mjs
 *
 * Sources
 *   English  jamsinclair-style 百词斩 book exports from the `kajweb/dict` GitHub
 *            repo (zips of JSONL). Fetched with the GitHub CLI because the files
 *            are too large for the jsDelivr CDN mirror.
 *   Japanese JLPT N5–N1 CSVs from `jamsinclair/open-anki-jlpt-decks` (MIT).
 *
 * Requires: Node 18+, the `gh` CLI authenticated (`gh auth login`) for the
 * English books, and `unzip` on PATH.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const JLPT = path.join(RAW, 'jlpt');

/** Baicizhan book archive -> the filename build-data.mjs expects. */
const BOOKS = [
  { archive: '1521164675301_GaoZhong_2.zip', jsonl: 'GaoZhong_2.json', out: 'gaozhong.jsonl' },
  { archive: '1524052539052_CET4luan_2.zip', jsonl: 'CET4luan_2.json', out: 'cet4.jsonl' },
  { archive: '1524052554766_CET6_2.zip', jsonl: 'CET6_2.json', out: 'cet6.jsonl' }
];

const JLPT_LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];

const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, ...options });
  } catch (error) {
    return null;
  }
};

const haveCommand = command => run(command, ['--version']) !== null || run(command, ['-v']) !== null;

const fetchBooks = () => {
  if (!haveCommand('gh')) {
    console.warn('  ! `gh` not found — skipping the English books. Install the GitHub CLI and run `gh auth login`.');
    return;
  }
  if (!haveCommand('unzip')) {
    console.warn('  ! `unzip` not found — the archives will be downloaded but not extracted.');
  }

  for (const book of BOOKS) {
    const archivePath = path.join(RAW, book.archive);
    const target = path.join(RAW, book.out);
    if (fs.existsSync(target)) {
      console.log(`  = ${book.out} already present`);
      continue;
    }

    console.log(`  ↓ ${book.archive}`);
    const archive = run('gh', [
      'api',
      `repos/kajweb/dict/contents/book/${book.archive}`,
      '-H',
      'Accept: application/vnd.github.raw'
    ]);
    if (!archive || archive.length < 1000) {
      console.warn(`  ! failed to download ${book.archive}`);
      continue;
    }
    fs.writeFileSync(archivePath, archive);

    const extracted = run('unzip', ['-o', '-j', archivePath, book.jsonl, '-d', RAW]);
    if (extracted === null) {
      console.warn(`  ! could not extract ${book.archive} — unzip it manually into raw/`);
      continue;
    }
    const produced = path.join(RAW, book.jsonl);
    if (fs.existsSync(produced)) {
      fs.renameSync(produced, target);
      console.log(`  ✓ ${book.out} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
    }
  }
};

const fetchJapanese = async () => {
  fs.mkdirSync(JLPT, { recursive: true });
  for (const level of JLPT_LEVELS) {
    const target = path.join(JLPT, `${level}.csv`);
    if (fs.existsSync(target)) {
      console.log(`  = ${level}.csv already present`);
      continue;
    }
    const url = `https://cdn.jsdelivr.net/gh/jamsinclair/open-anki-jlpt-decks@main/src/${level}.csv`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      fs.writeFileSync(target, text);
      console.log(`  ✓ ${level}.csv (${(text.length / 1024).toFixed(0)} KB)`);
    } catch (error) {
      console.warn(`  ! failed to fetch ${level}.csv: ${error.message}`);
    }
  }
};

const main = async () => {
  fs.mkdirSync(RAW, { recursive: true });
  console.log('Fetching English books (百词斩 exports via kajweb/dict)');
  fetchBooks();
  console.log('Fetching JLPT vocabulary (jamsinclair/open-anki-jlpt-decks)');
  await fetchJapanese();
  console.log('\nDone. Now run:');
  console.log('  node scripts/build-data.mjs');
  console.log('  node scripts/build-japanese.mjs');
};

void main();
