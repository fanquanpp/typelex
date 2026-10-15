/**
 * Physical keyboard layouts, expressed in keyboard units (1u = 19.05 mm).
 *
 * Geometry follows the ANSI/ISO community layout definitions: row stagger is
 * 0.5u / 0.25u / 0.5u down the letter block, index columns sit at 1u pitch, and
 * every non-1u key carries its true width (1.25u Ctrl … 6.25u space). Codes are
 * `KeyboardEvent.code` values so key events map straight onto meshes.
 */
import type { Finger } from '../../lib/typing/fingers';

export interface KeyDef {
  /** KeyboardEvent.code */
  code: string;
  /** primary legend, '\n' separates a second line */
  label: string;
  /** x position in units (left edge) */
  x: number;
  /** y position in units (top edge) */
  y: number;
  /** width in units */
  w: number;
  /** height in units */
  h: number;
  /** row index for keycap profile sculpting: 0 = F-row … 5 = bottom */
  row: number;
  cluster: 'main' | 'nav' | 'numpad' | 'arrow' | 'func';
  finger?: Finger;
  /** true for the two homing keys with tactile bumps */
  homing?: boolean;
}

export interface LayoutDef {
  id: string;
  name: string;
  /** total keyfield width in units */
  width: number;
  /** total keyfield height in units */
  depth: number;
  keys: KeyDef[];
  /** key codes that read as "accent" keys on a real board */
  accent: string[];
}

