# Attribution & data licensing

The MIT license in [LICENSE](LICENSE) covers the **application source code**.
It does **not** cover the vocabulary data under `public/data/`, which is derived
from third-party datasets with their own terms. This file records exactly what
came from where so you can make an informed decision before redistributing a
build.

**In short:** the code is MIT; the word lists are not. Sections 1–2 below are
the ones that matter before you publish a build.

---

## 1. English vocabulary (高中 / CET-4 / CET-6) — 9,482 entries

**Source.** The 百词斩 (Baicizhan) book exports redistributed in the GitHub
repository [`kajweb/dict`](https://github.com/kajweb/dict), specifically:

| Book archive | Rows | Becomes |
| --- | --- | --- |
| `1521164675301_GaoZhong_2.zip` | 3,668 | `public/data/vocab/highschool.*` |
| `1524052539052_CET4luan_2.zip` | 3,739 | `public/data/vocab/cet4.*` |
| `1524052554766_CET6_2.zip` | 2,078 | `public/data/vocab/cet6.*` |

**What we take.** Headword, UK/US phonetics, part-of-speech, Chinese and English
definitions, example sentences with Chinese translations, real-exam excerpts,
common phrases, synonym groups, related-word groups (同根词) and mnemonics.

**What we add.** Normalisation to typeable ASCII, sharding, near-neighbour
(易混词) detection, cross-book level tagging, sentence pools, and the derived
category definitions.

**License.** The `kajweb/dict` repository does not state a license for the book
data, and the original book content belongs to 百词斩 / its content providers.
Treat it as **study and personal-use material**. If you intend to redistribute
this data commercially, replace it with a dataset you have clear rights to —
the build pipeline only needs JSONL files in the shape described in
`scripts/build-data.mjs`.

---

## 2. Japanese vocabulary (JLPT N5–N1) — 7,032 entries

**Source.** [`jamsinclair/open-anki-jlpt-decks`](https://github.com/jamsinclair/open-anki-jlpt-decks),
MIT licensed (Copyright 2020 Jamie Sinclair). Files `src/n1.csv` … `src/n5.csv`.

The underlying word list and English glosses originate from
[Jonathan Waller's tanos.co.uk JLPT lists](https://www.tanos.co.uk/jlpt/), which
are distributed under **CC-BY**. Attribution to Jonathan Waller / tanos.co.uk is
required when redistributing that portion.

**What we add.** Hepburn rōmaji derived from the kana readings, and hand-written
Chinese glosses for **all 7,032 words across N5–N1** (662 / 605 / 1,680 / 1,581 /
2,504 entries by level) in `scripts/curated/jp-zh.json`. That curated file is
original work for this project and is covered by the MIT license above; the
upstream English gloss is kept alongside every entry in the built data.

The upstream decks hold 8,131 rows; entries whose reading is empty, is a grammar
pattern or contains Latin letters, repeats a reading already used at another
level, or does not reduce to ASCII rōmaji are dropped during the build. Known
data corner cases (multi-reading entries, kana-only words, the lenient rōmaji
grader) are documented in [ERRATA.md](ERRATA.md).

---

## 3. Curated tables

`scripts/curated/irregular-verbs.json` (144 irregular verbs with past tense,
past participle and Chinese gloss) is original work for this project, MIT.

---

## 4. Interface components adapted from react-bits

The components below are adapted from [react-bits](https://github.com/DavidHDev/react-bits)
by **David Haz** (and contributors where noted), licensed **MIT + Commons Clause**. The
Commons Clause permits using them inside an application but not selling or redistributing
them as a component library. They are used here inside an application, and every source
file carries the original attribution in its header.

| File | Original | Notes |
| --- | --- | --- |
| `src/components/AnimatedList.tsx`, `.css` | `AnimatedList` | Ported to TypeScript; virtualised scrolling and selection wired to this app's data |
| `src/components/Crosshair.tsx` | `Crosshair` | Full-screen canvas cursor lines with target lock |
| `src/components/CursorGrid.tsx` | `CursorGrid` | Interactive grid spotlight; simulation rewritten for this project |
| `src/components/LetterGlitch.tsx` | `LetterGlitch` | Canvas2D glyph field; lite configuration used as an ambient layer |
| `src/components/LineSidebar.tsx`, `.css` | `LineSidebar` | Proximity-reactive vertical nav in the app sidebar |
| `src/components/PillNav.tsx`, `.css` | `PillNav` | Top navigation capsule; Tailwind replaced with design-token CSS, wired to React Router |
| `src/components/RubberSegment.tsx`, `.css` | `RubberSegment` | String-follow segmented control; Tailwind replaced with plain CSS |
| `src/components/WakeSlider.tsx`, `.css` | `WakeSlider` | Velocity-reactive bar slider; Tailwind replaced with plain CSS |
| `src/components/TypingSlots.tsx`, `.css` | `CodeSlots` | Slot technique reused for the typed-character line |
| `src/components/FlipCard.tsx`, `.css` | `FlipCard` by David Haz | Card flip micro-interaction |
| `src/components/GlideSelect.tsx`, `.css` | `GlideSelect` | Dropdown with a gliding highlight pill. Tailwind replaced with design-token CSS, Hugeicons replaced with inline SVGs, and the menu is portalled with measured coordinates so an `overflow: hidden` ancestor cannot clip it. Replaces every native `<select>` in the app |
| `src/components/OrbitCards.tsx`, `.css` | `OrbitImages` by **Dominik Koch** ([@dominikkoch](https://x.com/dominikkoch)), curated by David Haz | Extended so items render arbitrary card content instead of only `<img>` |
| `src/components/Lanyard/Lanyard.tsx`, `.css` | `Lanyard` by David Haz | Ported to TypeScript and extended with canvas painter callbacks so the badge faces can be drawn from live word data |
| `src/components/WarmTooltip.tsx`, `.css` | `WarmTooltip` | Grouped tooltips that keep one label warm and glide it between triggers. Tailwind replaced with design-token CSS, sizes raised to the site's 12px floor, the group's velocity `lean` not ported. Drives the whole header action cluster instead of native `title` |

`src/components/effects.tsx` and `src/components/motion.tsx` are hand-written
implementations of effect techniques we wanted from react-bits; they contain no
ported code but follow the same ideas.

react-bits license text: MIT + Commons Clause License Condition v1.0,
Copyright (c) David Haz. Free for personal and commercial use as part of an
application, website or product.

---

## 5. Typefaces

Bundled from npm via `@fontsource-variable` under the **SIL Open Font License 1.1**:

- **Sora Variable** — Jonathan Barnbrook, Neil Panchal (display face)
- **Manrope Variable** — Mikhail Sharanda (UI face)
- **JetBrains Mono Variable** — JetBrains (monospace face)

Chinese text uses the **system CJK stack** (PingFang SC / Microsoft YaHei / Noto Sans CJK …) —
no webfont is downloaded for it. Earlier revisions listed Google-Fonts-hosted Inter and
Noto Sans JP; those are no longer used.

---

## 6. Reference material used while building (no code or data copied)

Keyboard geometry follows the community ANSI/ISO layout definitions from
[QMK](https://github.com/qmk/qmk_firmware/tree/master/layouts/default) and the
[Deskthority wiki](https://deskthority.net/wiki/Unit) (1u = 19.05 mm, row
stagger, keycap profile heights). Switch characteristics and lighting effect
names follow Cherry's public datasheets and the
[QMK RGB Matrix](https://docs.qmk.fm/features/rgb_matrix) documentation.
Typing metric definitions follow the published behaviour of
[Monkeytype](https://github.com/monkeytypegame/monkeytype) and
[keybr](https://github.com/aradzie/keybr.com). Product styling notes for the
keyboard models come from the manufacturers' own spec sheets.

No code was copied from any of these projects; they informed the geometry and
metric definitions only.
