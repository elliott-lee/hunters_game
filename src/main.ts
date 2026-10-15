import Phaser from 'phaser';
import { Delaunay } from 'd3-delaunay';
import { Audio } from './audio';
import { glyph, paintGlyph } from './glyphs';
import { RAINBOW, COLOUR_NAMES, SIZES, SIZE_NAMES, rainbowSolved, rotationsSolved, sizeResult, nearbyCracks, matchingStroke, type Point, type Stroke } from './rules';
import { t, locale, bindLanguageControl, onLocaleChange, type TranslationKey, type TranslationParams, type Message } from './i18n';
import './style.css';

type Stage = 'glass' | 'hunter' | 'viola' | 'whitney' | 'elliott' | 'ending';
type Letter = { char: string; stage: Stage; x: number; y: number; value: number; art: Phaser.GameObjects.Container; hit: Phaser.GameObjects.Zone; label: Phaser.GameObjects.Text };
type Piece = Stroke & { art: Phaser.GameObjects.Container; hit: Phaser.GameObjects.Rectangle };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new Audio();
bindLanguageControl();
let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
try { const stored = localStorage.getItem('hunter-reduced'); if (stored !== null) reduced = stored === 'true'; } catch { /* Storage is optional. */ }
const BACKGROUNDS: Record<Stage, number> = { glass: 0x000000, hunter: 0x190b2d, viola: 0x6b163f, whitney: 0x8e390f, elliott: 0xfffcf5, ending: 0x000000 };
const STAGES: Stage[] = ['glass', 'hunter', 'viola', 'whitney', 'elliott'];
const META: Record<Stage, [TranslationKey, TranslationKey, TranslationKey]> = {
  glass: ['chapterGlass', 'instructionGlass', 'detailGlass'],
  hunter: ['chapterHunter', 'instructionHunter', 'detailHunter'],
  viola: ['chapterViola', 'instructionViola', 'detailViola'],
  whitney: ['chapterWhitney', 'instructionWhitney', 'detailWhitney'],
  elliott: ['chapterElliott', 'instructionElliott', 'detailElliott'],
  ending: ['chapterEnding', 'empty', 'empty']
};

class Puzzle extends Phaser.Scene {
  stage: Stage = 'glass';
  busy = false;
  letters: Letter[] = [];
  cracks: Point[] = [];
  targets: Stroke[] = [];
  pieces: Piece[] = [];
  wrongAttempts = 0;
  private backdrop!: Phaser.GameObjects.Rectangle;
  private cracksArt!: Phaser.GameObjects.Graphics;
  private shardArt!: Phaser.GameObjects.Graphics;
  private shards: { body: MatterJS.BodyType; colour: number }[] = [];
  private lastPointer?: Point;
  private dragOffset: Point = { x: 0, y: 0 };
  private dragPiece?: Piece;
  private selectedPiece?: number;
  private message?: Message;
  private announcement?: Message;

