/**
 * クライアントごとのブランドカラーから、実際に画面で使う色味一式を作る。
 *
 * 保存するのは1色（16進数）だけ。そこからボタンの通常色・押したときの色・
 * 背景に薄く敷く色・文字色（白か黒か）を計算で導く。手作業で何色も
 * 決めてもらう必要がないようにするための、純粋な計算だけの処理。
 */

const DEFAULT_BRAND_COLOR = "#1F2A44"; // 落ち着いたネイビー

export type BrandPalette = {
  /** 元の色（ボタンなどの基本色） */
  base: string;
  /** ボタンを押したとき・ホバー時の少し濃い色 */
  hover: string;
  /** 背景に薄く敷く色（カードの選択状態など） */
  tint: string;
  /** その色の上に置く文字の色（白 or 黒） */
  onBase: string;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const value = m[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const part = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** target（白 or 黒）に向けて、比率ぶんだけ混ぜる */
function mix(
  color: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
  ratio: number,
): { r: number; g: number; b: number } {
  return {
    r: color.r + (target.r - color.r) * ratio,
    g: color.g + (target.g - color.g) * ratio,
    b: color.b + (target.b - color.b) * ratio,
  };
}

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

/** 明るい色には黒文字、暗い色には白文字を選ぶ（相対輝度による判定） */
function pickOnColor(color: { r: number; g: number; b: number }): string {
  const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
  return luminance > 0.6 ? "#1A1A1A" : "#FFFFFF";
}

export function resolveBrandPalette(hex: string | null | undefined): BrandPalette {
  const rgb = parseHex(hex ?? "") ?? parseHex(DEFAULT_BRAND_COLOR)!;

  return {
    base: toHex(rgb),
    hover: toHex(mix(rgb, BLACK, 0.15)),
    tint: toHex(mix(rgb, WHITE, 0.92)),
    onBase: pickOnColor(rgb),
  };
}

export function isValidHexColor(value: string): boolean {
  return parseHex(value) !== null;
}
