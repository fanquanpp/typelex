/* Shared JLPT level metadata for the Japanese page and the word list sub-page. */

export interface JpLevel {
  level: number;
  name: string;
  desc: string;
  note: string;
}

/**
 * `desc` is the one-word tier on the tile, `note` what the level actually
 * covers. The exact entry count is not repeated here — the tile prints it live
 * from the data, so it can never drift from what is on disk.
 */
export const LEVELS: JpLevel[] = [
  { level: 5, name: 'N5', desc: '入门', note: '最基本的日常词汇与寒暄' },
  { level: 4, name: 'N4', desc: '基础', note: '日常会话与基础读写' },
  { level: 3, name: 'N3', desc: '中级', note: '报纸标题与简单文章' },
  { level: 2, name: 'N2', desc: '进阶', note: '一般性文章与新闻' },
  { level: 1, name: 'N1', desc: '高级', note: '抽象论述与专业内容' }
];

/**
 * The level named by the URL, or N5 when it names no level at all — `?level=`
 * is user-editable, so an unknown value must not blank the list.
 */
export const levelFromParam = (raw: string | null) => {
  const value = Number(raw);
  return LEVELS.some(entry => entry.level === value) ? value : 5;
};
