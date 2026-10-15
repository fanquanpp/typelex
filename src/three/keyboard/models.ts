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
    /** colour for the keys listed in the layout's `accent` array */
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
    id: 'tuf-a15',
    name: '天选 A15 键盘',
    brand: 'ASUS TUF',
    desc: '华硕天选系列笔记本键盘：灰黑机身 + 橙色点缀，1 区 RGB 背光，WASD 半透明键帽，1.7mm 键程的巧克力键。',
    layoutId: 'laptop78',
    profile: 'chiclet',
    capHeight: 0.35,
    dish: 0.035,
    gap: 0.1,
    case: {
      material: 'plastic',
      color: '#2b2e33',
      deckColor: '#23262b',
      height: 0.85,
      radius: 0.42,
      bezel: 0.72,
      tilt: 4.5,
      roughness: 0.62,
      metalness: 0.12
    },
    caps: { color: '#33373d', accent: '#e0762a', legend: '#e9ecf1' },
    backlight: 'rgb',
    rgbStyle: 'solid',
    underglow: false,
    features: { wasd: true, tray: true, flushFunctionRow: true, badge: 'TUF GAMING' },
    sound: 'laptop'
  },
  {
    id: 'rog-strix',
    name: 'ROG Strix 键盘',
    brand: 'ASUS ROG',
    desc: '玩家国度游戏本键盘：全尺寸布局、F 区间隔开、左上独立快捷键、超大方向键、Aura Sync 单键 RGB，WASD 周围有散热开孔。',
    layoutId: 'laptop78',
    profile: 'chiclet',
    capHeight: 0.37,
    dish: 0.03,
    gap: 0.11,
    case: {
      material: 'plastic',
      color: '#1b1d22',
      deckColor: '#15171b',
      height: 0.9,
      radius: 0.4,
      bezel: 0.75,
      tilt: 5,
      roughness: 0.5,
      metalness: 0.2
    },
    caps: { color: '#26282e', accent: '#e23a3a', legend: '#f2f4f8' },
    backlight: 'rgb',
    rgbStyle: 'wave',
    underglow: false,
    features: { wasd: true, vents: true, tray: true, badge: 'ROG' },
    sound: 'laptop'
  },
  {
    id: 'thinkpad',
    name: 'ThinkPad 键盘',
    brand: 'Lenovo',
    desc: '经典商务黑：G/H/B 之间的红色 TrackPoint 指点杆、下凹的球形键帽、1.5mm 键程、纯白背光，没有任何 RGB。',
    layoutId: 'laptop78',
    profile: 'chiclet',
    capHeight: 0.35,
    dish: 0.05,
    gap: 0.1,
    case: {
      material: 'plastic',
      color: '#1a1a1c',
      deckColor: '#141416',
      height: 0.82,
      radius: 0.36,
      bezel: 0.78,
      tilt: 4,
      roughness: 0.78,
      metalness: 0.06
    },
    caps: { color: '#26262a', accent: '#3a3a40', legend: '#f0f0f2' },
    backlight: 'white',
    rgbStyle: 'solid',
    underglow: false,
    features: { trackPoint: true, tray: true, badge: 'ThinkPad' },
    sound: 'laptop'
  },
  {
    id: 'legion',
    name: 'Legion TrueStrike',
    brand: 'Lenovo',
    desc: '联想拯救者 TrueStrike 键盘：软着陆手感、四区 RGB、加大的键帽下沉弧度，深色机身配蓝色背光。',
    layoutId: 'laptop78',
    profile: 'chiclet',
    capHeight: 0.37,
    dish: 0.04,
    gap: 0.1,
    case: {
      material: 'plastic',
      color: '#212429',
      deckColor: '#191c20',
      height: 0.88,
      radius: 0.4,
      bezel: 0.74,
      tilt: 4.5,
      roughness: 0.58,
      metalness: 0.14
    },
    caps: { color: '#2d3138', accent: '#3d7fe0', legend: '#eaeef5' },
    backlight: 'rgb',
    rgbStyle: 'solid',
    underglow: false,
    features: { wasd: true, tray: true, badge: 'LEGION' },
    sound: 'laptop'
  },
  {
    id: 'macbook',
    name: '妙控键盘',
    brand: 'Apple',
    desc: 'Magic Keyboard 风格：一体成型楔形银色机身、纯平方形键帽、无 RGB、F 区不留间隔、半高方向键。',
    layoutId: 'laptop78',
    profile: 'lowprofile',
    capHeight: 0.27,
    dish: 0.012,
    gap: 0.075,
    case: {
      material: 'aluminium',
      color: '#d6d8dc',
      height: 0.55,
      radius: 0.3,
      bezel: 0.62,
      tilt: 3,
      roughness: 0.36,
      metalness: 0.82
    },
    caps: { color: '#f3f4f6', accent: '#e6e8ec', legend: '#4a4d55' },
    backlight: 'white',
    rgbStyle: 'solid',
    underglow: false,
    features: { flushFunctionRow: true, badge: ' ' },
    sound: 'laptop'
  },
  {
    id: 'generic-laptop',
    name: '通用笔记本键盘',
    brand: 'Generic',
    desc: '最常见的笔记本巧克力键盘：深灰键帽、单色白背光、媒体图标的 F 区、约 1.3mm 键程。',
    layoutId: 'laptop78',
    profile: 'chiclet',
    capHeight: 0.33,
    dish: 0.028,
    gap: 0.1,
    case: {
      material: 'plastic',
      color: '#2f3237',
      deckColor: '#26292e',
      height: 0.8,
      radius: 0.38,
      bezel: 0.7,
      tilt: 4,
      roughness: 0.68,
      metalness: 0.08
    },
    caps: { color: '#3a3d43', accent: '#3a3d43', legend: '#dfe3e9' },
    backlight: 'white',
    rgbStyle: 'solid',
    underglow: false,
    features: { tray: true, flushFunctionRow: true },
    sound: 'laptop'
  },
  {
    id: 'mx-keys',
    name: 'MX Keys',
    brand: 'Logitech',
    desc: '全尺寸低键程办公键盘：球形下凹的剪刀脚键帽、智能背光、1.8mm 键程，安静而顺滑。',
    layoutId: 'full104',
    profile: 'lowprofile',
    capHeight: 0.3,
    dish: 0.05,
    gap: 0.09,
    case: {
      material: 'aluminium',
      color: '#3c3f45',
      height: 0.5,
      radius: 0.26,
      bezel: 0.6,
      tilt: 3.5,
      roughness: 0.42,
      metalness: 0.7
    },
    caps: { color: '#4a4d53', accent: '#5a5d63', legend: '#f0f2f5' },
    backlight: 'white',
    rgbStyle: 'solid',
    underglow: false,
    features: { badge: 'logi' },
    sound: 'laptop'
  },
  {
    id: 'q1-75',
    name: 'Q1 客制化 75%',
    brand: 'Keychron',
    desc: '全铝 CNC 机身 + Gasket 结构：手感偏软、声音干净，双色注塑 PBT 键帽，单键 RGB，84 键 75% 布局。',
    layoutId: 'k75',
    profile: 'cherry',
    capHeight: 0.46,
    dish: 0.055,
    gap: 0.12,
    case: {
      material: 'aluminium',
      color: '#4a4f57',
      height: 0.62,
      radius: 0.3,
      bezel: 0.72,
      tilt: 5.5,
      roughness: 0.34,
      metalness: 0.86
    },
    caps: { color: '#2b2e34', accent: '#c8622f', legend: '#f4f6f9' },
    backlight: 'rgb',
    rgbStyle: 'reactive',
    underglow: false,
    features: { badge: 'KEYCHRON' },
    sound: 'tactile'
  },
  {
    id: 'k2-75',
    name: 'K2 无线 75%',
    brand: 'Keychron',
    desc: '塑料机身的 75% 无线机械键盘：ABS 透光键帽、橙红点缀键、白色背光，是很多人第一把机械键盘。',
    layoutId: 'k75',
    profile: 'oem',
    capHeight: 0.5,
    dish: 0.05,
    gap: 0.13,
    case: {
      material: 'plastic',
      color: '#3b3e44',
      height: 0.66,
      radius: 0.28,
      bezel: 0.7,
      tilt: 6,
      roughness: 0.6,
      metalness: 0.1
    },
    caps: { color: '#2f3238', accent: '#d2603a', legend: '#f5f7fa' },
    backlight: 'white',
    rgbStyle: 'solid',
    underglow: false,
    features: {},
    sound: 'tactile'
  },
  {
    id: 'hhkb',
    name: 'HHKB 静电容 60%',
    brand: 'PFU',
    desc: '极简 60%：炭黑机身、无刻字取向的厚 PBT 键帽、Topre 静电容手感、Esc 在左上角、Ctrl 在 Caps 位置。',
    layoutId: 'k60',
    profile: 'cherry',
    capHeight: 0.5,
    dish: 0.07,
    gap: 0.14,
    case: {
      material: 'plastic',
      color: '#2a2a2c',
      height: 0.72,
      radius: 0.24,
      bezel: 0.66,
      tilt: 6,
      roughness: 0.72,
      metalness: 0.05
    },
    caps: { color: '#3a3a3d', accent: '#4a4a4e', legend: '#e8e8ea' },
    backlight: 'none',
    rgbStyle: 'solid',
    underglow: false,
    features: {},
    sound: 'tactile'
  },
  {
    id: 'huntsman',
    name: '猎魂光蛛',
    brand: 'Razer',
    desc: '光轴全尺寸电竞键盘：黑色铝合金上盖、裸露轴体、底部 RGB 泛光带、1.0mm 触发点，手感极快。',
    layoutId: 'full104',
    profile: 'oem',
    capHeight: 0.48,
    dish: 0.045,
    gap: 0.12,
    case: {
      material: 'aluminium',
      color: '#1e1f22',
      height: 0.58,
      radius: 0.24,
      bezel: 0.62,
      tilt: 5,
      roughness: 0.38,
      metalness: 0.8
    },
    caps: { color: '#26272b', accent: '#44d62c', legend: '#eef1f4' },
    backlight: 'rgb',
    rgbStyle: 'wave',
    underglow: true,
    features: {},
    sound: 'linear'
  },
  {
    id: 'azoth',
    name: 'ROG 龙骑士 Azoth',
    brand: 'ASUS ROG',
    desc: '75% 客制化机械键盘：枪灰铝合金机身、Gasket 结构、右上角 OLED 小屏、单键 Aura RGB、PBT 键帽。',
    layoutId: 'k75',
    profile: 'cherry',
    capHeight: 0.48,
    dish: 0.05,
    gap: 0.13,
    case: {
      material: 'aluminium',
      color: '#3a3d43',
      height: 0.66,
      radius: 0.3,
      bezel: 0.74,
      tilt: 5.5,
      roughness: 0.36,
      metalness: 0.84
    },
    caps: { color: '#2c2f34', accent: '#e23a3a', legend: '#f2f5f8' },
    backlight: 'rgb',
    rgbStyle: 'rainbow',
    underglow: false,
    features: { oled: true, badge: 'ROG' },
    sound: 'tactile'
  },
  {
    id: 'tkl-mech',
    name: '标准 87 键机械',
    brand: 'Generic',
    desc: '最常见的 TKL 机械键盘：无小键盘的 87 键、单键 RGB、Cherry 高度键帽，桌面空间与功能性的平衡点。',
    layoutId: 'tkl87',
    profile: 'cherry',
    capHeight: 0.47,
    dish: 0.05,
    gap: 0.12,
    case: {
      material: 'plastic',
      color: '#33363c',
      height: 0.62,
      radius: 0.26,
      bezel: 0.66,
      tilt: 5.5,
      roughness: 0.58,
      metalness: 0.12
    },
    caps: { color: '#2a2d32', accent: '#5b8def', legend: '#f2f5f9' },
    backlight: 'rgb',
    rgbStyle: 'reactive',
    underglow: false,
    features: {},
    sound: 'linear'
  },
  {
    id: 'k98-compact',
    name: '98 键紧凑机械',
    brand: 'Generic',
    desc: '98 键布局：把数字区压进主键区右侧，比全尺寸短 6cm，保留数字键盘与方向键，办公党最爱的折中方案。',
    layoutId: 'k98',
    profile: 'oem',
    capHeight: 0.49,
    dish: 0.048,
    gap: 0.12,
    case: {
      material: 'plastic',
      color: '#35383e',
      height: 0.64,
      radius: 0.28,
      bezel: 0.68,
      tilt: 5.5,
      roughness: 0.56,
      metalness: 0.14
    },
    caps: { color: '#2c2f35', accent: '#2fb8a4', legend: '#f0f4f8' },
    backlight: 'rgb',
    rgbStyle: 'wave',
    underglow: false,
    features: {},
    sound: 'tactile'
  },
  {
    id: 'full-mech',
    name: '104 键全尺寸机械',
    brand: 'Generic',
    desc: '经典 104 键：完整数字区 + 独立方向键 + 导航键群，单键 RGB 与铝合金上盖，最稳妥的选择。',
    layoutId: 'full104',
    profile: 'oem',
    capHeight: 0.5,
    dish: 0.048,
    gap: 0.125,
    case: {
      material: 'aluminium',
      color: '#2e3136',
      height: 0.62,
      radius: 0.28,
      bezel: 0.7,
      tilt: 5.5,
      roughness: 0.4,
      metalness: 0.76
    },
    caps: { color: '#282b30', accent: '#d8a13a', legend: '#f3f6fa' },
    backlight: 'rgb',
    rgbStyle: 'starlight',
    underglow: true,
    features: {},
    sound: 'clicky'
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
