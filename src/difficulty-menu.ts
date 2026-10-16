import type { Difficulty } from './difficulty';

/** Native pointer events catch proximity before the pointer reaches the word. */
export class DifficultyMenu {
  private menu = document.getElementById('difficulty-menu')!;
  private impossible = document.getElementById('impossible')!;
  constructor(select: (mode: Difficulty) => void) {
    this.menu.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach(button => {
      button.addEventListener('click', () => select(button.dataset.difficulty as Difficulty));
    });
    window.addEventListener('pointermove', event => this.avoid(event), { capture: true });
    window.addEventListener('pointerdown', event => this.avoid(event), { capture: true });
    window.addEventListener('resize', () => { if (!this.menu.hidden) this.reset(); });
  }
  show() { this.menu.hidden = false; this.reset(); }
  hide() { this.menu.hidden = true; }
  private reset() {
    this.impossible.style.left = `${Math.max(12, (window.innerWidth - this.impossible.offsetWidth) / 2)}px`;
    this.impossible.style.top = `${Math.min(window.innerHeight - 60, window.innerHeight / 2 + 95)}px`;
  }
  private avoid(event: PointerEvent) {
    if (this.menu.hidden) return;
    const rect = this.impossible.getBoundingClientRect(), padding = 80;
    if (event.clientX < rect.left - padding || event.clientX > rect.right + padding || event.clientY < rect.top - padding || event.clientY > rect.bottom + padding) return;
    const maxX = Math.max(12, window.innerWidth - rect.width - 12), maxY = Math.max(12, window.innerHeight - rect.height - 12);
    const points = [{ x: 12, y: 75 }, { x: maxX, y: 75 }, { x: 12, y: maxY }, { x: maxX, y: maxY }];
    for (let i = 0; i < 12; i++) points.push({ x: 12 + Math.random() * Math.max(0, maxX - 12), y: 75 + Math.random() * Math.max(0, maxY - 75) });
    const distance = (point: { x: number; y: number }) => Math.hypot(point.x + rect.width / 2 - event.clientX, point.y + rect.height / 2 - event.clientY);
    points.sort((a, b) => distance(b) - distance(a));
    this.impossible.style.left = `${points[0].x}px`; this.impossible.style.top = `${Math.min(maxY, points[0].y)}px`;
  }
}
