import Phaser from 'phaser';
import { glyph, paintGlyph } from './glyphs';
import { Audio } from './audio';
import { t, type TranslationKey, type TranslationParams } from './i18n';
import { BRIXTON, CloudShake, brixtonSolved, releaseVelocity, revealOpacity, type PointerSample } from './brixton-rules';
import type { Point } from './rules';
import { DIFFICULTY, type Difficulty } from './difficulty';

type Cloud = {
  char: string; art: Phaser.GameObjects.Container; letter: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text; shake: CloudShake; body: MatterJS.BodyType;
};
type Hooks = {
  reduced: () => boolean; ready: () => void; arrange: () => void; complete: () => void;
  announce: (key: TranslationKey, params?: TranslationParams) => void;
};

/** A bounded level using Phaser input/tweens and the game's existing Matter world. */
export class BrixtonLevel {
  private clouds: Cloud[] = [];
  private rain: Phaser.GameObjects.Graphics;
  private active?: Cloud;
  private dragging?: Cloud;
  private offset: Point = { x: 0, y: 0 };
  private samples: PointerSample[] = [];
  private pointer?: Point;
  private entering = true;
  private stopped = false;
  private settledMs = 0;
  private selected?: number;
  private keyboardCloud?: number;
  private wasPaused = false;

