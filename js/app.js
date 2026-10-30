import { Printer, TASKS } from './printer.js';
import { canvasToBitmap } from './bitmap.js';
import { SYMBOLS, symbolSVG } from './symbols.js';

/* ------------------------------------------------------------------ helpers */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
};

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), err ? 5000 : 2200);
}

/* ----------------------------------------------------------------- settings */
const DEFAULTS = {
  wMM: 50, hMM: 30, dpi: 203,
  threshold: 140, dither: false, snap: true,
  density: 3, labelType: 1, headMM: 48, orient: 'none', direction: 'top', task: 'auto', copies: 1,
};
const S = { ...DEFAULTS, ...store.get('niimbot.settings', {}) };
if (S.orient === 'auto') S.orient = 'none';
const saveSettings = () => store.set('niimbot.settings', S);
const mm2px = (mm) => Math.round((mm * S.dpi) / 25.4);
const px2mm = (px) => (px * 25.4) / S.dpi;
const headPx = () => Math.round((S.headMM * S.dpi) / 25.4);
const labelPx = () => ({ W: mm2px(S.wMM), H: mm2px(S.hMM) });
const defaultStroke = () => Math.max(2, Math.round(S.dpi / 50));

const PRESETS = [
  ['50 × 30 mm', 50, 30], ['40 × 30 mm', 40, 30], ['40 × 20 mm', 40, 20], ['30 × 20 mm', 30, 20],
  ['25 × 15 mm', 25, 15], ['75 × 50 mm', 75, 50], ['50 × 15 mm (cable)', 50, 15], ['70 × 15 mm (cable)', 70, 15],
  ['40 × 12 mm (narrow tape)', 40, 12], ['30 × 12 mm (narrow tape)', 30, 12],
];

const PROPS = ['data', 'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY', 'hasControls', 'strokeUniform'];

/* ------------------------------------------------------------------- canvas */
fabric.Object.prototype.set({
  transparentCorners: false, cornerColor: '#ffffff', cornerStrokeColor: '#2f6fed', borderColor: '#2f6fed',
  cornerSize: 9, cornerStyle: 'circle', borderScaleFactor: 1.5, strokeUniform: true,
});
fabric.Object.prototype.objectCaching = true;

const canvas = new fabric.Canvas('c', { preserveObjectStacking: true, backgroundColor: '#ffffff', stopContextMenu: true, fireRightClick: false });
let zoom = 1;
let userZoomed = false;
let loading = false;
let customFonts = []; // {name, data}

function applySize() {
  const { W, H } = labelPx();
  canvas.setZoom(zoom);
  canvas.setDimensions({ width: Math.round(W * zoom), height: Math.round(H * zoom) });
  $('#zoom-val').textContent = Math.round(zoom * 100) + '%';
  $('#stage-info').textContent = `${S.wMM} × ${S.hMM} mm · ${W} × ${H} px @ ${S.dpi} dpi`;
}
function fit() {
  const st = $('#stage');
  const { W, H } = labelPx();
  zoom = clamp(Math.min((st.clientWidth - 110) / W, (st.clientHeight - 110) / H), 0.2, 8);
  userZoomed = false;
  applySize();
}
function setZoom(z) {
  zoom = clamp(z, 0.2, 10);
  userZoomed = true;
  applySize();
}

/** Render the design at `scale` dots per label dot into a fresh canvas element. */
function renderDesign(scale = 1) {
  const { W, H } = labelPx();
  const z = zoom;
  canvas.setZoom(scale);
  canvas.setDimensions({ width: W * scale, height: H * scale });
  const out = canvas.toCanvasElement(1);
  canvas.setZoom(z);
  canvas.setDimensions({ width: Math.round(W * z), height: Math.round(H * z) });
  return out;
}

