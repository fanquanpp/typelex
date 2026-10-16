/**
 * KanaChart — the standalone kana reference subpage (/japanese/kana).
 *
 * Extracted from the Japanese page so the sidebar can link to it as a real
 * sub-page. The chart is generated from the same converter the typing engine
 * grades against, so what you see is exactly what you have to type.
 */
import { Reveal } from '../../components/effects';
import { useApp } from '../../lib/store';
import { kanaToRomaji } from '../../lib/romaji';
import { SEION, DAKUON, YOON } from './kanaData';
import '../Japanese.css';

const KanaChart = () => {
  const romajiStyle = useApp(state => state.settings.romajiStyle);

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Reference</span>
        <h1 className="page-title">五十音与罗马音对照</h1>
        <p className="page-sub">
          当前使用 {romajiStyle === 'hepburn' ? '平文式（Hepburn）' : '训令式（Kunrei）'}。
          打字时两种写法都算对，例如 <code className="mono">shi</code> 与 <code className="mono">si</code> 都可以。
        </p>
      </header>

      <Reveal as="section" className="stack-6">
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
    </div>
  );
};

export default KanaChart;
