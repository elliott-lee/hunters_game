import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudShake, revealOpacity, releaseVelocity, brixtonSolved, type SlidingLetter } from '../src/brixton-rules.ts';

function shake(cloud: CloudShake, from: number, until: number) {
  for (let now = from; now <= until; now += 20) {
    if (now % 80 === 0) cloud.sample({ x: (now / 80) % 2 ? 20 : -20, y: 0 }, now);
    cloud.tick(now, true);
  }
}

test('waiting, tiny jitter, and moving in one direction never reveal a cloud', () => {
  for (const position of [(i: number) => 0, (i: number) => i % 2, (i: number) => i * 5]) {
    const cloud = new CloudShake();
    for (let i = 0; i < 700; i++) { cloud.sample({ x: position(i), y: 0 }, i * 20); cloud.tick(i * 20, true); }
    assert.equal(cloud.elapsed, 0); assert.equal(cloud.revealed, false);
  }
});
test('a continuous shake reaches the milestones; inactive time rewinds at one second per second', () => {
  const cloud = new CloudShake();
  shake(cloud, 0, 2000);
  assert.ok(cloud.elapsed < 2000); assert.equal(revealOpacity(cloud.elapsed), 0);
  shake(cloud, 2020, 5200);
  assert.ok(cloud.elapsed >= 5000 && cloud.elapsed < 5200);
  assert.ok(revealOpacity(cloud.elapsed) >= .5);
  const before = cloud.elapsed;
  cloud.tick(6200, false); assert.equal(cloud.elapsed, before - 1000);
  cloud.tick(7200, true); assert.equal(cloud.elapsed, before - 2000);
  shake(cloud, 7220, 9300); assert.ok(cloud.elapsed > before - 2000);
  cloud.stopTracking();
  const remaining = cloud.elapsed;
  cloud.tick(10300, false); assert.equal(cloud.elapsed, remaining - 1000);
  cloud.tick(30000, false); assert.equal(cloud.elapsed, 0);
  const complete = new CloudShake(); shake(complete, 0, 10400);
  assert.equal(complete.revealed, true); assert.equal(complete.elapsed, 10000);
  complete.stopTracking(); complete.tick(30000, false);
  assert.equal(complete.revealed, true); assert.equal(complete.elapsed, 10000);
});
test('letter opacity follows the requested 2, 5, and 10 second boundaries', () => {
  assert.equal(revealOpacity(1999), 0); assert.equal(revealOpacity(2000), .05);
  assert.equal(revealOpacity(5000), .5); assert.equal(revealOpacity(10000), 1);
});
test('release momentum follows the recent pointer direction and vanishes after stopping', () => {
  const samples = [{ x: 0, y: 0, time: 0 }, { x: -20, y: 40, time: 50 }, { x: -40, y: 80, time: 100 }];
  const velocity = releaseVelocity(samples, 110);
  assert.ok(velocity.x < 0 && velocity.y > 0); assert.ok(Math.hypot(velocity.x, velocity.y) <= 720.001);
  assert.deepEqual(releaseVelocity(samples, 210), { x: 0, y: 0 });
  assert.deepEqual(releaseVelocity([{ x: 0, y: 0, time: 0 }], 0), { x: 0, y: 0 });
});
test('BRIXTON must be revealed, still, ordered, and lined up in one row', () => {
  const row: SlidingLetter[] = [...'BRIXTON'].map((char, i) => ({ char, x: 200 + i * 110, y: 550, vx: 0, vy: 0, revealed: true, dragging: false }));
  assert.equal(brixtonSolved([...row].reverse()), true);
  for (const change of [{ revealed: false }, { dragging: true }, { vx: 30 }, { char: 'X' }, { y: 580 }, { x: row[1].x }]) {
    assert.equal(brixtonSolved(row.map((l, i) => i === 0 ? { ...l, ...change } : l)), false);
  }
  assert.equal(brixtonSolved(row.slice(1)), false);
});

test('a horizontal BRIXTON row accepts any location and tight, wide, or uneven spacing', () => {
  for (const positions of [[0, 1, 2, 3, 4, 5, 6], [0, 250, 500, 750, 1000, 1250, 1500], [55, 145, 250, 420, 680, 880, 1055]]) {
    for (const xOffset of [-200, 0, 300]) for (const y of [-100, 140, 550, 900]) {
      const row: SlidingLetter[] = [...'BRIXTON'].map((char, i) => ({ char, x: xOffset + positions[i], y: y + (i % 2 ? 5 : -5), vx: 0, vy: 0, revealed: true, dragging: false }));
      assert.equal(brixtonSolved([...row].reverse()), true, `${positions}, offset ${xOffset}, y ${y}`);
    }
  }
});
