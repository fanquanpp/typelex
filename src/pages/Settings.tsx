/**
 * Settings.
 *
 * Everything that changes how practice feels: the theme, the board, the sound,
 * the feedback, and the rōmaji system. Audio settings are applied immediately so
 * the volume slider is audible while you drag it.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Reveal } from '../components/effects';
import GlideSelect from '../components/GlideSelect';
import RubberSegment from '../components/RubberSegment';
import WakeSlider from '../components/WakeSlider';
import { playKey, playSuccess, setVolume } from '../lib/audio';
import { useApp } from '../lib/store';
import { getLayout } from '../three/keyboard/layouts';
import { MODELS } from '../three/keyboard/models';
import type { RgbStyle } from '../three/keyboard/models';

const SOUNDS = [
  { id: 'laptop', label: '笔记本剪刀脚', hint: '短促、安静' },
  { id: 'linear', label: '红轴（线性）', hint: '低沉、顺滑' },
  { id: 'tactile', label: '茶轴（段落）', hint: '轻微段落感' },
  { id: 'clicky', label: '青轴（咔哒）', hint: '清脆响亮' },
  { id: 'off', label: '关闭按键音', hint: '完全静音' }
] as const;

const RGB: { id: RgbStyle; label: string }[] = [
  { id: 'solid', label: '关闭' },
  { id: 'reactive', label: '按键响应' },
  { id: 'heatmap', label: '弱键标记' }
];

const Settings = () => {
  const settings = useApp(state => state.settings);
  const setSetting = useApp(state => state.setSetting);
  const resetProgress = useApp(state => state.resetProgress);
  const history = useApp(state => state.history);
  const srs = useApp(state => state.srs);
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    try {
      let total = 0;
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key) continue;
        total += (localStorage.getItem(key) ?? '').length + key.length;
      }
      setStorageUsed(total);
    } catch {
      setStorageUsed(0);
    }
  }, [history.length, srs]);

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Settings</span>
        <h1 className="page-title">设置</h1>
        <p className="page-sub">
          全部设置都存在本地浏览器里，不需要账号。改了立刻生效，刷新后依然保持。
        </p>
      </header>

      <Reveal as="section" id="sec-appearance" className="stack-6">
        <h2 className="section-title">外观</h2>
        <div className="panel panel-pad-lg">
          <div className="setting-row">
            <div className="setting-row__label">
              <strong>主题</strong>
              <span>深色适合长时间练习，浅色适合白天</span>
            </div>
            <div className="setting-row__control">
              <RubberSegment
                size="sm"
                aria-label="主题"
                items={[
                  { value: 'dark', label: '深色' },
                  { value: 'light', label: '浅色' }
                ]}
                value={settings.theme}
                onChange={value => setSetting('theme', value as 'dark' | 'light')}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>练习页显示 3D 键盘</strong>
              <span>关闭后页面更轻，适合低性能设备</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="switch"
                data-on={settings.keyboardVisible}
                aria-pressed={settings.keyboardVisible}
                aria-label="显示 3D 键盘"
                onClick={() => setSetting('keyboardVisible', !settings.keyboardVisible)}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>指法着色</strong>
              <span>把键帽按负责的手指上色，初学阶段很有用</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="switch"
                data-on={settings.fingerHints}
                aria-pressed={settings.fingerHints}
                aria-label="指法着色"
                onClick={() => setSetting('fingerHints', !settings.fingerHints)}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>高亮下一个键</strong>
              <span>键盘上以脉冲光提示下一个要按的键</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="switch"
                data-on={settings.showNextKey}
                aria-pressed={settings.showNextKey}
                aria-label="高亮下一个键"
                onClick={() => setSetting('showNextKey', !settings.showNextKey)}
              />
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" id="sec-kb" className="stack-6">
        <h2 className="section-title">键盘</h2>
        <div className="panel panel-pad-lg">
          <div className="setting-row">
            <div className="setting-row__label">
              <strong>键盘型号</strong>
              <span>{MODELS.find(model => model.id === settings.keyboardModel)?.desc}</span>
            </div>
            <div className="setting-row__control setting-row__control--wide">
              <GlideSelect
                size="md"
                showTags
                menuWidth={260}
                className="settings-select"
                ariaLabel="键盘型号"
                options={MODELS.map(model => ({
                  value: model.id,
                  label: model.name,
                  tag: `${getLayout(model.layoutId).keys.length} 键`
                }))}
                value={settings.keyboardModel}
                onChange={value => setSetting('keyboardModel', value)}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>背光效果</strong>
              <span>不同键盘支持的灯光不同，没有背光的键盘此项无效</span>
            </div>
            <div className="setting-row__control setting-row__control--wide">
              <RubberSegment
                size="sm"
                aria-label="背光效果"
                items={RGB.map(entry => ({ value: entry.id, label: entry.label }))}
                value={settings.rgbStyle}
                onChange={value => setSetting('rgbStyle', value as typeof settings.rgbStyle)}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>默认视角</strong>
              <span>键盘实验室里保存的视角</span>
            </div>
            <div className="setting-row__control">
              <RubberSegment
                size="sm"
                aria-label="默认视角"
                items={[
                  { value: 'angled', label: '斜视' },
                  { value: 'top', label: '俯视' },
                  { value: 'front', label: '正视' },
                  { value: 'close', label: '近景' }
                ]}
                value={settings.keyboardView}
                onChange={value => setSetting('keyboardView', value as typeof settings.keyboardView)}
              />
            </div>
          </div>

          <div className="setting-row" style={{ borderBottom: 0 }}>
            <div className="setting-row__label">
              <strong>去实验室挑一把</strong>
              <span>预览全部 {MODELS.length} 种键盘手感与键位布局</span>
            </div>
            <div className="setting-row__control">
              <Link to="/keyboard" className="btn btn-sm">
                打开键盘实验室
              </Link>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" id="sec-sound" className="stack-6">
        <h2 className="section-title">声音</h2>
        <div className="panel panel-pad-lg">
          <div className="setting-row">
            <div className="setting-row__label">
              <strong>按键音</strong>
              <span>用 Web Audio 实时合成，不加载任何音频文件</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="switch"
                data-on={settings.soundEnabled}
                aria-pressed={settings.soundEnabled}
                aria-label="按键音"
                onClick={() => setSetting('soundEnabled', !settings.soundEnabled)}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>轴体音色</strong>
              <span>点击试听</span>
            </div>
            <div className="setting-row__control setting-row__control--wide">
              <RubberSegment
                size="sm"
                aria-label="轴体音色"
                items={SOUNDS.map(entry => ({ value: entry.id, label: entry.label }))}
                value={settings.soundProfile}
                onChange={value => {
                  const entry = SOUNDS.find(item => item.id === value)!;
                  setSetting('soundProfile', entry.id);
                  if (entry.id !== 'off') {
                    playKey(entry.id, true);
                    window.setTimeout(() => playSuccess(true), 130);
                  }
                }}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>音量</strong>
              <span>{Math.round(settings.volume * 100)}%</span>
            </div>
            <div className="setting-row__control setting-row__control--wide">
              <WakeSlider
                min={0}
                max={100}
                step={5}
                value={Math.round(settings.volume * 100)}
                bars={40}
                height={44}
                restHeight={10}
                gap={3}
                fillColor="var(--ink)"
                trackColor="var(--border)"
                crestColor="var(--primary)"
                showValue
                formatValue={value => `${value}%`}
                onChange={value => {
                  const volume = value / 100;
                  setSetting('volume', volume);
                  setVolume(volume);
                }}
                ariaLabel="音量"
              />
            </div>
          </div>

          <div className="setting-row" style={{ borderBottom: 0 }}>
            <div className="setting-row__label">
              <strong>测试</strong>
              <span>播放一次按键音与完成提示音</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  playKey(settings.soundProfile, settings.soundEnabled);
                  window.setTimeout(() => playSuccess(settings.soundEnabled), 160);
                }}
              >
                试听
              </button>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" id="sec-typing" className="stack-6">
        <h2 className="section-title">练习</h2>
        <div className="panel panel-pad-lg">
          <div className="setting-row">
            <div className="setting-row__label">
              <strong>默认严格模式</strong>
              <span>打错直接忽略，必须一次打对。可以在练习页临时切换</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="switch"
                data-on={useApp.getState().config.strict}
                aria-pressed={useApp.getState().config.strict}
                aria-label="默认严格模式"
                onClick={() => useApp.getState().setConfig({ strict: !useApp.getState().config.strict })}
              />
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>日语罗马音体系</strong>
              <span>平文式是主流教材用法；训令式更贴近五十音表的拼写</span>
            </div>
            <div className="setting-row__control">
              <RubberSegment
                size="sm"
                aria-label="日语罗马音体系"
                items={[
                  { value: 'hepburn', label: 'Hepburn' },
                  { value: 'kunrei', label: 'Kunrei' }
                ]}
                value={settings.romajiStyle}
                onChange={value => setSetting('romajiStyle', value as typeof settings.romajiStyle)}
              />
            </div>
          </div>

          <div className="setting-row" style={{ borderBottom: 0 }}>
            <div className="setting-row__label">
              <strong>单词卡动画</strong>
              <span>翻卡时使用的过渡效果</span>
            </div>
            <div className="setting-row__control">
              <RubberSegment
                size="sm"
                aria-label="单词卡动画"
                items={[
                  { value: 'pixel', label: '像素' },
                  { value: 'flip', label: '翻转' },
                  { value: 'fade', label: '淡入' }
                ]}
                value={settings.cardAnimation}
                onChange={value => setSetting('cardAnimation', value as typeof settings.cardAnimation)}
              />
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" id="sec-data" className="stack-6">
        <h2 className="section-title">数据</h2>
        <div className="panel panel-pad-lg">
          <div className="setting-row">
            <div className="setting-row__label">
              <strong>本地存储占用</strong>
              <span>练习历史、按键统计与记忆卡片都存在 localStorage 中</span>
            </div>
            <div className="setting-row__control">
              <span className="mono">{(storageUsed / 1024).toFixed(1)} KB</span>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row__label">
              <strong>导出进度</strong>
              <span>把全部本地数据复制成 JSON，便于备份或迁移</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const payload = JSON.stringify(
                    {
                      exportedAt: new Date().toISOString(),
                      version: 1,
                      data: useApp.getState()
                    },
                    null,
                    2
                  );
                  const blob = new Blob([payload], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `typelex-progress-${Date.now()}.json`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              >
                导出 JSON
              </button>
            </div>
          </div>

          <div className="setting-row" style={{ borderBottom: 0 }}>
            <div className="setting-row__label">
              <strong>清空进度</strong>
              <span>删除历史、统计、记忆卡片与收藏。设置会保留</span>
            </div>
            <div className="setting-row__control">
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => {
                  if (window.confirm('确定要清空所有练习进度吗？这个操作无法撤销。')) resetProgress();
                }}
              >
                清空进度
              </button>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" id="sec-about">
        <div className="panel panel-pad stack-4">
          <h2 className="section-title">关于</h2>
          <p className="muted" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7 }}>
            TypeLex 是一个纯前端的打字练习与词汇记忆项目：模拟键盘用 CSS/DOM 构建，词库（英语 9,482 词 + 日语 JLPT 7,032 词，全部带中文释义）来自公开数据集，并在构建期整理成可增量加载的静态文件；没有后端、没有账号，所有进度都保存在你自己的浏览器里。
          </p>
          <p className="faint" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.7 }}>
            数据来源与授权说明见仓库中的 ATTRIBUTION.md —— 代码以 MIT 授权，词表另有权属；已知的数据边角（双语读音词条、假名词条、罗马音判定规则等）见 ERRATA.md。
          </p>
          <div className="row wrap" style={{ gap: 'var(--s3)' }}>
            <Link to="/practice" className="btn btn-primary">
              去练习
            </Link>
            <Link to="/wordbook" className="btn">
              浏览词库
            </Link>
            <Link to="/keyboard" className="btn btn-ghost">
              键盘实验室
            </Link>
            <a
              className="btn btn-ghost"
              href="https://github.com/fanquanpp/typelex"
              target="_blank"
              rel="noreferrer"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
              </svg>
              源仓库
            </a>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default Settings;
