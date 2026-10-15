/**
 * Keyboard model presets.
 *
 * Each model pairs a physical layout with the visual language of a real family
 * of keyboards: case material and colour, keycap profile and sculpt, legend
 * colour, backlight behaviour and the small signature details that make a board
 * recognisable (ThinkPad's red TrackPoint, TUF's orange WASD cluster, ROG's
 * deck vents, the Azoth's OLED).
 */
import type { SoundProfile } from '../../lib/audio';

export type KeycapProfile = 'oem' | 'cherry' | 'chiclet' | 'lowprofile';
export type CaseMaterial = 'aluminium' | 'plastic' | 'polycarbonate';
export type Backlight = 'none' | 'white' | 'rgb';
export type RgbStyle = 'solid' | 'wave' | 'rainbow' | 'reactive' | 'starlight' | 'heatmap';

export interface KeyboardModel {
  id: string;
  name: string;
  brand: string;
  /** one-line description of what makes this board itself */
  desc: string;
  layoutId: string;
  profile: KeycapProfile;
  /** keycap height above the plate, in units */
  capHeight: number;
  /** how deep the top surface is dished, in units */
  dish: number;
  /** gap between keycaps, in units */
  gap: number;
  case: {
    material: CaseMaterial;
    color: string;
    /** deck colour, when the deck differs from the case */
    deckColor?: string;
    height: number;
    radius: number;
    /** extra bezel around the key field, in units */
    bezel: number;
    /** case tilt in degrees */
    tilt: number;
    roughness: number;
    metalness: number;
  };
  caps: {
    color: string;
    /** legacy field — all caps now share one colour; kept for type compat */
    accent: string;
    legend: string;
    /** colour used for legends on accent keys */
    accentLegend?: string;
  };
  backlight: Backlight;
  rgbStyle: RgbStyle;
  underglow: boolean;
  features: {
    /** ThinkPad-style red pointing stick */
    trackPoint?: boolean;
    /** highlight the WASD cluster */
    wasd?: boolean;
    /** decorative vents across the deck (ROG) */
    vents?: boolean;
    /** small OLED panel (ROG Azoth) */
    oled?: boolean;
    /** brand wordmark on the deck */
    badge?: string;
    /** the deck is a recessed tray, as on a laptop */
    tray?: boolean;
    /** laptop-style continuous F-row (no gaps between F-keys) */
    flushFunctionRow?: boolean;
  };
  sound: SoundProfile;
}

export const MODELS: KeyboardModel[] = [
  {
    id: 'laptop',
    name: '笔记本键盘',
    brand: 'Generic',
    desc: '最常见的笔记本巧克力键盘：深灰键帽、约 1.3mm 键程、无背光。手感的基准线。',
    layoutId: 'laptop78',
    profile: 'chiclet',
    capHeight: 0.33,
    dish: 0.028,
    gap: 0.1,
    case: {
      material: 'plastic',
      color: '#2a2d33',
      deckColor: '#22252a',
      height: 0.8,
      radius: 0.38,
      bezel: 0.7,
      tilt: 4,
      roughness: 0.66,
      metalness: 0.08
    },
    caps: { color: '#34383f', accent: '#34383f', legend: '#dfe3e9' },
    backlight: 'none',
    rgbStyle: 'solid',
    underglow: false,
    features: { tray: true, flushFunctionRow: true },
    sound: 'laptop'
  },
  {
    id: 'office',
    name: '办公薄型键盘',
    brand: 'Generic',
    desc: '低键程剪刀脚办公键盘：浅色键帽、安静顺滑，类似 MX Keys 的手感与气质。',
    layoutId: 'full104',
    profile: 'lowprofile',
    capHeight: 0.3,
    dish: 0.05,
    gap: 0.09,
    case: {
      material: 'aluminium',
      color: '#b9bcc3',
      height: 0.5,
      radius: 0.26,
      bezel: 0.6,
      tilt: 3.5,
      roughness: 0.42,
      metalness: 0.7
    },
    caps: { color: '#f0f1f4', accent: '#f0f1f4', legend: '#3c4048' },
    backlight: 'none',
    rgbStyle: 'solid',
    underglow: false,
    features: {},
    sound: 'laptop'
  },
  {
    id: 'mech-tkl',
    name: '87 键机械键盘',
    brand: 'Generic',
    desc: 'TKL 机械键盘：无小键盘、Cherry 高度键帽、茶轴手感。桌面空间与功能性的平衡。',
    layoutId: 'tkl87',
    profile: 'cherry',
    capHeight: 0.47,
    dish: 0.05,
    gap: 0.12,
    case: {
      material: 'plastic',
      color: '#2f3237',
      height: 0.62,
      radius: 0.26,
      bezel: 0.66,
      tilt: 5.5,
      roughness: 0.58,
      metalness: 0.12
    },
    caps: { color: '#2c2f35', accent: '#2c2f35', legend: '#eef1f5' },
    backlight: 'white',
    rgbStyle: 'solid',
    underglow: false,
    features: {},
    sound: 'tactile'
  },
  {
    id: 'mech-60',
    name: '60% 客制化键盘',
    brand: 'Generic',
    desc: '60% 极简布局 + 全铝机身：HHKB 式的克制，无方向键，靠层切换。发烧友的选择。',
    layoutId: 'k60',
    profile: 'cherry',
    capHeight: 0.5,
    dish: 0.07,
    gap: 0.14,
    case: {
      material: 'aluminium',
      color: '#33363c',
      height: 0.68,
      radius: 0.24,
      bezel: 0.66,
      tilt: 6,
      roughness: 0.38,
      metalness: 0.82
    },
    caps: { color: '#33363d', accent: '#33363d', legend: '#eceef2' },
    backlight: 'none',
    rgbStyle: 'solid',
    underglow: false,
    features: {},
    sound: 'linear'
  }
];

export const getModel = (id: string): KeyboardModel => MODELS.find(model => model.id === id) ?? MODELS[0];

/**
 * Keycap profile sculpt, indexed by row (0 = F-row … 5 = bottom modifier row).
 *
 * Heights are relative to the tallest row. Angles follow the real profiles:
 * the top row sits flat, the home row tilts slightly, and the bottom row has
 * the steepest angle so its face points at the typist.
 */
export const PROFILE_SCULPT: Record<KeycapProfile, { height: number[]; tilt: number[] }> = {
  oem: {
    height: [1.0, 1.0, 0.89, 0.8, 0.78, 0.78],
    tilt: [3, 3, 7, 8, 10, 10]
  },
  cherry: {
    height: [1.0, 1.0, 0.84, 0.7, 0.67, 0.67],
    tilt: [0, 0, 2.5, 5, 11.5, 11.5]
  },
  chiclet: {
    height: [1, 1, 1, 1, 1, 1],
    tilt: [0, 0, 0, 0, 0, 0]
  },
  lowprofile: {
    height: [1, 1, 1, 1, 1, 1],
    tilt: [0, 0, 0, 0, 0, 0]
  }
};
