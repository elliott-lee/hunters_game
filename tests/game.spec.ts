import { test, expect, type Page } from '@playwright/test';

type Snapshot = {
  stage: string; busy: boolean; cracks: number; wrongAttempts: number; reduced: boolean; sound: boolean; locale: string; texts: string[];
  letters: { char: string; x: number; y: number; value: number; label: string }[];
  pieces: { id: number; x: number; y: number; width: number; height: number; placed: boolean }[];
  targets: { id: number; x: number; y: number; width: number; height: number; placed?: boolean }[];
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
async function open(page: Page) {
  await page.goto('/');
  await expect.poll(async () => (await state(page))?.stage).toBe('glass');
}

test('complete the game through real clicks and drags, including error and wraparound', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('hunter-language', 'en'));
  await open(page);
  await expect(page.locator('#interface')).toBeHidden();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/00-black.png' });
  // Eleven distributed clicks do not break the surface.
  for (let i = 0; i < 11; i++) await click(page, 40 + i * 95, 180 + (i % 2) * 280);
  expect((await state(page)).stage).toBe('glass');
  for (let i = 0; i < 11; i++) await click(page, 540 + i % 3 * 3, 330 + i % 2 * 3);
  await ready(page, 'hunter');
  await page.screenshot({ path: 'test-results/01-hunter.png' });
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  expect((await state(page)).sound).toBe(false);
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  expect((await state(page)).sound).toBe(true);
  await setLetters(page, [0, 1, 2, 4, 5, 6], 7);
  expect((await state(page)).busy).toBe(false);
  await setLetters(page, [5, 6, 0, 1, 2, 3], 7);
  await ready(page, 'viola');
  await page.screenshot({ path: 'test-results/02-viola.png' });
  await setLetters(page, [0, 0, 0, 0, 0], 4);
  await ready(page, 'whitney');
  await setLetters(page, Array(7).fill(0), 5);
  expect((await state(page)).wrongAttempts).toBe(1);
  await expect(page.locator('#instruction')).toContainText('think medium');
  await page.waitForTimeout(500); // Let the error shake settle before changing size.
  await setLetters(page, Array(7).fill(2), 5);
  await ready(page, 'elliott');
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
  await ready(page, 'ending');
  await page.screenshot({ path: 'test-results/05-ending.png' });
  await expect(page.locator('#announcement')).toContainText('Back to work, kids!');
  expect((await state(page)).texts).toContain('Back to work,\nkids!');
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
  for (let i = 0; i < 11; i++) { const p = await at(page, 480, 300); await page.touchscreen.tap(p.x, p.y); }
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
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  expect((await state(page)).reduced).toBe(true);
  for (let i = 0; i < 11; i++) { const p = await at(page, 400, 300); await page.touchscreen.tap(p.x, p.y); }
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
  await ready(page, 'ending');
  await expect(page.getByRole('button', { name: 'Rejouer' })).toBeVisible();
  expect((await state(page)).texts).toContain('Au travail,\nles jeunes !');
  await page.locator('#language').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await state(page)).texts).toContain('Back to work,\nkids!');
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
  for (let i = 0; i < 10; i++) await click(page, 540, 330);
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
