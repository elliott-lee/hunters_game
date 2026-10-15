import Phaser from 'phaser';
const GLYPHS: Record<string, string[]> = {
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  N: ['10001','11001','11001','10101','10011','10011','10001'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  E: ['11111','10000','10000','11111','10000','10000','11111'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  I: ['00100','00100','00100','00100','00100','00100','00100'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  W: ['10001','10001','10001','10101','10101','10101','01010'],
  Y: ['10001','10001','01010','00100','00100','00100','00100']
};
export function glyph(scene: Phaser.Scene, letter: string, cell = 12): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0);
  const shadow = scene.add.graphics().fillStyle(0x000000, .22);
  const face = scene.add.graphics().fillStyle(0xffffff);
  GLYPHS[letter].forEach((row, y) => [...row].forEach((pixel, x) => {
    if (pixel === '1') {
      shadow.fillRect((x - 2.5) * cell + 4, (y - 3.5) * cell + 6, cell, cell);
      face.fillRect((x - 2.5) * cell, (y - 3.5) * cell, cell, cell);
    }
  }));
  root.add([shadow, face]);
  root.setData('face', face);
  return root;
}
export function paintGlyph(container: Phaser.GameObjects.Container, letter: string, colour: number, cell = 12) {
  const face = container.getData('face') as Phaser.GameObjects.Graphics;
  face.clear().fillStyle(colour);
  GLYPHS[letter].forEach((row, y) => [...row].forEach((pixel, x) => {
    if (pixel === '1') face.fillRect((x - 2.5) * cell, (y - 3.5) * cell, cell, cell);
  }));
}
export function litPixels(letter: string, cell = 12) {
  const pixels: { x: number; y: number }[] = [];
  GLYPHS[letter].forEach((row, y) => [...row].forEach((p, x) => { if (p === '1') pixels.push({ x: (x - 2) * cell, y: (y - 3) * cell }); }));
  return pixels;
}
