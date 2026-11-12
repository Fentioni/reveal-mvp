/**
 * Original, dependency-free cinematic scratch cue.
 * The timing starts with the first actual scratch gesture, never page load.
 * The audio is a synthesised orchestral-percussion prototype; authored WAV/MP3
 * can replace playCinematicRoll without changing the cue contract.
 */
export const SCRATCH_AUDIO_DEFAULT = Object.freeze({
  enabled: true,
  cue: 'cinematic-drum-roll',
  trigger: 'first-scratch',
  delayMs: 3000
});

export class ScratchCinematicAudio {
  constructor({
    enabled = true,
    delayMs = 3000,
    onStart = () => {},
    onCue = () => {},
    createContext = () => {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      return AudioContextType ? new AudioContextType() : null;
    },
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = id => clearTimeout(id),
    play = null
  } = {}) {
    this.enabled = Boolean(enabled);
    this.delayMs = delayMs === 3000 ? delayMs : 3000;
    this.createContext = createContext;
    this.schedule = schedule;
    this.cancel = cancel;
    this.play = play || ((context) => this.playCinematicRoll(context));
    this.onStart = onStart;
    this.onCue = onCue;
    this.context = null;
    this.timer = null;
    this.started = false;
    this.fired = false;
    this.destroyed = false;
    this.activeNodes = new Set();
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) {
      if (this.timer !== null) this.cancel(this.timer);
      this.timer = null;
      for (const node of this.activeNodes) {
        try { node.stop(); } catch {}
      }
      this.activeNodes.clear();
    }
  }

  // Invoke synchronously from the browser's pointer/touch event callback
  // so iOS can authorise Web Audio without a separate autoplay gesture.
  onFirstScratch() {
    if (this.destroyed || this.started) return false;
    this.started = true;
    if (!this.enabled) return false;
    try {
      if (!this.context) this.context = this.createContext();
      if (!this.context) return false;
      if (this.context.state === 'suspended') {
        const resumed = this.context.resume();
        if (resumed?.catch) resumed.catch(() => {});
      }
      this.onStart();
      this.timer = this.schedule(() => {
        this.timer = null;
        if (this.destroyed || !this.enabled || this.fired) return;
        this.fired = true;
        try { this.play(this.context); } catch {}
        this.onCue();
      }, this.delayMs);
      return true;
    } catch {
      return false;
    }
  }

  // The synthesised cue uses a pitched timpani-like roll, orchestral low-brass
  // swells and a resolving chord. It uses only original generated waveforms.
  playCinematicRoll(ctx) {
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, at);
    master.gain.linearRampToValueAtTime(0.42, at + 0.3);
    master.gain.setValueAtTime(0.42, at + 3.5);
    master.gain.exponentialRampToValueAtTime(0.0001, at + 4.9);
    master.connect(ctx.destination);

    const voice = (type, freq, start, length, volume, glide = 0) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, start);
      if (glide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(25,freq * (1 - glide)), start + Math.min(length, .36));
      gain.gain.setValueAtTime(0.0001,start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001,volume),start+.016);
      gain.gain.exponentialRampToValueAtTime(0.0001,start+length);
      oscillator.connect(gain).connect(master);
      oscillator.start(start);oscillator.stop(start+length+.04);
      this.activeNodes.add(oscillator);
      oscillator.onended = () => this.activeNodes.delete(oscillator);
    };

    // Rapid timpani strokes grow closer and louder during the roll.
    for (let i = 0, t = 0; t < 3.15; i++) {
      const intensity = Math.min(1,t/3.15);
      const interval = .16 - .10*intensity;
      const accent = i%4===0 ? 1.35 : 1;
      const pitch = i%3===0 ? 82.41 : 98.0;
      voice('sine',pitch,at+t,.23 + .18*intensity,(.035+.07*intensity)*accent,.24);
      voice('triangle',pitch*1.985,at+t,.13,(.010+.025*intensity)*accent,.1);
      t+=interval;
    }

    // Sustained harmonic brass/string-like support.
    const chord = [110,164.81,220,329.63];
    for (const [i,note] of chord.entries()) {
      for (const offset of [0,1.8]) {
        const begin = at+offset;
        voice(i%2 ? 'sawtooth' : 'triangle',note,begin,2.8,.015*(1+i/5),0);
      }
    }
    // Final low drum and bright rising resolution.
    voice('sine',65.41,at+3.2,1.3,.22,.34);
    for (const note of [261.63,329.63,392,523.25]) {
      voice('sine',note,at+3.3,1.6,.035,0);
    }
  }

  reset() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.started = false;
    this.fired = false;
    for (const node of this.activeNodes) {
      try { node.stop(); } catch {}
    }
    this.activeNodes.clear();
  }

  async destroy() {
    this.destroyed = true;
    this.reset();
    try { await this.context?.close?.(); } catch {}
    this.context = null;
  }
}
