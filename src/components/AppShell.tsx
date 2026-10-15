/**
 * AppShell — the persistent chrome around every page.
 *
 * Owns the GooeyNav, the theme switch, the XP/level readout and the global
 * ambience (grid backdrop, noise, click sparks). Route changes fade the outlet
 * through a short blur-rise transition and restore the previous scroll position.
 */
import { useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { setVolume, unlockAudio } from '../lib/audio';
import { levelProgress } from '../lib/typing/metrics';
import { useApp } from '../lib/store';
import { CountUp, DotGrid, useClickSpark } from './effects';
import GooeyNav, { type GooeyNavItem } from './GooeyNav';
import './AppShell.css';

const NAV: GooeyNavItem[] = [
  { label: '首页', to: '/' },
  { label: '练习', to: '/practice' },
  { label: '记忆', to: '/study' },
  { label: '词库', to: '/wordbook' },
  { label: '键盘', to: '/keyboard' },
  { label: '日语', to: '/japanese' },
  { label: '数据', to: '/stats' }
];

export const AppShell = () => {
  const location = useLocation();
  const theme = useApp(state => state.settings.theme);
  const soundEnabled = useApp(state => state.settings.soundEnabled);
  const volume = useApp(state => state.settings.volume);
  const setSetting = useApp(state => state.setSetting);
  const xp = useApp(state => state.xp);
  const streak = useApp(state => state.streak);

  const progress = useMemo(() => levelProgress(xp), [xp]);
  useClickSpark(true, 7);

  useEffect(() => {
    setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const onFirstGesture = () => unlockAudio();
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  /* per-route scroll restoration: remember where each page was left */
  useEffect(() => {
    const key = `typelex.scroll:${location.pathname}`;
    const saved = Number(sessionStorage.getItem(key) ?? '0');
    const frame = requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'auto' }));
    return () => {
      cancelAnimationFrame(frame);
      sessionStorage.setItem(key, String(window.scrollY));
    };
  }, [location.pathname]);

  return (
    <div className="app">
      <div className="app__ambience" aria-hidden="true">
        <DotGrid className="app__dots" gap={30} dotSize={1.7} radius={150} />
        <div className="app__glow" />
      </div>

      <header className="app__header">
        <div className="shell app__header-inner">
          <Link to="/" className="brand" aria-label="TypeLex 首页">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
                <rect x="2.5" y="9" width="27" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
                <rect x="7" y="13" width="4" height="4" rx="1.2" fill="currentColor" />
                <rect x="13.5" y="13" width="4" height="4" rx="1.2" fill="currentColor" opacity="0.55" />
                <rect x="20" y="13" width="4" height="4" rx="1.2" fill="currentColor" opacity="0.3" />
                <rect x="11" y="19" width="10" height="2.4" rx="1.2" fill="currentColor" opacity="0.7" />
              </svg>
            </span>
            <span className="brand__text">
              <strong>TypeLex</strong>
              <em>打字 · 词汇</em>
            </span>
          </Link>

          <div className="app__nav">
            <GooeyNav items={NAV} theme={theme} size="sm" particleCount={12} spread={48} gooeyness={0.52} />
          </div>

          <div className="app__actions">
            <div className="xp-chip" title={`等级 ${progress.level} · ${Math.round(progress.current)} / ${progress.need} XP`}>
              <span className="xp-chip__level">
                LV <CountUp to={progress.level} duration={600} />
              </span>
              <span className="xp-chip__bar" aria-hidden="true">
                <i style={{ width: `${progress.ratio * 100}%` }} />
              </span>
            </div>

            <div className="streak-chip" title={`连续练习 ${streak.current} 天`}>
              <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                <path
                  d="M12 2c1.6 3.2 4.6 4.7 4.6 8.3 0 1.5-.7 2.7-1.7 3.4.2-1.6-.4-3-1.6-4.2.1 2.6-1.2 3.6-2.4 4.6-1 .8-1.6 1.7-1.6 3 0 1.9 1.6 3.4 3.6 3.4 2.8 0 5.1-2.3 5.1-5.2 0-4.6-3.4-6.9-6-13.3z"
                  fill="currentColor"
                />
              </svg>
              <span className="tnum">{streak.current}</span>
            </div>

            <button
              type="button"
              className="btn btn-icon"
              aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
              onClick={() => setSetting('theme', theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className="btn btn-icon"
              aria-label={soundEnabled ? '关闭按键音' : '开启按键音'}
              onClick={() => setSetting('soundEnabled', !soundEnabled)}
            >
              {soundEnabled ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 9.5h3l4-3v11l-4-3H4z" />
                  <path d="M15 9a4 4 0 0 1 0 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 9.5h3l4-3v11l-4-3H4z" />
                  <path d="M15.5 9.5l4 5M19.5 9.5l-4 5" />
                </svg>
              )}
            </button>

            <Link to="/settings" className="btn btn-icon" aria-label="设置">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9.5 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21.4 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.2 1z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <main className="app__main" key={location.pathname}>
        <div className="page-enter">
          <Outlet />
        </div>
      </main>

      <footer className="app__footer">
        <div className="shell app__footer-inner">
          <div className="stack-1">
            <strong>TypeLex</strong>
            <span className="faint">用拟真键盘把词汇刻进肌肉记忆</span>
          </div>
          <div className="app__footer-links">
            <Link to="/practice">开始练习</Link>
            <Link to="/wordbook">浏览词库</Link>
            <Link to="/keyboard">键盘实验室</Link>
            <Link to="/settings">设置</Link>
          </div>
          <p className="faint app__footer-note">
            词库数据来自百词斩公开词表与 JLPT 开源词表，例句与真题例句随词条提供。仅供学习使用。
          </p>
        </div>
      </footer>

      <div className="noise-overlay" aria-hidden="true" />
    </div>
  );
};

export default AppShell;
