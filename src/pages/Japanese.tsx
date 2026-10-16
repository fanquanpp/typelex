/**
 * Japanese — the rōmaji track.
 *
 * The feature home is the way in: a single practice launcher (level picker, the
 * live config readout and the corpus count) over a level directory. The word
 * list and the kana chart are their own sub-pages — this page owns every
 * practice entry point, so the reference pages stay pure lookups.
 * Every JLPT level (N5–N1) carries a hand-written Chinese gloss; the English
 * gloss from the source dataset stays alongside it in the data.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import RubberSegment from '../components/RubberSegment';
import { Reveal, SpotlightCard } from '../components/effects';
import { useApp } from '../lib/store';
import type { JapaneseWord } from '../lib/types';
import { loadJapanese } from '../lib/vocab';
import { LEVELS } from './japanese/levels';
import './Japanese.css';

/**
 * What the launcher can start. N5+N4 is one option rather than two levels
 * chained: the queue builder already mixes a level list into a single run.
 */
const TARGETS: { value: string; levels: number[]; label: string }[] = [
  { value: 'n5', levels: [5], label: 'N5' },
  { value: 'n5n4', levels: [5, 4], label: 'N5 + N4' },
  { value: 'n4', levels: [4], label: 'N4' },
  { value: 'n3', levels: [3], label: 'N3' },
  { value: 'n2', levels: [2], label: 'N2' },
  { value: 'n1', levels: [1], label: 'N1' }
];

const Japanese = () => {
  const config = useApp(state => state.config);
  const setConfig = useApp(state => state.setConfig);
  const [words, setWords] = useState<JapaneseWord[]>([]);
  const [target, setTarget] = useState('n5');

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

  const current = TARGETS.find(entry => entry.value === target) ?? TARGETS[0];

  const startPractice = () => {
    setConfig({ mode: 'japanese', jlpt: current.levels, length: 'count', amount: 20 });
  };

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Japanese</span>
        <h1 className="page-title">日语 · 罗马音输入</h1>
      </header>

      <Reveal as="section" id="sec-jp-start" className="stack-8">
        <div className="jp-start panel panel-pad-lg">
          <div className="jp-start__note">
            <h2 className="section-title">把这一级练一遍</h2>
            <span className="muted jp-start__count">
              共 {words.length.toLocaleString()} 个词条，全部带人工整理的中文释义。
            </span>
            <span className="muted jp-start__config">
              当前配置：
              {config.mode === 'japanese'
                ? `日语 ${(config.jlpt ?? []).map(entry => `N${entry}`).join(' / ')}`
                : '未启用日语模式'}
            </span>
          </div>

          {/* the picker and its button stack: six level slots plus a 120px
              button never fit on one line without the button looking detached */}
          <div className="jp-start__controls">
            <RubberSegment
              size="sm"
              equalSlots={false}
              className="jp-start__levels"
              aria-label="选择要练习的 JLPT 级别"
              items={TARGETS.map(entry => ({ value: entry.value, label: entry.label }))}
              value={current.value}
              onChange={setTarget}
            />
            <Link to="/practice/session" className="btn btn-primary btn-lg" onClick={startPractice}>
              开始练 {current.label}
            </Link>
          </div>
        </div>

        <div className="stat-grid">
          {LEVELS.map(entry => (
            <SpotlightCard key={entry.level} className="stat-tile jp-level">
              {/* one stretched link per tile: the whole card is the target */}
              <Link to={`/japanese/words?level=${entry.level}`} className="jp-level__link">
                <div className="row-between">
                  <span className="stat-value">{entry.name}</span>
                  <span className="chip chip-rose">{counts.get(entry.level) ?? 0} 词</span>
                </div>
                <span className="stat-label">{entry.desc}</span>
                <p className="faint jp-level__note">{entry.note}</p>
                <span className="jp-level__go">查看词表</span>
              </Link>
            </SpotlightCard>
          ))}
        </div>
      </Reveal>
    </div>
  );
};

export default Japanese;