/** Design as it will look on the label (optionally rotated by the user). */
function finalCanvas() {
  let out = renderDesign(1);
  if (S.orient === 'cw' || S.orient === 'ccw') {
    const src = out;
    out = document.createElement('canvas');
    out.width = src.height;
    out.height = src.width;
    const ctx = out.getContext('2d');
    if (S.orient === 'cw') { ctx.translate(out.width, 0); ctx.rotate(Math.PI / 2); } else { ctx.translate(0, out.height); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(src, 0, 0);
  }
  // Labels are a bit wider than the printable area (e.g. 50 mm label, 48 mm head): trim the edges evenly.
  const over = acrossHead(out) - headPx();
  if (over > 0 && over <= mm2px(3)) {
    const left = Math.floor(over / 2);
    const c = document.createElement('canvas');
    const horiz = S.direction !== 'left';
    c.width = horiz ? out.width - over : out.width;
    c.height = horiz ? out.height : out.height - over;
    c.getContext('2d').drawImage(out, horiz ? -left : 0, horiz ? 0 : -left);
    out = c;
  }
  return out;
}
/** Size across the print head, depending on the feed direction. */
const acrossHead = (c) => (S.direction === 'left' ? c.height : c.width);
function bitmapToCanvas(bmp) {
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(bmp.width, bmp.height);
  for (let i = 0; i < bmp.bits.length; i++) { const v = bmp.bits[i] ? 0 : 255; id.data.set([v, v, v, 255], i * 4); }
  ctx.putImageData(id, 0, 0);
  return c;
}
const bitmapOpts = () => ({ threshold: S.threshold, dither: S.dither });

function updatePreview() {
  const out = finalCanvas();
  const bmp = canvasToBitmap(out, bitmapOpts());
  const pv = $('#preview');
  pv.width = bmp.width;
  pv.height = bmp.height;
  pv.getContext('2d').drawImage(bitmapToCanvas(bmp), 0, 0);
  pv.style.width = Math.min(bmp.width, 270) + 'px';
  $('#prev-info').textContent = `${bmp.width} × ${bmp.height} px`;
  const warn = $('#warn');
  const across = acrossHead(out);
  if (across > headPx()) {
    warn.hidden = false;
    warn.textContent = `The label is ${across}px across the print head, but the head is ${headPx()}px (${S.headMM} mm). Make it narrower, or change the feed direction / rotation in Printer settings.`;
  } else warn.hidden = true;
  return bmp;
}

/* ------------------------------------------------------------------ history */
const hist = { stack: [], idx: -1 };
function snapshotJSON() {
  return JSON.stringify({ label: { wMM: S.wMM, hMM: S.hMM, dpi: S.dpi }, canvas: canvas.toJSON(PROPS) });
}
function pushHistory() {
  if (loading) return;
  const j = snapshotJSON();
  if (hist.stack[hist.idx] === j) return;
  hist.stack = hist.stack.slice(0, hist.idx + 1);
  hist.stack.push(j);
  if (hist.stack.length > 80) hist.stack.shift();
  hist.idx = hist.stack.length - 1;
  updateUndoButtons();
}
function updateUndoButtons() {
  $('#btn-undo').disabled = hist.idx <= 0;
  $('#btn-redo').disabled = hist.idx >= hist.stack.length - 1;
}
async function restoreHistory(i) {
  if (i < 0 || i >= hist.stack.length) return;
  hist.idx = i;
  const p = JSON.parse(hist.stack[i]);
  await loadCore(p);
  updateUndoButtons();
  afterChange(false);
}
const undo = () => restoreHistory(hist.idx - 1);
const redo = () => restoreHistory(hist.idx + 1);

const autosave = debounce(() => store.set('niimbot.autosave', projectJSON()), 600);
const afterChange = (push = true) => {
  if (push) pushHistory();
  updatePreview();
  renderLayers();
  syncPanel();
  autosave();
};
const markChanged = debounce(() => afterChange(true), 180);

/* --------------------------------------------------------------- persistence */
function projectJSON() {
  return {
    app: 'niimbot-label-studio', version: 1,
    label: { wMM: S.wMM, hMM: S.hMM, dpi: S.dpi },
    fonts: customFonts,
    canvas: canvas.toJSON(PROPS),
  };
}
function loadCore(p) {
  return new Promise((resolve) => {
    loading = true;
    canvas.discardActiveObject();
    if (p.label) {
      S.wMM = p.label.wMM; S.hMM = p.label.hMM; S.dpi = p.label.dpi || S.dpi;
      syncLabelInputs();
    }
    canvas.loadFromJSON(p.canvas, () => {
      canvas.backgroundColor = '#ffffff';
      if (userZoomed) applySize(); else fit();
      canvas.renderAll();
      loading = false;
      resolve();
    });
  });
}
async function registerFont(name, dataUrl) {
  const ff = new FontFace(name, `url(${dataUrl})`);
  await ff.load();
  document.fonts.add(ff);
}
async function loadProject(p) {
  if (!p || !p.canvas) throw new Error('Not a label project');
  for (const f of p.fonts || []) {
    try { await registerFont(f.name, f.data); if (!customFonts.find((c) => c.name === f.name)) customFonts.push(f); } catch { /* ignore */ }
  }
  fillFontSelect();
  await loadCore(p);
  hist.stack = []; hist.idx = -1;
  pushHistory();
  afterChange(false);
}
function download(blobOrUrl, name) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

/* ------------------------------------------------------------------ objects */
function place(o, select = true) {
  const { W, H } = labelPx();
  o.set({ left: W / 2, top: H / 2, originX: 'center', originY: 'center' });
  canvas.add(o);
  o.setCoords();
  if (select) canvas.setActiveObject(o);
  canvas.requestRenderAll();
  setTool('select');
}
function fitInto(o, frac = 0.8) {
  const { W, H } = labelPx();
  const s = Math.min((W * frac) / o.width, (H * frac) / o.height);
  o.scale(s);
}
const lineProps = () => ({ stroke: '#000000', strokeWidth: defaultStroke(), strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round' });

const ADDERS = {
  text() {
    const { H } = labelPx();
    place(new fabric.IText('Text', { fontFamily: 'Lora', fontSize: Math.round(H * 0.28), fill: '#000000', fontWeight: 'bold', strokeWidth: 0, stroke: null, textAlign: 'center' }));
  },
  rect() {
    const { W, H } = labelPx();
    place(new fabric.Rect({ width: W * 0.5, height: H * 0.4, fill: 'transparent', ...lineProps() }));
  },
  ellipse() {
    const { W, H } = labelPx();
    place(new fabric.Ellipse({ rx: W * 0.2, ry: H * 0.2, fill: 'transparent', ...lineProps() }));
  },
  triangle() {
    const { W, H } = labelPx();
    place(new fabric.Triangle({ width: Math.min(W, H) * 0.6, height: Math.min(W, H) * 0.5, fill: 'transparent', ...lineProps() }));
  },
  star() {
    const { W, H } = labelPx();
    const R = Math.min(W, H) * 0.3, r = R * 0.42;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 ? r : R;
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    }
    place(new fabric.Polygon(pts, { fill: '#000000', ...lineProps() }));
  },
  line() {
    const { W } = labelPx();
    place(new fabric.Line([0, 0, W * 0.5, 0], { ...lineProps(), padding: 6 }));
  },
  arrow() {
    const { W } = labelPx();
    const p = new fabric.Path('M 0 0 L 100 0 M 78 -18 L 100 0 L 78 18', { fill: '', ...lineProps() });
    const s = (W * 0.4) / 100;
    p.scale(s);
    place(p);
  },
  qr: () => addCode('qr'),
  barcode: () => addCode('barcode'),
};

/* ---- QR & barcode */
function makeQR(value, ecc = 'M') {
  const qr = qrcode(0, ecc);
  qr.addData(value || ' ', 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const size = n + quiet * 2;
  const bg = new fabric.Rect({ left: 0, top: 0, width: size, height: size, fill: '#fff', strokeWidth: 0, stroke: null, objectCaching: false });
  const path = new fabric.Path(d, { fill: '#000', strokeWidth: 0, stroke: null, objectCaching: false });
  return new fabric.Group([bg, path], { subTargetCheck: false });
}
function makeBarcode(value, format = 'CODE128', showText = true) {
  return new Promise((resolve, reject) => {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, value, { format, displayValue: showText, width: 2, height: 70, margin: 8, fontSize: 18, textMargin: 2, background: '#ffffff', lineColor: '#000000' });
      fabric.loadSVGFromString(new XMLSerializer().serializeToString(svg), (objs, opts) => {
        const g = fabric.util.groupSVGElements(objs, opts);
        resolve(g);
      });
    } catch (e) {
      reject(new Error(`Barcode: ${e.message || 'invalid value for this format'}`));
    }
  });
}
async function addCode(kind) {
  const { W, H } = labelPx();
  try {
    let o;
    if (kind === 'qr') {
      o = makeQR('https://example.com', 'M');
      o.data = { kind: 'qr', value: 'https://example.com', ecc: 'M' };
      const mod = Math.max(1, Math.floor((H * 0.7) / o.width));
      o.scale(mod);
    } else {
      o = await makeBarcode('NIIMBOT-123', 'CODE128', true);
      o.data = { kind: 'barcode', value: 'NIIMBOT-123', format: 'CODE128', showText: true };
      o.scaleToWidth(Math.min(W * 0.85, o.width * 2));
    }
    place(o);
  } catch (e) {
    toast(e.message, true);
  }
}
async function rebuildCode(o, patch) {
  const d = { ...o.data, ...patch };
  let n;
  try {
    n = d.kind === 'qr' ? makeQR(d.value, d.ecc) : await makeBarcode(d.value, d.format, d.showText);
  } catch (e) {
    toast(e.message, true);
    return;
  }
  n.data = d;
  const c = o.getCenterPoint();
  n.scaleToWidth(o.getScaledWidth());
  n.set({ originX: 'center', originY: 'center', left: c.x, top: c.y, angle: o.angle, flipX: o.flipX, flipY: o.flipY });
  const idx = canvas.getObjects().indexOf(o);
  canvas.remove(o);
  canvas.insertAt(n, idx);
  n.setCoords();
  canvas.setActiveObject(n);
  canvas.requestRenderAll();
}

/* ---- images, SVG, symbols */
function loadSVGString(str, data) {
  return new Promise((resolve, reject) => {
    fabric.loadSVGFromString(str, (objs, opts) => {
      if (!objs || !objs.length) return reject(new Error('Empty or unsupported SVG'));
      const g = fabric.util.groupSVGElements(objs, opts);
      g.data = data;
      resolve(g);
    });
  });
}
async function addSymbol(id) {
  const g = await loadSVGString(symbolSVG(id), { kind: 'symbol', id, solid: false, color: '#000000' });
  fitInto(g, 0.7);
  place(g);
  $('#symbol-pop').hidden = true;
}
function readFile(file, as) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    as === 'text' ? r.readAsText(file) : r.readAsDataURL(file);
  });
}
function downscale(dataUrl, type, max = 1600) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      if (s === 1 && dataUrl.length < 400000) return res(dataUrl);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png'));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}
async function addImageFile(file) {
  try {
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      const g = await loadSVGString(await readFile(file, 'text'), { kind: 'svg' });
      fitInto(g, 0.85);
      place(g);
      return;
    }
    if (!file.type.startsWith('image/')) throw new Error(`${file.name}: not an image`);
    const url = await downscale(await readFile(file, 'url'), file.type);
    await new Promise((resolve, reject) => {
      fabric.Image.fromURL(url, (img) => {
        if (!img || !img.width) return reject(new Error('Could not decode image'));
        img.data = { kind: 'image' };
        fitInto(img, 0.9);
        place(img);
        resolve();
      });
    });
  } catch (e) {
    toast(e.message, true);
  }
}

