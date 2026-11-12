/**
 * Original Reveal Scratch Card engine.
 * No external libraries. Runs in any modern browser with Canvas + Pointer Events.
 * Public demos must use fictional data; do not send purchaser reveal payloads
 * to a browser before verified payment.
 */
const FOILS = Object.freeze({
  gold: ['#654114', '#F8E3A0', '#BD8430', '#FFF3BF', '#9A6420'],
  silver: ['#687382', '#F2F6FA', '#A3B0BE', '#FFFFFF', '#778697'],
  midnight: ['#070F28', '#3555A4', '#101B41', '#667FD9', '#111933'],
  rose: ['#835465', '#FAD5D4', '#BE8398', '#FFE8DD', '#9C5A70']
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const distPointToSegmentSquared = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1) : 0;
  const x = x1 + dx * t, y = y1 + dy * t;
  return (px - x) ** 2 + (py - y) ** 2;
};

export class ScratchCard {
  constructor({ canvas, foil = 'gold', brushSize = 48, threshold = 0.53,
    coverImage = null, onScratch = () => {}, onProgress = () => {},
    onComplete = () => {} } = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError('ScratchCard needs a canvas element.');
    }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D rendering is not available.');

    this.canvas = canvas;
    this.ctx = context;
    this.foil = FOILS[foil] ? foil : 'gold';
    this.brushSize = clamp(Number(brushSize) || 48, 12, 120);
    this.threshold = clamp(Number(threshold) || 0.53, 0.15, 0.95);
    this.onScratch = onScratch;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.strokes = [];
    this.activePointer = null;
    this.completed = false;
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.gridColumns = 40;
    this.gridRows = 52;
    this.cells = new Uint8Array(this.gridColumns * this.gridRows);
    this.coverImage = null;
    this.events = {
      pointerdown: event => this.pointerDown(event),
      pointermove: event => this.pointerMove(event),
      pointerup: event => this.pointerEnd(event),
      pointercancel: event => this.pointerEnd(event)
    };
    canvas.style.touchAction = 'none';
    canvas.setAttribute('aria-label', 'Scratch the surface to reveal the fictional surprise');
    for (const [name, handler] of Object.entries(this.events)) {
      canvas.addEventListener(name, handler);
    }
    this.observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => this.resize()) : null;
    if (this.observer) this.observer.observe(canvas);
    this.windowResize = () => this.resize();
    if (!this.observer) window.addEventListener('resize', this.windowResize);
    this.resize();

    if (coverImage) this.setCoverImage(coverImage);
  }

  get progress() {
    let scratched = 0;
    for (const cell of this.cells) scratched += cell;
    return scratched / this.cells.length;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.cssWidth === width && this.cssHeight === height &&
        this.canvas.width === pixelWidth && this.canvas.height === pixelHeight) return;
    this.cssWidth = width;
    this.cssHeight = height;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cells.fill(0);
    this.paintCover();
    for (const stroke of this.strokes) {
      for (let i = 0; i < stroke.length; i++) {
        const a = stroke[Math.max(0, i - 1)], b = stroke[i];
        this.eraseSegment(a, b, false);
      }
    }
    if (this.completed) {
      this.canvas.style.opacity = '0';
      this.canvas.style.pointerEvents = 'none';
    }
    this.onProgress(this.progress);
  }

  paintCover() {
    const ctx = this.ctx, w = this.cssWidth, h = this.cssHeight;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    const colors = FOILS[this.foil];
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 22; i++) {
      const y = ((i * 53 + 7) % 101) / 101 * h;
      ctx.strokeStyle = i % 2 ? '#ffffff' : '#1b1720';
      ctx.lineWidth = i % 3 === 0 ? 2 : 0.7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + 0.2 * w);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.30;
    for (let i = 0; i < 80; i++) {
      const x = ((i * 37 + 13) % 101) / 101 * w;
      const y = ((i * 71 + 19) % 103) / 103 * h;
      ctx.fillStyle = i % 2 ? '#fffbea' : '#43351d';
      ctx.beginPath();
      ctx.arc(x, y, i % 4 === 0 ? 1.8 : 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.coverImage?.complete && this.coverImage.naturalWidth) {
      const image = this.coverImage, scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
      ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.foil === 'midnight' ? '#F3ECFF' : '#3D2B20';
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 8;
    ctx.font = '700 ' + clamp(w * 0.05, 12, 19) + 'px system-ui, sans-serif';
    ctx.fillText('✦  SCRATCH TO REVEAL  ✦', w / 2, h / 2, w - 20);
    ctx.font = '500 ' + clamp(w * 0.034, 10, 13) + 'px system-ui, sans-serif';
    ctx.fillText('Use your finger or mouse', w / 2, h / 2 + 30, w - 20);
    ctx.restore();
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  pointerDown(event) {
    if (this.completed || this.activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.activePointer = event.pointerId;
    try { this.canvas.setPointerCapture(event.pointerId); } catch {}
    const pt = this.point(event);
    this.strokes.push([pt]);
    this.eraseSegment(pt, pt);
  }

  pointerMove(event) {
    if (this.completed || event.pointerId !== this.activePointer) return;
    event.preventDefault();
    const pt = this.point(event);
    const stroke = this.strokes[this.strokes.length - 1];
    const last = stroke[stroke.length - 1];
    stroke.push(pt);
    this.eraseSegment(last, pt);
  }

  pointerEnd(event) {
    if (event.pointerId !== this.activePointer) return;
    this.activePointer = null;
    if (this.canvas.hasPointerCapture?.(event.pointerId)) {
      try { this.canvas.releasePointerCapture(event.pointerId); } catch {}
    }
  }

  eraseSegment(a, b, interactive = true) {
    const ctx = this.ctx, w = this.cssWidth, h = this.cssHeight;
    const ax = a.x * w, ay = a.y * h, bx = b.x * w, by = b.y * h;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.brushSize;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // A zero-length Canvas stroke needs an explicit disk for touch-down.
    if (ax === bx && ay === by) {
      ctx.beginPath();
      ctx.arc(ax, ay, this.brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const cols = this.gridColumns, rows = this.gridRows;
    const radiusSq = (this.brushSize / 2) ** 2;
    let changed = false;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const index = y * cols + x;
        if (this.cells[index]) continue;
        const cx = (x + 0.5) / cols * w, cy = (y + 0.5) / rows * h;
        if (distPointToSegmentSquared(cx, cy, ax, ay, bx, by) <= radiusSq) {
          this.cells[index] = 1;
          changed = true;
        }
      }
    }

    if (interactive && changed) {
      const progress = this.progress;
      this.onScratch(progress);
      this.onProgress(progress);
      if (progress >= this.threshold) this.reveal();
    }
  }

  reveal() {
    if (this.completed) return;
    this.completed = true;
    this.activePointer = null;
    this.canvas.style.pointerEvents = 'none';
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.canvas.style.transition = reduceMotion ? 'none' : 'opacity 550ms ease-out';
    this.canvas.style.opacity = '0';
    this.onProgress(1);
    this.onComplete();
  }

  reset() {
    this.strokes = [];
    this.cells.fill(0);
    this.completed = false;
    this.activePointer = null;
    this.canvas.style.transition = 'none';
    this.canvas.style.opacity = '1';
    this.canvas.style.pointerEvents = 'auto';
    this.paintCover();
    this.onProgress(0);
  }

  setFoil(foil) {
    if (!FOILS[foil]) throw new RangeError('Unknown foil finish: ' + foil);
    this.foil = foil;
    this.reset();
  }

  setCoverImage(url) {
    if (!url) { this.coverImage = null; this.reset(); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { this.coverImage = image; this.reset(); };
    image.onerror = () => console.warn('ScratchCard cover image could not be loaded. Using foil texture.');
    image.src = url;
  }

  destroy() {
    for (const [name, handler] of Object.entries(this.events)) {
      this.canvas.removeEventListener(name, handler);
    }
    if (this.observer) this.observer.disconnect();
    else window.removeEventListener('resize', this.windowResize);
  }
}

export { FOILS };
