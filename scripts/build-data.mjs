/**
 * build-data.mjs — transforms the raw 百词斩 (Baicizhan) JSONL exports into the
 * compact, lazy-loadable datasets the app consumes.
 *
 * Raw input (one JSON object per line) lives in ./raw/<book>.jsonl.
 * Run:  node scripts/build-data.mjs
 *
 * Output (public/data/):
 *   vocab/books.json              book registry + coverage stats
 *   vocab/<book>.index.json       compact rows for lists & practice
 *   vocab/<book>.detail.<n>.json  sharded full detail, loaded on demand
 *   vocab/<book>.sentences.json   sentence-typing pool
 *   categories.json               专项 (category) definitions
 *   irregular-verbs.json          curated irregular verb table
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'public', 'data', 'vocab');
const PUB = path.join(ROOT, 'public', 'data');
const CURATED = path.join(ROOT, 'scripts', 'curated');

const SHARD_SIZE = 400;

const BOOKS = [
  {
    id: 'highschool',
    raw: 'gaozhong.jsonl',
    name: '高中词汇',
    short: '高中',
    tag: 'GAOZHONG',
    desc: '普通高中英语课程标准词汇表（必修 + 选修）。打地基的第一站，也是最该练熟的一批词。',
    accent: '#2fb8a4'
  },
  {
    id: 'cet4',
    raw: 'cet4.jsonl',
    name: '四级词汇',
    short: 'CET-4',
    tag: 'CET4',
    desc: '大学英语四级考试大纲词汇。含历年真题例句，覆盖听力与阅读的高频考点。',
    accent: '#5b8def'
  },
  {
    id: 'cet6',
    raw: 'cet6.jsonl',
    name: '六级词汇',
    short: 'CET-6',
    tag: 'CET6',
    desc: '六级大纲词汇（四级之上的增量）。学术写作与长难句的关键词，难度阶梯的下一级。',
    accent: '#a06bf0'
  }
];

/* ------------------------------------------------------------------ */
/* text helpers                                                        */
/* ------------------------------------------------------------------ */

