import { test, expect, type Page } from '@playwright/test';

type Snapshot = {
  stage: string; difficulty: 'easy' | 'medium' | 'hard' | null; busy: boolean; cracks: number; wrongAttempts: number; reduced: boolean; sound: boolean; locale: string; texts: string[]; endingFade: number;
  letters: { char: string; x: number; y: number; value: number; label: string }[];
  pieces: { id: number; x: number; y: number; width: number; height: number; placed: boolean }[];
  targets: { id: number; x: number; y: number; width: number; height: number; placed?: boolean }[];
  clouds: { char: string; x: number; y: number; cloudX: number; cloudY: number; elapsed: number; opacity: number; cloudOpacity: number; revealed: boolean; vx: number; vy: number; dragging: boolean }[];
  camera: { zoom: number; width: number; height: number };
};
const state = (page: Page) => page.evaluate(() => (window as unknown as { __game: Snapshot }).__game);
async function at(page: Page, x: number, y: number) {
  const { camera } = await state(page);
  return { x: camera.width / 2 + (x - 540) * camera.zoom, y: camera.height / 2 + (y - 360) * camera.zoom };
}
async function click(page: Page, x: number, y: number) { const p = await at(page, x, y); await page.mouse.click(p.x, p.y); }
async function ready(page: Page, stage: string) {
  await expect.poll(async () => { const s = await state(page); return s?.stage === stage && !s.busy; }).toBe(true);
}
async function setLetters(page: Page, values: number[], modulo: number) {
  const before = await state(page);
  for (let i = 0; i < values.length; i++) {
    const letter = before.letters[i];
    const count = (values[i] - letter.value + modulo) % modulo;
    for (let j = 0; j < count; j++) await click(page, letter.x, letter.y);
  }
}
async function open(page: Page, mode: 'easy' | 'medium' | 'hard' = 'easy') {
  await page.goto('/');
  await expect.poll(async () => (await state(page))?.stage).toBe('glass');
  await page.locator(`[data-difficulty="${mode}"]`).click();
}

async function shakeCloud(page: Page, index: number, milliseconds: number) {
  const snapshot = await state(page), c = snapshot.clouds[index], camera = snapshot.camera;
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 80) {
    const point = { x: camera.width / 2 + (c.cloudX + (elapsed / 80 % 2 ? 18 : -18) - 540) * camera.zoom,
      y: camera.height / 2 + (c.cloudY - 360) * camera.zoom };
    await page.mouse.move(point.x, point.y);
    await page.clock.runFor(80);
  }
}

async function gentleDrop(page: Page, index: number, x: number, y: number) {
  const c = (await state(page)).clouds[index];
  const from = await at(page, c.x, c.y), to = await at(page, x, y);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.clock.runFor(20);
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.clock.runFor(180); await page.mouse.up(); await page.clock.runFor(50);
}

