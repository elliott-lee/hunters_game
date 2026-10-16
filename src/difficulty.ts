export type Difficulty = 'easy' | 'medium' | 'hard';
export type PuzzleStage = 'glass' | 'hunter' | 'viola' | 'whitney' | 'elliott' | 'brixton' | 'ending';
export const DIFFICULTY = {
  easy: { glassClicks: 3, cloudMs: 5000, rewindRate: 0, snapX: 43, snapY: 35 },
  medium: { glassClicks: 7, cloudMs: 7000, rewindRate: .5, snapX: 43, snapY: 35 },
  hard: { glassClicks: 10, cloudMs: 10000, rewindRate: 1, snapX: 24, snapY: 20 },
} as const;

export function hints(mode: Difficulty, stage: PuzzleStage) {
  const none = mode === 'hard' || (mode === 'medium' && stage === 'elliott');
  const minimal = mode === 'medium' && ['viola', 'whitney'].includes(stage);
  return {
    chapter: !none && !minimal,
    instruction: !none && !minimal && !(mode === 'medium' && stage === 'hunter'),
    detail: !none && !minimal,
    labels: !none && !minimal,
    canvas: !none,
  };
}

/** Choose a different colour without imposing a predictable cycle. */
export function randomColour(current: number, random = Math.random) {
  return (current + 1 + Math.floor(random() * 6)) % 7;
}
