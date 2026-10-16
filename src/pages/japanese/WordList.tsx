/**
 * WordList — the standalone JLPT word reference subpage (/japanese/words).
 *
 * A reference page and nothing else: level switcher, search, and the table.
 * Practice entry points live on the Japanese home (/japanese), so this page
 * stays a clean lookup surface.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import RubberSegment from '../../components/RubberSegment';
import { Reveal } from '../../components/effects';
import type { JapaneseWord } from '../../lib/types';
import { loadJapanese } from '../../lib/vocab';
import { LEVELS, levelFromParam } from './levels';
import './WordList.css';

const PAGE = 100;

const WordList = () => {
  const [params, setParams] = useSearchParams();

  const [words, setWords] = useState<JapaneseWord[]>([]);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const level = levelFromParam(params.get('level'));

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
      const lowered = needle.toLowerCase();
      list = list.filter(
        word =>
          word.kana.includes(needle) ||
          word.kanji.includes(needle) ||
          word.romaji.includes(lowered) ||
          word.cn.includes(needle) ||
          word.en.toLowerCase().includes(lowered)
      );
    }
    return list;
  }, [words, level, query]);

  const visible = filtered.slice(0, limit);

  /** switching level keeps the query but rewinds the list to the first page */
  const selectLevel = (value: string) => {
    setParams({ level: value }, { replace: true });
    setLimit(PAGE);
  };

  return (
    <div className="shell page jp-words-page">
      <header className="page-head">
        <span className="eyebrow">Reference</span>
        <h1 className="page-title">日语词表</h1>
        <p className="page-sub">
          按 JLPT 级别浏览全部词条：假名、汉字写法与中文释义一并列出，罗马音就是练习时你要输入的内容。
        </p>
      </header>

      <Reveal as="section" id="sec-jp-words" className="stack-5">
        <div className="jp-word-bar">
          <RubberSegment
            size="sm"
            equalSlots={false}
            aria-label="选择 JLPT 级别"
            items={LEVELS.map(entry => ({
              value: String(entry.level),
              label: (
                <>
                  {entry.name}
                  <span className="faint"> {counts.get(entry.level) ?? 0}</span>
                </>
              )
            }))}
            value={String(level)}
            onChange={selectLevel}
          />

          <label className="field jp-word-search">
            <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setLimit(PAGE);
              }}
              placeholder="搜索假名、汉字、罗马音或释义"
              aria-label="搜索日语词条"
            />
          </label>
        </div>

        <div className="panel jp-word-panel">
          <div className="jp-word-scroll">
            {/* The padding lives on this inner box, not on the scroll pane:
                the pane's own padding would leave a band above the pinned
                header for rows to scroll through. */}
            <div className="jp-word-inner">
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
                  <button type="button" className="btn btn-block" onClick={() => setLimit(value => value + PAGE)}>
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
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default WordList;
