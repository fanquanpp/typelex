/**
 * Japanese — the rōmaji track.
 *
 * N5/N4 carry hand-written Chinese glosses; N3–N1 fall back to the source
 * dataset's English gloss, which is stated plainly on the page rather than
 * hidden. The kana chart is generated from the same converter the typing engine
 * grades against, so what you see is exactly what you have to type.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Reveal, SpotlightCard } from '../components/effects';
import { useApp } from '../lib/store';
import { kanaToRomaji } from '../lib/romaji';
import type { JapaneseWord } from '../lib/types';
import { loadJapanese } from '../lib/vocab';
import './Japanese.css';

const LEVELS = [
  { level: 5, name: 'N5', desc: '入门', note: '最基本的日常词，约 660 词' },
  { level: 4, name: 'N4', desc: '基础', note: '日常会话常用，约 600 词' },
  { level: 3, name: 'N3', desc: '中级', note: '报纸与简单文章' },
  { level: 2, name: 'N2', desc: '进阶', note: '一般性文章与新闻' },
  { level: 1, name: 'N1', desc: '高级', note: '抽象与专业内容' }
];

const SEION = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', '', 'ゆ', '', 'よ'],
  ['ら', 'り', 'る', 'れ', 'ろ'],
  ['わ', '', '', '', 'を'],
  ['ん', '', '', '', '']
];

const DAKUON = [
  ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
  ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
  ['だ', 'ぢ', 'づ', 'で', 'ど'],
  ['ば', 'び', 'ぶ', 'べ', 'ぼ'],
  ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ']
];

const YOON = ['きゃ', 'きゅ', 'きょ', 'しゃ', 'しゅ', 'しょ', 'ちゃ', 'ちゅ', 'ちょ', 'にゃ', 'にゅ', 'にょ', 'りゃ', 'りゅ', 'りょ', 'じゃ', 'じゅ', 'じょ'];

const Japanese = () => {
  const config = useApp(state => state.config);
  const setConfig = useApp(state => state.setConfig);
  const romajiStyle = useApp(state => state.settings.romajiStyle);

  const [words, setWords] = useState<JapaneseWord[]>([]);
  const [level, setLevel] = useState(5);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    loadJapanese()
      .then(setWords)
      .catch(() => undefined);
  }, []);

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const word of words) map.set(word.jlpt, (map.get(word.jlpt) ?? 0) + 1);
    return map;
  }, [words]);

  const filtered = useMemo(() => {
    const needle = query.trim();
    let list = words.filter(word => word.jlpt === level);
    if (needle) {
      list = list.filter(
        word =>
          word.kana.includes(needle) ||
          word.kanji.includes(needle) ||
          word.romaji.includes(needle.toLowerCase()) ||
          word.cn.includes(needle) ||
          word.en.toLowerCase().includes(needle.toLowerCase())
      );
    }
    return list;
  }, [words, level, query]);

  const visible = filtered.slice(0, limit);
  const chineseCoverage = useMemo(() => {
    const levelWords = words.filter(word => word.jlpt === level);
    if (!levelWords.length) return 0;
    return (levelWords.filter(word => word.cn).length / levelWords.length) * 100;
  }, [words, level]);

  const startPractice = (levels: number[]) => {
    setConfig({ mode: 'japanese', jlpt: levels, length: 'count', amount: 20 });
  };

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Japanese</span>
        <h1 className="page-title">日语 · 罗马音输入</h1>
        <p className="page-sub">
          用罗马音打出日语单词：屏幕显示假名、汉字与释义，你输入 <code className="mono">taberu</code> 这样的读音。
          支持促音（がっこう → gakkou）、拨音（しんぶん → shinbun）与拗音（きょう → kyou）。
        </p>
      </header>

      <Reveal as="section" className="stack-5">
        <div className="jp-hero panel panel-pad-lg">
          <div className="stack-3">
            <h2 className="section-title">开始日语练习</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)', maxWidth: '56ch' }}>
              共 {words.length.toLocaleString()} 个词条。N5 与 N4 提供中文释义（当前级别覆盖
              {' '}{chineseCoverage.toFixed(0)}%），N3–N1 使用英文释义。
            </p>
          </div>
          <div className="row wrap" style={{ gap: 'var(--s3)' }}>
            <Link to="/practice/session" className="btn btn-primary btn-lg" onClick={() => startPractice([5, 4])}>
              练 N5 + N4
            </Link>
          </div>
        </div>

        <div className="stat-grid">
          {LEVELS.map(entry => (
            <SpotlightCard
              key={entry.level}
              className="stat-tile jp-level"
              style={{ cursor: 'pointer' }}
            >
              <button
                type="button"
                onClick={() => {
                  setLevel(entry.level);
                  setLimit(100);
                }}
                style={{ all: 'unset', display: 'block', cursor: 'pointer', width: '100%' }}
                data-active={level === entry.level}
              >
                <div className="row-between">
                  <span className="stat-value">{entry.name}</span>
                  <span className="chip chip-rose">{counts.get(entry.level) ?? 0} 词</span>
                </div>
                <span className="stat-label">{entry.desc}</span>
                <p className="faint" style={{ fontSize: 'var(--text-xs)', marginTop: 6 }}>
                  {entry.note}
                </p>
              </button>
            </SpotlightCard>
          ))}
        </div>
      </Reveal>

      {/* ---------------- kana chart ---------------- */}
      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <span className="eyebrow">Reference</span>
            <h2 className="section-title">五十音与罗马音对照</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              当前使用 {romajiStyle === 'hepburn' ? '平文式（Hepburn）' : '训令式（Kunrei）'}。
              打字时两种写法都算对，例如 <code className="mono">shi</code> 与 <code className="mono">si</code> 都可以。
            </p>
          </div>
        </div>

        <div className="jp-charts">
          <div className="panel panel-pad stack-3">
            <p className="eyebrow">清音</p>
            <div className="kana-grid">
              {SEION.flat().map((kana, index) =>
                kana ? (
                  <div className="kana-cell" key={`${kana}-${index}`}>
                    <span className="kana-cell__kana jp">{kana}</span>
                    <span className="kana-cell__romaji">{kanaToRomaji(kana, romajiStyle)}</span>
                  </div>
                ) : (
                  <div className="kana-cell kana-cell--empty" key={`empty-${index}`} />
                )
              )}
            </div>
          </div>

          <div className="stack-5">
            <div className="panel panel-pad stack-3">
              <p className="eyebrow">浊音 · 半浊音</p>
              <div className="kana-grid">
                {DAKUON.flat().map(kana => (
                  <div className="kana-cell" key={kana}>
                    <span className="kana-cell__kana jp">{kana}</span>
                    <span className="kana-cell__romaji">{kanaToRomaji(kana, romajiStyle)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel panel-pad stack-3">
              <p className="eyebrow">拗音</p>
              <div className="kana-grid kana-grid--yoon">
                {YOON.map(kana => (
                  <div className="kana-cell" key={kana}>
                    <span className="kana-cell__kana jp">{kana}</span>
                    <span className="kana-cell__romaji">{kanaToRomaji(kana, romajiStyle)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ---------------- word list ---------------- */}
      <Reveal as="section" className="stack-5">
        <div className="section-head">
          <div>
            <h2 className="section-title">
              {LEVELS.find(entry => entry.level === level)?.name} 词表
            </h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              共 {filtered.length} 个词条。音读、训读与汉字写法一并列出，罗马音就是你要输入的内容。
            </p>
          </div>
          <label className="field" style={{ minWidth: 240 }}>
            <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setLimit(100);
              }}
              placeholder="搜索假名、汉字、罗马音或释义"
              aria-label="搜索日语词条"
            />
          </label>
        </div>

        <div className="panel panel-pad">
          <table className="data-table">
            <thead>
              <tr>
                <th>假名</th>
                <th>汉字</th>
                <th>罗马音</th>
                <th>释义</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(word => (
                <tr key={`${word.kana}-${word.romaji}`}>
                  <td className="jp" style={{ fontSize: 'var(--text-md)' }}>
                    {word.kana}
                  </td>
                  <td className="jp" style={{ fontSize: 'var(--text-md)' }}>
                    {word.kanji || <span className="faint">—</span>}
                  </td>
                  <td className="mono" style={{ color: 'var(--rose)' }}>
                    {word.romaji}
                  </td>
                  <td>
                    {word.cn || <span className="muted">{word.en}</span>}
                    {word.cn && <span className="faint" style={{ fontSize: 'var(--text-xs)' }}> · {word.en}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length < filtered.length && (
            <div style={{ marginTop: 'var(--s4)' }}>
              <button type="button" className="btn btn-block" onClick={() => setLimit(value => value + 100)}>
                加载更多（还有 {filtered.length - visible.length} 个）
              </button>
            </div>
          )}
          {!filtered.length && (
            <p className="muted" style={{ padding: 'var(--s6)' }}>
              没有匹配的词条。
            </p>
          )}
        </div>

        <div className="panel panel-pad-lg row-between wrap" style={{ gap: 'var(--s5)' }}>
          <div className="stack-2">
            <strong>把这一级练一遍</strong>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              当前配置：{config.mode === 'japanese' ? `日语 ${(config.jlpt ?? []).map(entry => `N${entry}`).join(' / ')}` : '未启用日语模式'}
            </span>
          </div>
          <Link to="/practice/session" className="btn btn-primary btn-lg" onClick={() => startPractice([level])}>
            开始练 {LEVELS.find(entry => entry.level === level)?.name}
          </Link>
        </div>
      </Reveal>
    </div>
  );
};

export default Japanese;