const normalizeText = value =>
  String(value ?? '')
    .replace(/[\u2018\u2019\u02bc\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isTypeable = text => /^[\x20-\x7e]+$/.test(text);
const stripEllipsis = text => text.replace(/^\.{2,}\s*/, '').replace(/\s*\.{2,}$/, '').trim();

const clean = value => {
  const text = normalizeText(stripEllipsis(normalizeText(value)));
  return isTypeable(text) ? text : '';
};

const uniqBy = (list, key) => {
  const seen = new Set();
  return list.filter(item => {
    const k = key(item);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const POS_MAP = {
  n: 'n.',
  v: 'v.',
  vt: 'vt.',
  vi: 'vi.',
  adj: 'adj.',
  a: 'adj.',
  adv: 'adv.',
  ad: 'adv.',
  prep: 'prep.',
  conj: 'conj.',
  pron: 'pron.',
  num: 'num.',
  art: 'art.',
  int: 'int.',
  aux: 'aux.',
  modal: 'modal',
  abbr: 'abbr.',
  u: 'n.',
  c: 'n.',
  ph: 'phr.'
};

const posLabel = raw => {
  const value = String(raw ?? '').toLowerCase().replace(/\./g, '').trim();
  return POS_MAP[value] ?? (value ? `${value}.` : '');
};

/* ------------------------------------------------------------------ */
/* bounded edit distance, used to find confusable near-neighbours      */
/* ------------------------------------------------------------------ */

const nearDistance = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const from = Math.max(1, i - max);
    const to = Math.min(b.length, i + max);
    for (let j = 1; j <= b.length; j++) {
      if (j < from || j > to) {
        curr[j] = max + 1;
        continue;
      }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
};

/* ------------------------------------------------------------------ */
/* record extraction                                                   */
/* ------------------------------------------------------------------ */

const readJsonl = file => {
  const rows = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      /* skip malformed line */
    }
  }
  return rows;
};

const extractEntry = (row, book) => {
  const head = row?.content?.word;
  const content = head?.content;
  const word = normalizeText(row?.headWord || head?.wordHead || '');
  if (!word || !content) return null;

  const defs = (content.trans ?? [])
    .map(item => ({ p: posLabel(item.pos), c: normalizeText(item.tranCn), e: clean(item.tranOther) }))
    .filter(item => item.c);
  if (!defs.length) return null;

  const sentences = uniqBy(
    (content.sentence?.sentences ?? [])
      .map(item => [clean(item.sContent), normalizeText(item.sCn)])
      .filter(([en, cn]) => en && cn && en.length >= 14 && en.length <= 160),
    ([en]) => en.toLowerCase()
  ).slice(0, 4);

  const bare = word.replace(/[^a-z]/gi, '');
  const headPattern = bare ? new RegExp(`\\b${bare}\\b`, 'i') : null;

  /* Every entry in `realExamSentence` is an excerpt lifted from a past paper, and
     in this dataset all 13,521 of them are marked as truncated by a leading
     "...". They are still the most useful context a learner can get — the word
     as it actually appeared in an exam — so they are kept, stripped of the
     ellipsis, and labelled as fragments rather than passed off as sentences. */
  const exam = uniqBy(
    (content.realExamSentence?.sentences ?? [])
      .map(item => {
        const en = clean(item.sContent);
        if (!en || en.length < 40 || en.length > 190) return null;
        if (headPattern && !headPattern.test(en)) return null;
        const info = item.sourceInfo ?? {};
        const year = Number(String(info.year ?? '').split('.')[0]);
        const safeYear = year >= 1990 && year <= 2030 ? info.year : '';
        const meta = ['真题片段', info.level, safeYear, info.type].filter(Boolean).join(' · ');
        return [en, meta];
      })
      .filter(Boolean),
    ([en]) => en.toLowerCase()
  ).slice(0, 3);

  const phrases = uniqBy(
    (content.phrase?.phrases ?? [])
      .map(item => [clean(item.pContent), normalizeText(item.pCn)])
      .filter(([en, cn]) => en && cn && en.length <= 42),
    ([en]) => en.toLowerCase()
  ).slice(0, 8);

  const rels = (content.relWord?.rels ?? [])
    .map(group => ({
      p: posLabel(group.pos),
      w: (group.words ?? [])
        .map(item => [normalizeText(item.hwd), normalizeText(item.tran)])
        .filter(([w, t]) => w && t && /^[a-z][a-z'-]*$/i.test(w))
        .slice(0, 5)
    }))
    .filter(group => group.w.length);

  const synos = (content.syno?.synos ?? [])
    .map(group => ({
      p: posLabel(group.pos),
      t: normalizeText(group.tran),
      w: (group.hwds ?? [])
        .map(item => normalizeText(item.w))
        .filter(w => w && /^[a-z][a-z' -]*$/i.test(w))
        .slice(0, 6)
    }))
    .filter(group => group.w.length)
    .slice(0, 3);

  const posSet = [...new Set(defs.map(d => d.p).filter(Boolean))];
  const cnShort = defs
    .map(d => `${d.p ? d.p + ' ' : ''}${d.c}`)
    .join('  ')
    .slice(0, 120);

  return {
    word,
    book: book.id,
    uk: normalizeText(content.ukphone),
    us: normalizeText(content.usphone),
    pos: posSet.join('/'),
    cn: cnShort,
    defs,
    sentences,
    exam,
    phrases,
    rels,
    synos,
    mnemonic: normalizeText(content.remMethod?.val),
    multi: /\s/.test(word),
    length: bare.length
  };
};

/* ------------------------------------------------------------------ */
/* per-book parse                                                      */
/* ------------------------------------------------------------------ */

const parseBook = book => {
  const rawPath = path.join(RAW, book.raw);
  if (!fs.existsSync(rawPath)) {
    console.warn(`  ! missing raw file ${book.raw} — skipping ${book.id}`);
    return null;
  }
  const seen = new Set();
  const entries = [];
  for (const row of readJsonl(rawPath)) {
    const entry = extractEntry(row, book);
    if (!entry) continue;
    const key = entry.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  entries.sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
  return entries;
};

const buildDetail = (entry, neighbours) => {
  const detail = {};
  detail.d = entry.defs.slice(0, 4).map(d => (d.e ? [d.p, d.c, d.e] : [d.p, d.c]));
  if (entry.sentences.length) detail.s = entry.sentences.slice(0, 3);
  if (entry.exam.length) detail.x = entry.exam;
  if (entry.phrases.length) detail.p = entry.phrases;
  if (entry.rels.length) detail.r = entry.rels.map(g => [g.p, g.w]);
  if (entry.synos.length) detail.y = entry.synos.map(g => [g.p, g.t, g.w]);
  if (entry.mnemonic) detail.m = entry.mnemonic;
  if (neighbours?.length) detail.k = neighbours;
  return detail;
};

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

const main = () => {
  console.log('TypeLex data build');
  console.log('==================');

  const bookData = [];
  for (const book of BOOKS) {
    const entries = parseBook(book);
    if (entries) bookData.push({ book, entries });
  }

  /* --- global index for cross-book level + confusable detection --- */
  const level = new Map();
  for (const { book, entries } of bookData) {
    const rank = book.id === 'highschool' ? 1 : book.id === 'cet4' ? 2 : 3;
    for (const entry of entries) {
      const key = entry.word.toLowerCase();
      const current = level.get(key);
      if (current === undefined || rank < current) level.set(key, rank);
    }
  }

  const singles = [];
  for (const { entries } of bookData) {
    for (const entry of entries) {
      if (!entry.multi && entry.length >= 3 && /^[a-z]+$/.test(entry.word.toLowerCase())) singles.push(entry);
    }
  }

  /* bucket by (first letter, length) so the O(n^2) neighbour scan stays cheap */
  const buckets = new Map();
  for (const entry of singles) {
    const w = entry.word.toLowerCase();
    const key = `${w[0]}|${w.length}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }

  const neighbourMap = new Map();
  const confusableSet = new Set();
  /* Same-length words within edit distance 2 are the genuinely confusable set
     (affect/effect, adapt/adopt, principal/principle). Allowing a length delta
     pulls in half the dictionary and makes the drill useless. */
  for (const entry of singles) {
    const w = entry.word.toLowerCase();
    const found = [];
    const list = buckets.get(`${w[0]}|${w.length}`);
    if (list) {
      for (const other of list) {
        const o = other.word.toLowerCase();
        if (o === w) continue;
        if (nearDistance(w, o, 2) <= 2) found.push(other);
      }
    }
    if (!found.length) continue;
    found.sort((a, b) => a.word.localeCompare(b.word));
    const picked = found.slice(0, 4).map(o => [o.word, o.cn.slice(0, 46)]);
    neighbourMap.set(entry.word.toLowerCase(), picked);
    confusableSet.add(entry.word.toLowerCase());
  }

  /* --- write per-book files --- */
  const books = [];
  const allWords = [];

  for (const { book, entries } of bookData) {
    fs.mkdirSync(OUT, { recursive: true });

    const index = [];
    const shards = [];
    const sentencePool = [];

    entries.forEach((entry, i) => {
      const shard = Math.floor(i / SHARD_SIZE);
      index.push([
        entry.word,
        entry.uk,
        entry.us,
        entry.pos,
        entry.cn,
        shard,
        entry.multi ? 1 : 0,
        level.get(entry.word.toLowerCase()) ?? 3
      ]);
      (shards[shard] ??= {})[entry.word] = buildDetail(entry, neighbourMap.get(entry.word.toLowerCase()));

      for (const [en, cn] of entry.sentences) {
        if (en.length < 26 || en.length > 108) continue;
        const bare = entry.word.toLowerCase().split(' ')[0];
        if (bare && !en.toLowerCase().includes(bare)) continue;
        sentencePool.push({ t: en, c: cn, w: entry.word, b: book.id, n: en.length });
      }

      allWords.push(entry);
    });

    fs.writeFileSync(path.join(OUT, `${book.id}.index.json`), JSON.stringify({ book: book.id, words: index }));
    shards.forEach((data, i) => {
      fs.writeFileSync(path.join(OUT, `${book.id}.detail.${i}.json`), JSON.stringify(data));
    });

    const pool = [...uniqBy(sentencePool.sort((a, b) => a.n - b.n), s => s.t.toLowerCase()).reduce(
      (map, s) => (map.has(s.w) ? map : map.set(s.w, s)),
      new Map()
    ).values()];
    fs.writeFileSync(path.join(OUT, `${book.id}.sentences.json`), JSON.stringify(pool));

    const posCount = {};
    for (const entry of entries) {
      for (const p of entry.pos.split('/').filter(Boolean)) posCount[p] = (posCount[p] ?? 0) + 1;
    }

    books.push({
      id: book.id,
      name: book.name,
      short: book.short,
      tag: book.tag,
      desc: book.desc,
      accent: book.accent,
      count: entries.length,
      shards: shards.length,
      sentences: pool.length,
      coverage: {
        related: entries.filter(e => e.rels.length).length,
        mnemonic: entries.filter(e => e.mnemonic).length,
        exam: entries.filter(e => e.exam.length).length,
        sentence: entries.filter(e => e.sentences.length).length,
        phrase: entries.filter(e => e.phrases.length).length
      },
      posCount
    });

    console.log(
      `  ${book.id}: ${entries.length} words · ${shards.length} shards · ${pool.length} sentences · ` +
        `${entries.filter(e => e.rels.length).length} with 同根词`
    );
  }

  /* --- categories --- */
  const byWord = new Map();
  for (const entry of allWords) {
    const key = entry.word.toLowerCase();
    if (!byWord.has(key)) byWord.set(key, entry);
  }

  const irregularPath = path.join(CURATED, 'irregular-verbs.json');
  const irregular = fs.existsSync(irregularPath)
    ? JSON.parse(fs.readFileSync(irregularPath, 'utf8')).verbs ?? []
    : [];
  const irregularSet = new Set(irregular.map(v => v.base.toLowerCase()));

  const cats = [];
  const add = (id, name, desc, icon, filter, accent) => {
    const words = [];
    for (const entry of allWords) {
      if (filter(entry)) words.push({ w: entry.word, b: entry.book, lv: level.get(entry.word.toLowerCase()) ?? 3 });
    }
    if (words.length >= 8) cats.push({ id, name, desc, icon, accent, count: words.length, words });
  };

  const hasPos = (entry, re) => re.test(entry.pos);

  const inCet4 = new Set(bookData.find(b => b.book.id === 'cet4')?.entries.map(e => e.word.toLowerCase()) ?? []);
  add('core', '高中 ∩ 四级核心', '同时出现在高中与四级词表里的词 —— 命中率最高的那一批，先啃它们。', 'target',
    e => e.book === 'highschool' && inCet4.has(e.word.toLowerCase()), '#2fb8a4');

  add('adj', '形容词', '描述性质与状态，写作里最能让句子"有颜色"的一类词。', 'sparkle', e => hasPos(e, /(^|\/)adj\./), '#e2703a');
  add('verb', '动词', '句子的发动机。及物/不及物、时态变化是考点重灾区。', 'bolt', e => hasPos(e, /(^|\/)(v\.|vt\.|vi\.)/), '#5b8def');
  add('adv', '副词', '修饰动词与形容词，决定语气的强弱。', 'gauge', e => hasPos(e, /(^|\/)adv\./), '#2fb8a4');
  add('prep', '介词', '数量不多但搭配极多，是完形填空的常客。', 'link', e => hasPos(e, /(^|\/)prep\./), '#a06bf0');
  add('conj', '连词', '逻辑关系的开关，也是长难句的分层线。', 'branch', e => hasPos(e, /(^|\/)conj\./), '#d8a13a');
  add('pron', '代词', '指代与照应，阅读理解定位的关键。', 'user', e => hasPos(e, /(^|\/)pron\./), '#c0556f');
  add('irregular', '不规则动词', '过去式与过去分词不按 -ed 走的那批动词，动词填空的重灾区。', 'shuffle',
    e => irregularSet.has(e.word.toLowerCase()), '#e2703a');
  add('long', '长单词特训', '9 个字母以上。专治"手跟不上眼"，也是打字速度的分水岭。', 'ruler',
    e => e.length >= 9 && !e.multi, '#5b8def');
  add('short', '短词爆发', '4 个字母以内。练的是手指的条件反射与节奏感。', 'zap',
    e => e.length <= 4 && e.length >= 2 && !e.multi, '#d8a13a');
  add('phrase', '词组搭配', '固定搭配与短语动词，写作提分的直接来源。', 'blocks', e => e.multi, '#2fb8a4');
  add('confusable', '易混词对照', '拼写高度相似、含义却不同的词 —— 集中对照记忆最有效。', 'compare',
    e => confusableSet.has(e.word.toLowerCase()), '#c0556f');
  add('rootword', '同根词家族', '一个词根延伸出的一整族词（happy → happily → happiness）。', 'network',
    e => e.rels.length >= 2, '#a06bf0');
  add('mnemonic', '有记忆法的词', '数据源里自带词根拆解或联想记忆法的词，看一眼就记住。', 'lightbulb',
    e => !!e.mnemonic, '#d8a13a');

  fs.writeFileSync(
    path.join(OUT, 'books.json'),
    JSON.stringify({ generated: new Date().toISOString(), books })
  );
  fs.writeFileSync(path.join(PUB, 'categories.json'), JSON.stringify({ categories: cats }));
  if (irregular.length) {
    fs.writeFileSync(path.join(PUB, 'irregular-verbs.json'), JSON.stringify({ verbs: irregular }));
  }

  console.log('  categories:', cats.map(c => `${c.id}(${c.count})`).join(' '));
  console.log(`  confusable pairs: ${confusableSet.size} words have near-neighbours`);
  console.log(`  irregular verbs: ${irregular.length}`);
  console.log('Done.');
};

main();