/* -------------------------------------------------------------------- tools */
let tool = 'select';
function setTool(t) {
  tool = t;
  canvas.isDrawingMode = t === 'draw';
  if (t === 'draw') {
    const b = new fabric.PencilBrush(canvas);
    b.width = defaultStroke();
    b.color = '#000000';
    b.strokeLineCap = 'round';
    canvas.freeDrawingBrush = b;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }
  $$('.tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t || (t === 'select' && b.dataset.tool === 'select')));
  if (t !== 'select' && t !== 'draw') $$('.tools button').forEach((b) => b.classList.toggle('active', b.dataset.tool === 'select'));
}
$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tool]');
  if (!b) return;
  const t = b.dataset.tool;
  $('#symbol-pop').hidden = t !== 'symbol' ? true : !$('#symbol-pop').hidden;
  if (t === 'select' || t === 'draw') return setTool(t === 'draw' && tool === 'draw' ? 'select' : t);
  if (t === 'symbol') return;
  if (t === 'image') return $('#file-image').click();
  setTool('select');
  ADDERS[t]?.();
});
$('#symbol-grid').innerHTML = SYMBOLS.map(([id, name, inner]) => `<button data-sym="${id}" title="${name}"><svg viewBox="0 0 24 24">${inner}</svg></button>`).join('');
$('#symbol-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sym]');
  if (b) addSymbol(b.dataset.sym).catch((err) => toast(err.message, true));
});
$('#symbol-pop').addEventListener('click', (e) => e.target.matches('[data-close]') && ($('#symbol-pop').hidden = true));
$('#file-image').addEventListener('change', async (e) => {
  for (const f of e.target.files) await addImageFile(f);
  e.target.value = '';
});

canvas.on('path:created', (e) => {
  e.path.set({ strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round', data: { kind: 'drawing' } });
});

/* -------------------------------------------------------- snapping & guides */
let guides = [];
canvas.on('object:moving', (e) => {
  guides = [];
  if (!S.snap) return;
  const o = e.target;
  const { W, H } = labelPx();
  const br = o.getBoundingRect(true, true);
  const th = 7 / zoom;
  const snap = (vals, targets, axis) => {
    let best = null;
    for (const v of vals) for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) < th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
    }
    if (best) {
      o.set(axis === 'x' ? 'left' : 'top', o[axis === 'x' ? 'left' : 'top'] + best.d);
      guides.push({ axis, pos: best.t });
    }
  };
  snap([br.left, br.left + br.width / 2, br.left + br.width], [0, W / 2, W], 'x');
  snap([br.top, br.top + br.height / 2, br.top + br.height], [0, H / 2, H], 'y');
});
canvas.on('mouse:up', () => {
  if (guides.length) {
    guides = [];
    canvas.requestRenderAll();
  }
});
canvas.on('after:render', () => {
  if (!guides.length) return;
  const ctx = canvas.contextTop;
  if (!ctx) return;
  const { W, H } = labelPx();
  ctx.save();
  ctx.strokeStyle = '#ff3b8d';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  for (const g of guides) {
    ctx.beginPath();
    if (g.axis === 'x') { ctx.moveTo(g.pos * zoom, 0); ctx.lineTo(g.pos * zoom, H * zoom); } else { ctx.moveTo(0, g.pos * zoom); ctx.lineTo(W * zoom, g.pos * zoom); }
    ctx.stroke();
  }
  ctx.restore();
  canvas.contextTopDirty = true;
});

