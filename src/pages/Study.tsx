/**
 * Study — the spaced-repetition side.
 *
 * Deliberately separate from practice: here the goal is recall, not speed. You
 * see the word, decide whether you knew it, and the scheduler adjusts. Typing the
 * word is optional but always available, because producing the spelling is what
 * makes the memory stick.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Reveal, SpotlightCard } from '../components/effects';
import { TypingLine } from '../components/TypingLine';
import { WordCard } from '../components/WordCard';
import { useApp } from '../lib/store';
import { describeInterval, maturity, type Grade } from '../lib/srs';
import type { BookMeta, Detail, Word } from '../lib/types';
import { loadBooks, loadDetail, loadWordIndex } from '../lib/vocab';
import './Study.css';

const GRADES: { grade: Grade; label: string; hint: string; key: string }[] = [
  { grade: 'again', label: '忘了', hint: '几分钟后再来', key: '1' },
  { grade: 'hard', label: '有点难', hint: '明天再见', key: '2' },
  { grade: 'good', label: '记得', hint: '按计划拉长', key: '3' },
  { grade: 'easy', label: '太简单', hint: '大幅拉长间隔', key: '4' }
];

const Study = () => {
  const settings = useApp(state => state.settings);
  const srs = useApp(state => state.srs);
  const review = useApp(state => state.review);
  const stars = useApp(state => state.stars);
  const toggleStar = useApp(state => state.toggleStar);
  const setKnown = useApp(state => state.setKnown);
  const known = useApp(state => state.known);
  const markStudySeen = useApp(state => state.markStudySeen);

  const [books, setBooks] = useState<BookMeta[]>([]);
  const [deck, setDeck] = useState<string>('due');
  const [cards, setCards] = useState<Word[]>([]);
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [typed, setTyped] = useState('');
  const [mode, setMode] = useState<'recall' | 'type'>('recall');
  const [sessionStats, setSessionStats] = useState({ seen: 0, again: 0, good: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadBooks().then(setBooks).catch(() => undefined);
  }, []);

  /* ---- build the deck ---- */
  useEffect(() => {
    let alive = true;
    const build = async () => {
      if (deck === 'due') {
        const now = Date.now();
        const keys = Object.entries(srs)
          .filter(([, card]) => card.due <= now)
          .sort((a, b) => a[1].due - b[1].due)
          .map(([key]) => key);
        if (!keys.length) {
          if (alive) setCards([]);
          return;
        }
        const grouped = new Map<string, string[]>();
        for (const key of keys) {
          const [book, ...rest] = key.split(':');
          if (!grouped.has(book)) grouped.set(book, []);
          grouped.get(book)!.push(rest.join(':'));
        }
        const out: Word[] = [];
        for (const [book, words] of grouped) {
          const index = await loadWordIndex(book);
          const lookup = new Map(index.map(word => [word.word, word]));
          for (const word of words) {
            const entry = lookup.get(word);
            if (entry) out.push(entry);
          }
        }
        if (alive) setCards(out);
        return;
      }

      if (deck === 'starred') {
        const keys = stars;
        const grouped = new Map<string, string[]>();
        for (const key of keys) {
          const [book, ...rest] = key.split(':');
          if (!grouped.has(book)) grouped.set(book, []);
          grouped.get(book)!.push(rest.join(':'));
        }
        const out: Word[] = [];
        for (const [book, words] of grouped) {
          const index = await loadWordIndex(book);
          const lookup = new Map(index.map(word => [word.word, word]));
          for (const word of words) {
            const entry = lookup.get(word);
            if (entry) out.push(entry);
          }
        }
        if (alive) setCards(out);
        return;
      }

      const index = await loadWordIndex(deck);
      if (alive) setCards(index);
    };
    void build();
    setCursor(0);
    setRevealed(false);
    setTyped('');
    return () => {
      alive = false;
    };
  }, [deck, srs, stars]);

  const current = cards[cursor] ?? null;

  useEffect(() => {
    if (!current) {
      setDetail(null);
      return undefined;
    }
    let alive = true;
    loadDetail(current.book, current.word, current.shard)
      .then(value => {
        if (alive) setDetail(value);
      })
      .catch(() => {
        if (alive) setDetail(null);
      });
    return () => {
      alive = false;
    };
  }, [current]);

  const advance = useCallback(() => {
    setRevealed(false);
    setTyped('');
    setCursor(value => value + 1);
  }, []);

  const grade = useCallback(
    (value: Grade) => {
      if (!current) return;
      const key = `${current.book}:${current.word}`;
      review(key, value);
      markStudySeen();
      setSessionStats(stats => ({
        seen: stats.seen + 1,
        again: stats.again + (value === 'again' ? 1 : 0),
        good: stats.good + (value === 'good' || value === 'easy' ? 1 : 0)
      }));
      advance();
    },
    [current, review, markStudySeen, advance]
  );

  /* keyboard shortcuts: 1-4 grade, space reveals */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        else grade('good');
        return;
      }
      const found = GRADES.find(entry => entry.key === event.key);
      if (found) {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        else grade(found.grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, grade]);

  const progress = useMemo(() => {
    if (!cards.length) return 0;
    return Math.min(1, cursor / cards.length);
  }, [cards.length, cursor]);

  const card = current ? srs[`${current.book}:${current.word}`] : undefined;
  const dueTotal = useMemo(
    () => Object.values(srs).filter(entry => entry.due <= Date.now()).length,
    [srs]
  );

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Study</span>
        <h1 className="page-title">记忆复习</h1>
        <p className="page-sub">
          看到单词先自己回想，再翻开答案。觉得记得就按 3，忘了就按 1 —— 间隔会自动调整。
          也可以用「打字模式」把拼写一起练。
        </p>
      </header>

      <Reveal as="section" className="stack-5">
        <div className="row-between wrap">
          <div className="pill-row">
            <button type="button" className="pill" data-active={deck === 'due'} onClick={() => setDeck('due')}>
              待复习 {dueTotal > 0 && `· ${dueTotal}`}
            </button>
            <button
              type="button"
              className="pill"
              data-active={deck === 'starred'}
              onClick={() => setDeck('starred')}
            >
              已收藏 {stars.length > 0 && `· ${stars.length}`}
            </button>
            {books.map(book => (
              <button
                type="button"
                key={book.id}
                className="pill"
                data-active={deck === book.id}
                onClick={() => setDeck(book.id)}
              >
                {book.name}
              </button>
            ))}
          </div>

          <div className="segmented">
            <button type="button" data-active={mode === 'recall'} onClick={() => setMode('recall')}>
              回想模式
            </button>
            <button type="button" data-active={mode === 'type'} onClick={() => setMode('type')}>
              打字模式
            </button>
          </div>
        </div>

        <div className="meter">
          <span style={{ width: `${progress * 100}%` }} />
        </div>

        {!cards.length ? (
          <div className="empty">
            <strong>{deck === 'due' ? '暂时没有到期卡片' : deck === 'starred' ? '还没有收藏任何词' : '这个词表是空的'}</strong>
            <p className="muted" style={{ maxWidth: '48ch' }}>
              {deck === 'due'
                ? '先去练习几轮，打错或打慢的词会自动进入复习队列。也可以直接选一个词表开始过词。'
                : '在练习页或词库里点「收藏」，词就会出现在这里。'}
            </p>
            <div className="row" style={{ gap: 'var(--s3)' }}>
              <Link to="/practice" className="btn btn-primary">
                去练习
              </Link>
              <Link to="/wordbook" className="btn">
                去词库
              </Link>
            </div>
          </div>
        ) : current ? (
          <div className="study-layout">
            <div className="study-main">
              <SpotlightCard className="study-card">
                <div className="study-card__head">
                  <span className="chip" style={{ borderColor: current.level === 1 ? '#2fb8a4' : current.level === 2 ? '#5b8def' : '#a06bf0' }}>
                    {current.level === 1 ? '高中' : current.level === 2 ? 'CET-4' : 'CET-6'}
                  </span>
                  <span className="faint mono" style={{ fontSize: 'var(--text-xs)' }}>
                    {cursor + 1} / {cards.length}
                  </span>
                </div>

                <h2 className="study-card__word">{current.word}</h2>
                <p className="study-card__phonetic">/{current.us || current.uk}/</p>

                {mode === 'type' ? (
                  <div className="study-card__type">
                    <TypingLine text={current.word} typed={typed} />
                    <input
                      ref={inputRef}
                      className="sr-only"
                      value={typed}
                      onChange={event => {
                        const value = event.target.value.replace(/[^a-zA-Z' -]/g, '');
                        setTyped(value);
                        if (value.toLowerCase() === current.word.toLowerCase()) {
                          setRevealed(true);
                          window.setTimeout(() => grade('good'), 420);
                        }
                      }}
                      autoFocus
                      aria-label="输入这个单词"
                    />
                    <p className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                      直接打字即可。打对后会自动进入下一张。
                    </p>
                  </div>
                ) : !revealed ? (
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => setRevealed(true)}>
                    显示答案
                    <span className="kbd" style={{ marginLeft: 6 }}>Space</span>
                  </button>
                ) : (
                  <div className="study-card__answer">
                    <p className="study-card__meaning">{current.cn}</p>
                    {detail?.s?.[0] && (
                      <div className="study-card__example">
                        <span className="mono">{detail.s[0][0]}</span>
                        <span className="muted">{detail.s[0][1]}</span>
                      </div>
                    )}
                    {detail?.r && detail.r.length > 0 && (
                      <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                        {detail.r
                          .flatMap(group => group[1])
                          .slice(0, 5)
                          .map(([word, cn]) => (
                            <span className="chip chip-violet" key={word} title={cn}>
                              {word}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {revealed && (
                  <div className="study-grades">
                    {GRADES.map(entry => (
                      <button
                        type="button"
                        key={entry.grade}
                        className={`study-grade study-grade--${entry.grade}`}
                        onClick={() => grade(entry.grade)}
                      >
                        <span className="study-grade__label">
                          {entry.label}
                          <span className="kbd" style={{ marginLeft: 5 }}>
                            {entry.key}
                          </span>
                        </span>
                        <span className="study-grade__hint">{entry.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </SpotlightCard>

              <div className="row-between wrap">
                <div className="row" style={{ gap: 'var(--s2)' }}>
                  <button type="button" className="btn btn-sm" onClick={advance}>
                    跳过
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => toggleStar(`${current.book}:${current.word}`)}
                  >
                    {stars.includes(`${current.book}:${current.word}`) ? '取消收藏' : '收藏'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setKnown(`${current.book}:${current.word}`, known[`${current.book}:${current.word}`] === 2 ? 0 : 2)}
                  >
                    {known[`${current.book}:${current.word}`] === 2 ? '取消已掌握' : '标记已掌握'}
                  </button>
                </div>
                {card && (
                  <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                    下次复习：{describeInterval(card)} · 熟悉度 {Math.round(maturity(card) * 100)}%
                  </span>
                )}
              </div>
            </div>

            <aside className="study-side">
              <WordCard
                word={current}
                detail={detail}
                theme={settings.theme}
                accent={current.level === 1 ? '#2fb8a4' : current.level === 2 ? '#5b8def' : '#a06bf0'}
                height={400}
              />
              <div className="panel panel-pad stack-3">
                <p className="eyebrow">本次</p>
                <div className="row" style={{ gap: 'var(--s5)' }}>
                  <div className="stat">
                    <span className="stat-value">{sessionStats.seen}</span>
                    <span className="stat-label">已看</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{sessionStats.good}</span>
                    <span className="stat-label">记得</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{sessionStats.again}</span>
                    <span className="stat-label">忘了</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="empty">
            <strong>这一轮过完了</strong>
            <p className="muted">本次看了 {sessionStats.seen} 张卡片，记得 {sessionStats.good} 张。</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setCursor(0);
                setSessionStats({ seen: 0, again: 0, good: 0 });
                setRevealed(false);
              }}
            >
              再过一轮
            </button>
          </div>
        )}
      </Reveal>
    </div>
  );
};

export default Study;
