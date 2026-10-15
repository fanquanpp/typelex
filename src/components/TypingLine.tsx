/**
 * The text the user is typing, rendered one character at a time.
 *
 * Three states plus a caret: pending (dim), correct, incorrect, and "extra"
 * (characters typed past the end of the target). The caret is a pseudo-element
 * on the current character so it glides with the text instead of being
 * absolutely positioned against a measured offset.
 */
import { memo } from 'react';

import './Keyboard.css';

export interface TypingLineProps {
  text: string;
  typed: string;
  /** render at sentence scale rather than word scale */
  sentence?: boolean;
  className?: string;
  /** highlight the whole line briefly on completion */
  complete?: boolean;
}

type CharState = 'pending' | 'correct' | 'incorrect' | 'extra';

const TypingLineBase = ({ text, typed, sentence = false, className = '', complete = false }: TypingLineProps) => {
  const target = Array.from(text);
  const input = Array.from(typed);

  return (
    <div
      className={`typing-line ${sentence ? 'typing-line--sentence' : ''} ${className}`.trim()}
      data-complete={complete ? 'true' : undefined}
      aria-live="off"
    >
      {target.map((char, index) => {
        const inputChar = input[index];
        let state: CharState = 'pending';
        if (inputChar !== undefined) state = inputChar === char ? 'correct' : 'incorrect';
        return (
          <span
            key={index}
            className="typing-char"
            data-state={state}
            data-cursor={index === input.length ? 'true' : undefined}
            aria-hidden="true"
          >
            {char === ' ' ? '\u00a0' : char}
          </span>
        );
      })}
      {/* characters typed beyond the target */}
      {input.slice(target.length).map((char, index) => (
        <span key={`extra-${index}`} className="typing-char" data-state="extra" aria-hidden="true">
          {char === ' ' ? '\u00a0' : char}
        </span>
      ))}
      {input.length >= target.length && (
        <span className="typing-char" data-state="pending" data-cursor="true" aria-hidden="true">
          {'\u00a0'}
        </span>
      )}
      <span className="sr-only">{text}</span>
    </div>
  );
};

export const TypingLine = memo(TypingLineBase);
export default TypingLine;