/* ----------------------------------------------------------------- fonts */
const BASE_FONTS = ['Arial', 'Helvetica', 'Arial Black', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Palatino', 'Courier New', 'Menlo', 'Impact', 'Comic Sans MS', 'Futura', 'Gill Sans', 'Avenir Next', 'Optima', 'Rockwell', 'Segoe UI', 'Calibri', 'Consolas'];
let systemFonts = [];
function fontInstalled(name) {
  const c = document.createElement('canvas').getContext('2d');
  const test = 'mmmmmmmmmmlli';
  const w = (f) => { c.font = `72px ${f}`; return c.measureText(test).width; };
  return ['monospace', 'serif', 'sans-serif'].some((fb) => w(`"${name}", ${fb}`) !== w(fb));
}
const BUNDLED_FONTS = ['Lora'];
const availableBase = [...BUNDLED_FONTS, ...BASE_FONTS.filter(fontInstalled)];
function fillFontSelect(extra) {
  const sel = $('#t-font');
  const cur = extra || sel.value;
  const names = [...new Set([...availableBase, 'sans-serif', 'serif', 'monospace', ...customFonts.map((f) => f.name), ...systemFonts])];
  if (cur && !names.includes(cur)) names.push(cur);
  sel.innerHTML = names.map((n) => `<option value="${n}" style="font-family:'${n}'">${n}</option>`).join('');
  sel.value = cur || 'Arial';
}
fillFontSelect('Lora');
$('#t-load-fonts').hidden = !window.queryLocalFonts;
$('#t-load-fonts').addEventListener('click', async () => {
  try {
    const list = await window.queryLocalFonts();
    systemFonts = [...new Set(list.map((f) => f.family))].sort();
    fillFontSelect();
    toast(`${systemFonts.length} system font families loaded`);
  } catch (e) {
    toast('Permission to read system fonts was denied', true);
  }
});
$('#t-upload-font').addEventListener('click', () => $('#file-font').click());
$('#file-font').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const name = f.name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]/g, '');
  try {
    const data = await readFile(f, 'url');
    await registerFont(name, data);
    customFonts.push({ name, data });
    fillFontSelect(name);
    const o = canvas.getActiveObject();
    if (o?.type === 'i-text') setText({ fontFamily: name });
    toast(`Font “${name}” added (saved inside the project)`);
  } catch {
    toast('Could not load that font file', true);
  }
});

/* ------------------------------------------------------------ property panel */
const active = () => canvas.getActiveObject();
const kindOf = (o) => o?.data?.kind || o?.type;
const SHAPES = ['rect', 'ellipse', 'triangle', 'polygon', 'line', 'path', 'drawing'];

function setVal(el, v) {
  if (document.activeElement !== el) el.value = v;
}
const r1 = (n) => Math.round(n * 10) / 10;

function syncPanel() {
  const o = active();
  const sec = (id, on) => ($(id).hidden = !on);
  sec('#sec-empty', !o);
  sec('#sec-arrange', !!o);
  const multi = o && o.type === 'activeSelection';
  const k = kindOf(o);
  sec('#sec-text', !multi && o?.type === 'i-text');
  sec('#sec-style', !multi && !!o && (o.type === 'i-text' || SHAPES.includes(k) || SHAPES.includes(o.type)) && !['qr', 'barcode', 'symbol', 'svg', 'image'].includes(k));
  sec('#sec-symbol', !multi && k === 'symbol');
  sec('#sec-image', !multi && k === 'image');
  sec('#sec-code', !multi && (k === 'qr' || k === 'barcode'));
  $('#align-row').hidden = false;
  if (!o) return;

  const sw = o.getScaledWidth(), sh = o.getScaledHeight();
  const br = o.getBoundingRect(true, true);
  setVal($('#p-x'), r1(px2mm(br.left)));
  setVal($('#p-y'), r1(px2mm(br.top)));
  setVal($('#p-w'), r1(px2mm(sw)));
  setVal($('#p-h'), r1(px2mm(sh)));
  setVal($('#p-angle'), Math.round(((o.angle % 360) + 360) % 360));
  $('#o-lock').textContent = o.lockMovementX ? 'Unlock' : 'Lock';
  $('#o-lock').classList.toggle('on', !!o.lockMovementX);

  if (!$('#sec-text').hidden) {
    setVal($('#t-content'), o.text);
    if (![...$('#t-font').options].some((x) => x.value === o.fontFamily)) fillFontSelect(o.fontFamily);
    $('#t-font').value = o.fontFamily;
    setVal($('#t-size'), r1((o.fontSize * 72) / S.dpi));
    setVal($('#t-lh'), o.lineHeight);
    setVal($('#t-cs'), o.charSpacing || 0);
    $('#t-bold').classList.toggle('on', o.fontWeight === 'bold' || o.fontWeight >= 600);
    $('#t-italic').classList.toggle('on', o.fontStyle === 'italic');
    $('#t-underline').classList.toggle('on', !!o.underline);
    $('#t-strike').classList.toggle('on', !!o.linethrough);
    $$('[data-align]').forEach((b) => b.classList.toggle('on', b.dataset.align === o.textAlign));
    $('#t-invert').checked = !!o.backgroundColor;
  }
  if (!$('#sec-style').hidden) {
    const col = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : typeof v === 'string' && v.startsWith('#') && v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : '#000000');
    $('#s-fill').value = col(o.fill);
    $('#s-stroke').value = col(o.stroke);
    setVal($('#s-sw'), r1(o.strokeWidth || 0));
    $('#s-dash').value = !o.strokeDashArray ? '' : o.strokeDashArray[0] > o.strokeWidth ? 'd' : 'o';
    $('#s-rx-wrap').hidden = o.type !== 'rect';
    if (o.type === 'rect') setVal($('#s-rx'), Math.round(o.rx || 0));
  }
  if (!$('#sec-symbol').hidden) {
    $('#y-solid').classList.toggle('on', !!o.data.solid);
    $('#y-outline').classList.toggle('on', !o.data.solid);
    $('#y-white').classList.toggle('on', o.data.color === '#ffffff');
    setVal($('#y-sw'), o._objects?.[0]?.strokeWidth ?? 2);
  }
  if (!$('#sec-image').hidden) {
    const f = o.filters || [];
    $('#i-bright').value = Math.round((f.find((x) => x.type === 'Brightness')?.brightness || 0) * 100);
    $('#i-contrast').value = Math.round((f.find((x) => x.type === 'Contrast')?.contrast || 0) * 100);
    $('#i-invert').checked = !!f.find((x) => x.type === 'Invert');
  }
  if (!$('#sec-code').hidden) {
    $('#code-title').textContent = k === 'qr' ? 'QR code' : 'Barcode';
    setVal($('#c-value'), o.data.value);
    $('#c-qr-row').hidden = k !== 'qr';
    $('#c-bar-row').hidden = k !== 'barcode';
    if (k === 'qr') $('#c-ecc').value = o.data.ecc;
    else { $('#c-format').value = o.data.format; $('#c-text').checked = o.data.showText; }
  }
}