async function finishBrixton(page: Page, checkMechanics = false) {
  await ready(page, 'brixton');
  const mode = (await state(page)).difficulty!;
  const total = { easy: 5000, medium: 7000, hard: 10000 }[mode];
  const rate = { easy: 0, medium: .5, hard: 1 }[mode];
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 100);
  expect((await state(page)).clouds).toHaveLength(7);
  expect((await state(page)).clouds.map(c => c.char).sort().join('')).toBe('BINORTX');
  if (mode === 'hard') {
    await expect(page.locator('#instruction')).toBeHidden(); await expect(page.locator('#detail')).toBeHidden();
    expect((await state(page)).texts.filter(text => text.trim())).toEqual([]);
  } else if (mode === 'medium') {
    expect((await state(page)).texts.some(text => text.includes('elapsed'))).toBe(true);
    expect((await state(page)).texts.some(text => text.includes('/ 7'))).toBe(false);
  } else {
    await shakeCloud(page, 0, 2400);
    const progress = (await state(page)).clouds[0].elapsed;
    const outside = await at(page, 80, 180); await page.mouse.move(outside.x, outside.y); await page.clock.runFor(1500);
    expect((await state(page)).clouds[0].elapsed).toBe(progress);
  }
  await page.screenshot({ path: 'test-results/05-clouds.png' });
  if (checkMechanics) {
    // Hovering earns nothing. Only back-and-forth shaking counts.
    const c = (await state(page)).clouds[0], point = await at(page, c.cloudX, c.cloudY);
    await page.mouse.move(point.x, point.y); await page.clock.runFor(2300);
    expect((await state(page)).clouds[0].elapsed).toBe(0);
    await shakeCloud(page, 0, total * .16);
    expect((await state(page)).clouds[0].opacity).toBe(0);
    await shakeCloud(page, 0, total * .08);
    expect((await state(page)).clouds[0].opacity).toBeGreaterThan(0);
    await shakeCloud(page, 0, total * .30);
    const half = (await state(page)).clouds[0];
    expect(half.opacity).toBeGreaterThanOrEqual(.48); expect(half.opacity).toBeLessThan(.56);
    expect(half.cloudOpacity + half.opacity).toBeCloseTo(1);
    // Language changes retain the current shake progress.
    const before = half.elapsed;
    await page.locator('#language').focus(); await page.keyboard.press('Enter'); await page.clock.runFor(30);
    expect((await state(page)).clouds[0].elapsed).toBeGreaterThanOrEqual(before);
    await page.keyboard.press('Enter');
    await page.clock.runFor(600);
    const rewinding = (await state(page)).clouds[0].elapsed;
    expect(rewinding).toBeGreaterThan(0);
    await page.clock.runFor(1000);
    expect(rewinding - (await state(page)).clouds[0].elapsed).toBeGreaterThan(rate * 1000 - 40);
    expect(rewinding - (await state(page)).clouds[0].elapsed).toBeLessThan(rate * 1000 + 40);
    await shakeCloud(page, 0, 1000);
    const leaving = (await state(page)).clouds[0].elapsed;
    const outside = await at(page, 80, 180); await page.mouse.move(outside.x, outside.y); await page.clock.runFor(30);
    expect((await state(page)).clouds[0].elapsed).toBeLessThan(leaving);
    expect((await state(page)).clouds[0].elapsed).toBeGreaterThan(0);
  }
  for (let i = 0; i < 7; i++) {
    await shakeCloud(page, i, total + 400);
    expect((await state(page)).clouds[i].revealed).toBe(true);
    expect((await state(page)).clouds[i].opacity).toBe(1);
  }
  await page.screenshot({ path: 'test-results/06-slippery-letters.png' });
  if (checkMechanics) {
    // A quick rightward release gives a letter rightward momentum, even after it slept.
    await page.clock.runFor(1800);
    let c = (await state(page)).clouds[0];
    const from = await at(page, c.x, c.y), start = await at(page, 350, 500), end = await at(page, 400, 500);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.clock.runFor(20);
    await page.mouse.move(start.x, start.y); await page.clock.runFor(40);
    await page.mouse.move(end.x, end.y); await page.clock.runFor(20); await page.mouse.up();
    await page.clock.runFor(30); c = (await state(page)).clouds[0];
    expect(c.vx).toBeGreaterThan(0);
    const dropped = c.x; await page.clock.runFor(150);
    expect((await state(page)).clouds[0].x).toBeGreaterThan(dropped + 10);
    // A gentle drop stays put; a complete row in the wrong order does not win.
    for (let i = 0; i < 7; i++) {
      const index = (await state(page)).clouds.findIndex(c => c.char === 'N O T X I R B'.split(' ')[i]);
      await gentleDrop(page, index, 204 + i * 112, 555);
    }
    await page.clock.runFor(1000);
    expect((await state(page)).stage).toBe('brixton'); expect((await state(page)).busy).toBe(false);
    expect((await state(page)).clouds.every(c => Math.abs(c.vx) < .1 && Math.abs(c.vy) < .1)).toBe(true);
  }
  // Move to separate staging slots first, avoiding overlaps with unplaced letters.
  for (let i = 0; i < 7; i++) await gentleDrop(page, i, 150 + i * 125, 280);
  for (let i = 0; i < 7; i++) {
    const index = (await state(page)).clouds.findIndex(c => c.char === 'BRIXTON'[i]);
    const x = mode === 'hard' ? [55, 145, 250, 420, 680, 880, 1055][i] : 204 + i * 112;
    const y = (mode === 'hard' ? 140 : 555) + (i % 2 ? 5 : -5);
    await gentleDrop(page, index, x, y);
    const dropped = (await state(page)).clouds[index];
    // Pointer coordinates round to screen pixels before camera scaling.
    expect(Math.abs(dropped.x - x)).toBeLessThan(2); expect(Math.abs(dropped.y - y)).toBeLessThan(2);
  }
  await page.screenshot({ path: 'test-results/07-brixton-row.png' });
  if (checkMechanics) {
    await page.clock.runFor(5200);
    expect((await state(page)).endingFade).toBe(1);
    await page.screenshot({ path: 'test-results/08-white-before-ending.png' });
    const tones = await page.evaluate(() => (window as unknown as { __toneCount: number }).__toneCount);
    await page.clock.runFor(4800);
    expect(await page.evaluate(() => (window as unknown as { __toneCount: number }).__toneCount)).toBe(tones);
  } else await page.clock.runFor(10000);
  await page.clock.resume();
}

