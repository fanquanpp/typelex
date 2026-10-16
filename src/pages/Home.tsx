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
import { CountUp, Reveal, SplitText } from '../components/effects';
import { useApp } from '../lib/store';
import type { BookMeta } from '../lib/types';
import { loadBooks } from '../lib/vocab';
import type { CssKeyboardScene } from '../three/keyboard/CssKeyboardScene';
import './Home.css';


const Home = () => {
  const settings = useApp(state => state.settings);

  const [books, setBooks] = useState<BookMeta[]>([]);
  const sceneRef = useRef<CssKeyboardScene | null>(null);

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




  const orbitItems: OrbitItem[] = useMemo(
    () =>
      [
        ...books.map(book => ({
          id: book.id,
          label: book.name,
          tag: book.short,
          accent: book.accent,
          count: book.count,
          sub: `${book.coverage.related} 个同根词`
        })),
        { id: 'jp-all', label: '日语 JLPT', tag: 'N1–N5', accent: '#8a93a8', count: 7032, sub: '罗马音输入' },
        { id: 'jp-n5n4', label: '日语 N5+N4', tag: '入门', accent: '#8a93a8', count: 1267, sub: '中文释义' }
      ].map(book => ({
        id: book.id,
        label: book.label,
        accent: book.accent,
        content: (
          <div className="orbit-card">
            <div className="orbit-card__top">
              <span className="orbit-card__tag">{book.tag}</span>
              <span className="orbit-card__count">{book.count}</span>
            </div>
            <div>
              <div className="orbit-card__name">{book.label}</div>
              <div className="orbit-card__sub">{book.sub}</div>
            </div>
          </div>
        )
      })),
    [books]
  );

  const totalWords = books.reduce((sum, book) => sum + book.count, 0) + 7032;

  return (
    <div className="shell page home">
      {/* ---------------- hero ---------------- */}
      <section id="sec-hero" className="hero">
        <div className="hero__copy">
          <span className="eyebrow hero-eyebrow">键盘打字 · 词汇记忆</span>
          <h1 className="hero__title">
            <SplitText text="把单词打进" effect="rise" />
            <span className="hero__title-accent">肌肉记忆里</span>
          </h1>
          <div className="hero__actions">
            <Link to="/practice" className="btn btn-primary btn-lg">
              开始练习
            </Link>
            <Link to="/wordbook" className="btn btn-lg">
              浏览词库
            </Link>
            <Link to="/keyboard" className="btn btn-lg btn-ghost">
              挑选键盘
            </Link>
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
          <span className="hero__badge hero__badge--a">当前键盘</span>
        </div>
      </section>

      {/* ---------------- deck orbit ---------------- */}
      <Reveal as="section" id="sec-orbit" className="stack-3">
        <div className="category-stage">
          <OrbitCards
            items={orbitItems}
            radiusX={720}
            radiusY={120}
            rotation={-6}
            duration={48}
            itemWidth={250}
            itemHeight={155}
            depth={0.55}
            hoverScale={1.1}
            draggable
            clickToFront
            centerContent={
              <div className="category-stage__center">
                <span className="eyebrow">Corpus</span>
                <strong>
                  <CountUp to={totalWords || 16514} /> 词
                </strong>
              </div>
            }
          />
        </div>
      </Reveal>
    </div>
  );
};

export default Home;
