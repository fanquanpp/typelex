# TypeLex

**Type English and Japanese vocabulary into muscle memory on a simulated keyboard.**

TypeLex fuses "typing practice" and "vocabulary drilling" into one activity: you type each word on a
simulated keyboard rendered in its real layout, while the card beside it shows the part of speech,
definitions, example sentences, word family and confusable words. Words you miss get scheduled back
into your review queue sooner.

Pure front end — no backend, no account. All progress lives in your browser's local storage.

**Live:** https://fanquanpp.github.io/typelex/
**Source:** https://github.com/fanquanpp/typelex
**中文:** [README.md](README.md)

---

## Contents

- [The problem](#the-problem)
- [Features](#features)
- [Pages](#pages)
- [Vocabulary data](#vocabulary-data)
- [The keyboard](#the-keyboard)
- [Stack](#stack)
- [Getting started](#getting-started)
- [Regenerating the vocabulary data](#regenerating-the-vocabulary-data)
- [Project layout](#project-layout)
- [How the typing engine scores](#how-the-typing-engine-scores)
- [Accessibility](#accessibility)
- [License & credits](#license--credits)

---

## The problem

Most typing sites have you type random letters or random articles and you remember none of it; most
vocabulary apps have you tap multiple-choice options and your fingers never actually spell the word.
And spelling is the hard part of memory.

TypeLex's answer: **to remember a word, type it out in full.** Every second of typing practice serves
vocabulary, and every review session trains your fingers.

## Features

**Seven practice modes**

| Mode | What it does |
| --- | --- |
| Random | Draws random words from the selected books — broadest coverage |
| Sequential | Walks the list alphabetically; progress is resumable |
| Focused | Drills one category at a time: adjectives, prepositions, irregular verbs, confusables… |
| Sentences | Types full exam-style example sentences — rhythm, punctuation, Shift |
| Weak keys | Builds word lists from your per-key speed and error rate to drill lagging letters |
| Review (SRS) | Only due cards; correct answers stretch the interval, misses shorten it |
| Japanese rōmaji | Type Japanese words in rōmaji — kana, kanji, rōmaji and the Chinese gloss shown together |

**The word card is more than "word + definition"**

The English card is a physical ID badge hanging from a swinging lanyard (front and back): phonetics
(UK/US), part of speech, Chinese and English definitions, example sentences with translations, common
phrases, the **word-family group** (happy → happily → happiness), synonym groups, confusable words, a
mnemonic (root analysis or association), and real CET exam excerpts.

Japanese cards show kana, kanji, rōmaji and the Chinese gloss.

**Also**

- **Simulated keyboard**: 3 presets (slim office / 87-key TKL / 60% custom) × 6 layouts, 4 camera views
- **Per-key data**: dwell time and error rate per key drive the heatmap and the weak-key drill
- **Finger colouring**: keycaps coloured by the finger that owns them, standard touch-typing zoning
- **Live feedback**: the next key pulses, misses flash red, hits sink
- **Whole word visible as ghosts**: every letter still to come sits in its slot in a faint tone and lights up as you hit it
- **Advance mode**: choose "auto" or "Enter" in settings — auto moves straight on, Enter parks on the finished word so you can read it back first
- **Backlight modes**: off / reactive / weak-key highlighting, previewable in the keyboard lab
- **English phonetics chart**: 48 phonemes grouped by vowels, voiceless and voiced consonants, each row pairing the symbol, an example word and its common letter patterns, with British/American symbols
- **Dark & light themes**, initialised from your system preference
- **Persistent progress**: reload and you are back where you were, including an unfinished queue
- **Synthesised key sounds**: Web Audio at runtime — linear / tactile / clicky / laptop voices, no audio files

## Pages

Fourteen routes, all inside a single-screen app shell (HashRouter, so any route survives a reload):

| Route | Page |
| --- | --- |
| `/` | Home: live keyboard, vocabulary orbit cards, entry points |
| `/practice` | Practice setup: mode, books, length |
| `/practice/session` | The session: typing area, word card, live metrics |
| `/study` | Spaced-repetition review cards |
| `/wordbook` | Browse and search the corpus; lanyard badge detail on the right |
| `/wordbook/phonetics` | English phonetics chart: 48 phonemes paired with example words, British/American switch |
| `/keyboard` | Keyboard lab: presets, layouts, views, backlight, test typing |
| `/japanese` | Japanese track: the practice launcher (level picker + live config) over the N5–N1 level directory |
| `/japanese/kana` | Kana chart generated from the same converter the engine grades against |
| `/japanese/words` | JLPT word list: browse and search by level — a pure reference page |
| `/stats` | Study stats overview |
| `/stats/keys` | Per-key analysis: speed and error heatmaps |
| `/stats/history` | Practice history |
| `/settings` | Preferences |

Practice entry points live on the feature pages only: every Japanese session starts from `/japanese`,
and the word list and kana chart are pure lookups with no "start practising" button attached; the
English phonetics chart is a lookup as well.

Every page is the full width of the stage, matching the wordbook; readable line length is handled by
`ch` caps on the text blocks themselves (`.page-head` 74ch, `.page-sub` 66ch, `.lede` 62ch) rather
than by a 1320px column cap on the container.

## Vocabulary data

Everything is prepared at build time into incrementally loaded static files and fetched on demand.

### English · 9,482 words

| Book | Words | Examples | Word family | Exam excerpts | Mnemonics | Phrases |
| --- | --- | --- | --- | --- | --- | --- |
| High school | 3,665 | 3,040 | 2,825 | — | 958 | 3,126 |
| CET-4 | 3,739 | 3,138 | 3,065 | 2,193 | 1,494 | 3,181 |
| CET-6 | 2,078 | 1,723 | 1,676 | 741 | 704 | 1,522 |

### Japanese · 7,032 words (JLPT N5–N1)

| Level | Words | Gloss |
| --- | --- | --- |
| N5 | 662 | Chinese (hand-curated, 100%) |
| N4 | 605 | Chinese (hand-curated, 100%) |
| N3 | 1,680 | Chinese (hand-curated, 100%) |
| N2 | 1,581 | Chinese (hand-curated, 100%) |
| N1 | 2,504 | Chinese (hand-curated, 100%) |

Rōmaji is derived from the kana reading and handles sokuon (がっこう → `gakkou`), moraic n
(しんぶん → `shinbun`) and yōon (きょう → `kyou`); both Hepburn and Kunrei spellings are accepted
while typing.

### Focused categories (13)

Core words (high school ∩ CET-4), adjectives, verbs, adverbs, prepositions, conjunctions, pronouns,
irregular verbs (144 hand-curated entries), long words, short bursts, phrase pairs, confusables, word
families, words with mnemonics.

> Sources, curation and licensing are documented in [ATTRIBUTION.md](ATTRIBUTION.md).
> The upstream word lists are **not** MIT-licensed along with the app code — read that file before
> redistributing a build.
> Known data corner cases and the correction log (including upstream word-list issues) are in
> [ERRATA.md](ERRATA.md).

## The keyboard

The keyboard renders in DOM/CSS — no WebGL involved: one set of ANSI-unit layout data (1u = 19.05mm)
becomes absolutely-positioned keycaps shown with a shallow tilt (`preserve-3d`) and pointer parallax.
Key animations write inline styles directly, bypassing React state, so a keystroke costs zero re-renders.

| Preset | Layout | Keycaps | Backlight |
| --- | --- | --- | --- |
| Slim office keyboard | 104-key full size | Low-profile chiclet | none |
| 87-key mechanical | 87-key TKL | Cherry profile | white |
| 60% custom | 60-key | Cherry profile | none |

- Six layout definitions: 104 / 98 / 87 / 75 / 65 / 60%, with 0.5u / 0.25u / 0.5u row stagger,
  Backspace 2u, Tab 1.5u, Caps 1.75u, Enter 2.25u, left Shift 2.25u, right Shift 2.75u, Space 6.25u
- Keycap sculpt defined per row for OEM / Cherry / chiclet / low-profile families
- Four camera views (angled / top / front / close), switchable in the keyboard lab
- Three backlight states: off / reactive (lights while typing) / weak-key (uses your own error data)

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Three.js** — only for the lanyard badge card on the wordbook page
- **Zustand** — state and localStorage persistence
- **React Router** — HashRouter, so any route survives a reload
- **motion** — spring animation for a few interactive components (nav capsule, rubber segment)
- No UI kit, no CSS framework: the design system is hand-written CSS custom properties
- Everything is custom-drawn: dropdowns use `GlideSelect` (no native `<select>` left) and the icon
  buttons' hints use `WarmTooltip` (native `title` attributes are gone)
- Self-hosted fonts (`@fontsource-variable`: Sora / Manrope / JetBrains Mono); Chinese falls back to
  the system font stack

### Type and legibility

The type scale starts at **12px** (`--text-2xs`) because this is a Chinese-first interface: below
12px, CJK glyphs lose their counters on Microsoft YaHei and on macOS alike. Sizes are defined once,
in the token file — components no longer hard-code pixels:

- Scale: 12 / 13 / 14 / 15 / 17 / 19 / 24 / 32px, with display sizes scaled by `clamp()`
- **Two page-title sizes, and no more**: feature pages are all 32px (matching the wordbook), and
  third-level pages (session / kana chart / word list / per-key analysis / history) step down to
  24px. The home headline is a hero, not a page title
- **Spacing**: 40px between page sections, 32px between the cards inside one, 24px from a heading
  to its content
- Large Chinese headings use a shallow negative tracking (`-0.02em`): square CJK glyphs crowd into
  each other well before Latin letters do
- Micro labels (eyebrows, table headers, stat labels) are one size — 12px, weight 600–650,
  letter-spacing 0.04em. When the Latin face has no glyph, Chinese falls through to the system CJK
  face, and the wider tracking used to break a label apart into loose characters
- The faintest ink tier (`--ink-ghost`) clears 4.7:1 against the dark background (4.3:1 in light) —
  no more grey that reads as a smudge
- Keycap legends scale with the cap (`clamp(8px, --kb-unit × 0.23, 11px)`) instead of a fixed 9px

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # type-check + production build to dist/
npm run preview    # preview the build
```

No environment variables, no backend. The vocabulary data under `public/data` ships with the repo.

> The build output is fully static — deploy to GitHub Pages / Netlify / any static host.
> Routing is hash-based, so no server rewrite rules are needed.
> Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to
> https://fanquanpp.github.io/typelex/ .

## Regenerating the vocabulary data

The repository already contains the built data; this is only needed to rebuild from upstream:

```bash
node scripts/fetch-raw.mjs       # download upstream data into raw/ (needs gh CLI and unzip)
node scripts/build-data.mjs      # build public/data/vocab/* and categories.json
node scripts/build-japanese.mjs  # build public/data/japanese.json
```

`fetch-raw.mjs` needs `gh auth login` (the English book archives exceed jsDelivr's per-file limit).
The Japanese CSVs come straight from jsDelivr and need no auth.

Chinese glosses live in `scripts/curated/jp-zh.json` (hand-curated; all 7,032 words across N5–N1),
keyed by kana reading. The build normalises keys on both sides, so alternative readings such as
`いい; よい` resolve to the same entry.

The data is split so the first screen never loads a large file:

- `<book>.index.json` — compact rows (~150–280 KB), loaded once per page entry
- `<book>.detail.<n>.json` — full entries, sharded every 400 words (~400 KB), on demand
- `<book>.sentences.json` — the sentence practice pool

## Project layout

```
scripts/                  data pipeline
  fetch-raw.mjs           downloads upstream data
  build-data.mjs          English corpus → public/data
  build-japanese.mjs      Japanese corpus → public/data
  curated/                hand-curated data
    irregular-verbs.json    144 irregular verbs
    jp-zh.json              all N5–N1 Chinese glosses (keyed by kana)
src/
  lib/
    typing/
      fingers.ts            standard finger zoning (by KeyboardEvent.code)
      metrics.ts            WPM / accuracy / consistency / XP curve
      session.ts            practice queue generation (weak-key selection)
      syllables.ts          kana syllable splitting for rōmaji grading
      useTypingSession.ts   the typing engine (capture, metrics, timing)
    romaji.ts               kana → rōmaji (sokuon, moraic n, yōon; Hepburn/Kunrei)
    srs.ts                  spaced-repetition scheduler
    audio.ts                Web Audio key sounds (linear/tactile/clicky/laptop)
    store.ts                Zustand state + persistence
    vocab.ts                vocabulary data access layer
  three/keyboard/
    layouts.ts              6 ANSI-unit layout definitions
    models.ts               3 keyboard presets + keycap sculpt families
    view.ts                 view preset types
    CssKeyboardScene.ts     CSS/DOM keyboard scene (shallow tilt + pointer parallax)
  components/               PillNav, AnimatedList, OrbitCards, Lanyard,
                            RubberSegment, WakeSlider, ambient effect layers, …
  pages/                    14 routes (incl. english/, japanese/ and stats/ subpages)
```

## How the typing engine scores

Metrics follow mainstream typing tools so numbers are comparable:

- **WPM** = (characters ÷ 5) ÷ minutes
- **Net WPM** counts only perfectly typed words; **raw WPM** counts every character struck
- **Accuracy** is per keystroke — fixing a mistake does not erase the miss
- **Consistency** = `100 × (1 − tanh(σ/μ + (σ/μ)³/3 + (σ/μ)⁵/5))` — steadier pace, higher score
- **XP curve** is reversible per level: level N needs `49 × (N − 1) + 100`

Weak-key selection borrows from adaptive practice: each key keeps an exponentially-smoothed dwell
time (α = 0.1) and error rate, and candidate words are scored by the dwell times of the letters they
contain.

Key capture uses `keydown`, not `input`: this is a physical-keyboard trainer that needs `event.code`
to drive the keyboard highlight and finger zoning. Tab / Space / quote / slash and friends are
intercepted, and the engine steps aside when focus is inside a form control.

## Accessibility

- Honours `prefers-reduced-motion` globally: animations and the 3D idle stop
- Every interactive element is keyboard-focusable with a visible focus ring
- The typing area exposes its full text to screen readers (per-character spans are `aria-hidden`)
- Colour is never the only signal: correct / wrong also differ by underline and background

## License & credits

Application code is **MIT**, see [LICENSE](LICENSE).

**The vocabulary data is not MIT** — it comes from public datasets with their own terms. Read
[ATTRIBUTION.md](ATTRIBUTION.md) before redistributing a build. In short: the code is MIT, the word
lists are not.

Several interface components are adapted from
[react-bits](https://github.com/DavidHDev/react-bits) (MIT + Commons Clause); the original authors are
credited in the source headers and in the attribution file.