  constructor(private scene: Phaser.Scene, private audio: Audio, private hooks: Hooks, private difficulty: Difficulty) {
    this.rain = scene.add.graphics().setDepth(7);
    const shuffled = Phaser.Utils.Array.Shuffle([...BRIXTON]);
    if (shuffled.join('') === BRIXTON) [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    shuffled.forEach((char, i) => {
      const x = i < 4 ? 240 + i * 200 : 340 + (i - 4) * 200;
      const y = i < 4 ? 280 : 425;
      const letter = glyph(scene, char).setPosition(x, y).setAlpha(0).setDepth(4).setSize(76, 104);
      paintGlyph(letter, char, 0x302438);
      const body = scene.matter.add.rectangle(x, y, 68, 92, {
        isStatic: true, ignoreGravity: true, frictionAir: .035, restitution: .2,
        collisionFilter: { mask: 0 },
      });
      const art = scene.add.container(x + (i % 2 ? 1100 : -1100), y).setDepth(5);
      const shape = scene.add.graphics().fillStyle(0xa6b9c8).lineStyle(2, 0x718b9f);
      shape.fillRoundedRect(-77, -20, 154, 58, 27);
      shape.fillCircle(-40, -17, 33); shape.fillCircle(0, -32, 40); shape.fillCircle(40, -12, 31);
      shape.lineBetween(-53, 38, 53, 38);
      art.add(shape);
      const label = scene.add.text(x, y + 66, '', { fontFamily: 'monospace', fontSize: '11px', color: '#526a80' }).setOrigin(.5).setDepth(6).setVisible(difficulty !== 'hard');
      const settings = DIFFICULTY[difficulty];
      const cloud: Cloud = { char, art, letter, body, label, shake: new CloudShake(settings.cloudMs, settings.rewindRate) };
      this.clouds.push(cloud);
      scene.tweens.add({ targets: art, x, duration: hooks.reduced() ? 300 : 900, delay: hooks.reduced() ? 0 : i * 95, ease: 'Sine.Out' });
    });
    if (difficulty !== 'hard') {
      const guide = scene.add.graphics().lineStyle(1, 0x718b9f, .4);
      for (let i = 0; i < 7; i++) guide.lineBetween(204 + i * 112 - 34, 604, 204 + i * 112 + 34, 604);
    }
    if (difficulty === 'easy') scene.add.text(540, 164, t('cloudGoalEasy'), { fontFamily: 'monospace', fontSize: '12px', color: '#526a80' })
      .setOrigin(.5).setData('i18nKey', 'cloudGoalEasy');
    scene.time.delayedCall(hooks.reduced() ? 350 : 1600, () => {
      this.entering = false;
      if (!hooks.reduced()) for (const cloud of this.clouds) scene.tweens.add({ targets: cloud.art, y: cloud.art.y - 6, duration: 1700, yoyo: true, repeat: -1 });
      this.controls(); hooks.ready();
    });
    scene.input.on('pointermove', this.move, this);
    scene.input.on('gameout', this.leave, this);
    scene.input.on('dragstart', this.dragStart, this);
    scene.input.on('drag', this.drag, this);
    scene.input.on('dragend', this.dragEnd, this);
    scene.input.keyboard?.on('keydown', this.keyDown, this);
    this.refreshTranslations();
  }

  get arranging() { return this.clouds.every(c => c.shake.revealed); }

  snapshot() {
    return this.clouds.map(c => ({ char: c.char, x: c.letter.x, y: c.letter.y, cloudX: c.art.x, cloudY: c.art.y,
      elapsed: c.shake.elapsed, revealed: c.shake.revealed, opacity: c.letter.alpha, cloudOpacity: c.art.alpha,
      vx: c.body.velocity.x * 60, vy: c.body.velocity.y * 60, dragging: this.dragging === c }));
  }

  update(delta: number, paused: boolean) {
    this.rain.clear();
    if (this.entering || this.stopped) return;
    const now = performance.now();
    if (paused || this.wasPaused) {
      this.leave();
      if (this.dragging) this.release({ x: 0, y: 0 });
      for (const c of this.clouds) {
        this.scene.matter.body.setVelocity(c.body, { x: 0, y: 0 });
        c.shake.tick(now, false);
      }
      this.wasPaused = paused;
      this.settledMs = 0;
      return;
    }
    for (const c of this.clouds) {
      if (!c.shake.revealed) {
        const over = this.active === c && !!this.pointer && this.contains(c, this.pointer);
        const revealed = c.shake.tick(now, over);
        const opacity = revealOpacity(c.shake.elapsed, c.shake.duration);
        c.letter.setAlpha(opacity); c.art.setAlpha(1 - opacity);
        c.label.setText(this.difficulty === 'hard' ? '' : t(this.difficulty === 'medium' ? 'cloudElapsed' : 'cloudProgress', { seconds: (c.shake.elapsed / 1000).toFixed(1), total: c.shake.duration / 1000 }));
        if (over && c.shake.shaking(now)) this.drawRain(c, now);
        if (revealed) {
          c.art.setVisible(false); c.label.setVisible(false); this.audio.click(this.clouds.filter(c => c.shake.revealed).length);
          this.hooks.announce('cloudRevealed', { count: this.clouds.filter(c => c.shake.revealed).length, total: 7 });
          this.active = undefined; this.keyboardCloud = undefined;
          if (this.arranging) this.startArranging();
          else this.controls();
        }
      }
      if (this.arranging && this.dragging !== c) {
        // Matter supplies momentum and friction; these limits keep every letter reachable.
        const { x, y } = this.constrain(c.body.position.x, c.body.position.y);
        if (x !== c.body.position.x || y !== c.body.position.y) {
          const velocity = { x: c.body.velocity.x * (x === c.body.position.x ? 1 : -.25), y: c.body.velocity.y * (y === c.body.position.y ? 1 : -.25) };
          this.scene.matter.body.setPosition(c.body, { x, y }); this.scene.matter.body.setVelocity(c.body, velocity);
        }
        c.letter.setPosition(c.body.position.x, c.body.position.y);
      }
    }
    this.settledMs = this.arranging && brixtonSolved(this.snapshot()) ? this.settledMs + Math.min(delta, 60) : 0;
    if (this.settledMs >= 700) {
      this.stop(); this.hooks.complete();
    }
  }

  private contains(c: Cloud, p: Point) {
    return ((p.x - c.art.x) / 83) ** 2 + ((p.y - c.art.y + 12) / 62) ** 2 <= 1;
  }

  private move(pointer: Phaser.Input.Pointer) {
    if (this.entering || this.stopped || this.arranging || this.paused()) return;
    const at = pointer.positionToCamera(this.scene.cameras.main) as Point;
    const cloud = this.clouds.find(c => !c.shake.revealed && this.contains(c, at));
    if (cloud !== this.active) { this.active?.shake.stopTracking(); this.active = cloud; }
    this.pointer = { x: at.x, y: at.y }; this.keyboardCloud = undefined;
    cloud?.shake.sample(this.pointer, performance.now());
  }

  private leave() {
    this.active?.shake.stopTracking(); this.active = undefined; this.pointer = undefined;
    this.keyboardCloud = undefined;
  }

  private drawRain(c: Cloud, now: number) {
    this.rain.lineStyle(2, 0x548fb5, .7);
    for (let i = 0; i < (this.hooks.reduced() ? 4 : 12); i++) {
      const x = c.art.x - 59 + i * 11;
      const y = c.art.y + 42 + (now * .18 + i * 17) % 42;
      this.rain.lineBetween(x, y, x - 3, y + 10);
    }
  }

  private startArranging() {
    this.leave();
    for (const c of this.clouds) {
      this.scene.matter.body.setStatic(c.body, false);
      c.letter.setInteractive({ useHandCursor: true }); this.scene.input.setDraggable(c.letter);
    }
    this.hooks.arrange(); this.controls();
  }

  private dragStart(pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject) {
    if (!this.arranging || this.stopped || this.paused()) return;
    const c = this.clouds.find(c => c.letter === object);
    if (!c) return;
    const at = pointer.positionToCamera(this.scene.cameras.main) as Point;
    this.dragging = c; this.selected = undefined; this.settledMs = 0;
    this.offset = { x: c.letter.x - at.x, y: c.letter.y - at.y };
    this.samples = [{ x: at.x, y: at.y, time: performance.now() }];
    this.scene.matter.body.setStatic(c.body, true);
    c.letter.setDepth(10).setScale(1.05);
  }

  private drag(pointer: Phaser.Input.Pointer) {
    if (!this.dragging || this.paused()) return;
    const at = pointer.positionToCamera(this.scene.cameras.main) as Point;
    this.position(this.dragging, at.x + this.offset.x, at.y + this.offset.y);
    const now = performance.now();
    this.samples.push({ x: at.x, y: at.y, time: now });
    this.samples = this.samples.filter(sample => now - sample.time <= 160);
  }

  private dragEnd() {
    if (this.dragging) this.release(releaseVelocity(this.samples, performance.now()));
  }

  private release(velocity: Point) {
    const c = this.dragging!;
    this.scene.matter.body.setStatic(c.body, false);
    this.scene.matter.body.set(c.body, 'isSleeping', false);
    this.scene.matter.body.setVelocity(c.body, { x: velocity.x / 60, y: velocity.y / 60 });
    c.letter.setDepth(4).setScale(1);
    this.dragging = undefined; this.samples = [];
  }

  private position(c: Cloud, x: number, y: number) {
    const at = this.constrain(x, y);
    this.scene.matter.body.setPosition(c.body, at); c.letter.setPosition(at.x, at.y);
  }

  private constrain(x: number, y: number): Point {
    const view = this.scene.cameras.main.worldView;
    // Only keep the glyphs on screen; there is no designated placement region.
    return { x: Phaser.Math.Clamp(x, view.left + 38, view.right - 38), y: Phaser.Math.Clamp(y, view.top + 52, view.bottom - 52) };
  }

  private paused() { return document.hidden || !document.hasFocus() || !!document.getElementById('restart-dialog')?.hasAttribute('open'); }

  private controls() {
    const controls = document.getElementById('letter-controls')!;
    const focused = controls.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.index : undefined;
    controls.replaceChildren();
    this.clouds.forEach((c, i) => {
      const button = document.createElement('button'); button.dataset.index = String(i);
      button.textContent = this.arranging ? t('brixtonLetterControl', { letter: c.char }) : t(this.difficulty === 'hard' ? 'cloudControlSimple' : 'cloudControl', { index: i + 1 });
      button.disabled = !this.arranging && c.shake.revealed;
      button.addEventListener('click', () => {
        this.leave();
        if (this.arranging) { this.selected = i; this.scene.matter.body.setVelocity(c.body, { x: 0, y: 0 }); }
        else { this.keyboardCloud = i; this.active = c; this.pointer = { x: c.art.x, y: c.art.y }; }
        this.hooks.announce(this.arranging ? 'brixtonLetterSelected' : this.difficulty === 'easy' ? 'cloudSelectedEasy' : 'cloudSelectedMedium');
        button.blur();
      });
      controls.append(button);
    });
    if (focused !== undefined) controls.querySelector<HTMLButtonElement>(`[data-index="${focused}"]`)?.focus();
  }

  private keyDown(event: KeyboardEvent) {
    if (this.entering || this.stopped || this.paused() || (event.target as HTMLElement)?.matches('button, input, select, textarea')) return;
    if (!this.arranging && this.keyboardCloud !== undefined && ['ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault(); if (event.repeat) return;
      const c = this.clouds[this.keyboardCloud];
      // Alternating keys are an alternative to alternating pointer directions.
      this.pointer = { x: c.art.x + (event.code === 'ArrowLeft' ? -14 : 14), y: c.art.y };
      c.shake.sample(this.pointer, performance.now());
    } else if (this.arranging && this.selected !== undefined) {
      const c = this.clouds[this.selected], amount = event.shiftKey ? 3 : 12;
      const directions: Record<string, Point> = { ArrowLeft: { x: -amount, y: 0 }, ArrowRight: { x: amount, y: 0 }, ArrowUp: { x: 0, y: -amount }, ArrowDown: { x: 0, y: amount } };
      const direction = directions[event.code];
      if (direction) {
        event.preventDefault(); this.scene.matter.body.setVelocity(c.body, { x: 0, y: 0 });
        this.position(c, c.letter.x + direction.x, c.letter.y + direction.y);
      } else if (event.code === 'Enter' || event.code === 'Space') { event.preventDefault(); this.selected = undefined; }
    }
  }

  refreshTranslations() {
    if (!this.entering && !this.stopped) this.controls();
  }

  stop() {
    this.stopped = true; this.leave();
    if (this.dragging) this.release({ x: 0, y: 0 });
    for (const c of this.clouds) {
      // Phaser may destroy display objects before firing our shutdown listener.
      if (c.letter.scene) c.letter.disableInteractive();
      this.scene.matter.body.setVelocity(c.body, { x: 0, y: 0 });
    }
    document.getElementById('letter-controls')?.replaceChildren();
  }

  destroy() {
    this.stopped = true; this.leave(); this.dragging = undefined; this.samples = [];
    document.getElementById('letter-controls')?.replaceChildren();
    this.scene.input.off('pointermove', this.move, this);
    this.scene.input.off('gameout', this.leave, this);
    this.scene.input.off('dragstart', this.dragStart, this);
    this.scene.input.off('drag', this.drag, this);
    this.scene.input.off('dragend', this.dragEnd, this);
    this.scene.input.keyboard?.off('keydown', this.keyDown, this);
    // Matter's scene shutdown listener may already have cleared its world.
    for (const c of this.clouds) this.scene.matter.world?.remove(c.body);
  }
}
