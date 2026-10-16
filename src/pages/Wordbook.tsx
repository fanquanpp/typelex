/**
 * Wordbook — browse and search the whole corpus.
 *
 * The index for a book is ~250 KB, so it is fetched once and filtered in memory.
 * Full detail is only requested for the word you open.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import AnimatedList from '../components/AnimatedList';
import { Reveal } from '../components/effects';
import { WordCard } from '../components/WordCard';
import { useApp } from '../lib/store';
import type { BookMeta, Detail, Word } from '../lib/types';
import { loadBooks, loadDetail, loadWordIndex } from '../lib/vocab';
import './Wordbook.css';

const PAGE = 120;

const SORTS = [
  { id: 'alpha', label: '字母顺序' },
  { id: 'length-desc', label: '由长到短' },
  { id: 'length-asc', label: '由短到长' }
] as const;

type SortId = (typeof SORTS)[number]['id'];

const Wordbook = () => {
  const settings = useApp(state => state.settings);
  const stars = useApp(state => state.stars);
  const known = useApp(state => state.known);
  const toggleStar = useApp(state => state.toggleStar);
  const setKnown = useApp(state => state.setKnown);
  const setConfig = useApp(state => state.setConfig);

  const [books, setBooks] = useState<BookMeta[]>([]);
  const [bookId, setBookId] = useState('highschool');
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [sort, setSort] = useState<SortId>('alpha');
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [active, setActive] = useState<Word | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    loadBooks().then(setBooks).catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLimit(PAGE);
    loadWordIndex(bookId)
      .then(list => {
        if (!alive) return;
        setWords(list);
        setActive(list[0] ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!active) {
      setDetail(null);
      return undefined;
    }
    let alive = true;
    loadDetail(active.book, active.word, active.shard)
      .then(value => {
        if (alive) setDetail(value);
      })
      .catch(() => {
        if (alive) setDetail(null);
      });
    return () => {
      alive = false;
    };
  }, [active]);

  const posOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of words) {
      for (const pos of word.pos.split('/').filter(Boolean)) {
        counts.set(pos, (counts.get(pos) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [words]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = words;
    if (needle) {
      list = list.filter(
        word =>
          word.word.toLowerCase().includes(needle) ||
          word.cn.toLowerCase().includes(needle) ||
          word.us.toLowerCase().includes(needle)
      );
    }
    if (posFilter) list = list.filter(word => word.pos.includes(posFilter));
    if (onlyStarred) {
      const set = new Set(stars);
      list = list.filter(word => set.has(`${word.book}:${word.word}`));
    }
    if (sort === 'length-desc') list = [...list].sort((a, b) => b.word.length - a.word.length);
    else if (sort === 'length-asc') list = [...list].sort((a, b) => a.word.length - b.word.length);
    return list;
  }, [words, query, posFilter, onlyStarred, stars, sort]);

  const visible = filtered.slice(0, limit);
  const book = books.find(entry => entry.id === bookId);

  return (
    <div className="shell page wordbook-page">
      <header className="page-head">
        <span className="eyebrow">Wordbook</span>
        <h1 className="page-title">词库</h1>
      </header>

      <Reveal as="section" className="stack-5">
        <div className="wordbook-toolbar">
          <div className="pill-row">
            {books.map(entry => (
              <button
                type="button"
                key={entry.id}
                className="pill"
                data-active={bookId === entry.id}
                onClick={() => setBookId(entry.id)}
              >
                {entry.name}
                <span className="faint"> {entry.count}</span>
              </button>
            ))}
          </div>

          <div className="row wrap" style={{ gap: 'var(--s3)' }}>
            <label className="field" style={{ minWidth: 220 }}>
              <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setLimit(PAGE);
                }}
                placeholder="搜索单词、释义或音标"
                aria-label="搜索单词"
              />
            </label>

            <label className="field">
              <select
                value={posFilter}
                onChange={event => setPosFilter(event.target.value)}
                aria-label="按词性筛选"
              >
                <option value="">全部词性</option>
                {posOptions.map(([pos, count]) => (
                  <option key={pos} value={pos}>
                    {pos} ({count})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <select value={sort} onChange={event => setSort(event.target.value as SortId)} aria-label="排序方式">
                {SORTS.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn btn-sm"
              data-active={onlyStarred}
              onClick={() => setOnlyStarred(value => !value)}
            >
              只看收藏 {stars.length > 0 && `· ${stars.length}`}
            </button>
          </div>
        </div>

        <div className="row-between wrap">
          <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
            共 <strong className="tnum">{filtered.length}</strong> 个词条
            {book && ` · ${book.short}`}
            {query && ` · 匹配「${query}」`}
          </span>
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <Link
              to="/practice"
              className="btn btn-sm"
              onClick={() => setConfig({ mode: 'random', books: [bookId] })}
            >
              用这个词表练习
            </Link>
          </div>
        </div>

        <div className="wordbook-layout">
          <div className="wordbook-list">
            <AnimatedList
              items={visible.map(word => ({
                id: `${word.book}:${word.word}`,
                title: word.word,
                description: `${word.us || word.uk} · ${word.cn}`
              }))}
              initialSelectedIndex={active ? visible.findIndex(word => word.word === active.word) : -1}
              animation="pop"
              animateOnce
              stagger={0.03}
              showGradients
              fadeSize={48}
              gap={5}
              className="wordbook-animated-list"
              onItemSelect={item => {
                const word = visible.find(entry => `${entry.book}:${entry.word}` === (item as { id?: string }).id);
                if (word) setActive(word);
              }}
            />
            {loading && <div className="shimmer" style={{ height: 320, margin: 'var(--s4)' }} />}
            {!loading && !visible.length && (
              <p className="muted" style={{ padding: 'var(--s6)' }}>
                没有匹配的词条。
              </p>
            )}
            {visible.length < filtered.length && (
              <div style={{ padding: 'var(--s4)' }}>
                <button type="button" className="btn btn-block" onClick={() => setLimit(value => value + PAGE)}>
                  加载更多（还有 {filtered.length - visible.length} 个）
                </button>
              </div>
            )}
          </div>

          <aside className="wordbook-detail">
            {active ? (
              <>
                <div className="wordbook-detail__actions">
                  <span className="faint mono" style={{ fontSize: 'var(--text-xs)' }}>
                    {active.uk && `英 /${active.uk}/`} {active.us && `美 /${active.us}/`}
                  </span>
                  <div className="row" style={{ gap: 'var(--s2)' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${stars.includes(`${active.book}:${active.word}`) ? 'btn-primary' : ''}`}
                      onClick={() => toggleStar(`${active.book}:${active.word}`)}
                    >
                      {stars.includes(`${active.book}:${active.word}`) ? '已收藏' : '收藏'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setKnown(`${active.book}:${active.word}`, known[`${active.book}:${active.word}`] === 2 ? 0 : 2)}
                    >
                      {known[`${active.book}:${active.word}`] === 2 ? '取消掌握' : '标记掌握'}
                    </button>
                  </div>
                </div>
                <WordCard word={active} detail={detail} theme={settings.theme} fill />
              </>
            ) : (
              <div className="empty">
                <strong>选择一个词</strong>
                <p className="muted">左侧列表里点任意词条查看详情。</p>
              </div>
            )}
          </aside>
        </div>
      </Reveal>
    </div>
  );
};

export default Wordbook;
