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

const SURFACE_STYLES = Object.freeze(['classic','theatre','concert','festival','backstage']);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const distPointToSegmentSquared = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((px - x1) * dx + (py - y1) * dy) / lengthSq, 0, 1) : 0;
  const x = x1 + dx * t, y = y1 + dy * t;
  return (px - x) ** 2 + (py - y) ** 2;
};

export class ScratchCard {
  constructor({ canvas, foil = 'gold', coverStyle = 'classic', brushSize = 48,
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
    this.coverStyle = SURFACE_STYLES.includes(coverStyle) ? coverStyle : 'classic';
    this.imageRequest = 0;
    this.brushSize = clamp(Number(brushSize) || 48, 12, 120);
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

    if (coverImage) this.setCoverImage(coverImage).catch(() => {});
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

    if (!this.coverImage) this.drawArtwork();

    if (this.coverImage?.complete && this.coverImage.naturalWidth) {
      const image = this.coverImage, scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
      ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
      ctx.fillStyle = 'rgba(12, 11, 25, 0.19)';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dark = this.foil === 'midnight' || ['concert','festival','backstage'].includes(this.coverStyle) || Boolean(this.coverImage);
    const labelY = h / 2;
    const labelWidth = Math.min(w - 36, 350);
    ctx.fillStyle = dark ? 'rgba(7,9,23,.76)' : 'rgba(255,251,236,.67)';
    ctx.fillRect((w - labelWidth) / 2, labelY - 32, labelWidth, 74);
    ctx.strokeStyle = dark ? 'rgba(255,221,154,.86)' : 'rgba(104,66,22,.72)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect((w - labelWidth) / 2 + 5, labelY - 27, labelWidth - 10, 64);
    ctx.fillStyle = dark ? '#FFF0C8' : '#362314';
    ctx.shadowColor = dark ? '#08061A' : '#FFFFFF';
    ctx.shadowBlur = 7;
    ctx.font = '800 ' + clamp(w * 0.054, 12, 22) + 'px system-ui, sans-serif';
    ctx.fillText('✦  SCRATCH TO REVEAL  ✦', w / 2, labelY - 5, labelWidth - 20);
    ctx.font = '500 ' + clamp(w * 0.033, 10, 14) + 'px system-ui, sans-serif';
    ctx.fillText('THE SURPRISE IS UNDER HERE', w / 2, labelY + 22, labelWidth - 28);
    ctx.restore();
  }

  drawArtwork() {
    const ctx = this.ctx, w = this.cssWidth, h = this.cssHeight;
    const stage = this.coverStyle;
    ctx.save();
    // Original scalable ornament artwork: no external images or libraries.
    if (stage === 'theatre') {
      const curtain = ctx.createLinearGradient(0, 0, w * 0.25, 0);
      curtain.addColorStop(0, '#420B24'); curtain.addColorStop(.45, '#A62C4A');
      curtain.addColorStop(1, '#470D24');
      ctx.fillStyle = curtain;
      ctx.fillRect(0, 0, w * 0.19, h);
      ctx.fillRect(w * .81, 0, w * .19, h);
      ctx.fillStyle = '#F4C478';
      for (const x of [.08, .12, .86, .90]) ctx.fillRect(w * x, 0, Math.max(2,w * .008), h);
      ctx.fillStyle = '#5D1834';
      ctx.fillRect(0, 0, w, h * .17);
      ctx.fillStyle = '#EAC384';
      ctx.fillRect(0, h * .17, w, Math.max(4,h * .012));
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFE6A5';
      ctx.font = '600 ' + clamp(w * .05,14,23) + 'px Georgia, serif';
      ctx.fillText('✦  THE GRAND UNVEILING  ✦', w/2, h*.1,w*.77);
      ctx.font = 'italic ' + clamp(w*.038,12,17) + 'px Georgia, serif';
      ctx.fillText('Something magical awaits',w/2,h*.86,w*.7);
    } else if (stage === 'concert') {
      ctx.fillStyle = '#141028';
      ctx.fillRect(0,0,w,h);
      const sky = ctx.createLinearGradient(0,0,w,h);
      sky.addColorStop(0,'#352A80');sky.addColorStop(.45,'#14112E');sky.addColorStop(1,'#531C60');
      ctx.fillStyle = sky;ctx.fillRect(0,0,w,h);
      const rays = [
        [w*.08,0,w*.51,h],[w*.92,0,w*.49,h],
        [w*.32,0,w*.8,h],[w*.68,0,w*.2,h]
      ];
      for(let i=0;i<rays.length;i++){
        const [sx,sy,ex,ey] = rays[i];
        ctx.strokeStyle = i%2 ? 'rgba(255,65,185,.27)' : 'rgba(70,201,255,.30)';
        ctx.lineWidth = w*.07;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFE7B0';
      ctx.font = '800 ' + clamp(w*.066,18,29) + 'px system-ui, sans-serif';
      ctx.fillText('VIP ACCESS',w/2,h*.19,w*.78);
      ctx.font = '600 ' + clamp(w*.038,12,17) + 'px system-ui, sans-serif';
      ctx.fillText('YOUR NEXT BIG NIGHT OUT',w/2,h*.84,w*.78);
    } else if (stage === 'festival') {
      // Original festival pass artwork: sunset stage lights, wristband bands,
      // sweeping beams and central access lettering.
      const sunset = ctx.createLinearGradient(0,0,w,h);
      sunset.addColorStop(0,'#142D46');
      sunset.addColorStop(.38,'#22456E');
      sunset.addColorStop(.7,'#AC467C');
      sunset.addColorStop(1,'#E59D5E');
      ctx.fillStyle=sunset;ctx.fillRect(0,0,w,h);
      for(let i=0;i<7;i++){
        const x=w*(i+.35)/7;
        ctx.strokeStyle=i%2?'rgba(255,235,173,.31)':'rgba(74,255,220,.27)';
        ctx.lineWidth=Math.max(9,w*.04);
        ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(w*(.12+i*.13),h*.82);ctx.stroke();
      }
      ctx.fillStyle='#11223D';
      ctx.fillRect(0,h*.06,w,h*.11);
      ctx.fillRect(0,h*.86,w,h*.085);
      ctx.textAlign='center';ctx.fillStyle='#FCE6B4';
      ctx.font='800 '+clamp(w*.069,19,31)+'px system-ui, sans-serif';
      ctx.fillText('FESTIVAL ACCESS',w/2,h*.11,w*.87);
      ctx.font='700 '+clamp(w*.043,13,19)+'px system-ui, sans-serif';
      ctx.fillText('THE SHOW STARTS HERE',w/2,h*.9,w*.81);
    } else if (stage === 'backstage') {
      // Original all-access lanyard treatment, with gold pass borders,
      // deep stage-red panel and engraved angular highlights.
      const pass=ctx.createLinearGradient(0,0,w,h);
      pass.addColorStop(0,'#101326');pass.addColorStop(.5,'#401529');
      pass.addColorStop(1,'#11192E');
      ctx.fillStyle=pass;ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#E9C57F';ctx.lineWidth=Math.max(3,w*.011);
      ctx.strokeRect(w*.065,h*.045,w*.87,h*.91);
      ctx.lineWidth=Math.max(1,w*.004);
      ctx.strokeRect(w*.085,h*.06,w*.83,h*.88);
      ctx.fillStyle='#D7A963';
      ctx.fillRect(0,h*.12,w,h*.13);
      ctx.fillRect(0,h*.79,w,h*.09);
      ctx.fillStyle='#211629';ctx.textAlign='center';
      ctx.font='900 '+clamp(w*.073,20,33)+'px system-ui, sans-serif';
      ctx.fillText('BACKSTAGE',w/2,h*.195,w*.82);
      ctx.fillStyle='#FCE8BC';
      ctx.font='700 '+clamp(w*.049,14,23)+'px system-ui, sans-serif';
      ctx.fillText('ALL ACCESS PASS',w/2,h*.83,w*.84);
      ctx.fillStyle='rgba(255,219,163,.13)';
      for(let i=0;i<9;i++){
        ctx.fillRect(w*(i*.15-.7),h*.25,w*.07,h*.55);
      }
    } else {
      // A ticket-inspired, finely etched foil design in each classic finish.
      const light = this.foil === 'midnight';
      ctx.strokeStyle = light ? '#F1DDA5AA' : '#6D4A286E';
      ctx.lineWidth = Math.max(1.5,w*.005);
      ctx.strokeRect(w*.045,h*.035,w*.91,h*.93);
      ctx.lineWidth = 1;
      ctx.strokeRect(w*.068,h*.05,w*.864,h*.90);
      ctx.textAlign = 'center';
      ctx.fillStyle = light ? '#F9E9C6' : '#64401D';
      ctx.font = '700 ' + clamp(w*.052,14,22) + 'px Georgia, serif';
      ctx.fillText('✦  A SPECIAL SURPRISE  ✦',w/2,h*.18,w*.84);
      ctx.font = '500 ' + clamp(w*.033,11,15) + 'px system-ui, sans-serif';
      ctx.fillText('ONE MOMENT • ONE MEMORY',w/2,h*.82,w*.82);
    }
    // Perforated ticket edging, engraved as a repeatable motif.
    ctx.fillStyle = ['concert','festival','backstage'].includes(stage) ? '#DDCAFF' : '#FBE3A5';
    ctx.globalAlpha = .68;
    for(let y = h*.22;y < h*.79;y += Math.max(12,h*.034)){
      for(const x of [w*.04,w*.96]){
        ctx.beginPath();ctx.arc(x,y,Math.max(1.4,w*.004),0,Math.PI*2);ctx.fill();
      }
    }
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
    if (this.activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.activePointer = event.pointerId;
    try { this.canvas.setPointerCapture(event.pointerId); } catch {}
    const pt = this.point(event);
    this.strokes.push([pt]);
    this.eraseSegment(pt, pt);
  }

  pointerMove(event) {
    if (event.pointerId !== this.activePointer) return;
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
      // Completion is informational only: foil is never cleared or faded
      // automatically. Every exposed area must be erased by a user gesture.
      if (progress === 1 && !this.completed) {
        this.completed = true;
        this.onComplete();
      }
    }
  }

  reset() {
    this.strokes = [];
    this.cells.fill(0);
    this.completed = false;
    this.activePointer = null;
    this.paintCover();
    this.onProgress(0);
  }

  setFoil(foil) {
    if (!FOILS[foil]) throw new RangeError('Unknown foil finish: ' + foil);
    this.foil = foil;
    this.reset();
  }

  setCoverStyle(style) {
    if (!SURFACE_STYLES.includes(style)) throw new RangeError('Unknown scratch surface style: ' + style);
    this.coverStyle = style;
    this.reset();
  }

  setCoverImage(url) {
    const request = ++this.imageRequest;
    if (!url) { this.coverImage = null; this.reset(); return Promise.resolve(true); }
    return new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => {
        if (request !== this.imageRequest) { resolve(false); return; }
        this.coverImage = image;
        this.reset();
        resolve(true);
      };
      image.onerror = () => {
        if (request !== this.imageRequest) { resolve(false); return; }
        reject(new Error('The chosen scratch image could not be decoded.'));
      };
      image.src = url;
    });
  }

  destroy() {
    for (const [name, handler] of Object.entries(this.events)) {
      this.canvas.removeEventListener(name, handler);
    }
    if (this.observer) this.observer.disconnect();
    else window.removeEventListener('resize', this.windowResize);
  }
}

export { FOILS, SURFACE_STYLES };