  constructor() { super('puzzle'); }
  preload() {
    this.load.svg('unicorn', '/assets/unicorn.svg', { width: 128, height: 128 });
    this.load.svg('rainbow', '/assets/rainbow.svg', { width: 128, height: 128 });
  }
  create() {
    this.stage = 'glass'; this.busy = false; this.letters = []; this.pieces = []; this.targets = []; this.cracks = []; this.shards = []; this.wrongAttempts = 0;
    this.selectedPiece = undefined; this.dragPiece = undefined;
    this.message = undefined; this.announcement = undefined;
    $('announcement').textContent = '';
    $('interface').classList.remove('ending');
    this.cameras.main.setBackgroundColor('#000000');
    this.resize();
    this.scale.on('resize', this.resize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.resize, this));
    const unbindLocale = onLocaleChange(() => this.refreshTranslations());
    this.events.once('shutdown', unbindLocale);
    this.backdrop = this.add.rectangle(540, 360, 20000, 20000, 0x000000).setDepth(-100);
    this.cracksArt = this.add.graphics();
    this.shardArt = this.add.graphics().setDepth(20);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.stage === 'glass' && !this.busy) this.crack(pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2);
    });
    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, hit: Phaser.GameObjects.Rectangle) => {
      if (this.busy) return;
      const piece = this.pieces.find(p => p.hit === hit);
      if (!piece) return;
      this.tweens.killTweensOf(piece.art);
      this.dragPiece = piece;
      const at = pointer.positionToCamera(this.cameras.main) as Point;
      this.dragOffset = { x: piece.art.x - at.x, y: piece.art.y - at.y };
      piece.art.setDepth(15).setScale(1.06);
    });
    this.input.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragPiece || this.busy) return;
      const at = pointer.positionToCamera(this.cameras.main) as Point;
      this.movePiece(this.dragPiece, at.x + this.dragOffset.x, at.y + this.dragOffset.y);
    });
    this.input.on('dragend', () => {
      if (!this.dragPiece) return;
      this.dragPiece.art.setScale(1).setDepth(3);
      this.drop(this.dragPiece); this.dragPiece = undefined;
    });
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('button, input, select, textarea') || $('restart-dialog').hasAttribute('open')) return;
      if (this.stage === 'glass' && (event.code === 'Space' || event.code === 'Enter')) {
        event.preventDefault(); if (!event.repeat && !this.busy) this.crack({ x: 540, y: 330 });
      }
      if (this.stage === 'elliott' && this.selectedPiece !== undefined && !this.busy) {
        const piece = this.pieces[this.selectedPiece];
        if (!piece || piece.placed) return;
        const amount = event.shiftKey ? 3 : 12;
        const deltas: Record<string, Point> = { ArrowLeft: { x: -amount, y: 0 }, ArrowRight: { x: amount, y: 0 }, ArrowUp: { x: 0, y: -amount }, ArrowDown: { x: 0, y: amount } };
        if (deltas[event.code]) {
          event.preventDefault(); this.movePiece(piece, piece.x + deltas[event.code].x, piece.y + deltas[event.code].y);
        } else if (event.code === 'Enter' || event.code === 'Space') { event.preventDefault(); this.drop(piece); }
      }
    });
    $('interface').hidden = true; $('replay').hidden = true; $('letter-controls').replaceChildren();
    this.updateUI();
    document.querySelector('canvas')?.setAttribute('aria-label', t('canvasLabel'));
    if (import.meta.env.DEV) {
      // Read-only observations for browser tests. There are no stage-skip or solve hooks.
      Object.defineProperty(window, '__game', { configurable: true, get: () => this.snapshot() });
    }
  }
  resize() {
    const zoom = Math.min(this.scale.width / 1080, this.scale.height / 720);
    this.cameras.main.setZoom(zoom).centerOn(540, 360);
  }
  private snapshot() {
    return { stage: this.stage, busy: this.busy, cracks: this.cracks.length, wrongAttempts: this.wrongAttempts,
      letters: this.letters.map(l => ({ char: l.char, x: l.x, y: l.y, value: l.value, label: l.label.text })),
      pieces: this.pieces.map(p => ({ id: p.id, x: p.x, y: p.y, width: p.width, height: p.height, placed: !!p.placed })),
      targets: this.targets.map(t => ({ ...t })), reduced, sound: audio.enabled, locale: locale(),
      texts: this.children.list.filter(o => o instanceof Phaser.GameObjects.Text).map(o => (o as Phaser.GameObjects.Text).text),
      camera: { zoom: this.cameras.main.zoom, width: this.scale.width, height: this.scale.height } };
  }
  update() {
    if (!this.shardArt) return;
    this.shardArt.clear();
    for (const shard of this.shards) {
      this.shardArt.fillStyle(shard.colour).lineStyle(1, 0x70677e, .5);
      this.shardArt.fillPoints(shard.body.vertices as Phaser.Types.Math.Vector2Like[], true);
      this.shardArt.strokePoints(shard.body.vertices as Phaser.Types.Math.Vector2Like[], true);
    }
  }
  private updateUI(key?: TranslationKey, params?: TranslationParams) {
    this.message = key ? { key, params } : undefined;
    const [chapter, instruction, detail] = META[this.stage];
    $('chapter').textContent = t(chapter);
    $('instruction').textContent = t(key ?? instruction, params);
    $('detail').textContent = t(detail);
    $('interface').classList.toggle('light', this.stage === 'elliott' || this.stage === 'ending');
    const current = STAGES.indexOf(this.stage);
    const names: TranslationKey[] = ['nameGlass', 'nameHunter', 'nameViola', 'nameWhitney', 'nameElliott'];
    $('progress').replaceChildren(...STAGES.map((_s, i) => {
      const step = document.createElement('span');
      step.className = `step ${i < current ? 'done' : i === current ? 'current' : ''}`;
      step.title = t(names[i]);
      step.setAttribute('aria-label', `${t(names[i])}: ${t(i < current ? 'statusComplete' : i === current ? 'statusCurrent' : 'statusUpcoming')}`);
      return step;
    }));
    $('sound').textContent = t(audio.enabled ? 'soundOn' : 'soundOff');
    $('effects').setAttribute('aria-pressed', String(reduced));
    $('effects').textContent = t(reduced ? 'effectsReduced' : 'effectsNormal');
  }
  private announce(key: TranslationKey, params?: TranslationParams) {
    this.announcement = { key, params }; $('announcement').textContent = t(key, params);
  }
  private localizedText(x: number, y: number, key: TranslationKey, style: Phaser.Types.GameObjects.Text.TextStyle) {
    return this.add.text(x, y, t(key), style).setData('i18nKey', key);
  }
  private refreshTranslations() {
    this.updateUI(this.message?.key, this.message?.params);
    for (const l of this.letters) this.labelLetter(l, l.stage);
    for (const child of this.children.list) {
      if (child instanceof Phaser.GameObjects.Text && child.getData('i18nKey')) child.setText(t(child.getData('i18nKey')));
    }
    if (this.announcement) this.announce(this.announcement.key, this.announcement.params);
    if (!this.busy) {
      if (['hunter', 'viola', 'whitney'].includes(this.stage)) this.keyboardLetters();
      else if (this.stage === 'elliott') this.pieceControls();
    }
  }
  crack(at: Point) {
    if (this.stage !== 'glass' || this.busy) return;
    $('interface').hidden = false;
    audio.unlock();
    this.cracks.push(at); this.lastPointer = at;
    const strength = nearbyCracks(this.cracks, at);
    const g = this.cracksArt;
    const seed = new Phaser.Math.RandomDataGenerator([String(this.cracks.length), `${at.x},${at.y}`]);
    for (let arm = 0; arm < 6; arm++) {
      let x = at.x, y = at.y;
      const angle = (Math.PI * 2 * arm / 6) + seed.frac() * .6;
      const length = 24 + strength * 5 + seed.frac() * 30;
      g.lineStyle(strength > 6 ? 1.8 : 1, 0xc4b6d2, .3 + strength * .045);
      g.beginPath().moveTo(x, y);
      for (let step = 0; step < 4; step++) {
        x += Math.cos(angle + (seed.frac() - .5) * .7) * length / 4;
        y += Math.sin(angle + (seed.frac() - .5) * .7) * length / 4;
        g.lineTo(x, y);
        if (step === 2) {
          g.strokePath();
          g.lineBetween(x, y, x + Math.cos(angle + .8) * length * .3, y + Math.sin(angle + .8) * length * .3);
          g.beginPath().moveTo(x, y);
        }
      }
      g.strokePath();
    }
    this.ring(at.x, at.y, 0xece2ff, 24, .15);
    audio.crack();
    this.announce('cracks', { count: strength });
    if (strength >= 11) this.breakGlass();
  }
  private breakGlass() {
    this.busy = true; this.updateUI('otherSide');
    this.cracksArt.clear();
    this.makeBackdrop('hunter', false);
    this.word('HUNTER', 'hunter');
    const zoom = this.cameras.main.zoom;
    const left = 540 - this.scale.width / zoom / 2, top = 360 - this.scale.height / zoom / 2;
    const right = 1080 - left, bottom = 720 - top;
    const points: [number, number][] = [];
    const at = this.lastPointer ?? { x: 540, y: 330 };
    for (let i = 0; i < 75; i++) points.push([Phaser.Math.Between(left, right), Phaser.Math.Between(top, bottom)]);
    for (let i = 0; i < 22; i++) points.push([at.x + Phaser.Math.Between(-150, 150), at.y + Phaser.Math.Between(-150, 150)]);
    const cells = Delaunay.from(points).voronoi([left, top, right, bottom]);
    for (const cell of cells.cellPolygons()) {
      const vertices = cell.slice(0, -1).map(([x, y]) => ({ x, y }));
      const cx = vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length;
      const cy = vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length;
      const body = this.matter.add.fromVertices(cx, cy, vertices, { frictionAir: .012, restitution: .1, collisionFilter: { mask: 0 } });
      this.matter.body.setVelocity(body, { x: (cx - at.x) * .012, y: -Phaser.Math.Between(1, 4) });
      this.matter.body.setAngularVelocity(body, reduced ? 0 : Phaser.Math.FloatBetween(-.035, .035));
      this.shards.push({ body, colour: Phaser.Utils.Array.GetRandom([0x050307, 0x0d0a10, 0x17111c]) });
    }
    audio.boom();
    if (!reduced) this.cameras.main.shake(180, .006);
    this.time.delayedCall(reduced ? 800 : 1700, () => {
      this.clearShards(); this.stage = 'hunter'; this.busy = false; this.scenery(); this.updateUI(); this.keyboardLetters();
    });
  }
  private clearShards() { for (const s of this.shards) this.matter.world.remove(s.body); this.shards = []; this.shardArt.clear(); }
  private makeBackdrop(stage: Stage, animate = true) {
    const colour = BACKGROUNDS[stage];
    if (animate && !reduced) {
      const from = Phaser.Display.Color.ValueToColor(this.backdrop.fillColor), to = Phaser.Display.Color.ValueToColor(colour);
      this.tweens.addCounter({ from: 0, to: 100, duration: 900, onUpdate: tween => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tween.getValue() ?? 100);
        this.backdrop.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      } });
    } else this.backdrop.setFillStyle(colour);
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', `#${colour.toString(16).padStart(6, '0')}`);
  }
  private scenery() {
    const ink = this.stage === 'elliott' ? 0x332b40 : 0xf6dcff;
    const line = this.add.graphics().lineStyle(1, ink, .12);
    line.lineBetween(165, 447, 915, 447);
    for (const x of [165, 915]) line.lineBetween(x, 442, x, 452);
    this.localizedText(540, 206, 'tagline', { fontFamily: 'monospace', fontSize: '10px', color: this.stage === 'elliott' ? '#776c7d' : '#ffffff' }).setAlpha(.4).setOrigin(.5).setLetterSpacing(2);
  }
  private word(text: string, stage: Stage) {
    this.letters = [];
    const initial = stage === 'hunter' ? [5, 2, 0, 6, 1, 4] : stage === 'viola' ? [1, 3, 2, 1, 3] : [0, 4, 1, 3, 0, 4, 1];
    const spacing = stage === 'whitney' ? 111 : 116;
    for (let i = 0; i < text.length; i++) {
      const x = 540 + (i - (text.length - 1) / 2) * spacing, y = 330;
      const art = glyph(this, text[i]).setPosition(x, y).setDepth(2);
      const hit = this.add.zone(x, y, 103, 154).setDepth(5).setInteractive({ useHandCursor: true });
      const label = this.add.text(x, 416, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' }).setOrigin(.5).setAlpha(.5);
      const letter = { char: text[i], stage, x, y, value: initial[i], art, hit, label };
      this.letters.push(letter);
      this.renderLetter(letter, stage, false);
      hit.on('pointerdown', () => this.clickLetter(i));
      hit.on('pointerover', () => { if (!this.busy) label.setAlpha(1); });
      hit.on('pointerout', () => label.setAlpha(.5));
    }
  }
  private renderLetter(l: Letter, stage = this.stage, animate = true) {
    this.tweens.killTweensOf(l.art);
    l.art.setX(l.x);
    this.labelLetter(l, stage);
    if (stage === 'hunter') {
      paintGlyph(l.art, l.char, RAINBOW[l.value]);
      if (animate && !reduced) { l.art.setScale(.9); this.tweens.add({ targets: l.art, scale: 1, duration: 170, ease: 'Back.Out' }); }
    } else if (stage === 'viola') {
      paintGlyph(l.art, l.char, 0xffdfef);
      const target = l.value * 90;
      if (animate && !reduced) {
        const from = l.art.angle;
        this.tweens.add({ targets: l.art, angle: from + 90, duration: 190, ease: 'Cubic.Out', onComplete: () => l.art.setAngle(target) });
      } else l.art.setAngle(target);
    } else if (stage === 'whitney') {
      paintGlyph(l.art, l.char, 0xffdfa6);
      if (animate && !reduced) this.tweens.add({ targets: l.art, scale: SIZES[l.value], duration: 200, ease: 'Back.Out' });
      else l.art.setScale(SIZES[l.value]);
    }
  }
  private labelLetter(l: Letter, stage: Stage) {
    if (stage === 'hunter') l.label.setText(t(COLOUR_NAMES[l.value]).toLocaleUpperCase(locale()));
    else if (stage === 'viola') l.label.setText(t(l.value === 0 ? 'upright' : 'turn'));
    else if (stage === 'whitney') l.label.setText(t(SIZE_NAMES[l.value]));
  }
  clickLetter(index: number) {
    if (this.busy || !['hunter', 'viola', 'whitney'].includes(this.stage)) return;
    const l = this.letters[index]; if (!l) return;
    l.value = (l.value + 1) % (this.stage === 'hunter' ? 7 : this.stage === 'viola' ? 4 : 5);
    this.renderLetter(l); audio.click(l.value);
    this.keyboardLetters();
    const values = this.letters.map(l => l.value);
    if (this.stage === 'hunter' && rainbowSolved(values)) this.explodeHunter();
    else if (this.stage === 'viola' && rotationsSolved(values)) this.celebrateViola();
    else if (this.stage === 'whitney') {
      const result = sizeResult(values);
      if (result === 'correct') this.meltWhitney();
      else if (result === 'wrong') {
        this.wrongAttempts++; audio.error(); this.updateUI('wrongSize'); this.announce('wrongSizeAnnouncement');
        if (!reduced) for (const letter of this.letters) this.tweens.add({ targets: letter.art, x: letter.x + 6, duration: 45, yoyo: true, repeat: 4 });
      } else this.updateUI();
    }
  }
  private keyboardLetters() {
    const controls = $('letter-controls');
    // Retain focus when a keyboard user changes a letter.
    const focused = controls.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.index : undefined;
    controls.replaceChildren();
    if (this.busy) return;
    this.letters.forEach((l, i) => {
      const button = document.createElement('button');
      const state = this.stage === 'hunter' ? t(COLOUR_NAMES[l.value]) : this.stage === 'viola' ? (l.value === 0 ? t('upright') : t('degrees', { angle: l.value * 90 })) : t(SIZE_NAMES[l.value]);
      button.textContent = t('letterControl', { letter: l.char, index: i + 1, state }); button.dataset.index = String(i);
      button.addEventListener('click', () => this.clickLetter(i)); controls.append(button);
    });
    if (focused !== undefined) controls.querySelector<HTMLButtonElement>(`[data-index="${focused}"]`)?.focus();
  }
  private ring(x: number, y: number, colour: number, radius = 90, alpha = .8) {
    const circle = this.add.circle(x, y, radius / 3).setStrokeStyle(2, colour).setAlpha(alpha).setDepth(12);
    this.tweens.add({ targets: circle, scale: 3, alpha: 0, duration: reduced ? 120 : 650, onComplete: () => circle.destroy() });
  }
  private particles(x: number, y: number, count: number, colours: number[], speed = 450, duration = 1200) {
    for (let i = 0; i < (reduced ? Math.min(count, 18) : count); i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2), distance = Phaser.Math.Between(speed / 4, speed);
      const particle = this.add.rectangle(x, y, Phaser.Math.Between(3, 12), Phaser.Math.Between(3, 12), Phaser.Utils.Array.GetRandom(colours)).setDepth(12);
      this.tweens.add({ targets: particle, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance + 100, angle: Phaser.Math.Between(-360, 360), alpha: 0, scale: .2, duration: Phaser.Math.Between(duration * .6, duration), ease: 'Cubic.Out', onComplete: () => particle.destroy() });
    }
  }
  private explodeHunter() {
    this.busy = true; this.keyboardLetters(); this.updateUI('spectrum'); audio.boom();
    for (const l of this.letters) { l.art.setVisible(false); l.label.setVisible(false); this.particles(l.x, l.y, 28, [RAINBOW[l.value], 0xffebbb], 520, 1300); }
    for (let i = 0; i < (reduced ? 5 : 28); i++) {
      const smoke = this.add.circle(Phaser.Math.Between(280, 800), Phaser.Math.Between(280, 390), Phaser.Math.Between(30, 70), 0x34213c, .5).setDepth(14);
      this.tweens.add({ targets: smoke, y: smoke.y - 150, scale: 3, alpha: 0, duration: 1700, delay: i * 12, onComplete: () => smoke.destroy() });
    }
    this.ring(540, 330, 0xffd9a0, 280);
    if (!reduced) this.cameras.main.shake(340, .015);
    this.time.delayedCall(reduced ? 650 : 1800, () => this.enter('viola'));
  }
  private celebrateViola() {
    this.busy = true; this.keyboardLetters(); this.updateUI('magic'); audio.magic();
    for (const l of this.letters) {
      l.art.setVisible(false); l.label.setVisible(false);
      this.particles(l.x, l.y, 22, RAINBOW, 460, 1800);
    }
    for (let i = 0; i < (reduced ? 4 : 15); i++) {
      const icon = this.add.image(Phaser.Math.Between(50, 1030), 650 + i * 30, i % 2 ? 'unicorn' : 'rainbow').setScale(Phaser.Math.FloatBetween(.4, .85)).setDepth(11);
      this.tweens.add({ targets: icon, x: icon.x + Phaser.Math.Between(-180, 180), y: -150, angle: Phaser.Math.Between(-90, 90), duration: reduced ? 700 : Phaser.Math.Between(1200, 2000), delay: i * 35, onComplete: () => icon.destroy() });
    }
    for (let i = 0; i < (reduced ? 12 : 50); i++) {
      const star = this.add.star(540, 330, 4, 2, Phaser.Math.Between(7, 14), i % 2 ? 0xffefa4 : 0xffffff).setDepth(12);
      this.tweens.add({ targets: star, x: Phaser.Math.Between(40, 1040), y: Phaser.Math.Between(60, 650), angle: 200, alpha: 0, duration: Phaser.Math.Between(700, 2000), onComplete: () => star.destroy() });
    }
    this.time.delayedCall(reduced ? 900 : 2600, () => this.enter('whitney'));
  }
  private meltWhitney() {
    this.busy = true; this.keyboardLetters(); this.updateUI('melting'); audio.success();
    for (const l of this.letters) {
      l.label.setVisible(false);
      for (let i = 0; i < 4; i++) {
        const drop = this.add.ellipse(l.x + Phaser.Math.Between(-22, 22), l.y + 20, Phaser.Math.Between(8, 15), 18, 0xffdfa6).setDepth(3);
        this.tweens.add({ targets: drop, y: 449, scaleY: 2.4, duration: reduced ? 200 : 700 + i * 170, delay: reduced ? 0 : i * 100 });
      }
      this.tweens.add({ targets: l.art, scaleY: .04, y: 446, duration: reduced ? 250 : 1500, ease: 'Sine.In' });
    }
    const puddle = this.add.ellipse(540, 453, 700, 12, 0xffdfa6).setDepth(5).setScale(.1);
    this.tweens.add({ targets: puddle, scaleX: 1.12, scaleY: 3, duration: reduced ? 250 : 1700 });
    this.time.delayedCall(reduced ? 350 : 1900, () => {
      for (const l of this.letters) l.art.setVisible(false);
      // The liquid is one group, so no detached drops are left behind.
      const liquid = this.children.list.filter(o => o !== this.backdrop && o !== this.shardArt && o !== this.cracksArt);
      this.tweens.add({ targets: liquid, x: '+=1500', duration: reduced ? 300 : 1100, ease: 'Cubic.In' });
      this.time.delayedCall(reduced ? 400 : 1200, () => this.enter('elliott'));
    });
  }
  private enter(stage: Stage) {
    this.tweens.killAll(); this.time.removeAllEvents(); this.clearShards();
    for (const object of [...this.children.list]) if (![this.backdrop, this.cracksArt, this.shardArt].includes(object as never)) object.destroy();
    this.stage = stage; this.busy = true; this.letters = []; this.makeBackdrop(stage); this.updateUI(); $('letter-controls').replaceChildren();
    this.scenery();
    if (stage === 'elliott') this.reconstruction();
    else {
      this.word(stage.toUpperCase(), stage);
      for (const l of this.letters) { l.art.setAlpha(0); this.tweens.add({ targets: l.art, alpha: 1, duration: 550 }); }
      this.time.delayedCall(reduced ? 200 : 950, () => { this.busy = false; this.keyboardLetters(); });
    }
  }
  private reconstruction() {
    this.targets = []; this.pieces = [];
    const spacing = 112, y = 300;
    const word = 'ELLIOTT';
    for (let letter = 0; letter < word.length; letter++) {
      const x = 540 + (letter - 3) * spacing;
      if (word[letter] === 'I' || word[letter] === 'O') {
        const fixed = glyph(this, word[letter]).setPosition(x, y);
        paintGlyph(fixed, word[letter], 0x302438);
        continue;
      }
      const shapes = word[letter] === 'E'
        ? [{ x: -24, y: 0, w: 12, h: 84 }, ...[-36, 0, 36].map(dy => ({ x: 6, y: dy, w: 48, h: 12 }))]
        : word[letter] === 'L'
          ? [{ x: -24, y: 0, w: 12, h: 84 }, { x: 6, y: 36, w: 48, h: 12 }]
          : [{ x: 0, y: -36, w: 60, h: 12 }, { x: 0, y: 6, w: 12, h: 72 }];
      for (const s of shapes) {
        const id = this.targets.length;
        const target: Stroke = { id, letter, x: x + s.x, y: y + s.y, width: s.w, height: s.h };
        this.targets.push(target);
        const art = this.add.container(target.x, target.y).setDepth(3);
        const shadow = this.add.rectangle(3, 4, s.w, s.h, 0x302438, .13);
        const ink = this.add.rectangle(0, 0, s.w, s.h, 0x302438);
        const hit = this.add.rectangle(0, 0, Math.max(s.w, 30), Math.max(s.h, 30), 0xffffff, 0).setInteractive({ useHandCursor: true });
        art.add([shadow, ink, hit]); this.input.setDraggable(hit);
        const piece = { ...target, art, hit };
        this.pieces.push(piece);
        // Distribute strokes into separate floor slots so every piece is reachable.
        const floorX = 100 + (id % 12) * 80, floorY = 540 + (id % 2) * 28;
        this.time.delayedCall(reduced ? 450 : 1400, () => {
          audio.crack();
          this.tweens.add({ targets: art, x: floorX, y: floorY, angle: reduced ? 0 : Phaser.Math.Between(-80, 80), duration: reduced ? 300 : 900, ease: 'Bounce.Out', delay: id * (reduced ? 0 : 25), onComplete: () => {
            piece.x = art.x; piece.y = art.y;
            this.tweens.add({ targets: art, angle: 0, duration: reduced ? 0 : 260 });
          } });
        });
      }
    }
    this.localizedText(540, 485, 'allPieces', { fontFamily: 'monospace', fontSize: '10px', color: '#a299a4' }).setOrigin(.5).setLetterSpacing(2);
    this.time.delayedCall(reduced ? 850 : 3050, () => { this.busy = false; this.pieceControls(); this.announce('dragInstructions'); });
  }
  private movePiece(piece: Piece, x: number, y: number) {
    piece.x = Phaser.Math.Clamp(x, 35, 1045); piece.y = Phaser.Math.Clamp(y, 150, 620);
    piece.art.setPosition(piece.x, piece.y);
  }
  private drop(piece: Piece) {
    if (this.busy) return;
    // Pieces can be repositioned after a successful placement.
    if (piece.placed) {
      const old = this.targets.find(t => t.id === piece.art.getData('target'));
      if (old) old.placed = false;
      piece.placed = false;
    }
    const target = matchingStroke(piece, this.targets);
    if (target) {
      target.placed = true; piece.placed = true; piece.art.setData('target', target.id);
      piece.x = target.x; piece.y = target.y;
      this.tweens.add({ targets: piece.art, x: target.x, y: target.y, duration: reduced ? 0 : 130 });
      audio.click(4);
      const count = this.targets.filter(t => t.placed).length;
      this.announce('strokesPlaced', { count, total: this.targets.length });
      this.updateUI(count === this.targets.length ? 'rebuilt' : 'piecesPlaced', { count, total: this.targets.length });
      if (count === this.targets.length) { this.finish(); return; }
    } else {
      // Unmatched pieces remain exactly where the player released them.
      audio.click(0); this.announce('pieceStays');
    }
    this.pieceControls();
  }
  private pieceControls() {
    const controls = $('letter-controls');
    const focused = controls.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.index : undefined;
    controls.replaceChildren();
    this.pieces.forEach((p, i) => {
      const button = document.createElement('button');
      button.dataset.index = String(i);
      button.textContent = t('pieceControl', { index: i + 1, direction: t(p.width > p.height ? 'horizontal' : 'vertical'), placed: p.placed ? t('placed') : '' });
      button.addEventListener('click', () => { this.selectedPiece = i; this.announce('pieceSelected'); button.blur(); });
      controls.append(button);
    });
    if (focused !== undefined) controls.querySelector<HTMLButtonElement>(`[data-index="${focused}"]`)?.focus();
  }
  private finish() {
    this.busy = true; this.selectedPiece = undefined; $('letter-controls').replaceChildren(); audio.success();
    this.time.delayedCall(reduced ? 500 : 1400, () => {
      $('interface').hidden = true;
      const curtain = this.add.rectangle(540, 360, 20000, 20000, 0x000000, 0).setDepth(50);
      this.tweens.add({ targets: curtain, alpha: 1, duration: reduced ? 900 : 2800, onComplete: () => {
        this.time.delayedCall(reduced ? 300 : 1100, () => {
          this.stage = 'ending';
          const showMessage = () => {
            const text = this.localizedText(540, 330, 'endingMessage', { fontFamily: 'monospace', fontSize: '69px', fontStyle: 'bold', color: '#241727', align: 'center', lineSpacing: 10 }).setOrigin(.5).setDepth(51);
            if (reduced) { text.setAlpha(0); this.tweens.add({ targets: text, alpha: 1, duration: 800 }); }
            else {
              audio.startle(); text.setScale(.08);
              this.tweens.add({ targets: text, scale: 1.12, duration: 110, ease: 'Expo.Out', yoyo: true, hold: 60, onComplete: () => text.setScale(1) });
              this.cameras.main.shake(170, .014);
            }
            this.updateUI(); $('interface').classList.add('ending'); $('interface').hidden = false;
            this.announce('endingAnnouncement');
            this.time.delayedCall(1100, () => { this.busy = false; $('replay').hidden = false; });
          };
          if (reduced) {
            const white = this.add.rectangle(540, 360, 20000, 20000, 0xffffff, 0).setDepth(50);
            this.tweens.add({ targets: white, alpha: 1, duration: 1400, onComplete: showMessage });
          } else { curtain.setFillStyle(0xffffff); showMessage(); }
        });
      } });
    });
  }
}

