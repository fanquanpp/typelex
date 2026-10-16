/**
 * KanaChart — the standalone kana reference subpage (/japanese/kana).
 *
 * Extracted from the Japanese page so the sidebar can link to it as a real
 * sub-page. The chart is generated from the same converter the typing engine
 * grades against, so what you see is exactly what you have to type.
 */
import { Reveal } from '../../components/effects';
import RubberSegment from '../../components/RubberSegment';
import { useApp } from '../../lib/store';
import { kanaToRomaji } from '../../lib/romaji';
import { SEION, DAKUON, YOON } from './kanaData';
import '../Japanese.css';

const KanaChart = () => {
  const romajiStyle = useApp(state => state.settings.romajiStyle);
  const setSetting = useApp(state => state.setSetting);

  return (
    <div className="shell page">
      <header className="page-head">
        <span className="eyebrow">Reference</span>
        <h1 className="page-title">五十音与罗马音对照</h1>
        <RubberSegment
          size="sm"
          equalSlots={false}
          className="kana-style"
          aria-label="日语罗马音体系"
          items={[
            { value: 'hepburn', label: 'Hepburn' },
            { value: 'kunrei', label: 'Kunrei' }
          ]}
          value={romajiStyle}
          onChange={value => setSetting('romajiStyle', value as typeof romajiStyle)}
        />
        <p className="kana-hint">
          {romajiStyle === 'hepburn' ? (
            <>
              平文式（Hepburn）按英语拼读习惯转写：<code className="mono">し → shi</code>、<code className="mono">つ → tsu</code>、<code className="mono">ふ → fu</code>。
            </>
          ) : (
            <>
              训令式（Kunrei）按五十音行列规律转写：<code className="mono">し → si</code>、<code className="mono">つ → tu</code>、<code className="mono">ふ → hu</code>。
            </>
          )}
          打字时两种写法都算对。
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
