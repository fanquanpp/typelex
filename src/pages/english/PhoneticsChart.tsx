/**
 * English phonetics chart — the English counterpart of the kana chart.
 *
 * A three-column reference table per panel: 音标 (the sound), 例词 (a
 * high-frequency word with the letters that produce the sound highlighted),
 * 常见字母组合 (the lower-case patterns that usually spell it). The column
 * headers label all three parts explicitly, which a two-line symbol+word cell
 * could not do — IPA and English words are both Latin script.
 *
 * The accent control swaps RP for KK symbols only; the word, highlight and
 * spelling patterns stay put.
 */
import { useState } from 'react';

import { Reveal } from '../../components/effects';
import RubberSegment from '../../components/RubberSegment';
import {
  VOWELS,
  VOICELESS,
  VOICED,
  type Phoneme,
  type PhoneticAccent
} from './phoneticsData';
import './Phonetics.css';

const Word = ({ phoneme }: { phoneme: Phoneme }) => {
  const at = phoneme.word.indexOf(phoneme.hi);
  if (at < 0) return <>{phoneme.word}</>;
  return (
    <>
      {phoneme.word.slice(0, at)}
      <mark>{phoneme.hi}</mark>
      {phoneme.word.slice(at + phoneme.hi.length)}
    </>
  );
};

const Row = ({ phoneme, accent }: { phoneme: Phoneme; accent: PhoneticAccent }) => (
  <tr>
    <td className="phoneme-table__ipa">/{accent === 'us' ? phoneme.us ?? phoneme.uk : phoneme.uk}/</td>
    <td className="phoneme-table__word">
      <Word phoneme={phoneme} />
      <span className="phoneme-table__cn">{phoneme.cn}</span>
    </td>
    <td className="phoneme-table__spell">{phoneme.spell}</td>
  </tr>
);

const PhonemeTable = ({
  phonemes,
  accent
}: {
  phonemes: Phoneme[];
  accent: PhoneticAccent;
}) => (
  <table className="data-table phoneme-table">
    <thead>
      <tr>
        <th scope="col">音标</th>
        <th scope="col">例词</th>
        <th scope="col">常见字母组合</th>
      </tr>
    </thead>
    <tbody>
      {phonemes.map(phoneme => (
        <Row key={phoneme.uk} phoneme={phoneme} accent={accent} />
      ))}
    </tbody>
  </table>
);

const PhoneticsChart = () => {
  const [accent, setAccent] = useState<PhoneticAccent>('uk');

  return (
    <div className="shell page page--child">
      <header className="page-head">
        <span className="eyebrow">Reference</span>
        <h1 className="page-title">英语音标、例词与拼写对照</h1>
        <RubberSegment
          size="sm"
          equalSlots={false}
          className="phonetics-style"
          aria-label="英语音标体系"
          items={[
            { value: 'uk', label: '英式' },
            { value: 'us', label: '美式' }
          ]}
          value={accent}
          onChange={value => setAccent(value as PhoneticAccent)}
        />
        <p className="phonetics-hint">
          第一列是音标（读音），第二列是例词（高亮处发这个音），第三列是常见字母组合。{accent === 'uk' ? '英式（RP）用长音符号区分长短元音。' : '美式（KK）不写长音符号，卷舌元音合并。'}切换只改音标写法。
        </p>
      </header>

      <Reveal as="section" className="stack-8">
        <div className="phonetics-layout">
          <div className="panel panel-pad stack-3">
            <p className="eyebrow">元音 · {VOWELS.length}</p>
            <PhonemeTable phonemes={VOWELS} accent={accent} />
          </div>

          <div className="stack-6">
            <div className="panel panel-pad stack-3">
              <p className="eyebrow">清辅音 · {VOICELESS.length}</p>
              <PhonemeTable phonemes={VOICELESS} accent={accent} />
            </div>

            <div className="panel panel-pad stack-3">
              <p className="eyebrow">浊辅音 · {VOICED.length}</p>
              <PhonemeTable phonemes={VOICED} accent={accent} />
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
};

export default PhoneticsChart;