const scene = new Puzzle();
const game = new Phaser.Game({
  // This game uses 2D vectors only. Canvas also avoids requiring working WebGL
  // drivers on managed Chromebooks and keeps software-rendered testing fast.
  type: Phaser.CANVAS, parent: 'game', backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, powerPreference: 'low-power' },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 1.2 }, enableSleeping: true } },
  scene: [scene], audio: { noAudio: true },
  input: { activePointers: 2 },
  fps: { target: 60 },
});
void game;
$('sound').addEventListener('click', () => {
  audio.unlock(); audio.enabled = !audio.enabled;
  $('sound').textContent = t(audio.enabled ? 'soundOn' : 'soundOff');
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  if (audio.enabled) audio.click(3);
});
$('effects').addEventListener('click', () => {
  reduced = !reduced;
  try { localStorage.setItem('hunter-reduced', String(reduced)); } catch { /* Nonessential preference. */ }
  $('effects').setAttribute('aria-pressed', String(reduced));
  $('effects').textContent = t(reduced ? 'effectsReduced' : 'effectsNormal');
});
const dialog = $<HTMLDialogElement>('restart-dialog');
$('restart').addEventListener('click', () => dialog.showModal());
$('cancel-restart').addEventListener('click', () => dialog.close());
$('confirm-restart').addEventListener('click', () => { dialog.close(); scene.scene.restart(); });
$('replay').addEventListener('click', () => scene.scene.restart());
// Stop the browser from scrolling when dragging on touchscreens.
document.querySelector('canvas')?.setAttribute('aria-label', t('canvasLabel'));
