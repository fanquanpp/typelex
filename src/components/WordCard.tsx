/**
 * The vocabulary card — a Lanyard badge whose faces are painted from live word
 * data, plus a flat glass variant that carries the same record on two sides.
 *
 * The painters are the reason the badge half of this component exists: the
 * lanyard's card faces are canvas textures, so anything we can draw becomes the
 * badge. Memoising the painter on the word keeps the 1024px canvas from being
 * repainted per frame.
 */
import { useCallback, useEffect, useState } from 'react';

import type { Detail, Word } from '../lib/types';
import { FINGER_LABEL, fingerForChar } from '../lib/typing/fingers';
import FlipCard from './FlipCard';
import Lanyard, { type FacePainter } from './Lanyard/Lanyard';
import WarmTooltip, { WarmTooltipGroup } from './WarmTooltip';
import { DecryptText, Reveal } from './effects';
import './WordCard.css';

const LEVEL_NAME: Record<number, string> = { 1: '高中', 2: 'CET-4', 3: 'CET-6' };

/**
 * The source lists repeat themselves: a word shows up in more than one 同根词
 * group (4,831 of 9,482 words), and 易混词 lists each pair twice (4,232). One
 * chip per distinct word is what the card means to show; the repeats were also
 * what React was warning about with duplicate `key`s.
 */
const uniqByWord = <T extends [string, ...unknown[]]>(list: T[]): T[] => {
  const seen = new Set<string>();
  return list.filter(entry => {
    if (seen.has(entry[0])) return false;
    seen.add(entry[0]);
    return true;
  });
};

/** Lay `text` into at most `maxLines` lines that fit `maxWidth`. Tokens wider
 *  than the line are hard-broken per character — CJK definitions and compounds
 *  like `ac(表加强)+celer(速度)` have no spaces to break at — and when the line
 *  budget runs out the last line ends in an ellipsis instead of spilling past
 *  the card edge. */
const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] => {
  const lines: string[] = [];
  let line = '';
  let dropped = false;

  const commit = () => {
    lines.push(line);
    line = '';
  };
  const breakToken = (token: string) => {
    for (const ch of token) {
      if (line && ctx.measureText(line + ch).width > maxWidth) {
        if (lines.length + 1 >= maxLines) {
          dropped = true;
          return;
        }
        commit();
      }
      line += ch;
    }
  };

  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    const candidate = line ? `${line} ${token}` : token;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line && ctx.measureText(token).width <= maxWidth) {
      if (lines.length + 1 >= maxLines) {
        dropped = true;
        break;
      }
      commit();
      line = token;
      continue;
    }
    breakToken(token);
    if (dropped) break;
  }

  if (line && lines.length < maxLines) commit();
  else if (line) dropped = true;

  if (dropped && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
};

/** One-line fit: the text cut to `maxWidth` with a trailing ellipsis when it
 *  has to be. A no-op when the text already fits. */
const fitLine = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 0 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
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
        ctx.font = `600 ${width * 0.045}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('准备开始', width / 2, height / 2);
        return;
      }

      /* Landscape geometry: wide and short, so type scales off the HEIGHT. */
      const pad = height * 0.11;
      const unit = height;
      const ink = theme === 'dark' ? '#e8eaf0' : '#1b1e24';
      const muted = theme === 'dark' ? 'rgba(232,234,240,0.62)' : 'rgba(27,30,36,0.6)';

      /* top accent rule + level tag along the top edge */
      ctx.fillStyle = accent;
      ctx.fillRect(pad, pad * 0.72, unit * 0.16, unit * 0.014);
      ctx.font = `700 ${unit * 0.05}px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.fillText(`LEVEL ${level} · ${LEVEL_NAME[level] ?? ''}`, pad, pad * 1.62);

      /* headword, one line wherever it fits; the ellipsis is the safety net for
         words too long even at the minimum size */
      let size = unit * 0.34;
      ctx.font = `700 ${size}px ${MONO}`;
      while (size > unit * 0.12 && ctx.measureText(word.word).width > width - pad * 2) {
        size *= 0.94;
        ctx.font = `700 ${size}px ${MONO}`;
      }
      ctx.fillStyle = ink;
      ctx.fillText(fitLine(ctx, word.word, width - pad * 2), pad, height * 0.56);

      /* phonetic right under the headword */
      const phonetic = word.us || word.uk;
      if (phonetic) {
        ctx.font = `500 ${unit * 0.07}px ${MONO}`;
        ctx.fillStyle = muted;
        ctx.fillText(`/${phonetic}/`, pad, height * 0.56 + unit * 0.14);
      }

      /* first meanings flow in the remaining lower band */
      const defs = detail?.d ?? [];
      let lineY = height * 0.56 + (phonetic ? unit * 0.24 : unit * 0.16);
      const maxY = height - pad * 1.35;
      for (const [pos, cn] of defs.slice(0, 3)) {
        if (lineY > maxY) break;
        ctx.font = `700 ${unit * 0.065}px ${MONO}`;
        ctx.fillStyle = accent;
        const posWidth = pos ? ctx.measureText(pos).width + unit * 0.025 : 0;
        if (pos) ctx.fillText(pos, pad, lineY);
        ctx.font = `600 ${unit * 0.07}px ${FONT}`;
        ctx.fillStyle = ink;
        const cnLines = wrapText(ctx, cn, width - pad * 2 - posWidth, 1);
        ctx.fillText(cnLines[0], pad + posWidth, lineY);
        lineY += unit * 0.105;
      }

      /* footer */
      ctx.font = `600 ${unit * 0.045}px ${MONO}`;
      ctx.fillStyle = muted;
      ctx.fillText('TypeLex', pad, height - pad * 0.72);
      ctx.textAlign = 'right';
      ctx.fillText('TAP TO FLIP', width - pad, height - pad * 0.72);
      ctx.textAlign = 'left';
    },
    [word, detail, level, accent, theme]
  );

