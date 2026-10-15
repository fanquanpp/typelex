/**
 * Home.
 *
 * The landing page has one job: show the keyboard, explain the loop
 * (打 → 记 → 复习), and get the user into a session. It reuses the real 3D
 * keyboard rather than a screenshot, so the first thing a visitor sees is the
 * thing they will actually use.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import KeyboardStage from '../components/KeyboardStage';
import OrbitCards, { type OrbitItem } from '../components/OrbitCards';
import { CountUp, GradientText, Reveal, ShinyText, SplitText, SpotlightCard, TiltCard } from '../components/effects';
import { useApp } from '../lib/store';
import { levelProgress } from '../lib/typing/metrics';
import { MODE_DESC, MODE_LABEL } from '../lib/typing/session';
import type { BookMeta, PracticeMode } from '../lib/types';
import { loadBooks } from '../lib/vocab';
import type { KeyboardScene } from '../three/keyboard/KeyboardScene';
import { MODELS } from '../three/keyboard/models';
import './Home.css';

const LOOP: { mode: PracticeMode; title: string; body: string; icon: string }[] = [
  {
    mode: 'random',
    title: '打',
    body: '在拟真键盘上打出整个单词。手指先记住位置，眼睛才跟得上。',
    icon: 'M4 7h16M4 12h11M4 17h7'
  },
  {
    mode: 'category',
    title: '记',
    body: '打完一个词，卡片立刻给出词性、释义、同根词与例句 —— 打字和背词同时发生。',
    icon: 'M5 5h9a3 3 0 0 1 3 3v11H8a3 3 0 0 1-3-3zM17 8h2v11h-9'
  },
  {
    mode: 'srs',
    title: '复习',
    body: '打错或打慢的词会被排进更早的复习队列，答对就拉长间隔。',
    icon: 'M12 3a9 9 0 1 1-8.5 6M3 4v5h5'
  }
];

const FEATURES = [
  {
    title: '9,482 个词条',
    body: '高中 3665、四级 3739、六级 2078，每个词条都带音标、词性、中英释义、例句与常用搭配。',
    icon: 'M4 5h16v14H4zM4 9h16M9 9v10'
  },
  {
    title: '同根词与易混词',
    body: 'happy 的卡片上会同时出现 happily、happiness；拼写接近的词会被单独标出来对照记忆。',
    icon: 'M12 4v6m0 4v6M6 8h12M6 16h12'
  },
  {
    title: '七种练习模式',
    body: '随机、顺序、专项、句子、弱键特训、记忆复习、日语罗马音 —— 每种都对应一个具体目标。',
    icon: 'M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v4H4zM14 16h6v4h-6z'
  },
  {
    title: '15 种键盘手感',
    body: '从笔记本巧克力键到 75% 客制化机械键盘，含天选、ROG、ThinkPad、Legion 等真实机型风格。',
    icon: 'M3 8h18v9H3zM7 12h1M11 12h1M15 12h1M8 15h8'
  },
  {
    title: '逐键数据',
    body: '每个键的用时与错误率都会记录，弱键特训据此生成，热力图让你看见自己的手指习惯。',
    icon: 'M4 19V9M9 19V5M14 19v-7M19 19v-4'
  },
  {
    title: '日语罗马音',
    body: '7,032 个 JLPT 词条（N5–N1），输入罗马音即可练习，同步显示假名、汉字与释义。',
    icon: 'M5 5h14M12 5v14M8 19h8'
  }
];

const Home = () => {
  const settings = useApp(state => state.settings);
  const xp = useApp(state => state.xp);
  const history = useApp(state => state.history);
  const daily = useApp(state => state.daily);
  const srs = useApp(state => state.srs);
  const streak = useApp(state => state.streak);
  const setSetting = useApp(state => state.setSetting);

  const [books, setBooks] = useState<BookMeta[]>([]);
  const sceneRef = useRef<KeyboardScene | null>(null);

  useEffect(() => {
    let alive = true;
    loadBooks()
      .then(list => {
        if (alive) setBooks(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /* a slow, idle key-press demo so the hero keyboard reads as alive */
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const codes = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'KeyG', 'KeyH'];
    const timer = window.setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      const code = codes[Math.floor(Math.random() * codes.length)];
      scene.press(code, true);
      window.setTimeout(() => scene.release(code), 130);
    }, 1700);
    return () => window.clearInterval(timer);
  }, []);

  const progress = useMemo(() => levelProgress(xp), [xp]);

  const summary = useMemo(() => {
    const best = history.reduce((max, entry) => Math.max(max, entry.wpm), 0);
    const totalSeconds = Object.values(daily).reduce((sum, entry) => sum + entry.seconds, 0);
    const due = Object.values(srs).filter(card => card.due <= Date.now()).length;
    const avgAccuracy = history.length
      ? history.slice(0, 20).reduce((sum, entry) => sum + entry.accuracy, 0) / Math.min(20, history.length)
      : 0;
    return { best, totalSeconds, due, avgAccuracy, cards: Object.keys(srs).length };
  }, [history, daily, srs]);

  const orbitItems: OrbitItem[] = useMemo(
    () =>
      books.map(book => ({
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
              <div className="orbit-card__sub">{book.coverage.related} 个同根词</div>
            </div>
            <div className="orbit-card__bar">
              <span style={{ width: `${Math.min(100, (book.count / 3800) * 100)}%` }} />
            </div>
          </div>
        )
      })),
    [books]
  );

  const totalWords = books.reduce((sum, book) => sum + book.count, 0);

  return (
    <div className="shell page home">
      {/* ---------------- hero ---------------- */}
      <section className="hero">
        <div className="hero__copy">
          <span className="chip chip-primary">
            <ShinyText>拟真 3D 键盘 · 词汇记忆</ShinyText>
          </span>
          <h1 className="hero__title">
            <SplitText text="把单词打进" effect="rise" />
            <span>
              <GradientText>肌肉记忆里</GradientText>
            </span>
          </h1>
          <p className="lede">
            TypeLex 把打字练习和词汇记忆合成一件事：你在真实键位的 3D 键盘上打出单词，
            卡片同时告诉你它的词性、释义、同根词与例句。打错的词会自动排进更早的复习。
          </p>

          <div className="hero__actions">
            <Link to="/practice" className="btn btn-primary btn-lg">
              开始练习
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </Link>
            <Link to="/wordbook" className="btn btn-lg">
              先看看词库
            </Link>
            <Link to="/keyboard" className="btn btn-lg btn-ghost">
              挑一把键盘
            </Link>
          </div>

          <div className="hero__facts">
            <div className="hero__fact">
              <strong>
                <CountUp to={totalWords || 9482} />
              </strong>
              <span>英语词条</span>
            </div>
            <div className="hero__fact">
              <strong>
                <CountUp to={7032} />
              </strong>
              <span>日语词条</span>
            </div>
            <div className="hero__fact">
              <strong>
                <CountUp to={MODELS.length} />
              </strong>
              <span>键盘手感</span>
            </div>
            <div className="hero__fact">
              <strong>
                <CountUp to={progress.level} />
              </strong>
              <span>当前等级</span>
            </div>
          </div>
        </div>

        <div className="hero__stage">
          <KeyboardStage
            modelId={settings.keyboardModel}
            theme={settings.theme}
            fingerHints={settings.fingerHints}
            showNextKey={settings.showNextKey}
            rgbStyle={settings.rgbStyle}
            interactive
            onReady={scene => {
              sceneRef.current = scene;
            }}
          />
          <span className="hero__badge hero__badge--a">
            <i
              style={{
                width: 8,
                height: 8,
                borderRadius: 3,
                background: 'var(--primary)',
                display: 'inline-block'
              }}
            />
            {settings.keyboardModel === 'tuf-a15' ? '天选 A15 布局' : '当前键盘'}
          </span>
          <span className="hero__badge hero__badge--b">拖动旋转 · 点击按键有反馈</span>
        </div>
      </section>

      {/* ---------------- the loop ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">The loop</span>
            <h2 className="section-title">打 → 记 → 复习</h2>
          </div>
          <Link to="/practice" className="btn btn-sm">
            配置一次练习
          </Link>
        </div>

        <div className="loop-grid">
          {LOOP.map((step, index) => (
            <SpotlightCard className="loop-card" key={step.mode}>
              <span className="loop-card__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="loop-card__icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d={step.icon} />
                </svg>
              </span>
              <h3 className="loop-card__title">{step.title}</h3>
              <p className="loop-card__body">{step.body}</p>
              <span className="loop-card__meta">{MODE_LABEL[step.mode]}</span>
            </SpotlightCard>
          ))}
        </div>
      </Reveal>

      {/* ---------------- word lists ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">Word lists</span>
            <h2 className="section-title">三套英语词表，一套日语词表</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              词条来自公开词表，逐条带音标、词性、中英释义、例句、常用搭配、同根词与真题例句。
            </p>
          </div>
          <Link to="/practice" className="btn btn-sm">
            选择词库
          </Link>
        </div>

        <div className="category-stage">
          <OrbitCards
            items={orbitItems}
            radiusX={520}
            radiusY={104}
            rotation={-6}
            duration={48}
            itemWidth={168}
            itemHeight={104}
            depth={0.58}
            hoverScale={1.1}
            draggable
            clickToFront
            centerContent={
              <div className="category-stage__center">
                <span className="eyebrow">Corpus</span>
                <strong>
                  <CountUp to={totalWords || 9482} /> 词
                </strong>
                <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                  点击卡片进入词库
                </span>
              </div>
            }
          />
        </div>

        <div className="feature-grid">
          {books.map(book => (
            <TiltCard key={book.id} className="panel panel-pad feature-card">
              <div className="row-between">
                <span className="chip" style={{ color: book.accent, borderColor: book.accent }}>
                  {book.short}
                </span>
                <span className="mono faint" style={{ fontSize: 'var(--text-xs)' }}>
                  {book.count} 词
                </span>
              </div>
              <h3 className="feature__title" style={{ marginTop: 'var(--s3)' }}>
                {book.name}
              </h3>
              <p className="feature__body">{book.desc}</p>
              <div className="row wrap" style={{ gap: 6, marginTop: 'var(--s3)' }}>
                <span className="chip">{book.coverage.sentence} 例句</span>
                <span className="chip">{book.coverage.related} 同根词</span>
                {book.coverage.exam > 0 && <span className="chip chip-amber">{book.coverage.exam} 真题</span>}
              </div>
            </TiltCard>
          ))}
        </div>
      </Reveal>

      {/* ---------------- features ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">What's inside</span>
            <h2 className="section-title">为"真的想学会"而做</h2>
          </div>
        </div>
        <div className="feature-grid">
          {FEATURES.map(feature => (
            <SpotlightCard className="feature" key={feature.title}>
              <span className="feature__icon">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d={feature.icon} />
                </svg>
              </span>
              <h3 className="feature__title">{feature.title}</h3>
              <p className="feature__body">{feature.body}</p>
            </SpotlightCard>
          ))}
        </div>
      </Reveal>

      {/* ---------------- modes ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">Modes</span>
            <h2 className="section-title">七种模式，各管一件事</h2>
          </div>
        </div>
        <div className="mode-grid">
          {(Object.keys(MODE_LABEL) as PracticeMode[]).map(mode => (
            <div className="mode-card" key={mode}>
              <span className="mode-card__head">
                <span className="mode-card__name">{MODE_LABEL[mode]}</span>
              </span>
              <span className="mode-card__desc">{MODE_DESC[mode]}</span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ---------------- progress ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">Your progress</span>
            <h2 className="section-title">
              {history.length ? '你的数据' : '还没有数据 —— 从一次 20 词开始'}
            </h2>
          </div>
          <Link to="/stats" className="btn btn-sm">
            完整数据
          </Link>
        </div>

        <div className="stat-grid">
          {[
            { label: '最高 WPM', value: summary.best, decimals: 1 },
            { label: '近 20 次平均准确率', value: summary.avgAccuracy, decimals: 1, suffix: '%' },
            { label: '累计练习时长', value: summary.totalSeconds / 60, decimals: 0, suffix: ' 分' },
            { label: '记忆卡片', value: summary.cards, decimals: 0 },
            { label: '待复习', value: summary.due, decimals: 0 },
            { label: '连续天数', value: streak.current, decimals: 0 }
          ].map(entry => (
            <div className="stat-tile" key={entry.label}>
              <div className="stat">
                <span className="stat-value">
                  <CountUp to={entry.value} decimals={entry.decimals} suffix={entry.suffix ?? ''} />
                </span>
                <span className="stat-label">{entry.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="panel panel-pad-lg home-cta">
          <div className="stack-3">
            <h3 style={{ fontSize: 'var(--text-xl)' }}>准备好了就开始</h3>
            <p className="muted" style={{ fontSize: 'var(--text-sm)', maxWidth: '52ch' }}>
              不需要注册。所有进度都存在浏览器本地，随时可以继续。
              键盘可以随时换，布局和手感会跟着变。
            </p>
          </div>
          <div className="row wrap" style={{ gap: 'var(--s3)' }}>
            <Link to="/practice" className="btn btn-primary btn-lg">
              进入练习
            </Link>
            <button
              type="button"
              className="btn btn-lg"
              onClick={() => setSetting('keyboardModel', MODELS[(MODELS.findIndex(m => m.id === settings.keyboardModel) + 1) % MODELS.length].id)}
            >
              换一把键盘
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default Home;
