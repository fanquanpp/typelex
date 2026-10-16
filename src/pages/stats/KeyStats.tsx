/**
 * KeyStats — per-key analysis subpage (/stats/keys).
 *
 * The QWERTY heatmap and the weakest-keys table: everything about *which
 * keys* are holding the typist back. Extracted from the stats page so the
 * sidebar can link to it as its own sub-page.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Reveal } from '../../components/effects';
import { useApp } from '../../lib/store';
import '../Stats.css';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const heatColor = (accuracy: number, hits: number) => {
  if (hits < 3) return 'var(--surface)';
  const bad = 1 - accuracy;
  if (bad < 0.02) return 'hsl(158 55% 40% / 0.55)';
  if (bad < 0.05) return 'hsl(90 55% 45% / 0.5)';
  if (bad < 0.1) return 'hsl(45 80% 50% / 0.5)';
  if (bad < 0.2) return 'hsl(24 85% 55% / 0.55)';
  return 'hsl(354 72% 55% / 0.6)';
};

const KeyStats = () => {
  const keyStats = useApp(state => state.keyStats);

  const keyHeat = useMemo(() => {
    const map = new Map<string, { hits: number; misses: number; time: number }>();
    for (const [char, stat] of Object.entries(keyStats)) {
      map.set(char.toLowerCase(), { hits: stat.hits, misses: stat.misses, time: stat.time });
    }
    return map;
  }, [keyStats]);

  const weakest = useMemo(() => {
    return Object.entries(keyStats)
      .filter(([, stat]) => stat.hits >= 5)
      .map(([char, stat]) => ({
        char,
        accuracy: stat.hits ? 1 - stat.misses / stat.hits : 1,
        time: stat.time,
        hits: stat.hits
      }))
      .sort((a, b) => a.accuracy - b.accuracy || b.time - a.time)
      .slice(0, 12);
  }, [keyStats]);

  const hasData = keyHeat.size > 0;

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Statistics · Keys</span>
        <h1 className="page-title">逐键分析</h1>
        <p className="page-sub">
          按错误率着色的键盘热力图与弱键表。全部来自你实际敲击的时间与错误，弱键特训模式会用它们组词。
        </p>
      </header>

      <Reveal as="section" className="stack-5">
        <div className="section-head">
          <div>
            <h2 className="section-title">键盘热力图</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              按错误率着色：绿色几乎不出错，红色是最需要练的键。浅灰表示样本还不够。
            </p>
          </div>
        </div>

        {hasData ? (
          <div className="panel panel-pad">
            <div className="heat-keyboard">
              {ROWS.map((row, rowIndex) => (
                <div className="heat-row" key={row} style={{ marginLeft: `${rowIndex * 16}px` }}>
                  {row.split('').map(char => {
                    const stat = keyHeat.get(char.toLowerCase());
                    const accuracy = stat && stat.hits ? 1 - stat.misses / stat.hits : 1;
                    return (
                      <span
                        className="heat-key"
                        key={char}
                        style={{ background: heatColor(accuracy, stat?.hits ?? 0) }}
                        title={
                          stat
                            ? `${char.toUpperCase()} · 命中 ${stat.hits} · 错误 ${stat.misses} · 平均 ${Math.round(stat.time)}ms`
                            : `${char.toUpperCase()} · 暂无数据`
                        }
                      >
                        {char}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">
            <strong>还没有按键数据</strong>
            <p className="muted">完成一次练习后，这里会按错误率为每个键着色。</p>
            <Link to="/practice" className="btn btn-primary">
              去练习
            </Link>
          </div>
        )}
      </Reveal>

      {weakest.length > 0 && (
        <Reveal as="section" className="stack-5">
          <div className="section-head">
            <div>
              <h2 className="section-title">最需要练的键</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                按准确率排序，只统计敲过 5 次以上的键。
              </p>
            </div>
            <Link to="/practice" className="btn btn-sm">
              去练弱键
            </Link>
          </div>
          <div className="panel panel-pad">
            <table className="data-table">
              <thead>
                <tr>
                  <th>按键</th>
                  <th>准确率</th>
                  <th>平均用时</th>
                  <th>敲击次数</th>
                </tr>
              </thead>
              <tbody>
                {weakest.map(entry => (
                  <tr key={entry.char}>
                    <td>
                      <span className="kbd">{entry.char === ' ' ? 'Space' : entry.char.toUpperCase()}</span>
                    </td>
                    <td className="mono">{(entry.accuracy * 100).toFixed(1)}%</td>
                    <td className="mono">{Math.round(entry.time)}ms</td>
                    <td className="mono">{entry.hits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      )}
    </div>
  );
};

export default KeyStats;