const apply = (fn) => {
  const o = active();
  if (!o) return;
  fn(o);
  o.setCoords();
  canvas.requestRenderAll();
  markChanged();
  syncPanel();
};
const setText = (props) => apply((o) => {
  o.set(props);
  if (props.fontFamily || props.fontSize) fabric.util.clearFabricFontCache?.();
  o.initDimensions?.();
});
const num = (el) => parseFloat(el.value);

// arrange
$('#p-x').addEventListener('input', () => apply((o) => { const v = num($('#p-x')); if (isNaN(v)) return; o.set('left', o.left + (mm2px(v) - o.getBoundingRect(true, true).left)); }));
$('#p-y').addEventListener('input', () => apply((o) => { const v = num($('#p-y')); if (isNaN(v)) return; o.set('top', o.top + (mm2px(v) - o.getBoundingRect(true, true).top)); }));
function resizeTo(which) {
  apply((o) => {
    const v = num($(which === 'w' ? '#p-w' : '#p-h'));
    if (!(v > 0)) return;
    const c = o.getCenterPoint();
    const cw = o.getScaledWidth(), ch = o.getScaledHeight();
    const fx = which === 'w' ? mm2px(v) / cw : 1;
    const fy = which === 'h' ? mm2px(v) / ch : 1;
    const lock = $('#p-lock').checked;
    const f = which === 'w' ? fx : fy;
    o.set({ scaleX: o.scaleX * (lock ? f : fx), scaleY: o.scaleY * (lock ? f : fy) });
    o.setPositionByOrigin(c, 'center', 'center');
  });
}
$('#p-w').addEventListener('input', () => resizeTo('w'));
$('#p-h').addEventListener('input', () => resizeTo('h'));
$('#p-angle').addEventListener('input', () => apply((o) => { const c = o.getCenterPoint(); o.rotate(num($('#p-angle')) || 0); o.setPositionByOrigin(c, 'center', 'center'); }));
$('#p-rot90').addEventListener('click', () => apply((o) => { const c = o.getCenterPoint(); o.rotate(((o.angle || 0) + 90) % 360); o.setPositionByOrigin(c, 'center', 'center'); }));
$('#p-flipx').addEventListener('click', () => apply((o) => o.set('flipX', !o.flipX)));
$('#p-flipy').addEventListener('click', () => apply((o) => o.set('flipY', !o.flipY)));
$('#align-row').addEventListener('click', (e) => {
  const m = e.target.closest('[data-align-l]')?.dataset.alignL;
  if (!m) return;
  apply((o) => {
    const { W, H } = labelPx();
    const br = o.getBoundingRect(true, true);
    let dx = 0, dy = 0;
    if (m === 'left') dx = -br.left;
    if (m === 'right') dx = W - (br.left + br.width);
    if (m === 'hcenter') dx = W / 2 - (br.left + br.width / 2);
    if (m === 'top') dy = -br.top;
    if (m === 'bottom') dy = H - (br.top + br.height);
    if (m === 'vcenter') dy = H / 2 - (br.top + br.height / 2);
    o.set({ left: o.left + dx, top: o.top + dy });
  });
});
const eachSel = (fn) => { canvas.getActiveObjects().forEach(fn); canvas.requestRenderAll(); markChanged(); };
$('#z-front').addEventListener('click', () => eachSel((o) => canvas.bringToFront(o)));
$('#z-fwd').addEventListener('click', () => eachSel((o) => canvas.bringForward(o)));
$('#z-back').addEventListener('click', () => eachSel((o) => canvas.sendBackwards(o)));
$('#z-bottom').addEventListener('click', () => eachSel((o) => canvas.sendToBack(o)));
$('#o-del').addEventListener('click', deleteSelection);
$('#o-dup').addEventListener('click', () => { copySel(); pasteSel(); });
$('#o-lock').addEventListener('click', () => apply((o) => {
  const on = !o.lockMovementX;
  o.set({ lockMovementX: on, lockMovementY: on, lockRotation: on, lockScalingX: on, lockScalingY: on, hasControls: !on });
}));