const FINGER_BY_CODE: Record<string, Finger> = {
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

/* ------------------------------------------------------------------ */
/* spec -> KeyDef[]                                                    */
/* ------------------------------------------------------------------ */

interface Spec {
  code: string;
  label: string;
  w?: number;
  h?: number;
  /** explicit x, otherwise accumulated */
  x?: number;
  /** horizontal gap inserted before this key */
  gap?: number;
  cluster?: KeyDef['cluster'];
  homing?: boolean;
}

const letter = (char: string): Spec => ({
  code: `Key${char.toUpperCase()}`,
  label: char.toUpperCase()
});

const digit = (value: string, shift: string, code = `Digit${value}`): Spec => ({
  code,
  label: `${shift}\n${value}`
});

/** Letters A–Z of a contiguous run, e.g. run('qwertyuiop'). */
const run = (letters: string): Spec[] => letters.split('').map(letter);

const buildRows = (
  rows: { y: number; cluster?: KeyDef['cluster']; keys: Spec[] }[]
): KeyDef[] => {
  const out: KeyDef[] = [];
  rows.forEach((row, rowIndex) => {
    let cursor = 0;
    for (const spec of row.keys) {
      if (spec.gap) cursor += spec.gap;
      const x = spec.x ?? cursor;
      const w = spec.w ?? 1;
      const h = spec.h ?? 1;
      out.push({
        code: spec.code,
        label: spec.label,
        x,
        y: row.y,
        w,
        h,
        row: rowIndex,
        cluster: spec.cluster ?? row.cluster ?? 'main',
        finger: FINGER_BY_CODE[spec.code],
        homing: spec.homing
      });
      cursor = x + w;
    }
  });
  return out;
};

/* ------------------------------------------------------------------ */
/* shared fragments                                                    */
/* ------------------------------------------------------------------ */

const NUM_ROW = [
  { code: 'Backquote', label: '~\n`' },
  digit('1', '!'),
  digit('2', '@'),
  digit('3', '#'),
  digit('4', '$'),
  digit('5', '%'),
  digit('6', '^'),
  digit('7', '&'),
  digit('8', '*'),
  digit('9', '('),
  digit('0', ')'),
  { code: 'Minus', label: '_\n-' },
  { code: 'Equal', label: '+\n=' }
];

const QWERTY_ROW = [
  ...run('qwertyuiop'),
  { code: 'BracketLeft', label: '{\n[' },
  { code: 'BracketRight', label: '}\n]' }
];

const HOME_ROW = [
  ...run('asdfghjkl'),
  { code: 'Semicolon', label: ':\n;' },
  { code: 'Quote', label: '"\n\'' }
];

const BOTTOM_ROW = [
  ...run('zxcvbnm'),
  { code: 'Comma', label: '<\n,' },
  { code: 'Period', label: '>\n.' },
  { code: 'Slash', label: '?\n/' }
];

const arrowCluster = (x: number): Spec[] => [
  { code: 'ArrowUp', label: '↑', x: x + 1, cluster: 'arrow' },
  { code: 'ArrowLeft', label: '←', x, cluster: 'arrow' },
  { code: 'ArrowDown', label: '↓', x: x + 1, cluster: 'arrow' },
  { code: 'ArrowRight', label: '→', x: x + 2, cluster: 'arrow' }
];

const navCluster = (x: number): Spec[] => [
  { code: 'Insert', label: 'Ins', x, cluster: 'nav' },
  { code: 'Home', label: 'Home', x: x + 1, cluster: 'nav' },
  { code: 'PageUp', label: 'PgUp', x: x + 2, cluster: 'nav' },
  { code: 'Delete', label: 'Del', x, cluster: 'nav' },
  { code: 'End', label: 'End', x: x + 1, cluster: 'nav' },
  { code: 'PageDown', label: 'PgDn', x: x + 2, cluster: 'nav' }
];

const NUMPAD_NUM = (x: number): Spec[] => [
  { code: 'NumpadDivide', label: '/', x, cluster: 'numpad' },
  { code: 'NumpadMultiply', label: '*', x: x + 1, cluster: 'numpad' },
  { code: 'NumpadSubtract', label: '-', x: x + 2, cluster: 'numpad' }
];

const NUMPAD_789 = (x: number): Spec[] => [
  { code: 'Numpad7', label: '7', x, cluster: 'numpad' },
  { code: 'Numpad8', label: '8', x: x + 1, cluster: 'numpad' },
  { code: 'Numpad9', label: '9', x: x + 2, cluster: 'numpad' }
];

const NUMPAD_456 = (x: number): Spec[] => [
  { code: 'Numpad4', label: '4', x, cluster: 'numpad' },
  { code: 'Numpad5', label: '5', x: x + 1, cluster: 'numpad' },
  { code: 'Numpad6', label: '6', x: x + 2, cluster: 'numpad' }
];

const NUMPAD_123 = (x: number): Spec[] => [
  { code: 'Numpad1', label: '1', x, cluster: 'numpad' },
  { code: 'Numpad2', label: '2', x: x + 1, cluster: 'numpad' },
  { code: 'Numpad3', label: '3', x: x + 2, cluster: 'numpad' }
];

const NUMPAD_BOTTOM = (x: number): Spec[] => [
  { code: 'Numpad0', label: '0', x, w: 2, cluster: 'numpad' },
  { code: 'NumpadDecimal', label: '.', x: x + 2, cluster: 'numpad' }
];

const MOD_ROW_LEFT = (): Spec[] => [
  { code: 'ControlLeft', label: 'Ctrl', w: 1.25 },
  { code: 'MetaLeft', label: 'Win', w: 1.25 },
  { code: 'AltLeft', label: 'Alt', w: 1.25 }
];

const MOD_ROW_RIGHT = (spaceEnd: number): Spec[] => [
  { code: 'AltRight', label: 'Alt', x: spaceEnd, w: 1.25 },
  { code: 'MetaRight', label: 'Win', x: spaceEnd + 1.25, w: 1.25 },
  { code: 'ContextMenu', label: 'Menu', x: spaceEnd + 2.5, w: 1.25 },
  { code: 'ControlRight', label: 'Ctrl', x: spaceEnd + 3.75, w: 1.25 }
];

/* ------------------------------------------------------------------ */
/* 100% — 104 keys                                                     */
/* ------------------------------------------------------------------ */

const FULL_104: LayoutDef = (() => {
  const keys = buildRows([
    {
      y: 0,
      cluster: 'func',
      keys: [
        { code: 'Escape', label: 'Esc' },
        { code: 'F1', label: 'F1', x: 2 },
        { code: 'F2', label: 'F2', x: 3 },
        { code: 'F3', label: 'F3', x: 4 },
        { code: 'F4', label: 'F4', x: 5 },
        { code: 'F5', label: 'F5', x: 6.5 },
        { code: 'F6', label: 'F6', x: 7.5 },
        { code: 'F7', label: 'F7', x: 8.5 },
        { code: 'F8', label: 'F8', x: 9.5 },
        { code: 'F9', label: 'F9', x: 11 },
        { code: 'F10', label: 'F10', x: 12 },
        { code: 'F11', label: 'F11', x: 13 },
        { code: 'F12', label: 'F12', x: 14 },
        { code: 'PrintScreen', label: 'PrtSc', x: 15.25, cluster: 'nav' },
        { code: 'ScrollLock', label: 'ScrLk', x: 16.25, cluster: 'nav' },
        { code: 'Pause', label: 'Pause', x: 17.25, cluster: 'nav' }
      ]
    },
    {
      y: 1,
      keys: [
        ...NUM_ROW,
        { code: 'Backspace', label: 'Backspace', x: 13, w: 2 },
        ...navCluster(15.25).slice(0, 3),
        { code: 'NumLock', label: 'Num', x: 18.5, cluster: 'numpad' },
        ...NUMPAD_NUM(19.5)
      ]
    },
    {
      y: 2,
      keys: [
        { code: 'Tab', label: 'Tab', w: 1.5 },
        ...QWERTY_ROW,
        { code: 'Backslash', label: '|\n\\', x: 13.5, w: 1.5 },
        ...navCluster(15.25).slice(3, 6),
        ...NUMPAD_789(18.5),
        { code: 'NumpadAdd', label: '+', x: 21.5, h: 2, cluster: 'numpad' }
      ]
    },
    {
      y: 3,
      keys: [
        { code: 'CapsLock', label: 'Caps', w: 1.75 },
        ...HOME_ROW,
        { code: 'Enter', label: 'Enter', x: 12.75, w: 2.25 },
        ...NUMPAD_456(18.5)
      ]
    },
    {
      y: 4,
      keys: [
        { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
        ...BOTTOM_ROW,
        { code: 'ShiftRight', label: 'Shift', x: 12.25, w: 2.75 },
        { code: 'ArrowUp', label: '↑', x: 16.25, cluster: 'arrow' },
        ...NUMPAD_123(18.5),
        { code: 'NumpadEnter', label: 'Enter', x: 21.5, h: 2, cluster: 'numpad' }
      ]
    },
    {
      y: 5,
      keys: [
        ...MOD_ROW_LEFT(),
        { code: 'Space', label: '', x: 3.75, w: 6.25 },
        ...MOD_ROW_RIGHT(10),
        ...arrowCluster(15.25).slice(1),
        ...NUMPAD_BOTTOM(18.5)
      ]
    }
  ]);
  return {
    id: 'full104',
    name: '104 键全尺寸',
    width: 22.5,
    depth: 6,
    keys,
    accent: ['Escape', 'Enter', 'NumpadEnter', 'NumpadAdd']
  };
})();

/* ------------------------------------------------------------------ */
/* TKL — 87 keys                                                       */
/* ------------------------------------------------------------------ */

const TKL_87: LayoutDef = (() => {
  const keys = buildRows([
    {
      y: 0,
      cluster: 'func',
      keys: [
        { code: 'Escape', label: 'Esc' },
        { code: 'F1', label: 'F1', x: 2 },
        { code: 'F2', label: 'F2', x: 3 },
        { code: 'F3', label: 'F3', x: 4 },
        { code: 'F4', label: 'F4', x: 5 },
        { code: 'F5', label: 'F5', x: 6.5 },
        { code: 'F6', label: 'F6', x: 7.5 },
        { code: 'F7', label: 'F7', x: 8.5 },
        { code: 'F8', label: 'F8', x: 9.5 },
        { code: 'F9', label: 'F9', x: 11 },
        { code: 'F10', label: 'F10', x: 12 },
        { code: 'F11', label: 'F11', x: 13 },
        { code: 'F12', label: 'F12', x: 14 },
        { code: 'PrintScreen', label: 'PrtSc', x: 15.25, cluster: 'nav' },
        { code: 'ScrollLock', label: 'ScrLk', x: 16.25, cluster: 'nav' },
        { code: 'Pause', label: 'Pause', x: 17.25, cluster: 'nav' }
      ]
    },
    {
      y: 1,
      keys: [
        ...NUM_ROW,
        { code: 'Backspace', label: 'Backspace', x: 13, w: 2 },
        ...navCluster(15.25).slice(0, 3)
      ]
    },
    {
      y: 2,
      keys: [
        { code: 'Tab', label: 'Tab', w: 1.5 },
        ...QWERTY_ROW,
        { code: 'Backslash', label: '|\n\\', x: 13.5, w: 1.5 },
        ...navCluster(15.25).slice(3, 6)
      ]
    },
    {
      y: 3,
      keys: [
        { code: 'CapsLock', label: 'Caps', w: 1.75 },
        ...HOME_ROW,
        { code: 'Enter', label: 'Enter', x: 12.75, w: 2.25 }
      ]
    },
    {
      y: 4,
      keys: [
        { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
        ...BOTTOM_ROW,
        { code: 'ShiftRight', label: 'Shift', x: 12.25, w: 2.75 },
        { code: 'ArrowUp', label: '↑', x: 16.25, cluster: 'arrow' }
      ]
    },
    {
      y: 5,
      keys: [
        ...MOD_ROW_LEFT(),
        { code: 'Space', label: '', x: 3.75, w: 6.25 },
        ...MOD_ROW_RIGHT(10),
        ...arrowCluster(15.25).slice(1)
      ]
    }
  ]);
  return { id: 'tkl87', name: '87 键 TKL', width: 18.25, depth: 6, keys, accent: ['Escape', 'Enter'] };
})();

/* ------------------------------------------------------------------ */
/* 75% — 84 keys (full F-row, single nav column, arrows)                */
/* ------------------------------------------------------------------ */

const K75_84: LayoutDef = (() => {
  const keys = buildRows([
    {
      y: 0,
      cluster: 'func',
      keys: [
        { code: 'Escape', label: 'Esc' },
        { code: 'F1', label: 'F1', x: 1.25 },
        { code: 'F2', label: 'F2', x: 2.25 },
        { code: 'F3', label: 'F3', x: 3.25 },
        { code: 'F4', label: 'F4', x: 4.25 },
        { code: 'F5', label: 'F5', x: 5.5 },
        { code: 'F6', label: 'F6', x: 6.5 },
        { code: 'F7', label: 'F7', x: 7.5 },
        { code: 'F8', label: 'F8', x: 8.5 },
        { code: 'F9', label: 'F9', x: 9.75 },
        { code: 'F10', label: 'F10', x: 10.75 },
        { code: 'F11', label: 'F11', x: 11.75 },
        { code: 'F12', label: 'F12', x: 12.75 },
        { code: 'Delete', label: 'Del', x: 14, cluster: 'nav' }
      ]
    },
    {
      y: 1,
      keys: [
        ...NUM_ROW,
        { code: 'Backspace', label: 'Backspace', x: 13, w: 2 },
        { code: 'Home', label: 'Home', x: 14, cluster: 'nav' }
      ]
    },
    {
      y: 2,
      keys: [
        { code: 'Tab', label: 'Tab', w: 1.5 },
        ...QWERTY_ROW,
        { code: 'Backslash', label: '|\n\\', x: 13.5, w: 1.5 },
        { code: 'PageUp', label: 'PgUp', x: 14, cluster: 'nav' }
      ]
    },
    {
      y: 3,
      keys: [
        { code: 'CapsLock', label: 'Caps', w: 1.75 },
        ...HOME_ROW,
        { code: 'Enter', label: 'Enter', x: 12.75, w: 2.25 },
        { code: 'PageDown', label: 'PgDn', x: 14, cluster: 'nav' }
      ]
    },
    {
      y: 4,
      keys: [
        { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
        ...BOTTOM_ROW,
        { code: 'ShiftRight', label: 'Shift', x: 12.25, w: 1.75 },
        { code: 'ArrowUp', label: '↑', x: 14, cluster: 'arrow' }
      ]
    },
    {
      y: 5,
      keys: [
        ...MOD_ROW_LEFT(),
        { code: 'Space', label: '', x: 3.75, w: 6.25 },
        { code: 'AltRight', label: 'Alt', x: 10, w: 1.25 },
        { code: 'ControlRight', label: 'Ctrl', x: 11.25, w: 1.25 },
        { code: 'ArrowLeft', label: '←', x: 13, cluster: 'arrow' },
        { code: 'ArrowDown', label: '↓', x: 14, cluster: 'arrow' },
        { code: 'ArrowRight', label: '→', x: 15, cluster: 'arrow' }
      ]
    }
  ]);
  return { id: 'k75', name: '84 键 75%', width: 16, depth: 6, keys, accent: ['Escape', 'Enter'] };
})();

/* ------------------------------------------------------------------ */
/* 65% — 68 keys                                                       */
/* ------------------------------------------------------------------ */

const K65_68: LayoutDef = (() => {
  const keys = buildRows([
    {
      y: 0,
      keys: [
        { code: 'Backquote', label: '~\n`' },
        ...NUM_ROW.slice(1),
        { code: 'Backspace', label: 'Backspace', x: 13, w: 2 },
        { code: 'Delete', label: 'Del', x: 15, cluster: 'nav' }
      ]
    },
    {
      y: 1,
      keys: [
        { code: 'Tab', label: 'Tab', w: 1.5 },
        ...QWERTY_ROW,
        { code: 'Backslash', label: '|\n\\', x: 13.5, w: 1.5 },
        { code: 'PageUp', label: 'PgUp', x: 15, cluster: 'nav' }
      ]
    },
    {
      y: 2,
      keys: [
        { code: 'CapsLock', label: 'Caps', w: 1.75 },
        ...HOME_ROW,
        { code: 'Enter', label: 'Enter', x: 12.75, w: 2.25 },
        { code: 'PageDown', label: 'PgDn', x: 15, cluster: 'nav' }
      ]
    },
    {
      y: 3,
      keys: [
        { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
        ...BOTTOM_ROW,
        { code: 'ShiftRight', label: 'Shift', x: 12.25, w: 1.75 },
        { code: 'ArrowUp', label: '↑', x: 15, cluster: 'arrow' }
      ]
    },
    {
      y: 4,
      keys: [
        { code: 'ControlLeft', label: 'Ctrl', w: 1.25 },
        { code: 'MetaLeft', label: 'Win', w: 1.25 },
        { code: 'AltLeft', label: 'Alt', w: 1.25 },
        { code: 'Space', label: '', x: 3.75, w: 6.25 },
        { code: 'AltRight', label: 'Alt', x: 10, w: 1.25 },
        { code: 'MetaRight', label: 'Win', x: 11.25, w: 1.25 },
        { code: 'ControlRight', label: 'Ctrl', x: 12.5, w: 1.75 },
        { code: 'ArrowLeft', label: '←', x: 14, cluster: 'arrow' },
        { code: 'ArrowDown', label: '↓', x: 15, cluster: 'arrow' },
        { code: 'ArrowRight', label: '→', x: 16, cluster: 'arrow' }
      ]
    }
  ]);
  return { id: 'k65', name: '68 键 65%', width: 17, depth: 5, keys, accent: ['Escape', 'Enter'] };
})();

/* ------------------------------------------------------------------ */
/* 60% — 61 keys                                                       */
/* ------------------------------------------------------------------ */

const K60_61: LayoutDef = (() => {
  const keys = buildRows([
    {
      y: 0,
      keys: [
        { code: 'Backquote', label: 'Esc\n~' },
        ...NUM_ROW.slice(1),
        { code: 'Backspace', label: 'Backspace', x: 13, w: 2 }
      ]
    },
    {
      y: 1,
      keys: [
        { code: 'Tab', label: 'Tab', w: 1.5 },
        ...QWERTY_ROW,
        { code: 'Backslash', label: '|\n\\', x: 13.5, w: 1.5 }
      ]
    },
    {
      y: 2,
      keys: [
        { code: 'CapsLock', label: 'Caps', w: 1.75 },
        ...HOME_ROW,
        { code: 'Enter', label: 'Enter', x: 12.75, w: 2.25 }
      ]
    },
    {
      y: 3,
      keys: [
        { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
        ...BOTTOM_ROW,
        { code: 'ShiftRight', label: 'Shift', x: 12.25, w: 2.75 }
      ]
    },
    {
      y: 4,
      keys: [
        { code: 'ControlLeft', label: 'Ctrl', w: 1.25 },
        { code: 'MetaLeft', label: 'Win', w: 1.25 },
        { code: 'AltLeft', label: 'Alt', w: 1.25 },
        { code: 'Space', label: '', x: 3.75, w: 6.25 },
        { code: 'AltRight', label: 'Alt', x: 10, w: 1.25 },
        { code: 'MetaRight', label: 'Win', x: 11.25, w: 1.25 },
        { code: 'ContextMenu', label: 'Menu', x: 12.5, w: 1.25 },
        { code: 'ControlRight', label: 'Ctrl', x: 13.75, w: 1.25 }
      ]
    }
  ]);
  return { id: 'k60', name: '61 键 60%', width: 15, depth: 5, keys, accent: ['Backquote', 'Enter'] };
})();

/* ------------------------------------------------------------------ */
/* 98-key compact                                                      */
/* ------------------------------------------------------------------ */

const K98: LayoutDef = (() => {
  const keys = buildRows([
    {
      y: 0,
      cluster: 'func',
      keys: [
        { code: 'Escape', label: 'Esc' },
        { code: 'F1', label: 'F1', x: 1.5 },
        { code: 'F2', label: 'F2', x: 2.5 },
        { code: 'F3', label: 'F3', x: 3.5 },
        { code: 'F4', label: 'F4', x: 4.5 },
        { code: 'F5', label: 'F5', x: 5.75 },
        { code: 'F6', label: 'F6', x: 6.75 },
        { code: 'F7', label: 'F7', x: 7.75 },
        { code: 'F8', label: 'F8', x: 8.75 },
        { code: 'F9', label: 'F9', x: 10 },
        { code: 'F10', label: 'F10', x: 11 },
        { code: 'F11', label: 'F11', x: 12 },
        { code: 'F12', label: 'F12', x: 13 },
        { code: 'PrintScreen', label: 'PrtSc', x: 14.25, cluster: 'nav' },
        { code: 'Delete', label: 'Del', x: 15.25, cluster: 'nav' }
      ]
    },
    {
      y: 1,
      keys: [
        ...NUM_ROW,
        { code: 'Backspace', label: 'Backspace', x: 13, w: 2 },
        { code: 'Home', label: 'Home', x: 15.25, cluster: 'nav' },
        { code: 'NumLock', label: 'Num', x: 16.5, cluster: 'numpad' },
        ...NUMPAD_NUM(17.5)
      ]
    },
    {
      y: 2,
      keys: [
        { code: 'Tab', label: 'Tab', w: 1.5 },
        ...QWERTY_ROW,
        { code: 'Backslash', label: '|\n\\', x: 13.5, w: 1.5 },
        { code: 'PageUp', label: 'PgUp', x: 15.25, cluster: 'nav' },
        ...NUMPAD_789(16.5),
        { code: 'NumpadAdd', label: '+', x: 19.5, h: 2, cluster: 'numpad' }
      ]
    },
    {
      y: 3,
      keys: [
        { code: 'CapsLock', label: 'Caps', w: 1.75 },
        ...HOME_ROW,
        { code: 'Enter', label: 'Enter', x: 12.75, w: 2.25 },
        { code: 'PageDown', label: 'PgDn', x: 15.25, cluster: 'nav' },
        ...NUMPAD_456(16.5)
      ]
    },
    {
      y: 4,
      keys: [
        { code: 'ShiftLeft', label: 'Shift', w: 2.25 },
        ...BOTTOM_ROW,
        { code: 'ShiftRight', label: 'Shift', x: 12.25, w: 1.75 },
        { code: 'ArrowUp', label: '↑', x: 15.25, cluster: 'arrow' },
        ...NUMPAD_123(16.5),
        { code: 'NumpadEnter', label: 'Enter', x: 19.5, h: 2, cluster: 'numpad' }
      ]
    },
    {
      y: 5,
      keys: [
        ...MOD_ROW_LEFT(),
        { code: 'Space', label: '', x: 3.75, w: 6.25 },
        { code: 'AltRight', label: 'Alt', x: 10, w: 1.25 },
        { code: 'ControlRight', label: 'Ctrl', x: 11.25, w: 1.25 },
        { code: 'ArrowLeft', label: '←', x: 14.25, cluster: 'arrow' },
        { code: 'ArrowDown', label: '↓', x: 15.25, cluster: 'arrow' },
        { code: 'ArrowRight', label: '→', x: 16.25, cluster: 'arrow' },
        ...NUMPAD_BOTTOM(16.5)
      ]
    }
  ]);
  return { id: 'k98', name: '98 键紧凑', width: 20.5, depth: 6, keys, accent: ['Escape', 'Enter'] };
})();

/* ------------------------------------------------------------------ */
/* Laptop — 78-key chiclet (no numpad, half-height arrows, media row)   */
/* ------------------------------------------------------------------ */

const LAPTOP_78: LayoutDef = (() => {
  const keys = buildRows([
    {
      y: 0,
      cluster: 'func',
      keys: [
        { code: 'Escape', label: 'esc' },
        { code: 'F1', label: '☀', x: 1.5 },
        { code: 'F2', label: '☀−', x: 2.5 },
        { code: 'F3', label: '☀+', x: 3.5 },
        { code: 'F4', label: '⌨', x: 4.5 },
        { code: 'F5', label: '🔇', x: 5.5 },
        { code: 'F6', label: '🔉', x: 6.5 },
        { code: 'F7', label: '🔊', x: 7.5 },
        { code: 'F8', label: '⏏', x: 8.5 },
        { code: 'F9', label: '⏪', x: 9.5 },
        { code: 'F10', label: '⏯', x: 10.5 },
        { code: 'F11', label: '⏩', x: 11.5 },
        { code: 'F12', label: '✈', x: 12.5 }
      ]
    },
    {
      y: 1,
      keys: [
        ...NUM_ROW,
        { code: 'Backspace', label: '⌫', x: 13, w: 2 }
      ]
    },
    {
      y: 2,
      keys: [
        { code: 'Tab', label: '⇥', w: 1.5 },
        ...QWERTY_ROW,
        { code: 'Backslash', label: '\\', x: 13.5, w: 1.5 }
      ]
    },
    {
      y: 3,
      keys: [
        { code: 'CapsLock', label: '⇪', w: 1.75 },
        ...HOME_ROW,
        { code: 'Enter', label: '⏎', x: 12.75, w: 2.25 }
      ]
    },
    {
      y: 4,
      keys: [
        { code: 'ShiftLeft', label: '⇧', w: 2.25 },
        ...BOTTOM_ROW,
        { code: 'ShiftRight', label: '⇧', x: 12.25, w: 2.75 },
        { code: 'ArrowUp', label: '↑', x: 15.25, h: 0.5, cluster: 'arrow' }
      ]
    },
    {
      y: 4.5,
      keys: [{ code: 'ArrowDown', label: '↓', x: 15.25, h: 0.5, cluster: 'arrow' }]
    },
    {
      y: 5,
      keys: [
        { code: 'ControlLeft', label: 'ctrl', w: 1.25 },
        { code: 'MetaLeft', label: 'fn', w: 1.25 },
        { code: 'AltLeft', label: 'alt', w: 1.25 },
        { code: 'Space', label: '', x: 3.75, w: 6.25 },
        { code: 'AltRight', label: 'alt', x: 10, w: 1.25 },
        { code: 'MetaRight', label: '⌘', x: 11.25, w: 1.25 },
        { code: 'ControlRight', label: 'ctrl', x: 12.5, w: 1.25 },
        { code: 'ArrowLeft', label: '←', x: 13.75, h: 0.5, cluster: 'arrow' },
        { code: 'ArrowRight', label: '→', x: 14.75, h: 0.5, cluster: 'arrow' }
      ]
    }
  ]);
  return { id: 'laptop78', name: '78 键笔记本', width: 16.75, depth: 5.5, keys, accent: ['Escape'] };
})();

/* ------------------------------------------------------------------ */

export const LAYOUTS: Record<string, LayoutDef> = {
  full104: FULL_104,
  tkl87: TKL_87,
  k75: K75_84,
  k65: K65_68,
  k60: K60_61,
  k98: K98,
  laptop78: LAPTOP_78
};

export const getLayout = (id: string): LayoutDef => LAYOUTS[id] ?? LAYOUTS.full104;