test('complete the game through real clicks and drags, including error and wraparound', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('hunter-language', 'en'));
  await page.addInitScript(() => {
    const counter = window as unknown as { __toneCount: number }; counter.__toneCount = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { counter.__toneCount++; return original.call(this); };
  });
  await page.clock.install();
  await open(page, 'medium');
  await expect(page.locator('#interface')).toBeHidden();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/00-black.png' });
  // Medium counts clicks anywhere, including separate corners.
  for (let i = 0; i < 6; i++) await click(page, 80 + i * 160, 200 + (i % 2) * 250);
  expect((await state(page)).stage).toBe('glass');
  await click(page, 540, 330);
  await ready(page, 'hunter');
  await expect(page.locator('#instruction')).toBeHidden();
  await expect(page.locator('#detail')).toBeVisible();
  await page.screenshot({ path: 'test-results/01-hunter.png' });
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  expect((await state(page)).sound).toBe(false);
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  expect((await state(page)).sound).toBe(true);
  await setLetters(page, [0, 1, 2, 4, 5, 6], 7);
  expect((await state(page)).busy).toBe(false);
  await setLetters(page, [5, 6, 0, 1, 2, 3], 7);
  await ready(page, 'viola');
  await expect(page.locator('#instruction')).toBeHidden(); await expect(page.locator('#detail')).toBeHidden();
  expect((await state(page)).letters.every(letter => letter.label === '')).toBe(true);
  await page.screenshot({ path: 'test-results/02-viola.png' });
  await setLetters(page, [0, 0, 0, 0, 0], 4);
  await ready(page, 'whitney');
  await expect(page.locator('#instruction')).toBeHidden(); await expect(page.locator('#detail')).toBeHidden();
  expect((await state(page)).letters.every(letter => letter.label === '')).toBe(true);
  await setLetters(page, Array(7).fill(0), 5);
  expect((await state(page)).wrongAttempts).toBe(1);
  await expect(page.locator('#instruction')).toBeHidden();
  await page.waitForTimeout(500); // Let the error shake settle before changing size.
  await setLetters(page, Array(7).fill(2), 5);
  await ready(page, 'elliott');
  await expect(page.locator('#instruction')).toBeHidden(); await expect(page.locator('#detail')).toBeHidden();
  expect((await state(page)).texts.filter(text => text.trim())).toEqual([]);
  await page.screenshot({ path: 'test-results/04-elliott.png' });
  // A released stroke stays where it is even when it is not part of a letter yet.
  let s = await state(page);
  const p0 = await at(page, s.pieces[0].x, s.pieces[0].y), loose = await at(page, 110, 420);
  await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(loose.x, loose.y, { steps: 12 }); await page.mouse.up();
  s = await state(page);
  expect(s.pieces[0].x).toBeCloseTo(110, 0); expect(s.pieces[0].placed).toBe(false);
  // Rebuild with offsets; exact contact and pixel-perfect placement are unnecessary.
  for (let i = 0; i < s.pieces.length; i++) {
    const current = await state(page), piece = current.pieces[i];
    const target = current.targets.find(t => t.id === piece.id)!;
    const from = await at(page, piece.x, piece.y), to = await at(page, target.x + 9, target.y + 8);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
    await page.waitForTimeout(150);
  }
  expect((await state(page)).targets.filter(t => t.placed)).toHaveLength(12);
  await finishBrixton(page, true);
  await ready(page, 'ending');
  await page.screenshot({ path: 'test-results/09-ending.png' });
  await expect(page.locator('#announcement')).toContainText('GET BACK TO WORK, KIDS!');
  expect((await state(page)).texts).toContain('GET BACK TO WORK,\nKIDS!');
  await page.getByRole('button', { name: 'Play again' }).click();
  await ready(page, 'glass');
  await expect(page.locator('#interface')).toBeHidden();
  expect((await state(page)).cracks).toBe(0);
  expect(errors).toEqual([]);
});