// text
$('#t-content').addEventListener('input', () => setText({ text: $('#t-content').value }));
$('#t-font').addEventListener('change', () => setText({ fontFamily: $('#t-font').value }));
$('#t-size').addEventListener('input', () => { const v = num($('#t-size')); if (v > 0) setText({ fontSize: Math.round((v * S.dpi) / 72) }); });
$('#t-lh').addEventListener('input', () => { const v = num($('#t-lh')); if (v > 0) setText({ lineHeight: v }); });
$('#t-cs').addEventListener('input', () => setText({ charSpacing: num($('#t-cs')) || 0 }));
$('#t-bold').addEventListener('click', () => apply((o) => o.set('fontWeight', o.fontWeight === 'bold' ? 'normal' : 'bold') && o.initDimensions()));
$('#t-italic').addEventListener('click', () => apply((o) => o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic') && o.initDimensions()));
$('#t-underline').addEventListener('click', () => apply((o) => o.set('underline', !o.underline)));
$('#t-strike').addEventListener('click', () => apply((o) => o.set('linethrough', !o.linethrough)));
$$('[data-align]').forEach((b) => b.addEventListener('click', () => setText({ textAlign: b.dataset.align })));
$('#t-invert').addEventListener('change', () => apply((o) => {
  const on = $('#t-invert').checked;
  o.set({ fill: on ? '#ffffff' : '#000000', backgroundColor: on ? '#000000' : '' });
}));

// style
$('#s-fill').addEventListener('input', () => apply((o) => o.set('fill', $('#s-fill').value)));
$('#s-stroke').addEventListener('input', () => apply((o) => { o.set('stroke', $('#s-stroke').value); if (!o.strokeWidth) o.set('strokeWidth', defaultStroke()); }));
$('#s-fill-none').addEventListener('click', () => apply((o) => o.set('fill', 'transparent')));
$('#s-stroke-none').addEventListener('click', () => apply((o) => o.set({ stroke: null, strokeWidth: 0 })));
$('#s-sw').addEventListener('input', () => apply((o) => {
  const v = Math.max(0, num($('#s-sw')) || 0);
  o.set({ strokeWidth: v, stroke: o.stroke || '#000000' });
}));
$('#s-dash').addEventListener('change', () => apply((o) => {
  const w = Math.max(1, o.strokeWidth || 1), v = $('#s-dash').value;
  o.set('strokeDashArray', v === 'd' ? [w * 3, w * 2] : v === 'o' ? [w * 0.1, w * 2] : null);
  if (v === 'o') o.set('strokeLineCap', 'round');
}));
$('#s-rx').addEventListener('input', () => apply((o) => o.set({ rx: num($('#s-rx')) || 0, ry: num($('#s-rx')) || 0 })));

// symbol
function styleSymbol(o, patch) {
  Object.assign(o.data, patch);
  const { solid, color } = o.data;
  const leaves = o._objects || [o];
  leaves.forEach((c) => { c.set({ stroke: color, fill: solid ? color : '' }); c.dirty = true; });
  o.dirty = true;
}
$('#y-outline').addEventListener('click', () => apply((o) => styleSymbol(o, { solid: false })));
$('#y-solid').addEventListener('click', () => apply((o) => styleSymbol(o, { solid: true })));
$('#y-white').addEventListener('click', () => apply((o) => styleSymbol(o, { color: o.data.color === '#ffffff' ? '#000000' : '#ffffff' })));
$('#y-sw').addEventListener('input', () => apply((o) => { const v = num($('#y-sw')); if (v > 0) { (o._objects || [o]).forEach((c) => { c.set('strokeWidth', v); c.dirty = true; }); o.dirty = true; } }));

// image filters
function applyImageFilters() {
  apply((o) => {
    const F = fabric.Image.filters;
    const f = [];
    const b = num($('#i-bright')) / 100, c = num($('#i-contrast')) / 100;
    if (b) f.push(new F.Brightness({ brightness: b }));
    if (c) f.push(new F.Contrast({ contrast: c }));
    if ($('#i-invert').checked) f.push(new F.Invert());
    o.filters = f;
    o.applyFilters();
  });
}
['#i-bright', '#i-contrast'].forEach((s) => $(s).addEventListener('input', applyImageFilters));
$('#i-invert').addEventListener('change', applyImageFilters);

// code
const codeUpdate = debounce((patch) => { const o = active(); if (o && ['qr', 'barcode'].includes(kindOf(o))) rebuildCode(o, patch); }, 250);
$('#c-value').addEventListener('input', () => codeUpdate({ value: $('#c-value').value }));
$('#c-ecc').addEventListener('change', () => codeUpdate({ ecc: $('#c-ecc').value }));
$('#c-format').addEventListener('change', () => codeUpdate({ format: $('#c-format').value }));
$('#c-text').addEventListener('change', () => codeUpdate({ showText: $('#c-text').checked }));

/* ------------------------------------------------------------------- layers */
const KIND_NAME = { rect: 'Box', ellipse: 'Oval', triangle: 'Triangle', polygon: 'Polygon', line: 'Line', path: 'Path', 'i-text': 'Text', image: 'Image', group: 'Group', qr: 'QR code', barcode: 'Barcode', symbol: 'Symbol', svg: 'Vector', drawing: 'Drawing' };
function renderLayers() {
  const objs = canvas.getObjects().slice().reverse();
  const sel = new Set(canvas.getActiveObjects());
  const ul = $('#layers');
  if (!objs.length) { ul.innerHTML = '<li class="none">Empty label</li>'; return; }
  ul.innerHTML = '';
  objs.forEach((o) => {
    const li = document.createElement('li');
    li.className = sel.has(o) ? 'sel' : '';
    const k = kindOf(o);
    const nm = o.type === 'i-text' ? `“${(o.text || '').replace(/\n/g, ' ').slice(0, 24)}”` : o.data?.id ? `${KIND_NAME[k]}: ${o.data.id}` : o.data?.value ? `${KIND_NAME[k]}: ${String(o.data.value).slice(0, 18)}` : KIND_NAME[k] || k;
    li.innerHTML = `<span class="nm"></span><button data-a="vis" title="Show / hide (hidden layers are not printed)">${o.visible === false ? '◌' : '●'}</button>`;
    li.querySelector('.nm').textContent = nm;
    li.addEventListener('click', (e) => {
      if (e.target.closest('[data-a=vis]')) {
        o.visible = o.visible === false;
        if (!o.visible) canvas.discardActiveObject();
        canvas.requestRenderAll();
        return afterChange(true);
      }
      canvas.setActiveObject(o);
      canvas.requestRenderAll();
    });
    ul.appendChild(li);
  });
}

canvas.on('selection:created', () => { renderLayers(); syncPanel(); });
canvas.on('selection:updated', () => { renderLayers(); syncPanel(); });
canvas.on('selection:cleared', () => { renderLayers(); syncPanel(); });
['object:moving', 'object:scaling', 'object:rotating'].forEach((ev) => canvas.on(ev, syncPanel));
canvas.on('object:modified', (e) => {
  const o = e.target;
  // keep text sizes honest: bake scale into the font size
  if (o?.type === 'i-text' && (o.scaleX !== 1 || o.scaleY !== 1)) {
    const c = o.getCenterPoint();
    o.set({ fontSize: Math.max(4, Math.round(o.fontSize * Math.max(o.scaleX, o.scaleY))), scaleX: 1, scaleY: 1 });
    o.initDimensions();
    o.setPositionByOrigin(c, 'center', 'center');
  }
  markChanged();
});
['object:added', 'object:removed', 'path:created'].forEach((ev) => canvas.on(ev, () => !loading && markChanged()));
canvas.on('text:changed', () => { markChanged(); syncPanel(); });
canvas.on('text:editing:exited', () => markChanged());

/* ---------------------------------------------------------- clipboard & keys */
let clip = null;
function copySel() {
  const o = active();
  if (o) o.clone((c) => (clip = c), PROPS);
}
function pasteSel() {
  if (!clip) return;
  clip.clone((c) => {
    canvas.discardActiveObject();
    c.set({ left: c.left + 16, top: c.top + 16, evented: true });
    if (c.type === 'activeSelection') {
      c.canvas = canvas;
      c.forEachObject((o) => canvas.add(o));
      c.setCoords();
    } else canvas.add(c);
    clip.set({ left: clip.left + 16, top: clip.top + 16 });
    canvas.setActiveObject(c);
    canvas.requestRenderAll();
  }, PROPS);
}
function deleteSelection() {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  canvas.discardActiveObject();
  objs.forEach((o) => canvas.remove(o));
  canvas.requestRenderAll();
}
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
  const o = active();
  if (o?.isEditing) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === 'c') { copySel(); }
  else if (mod && k === 'v') { /* handled by paste event */ }
  else if (mod && k === 'd') { e.preventDefault(); copySel(); pasteSel(); }
  else if (mod && k === 'a') { e.preventDefault(); canvas.discardActiveObject(); canvas.setActiveObject(new fabric.ActiveSelection(canvas.getObjects().filter((x) => x.visible), { canvas })); canvas.requestRenderAll(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
  else if (e.key === 'Escape') { canvas.discardActiveObject(); canvas.requestRenderAll(); setTool('select'); $('#symbol-pop').hidden = true; }
  else if (e.key.startsWith('Arrow') && o) {
    e.preventDefault();
    const d = e.shiftKey ? 8 : 1;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    o.set({ left: o.left + dx, top: o.top + dy });
    o.setCoords();
    canvas.requestRenderAll();
    markChanged();
    syncPanel();
  } else if (!mod && k === 'v') setTool('select');
  else if (!mod && k === 't') { setTool('select'); ADDERS.text(); }
  else if (!mod && k === 'b') setTool(tool === 'draw' ? 'select' : 'draw');
});
document.addEventListener('paste', async (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || active()?.isEditing) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); for (const f of files) await addImageFile(f); } else pasteSel();
});