/** Back face: the full reference record — definitions, example, phrases,
    word family, confusables and the memory hook, in two columns on landscape. */
export const useBackPainter = ({ word, detail, level, accent = '#5b8def', theme }: PainterInput) =>
  useCallback<FacePainter>(
    (ctx, width, height) => {
      if (!word) return;
      const pad = height * 0.11;
      const unit = height;
      const ink = theme === 'dark' ? '#e8eaf0' : '#1b1e24';
      const muted = theme === 'dark' ? 'rgba(232,234,240,0.6)' : 'rgba(27,30,36,0.58)';

      /* two column rails with a real gutter: the left column's text must stop
         before the right column starts, and both stay inside the face. */
      const colX = width * 0.56;
      const leftW = colX - unit * 0.05 - pad;
      const rightW = width - pad - colX;

      const section = (title: string, x: number, y: number) => {
        ctx.font = `700 ${unit * 0.05}px ${MONO}`;
        ctx.fillStyle = accent;
        ctx.fillText(title, x, y);
      };
      const paragraph = (text: string, x: number, y: number, max: number, font: string, color: string, leading: number, lines: number) => {
        ctx.font = font;
        ctx.fillStyle = color;
        let cursor = y;
        for (const line of wrapText(ctx, text, max, lines)) {
          ctx.fillText(line, x, cursor);
          cursor += leading;
        }
        return cursor;
      };

      /* header: the headword with its phonetic trailing on the same line. The
         headword shrinks to keep the pair inside the content width; only a
         pathological length drops the phonetic and clips the word itself. */
      ctx.fillStyle = accent;
      ctx.fillRect(pad, pad * 0.72, unit * 0.16, unit * 0.014);
      const phonetic = word.us || word.uk;
      ctx.font = `500 ${unit * 0.055}px ${MONO}`;
      const phText = phonetic ? `/${phonetic}/` : '';
      const phGap = unit * 0.05;
      const phWidth = phText ? ctx.measureText(phText).width : 0;
      const fullW = width - pad * 2;
      const pairW = fullW - (phText ? phWidth + phGap : 0);
      let headSize = unit * 0.075;
      ctx.font = `700 ${headSize}px ${MONO}`;
      while (headSize > unit * 0.045 && ctx.measureText(word.word).width > pairW) {
        headSize *= 0.94;
        ctx.font = `700 ${headSize}px ${MONO}`;
      }
      let headText = word.word;
      let showPhonetic = Boolean(phText);
      if (ctx.measureText(headText).width > pairW) {
        headText = fitLine(ctx, word.word, fullW);
        showPhonetic = false;
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      /* measure the headword while the head font is still current — the
         phonetic offset depends on it */
      const headWidth = ctx.measureText(headText).width;
      ctx.fillText(headText, pad, pad * 1.78);
      if (showPhonetic) {
        ctx.font = `500 ${unit * 0.055}px ${MONO}`;
        ctx.fillStyle = muted;
        ctx.fillText(phText, pad + headWidth + phGap, pad * 1.78);
      }

      /* left column: definitions + example */
      let y = pad * 3;
      const defs = detail?.d ?? [];
      if (defs.length) {
        section('释义', pad, y);
        y += unit * 0.1;
        for (const [pos, cn] of defs.slice(0, 4)) {
          if (y > height - pad * 2.4) break;
          ctx.font = `700 ${unit * 0.058}px ${MONO}`;
          ctx.fillStyle = accent;
          const posWidth = pos ? ctx.measureText(pos).width + unit * 0.02 : 0;
          if (pos) ctx.fillText(pos, pad, y);
          y = paragraph(cn, pad + posWidth, y, Math.max(leftW - posWidth, unit * 0.2), `600 ${unit * 0.062}px ${FONT}`, ink, unit * 0.088, 2);
          y += unit * 0.03;
        }
      }

      const example = detail?.s?.[0];
      if (example && y < height - pad * 2.6) {
        section('例句', pad, y + unit * 0.05);
        y += unit * 0.15;
        if (y < height - pad * 2) {
          y = paragraph(example[0], pad, y, leftW, `500 ${unit * 0.06}px ${FONT}`, ink, unit * 0.082, 2);
          y = paragraph(example[1], pad, y, leftW, `500 ${unit * 0.054}px ${FONT}`, muted, unit * 0.075, 2);
        }
      }

      /* right column: phrases, family, confusables, mnemonic */
      let ry = pad * 3;
      const phrases = detail?.p ?? [];
      if (phrases.length) {
        section('常用搭配', colX, ry);
        ry += unit * 0.1;
        for (const [en, cn] of phrases.slice(0, 3)) {
          if (ry > height - pad * 2.4) break;
          ctx.font = `500 ${unit * 0.058}px ${MONO}`;
          ctx.fillStyle = ink;
          ctx.fillText(fitLine(ctx, en, rightW), colX, ry);
          ry += unit * 0.078;
          ctx.font = `500 ${unit * 0.05}px ${FONT}`;
          ctx.fillStyle = muted;
          ctx.fillText(fitLine(ctx, cn, rightW), colX, ry);
          ry += unit * 0.082;
        }
        ry += unit * 0.02;
      }

      const rels = detail?.r ?? [];
      if (rels.length && ry < height - pad * 2.4) {
        section('同根词', colX, ry);
        ry += unit * 0.1;
        for (const [, words] of rels.slice(0, 2)) {
          if (ry > height - pad * 2) break;
          const text = [...new Set(words.map(entry => entry[0]))].join(' · ');
          ctx.font = `500 ${unit * 0.058}px ${MONO}`;
          ctx.fillStyle = ink;
          ctx.fillText(fitLine(ctx, text, rightW), colX, ry);
          ry += unit * 0.085;
        }
        ry += unit * 0.02;
      }

      const confusables = detail?.k ?? [];
      if (confusables.length && ry < height - pad * 2.4) {
        section('易混词', colX, ry);
        ry += unit * 0.1;
        ctx.font = `500 ${unit * 0.058}px ${MONO}`;
        ctx.fillStyle = ink;
        ctx.fillText(fitLine(ctx, [...new Set(confusables.map(([other]) => other))].join(' · '), rightW), colX, ry);
        ry += unit * 0.085;
      }

      if (detail?.m && ry < height - pad * 2) {
        section('记忆法', colX, ry);
        ry += unit * 0.1;
        /* only the lines that end above the footer — a blind 3-line block would
           run through the bottom edge */
        const leading = unit * 0.075;
        const fits = Math.max(1, Math.min(3, Math.floor((height - pad * 1.35 - ry) / leading) + 1));
        paragraph(detail.m, colX, ry, rightW, `500 ${unit * 0.054}px ${FONT}`, muted, leading, fits);
      }

      if (!defs.length && !example && !phrases.length && !rels.length && !confusables.length && !detail?.m) {
        ctx.font = `500 ${unit * 0.06}px ${FONT}`;
        ctx.fillStyle = muted;
        ctx.fillText('这个词暂无更多数据', pad, height / 2);
      }

      ctx.font = `600 ${unit * 0.045}px ${MONO}`;
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.fillText('TAP TO FLIP BACK', width - pad, height - pad * 0.72);
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
  /** hang the badge in landscape (2.25:1) instead of portrait */
  landscape?: boolean;
  /** mastery state of the word, 0 = none, 2 = known */
  knownState?: number;
  /** toggle the mastery state */
  onKnown?: () => void;
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
  fill = false,
  landscape = false,
  knownState = 0,
  onKnown
}: WordCardProps) => {
  /* which side of the flat card is up; the badge turns itself */
  const [open, setOpen] = useState(false);
  const level = word?.level ?? 1;

  const frontPainter = useFrontPainter({ word, detail, level, accent, theme });
  const backPainter = useBackPainter({ word, detail, level, accent, theme });

  const finger = word ? fingerForChar(word.word[0] ?? '') : null;
  const wordKey = word ? `${word.book}:${word.word}` : '';

  /* a new word comes up face first — the back of the last one is never the
     first thing shown for the next */
  useEffect(() => setOpen(false), [wordKey]);

  if (flat) {
    const related = uniqByWord(detail?.r?.flatMap(group => group[1]) ?? []).slice(0, 5);
    const example = detail?.s?.[0];

    return (
      <div className={`word-card${fill ? ' word-card--fill' : ''}`}>
        <FlipCard
          className="word-card__flip"
          disabled={!word}
          flipped={open}
          onFlipChange={setOpen}
          front={
            <div className="word-card__face">
              <div className="word-card__face-body">
                {word ? (
                  <>
                    <div className="word-card__panel-head">
                      <span className="word-card__word">{word.word}</span>
                      <span className="word-card__phonetic">/{word.us || word.uk}/</span>
                    </div>
                    <p className="word-card__meaning">{word.cn}</p>
                    {related.length > 0 && (
                      <WarmTooltipGroup delay={280} warmWindow={220}>
                        <div className="row wrap" style={{ gap: 6, marginTop: 'var(--s3)' }}>
                          {related.map(([w, cn], index) => (
                            <WarmTooltip key={`${w}-${index}`} content={cn} side="top" size="sm">
                              <span className="chip">{w}</span>
                            </WarmTooltip>
                          ))}
                        </div>
                      </WarmTooltipGroup>
                    )}
                    {example && (
                      <div className="word-card__example">
                        <span className="mono">{example[0]}</span>
                        <span className="muted">{example[1]}</span>
                      </div>
                    )}
                    <p className="word-card__flip-hint">点击卡片查看详解</p>
                  </>
                ) : (
                  <p className="muted">{placeholder ?? '开始一次练习，单词卡会在这里出现'}</p>
                )}
              </div>
            </div>
          }
          back={
            <div className="word-card__face">
              <div className="word-card__face-body">
                {word && detail ? (
                  <>
                    {/* the headword rides along, so the back reads on its own */}
                    <div className="word-card__panel-head">
                      <span className="word-card__word">{word.word}</span>
                      <span className="word-card__phonetic">/{word.us || word.uk}/</span>
                    </div>
                    <WordDetail word={word} detail={detail} />
                  </>
                ) : (
                  <p className="muted">这个词还没有详解数据。</p>
                )}
              </div>
            </div>
          }
        />

        {word && (
          <div className="word-card__bar">
            <div className="row wrap" style={{ gap: 'var(--s2)' }}>
              <span className="chip">{LEVEL_NAME[level] ?? '词汇'}</span>
              {word.pos && <span className="chip">{word.pos}</span>}
              {finger && <span className="chip">{FINGER_LABEL[finger]}</span>}
            </div>
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <button type="button" className="btn btn-sm" onClick={() => setOpen(value => !value)} aria-pressed={open}>
                {open ? '返回' : '查看详解'}
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
            cardColor={theme === 'dark' ? '#23262e' : '#ffffff'}
            orientation={landscape ? 'landscape' : 'portrait'}
            finish="matte"
            cornerRadius={0.34}
            size={landscape ? 0.95 : 0.8}
            anchor="center"
            strapLength={0.15}
            strapColor="#3a4050"
            strapWidth={0.62}
            metal="silver"
            gravity={1}
            damping={0.55}
            elasticity={0.5}
            breeze={0.22}
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
            {onKnown && (
              <button
                type="button"
                className={`btn btn-sm ${knownState === 2 ? 'btn-primary' : ''}`}
                onClick={onKnown}
                aria-pressed={knownState === 2}
              >
                {knownState === 2 ? '取消掌握' : '标记掌握'}
              </button>
            )}
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
    </div>
  );
};

export const WordDetail = ({ word, detail }: { word: Word; detail: Detail }) => (
  <WarmTooltipGroup delay={280} warmWindow={220}>
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
            {uniqByWord(detail.k).map(([other, cn], index) => (
              <WarmTooltip key={`${other}-${index}`} content={cn} side="top" size="sm">
                <span className="chip">{other}</span>
              </WarmTooltip>
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
            {detail.r.map(([pos, words], groupIndex) => (
              <div key={`${pos || 'rel'}-${groupIndex}`}>
                {pos && <span className="tag-pos">{pos}</span>}
                <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                  {uniqByWord(words).map(([w, cn], index) => (
                    <WarmTooltip key={`${w}-${index}`} content={cn} side="top" size="sm">
                      <span className="chip">{w}</span>
                    </WarmTooltip>
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
                    {uniqByWord(words.map(w => [w, tran] as [string, string])).map(([w], wordIndex) => (
                      <span className="chip" key={`${w}-${wordIndex}`}>
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
  </WarmTooltipGroup>
);

export default WordCard;
