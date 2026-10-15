/**
 * Standard US-QWERTY touch-typing finger assignment.
 *
 * Follows the ANSI-101 zone map used by mainstream tutors: each index finger
 * owns two columns, the pinkies own the outer columns plus Shift/Enter/Tab,
 * and the thumbs own the space bar. Characters map to a physical
 * `KeyboardEvent.code` so that punctuation requiring Shift still resolves to
 * the right key and finger.
 */

export type Finger =
  | 'l-pinky'
  | 'l-ring'
  | 'l-middle'
  | 'l-index'
  | 'r-index'
  | 'r-middle'
  | 'r-ring'
  | 'r-pinky'
  | 'thumb';

export const FINGERS: Finger[] = [
  'l-pinky',
  'l-ring',
  'l-middle',
  'l-index',
  'r-index',
  'r-middle',
  'r-ring',
  'r-pinky',
  'thumb'
];

export const FINGER_LABEL: Record<Finger, string> = {
  'l-pinky': '左手小指',
  'l-ring': '左手无名指',
  'l-middle': '左手中指',
  'l-index': '左手食指',
  'r-index': '右手食指',
  'r-middle': '右手中指',
  'r-ring': '右手无名指',
  'r-pinky': '右手小指',
  thumb: '拇指'
};

/** Distinct, colour-blind-safe-ish hues per finger, used for guidance overlays. */
export const FINGER_COLOR: Record<Finger, string> = {
  'l-pinky': '#e0647a',
  'l-ring': '#e08a4a',
  'l-middle': '#d9b23f',
  'l-index': '#5fb46a',
  'r-index': '#3fa8b8',
  'r-middle': '#5b8def',
  'r-ring': '#9a6bf0',
  'r-pinky': '#c0556f',
  thumb: '#8a8f9c'
};

const CODE_FINGER: Record<string, Finger> = {
  Backquote: 'l-pinky',
  Digit1: 'l-pinky',
  Digit2: 'l-ring',
  Digit3: 'l-middle',
  Digit4: 'l-index',
  Digit5: 'l-index',
  Digit6: 'r-index',
  Digit7: 'r-index',
  Digit8: 'r-middle',
  Digit9: 'r-ring',
  Digit0: 'r-pinky',
  Minus: 'r-pinky',
  Equal: 'r-pinky',
  Backspace: 'r-pinky',
  Tab: 'l-pinky',
  KeyQ: 'l-pinky',
  KeyW: 'l-ring',
  KeyE: 'l-middle',
  KeyR: 'l-index',
  KeyT: 'l-index',
  KeyY: 'r-index',
  KeyU: 'r-index',
  KeyI: 'r-middle',
  KeyO: 'r-ring',
  KeyP: 'r-pinky',
  BracketLeft: 'r-pinky',
  BracketRight: 'r-pinky',
  Backslash: 'r-pinky',
  CapsLock: 'l-pinky',
  KeyA: 'l-pinky',
  KeyS: 'l-ring',
  KeyD: 'l-middle',
  KeyF: 'l-index',
  KeyG: 'l-index',
  KeyH: 'r-index',
  KeyJ: 'r-index',
  KeyK: 'r-middle',
  KeyL: 'r-ring',
  Semicolon: 'r-pinky',
  Quote: 'r-pinky',
  Enter: 'r-pinky',
  ShiftLeft: 'l-pinky',
  KeyZ: 'l-pinky',
  KeyX: 'l-ring',
  KeyC: 'l-middle',
  KeyV: 'l-index',
  KeyB: 'l-index',
  KeyN: 'r-index',
  KeyM: 'r-index',
  Comma: 'r-middle',
  Period: 'r-ring',
  Slash: 'r-pinky',
  ShiftRight: 'r-pinky',
  Space: 'thumb'
};

/** character -> physical code, including shifted punctuation. */
const CHAR_CODE: Record<string, string> = {};
const addChar = (char: string, code: string) => {
  CHAR_CODE[char] = code;
};

for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
  addChar(letter, `Key${letter.toUpperCase()}`);
  addChar(letter.toUpperCase(), `Key${letter.toUpperCase()}`);
}
addChar('1', 'Digit1');
addChar('!', 'Digit1');
addChar('2', 'Digit2');
addChar('@', 'Digit2');
addChar('3', 'Digit3');
addChar('#', 'Digit3');
addChar('4', 'Digit4');
addChar('$', 'Digit4');
addChar('5', 'Digit5');
addChar('%', 'Digit5');
addChar('6', 'Digit6');
addChar('^', 'Digit6');
addChar('7', 'Digit7');
addChar('&', 'Digit7');
addChar('8', 'Digit8');
addChar('*', 'Digit8');
addChar('9', 'Digit9');
addChar('(', 'Digit9');
addChar('0', 'Digit0');
addChar(')', 'Digit0');
addChar('-', 'Minus');
addChar('_', 'Minus');
addChar('=', 'Equal');
addChar('+', 'Equal');
addChar('[', 'BracketLeft');
addChar('{', 'BracketLeft');
addChar(']', 'BracketRight');
addChar('}', 'BracketRight');
addChar('\\', 'Backslash');
addChar('|', 'Backslash');
addChar(';', 'Semicolon');
addChar(':', 'Semicolon');
addChar("'", 'Quote');
addChar('"', 'Quote');
addChar(',', 'Comma');
addChar('<', 'Comma');
addChar('.', 'Period');
addChar('>', 'Period');
addChar('/', 'Slash');
addChar('?', 'Slash');
addChar('`', 'Backquote');
addChar('~', 'Backquote');
addChar(' ', 'Space');

/** Characters that live on the upper (shifted) plane of their key. */
const SHIFTED = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ~!@#$%^&*()_+{}|:"<>?');

export const codeForChar = (char: string): string | null => CHAR_CODE[char] ?? null;

export const fingerForCode = (code: string): Finger | null => CODE_FINGER[code] ?? null;

export const fingerForChar = (char: string): Finger | null => {
  const code = CHAR_CODE[char];
  return code ? CODE_FINGER[code] ?? null : null;
};

export const needsShift = (char: string): boolean => SHIFTED.has(char);

/**
 * The opposite-hand Shift rule: hold the Shift key on the hand that is *not*
 * typing the letter. Returns null when no Shift is required.
 */
export const shiftHandFor = (char: string): 'left' | 'right' | null => {
  if (!needsShift(char)) return null;
  const finger = fingerForChar(char);
  if (!finger || finger === 'thumb') return null;
  return finger.startsWith('l-') ? 'right' : 'left';
};

export const isHomeKey = (char: string): boolean => 'asdfjkl;'.includes(char.toLowerCase());

export const HOME_KEYS = 'asdfghjkl;';
