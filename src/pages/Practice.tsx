/**
 * Practice hub — where a session is configured.
 *
 * Three choices, in the order that matters: which word list (an orbiting card
 * picker), which mode, and how long. Everything is written straight into the
 * persisted store, so the hub is restored exactly as it was after a refresh.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Reveal, useSpotlight } from '../components/effects';
import OrbitCards, { type OrbitItem } from '../components/OrbitCards';
import { useApp } from '../lib/store';
import { MODE_DESC, MODE_LABEL } from '../lib/typing/session';
import type { BookMeta, Category, PracticeMode, SessionConfig } from '../lib/types';
import { loadBooks, loadCategories } from '../lib/vocab';

const MODE_ORDER: PracticeMode[] = ['random', 'sequential', 'category', 'sentence', 'weak', 'srs', 'japanese'];

const MODE_ICON: Record<PracticeMode, string> = {
  random: 'M4 7h4l3 10h4l3-10h2',
  sequential: 'M4 6h16M4 12h10M4 18h6',
  category: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  sentence: 'M4 6h16M4 11h16M4 16h9',
  weak: 'M3 12h4l2-6 3 12 2-6h7',
  srs: 'M12 3a9 9 0 1 1-8.5 6M3 4v5h5',
  japanese: 'M5 5h14M12 5v14M8 19h8M9 9h6'
};

const JLPT = [
  { level: 5, name: 'N5', desc: '入门' },
  { level: 4, name: 'N4', desc: '基础' },
  { level: 3, name: 'N3', desc: '中级' },
  { level: 2, name: 'N2', desc: '进阶' },
  { level: 1, name: 'N1', desc: '高级' }
];

const ModeCard = ({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => {
  const ref = useSpotlight<HTMLButtonElement>(300);
  return (
    <button
      ref={ref}
      type="button"
      className="spotlight mode-card"
      data-active={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

const Practice = () => {
  const navigate = useNavigate();
  const config = useApp(state => state.config);
  const setConfig = useApp(state => state.setConfig);
  const srs = useApp(state => state.srs);

  const [books, setBooks] = useState<BookMeta[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([loadBooks(), loadCategories()])
      .then(([bookList, categoryList]) => {
        if (!alive) return;
        setBooks(bookList);
        setCategories(categoryList);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return Object.values(srs).filter(card => card.due <= now).length;
  }, [srs]);

  const studiedCount = Object.keys(srs).length;

  const patch = (value: Partial<SessionConfig>) => setConfig(value);

  const toggleBook = (id: string) => {
    const next = config.books.includes(id)
      ? config.books.filter(book => book !== id)
      : [...config.books, id];
    patch({ books: next.length ? next : [id] });
  };

  const toggleJlpt = (level: number) => {
    const current = config.jlpt ?? [5];
    const next = current.includes(level) ? current.filter(entry => entry !== level) : [...current, level];
    patch({ jlpt: next.length ? next.sort((a, b) => b - a) : [level] });
  };

  /* the orbiting picker: three word lists plus the five JLPT levels */
  const orbitItems: OrbitItem[] = useMemo(() => {
    const listItems: OrbitItem[] = books.map(book => ({
      id: book.id,
      label: book.name,
      accent: book.accent,
      content: (
        <div className="orbit-card">
          <div className="orbit-card__top">
            <span className="orbit-card__tag">{book.tag}</span>
            <span className="orbit-card__count">{book.count}</span>
          </div>
          <div>
            <div className="orbit-card__name">{book.name}</div>
            <div className="orbit-card__sub">{book.coverage.sentence} 条例句</div>
          </div>
          <div className="orbit-card__bar">
            <span style={{ width: `${Math.min(100, (book.count / 3800) * 100)}%` }} />
          </div>
        </div>
      )
    }));

    const jlptItems: OrbitItem[] = JLPT.map(entry => ({
      id: `jp-${entry.level}`,
      label: `日语 ${entry.name}`,
      accent: '#c0556f',
      content: (
        <div className="orbit-card">
          <div className="orbit-card__top">
            <span className="orbit-card__tag">JLPT {entry.name}</span>
            <span className="orbit-card__count">{entry.desc}</span>
          </div>
          <div>
            <div className="orbit-card__name">日语 {entry.name}</div>
            <div className="orbit-card__sub">罗马音输入</div>
          </div>
          <div className="orbit-card__bar">
            <span style={{ width: `${((6 - entry.level) / 5) * 100}%` }} />
          </div>
        </div>
      )
    }));

    return [...listItems, ...jlptItems];
  }, [books]);

  const selectedIds = useMemo(() => {
    if (config.mode === 'japanese') return (config.jlpt ?? [5]).map(level => `jp-${level}`);
    return config.books;
  }, [config.mode, config.jlpt, config.books]);

  const onOrbitSelect = (_index: number, item: OrbitItem) => {
    if (item.id.startsWith('jp-')) {
      const level = Number(item.id.replace('jp-', ''));
      patch({ mode: 'japanese', jlpt: [level] });
      return;
    }
    if (config.mode === 'japanese') patch({ mode: 'random' });
    toggleBook(item.id);
  };

  const totalWords = books
    .filter(book => config.books.includes(book.id))
    .reduce((sum, book) => sum + book.count, 0);

  const activeCategory = categories.find(category => category.id === config.category);

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Practice</span>
        <h1 className="page-title">配置一次练习</h1>
        <p className="page-sub">
          先选词库，再选模式。所有设置都会保存下来，刷新页面后回到这里仍然是同样的配置。
        </p>
      </header>

      {/* ---------------- word list picker ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <h2 className="section-title">选择词库</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              拖拽圆环可以旋转，点击卡片直接进入。可以多选英语词库叠加练习。
            </p>
          </div>
          <span className="chip">
            已选 <strong className="tnum">{config.mode === 'japanese' ? (config.jlpt ?? []).length : config.books.length}</strong>
            {' · '}
            <strong className="tnum">{config.mode === 'japanese' ? '日语' : totalWords}</strong> 词
          </span>
        </div>

        <div className="category-stage">
          <OrbitCards
            items={orbitItems}
            shape="ellipse"
            radiusX={560}
            radiusY={116}
            rotation={-7}
            duration={52}
            itemWidth={168}
            itemHeight={104}
            depth={0.6}
            hoverScale={1.1}
            hoverSpeed={0.22}
            draggable
            clickToFront
            showPath={false}
            activeId={selectedIds[0]}
            onItemClick={onOrbitSelect}
            centerContent={
              <div className="category-stage__center">
                <span className="eyebrow">Current</span>
                <strong>
                  {config.mode === 'japanese'
                    ? `日语 ${(config.jlpt ?? []).map(level => `N${level}`).join(' / ')}`
                    : books
                        .filter(book => config.books.includes(book.id))
                        .map(book => book.short)
                        .join(' + ') || '未选择'}
                </strong>
                <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                  点击卡片切换词库
                </span>
              </div>
            }
          />
        </div>

        <div className="book-list">
          {loading && <div className="shimmer" style={{ height: 74 }} />}
          {books.map(book => (
            <button
              type="button"
              key={book.id}
              className="book-row"
              data-active={config.mode !== 'japanese' && config.books.includes(book.id)}
              onClick={() => {
                if (config.mode === 'japanese') patch({ mode: 'random' });
                toggleBook(book.id);
              }}
            >
              <span className="book-row__dot" style={{ background: book.accent }} />
              <span className="book-row__body">
                <span className="book-row__name">{book.name}</span>
                <span className="book-row__desc">{book.desc}</span>
                <span className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                  <span className="chip">{book.count} 词</span>
                  <span className="chip">{book.coverage.sentence} 例句</span>
                  <span className="chip">{book.coverage.related} 同根词</span>
                  {book.coverage.exam > 0 && <span className="chip chip-amber">{book.coverage.exam} 真题句</span>}
                  {book.coverage.mnemonic > 0 && <span className="chip chip-violet">{book.coverage.mnemonic} 记忆法</span>}
                </span>
              </span>
              <span className="book-row__count">{book.short}</span>
            </button>
          ))}

          <button
            type="button"
            className="book-row"
            data-active={config.mode === 'japanese'}
            onClick={() => patch({ mode: 'japanese', jlpt: config.jlpt ?? [5, 4] })}
          >
            <span className="book-row__dot" style={{ background: '#c0556f' }} />
            <span className="book-row__body">
              <span className="book-row__name">日语 JLPT 词表</span>
              <span className="book-row__desc">
                用罗马音输入日语单词：N5–N4 提供中文释义，N3–N1 提供英文释义。假名、汉字与罗马音同步显示。
              </span>
              <span className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                {JLPT.map(entry => (
                  <span
                    key={entry.level}
                    className="chip"
                    style={
                      (config.jlpt ?? []).includes(entry.level) && config.mode === 'japanese'
                        ? { borderColor: '#c0556f', color: '#c0556f' }
                        : undefined
                    }
                    onClick={event => {
                      event.stopPropagation();
                      patch({ mode: 'japanese' });
                      toggleJlpt(entry.level);
                    }}
                  >
                    {entry.name} · {entry.desc}
                  </span>
                ))}
              </span>
            </span>
            <span className="book-row__count">日语</span>
          </button>
        </div>
      </Reveal>

      {/* ---------------- mode ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <h2 className="section-title">练习模式</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              随机与顺序练手感，专项与句子练具体知识点，弱键与复习负责查漏补缺。
            </p>
          </div>
        </div>

        <div className="mode-grid">
          {MODE_ORDER.map(mode => (
            <ModeCard key={mode} active={config.mode === mode} onClick={() => patch({ mode })}>
              <span className="mode-card__head">
                <span className="mode-card__name">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d={MODE_ICON[mode]} />
                  </svg>
                  {MODE_LABEL[mode]}
                </span>
                {mode === 'srs' && dueCount > 0 && <span className="chip chip-amber">{dueCount} 待复习</span>}
                {mode === 'japanese' && <span className="chip chip-rose">罗马音</span>}
              </span>
              <span className="mode-card__desc">{MODE_DESC[mode]}</span>
              <span className="mode-card__meta">
                {mode === 'srs' ? `${studiedCount} 张卡片在库` : `${totalWords} 词可选`}
              </span>
            </ModeCard>
          ))}
        </div>
      </Reveal>

      {/* ---------------- category ---------------- */}
      {config.mode === 'category' && (
        <Reveal as="section" className="stack-6">
          <div className="section-head">
            <div>
              <h2 className="section-title">专项分类</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                {activeCategory ? activeCategory.desc : '按词性或主题集中突破。选一个分类开始。'}
              </p>
            </div>
            {activeCategory && <span className="chip chip-primary">{activeCategory.count} 词</span>}
          </div>
          <div className="mode-grid">
            {categories.map(category => (
              <button
                type="button"
                key={category.id}
                className="mode-card"
                data-active={config.category === category.id}
                onClick={() => patch({ category: category.id })}
              >
                <span className="mode-card__head">
                  <span className="mode-card__name">{category.name}</span>
                  <span className="chip" style={{ color: category.accent, borderColor: category.accent }}>
                    {category.count}
                  </span>
                </span>
                <span className="mode-card__desc">{category.desc}</span>
              </button>
            ))}
          </div>
        </Reveal>
      )}

      {/* ---------------- length ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <h2 className="section-title">本次设置</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              时间模式会在倒计时结束时结算；词数模式打满指定数量后结算。
            </p>
          </div>
        </div>

        <div className="panel panel-pad stack-4">
          <div className="row-between wrap">
            <div className="setting-row__label">
              <strong>练习长度</strong>
              <span>用时间限制，还是用词数限制</span>
            </div>
            <div className="segmented">
              <button type="button" data-active={config.length === 'count'} onClick={() => patch({ length: 'count' })}>
                词数
              </button>
              <button type="button" data-active={config.length === 'time'} onClick={() => patch({ length: 'time' })}>
                时间
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="row-between wrap">
            <div className="setting-row__label">
              <strong>{config.length === 'count' ? '词数' : '时长'}</strong>
              <span>
                当前：{config.amount} {config.length === 'count' ? '个' : '秒'}
              </span>
            </div>
            <div className="pill-row">
              {(config.length === 'count' ? [10, 20, 30, 50, 100] : [30, 60, 120, 180, 300]).map(value => (
                <button
                  type="button"
                  key={value}
                  className="pill"
                  data-active={config.amount === value}
                  onClick={() => patch({ amount: value })}
                >
                  {value}
                  {config.length === 'count' ? ' 词' : ' 秒'}
                </button>
              ))}
            </div>
          </div>

          <div className="divider" />

          <div className="setting-row" style={{ border: 0, padding: 0 }}>
            <div className="setting-row__label">
              <strong>严格模式</strong>
              <span>打错直接忽略，必须一次打对才能继续</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="switch"
                data-on={config.strict}
                aria-pressed={config.strict}
                aria-label="严格模式"
                onClick={() => patch({ strict: !config.strict })}
              />
            </div>
          </div>

          <div className="setting-row" style={{ border: 0, padding: 0 }}>
            <div className="setting-row__label">
              <strong>显示单词卡</strong>
              <span>每打完一个词，右侧卡片会同步显示释义与用法</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="switch"
                data-on={config.showCard}
                aria-pressed={config.showCard}
                aria-label="显示单词卡"
                onClick={() => patch({ showCard: !config.showCard })}
              />
            </div>
          </div>
        </div>
      </Reveal>

      {/* ---------------- start ---------------- */}
      <Reveal as="section">
        <div className="panel panel-pad-lg row-between wrap" style={{ gap: 'var(--s5)' }}>
          <div className="stack-2">
            <strong style={{ fontSize: 'var(--text-lg)' }}>
              {MODE_LABEL[config.mode]}
              {config.mode === 'category' && activeCategory ? ` · ${activeCategory.name}` : ''}
            </strong>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              {config.mode === 'japanese'
                ? `日语 ${(config.jlpt ?? []).map(level => `N${level}`).join(' / ')} · ${config.amount}${config.length === 'count' ? ' 词' : ' 秒'}`
                : `${books
                    .filter(book => config.books.includes(book.id))
                    .map(book => book.name)
                    .join(' + ')} · ${config.amount}${config.length === 'count' ? ' 词' : ' 秒'}`}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/practice/session')}
            disabled={config.mode === 'srs' && dueCount === 0}
          >
            {config.mode === 'srs' && dueCount === 0 ? '暂无到期卡片' : '开始练习'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h13M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </Reveal>
    </div>
  );
};

export default Practice;
