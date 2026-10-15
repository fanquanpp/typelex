/**
 * Stats — the long view.
 *
 * Everything here is derived from the persisted history and per-key statistics:
 * a trend chart of the last sessions, a QWERTY-arranged heatmap of your own
 * error rate, and a per-key table for the keys that are actually holding you back.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { CountUp, Odometer, Reveal, SpotlightCard } from '../components/effects';
import { useApp } from '../lib/store';
import { MODE_LABEL } from '../lib/typing/session';
import { levelProgress } from '../lib/typing/metrics';
import './Stats.css';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const Stats = () => {
  const history = useApp(state => state.history);
  const daily = useApp(state => state.daily);
  const keyStats = useApp(state => state.keyStats);
  const xp = useApp(state => state.xp);
  const streak = useApp(state => state.streak);
  const srs = useApp(state => state.srs);
  const stars = useApp(state => state.stars);
  const known = useApp(state => state.known);

  const progress = useMemo(() => levelProgress(xp), [xp]);

  const summary = useMemo(() => {
    if (!history.length) {
      return { best: 0, avgWpm: 0, avgAccuracy: 0, avgConsistency: 0, totalSeconds: 0, totalItems: 0, totalChars: 0 };
    }
    const recent = history.slice(0, 30);
    return {
      best: history.reduce((max, entry) => Math.max(max, entry.wpm), 0),
      avgWpm: recent.reduce((sum, entry) => sum + entry.wpm, 0) / recent.length,
      avgAccuracy: recent.reduce((sum, entry) => sum + entry.accuracy, 0) / recent.length,
      avgConsistency: recent.reduce((sum, entry) => sum + entry.consistency, 0) / recent.length,
      totalSeconds: history.reduce((sum, entry) => sum + entry.duration, 0),
      totalItems: history.reduce((sum, entry) => sum + entry.items, 0),
      totalChars: history.reduce((sum, entry) => sum + entry.chars, 0)
    };
  }, [history]);

  /* trend chart over the last 24 sessions, oldest first */
  const trend = useMemo(() => {
    const series = history.slice(0, 24).reverse();
    if (series.length < 2) return null;
    const max = Math.max(20, ...series.map(entry => entry.wpm));
    const points = series.map((entry, index) => {
      const x = (index / (series.length - 1)) * 100;
      const y = 100 - (entry.wpm / max) * 92 - 4;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return { points: points.join(' '), max, series };
  }, [history]);

  const dailySeries = useMemo(() => {
    const days: { day: string; seconds: number; items: number }[] = [];
    for (let offset = 13; offset >= 0; offset--) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      const key = `${date.getFullYear()}-${month}-${day}`;
      const entry = daily[key];
      days.push({ day: key.slice(5), seconds: entry?.seconds ?? 0, items: entry?.items ?? 0 });
    }
    return days;
  }, [daily]);

  const maxDaily = Math.max(60, ...dailySeries.map(entry => entry.seconds));

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

  const dueCount = Object.values(srs).filter(card => card.due <= Date.now()).length;

  const achievements = useMemo(
    () => [
      { id: 'first', label: '第一次练习', done: history.length >= 1, hint: '完成任意一次练习' },
      { id: 'wpm30', label: 'WPM 30', done: summary.best >= 30, hint: '单次净速度达到 30' },
      { id: 'wpm50', label: 'WPM 50', done: summary.best >= 50, hint: '单次净速度达到 50' },
      { id: 'wpm70', label: 'WPM 70', done: summary.best >= 70, hint: '单次净速度达到 70' },
      { id: 'acc98', label: '准确率 98%', done: summary.avgAccuracy >= 98, hint: '近 30 次平均准确率' },
      { id: 'ten', label: '十次练习', done: history.length >= 10, hint: '累计完成 10 次' },
      { id: 'fifty', label: '五十次练习', done: history.length >= 50, hint: '累计完成 50 次' },
      { id: 'cards100', label: '100 张记忆卡', done: Object.keys(srs).length >= 100, hint: '记忆库里的卡片数' },
      { id: 'streak7', label: '连续 7 天', done: streak.best >= 7, hint: '连续练习 7 天' },
      { id: 'hour', label: '累计 1 小时', done: summary.totalSeconds >= 3600, hint: '累计练习时长' },
      { id: 'words500', label: '打过 500 个词', done: summary.totalItems >= 500, hint: '累计完成的词条数' },
      { id: 'stars20', label: '收藏 20 个词', done: stars.length >= 20, hint: '在词库中收藏的词' }
    ],
    [history.length, summary, srs, streak.best, stars.length]
  );

  const unlocked = achievements.filter(entry => entry.done).length;

  const heatColor = (accuracy: number, hits: number) => {
    if (hits < 3) return 'var(--surface)';
    const bad = 1 - accuracy;
    if (bad < 0.02) return 'hsl(158 55% 40% / 0.55)';
    if (bad < 0.05) return 'hsl(90 55% 45% / 0.5)';
    if (bad < 0.1) return 'hsl(45 80% 50% / 0.5)';
    if (bad < 0.2) return 'hsl(24 85% 55% / 0.55)';
    return 'hsl(354 72% 55% / 0.6)';
  };

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Statistics</span>
        <h1 className="page-title">数据</h1>
        <p className="page-sub">
          所有数据都存在浏览器本地。逐键统计来自你实际敲击的时间与错误，弱键特训与热力图都基于它。
        </p>
      </header>

      <Reveal as="section" className="stack-6">
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat">
              <span className="stat-value">
                <CountUp to={summary.best} decimals={1} />
              </span>
              <span className="stat-label">最高 WPM</span>
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat">
              <span className="stat-value">
                <CountUp to={summary.avgWpm} decimals={1} />
              </span>
              <span className="stat-label">近 30 次平均</span>
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat">
              <span className="stat-value">
                <CountUp to={summary.avgAccuracy} decimals={1} suffix="%" />
              </span>
              <span className="stat-label">平均准确率</span>
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat">
              <span className="stat-value">
                <CountUp to={summary.avgConsistency} decimals={1} suffix="%" />
              </span>
              <span className="stat-label">平均稳定性</span>
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat">
              <span className="stat-value">
                <CountUp to={summary.totalSeconds / 60} decimals={0} />
              </span>
              <span className="stat-label">累计分钟</span>
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat">
              <span className="stat-value">
                <CountUp to={summary.totalItems} decimals={0} />
              </span>
              <span className="stat-label">累计词条</span>
            </div>
          </div>
        </div>

        <div className="panel panel-pad-lg stats-level">
          <div className="stack-2">
            <span className="eyebrow">Level</span>
            <div className="row" style={{ gap: 'var(--s4)', alignItems: 'baseline' }}>
              <strong style={{ fontSize: 'var(--text-3xl)', fontFamily: 'var(--font-mono)' }}>
                <CountUp to={progress.level} />
              </strong>
              <span className="muted">
                {Math.round(progress.current)} / {progress.need} XP · 累计 {xp} XP
              </span>
            </div>
          </div>
          <div className="meter" style={{ flex: '1 1 220px' }}>
            <span style={{ width: `${progress.ratio * 100}%` }} />
          </div>
          <div className="row" style={{ gap: 'var(--s6)' }}>
            <div className="stat">
              <span className="stat-value">
                <Odometer value={streak.current} />
              </span>
              <span className="stat-label">连续天数</span>
            </div>
            <div className="stat">
              <span className="stat-value">{streak.best}</span>
              <span className="stat-label">最长连续</span>
            </div>
          </div>
        </div>
      </Reveal>

      {trend && (
        <Reveal as="section" className="stack-5">
          <div className="section-head">
            <div>
              <h2 className="section-title">速度趋势</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                最近 {trend.series.length} 次练习的净 WPM，纵轴上限 {Math.round(trend.max)}。
              </p>
            </div>
          </div>
          <div className="panel panel-pad">
            <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height: 190 }}>
              <defs>
                <linearGradient id="statsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[25, 50, 75].map(y => (
                <line key={y} className="chart-grid" x1="0" y1={y} x2="100" y2={y} vectorEffect="non-scaling-stroke" />
              ))}
              <polygon className="chart-area" points={`0,100 ${trend.points} 100,100`} />
              <polyline className="chart-line" points={trend.points} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </Reveal>
      )}

      <Reveal as="section" className="stack-5">
        <div className="section-head">
          <div>
            <h2 className="section-title">近 14 天</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              每天的练习时长（分钟）。
            </p>
          </div>
        </div>
        <div className="panel panel-pad">
          <div className="daily-bars">
            {dailySeries.map(entry => (
              <div className="daily-bar" key={entry.day} title={`${entry.day} · ${(entry.seconds / 60).toFixed(1)} 分钟 · ${entry.items} 词`}>
                <span
                  className="daily-bar__fill"
                  style={{ height: `${Math.max(2, (entry.seconds / maxDaily) * 100)}%` }}
                  data-empty={entry.seconds === 0}
                />
                <span className="daily-bar__label">{entry.day}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="stack-5">
        <div className="section-head">
          <div>
            <h2 className="section-title">键盘热力图</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              按错误率着色：绿色几乎不出错，红色是最需要练的键。浅灰表示样本还不够。
            </p>
          </div>
        </div>

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
      </Reveal>

      {weakest.length > 0 && (
        <Reveal as="section" className="stack-5">
          <div className="section-head">
            <div>
              <h2 className="section-title">最需要练的键</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                按准确率排序，只统计敲过 5 次以上的键。弱键特训模式会用它们组词。
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

      <Reveal as="section" className="stack-5">
        <div className="section-head">
          <div>
            <h2 className="section-title">成就</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              已解锁 {unlocked} / {achievements.length}。
            </p>
          </div>
        </div>
        <div className="achievement-grid">
          {achievements.map(entry => (
            <SpotlightCard
              className="achievement"
              key={entry.id}
              style={{ opacity: entry.done ? 1 : 0.5 }}
            >
              <span className="achievement__mark" data-done={entry.done}>
                {entry.done ? (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="10" width="14" height="9" rx="2" />
                    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
                  </svg>
                )}
              </span>
              <span className="achievement__label">{entry.label}</span>
              <span className="achievement__hint">{entry.hint}</span>
            </SpotlightCard>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="stack-5">
        <div className="section-head">
          <div>
            <h2 className="section-title">练习历史</h2>
            <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              最近 {Math.min(history.length, 40)} 次记录。共 {history.length} 次。
            </p>
          </div>
          <span className="chip">
            记忆卡 {Object.keys(srs).length} · 待复习 {dueCount} · 收藏 {stars.length} · 已掌握{' '}
            {Object.values(known).filter(state => state === 2).length}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="empty">
            <strong>还没有练习记录</strong>
            <p className="muted">完成第一次练习后，这里会显示每一次的速度、准确率与稳定性。</p>
            <Link to="/practice" className="btn btn-primary">
              开始第一次练习
            </Link>
          </div>
        ) : (
          <div className="panel panel-pad">
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模式</th>
                  <th>WPM</th>
                  <th>原始</th>
                  <th>准确率</th>
                  <th>稳定性</th>
                  <th>词条</th>
                  <th>时长</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 40).map(entry => (
                  <tr key={entry.id}>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(entry.at).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td>{MODE_LABEL[entry.mode]}</td>
                    <td className="mono">{entry.wpm.toFixed(1)}</td>
                    <td className="mono">{entry.raw.toFixed(1)}</td>
                    <td className="mono">{entry.accuracy.toFixed(1)}%</td>
                    <td className="mono">{entry.consistency.toFixed(0)}%</td>
                    <td className="mono">{entry.items}</td>
                    <td className="mono">{Math.round(entry.duration)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Reveal>
    </div>
  );
};

export default Stats;