// drag & drop files
const stage = $('#stage');
['dragenter', 'dragover'].forEach((ev) => stage.addEventListener(ev, (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); stage.classList.add('drag'); } }));
['dragleave', 'drop'].forEach((ev) => stage.addEventListener(ev, () => stage.classList.remove('drag')));
stage.addEventListener('drop', async (e) => {
  e.preventDefault();
  for (const f of e.dataTransfer.files) {
    if (/\.json$/i.test(f.name)) {
      try { await loadProject(JSON.parse(await readFile(f, 'text'))); } catch (err) { toast(err.message, true); }
    } else await addImageFile(f);
  }
});

// zoom
stage.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });
$('#zoom-in').addEventListener('click', () => setZoom(zoom * 1.25));
$('#zoom-out').addEventListener('click', () => setZoom(zoom / 1.25));
$('#zoom-fit').addEventListener('click', fit);
window.addEventListener('resize', () => { if (!userZoomed) fit(); });

/* ----------------------------------------------------------- label settings */
function syncLabelInputs() {
  $('#lbl-w').value = S.wMM;
  $('#lbl-h').value = S.hMM;
  $('#lbl-dpi').value = S.dpi;
  const i = PRESETS.findIndex((p) => p[1] === S.wMM && p[2] === S.hMM);
  $('#preset').value = i >= 0 ? i : 'custom';
}
$('#preset').innerHTML = PRESETS.map((p, i) => `<option value="${i}">${p[0]}</option>`).join('') + '<option value="custom">Custom size…</option>';
function setLabelSize(w, h, dpi = S.dpi) {
  S.wMM = clamp(w, 5, 200); S.hMM = clamp(h, 5, 200); S.dpi = dpi;
  saveSettings();
  syncLabelInputs();
  if (userZoomed) applySize(); else fit();
  canvas.requestRenderAll();
  afterChange(true);
}
$('#preset').addEventListener('change', () => { const p = PRESETS[$('#preset').value]; if (p) setLabelSize(p[1], p[2]); });
$('#lbl-w').addEventListener('change', () => setLabelSize(num($('#lbl-w')) || S.wMM, S.hMM));
$('#lbl-h').addEventListener('change', () => setLabelSize(S.wMM, num($('#lbl-h')) || S.hMM));
$('#lbl-swap').addEventListener('click', () => setLabelSize(S.hMM, S.wMM));
$('#lbl-dpi').addEventListener('change', () => {
  // keep physical size of existing objects: rescale content
  const old = S.dpi, nw = Number($('#lbl-dpi').value), f = nw / old;
  canvas.discardActiveObject();
  canvas.getObjects().forEach((o) => { o.set({ left: o.left * f, top: o.top * f, scaleX: o.scaleX * f, scaleY: o.scaleY * f }); o.setCoords(); });
  setLabelSize(S.wMM, S.hMM, nw);
});

function bind(id, key, parse = (v) => v, evt = 'change', after = () => updatePreview()) {
  const el = $(id);
  if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key];
  el.addEventListener(evt, () => {
    S[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
    saveSettings();
    after();
  });
}
bind('#threshold', 'threshold', Number, 'input');
bind('#dither', 'dither');
bind('#snap', 'snap', (v) => v, 'change', () => {});
bind('#pr-density', 'density', Number, 'change', () => {});
bind('#pr-type', 'labelType', Number, 'change', () => {});
bind('#pr-head', 'headMM', (v) => clamp(Number(v) || 48, 5, 150));
bind('#pr-orient', 'orient');
bind('#pr-dir', 'direction', (v) => v, 'change', () => updatePreview());
bind('#pr-task', 'task', (v) => v, 'change', () => {});
$('#pr-task').innerHTML = '<option value="auto">Auto (from model)</option>' + TASKS.map((t) => `<option>${t}</option>`).join('');
$('#pr-task').value = S.task;
bind('#copies', 'copies', (v) => clamp(parseInt(v) || 1, 1, 99), 'change', () => {});

/* ------------------------------------------------------------- file actions */
function thumbnail() {
  const c = renderDesign(1);
  const t = document.createElement('canvas');
  const s = Math.min(1, 320 / c.width);
  t.width = Math.round(c.width * s);
  t.height = Math.round(c.height * s);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}
