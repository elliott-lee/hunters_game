import type { Point } from './rules';

export const BRIXTON = 'BRIXTON';
export const REVEAL_MS = 10_000;
export const SHAKE_GAP_MS = 280;

/** Count time only while meaningful direction changes keep arriving. */
export class CloudShake {
  readonly duration: number;
  readonly rewindRate: number;
  constructor(duration = REVEAL_MS, rewindRate = 1) { this.duration = duration; this.rewindRate = rewindRate; }
  elapsed = 0;
  revealed = false;
  private anchor?: Point;
  private direction?: Point;
  private lastMove = -Infinity;
  private lastTurn = -Infinity;
  private sampledAt = -Infinity;

  sample(point: Point, now: number) {
    if (this.revealed) return;
    if (now - this.lastMove > SHAKE_GAP_MS) this.stopTracking();
    if (!this.anchor) { this.anchor = point; this.lastMove = now; return; }
    const dx = point.x - this.anchor.x, dy = point.y - this.anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) return;
    const direction = { x: dx / distance, y: dy / distance };
    if (this.direction && direction.x * this.direction.x + direction.y * this.direction.y < -.25) this.lastTurn = now;
    this.direction = direction; this.anchor = point; this.lastMove = now;
  }

  tick(now: number, overCloud: boolean): boolean {
    if (this.revealed) return false;
    const previous = this.sampledAt;
    this.sampledAt = now;
    const delta = Number.isFinite(previous) ? Math.max(0, now - previous) : 0;
    if (!overCloud || !this.shaking(now)) {
      // Apply this mode's pause or rewind rate outside the cloud and in hidden tabs.
      this.elapsed = Math.max(0, this.elapsed - delta * this.rewindRate);
      return false;
    }
    // Never credit a stalled frame, a hidden tab, or time before a shake began.
    this.elapsed = Math.min(this.duration, this.elapsed + Math.min(delta, SHAKE_GAP_MS));
    if (this.elapsed === this.duration) { this.revealed = true; return true; }
    return false;
  }

  shaking(now: number) {
    return now - this.lastMove <= SHAKE_GAP_MS && now - this.lastTurn <= SHAKE_GAP_MS;
  }

  stopTracking() {
    if (this.revealed) return;
    this.anchor = undefined; this.direction = undefined;
    this.lastMove = -Infinity; this.lastTurn = -Infinity;
  }
}

/** The letter gains opacity as the cloud loses it. */
export function revealOpacity(milliseconds: number, duration = REVEAL_MS): number {
  milliseconds = milliseconds / duration * REVEAL_MS;
  if (milliseconds < 2000) return 0;
  if (milliseconds <= 5000) return .05 + (milliseconds - 2000) / 3000 * .45;
  return Math.min(1, .5 + (milliseconds - 5000) / 5000 * .5);
}

export type PointerSample = Point & { time: number };
export function releaseVelocity(samples: PointerSample[], now: number): Point {
  const last = samples.at(-1);
  if (!last || now - last.time > 100) return { x: 0, y: 0 };
  const first = samples.find(sample => last.time - sample.time <= 100 && last.time - sample.time >= 12);
  if (!first) return { x: 0, y: 0 };
  const seconds = (last.time - first.time) / 1000;
  const x = (last.x - first.x) / seconds, y = (last.y - first.y) / seconds;
  const scale = Math.min(1, 720 / Math.max(1, Math.hypot(x, y)));
  return { x: x * scale, y: y * scale };
}

export type SlidingLetter = Point & { char: string; vx: number; vy: number; revealed: boolean; dragging: boolean };
export function brixtonSolved(letters: SlidingLetter[]): boolean {
  if (letters.length !== 7 || letters.some(l => !l.revealed || l.dragging || Math.hypot(l.vx, l.vy) > 12)) return false;
  const row = [...letters].sort((a, b) => a.x - b.x);
  if (row.map(l => l.char).join('') !== BRIXTON) return false;
  if (Math.max(...row.map(l => l.y)) - Math.min(...row.map(l => l.y)) > 24) return false;
  // Any spacing is valid, including overlapping glyphs. Distinct horizontal
  // positions establish the word's left-to-right order without a hidden grid.
  return row.every((l, i) => i === 0 || l.x > row[i - 1].x);
}
