/**
 * The English phoneme chart.
 *
 * Each entry carries the three things a learner needs to read the chart:
 * the IPA symbol itself, an example word with the letters that produce the
 * sound (`hi` is the exact substring to highlight), and the lower-case letter
 * patterns that usually spell it. Symbols follow the 48-phoneme convention
 * used in Chinese English teaching; `us` is filled only where American
 * dictionaries write the sound differently.
 */

export type PhoneticAccent = 'uk' | 'us';

export interface Phoneme {
  /** British (RP) symbol */
  uk: string;
  /** American (KK) symbol, when it differs */
  us?: string;
  /** example word */
  word: string;
  /** the part of `word` that produces this sound */
  hi: string;
  /** Chinese gloss of the example */
  cn: string;
  /** common lower-case letter patterns */
  spell: string;
}

/** 12 monophthongs + 8 diphthongs, in textbook order. */
export const VOWELS: Phoneme[] = [
  { uk: 'iː', us: 'i', word: 'see', hi: 'ee', cn: '看见', spell: 'ee · ea · ie · e' },
  { uk: 'ɪ', word: 'sit', hi: 'i', cn: '坐', spell: 'i · y · ui' },
  { uk: 'e', us: 'ɛ', word: 'bed', hi: 'e', cn: '床', spell: 'e · ea' },
  { uk: 'æ', word: 'cat', hi: 'a', cn: '猫', spell: 'a' },
  { uk: 'ɜː', us: 'ɝ', word: 'bird', hi: 'ir', cn: '鸟', spell: 'ir · ur · er · or' },
  { uk: 'ə', word: 'about', hi: 'a', cn: '关于', spell: 'a · er · o · ou' },
  { uk: 'ʌ', word: 'cup', hi: 'u', cn: '杯子', spell: 'u · o · ou' },
  { uk: 'uː', us: 'u', word: 'food', hi: 'oo', cn: '食物', spell: 'oo · u · ue · ew' },
  { uk: 'ʊ', word: 'book', hi: 'oo', cn: '书', spell: 'oo · u · ou' },
  { uk: 'ɔː', us: 'ɔ', word: 'door', hi: 'oor', cn: '门', spell: 'or · aw · oor · ough' },
  { uk: 'ɒ', us: 'ɑ', word: 'hot', hi: 'o', cn: '热的', spell: 'o · a · ou' },
  { uk: 'ɑː', us: 'ɑ', word: 'car', hi: 'ar', cn: '汽车', spell: 'ar · a · al' },
  { uk: 'eɪ', word: 'day', hi: 'ay', cn: '白天', spell: 'ay · ai · a_e · ea' },
  { uk: 'aɪ', word: 'time', hi: 'i', cn: '时间', spell: 'i_e · igh · y · ie' },
  { uk: 'ɔɪ', word: 'boy', hi: 'oy', cn: '男孩', spell: 'oi · oy' },
  { uk: 'aʊ', word: 'now', hi: 'ow', cn: '现在', spell: 'ow · ou' },
  { uk: 'əʊ', us: 'oʊ', word: 'go', hi: 'o', cn: '去', spell: 'o · oa · ow · oe' },
  { uk: 'ɪə', us: 'ɪr', word: 'near', hi: 'ear', cn: '近的', spell: 'ear · eer · ere' },
  { uk: 'eə', us: 'ɛr', word: 'hair', hi: 'air', cn: '头发', spell: 'air · are · ear' },
  { uk: 'ʊə', us: 'ʊr', word: 'tour', hi: 'our', cn: '旅行', spell: 'our · ure · oor' }
];

/** Voiceless consonants, listed in the same order as the voiced set. */
export const VOICELESS: Phoneme[] = [
  { uk: 'p', word: 'pen', hi: 'p', cn: '钢笔', spell: 'p · pp' },
  { uk: 't', word: 'ten', hi: 't', cn: '十', spell: 't · tt · ed' },
  { uk: 'k', word: 'key', hi: 'k', cn: '钥匙', spell: 'k · c · ck · ch' },
  { uk: 'f', word: 'five', hi: 'f', cn: '五', spell: 'f · ff · ph · gh' },
  { uk: 'θ', word: 'think', hi: 'th', cn: '想', spell: 'th' },
  { uk: 's', word: 'sun', hi: 's', cn: '太阳', spell: 's · ss · c · ce' },
  { uk: 'ʃ', word: 'ship', hi: 'sh', cn: '船', spell: 'sh · ch · ti · ci' },
  { uk: 'tʃ', word: 'chair', hi: 'ch', cn: '椅子', spell: 'ch · tch · t' },
  { uk: 'tr', word: 'tree', hi: 'tr', cn: '树', spell: 'tr' },
  { uk: 'ts', word: 'cats', hi: 'ts', cn: '猫（复数）', spell: 'ts · tes' },
  { uk: 'h', word: 'hat', hi: 'h', cn: '帽子', spell: 'h · wh' }
];

/** Voiced consonants, then the sonorants. */
export const VOICED: Phoneme[] = [
  { uk: 'b', word: 'bag', hi: 'b', cn: '包', spell: 'b · bb' },
  { uk: 'd', word: 'dog', hi: 'd', cn: '狗', spell: 'd · dd · ed' },
  { uk: 'ɡ', word: 'go', hi: 'g', cn: '去', spell: 'g · gg · gu' },
  { uk: 'v', word: 'very', hi: 'v', cn: '非常', spell: 'v' },
  { uk: 'ð', word: 'this', hi: 'th', cn: '这个', spell: 'th' },
  { uk: 'z', word: 'zoo', hi: 'z', cn: '动物园', spell: 'z · zz · s' },
  { uk: 'ʒ', word: 'vision', hi: 'si', cn: '视觉', spell: 's · ge · si' },
  { uk: 'dʒ', word: 'job', hi: 'j', cn: '工作', spell: 'j · g · dge · di' },
  { uk: 'dr', word: 'dream', hi: 'dr', cn: '梦', spell: 'dr' },
  { uk: 'dz', word: 'beds', hi: 'ds', cn: '床（复数）', spell: 'ds · des' },
  { uk: 'm', word: 'man', hi: 'm', cn: '男人', spell: 'm · mm · mb' },
  { uk: 'n', word: 'nose', hi: 'n', cn: '鼻子', spell: 'n · nn · kn · gn' },
  { uk: 'ŋ', word: 'sing', hi: 'ng', cn: '唱歌', spell: 'ng · nk · n' },
  { uk: 'l', word: 'leg', hi: 'l', cn: '腿', spell: 'l · ll' },
  { uk: 'r', word: 'red', hi: 'r', cn: '红色', spell: 'r · rr · wr' },
  { uk: 'w', word: 'water', hi: 'w', cn: '水', spell: 'w · wh · u' },
  { uk: 'j', word: 'yes', hi: 'y', cn: '是的', spell: 'y · u · ew' }
];