const getLib = () => store.get('niimbot.library', []);
function saveToLibrary() {
  const name = prompt('Name for this label:', `Label ${new Date().toLocaleDateString()}`);
  if (!name) return;
  const lib = getLib();
  lib.unshift({ id: Date.now(), name, date: Date.now(), thumb: thumbnail(), project: projectJSON() });
  if (!store.set('niimbot.library', lib)) toast('Browser storage is full. Download the project file instead.', true);
  else toast('Saved to library');
}
function renderLibrary() {
  const lib = getLib();
  const g = $('#lib-grid');
  if (!lib.length) { g.innerHTML = '<div class="lib-empty">Nothing saved yet. Use Save → “Save to browser library”.</div>'; return; }
  g.innerHTML = '';
  lib.forEach((it) => {
    const d = document.createElement('div');
    d.className = 'lib-item';
    d.innerHTML = '<img alt=""><div class="nm"></div><div class="row"><button data-a="open">Open</button><button data-a="del" class="danger">Delete</button></div>';
    d.querySelector('img').src = it.thumb;
    d.querySelector('.nm').textContent = it.name;
    d.addEventListener('click', async (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'open') { await loadProject(it.project); $('#dlg-library').close(); }
      if (a === 'del' && confirm(`Delete “${it.name}”?`)) { store.set('niimbot.library', getLib().filter((x) => x.id !== it.id)); renderLibrary(); }
    });
    g.appendChild(d);
  });
}
$('#btn-library').addEventListener('click', () => { renderLibrary(); $('#dlg-library').showModal(); });
$('#btn-new').addEventListener('click', async () => {
  if (canvas.getObjects().length && !confirm('Start a new label? Unsaved changes will be lost.')) return;
  await loadProject({ label: { wMM: S.wMM, hMM: S.hMM, dpi: S.dpi }, canvas: { version: fabric.version, objects: [], background: '#ffffff' } });
});
$('#btn-open').addEventListener('click', () => $('#file-project').click());
$('#file-project').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { await loadProject(JSON.parse(await readFile(f, 'text'))); toast(`Opened ${f.name}`); } catch (err) { toast('Could not open file: ' + err.message, true); }
});
$('#btn-save').addEventListener('click', (e) => { e.stopPropagation(); $('.menu').classList.toggle('open'); });
document.addEventListener('click', () => $('.menu').classList.remove('open'));
$('#save-menu').addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.act;
  if (a === 'save-library') saveToLibrary();
  if (a === 'save-file') download(new Blob([JSON.stringify(projectJSON())], { type: 'application/json' }), `label-${stamp()}.json`);
  if (a === 'export-bitmap') {
    const c = bitmapToCanvas(canvasToBitmap(finalCanvas(), bitmapOpts()));
    c.toBlob((b) => download(b, `label-${stamp()}-print.png`));
  }
  if (a === 'export-design') renderDesign(3).toBlob((b) => download(b, `label-${stamp()}@3x.png`));
});
$('#btn-undo').addEventListener('click', undo);
$('#btn-redo').addEventListener('click', redo);

/* ------------------------------------------------------------------ printer */
const logEl = $('#log');
const printer = new Printer((msg, verbose) => {
  logEl.textContent += (verbose ? '  ' : '') + msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
});
function updateStatus() {
  const s = $('#printer-status');
  s.textContent = printer.connected ? printer.name || 'Connected' : 'Not connected';
  s.classList.toggle('on', printer.connected);
  $('#btn-connect').textContent = printer.connected ? 'Disconnect' : 'Connect';
}
printer.onDisconnect = updateStatus;
function setSetting(id, key, value) {
  S[key] = value;
  $(id).value = value;
}
async function connect() {
  try {
    const { meta } = await printer.connect();
    if (meta) {
      // adopt the printer's real geometry
      setSetting('#pr-head', 'headMM', Math.round(((meta.printheadPixels * 25.4) / meta.dpi) * 2) / 2);
      setSetting('#pr-dir', 'direction', meta.printDirection);
      if (S.density > meta.densityMax) setSetting('#pr-density', 'density', meta.densityDefault);
      if (meta.dpi !== S.dpi) {
        $('#lbl-dpi').value = meta.dpi;
        $('#lbl-dpi').dispatchEvent(new Event('change'));
        toast(`Switched to ${meta.dpi} dpi for ${meta.model}`);
      }
      saveSettings();
      updatePreview();
    } else toast('Connected, but the model is unknown — see the printer log', true);
  } catch (e) {
    if (e.name !== 'NotFoundError') toast(e.message || String(e), true);
    logEl.textContent += `ERROR: ${e.message || e}\n`;
    throw e;
  } finally {
    updateStatus();
  }
}
$('#btn-connect').addEventListener('click', () => (printer.connected ? printer.disconnect() : connect().catch(() => {})));
$('#btn-print').addEventListener('click', async () => {
  const btn = $('#btn-print');
  try {
    if (!printer.connected) await connect();
    const out = finalCanvas();
    if (acrossHead(out) > headPx()) throw new Error(`Label is ${acrossHead(out)}px across the head, max ${headPx()}px — see the preview warning.`);
    const bw = bitmapToCanvas(canvasToBitmap(out, bitmapOpts()));
    btn.disabled = true;
    $('#progress').classList.add('show');
    printer.onProgress = (p) => ($('#progress i').style.width = p * 100 + '%');
    await printer.print(bw, { density: S.density, labelType: S.labelType, copies: S.copies, direction: S.direction, taskName: S.task });
    toast('Printed ✓');
  } catch (e) {
    if (e.name !== 'NotFoundError') toast(e.message || String(e), true);
    logEl.textContent += `ERROR: ${e.message || e}\n`;
  } finally {
    btn.disabled = false;
    setTimeout(() => { $('#progress').classList.remove('show'); $('#progress i').style.width = '0'; }, 600);
  }
});
if (!navigator.bluetooth) {
  $('#printer-status').textContent = 'No Web Bluetooth';
  $('#printer-status').title = 'Use Chrome or Edge (desktop / Android) on localhost or https';
  $('#btn-connect').disabled = true;
}

/* --------------------------------------------------------------------- boot */
(async function boot() {
  // make sure bundled fonts are ready before the first measure/render
  await Promise.all(['400','700'].flatMap((w) => ['normal','italic'].map((st) => document.fonts.load(`${st} ${w} 20px Lora`, 'Aa')))).catch(() => {});
  syncLabelInputs();
  fit();
  const saved = store.get('niimbot.autosave', null);
  try {
    if (saved?.canvas?.objects?.length) await loadProject(saved);
    else throw new Error('fresh');
  } catch {
    await loadProject({ label: { wMM: S.wMM, hMM: S.hMM, dpi: S.dpi }, canvas: { version: fabric.version, objects: [], background: '#ffffff' } });
    ADDERS.text();
    const t = active();
    if (t) { t.set('text', 'Hello!'); t.initDimensions(); canvas.discardActiveObject(); canvas.requestRenderAll(); }
    afterChange(true);
  }
  fit();
  updateUndoButtons();
  window.__studio = { canvas, S, finalCanvas, printer }; // handy for debugging in the console
})();
