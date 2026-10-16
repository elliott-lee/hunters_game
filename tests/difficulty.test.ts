import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY, hints, randomColour, type PuzzleStage } from '../src/difficulty.ts';
import { matchingStroke, type Stroke } from '../src/rules.ts';
import { CloudShake, revealOpacity } from '../src/brixton-rules.ts';

test('click thresholds are 3, 7, and 10', () => {
  assert.deepEqual(Object.values(DIFFICULTY).map(settings => settings.glassClicks), [3, 7, 10]);
});
test('Medium removes only the requested hints; Hard hides every level hint and indicator', () => {
  assert.equal(hints('medium', 'hunter').instruction, false);
  assert.equal(hints('medium', 'hunter').detail, true);
  for (const stage of ['viola', 'whitney'] as const) {
    assert.equal(hints('medium', stage).instruction, false); assert.equal(hints('medium', stage).detail, false); assert.equal(hints('medium', stage).labels, false);
  }
  assert.equal(hints('medium', 'elliott').canvas, false);
  for (const stage of ['glass', 'hunter', 'viola', 'whitney', 'elliott', 'brixton'] as PuzzleStage[]) {
    assert.ok(Object.values(hints('easy', stage)).every(Boolean));
    assert.ok(Object.values(hints('hard', stage)).every(value => !value));
  }
});
test('random colour selection can produce all other colours without repeating the current one', () => {
  for (let current = 0; current < 7; current++) {
    const next = Array.from({ length: 6 }, (_, i) => randomColour(current, () => i / 6));
    assert.equal(new Set(next).size, 6); assert.ok(next.every(value => value !== current));
  }
});
test('Hard snapping still accepts a close drop but rejects offsets accepted by Easy', () => {
  const target: Stroke = { x: 200, y: 300, width: 48, height: 12, id: 0, letter: 0 };
  const offset = { ...target, x: 230, y: 325 };
  assert.equal(matchingStroke(offset, [target]), target);
  assert.equal(matchingStroke(offset, [target], { x: DIFFICULTY.hard.snapX, y: DIFFICULTY.hard.snapY }), undefined);
  assert.equal(matchingStroke({ ...target, x: 215, y: 312 }, [target], { x: 24, y: 20 }), target);
});
test('Easy cloud progress pauses, Medium rewinds at half speed, and all durations reveal fully', () => {
  for (const [mode, settings] of Object.entries(DIFFICULTY)) {
    const cloud = new CloudShake(settings.cloudMs, settings.rewindRate);
    for (let now = 0; now <= 3200; now += 20) {
      if (now % 80 === 0) cloud.sample({ x: now / 80 % 2 ? 20 : -20, y: 0 }, now);
      cloud.tick(now, true);
    }
    const before = cloud.elapsed;
    cloud.stopTracking(); cloud.tick(5200, false);
    assert.equal(cloud.elapsed, before - 2000 * settings.rewindRate, mode);
    const full = new CloudShake(settings.cloudMs, settings.rewindRate);
    for (let now = 0; now <= settings.cloudMs + 400; now += 20) {
      if (now % 80 === 0) full.sample({ x: now / 80 % 2 ? 20 : -20, y: 0 }, now);
      full.tick(now, true);
    }
    assert.equal(full.revealed, true, mode);
    assert.equal(full.elapsed, settings.cloudMs, mode);
    assert.equal(revealOpacity(settings.cloudMs / 2, settings.cloudMs), .5, mode);
  }
});
