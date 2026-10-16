/**
 * SessionHistory — the practice log subpage (/stats/history).
 *
 * Every recorded session plus the data-management actions. Extracted from the
 * stats page so the sidebar can link to it as its own sub-page.
 */
import { Link } from 'react-router-dom';

import { Reveal } from '../../components/effects';
import { useApp } from '../../lib/store';
import { MODE_LABEL } from '../../lib/typing/session';
import '../Stats.css';

const SessionHistory = () => {
  const history = useApp(state => state.history);
  const srs = useApp(state => state.srs);
  const stars = useApp(state => state.stars);
  const known = useApp(state => state.known);
  const resetProgress = useApp(state => state.resetProgress);

  const dueCount = Object.values(srs).filter(card => card.due <= Date.now()).length;

  return (
    <div className="shell page page--child">
      <header className="page-head">
        <span className="eyebrow">Statistics · History</span>
        <h1 className="page-title">练习历史</h1>
        <p className="page-sub">每一次练习的速度、准确率与稳定性，以及本地数据的管理。</p>
      </header>

      <Reveal as="section" className="stack-6">
        <div className="section-head">
          <div>
            <h2 className="section-title">记录</h2>
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

      <Reveal as="section">
        <div className="panel panel-pad row-between wrap" style={{ gap: 'var(--s5)' }}>
          <div className="stack-2">
            <strong>清空所有数据</strong>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              会删除进度、按键统计、记忆卡片与全部历史。这个操作无法撤销。
            </span>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('确定要清空所有本地数据吗？这个操作无法撤销。')) resetProgress();
            }}
          >
            清空数据
          </button>
        </div>
      </Reveal>
    </div>
  );
};

export default SessionHistory;