test('touch input, resize, settings, keyboard letters, and restart work', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, hasTouch: true });
  const page = await context.newPage();
  await open(page);
  for (let i = 0; i < 3; i++) { const p = await at(page, 480, 300); await page.touchscreen.tap(p.x, p.y); }
  await ready(page, 'hunter');
  await page.locator('#effects').click();
  expect((await state(page)).reduced).toBe(true);
  const initial = (await state(page)).letters[0].value;
  const button = page.locator('#letter-controls button').first();
  await button.focus(); await page.keyboard.press('Enter');
  expect((await state(page)).letters[0].value).toBe((initial + 1) % 7);
  await page.setViewportSize({ width: 1180, height: 720 });
  await expect.poll(async () => (await state(page)).camera.width).toBe(1180);
  await page.locator('#restart').click();
  await expect(page.getByRole('heading', { name: 'On recommence du début?' })).toBeVisible();
  await page.locator('#cancel-restart').click();
  expect((await state(page)).stage).toBe('hunter');
  await page.locator('#restart').click();
  await page.locator('#confirm-restart').click();
  await ready(page, 'glass');
  await page.reload(); await open(page);
  expect((await state(page)).reduced).toBe(true);
  await context.close();
});

test('touch dragging reconstructs the word and reduced effects reaches a soft ending', async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.clock.install();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  expect((await state(page)).reduced).toBe(true);
  for (let i = 0; i < 3; i++) { const p = await at(page, 400, 300); await page.touchscreen.tap(p.x, p.y); }
  await ready(page, 'hunter');
  await expect(page.locator('#instruction')).toHaveText('Mets les couleurs de l’arc-en-ciel dans l’ordre.');
  await setLetters(page, [0, 1, 2, 3, 4, 5], 7);
  await ready(page, 'viola');
  await expect(page.locator('#instruction')).toHaveText('Il y a quelque chose de travers.');
  await setLetters(page, Array(5).fill(0), 4);
  await ready(page, 'whitney');
  expect((await state(page)).letters.map(l => l.label)).toEqual(['TP', 'TG', 'P', 'G', 'TP', 'TG', 'P']);
  await setLetters(page, Array(7).fill(2), 5);
  await ready(page, 'elliott');
  await expect(page.locator('#instruction')).toHaveText('Reconstruis ELLIOTT.');
  const cdp = await context.newCDPSession(page);
  for (let i = 0; i < 12; i++) {
    const current = await state(page), piece = current.pieces[i], target = current.targets[i];
    const from = await at(page, piece.x, piece.y), to = await at(page, target.x - 8, target.y + 8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10, id: 1 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  expect((await state(page)).targets.filter(t => t.placed)).toHaveLength(12);
  await finishBrixton(page);
  await ready(page, 'ending');
  await expect(page.getByRole('button', { name: 'Rejouer' })).toBeVisible();
  expect((await state(page)).texts).toContain('AU TRAVAIL,\nLES JEUNES !');
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await state(page)).texts).toContain('GET BACK TO WORK,\nKIDS!');
  expect((await state(page)).stage).toBe('ending');
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('French is the default, switching preserves play, and the choice is remembered on both pages', async ({ page }) => {
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
  await expect(page).toHaveTitle('Le jeu de Hunter');
  await expect(page.locator('#language')).toBeHidden();
  await click(page, 540, 330);
  await expect(page.locator('#instruction')).toHaveText('Tout commence par une fissure.');
  await expect(page.locator('#announcement')).toContainText('1 fissure.');
  await page.getByRole('button', { name: 'Passer en anglais' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#instruction')).toHaveText('Everything starts with a crack.');
  await expect(page.locator('#announcement')).toContainText('1 crack.');
  expect((await state(page)).cracks).toBe(1);
  for (let i = 0; i < 2; i++) await click(page, 540, 330);
  await ready(page, 'hunter');
  await click(page, 250, 330);
  const values = (await state(page)).letters.map(l => l.value);
  await page.locator('#language').click();
  expect((await state(page)).letters.map(l => l.value)).toEqual(values);
  expect((await state(page)).letters.map(l => l.label)).toEqual(['VIOLET', 'JAUNE', 'ROUGE', 'VIOLET', 'ORANGE', 'BLEU']);
  await expect(page.locator('#letter-controls button').first()).toContainText('lettre 1');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', 'Casse la vitre noire en cliquant ou en appuyant sur Entrée.');
  await page.locator('#language').click();
  expect((await state(page)).letters.map(l => l.value)).toEqual(values);
  expect((await state(page)).letters.map(l => l.label)).toEqual(['VIOLET', 'YELLOW', 'RED', 'VIOLET', 'ORANGE', 'BLUE']);
  await page.reload(); await ready(page, 'glass');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#interface')).toBeHidden();
  await page.goto('/credits.html');
  await expect(page.getByRole('heading', { name: 'Made with a little help.' })).toBeVisible();
  await page.locator('#language').click();
  await expect(page.getByRole('heading', { name: 'Avec un petit coup de main.' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
  await page.getByRole('link', { name: 'Retour au jeu' }).click();
  await ready(page, 'glass');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
});

test('language choice still works when browser storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
  });
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
  await click(page, 540, 330);
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await state(page)).cracks).toBe(1);
});

test('difficulty menu dodges the cursor and Hard glass requires ten nearby clicks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hunter-language', 'en'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose your difficulty.' })).toBeVisible();
  await expect(page.locator('#impossible')).toBeDisabled();
  for (let i = 0; i < 8; i++) {
    const before = (await page.locator('#impossible').boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    const after = (await page.locator('#impossible').boundingBox())!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(100);
    expect(after.x).toBeGreaterThanOrEqual(0); expect(after.y).toBeGreaterThanOrEqual(0);
    expect(after.x + after.width).toBeLessThanOrEqual(1366); expect(after.y + after.height).toBeLessThanOrEqual(768);
  }
  expect((await state(page)).difficulty).toBeNull(); expect((await state(page)).cracks).toBe(0);
  await page.locator('[data-difficulty="hard"]').click();
  for (let i = 0; i < 10; i++) await click(page, 70 + i * 100, i % 2 ? 200 : 500);
  expect((await state(page)).stage).toBe('glass');
  for (let i = 0; i < 9; i++) await click(page, 540, 330);
  expect((await state(page)).stage).toBe('glass'); expect((await state(page)).busy).toBe(false);
  await expect(page.locator('#instruction')).toBeHidden(); await expect(page.locator('#detail')).toBeHidden(); await expect(page.locator('#chapter')).toBeHidden();
  await click(page, 540, 330); await ready(page, 'hunter');
  await page.locator('#restart').click(); await page.locator('#confirm-restart').click(); await ready(page, 'glass');
  await expect(page.locator('#difficulty-menu')).toBeVisible(); expect((await state(page)).difficulty).toBeNull();
});

test('Hard random colours, moving VIOLA, tighter reconstruction, and hidden cloud hints remain solvable', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('hunter-language', 'en'));
  await page.clock.install(); await open(page, 'hard');
  for (let i = 0; i < 10; i++) await click(page, 540, 330);
  await ready(page, 'hunter');
  const jumps: number[] = [];
  for (let i = 0; i < 12; i++) {
    const before = (await state(page)).letters[0]; await click(page, before.x, before.y);
    const after = (await state(page)).letters[0]; jumps.push((after.value - before.value + 7) % 7);
  }
  expect(jumps.every(jump => jump > 0)).toBe(true); expect(jumps.some(jump => jump !== 1)).toBe(true);
  expect((await state(page)).letters.every(letter => letter.label === '')).toBe(true);
  for (let i = 0; i < 6; i++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const current = await state(page); if (current.busy || current.letters[i].value === i) break;
      await click(page, current.letters[i].x, current.letters[i].y);
    }
  }
  await ready(page, 'viola');
  const initial = (await state(page)).letters.map(letter => letter.value);
  expect(initial.every(value => [1, 2, 3].includes(value))).toBe(true);
  await expect.poll(async () => (await state(page)).letters.map(letter => letter.value).join() !== initial.join()).toBe(true);
  for (let attempt = 0; attempt < 12 && (await state(page)).letters[0].value !== 0; attempt++) await click(page, 308, 330);
  expect((await state(page)).letters[0].value).toBe(0);
  await page.waitForTimeout(2300); expect((await state(page)).letters[0].value).toBe(0);
  for (let i = 1; i < 5; i++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const current = await state(page); if (current.busy || current.letters[i].value === 0) break;
      await click(page, current.letters[i].x, current.letters[i].y);
    }
  }
  await ready(page, 'whitney');
  await setLetters(page, Array(7).fill(0), 5);
  await expect(page.locator('#instruction')).toBeHidden(); await expect(page.locator('#detail')).toBeHidden();
  await page.waitForTimeout(500); await setLetters(page, Array(7).fill(2), 5);
  await ready(page, 'elliott');
  expect((await state(page)).texts.filter(text => text.trim())).toEqual([]);
  let current = await state(page);
  expect(current.pieces.some((piece, i) => Math.abs(piece.x - (100 + i * 80)) > 25)).toBe(true);
  expect(new Set(current.pieces.map(piece => Math.round(piece.y))).size).toBeGreaterThan(2);
  const first = current.pieces[0], target = current.targets[0];
  let from = await at(page, first.x, first.y), to = await at(page, target.x + 30, target.y + 25);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up();
  expect((await state(page)).pieces[0].placed).toBe(false);
  for (let i = 0; i < 12; i++) {
    current = await state(page); const piece = current.pieces[i], goal = current.targets[i];
    from = await at(page, piece.x, piece.y); to = await at(page, goal.x + 4, goal.y + 4);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(150);
  }
  expect((await state(page)).targets.filter(target => target.placed)).toHaveLength(12);
  await finishBrixton(page);
  await ready(page, 'ending'); expect((await state(page)).texts).toContain('GET BACK TO WORK,\nKIDS!');
  await page.getByRole('button', { name: 'Play again' }).click(); await ready(page, 'glass');
  await expect(page.locator('#difficulty-menu')).toBeVisible(); expect(errors).toEqual([]);
});
