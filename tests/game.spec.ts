import { test, expect, type Page } from '@playwright/test';

type Snapshot = {
  stage: string; busy: boolean; cracks: number; wrongAttempts: number; reduced: boolean; sound: boolean;
  letters: { char: string; x: number; y: number; value: number }[];
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
  await expect(page.locator('#announcement')).toContainText('Au travail, les jeunes !');
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
  await page.getByRole('button', { name: 'Reduce effects', exact: true }).click();
  expect((await state(page)).reduced).toBe(true);
  const initial = (await state(page)).letters[0].value;
  const button = page.locator('#letter-controls button').first();
  await button.focus(); await page.keyboard.press('Enter');
  expect((await state(page)).letters[0].value).toBe((initial + 1) % 7);
  await page.setViewportSize({ width: 1180, height: 720 });
  await expect.poll(async () => (await state(page)).camera.width).toBe(1180);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  expect((await state(page)).stage).toBe('hunter');
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
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
  await setLetters(page, [0, 1, 2, 3, 4, 5], 7);
  await ready(page, 'viola');
  await setLetters(page, Array(5).fill(0), 4);
  await ready(page, 'whitney');
  await setLetters(page, Array(7).fill(2), 5);
  await ready(page, 'elliott');
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
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
