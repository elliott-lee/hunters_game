/** Small generated sounds use the browser's audio engine; no remote audio files. */
export class Audio {
  enabled = true;
  private context?: AudioContext;
  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }
  tone(frequency: number, length = .12, type: OscillatorType = 'sine', delay = 0, end?: number) {
    if (!this.enabled || !this.context) return;
    const c = this.context, start = c.currentTime + delay;
    const oscillator = c.createOscillator(), gain = c.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (end) oscillator.frequency.exponentialRampToValueAtTime(end, start + length);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.08, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + length);
    oscillator.connect(gain).connect(c.destination);
    oscillator.start(start); oscillator.stop(start + length + .02);
  }
  crack() { this.noise(.08, .16, 2100); this.tone(170, .06, 'triangle', 0, 70); }
  click(index = 0) { this.tone(260 * 2 ** (index / 9), .1, 'triangle'); }
  error() { this.tone(110, .24, 'sawtooth', 0, 75); this.tone(100, .22, 'sawtooth', .15, 65); }
  success() { [0, 4, 7, 12].forEach((note, i) => this.tone(330 * 2 ** (note / 12), .36, 'triangle', i * .09)); }
  boom() { this.noise(1.15, .3, 900); this.tone(110, .7, 'sine', 0, 30); }
  magic() { for (let i = 0; i < 12; i++) this.tone(420 * 2 ** ((i % 7) / 7), .3, 'sine', i * .055); }
  startle() { this.noise(.18, .26, 1900); this.tone(155, .23, 'sawtooth', 0, 70); }
  private noise(length: number, volume: number, frequency: number) {
    if (!this.enabled || !this.context) return;
    const c = this.context, buffer = c.createBuffer(1, c.sampleRate * length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = c.createBufferSource(), gain = c.createGain(), filter = c.createBiquadFilter();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = frequency;
    gain.gain.value = volume; source.connect(filter).connect(gain).connect(c.destination); source.start();
  }
}
