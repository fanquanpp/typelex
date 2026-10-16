/**
 * Keyboard lab — pick a board, look at it, understand it.
 *
 * Every model maps onto a real layout, so this page doubles as a reference:
 * the key count, the cluster arrangement and the finger assignment for the
 * selected board are all shown next to it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import KeyboardStage from '../components/KeyboardStage';
import { Reveal, SpotlightCard } from '../components/effects';
import { TypingLine } from '../components/TypingLine';
import { useApp } from '../lib/store';
import { FINGER_COLOR, FINGER_LABEL, FINGERS } from '../lib/typing/fingers';
import type { CssKeyboardScene } from '../three/keyboard/CssKeyboardScene';
import type { ViewPreset } from '../three/keyboard/view';
import { getLayout } from '../three/keyboard/layouts';
import { MODELS } from '../three/keyboard/models';
import RubberSegment from '../components/RubberSegment';
import type { RgbStyle } from '../three/keyboard/models';
import './KeyboardLab.css';

const RGB_STYLES: { id: RgbStyle; label: string }[] = [
  { id: 'solid', label: '关闭' },
  { id: 'reactive', label: '按键响应' },
  { id: 'heatmap', label: '弱键标记' }
];

const VIEWS: { id: ViewPreset; label: string }[] = [
  { id: 'angled', label: '斜视' },
  { id: 'top', label: '俯视' },
  { id: 'front', label: '正视' },
  { id: 'close', label: '近景' }
];

const TEST_WORDS = ['keyboard', 'rhythm', 'lexicon', 'practice', 'vocabulary', 'muscle memory'];

const KeyboardLab = () => {
  const settings = useApp(state => state.settings);
  const setSetting = useApp(state => state.setSetting);
  const keyStats = useApp(state => state.keyStats);

  const sceneRef = useRef<CssKeyboardScene | null>(null);
  const [view, setView] = useState<ViewPreset>(settings.keyboardView);
  const [testIndex, setTestIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [typed, setTyped] = useState('');

  const model = useMemo(
    () => MODELS.find(entry => entry.id === settings.keyboardModel) ?? MODELS[0],
    [settings.keyboardModel]
  );
  const layout = useMemo(() => getLayout(model.layoutId), [model.layoutId]);

  useEffect(() => {
    sceneRef.current?.setView(view);
    setSetting('keyboardView', view);
  }, [view, setSetting]);

  /* feed the heatmap style with real per-key accuracy */
  useEffect(() => {
    const heat: Record<string, number> = {};
    for (const [char, stat] of Object.entries(keyStats)) {
      const total = stat.hits + stat.misses;
      if (!total) continue;
      heat[char] = Math.min(1, stat.misses / total + Math.min(0.5, stat.time / 1200));
    }
    sceneRef.current?.setHeatmap(heat);
  }, [keyStats, settings.rgbStyle, ready]);

  /* a self-running typing demo on the board */
  useEffect(() => {
    const word = TEST_WORDS[testIndex % TEST_WORDS.length];
    setTyped('');
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTyped(word.slice(0, index));
      if (index >= word.length) {
        window.clearInterval(timer);
        window.setTimeout(() => setTestIndex(value => value + 1), 1400);
      }
    }, 190);
    return () => window.clearInterval(timer);
  }, [testIndex]);

  const testWord = TEST_WORDS[testIndex % TEST_WORDS.length];

  const stats = useMemo(() => {
    const entries = Object.entries(keyStats).filter(([, stat]) => stat.hits > 0);
    const slowest = [...entries].sort((a, b) => b[1].time - a[1].time).slice(0, 8);
    const worst = [...entries]
      .map(([char, stat]) => [char, stat.hits ? stat.misses / stat.hits : 0] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    return { slowest, worst, tracked: entries.length };
  }, [keyStats]);

  const byBrand = useMemo(() => {
    const groups = new Map<string, typeof MODELS>();
    for (const entry of MODELS) {
      if (!groups.has(entry.brand)) groups.set(entry.brand, []);
      groups.get(entry.brand)!.push(entry);
    }
    return [...groups.entries()];
  }, []);

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Keyboard lab</span>
        <h1 className="page-title">键盘实验室</h1>
        <p className="page-sub">
          三种键盘手感，从办公薄型剪刀脚到 60% 客制化机械键盘。换一把键盘，键位布局与键帽高度
          会跟着变；练习页用的是同一套模型。
        </p>
      </header>

      <Reveal as="section" id="sec-lab-stage" className="stack-5">
        <div className="keyboard-frame lab-stage">
          <KeyboardStage
            modelId={settings.keyboardModel}
            theme={settings.theme}
            fingerHints={settings.fingerHints}
            showNextKey={settings.showNextKey}
            rgbStyle={settings.rgbStyle}
            interactive
            onReady={scene => {
              sceneRef.current = scene;
              setReady(Boolean(scene));
            }}
          />

          <div className="keyboard-overlay keyboard-overlay--tl">
            <span className="keyboard-chip">
              <strong>{model.name}</strong>
              <span className="faint">{model.brand}</span>
            </span>
          </div>

          <div className="keyboard-overlay keyboard-overlay--tr">
            <RubberSegment
              size="sm"
              trackColor="var(--glass)"
              aria-label="键盘视角"
              items={VIEWS.map(entry => ({ value: entry.id, label: entry.label }))}
              value={view}
              onChange={value => setView(value as typeof view)}
            />
          </div>

          <div className="keyboard-overlay keyboard-overlay--bl">
            <span className="keyboard-chip">
              {layout.keys.length} 键 · {layout.width}u × {layout.depth}u
            </span>
            <span className="keyboard-chip">
              {model.profile === 'chiclet'
                ? '巧克力键帽'
                : model.profile === 'lowprofile'
                  ? '低键程键帽'
                  : model.profile === 'cherry'
                    ? 'Cherry 高度'
                    : 'OEM 高度'}
            </span>
          </div>
        </div>

        <div className="panel panel-pad stack-4">
          <div className="row-between wrap">
            <div className="setting-row__label">
              <strong>试打一行</strong>
              <span>键盘会跟着高亮下一个键，手感与你实际敲击一致</span>
            </div>
            <div className="segmented">
              <button
                type="button"
                data-active={settings.fingerHints}
                onClick={() => setSetting('fingerHints', !settings.fingerHints)}
              >
                指法着色
              </button>
              <button
                type="button"
                data-active={settings.showNextKey}
                onClick={() => setSetting('showNextKey', !settings.showNextKey)}
              >
                高亮下一个键
              </button>
            </div>
          </div>

          <TypingLine text={testWord} typed={typed} />

          <RubberSegment
            size="sm"
            aria-label="背光效果"
            disabled={model.backlight === 'none'}
            items={RGB_STYLES.map(entry => ({ value: entry.id, label: entry.label }))}
            value={settings.rgbStyle}
            onChange={value => setSetting('rgbStyle', value as typeof settings.rgbStyle)}
          />

          {model.backlight === 'none' && (
            <p className="faint" style={{ fontSize: 'var(--text-xs)' }}>
              当前这把键盘没有背光；机械键盘可开启按键响应与弱键标记。
            </p>
          )}
        </div>
      </Reveal>

      {/* ---------------- model picker ---------------- */}
      <Reveal as="section" id="sec-lab-models" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">Models</span>
            <h2 className="section-title">选择键盘</h2>
          </div>
          <span className="chip">{MODELS.length} 种</span>
        </div>

        {byBrand.map(([brand, models]) => (
          <div key={brand} className="stack-3">
            <p className="eyebrow">{brand}</p>
            <div className="model-grid">
              {models.map(entry => (
                <button
                  type="button"
                  key={entry.id}
                  className="model-card"
                  data-active={settings.keyboardModel === entry.id}
                  onClick={() => setSetting('keyboardModel', entry.id)}
                >
                  <span className="model-card__brand">{entry.brand}</span>
                  <span className="model-card__name">{entry.name}</span>
                  <span className="model-card__desc">{entry.desc}</span>
                  <span className="model-card__meta">
                    <span className="chip">{getLayout(entry.layoutId).keys.length} 键</span>
                    <span className="chip">
                      {entry.sound === 'laptop' ? '剪刀脚' : entry.sound === 'linear' ? '线性轴' : '段落轴'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Reveal>

      {/* ---------------- layout reference ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">Reference</span>
            <h2 className="section-title">键位与指法</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              每个手指负责固定的几列。左右食指各管两列，小指兼管 Shift、Enter 与 Tab，拇指只负责空格。
            </p>
          </div>
        </div>

        <div className="lab-grid">
          <div className="panel panel-pad stack-4">
            <p className="eyebrow">手指分区</p>
            <div className="finger-legend">
              {FINGERS.map(finger => (
                <span className="finger-chip" key={finger}>
                  <i style={{ background: FINGER_COLOR[finger] }} />
                  {FINGER_LABEL[finger]}
                </span>
              ))}
            </div>
            <div className="divider" />
            <p className="eyebrow">当前布局的键群</p>
            <div className="lab-clusters">
              {(['main', 'func', 'nav', 'arrow', 'numpad'] as const).map(cluster => {
                const count = layout.keys.filter(key => key.cluster === cluster).length;
                if (!count) return null;
                const label =
                  cluster === 'main'
                    ? '主键区'
                    : cluster === 'func'
                      ? '功能键区'
                      : cluster === 'nav'
                        ? '导航键区'
                        : cluster === 'arrow'
                          ? '方向键'
                          : '数字键盘';
                return (
                  <span className="chip" key={cluster}>
                    {label} · {count}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="panel panel-pad stack-4">
            <p className="eyebrow">你的按键数据</p>
            {stats.tracked === 0 ? (
              <p className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                还没有足够的按键数据。练习几轮后，这里会显示最慢和最常出错的键。
              </p>
            ) : (
              <>
                <div>
                  <p className="faint" style={{ fontSize: 'var(--text-xs)', marginBottom: 6 }}>
                    最慢的键（平均用时 ms）
                  </p>
                  <div className="kbd-row">
                    {stats.slowest.map(([char, stat]) => (
                      <span className="kbd" key={char} title={`${Math.round(stat.time)}ms`}>
                        {char === ' ' ? '␣' : char}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="divider" />
                <div>
                  <p className="faint" style={{ fontSize: 'var(--text-xs)', marginBottom: 6 }}>
                    错误率最高的键
                  </p>
                  <div className="kbd-row">
                    {stats.worst.map(([char, rate]) => (
                      <span className="kbd" key={char} title={`${Math.round(rate * 100)}%`}>
                        {char === ' ' ? '␣' : char}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Reveal>

      {/* ---------------- why it matters ---------------- */}
      <Reveal as="section" className="stack-5">
        <div className="feature-grid">
          {[
            {
              title: '布局影响肌肉记忆',
              body: '60% 没有方向键，98 键把数字区压进主键区，笔记本的半高方向键位置也不同。换布局练习能让你在真实设备上更快适应。'
            },
            {
              title: '键帽高度影响手感',
              body: 'OEM 比 Cherry 高约 2.5mm，下排倾角更大；巧克力键帽几乎平的，行程只有 1.2–1.8mm。这些差别在打字节奏上能听出来。'
            },
            {
              title: '背光不只是好看',
              body: '把背光设为「热力」时，键盘会按你的错误率上色；「触发」模式则让按下的键亮起并扩散，是最贴近真实机械键盘的反馈。'
            }
          ].map(entry => (
            <SpotlightCard className="feature" key={entry.title}>
              <h3 className="feature__title">{entry.title}</h3>
              <p className="feature__body">{entry.body}</p>
            </SpotlightCard>
          ))}
        </div>
      </Reveal>
    </div>
  );
};

export default KeyboardLab;
