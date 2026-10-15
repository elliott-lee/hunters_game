export const RAINBOW = [0xff5369, 0xff9d43, 0xffdf67, 0x66df91, 0x55baff, 0x8275ee, 0xda8bfa];
export const COLOUR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
export const SIZES = [0.55, 0.78, 1, 1.24, 1.5];
export const SIZE_NAMES = ['XS', 'SM', 'MD', 'LG', 'XL'];
export type Point = { x: number; y: number };
export function rainbowSolved(values: number[]): boolean {
  return values.length === 6 && values.every((v, i) => Number.isInteger(v) && v >= 0 && v < 7 && (i === 0 || v === (values[i - 1] + 1) % 7));
}
export function rotationsSolved(values: number[]): boolean {
  return values.length === 5 && values.every(v => v % 4 === 0);
}
export function sizeResult(values: number[]): 'correct' | 'wrong' | 'mixed' {
  if (values.length !== 7 || values.some(v => !Number.isInteger(v) || v < 0 || v > 4)) return 'mixed';
  if (values.every(v => v === 2)) return 'correct';
  return values.every(v => v === values[0]) ? 'wrong' : 'mixed';
}
export function nearbyCracks(points: Point[], at: Point, radius = 110): number {
  return points.filter(p => Math.hypot(p.x - at.x, p.y - at.y) <= radius).length;
}
export type Stroke = Point & { width: number; height: number; id: number; letter: number; placed?: boolean };
export function matchingStroke(piece: Stroke, targets: Stroke[]): Stroke | undefined {
  // Positions are deliberately forgiving; lengths must be similar, not exact.
  return targets.filter(t => !t.placed && (piece.width > piece.height) === (t.width > t.height)
    && Math.abs(Math.max(piece.width, piece.height) - Math.max(t.width, t.height)) <= 15
    && Math.abs(piece.x - t.x) <= 43 && Math.abs(piece.y - t.y) <= 35)
    .sort((a, b) => Math.hypot(piece.x - a.x, piece.y - a.y) - Math.hypot(piece.x - b.x, piece.y - b.y))[0];
}
