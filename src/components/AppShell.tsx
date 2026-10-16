/**
 * AppShell — the single-screen application frame.
 *
 * The whole product lives in one viewport: a fixed glass header, a stage that
 * fills the remaining height, and ambient layers (colour field, cursor grid,
 * glyph field, crosshair) shared by every view. Views are switched in place —
 * a session you leave stays mounted exactly where it was.
 */
import { useEffect, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { setVolume, unlockAudio } from '../lib/audio';
import { levelProgress } from '../lib/typing/metrics';
import { useApp } from '../lib/store';
import Backdrop from './Backdrop';
import Crosshair from './Crosshair';
import CursorGrid from './CursorGrid';
import LetterGlitch from './LetterGlitch';
import PillNav from './PillNav';
import { Counter } from './motion';
import LineSidebar from './LineSidebar';
import './AppShell.css';

const NAV = [
  { label: '总览', to: '/' },
  { label: '练习', to: '/practice' },
  { label: '记忆复习', to: '/study' },
  { label: '词库浏览', to: '/wordbook' },
  { label: '键盘实验室', to: '/keyboard' },
  { label: '日语训练', to: '/japanese' },
  { label: '学习数据', to: '/stats' },
  { label: '偏好设置', to: '/settings' }
];

/** A restrained glyph field: faint, slow, centre kept clear for content. */
const LetterGlitchLite = () => (
  <div className="app__glitch" aria-hidden="true">
    <LetterGlitch
      baseOpacity={0.09}
      glitchAmount={0.3}
      speed={0.9}
      density={0.75}
      fontSize={13}
      flow={0.45}
      edgeFade={0.26}
      centerFade={0.58}
      interactive
      cursorRadius={160}
    />
  </div>
);

export const AppShell = () => {
  const location = useLocation();
  const theme = useApp(state => state.settings.theme);
  const soundEnabled = useApp(state => state.settings.soundEnabled);
  const volume = useApp(state => state.settings.volume);
  const setSetting = useApp(state => state.setSetting);
  const xp = useApp(state => state.xp);
  const streak = useApp(state => state.streak);

  const progress = useMemo(() => levelProgress(xp), [xp]);

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

  const activeIndex = useMemo(() => Math.max(0, NAV.findIndex(item => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to)))), [location.pathname]);

  const navigate = (index: number) => {
    window.location.hash = `#${NAV[index].to}`;
  };

  return (
    <div className="app" data-route={location.pathname}>
      <Backdrop />

      {/* ambient layers: above the colour field, below every glass panel */}
      <div className="app__ambient" aria-hidden="true">
        <CursorGrid
          cellSize={64}
          radius={170}
          gridStyle="lines"
          gridOpacity={0.05}
          fillOpacity={0.05}
          maxOpacity={0.5}
          spotlight={0.4}
          ambient={0.12}
          holdTime={260}
          fadeDuration={1100}
        />
        <LetterGlitchLite />
      </div>

      <header className="app__header">
        <div className="shell app__header-inner">
          <a href="#/" className="brand" aria-label="TypeLex 首页">
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
          </a>

          <div className="app__crumb">
            <PillNav
              logo={
                <svg viewBox="0 0 32 32" width="18" height="18" fill="none" aria-hidden="true">
                  <rect x="2.5" y="9" width="27" height="14" rx="4" stroke="currentColor" strokeWidth="2.4" />
                  <rect x="7" y="13" width="4" height="4" rx="1.2" fill="currentColor" />
                  <rect x="13.5" y="13" width="4" height="4" rx="1.2" fill="currentColor" opacity="0.55" />
                  <rect x="20" y="13" width="4" height="4" rx="1.2" fill="currentColor" opacity="0.3" />
                  <rect x="11" y="19" width="10" height="2.4" rx="1.2" fill="currentColor" opacity="0.7" />
                </svg>
              }
              logoAlt="TypeLex 首页"
              logoHref="#/"
              items={NAV.map(item => ({ label: item.label, href: `#${item.to}` }))}
              activeHref={`#${location.pathname}`}
              hoverEffect="fill"
              surface="glass"
              size="sm"
              ariaLabel="顶部导航"
            />
          </div>

          <div className="app__actions">
            <div className="xp-chip" title={`等级 ${progress.level} · ${Math.round(progress.current)} / ${progress.need} XP`}>
              <span className="xp-chip__level">
                LV <Counter value={progress.level} />
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

            <a href="#/settings" className="btn btn-icon" aria-label="设置">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9.5 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21.4 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.2 1z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <div className="app__body">
        <aside className="app__sidebar" aria-label="主导航">
          <LineSidebar items={NAV.map(item => item.label)} activeIndex={activeIndex} onItemClick={navigate} />
          <div className="app__sidebar-foot">
            <span className="app__sidebar-meta">已累计 {Math.round(Object.values(useApp.getState().daily).reduce((sum, entry) => sum + entry.seconds, 0) / 60)} 分钟</span>
          </div>
        </aside>
        <main className="app__stage">
          <div className="app__view" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>

      <Crosshair blendMode="normal" opacity={0.55} smoothing={0.42} gap={12} />
    </div>
  );
};

export default AppShell;
