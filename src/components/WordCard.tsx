/**
 * The vocabulary card — a Lanyard badge whose faces are painted from live word
 * data, plus an expandable detail panel.
 *
 * The painters are the reason this component exists: the lanyard's card faces
 * are canvas textures, so anything we can draw becomes the badge. Memoising the
 * painter on the word keeps the 1024px canvas from being repainted per frame.
 */
import { useCallback, useState } from 'react';

import type { Detail, Word } from '../lib/types';
import { FINGER_LABEL, fingerForChar } from '../lib/typing/fingers';
import Lanyard, { type FacePainter } from './Lanyard/Lanyard';
import { DecryptText, Reveal } from './effects';
import './WordCard.css';

const LEVEL_NAME: Record<number, string> = { 1: '高中', 2: 'CET-4', 3: 'CET-6' };

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
};

const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

interface PainterInput {
  word: Word | null;
  detail: Detail | null;
  level: number;
  label?: string;
  accent?: string;
  theme: 'dark' | 'light';
}

/** Front face: the headword, its phonetic, and its primary meanings. */
export const useFrontPainter = ({ word, detail, level, accent = '#5b8def', theme }: PainterInput) =>
  useCallback<FacePainter>(
    (ctx, width, height) => {
      if (!word) {
        ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
        ctx.font = `600 ${width * 0.055}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('准备开始', width / 2, height / 2);
        return;
      }

      const pad = width * 0.085;
      const ink = theme === 'dark' ? '#101216' : '#1b1e24';
      const muted = theme === 'dark' ? 'rgba(16,18,22,0.62)' : 'rgba(27,30,36,0.6)';

      /* top accent rule + level tag */
      ctx.fillStyle = accent;
      ctx.fillRect(pad, pad * 0.85, width * 0.16, height * 0.008);
      ctx.font = `700 ${width * 0.03}px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.fillText(`LEVEL ${level} · ${LEVEL_NAME[level] ?? ''}`, pad, pad * 1.5);

      /* headword */
      const size = word.word.length > 14 ? width * 0.1 : word.word.length > 9 ? width * 0.125 : width * 0.15;
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      const wordLines = wrapText(ctx, word.word, width - pad * 2, 2);
      let y = height * 0.3;
      for (const line of wordLines) {
        ctx.fillText(line, pad, y);
        y += size * 1.12;
      }

      /* phonetic */
      const phonetic = word.us || word.uk;
      if (phonetic) {
        ctx.font = `500 ${width * 0.042}px ${MONO}`;
        ctx.fillStyle = muted;
        ctx.fillText(`/${phonetic}/`, pad, y + width * 0.03);
        y += width * 0.075;
      } else {
        y += width * 0.04;
      }

      /* meanings */
      const defs = detail?.d ?? [];
      ctx.font = `600 ${width * 0.045}px ${FONT}`;
      let lineY = y + width * 0.05;
      const maxY = height - pad * 1.6;
      for (const [pos, cn] of defs.slice(0, 3)) {
        ctx.font = `700 ${width * 0.042}px ${MONO}`;
        ctx.fillStyle = accent;
        const posWidth = pos ? ctx.measureText(pos).width + width * 0.014 : 0;
        if (pos) ctx.fillText(pos, pad, lineY);
        ctx.font = `600 ${width * 0.045}px ${FONT}`;
        ctx.fillStyle = ink;
        const cnLines = wrapText(ctx, cn, width - pad * 2 - posWidth, 2);
        cnLines.forEach((line, index) => {
          if (lineY > maxY) return;
          ctx.fillText(line, pad + posWidth, lineY + index * width * 0.055);
        });
        lineY += width * 0.055 * cnLines.length + width * 0.035;
        if (lineY > maxY) break;
      }

      /* footer */
      ctx.font = `600 ${width * 0.028}px ${MONO}`;
      ctx.fillStyle = muted;
      ctx.fillText('TypeLex', pad, height - pad * 0.9);
      ctx.textAlign = 'right';
      ctx.fillText('TAP TO FLIP', width - pad, height - pad * 0.9);
      ctx.textAlign = 'left';
    },
    [word, detail, level, accent, theme]
  );

/** Back face: usage, related words and the memory hook. */
export const useBackPainter = ({ word, detail, level, accent = '#5b8def', theme }: PainterInput) =>
  useCallback<FacePainter>(
    (ctx, width, height) => {
      if (!word) return;
      const pad = width * 0.085;
      const ink = theme === 'dark' ? '#101216' : '#1b1e24';
      const muted = theme === 'dark' ? 'rgba(16,18,22,0.6)' : 'rgba(27,30,36,0.58)';

      ctx.fillStyle = accent;
      ctx.fillRect(pad, pad * 0.85, width * 0.16, height * 0.008);
      ctx.font = `700 ${width * 0.03}px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.fillText('USAGE', pad, pad * 1.5);

      let y = height * 0.15;
      const maxY = height - pad * 1.5;
      const section = (title: string) => {
        if (y > maxY) return;
        ctx.font = `700 ${width * 0.032}px ${MONO}`;
        ctx.fillStyle = accent;
        ctx.fillText(title, pad, y);
        y += width * 0.05;
      };

      /* example sentence */
      const example = detail?.s?.[0];
      if (example) {
        section('EXAMPLE');
        ctx.font = `500 ${width * 0.04}px ${FONT}`;
        ctx.fillStyle = ink;
        const lines = wrapText(ctx, example[0], width - pad * 2, 3);
        for (const line of lines) {
          ctx.fillText(line, pad, y);
          y += width * 0.052;
        }
        ctx.font = `500 ${width * 0.036}px ${FONT}`;
        ctx.fillStyle = muted;
        const cnLines = wrapText(ctx, example[1], width - pad * 2, 2);
        for (const line of cnLines) {
          ctx.fillText(line, pad, y);
          y += width * 0.046;
        }
        y += width * 0.03;
      }

      /* related words */
      const rels = detail?.r ?? [];
      if (rels.length && y < maxY) {
        section('WORD FAMILY');
        for (const [pos, words] of rels.slice(0, 2)) {
          if (y > maxY) break;
          ctx.font = `500 ${width * 0.038}px ${MONO}`;
          ctx.fillStyle = ink;
          const text = words.map(entry => entry[0]).join(' · ');
          ctx.fillText(text.slice(0, 44), pad, y);
          y += width * 0.048;
          void pos;
        }
        y += width * 0.02;
      }

      /* mnemonic */
      if (detail?.m && y < maxY) {
        section('MEMORY');
        ctx.font = `500 ${width * 0.036}px ${FONT}`;
        ctx.fillStyle = muted;
        const lines = wrapText(ctx, detail.m, width - pad * 2, 3);
        for (const line of lines) {
          if (y > maxY) break;
          ctx.fillText(line, pad, y);
          y += width * 0.046;
        }
      }

      if (!example && !rels.length && !detail?.m) {
        ctx.font = `500 ${width * 0.04}px ${FONT}`;
        ctx.fillStyle = muted;
        ctx.fillText('这个词暂无更多用法数据', pad, y + width * 0.02);
      }

      ctx.font = `600 ${width * 0.028}px ${MONO}`;
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.fillText(LEVEL_NAME[level] ?? '', width - pad, height - pad * 0.9);
      ctx.textAlign = 'left';
    },
    [word, detail, level, accent, theme]
  );

interface WordCardProps {
  word: Word | null;
  detail: Detail | null;
  theme: 'dark' | 'light';
  accent?: string;
  height?: number;
  onStar?: () => void;
  starred?: boolean;
  /** shown instead of the word while a session is idle */
  placeholder?: string;
  /** flat glass panel instead of the hanging-badge stage */
  flat?: boolean;
  /** stretch the badge stage to fill the available column height */
  fill?: boolean;
}

export const WordCard = ({
  word,
  detail,
  theme,
  accent = '#5b8def',
  height = 520,
  onStar,
  starred = false,
  placeholder,
  flat = false,
  fill = false
}: WordCardProps) => {
  const [open, setOpen] = useState(false);
  const level = word?.level ?? 1;

  const frontPainter = useFrontPainter({ word, detail, level, accent, theme });
  const backPainter = useBackPainter({ word, detail, level, accent, theme });

  const finger = word ? fingerForChar(word.word[0] ?? '') : null;

  if (flat) {
    return (
      <div className={`word-card${fill ? ' word-card--fill' : ''}`}>
        <div
          className="word-card__panel"
          style={fill ? { flex: '1 1 auto', minHeight: 280 } : { minHeight: Math.min(height, 300) }}
        >
          {word ? (
            <>
              <div className="word-card__panel-head">
                <span className="word-card__word">{word.word}</span>
                <span className="word-card__phonetic">/{word.us || word.uk}/</span>
              </div>
              <p className="word-card__meaning">{word.cn}</p>
              {detail?.r && detail.r.length > 0 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 'var(--s3)' }}>
                  {detail.r
                    .flatMap(group => group[1])
                    .slice(0, 5)
                    .map(([w, cn]) => (
                      <span className="chip" key={w} title={cn}>
                        {w}
                      </span>
                    ))}
                </div>
              )}
              {detail?.s?.[0] && (
                <div className="word-card__example">
                  <span className="mono">{detail.s[0][0]}</span>
                  <span className="muted">{detail.s[0][1]}</span>
                </div>
              )}
            </>
          ) : (
            <p className="muted">{placeholder ?? '开始一次练习，单词卡会在这里出现'}</p>
          )}
        </div>

        {word && (
          <div className="word-card__bar">
            <div className="row wrap" style={{ gap: 'var(--s2)' }}>
              <span className="chip">{LEVEL_NAME[level] ?? '词汇'}</span>
              {word.pos && <span className="chip">{word.pos}</span>}
              {finger && <span className="chip">{FINGER_LABEL[finger]}</span>}
            </div>
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <button type="button" className="btn btn-sm" onClick={() => setOpen(value => !value)}>
                {open ? '收起详解' : '展开详解'}
              </button>
              {onStar && (
                <button
                  type="button"
                  className={`btn btn-sm ${starred ? 'btn-primary' : ''}`}
                  onClick={onStar}
                  aria-pressed={starred}
                >
                  {starred ? '已收藏' : '收藏'}
                </button>
              )}
            </div>
          </div>
        )}

        {word && open && detail && (
          <div className="word-card__detail">
            <WordDetail word={word} detail={detail} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`word-card${fill ? ' word-card--fill' : ''}`}>
      <div className="word-card__stage" style={fill ? undefined : { height }}>
        {word ? (
          <Lanyard
            frontPainter={frontPainter}
            backPainter={backPainter}
            cardColor={theme === 'dark' ? '#f4f5f7' : '#ffffff'}
            orientation="portrait"
            finish="glossy"
            cornerRadius={0.34}
            size={0.62}
            anchor="center"
            strapLength={0.42}
            strapColor="#3a4050"
            strapWidth={0.62}
            metal="silver"
            gravity={1}
            damping={0.55}
            elasticity={0.5}
            breeze={0.42}
            interactive
            intro
          />
        ) : (
          <div className="word-card__empty">
            <p className="muted">{placeholder ?? '开始一次练习，单词卡会在这里出现'}</p>
          </div>
        )}
      </div>

      {word && (
        <div className="word-card__bar">
          <div className="row wrap" style={{ gap: 'var(--s2)' }}>
            <span className="chip">{LEVEL_NAME[level] ?? '词汇'}</span>
            {word.pos && <span className="chip">{word.pos}</span>}
            {finger && <span className="chip">{FINGER_LABEL[finger]}</span>}
          </div>
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(value => !value)}>
              {open ? '收起详解' : '展开详解'}
            </button>
            {onStar && (
              <button
                type="button"
                className={`btn btn-sm ${starred ? 'btn-primary' : ''}`}
                onClick={onStar}
                aria-pressed={starred}
              >
                {starred ? '已收藏' : '收藏'}
              </button>
            )}
          </div>
        </div>
      )}

      {word && open && detail && (
        <div className="word-card__detail">
          <WordDetail word={word} detail={detail} />
        </div>
      )}
    </div>
  );
};

export const WordDetail = ({ word, detail }: { word: Word; detail: Detail }) => (
  <div className="word-detail stack-6">
    <Reveal>
      <div>
        <p className="eyebrow">释义</p>
        <ul className="word-detail__defs">
          {detail.d.map(([pos, cn, en], index) => (
            <li key={index}>
              <span className="tag-pos">{pos}</span>
              <div>
                <div>{cn}</div>
                {en && <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>{en}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>

    {detail.k && detail.k.length > 0 && (
      <Reveal delay={40}>
        <div>
          <p className="eyebrow">易混词</p>
          <div className="row wrap" style={{ gap: 'var(--s2)' }}>
            {detail.k.map(([other, cn]) => (
              <span className="chip" key={other} title={cn}>
                {other}
              </span>
            ))}
          </div>
        </div>
      </Reveal>
    )}

    {detail.s && detail.s.length > 0 && (
      <Reveal delay={60}>
        <div>
          <p className="eyebrow">例句</p>
          <ul className="word-detail__sentences">
            {detail.s.map(([en, cn], index) => (
              <li key={index}>
                <span className="mono">{en}</span>
                <span className="muted">{cn}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    )}

    {detail.p && detail.p.length > 0 && (
      <Reveal delay={80}>
        <div>
          <p className="eyebrow">常用搭配</p>
          <ul className="word-detail__phrases">
            {detail.p.slice(0, 6).map(([en, cn]) => (
              <li key={en}>
                <span className="mono">{en}</span>
                <span className="faint">{cn}</span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    )}

    {detail.r && detail.r.length > 0 && (
      <Reveal delay={100}>
        <div>
          <p className="eyebrow">同根词家族</p>
          <div className="word-detail__family">
            {detail.r.map(([pos, words]) => (
              <div key={pos || 'rel'}>
                {pos && <span className="tag-pos">{pos}</span>}
                <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                  {words.map(([w, cn]) => (
                    <span className="chip" key={w} title={cn}>
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    )}

    {detail.y && detail.y.length > 0 && (
      <Reveal delay={120}>
        <div>
          <p className="eyebrow">同近义词</p>
          <ul className="word-detail__defs">
            {detail.y.map(([pos, tran, words], index) => (
              <li key={index}>
                <span className="tag-pos">{pos}</span>
                <div>
                  <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                    {words.map(w => (
                      <span className="chip" key={w}>
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>{tran}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    )}

    {detail.x && detail.x.length > 0 && (
      <Reveal delay={140}>
        <div>
          <p className="eyebrow">真题片段</p>
          <ul className="word-detail__sentences">
            {detail.x.map(([en, meta], index) => (
              <li key={index}>
                <span className="mono">
                  <span className="faint">…</span>
                  {en}
                </span>
                <span className="chip" style={{ alignSelf: 'flex-start' }}>
                  {meta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    )}

    {detail.m && (
      <Reveal delay={160}>
        <div>
          <p className="eyebrow">记忆法</p>
          <p className="word-detail__mnemonic">{detail.m}</p>
        </div>
      </Reveal>
    )}

    <div className="word-detail__foot faint">
      <DecryptText text={word.word} speed={28} />
      <span className="divider-dot" />
      <span>{word.book === 'highschool' ? '高中词表' : word.book === 'cet4' ? '四级词表' : '六级词表'}</span>
    </div>
  </div>
);

export default WordCard;
