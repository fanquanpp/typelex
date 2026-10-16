/**
 * The practice session.
 *
 * Restores an in-flight session from the store if one exists (so a refresh drops
 * you back mid-run), otherwise builds a fresh queue. Keystrokes drive the 3D
 * keyboard imperatively — no React re-render per key — and the result is written
 * back to the store with XP, key statistics and spaced-repetition grades.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import KeyboardStage from '../components/KeyboardStage';
import { CountUp, Reveal, SpotlightCard } from '../components/effects';
import { TypingSlots } from '../components/TypingSlots';
import { WordCard } from '../components/WordCard';
import { useApp } from '../lib/store';
import { gradeFromAttempt } from '../lib/srs';
import type { Detail, SessionResult } from '../lib/types';
import { loadDetail, loadBooks, prefetchDetail } from '../lib/vocab';
import { codeForChar, FINGER_COLOR, FINGER_LABEL, fingerForChar } from '../lib/typing/fingers';
import { xpForSession } from '../lib/typing/metrics';
import { MODE_LABEL, buildQueue, type PracticeItem } from '../lib/typing/session';
import { useTypingSession } from '../lib/typing/useTypingSession';
import type { CssKeyboardScene } from '../three/keyboard/CssKeyboardScene';
import './Session.css';

const SAVE_INTERVAL = 2500;

const Session = () => {
  const config = useApp(state => state.config);
  const settings = useApp(state => state.settings);
  const storedSession = useApp(state => state.session);
  const setSession = useApp(state => state.setSession);
  const recordSession = useApp(state => state.recordSession);
  const mergeKeyStats = useApp(state => state.mergeKeyStats);
  const review = useApp(state => state.review);
  const toggleStar = useApp(state => state.toggleStar);
  const stars = useApp(state => state.stars);
  const known = useApp(state => state.known);
  const srs = useApp(state => state.srs);
  const setCursor = useApp(state => state.setCursor);
  const cursors = useApp(state => state.cursors);

  const [queue, setQueue] = useState<PracticeItem[] | null>(null);
  const [initialIndex, setInitialIndex] = useState(0);
  const [initialElapsed, setInitialElapsed] = useState(0);
  const [restored, setRestored] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [books, setBooks] = useState<{ id: string; accent: string; short: string }[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [itemHadError, setItemHadError] = useState(false);

  const sceneRef = useRef<CssKeyboardScene | null>(null);
  const onReady = useCallback((scene: CssKeyboardScene | null) => {
    sceneRef.current = scene;
  }, []);

  /* ---------------- queue construction / restore ---------------- */

  useEffect(() => {
    let alive = true;
    loadBooks().then(list => {
      if (alive) setBooks(list.map(book => ({ id: book.id, accent: book.accent, short: book.short })));
    });

    const sameConfig =
      storedSession &&
      storedSession.config.mode === config.mode &&
      storedSession.config.category === config.category &&
      storedSession.config.books.join(',') === config.books.join(',') &&
      storedSession.queue.length > 0;

    if (sameConfig && storedSession) {
      setQueue(storedSession.queue);
      setInitialIndex(storedSession.index);
      setInitialElapsed(storedSession.elapsed);
      setRestored(true);
      return () => {
        alive = false;
      };
    }

    const seed = Math.floor(Math.random() * 2 ** 31);
    const cursorKey = `${[...config.books].sort().join('-')}|${config.category ?? ''}`;
    buildQueue(config, {
      keyStats: useApp.getState().keyStats,
      known: new Set(Object.entries(known).filter(([, state]) => state === 2).map(([key]) => key)),
      dueWords: Object.entries(srs)
        .filter(([, card]) => card.due <= Date.now())
        .map(([key]) => {
          const [book, ...rest] = key.split(':');
          return { word: rest.join(':'), book, shard: 0 };
        }),
      cursor: cursors[cursorKey] ?? 0,
      seed
    })
      .then(built => {
        if (!alive) return;
        if (!built.items.length) {
          setLoadError('这个组合下暂时没有可练习的内容，换一个词库或分类试试。');
          return;
        }
        setQueue(built.items);
        setInitialIndex(0);
        setInitialElapsed(0);
        if (config.mode === 'sequential') setCursor(cursorKey, built.cursor);
        setSession({
          id: `${seed}`,
          queue: built.items,
          index: 0,
          startedAt: Date.now(),
          elapsed: 0,
          correct: 0,
          incorrect: 0,
          extra: 0,
          missed: 0,
          chars: 0,
          errorsByKey: {},
          config,
          seed
        });
      })
      .catch(error => {
        console.error(error);
        if (alive) setLoadError('词库加载失败，请检查网络后重试。');
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishRef = useRef<(value: SessionResult) => void>(() => {});

  const callbacks = useMemo(
    () => ({
      onKeyDown: (code: string, _char: string, correct: boolean) => {
        sceneRef.current?.press(code, correct);
        if (!correct) setItemHadError(true);
      },
      onKeyUp: (code: string) => sceneRef.current?.release(code),
      onError: (code: string) => sceneRef.current?.error(code),
      onItemComplete: (item: PracticeItem, info: { ms: number; errors: number }) => {
        setItemHadError(false);
        /* feed the spaced-repetition scheduler from the attempt itself */
        if (item.word) {
          const key = `${item.word.book}:${item.word.word}`;
          const msPerChar = info.ms / Math.max(1, item.text.length);
          const card = srs[key];
          review(
            key,
            gradeFromAttempt({
              hadError: info.errors > 0,
              corrected: info.errors > 0,
              msPerChar,
              mature: (card?.interval ?? 0) >= 6
            })
          );
        }
      },
      onFinish: (value: SessionResult) => finishRef.current(value)
    }),
    [review, srs]
  );

  const { view, restart, togglePause, skip } = useTypingSession({
    queue: queue ?? [],
    config,
    soundEnabled: settings.soundEnabled,
    soundProfile: settings.soundProfile,
    volume: settings.volume,
    callbacks,
    initialIndex,
    initialElapsed,
    active: Boolean(queue) && !result
  });

  /* ---------------- detail loading for the current word ---------------- */

  useEffect(() => {
    const item = view.item;
    if (!item) {
      setDetail(null);
      return;
    }
    if (item.kind === 'word' && item.word) {
      let alive = true;
      loadDetail(item.word.book, item.word.word, item.word.shard)
        .then(value => {
          if (alive) setDetail(value);
        })
        .catch(() => {
          if (alive) setDetail(null);
        });
      return () => {
        alive = false;
      };
    }
    setDetail(null);
    return undefined;
  }, [view.item]);

  /* prefetch the next word's shard so the card never lags behind */
  useEffect(() => {
    const next = queue?.[view.index + 1];
    if (next?.kind === 'word' && next.word) prefetchDetail(next.word.book, next.word.shard);
  }, [queue, view.index]);

  /* ---------------- next-key highlight + finger hint ---------------- */

  const nextChar = view.item ? Array.from(view.item.text)[view.typed.length] ?? null : null;
  const nextCode = nextChar ? codeForChar(nextChar) : null;
  const nextFinger = nextChar ? fingerForChar(nextChar) : null;

  useEffect(() => {
    sceneRef.current?.highlight(nextCode);
  }, [nextCode]);

  /* ---------------- session persistence ---------------- */

  useEffect(() => {
    if (!queue || result) return undefined;
    const timer = window.setInterval(() => {
      const current = useApp.getState().session;
      if (!current) return;
      setSession({ ...current, index: view.index, elapsed: view.elapsed * 1000 });
    }, SAVE_INTERVAL);
    return () => window.clearInterval(timer);
  }, [queue, result, view.index, view.elapsed, setSession]);

  /* ---------------- finish handling ---------------- */

  const handleFinish = useCallback(
    (value: SessionResult) => {
      const xp = xpForSession(value);
      const withXp: SessionResult = { ...value, xp };
      recordSession(withXp);
      mergeKeyStats(
        Object.fromEntries(
          Object.entries(value.errorsByKey).map(([char, misses]) => [
            char,
            { hits: 0, misses, time: 0, best: 0, samples: 0 }
          ])
        )
      );
      setResult(withXp);
      setSession(null);
      sceneRef.current?.pulse();
    },
    [mergeKeyStats, recordSession, setSession]
  );
  finishRef.current = handleFinish;

  /* ---------------- render ---------------- */

  const item = view.item;
  /* Fallback accents mirror the CET-4 book colour and the Japanese track hue;
     real values come from books.json so the palette stays data-driven. */
  const FALLBACK_ACCENT = '#5b8def';
  const JAPANESE_ACCENT = '#c0556f';
  const accent = useMemo(() => {
    if (!item) return FALLBACK_ACCENT;
    if (item.kind === 'japanese') return JAPANESE_ACCENT;
    return books.find(book => book.id === item.book)?.accent ?? FALLBACK_ACCENT;
  }, [item, books]);

  if (loadError) {
    return (
      <div className="shell page">
        <div className="empty">
          <strong>无法开始练习</strong>
          <p className="muted">{loadError}</p>
          <Link to="/practice" className="btn btn-primary">
            返回配置
          </Link>
        </div>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="shell page">
        <div className="empty">
          <div className="shimmer" style={{ width: 220, height: 20 }} />
          <p className="muted">正在准备题目…</p>
        </div>
      </div>
    );
  }

  if (result) {
    const maxWpm = Math.max(10, ...result.samples.map(sample => sample.raw));
    const points = result.samples.length
      ? result.samples
          .map((sample, index) => {
            const x = (index / Math.max(1, result.samples.length - 1)) * 100;
            const y = 100 - (sample.raw / maxWpm) * 100;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(' ')
      : '0,100 100,100';

    return (
      <div className="shell page">
        <Reveal as="section" className="stack-6">
          <div className="page-head">
            <span className="eyebrow">Result</span>
            <h1 className="page-title">本次练习完成</h1>
            <p className="page-sub">
              {MODE_LABEL[result.mode]} · {Math.round(result.duration)} 秒 · {result.items} 项 · 获得{' '}
              <strong className="tnum">{result.xp}</strong> XP
            </p>
          </div>

          <div className="result-grid">
            {[
              { label: 'WPM', value: result.wpm, decimals: 1, hint: '每分钟净词数' },
              { label: '原始 WPM', value: result.raw, decimals: 1, hint: '包含所有按键' },
              { label: '准确率', value: result.accuracy, decimals: 1, suffix: '%', hint: '逐键统计' },
              { label: '稳定性', value: result.consistency, decimals: 1, suffix: '%', hint: '速度波动越小越高' },
              { label: '正确字符', value: result.correct, decimals: 0 },
              { label: '错误次数', value: result.incorrect + result.extra, decimals: 0 }
            ].map(entry => (
              <SpotlightCard className="result-card" key={entry.label}>
                <div className="stat">
                  <span className="stat-value">
                    <CountUp to={entry.value} decimals={entry.decimals} suffix={entry.suffix ?? ''} />
                  </span>
                  <span className="stat-label">{entry.label}</span>
                  {entry.hint && <span className="faint" style={{ fontSize: 10 }}>{entry.hint}</span>}
                </div>
              </SpotlightCard>
            ))}
          </div>

          {result.samples.length > 2 && (
            <div className="panel panel-pad">
              <p className="eyebrow" style={{ marginBottom: 'var(--s4)' }}>
                速度曲线（每秒原始 WPM）
              </p>
              <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[25, 50, 75].map(y => (
                  <line key={y} className="chart-grid" x1="0" y1={y} x2="100" y2={y} vectorEffect="non-scaling-stroke" />
                ))}
                <polygon className="chart-area" points={`0,100 ${points} 100,100`} />
                <polyline className="chart-line" points={points} vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          )}

          <div className="row wrap" style={{ gap: 'var(--s3)' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setResult(null);
                setDetail(null);
                restart();
              }}
            >
              再来一次
            </button>
            <Link to="/practice" className="btn">
              换个模式
            </Link>
            <Link to="/stats" className="btn btn-ghost">
              查看数据
            </Link>
          </div>
        </Reveal>
      </div>
    );
  }

  const activeWord = item?.kind === 'word' ? item.word ?? null : null;
  const activeWordKey = activeWord ? `${activeWord.book}:${activeWord.word}` : null;
  const progress = queue.length ? view.index / queue.length : 0;
  const remainingSeconds = config.length === 'time' ? Math.max(0, config.amount - view.elapsed) : null;

  return (
    <div className="shell page session-page">
      <div className="session-bar">
        <div className="row" style={{ gap: 'var(--s3)' }}>
          <Link to="/practice" className="btn btn-sm btn-ghost">
            ← 退出
          </Link>
          <span className="chip">{MODE_LABEL[config.mode]}</span>
          {restored && <span className="chip">已恢复上次进度</span>}
        </div>

        <div className="session-progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%`, background: accent }} />
        </div>

        <div className="row" style={{ gap: 'var(--s2)' }}>
          <span className="mono faint" style={{ fontSize: 'var(--text-xs)' }}>
            {view.index + 1} / {queue.length}
          </span>
          <button type="button" className="btn btn-sm" onClick={togglePause}>
            {view.paused ? '继续' : '暂停'}
          </button>
          <button type="button" className="btn btn-sm" onClick={skip}>
            跳过
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setShowKeyboard(value => !value)}
            aria-pressed={showKeyboard}
          >
            {showKeyboard ? '隐藏键盘' : '显示键盘'}
          </button>
        </div>
      </div>

      <div className="session-layout">
        <div className="session-main">
          <div className="typing-stage">
            {item ? (
              <>
                <TypingSlots
                  text={item.text}
                  typed={view.typed}
                  sentence={item.kind === 'sentence'}
                  errorAt={view.missedAt}
                />
                <div className="typing-hint">
                  {item.kind === 'japanese' && item.jp ? (
                    <>
                      <span className="jp" style={{ fontSize: 'var(--text-lg)' }}>
                        {item.jp.kanji || item.jp.kana}
                      </span>
                      <span className="mono faint">{item.jp.kana}</span>
                      <span className="divider-dot" />
                      <span>{item.meaning}</span>
                    </>
                  ) : item.kind === 'sentence' ? (
                    <span className="muted">{item.translation}</span>
                  ) : (
                    <>
                      <span className="mono faint">{item.phonetic}</span>
                      <span className="divider-dot" />
                      <span>{item.meaning}</span>
                    </>
                  )}
                </div>
                <div className="typing-hint">
                  {nextChar && nextCode && (
                    <>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="eyebrow" style={{ letterSpacing: 'var(--tracking-wide)' }}>
                          下一个键
                        </span>
                        <span className="kbd">{nextChar === ' ' ? 'Space' : nextChar}</span>
                        {nextFinger && (
                          <span className="row" style={{ gap: 5 }}>
                            <i
                              style={{
                                width: 9,
                                height: 9,
                                borderRadius: 3,
                                background: FINGER_COLOR[nextFinger],
                                display: 'inline-block'
                              }}
                            />
                            <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                              {FINGER_LABEL[nextFinger]}
                            </span>
                          </span>
                        )}
                      </span>
                      <span className="divider-dot" />
                    </>
                  )}
                  <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                    按 Esc 退出 · Backspace 删除 · 直接开始打字即可
                  </span>
                </div>
              </>
            ) : (
              <p className="muted">正在加载…</p>
            )}
          </div>

          <div className="live-stats">
            {[
              { label: 'WPM', value: view.wpm.toFixed(1) },
              { label: '原始', value: view.raw.toFixed(1) },
              { label: '准确率', value: `${view.accuracy.toFixed(0)}%` },
              { label: '稳定性', value: `${view.consistency.toFixed(0)}%` },
              { label: '用时', value: remainingSeconds !== null ? `${remainingSeconds.toFixed(0)}s` : `${view.elapsed.toFixed(0)}s` },
              { label: '剩余', value: `${view.remaining}` }
            ].map(entry => (
              <div className="live-stat" key={entry.label}>
                <div className="live-stat__value">{entry.value}</div>
                <div className="live-stat__label">{entry.label}</div>
              </div>
            ))}
          </div>

          {showKeyboard && (
            <div className="keyboard-frame" style={{ height: 'clamp(220px, 30vw, 320px)' }}>
              <KeyboardStage
                modelId={settings.keyboardModel}
                theme={settings.theme}
                fingerHints={settings.fingerHints}
                showNextKey={settings.showNextKey}
                rgbStyle={settings.rgbStyle}
                interactive
                onReady={onReady}
                onKeyClick={code => {
                  sceneRef.current?.press(code, true);
                  window.setTimeout(() => sceneRef.current?.release(code), 110);
                }}
              />
            </div>
          )}
        </div>

        <aside className="session-side">
          {config.showCard && (
            <WordCard
              word={activeWord}
              detail={detail}
              theme={settings.theme}
              accent={accent}
              flat
              fill
              starred={activeWordKey ? stars.includes(activeWordKey) : false}
              onStar={activeWordKey ? () => toggleStar(activeWordKey) : undefined}
              placeholder="当前不是单词模式"
            />
          )}

          <div className="panel panel-pad stack-3">
            <p className="eyebrow">本次按键错误</p>
            {Object.keys(view.errorsByKey).length === 0 ? (
              <p className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                还没有错误，保持住。
              </p>
            ) : (
              <div className="kbd-row">
                {Object.entries(view.errorsByKey)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([char, count]) => (
                    <span className="kbd" key={char} title={`${count} 次`}>
                      {char === ' ' ? '␣' : char}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {view.paused && (
        <div className="session-pause" role="dialog" aria-label="已暂停">
          <div className="panel panel-pad-lg stack-4" style={{ maxWidth: 380, textAlign: 'center' }}>
            <strong style={{ fontSize: 'var(--text-lg)' }}>已暂停</strong>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              计时已停止，进度已经保存。刷新页面也不会丢失。
            </p>
            <div className="row" style={{ justifyContent: 'center', gap: 'var(--s3)' }}>
              <button type="button" className="btn btn-primary" onClick={togglePause}>
                继续练习
              </button>
              <Link to="/practice" className="btn btn-ghost">
                退出
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="session-footer-hint">
        <span className="faint">
          {known && Object.keys(known).length > 0
            ? `词库中已标记 ${Object.keys(known).length} 个词的掌握状态`
            : '提示：在记忆页可以标记已掌握的词，随机模式会自动跳过它们'}
        </span>
        <span className="faint">
          {itemHadError ? '这一项出现过错误，打完会被安排更早复习' : '节奏不错，保持这个手感'}
        </span>
      </div>
    </div>
  );
};

export default Session;
