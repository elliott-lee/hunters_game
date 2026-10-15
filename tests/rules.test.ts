import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rainbowSolved, rotationsSolved, sizeResult, nearbyCracks, matchingStroke, type Stroke } from '../src/rules.ts';

test('every consecutive six-colour rainbow, including wraparound, succeeds', () => {
  for (let start = 0; start < 7; start++) assert.equal(rainbowSolved(Array.from({ length: 6 }, (_, i) => (start + i) % 7)), true);
  for (const invalid of [[0, 1, 2, 4, 5, 6], [0, 0, 0, 0, 0, 0], [5, 4, 3, 2, 1, 0], [3, 4, 5, 6, 7, 8], []]) assert.equal(rainbowSolved(invalid), false);
});
test('upright means all five quarter turns are zero modulo four', () => {
  assert.equal(rotationsSolved([0, 4, 0, 0, 0]), true);
  assert.equal(rotationsSolved([0, 0, 1, 0, 0]), false);
  assert.equal(rotationsSolved([]), false);
});
test('only all-medium sizes succeed; all other matching sizes are errors', () => {
  assert.equal(sizeResult(Array(7).fill(2)), 'correct');
  for (const size of [0, 1, 3, 4]) assert.equal(sizeResult(Array(7).fill(size)), 'wrong');
  assert.equal(sizeResult([0, 1, 2, 3, 4, 0, 1]), 'mixed');
  assert.equal(sizeResult([]), 'mixed');
});
test('scattered cracks cannot accumulate into a local break', () => {
  const scattered = Array.from({ length: 11 }, (_, i) => ({ x: i * 150, y: 200 }));
  assert.equal(nearbyCracks(scattered, { x: 0, y: 200 }), 1);
  assert.equal(nearbyCracks(Array(11).fill({ x: 100, y: 200 }), { x: 135, y: 215 }), 11);
});
test('stroke placement accepts gaps, small length differences, and interchangeable pieces', () => {
  const target: Stroke = { x: 200, y: 300, width: 60, height: 12, id: 0, letter: 0 };
  const piece: Stroke = { x: 233, y: 323, width: 48, height: 12, id: 9, letter: 6 };
  assert.equal(matchingStroke(piece, [target]), target);
  assert.equal(matchingStroke({ ...piece, width: 12, height: 72 }, [target]), undefined);
  assert.equal(matchingStroke({ ...piece, x: 300 }, [target]), undefined);
  assert.equal(matchingStroke(piece, [{ ...target, placed: true }]), undefined);
});
