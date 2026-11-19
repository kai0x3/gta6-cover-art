// Vice Cover Studio — the editor.
//
// Wires the page: photos in (upload or built-in samples), caption and subtitle
// typed, layout and grade picked, panels dragged and zoomed on the live preview,
// undo/redo, and one-click export of all three post sizes as PNGs.
// A `?shot=` query instead sets up a fixed scene for a screenshot (./shots.js).

import { drawCover, defaultState, defaultPanels, LAYOUTS, GRADES, EXPORT_SIZES, layoutPanels } from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const canvas = $('cover');
const ctx = canvas.getContext('2d');
const statusEl = $('status');

let state = defaultState();
let images = []; // HTMLImageElement per uploaded/sample photo, index = panel.photo
let selectedPanel = 0;
let previewSize = EXPORT_SIZES[0];
let undoStack = [];
let redoStack = [];
let dragging = null;

// ---- fonts ---------------------------------------------------------------

const FONTS = [
  { family: 'Anton', url: './fonts/Anton-Regular.ttf', weight: '400' },
  { family: 'Pacifico', url: './fonts/Pacifico-Regular.ttf', weight: '400' },
];

/** Loads the two shipped fonts so the canvas lettering is the real thing. */
async function loadFonts() {
  for (const f of FONTS) {
    try {
      const face = new FontFace(f.family, `url(${f.url})`, { weight: f.weight });
      await face.load();
      document.fonts.add(face);
    } catch {
      // Fallback fonts still draw; the cover just loses its display type.
    }
  }
  try {
    await Promise.all([
      document.fonts.load('16px Anton'),
      document.fonts.load('16px Pacifico'),
    ]);
  } catch { /* ignore */ }
}

// ---- state ---------------------------------------------------------------

function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  syncUndoButtons();
}

function restore(next) {
  state = next;
  syncControls();
  redraw();
}

function syncUndoButtons() {
  $('undo').disabled = undoStack.length === 0;
  $('redo').disabled = redoStack.length === 0;
}

function setState(mutator, record = true) {
  if (record) pushHistory();
  mutator(state);
  syncControls();
  redraw();
}

// ---- photos --------------------------------------------------------------

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Adds loaded images as new photos and spreads them across the panels. */
async function addPhotos(files) {
  const loaded = [];
  for (const file of files) {
    try {
      const img = await loadImage(URL.createObjectURL(file));
      loaded.push(img);
    } catch {
      setStatus(`Could not read ${file.name || 'a photo'} — try a JPG or PNG.`);
    }
  }
  if (!loaded.length) return;
  pushHistory();
  const firstIndex = images.length;
  images = images.concat(loaded);
  state.panels.forEach((p, i) => {
    if (images.length > 1) p.photo = (firstIndex + i) % images.length;
  });
  renderPhotoList();
  syncControls();
  redraw();
  setStatus(`${loaded.length} photo${loaded.length > 1 ? 's' : ''} added — drag a panel to reposition it.`);
}

async function loadSample(name) {
  try {
    const img = await loadImage(`./samples/${name}.jpg`);
    pushHistory();
    images.push(img);
    state.panels.forEach((p, i) => { p.photo = (images.length - 1 + i) % images.length; });
    renderPhotoList();
    syncControls();
    redraw();
    setStatus(`Sample photo “${name}” loaded.`);
  } catch {
    setStatus('The sample photo could not be loaded.');
  }
}

function renderPhotoList() {
  const list = $('photo-list');
  list.innerHTML = '';
  images.forEach((img, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'photo-chip';
    chip.textContent = `Photo ${i + 1}`;
    chip.title = `Use photo ${i + 1} in the selected panel`;
    chip.addEventListener('click', () => {
      pushHistory();
      state.panels[selectedPanel].photo = i;
      redraw();
    });
    list.appendChild(chip);
  });
  $('photo-count').textContent = images.length
    ? `${images.length} photo${images.length > 1 ? 's' : ''} loaded`
    : 'No photos yet — add one, or try a sample below.';
}

// ---- drawing --------------------------------------------------------------

function redraw() {
  canvas.width = previewSize.w;
  canvas.height = previewSize.h;
  drawCover(ctx, previewSize.w, previewSize.h, state, images);
  // The cover-only shot scene shows the exported cover, not the editor chrome.
  if (!document.body.classList.contains('shot-cover')) highlightSelectedPanel();
}

/** Outlines the selected panel on the preview so the drag target is visible. */
function highlightSelectedPanel() {
  const rects = layoutPanels(state.layout, previewSize.w, previewSize.h);
  const rect = rects[selectedPanel];
  if (!rect) return;
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  if (rect.rot) ctx.rotate(rect.rot);
  ctx.translate(-rect.w / 2, -rect.h / 2);
  ctx.setLineDash([Math.max(6, previewSize.w * 0.012), Math.max(6, previewSize.w * 0.012)]);
  ctx.lineWidth = Math.max(3, previewSize.w * 0.005);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(4, 4, rect.w - 8, rect.h - 8);
  ctx.restore();
}

/** Which panel (if any) sits under preview coordinates (x, y). */
function panelAt(x, y) {
  const rects = layoutPanels(state.layout, previewSize.w, previewSize.h);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

function canvasPoint(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * previewSize.w,
    y: ((event.clientY - box.top) / box.height) * previewSize.h,
  };
}

canvas.addEventListener('pointerdown', (event) => {
  const p = canvasPoint(event);
  const hit = panelAt(p.x, p.y);
  if (hit < 0) return;
  selectedPanel = hit;
  dragging = { x: p.x, y: p.y, moved: false };
  canvas.setPointerCapture(event.pointerId);
  redraw();
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const p = canvasPoint(event);
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  const rects = layoutPanels(state.layout, previewSize.w, previewSize.h);
  const rect = rects[selectedPanel];
  const dx = (p.x - dragging.x) / rect.w;
  const dy = (p.y - dragging.y) / rect.h;
  if (Math.abs(dx) + Math.abs(dy) > 0.001) dragging.moved = true;
  panel.ox = Math.max(-0.6, Math.min(0.6, panel.ox + dx));
  panel.oy = Math.max(-0.6, Math.min(0.6, panel.oy + dy));
  dragging.x = p.x;
  dragging.y = p.y;
  redraw();
});

canvas.addEventListener('pointerup', () => {
  if (dragging?.moved) pushHistory();
  dragging = null;
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  pushHistory();
  const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
  panel.zoom = Math.max(1, Math.min(4, panel.zoom * factor));
  redraw();
}, { passive: false });

// ---- controls ------------------------------------------------------------

function buildPickers() {
  const layoutBox = $('layout-picker');
  Object.entries(LAYOUTS).forEach(([key, layout]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.layout = key;
    b.textContent = layout.name;
    b.title = layout.hint;
    b.addEventListener('click', () => {
      if (state.layout === key) return;
      pushHistory();
      state.layout = key;
      state.panels = defaultPanels(key, images.length);
      selectedPanel = 0;
      syncControls();
      redraw();
    });
    layoutBox.appendChild(b);
  });

  const gradeBox = $('grade-picker');
  Object.entries(GRADES).forEach(([key, grade]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick grade-pick';
    b.dataset.grade = key;
    b.style.setProperty('--swatch', grade.accent);
    b.textContent = grade.name;
    b.addEventListener('click', () => {
      if (state.grade === key) return;
      pushHistory();
      state.grade = key;
      syncControls();
      redraw();
    });
    gradeBox.appendChild(b);
  });

  const sizeBox = $('size-picker');
  EXPORT_SIZES.forEach((size) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.size = size.key;
    b.textContent = size.label;
    b.addEventListener('click', () => {
      previewSize = size;
      syncControls();
      redraw();
    });
    sizeBox.appendChild(b);
  });
}

function syncControls() {
  document.querySelectorAll('[data-layout]').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('[data-grade]').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === previewSize.key);
  });
  $('caption').value = state.caption;
  $('subtitle').value = state.subtitle;
  $('badge').value = state.badge;
  $('grain').checked = state.grain !== false;
  $('vignette').checked = state.vignette !== false;
  $('show-badge').checked = state.showBadge !== false;
  $('heat').value = state.heat ?? 0;
  $('heat-value').textContent = `${state.heat ?? 0} / 5`;
  $('zoom').value = state.panels[selectedPanel]?.zoom ?? 1;
  $('zoom-value').textContent = `${(state.panels[selectedPanel]?.zoom ?? 1).toFixed(1)}×`;
  syncUndoButtons();
}

function setStatus(text) {
  statusEl.textContent = text;
}

// ---- export --------------------------------------------------------------

/** Renders the cover at W x H and downloads it as a PNG. */
function exportPng(size) {
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  drawCover(off.getContext('2d'), size.w, size.h, state, images);
  off.toBlob((blob) => {
    if (!blob) { setStatus('Export failed — try again.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-cover-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

$('export-all').addEventListener('click', () => {
  EXPORT_SIZES.forEach((size, i) => setTimeout(() => exportPng(size), i * 250));
  setStatus('Exporting all three sizes — 1080×1080, 1080×1350, 1920×1080.');
});

$('export-one').addEventListener('click', () => {
  exportPng(previewSize);
  setStatus(`Exported ${previewSize.label} PNG.`);
});

// ---- wiring --------------------------------------------------------------

$('photo').addEventListener('change', (e) => {
  addPhotos(Array.from(e.target.files ?? []));
  e.target.value = '';
});
$('sample-boulevard').addEventListener('click', () => loadSample('boulevard'));
$('sample-pier').addEventListener('click', () => loadSample('pier'));
$('caption').addEventListener('input', (e) => { state.caption = e.target.value; redraw(); });
$('caption').addEventListener('change', () => pushHistory());
$('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
$('subtitle').addEventListener('change', () => pushHistory());
$('badge').addEventListener('input', (e) => { state.badge = e.target.value; redraw(); });
$('badge').addEventListener('change', () => pushHistory());
$('grain').addEventListener('change', (e) => setState((s) => { s.grain = e.target.checked; }));
$('vignette').addEventListener('change', (e) => setState((s) => { s.vignette = e.target.checked; }));
$('show-badge').addEventListener('change', (e) => setState((s) => { s.showBadge = e.target.checked; }));
$('heat').addEventListener('input', (e) => { state.heat = Number(e.target.value); syncControls(); redraw(); });
$('heat').addEventListener('change', () => pushHistory());
$('zoom').addEventListener('input', (e) => {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  panel.zoom = Number(e.target.value);
  syncControls();
  redraw();
});
$('zoom').addEventListener('change', () => pushHistory());
$('reset-panel').addEventListener('click', () => {
  const panel = state.panels[selectedPanel];
  if (!panel) return;
  pushHistory();
  panel.zoom = 1; panel.ox = 0; panel.oy = 0;
  syncControls();
  redraw();
});
$('undo').addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
});
$('redo').addEventListener('click', () => {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    $('undo').click();
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault();
    $('redo').click();
  }
});

// ---- boot ----------------------------------------------------------------

buildPickers();
syncControls();

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  await loadFonts();
  runShot(shot, params, async (sample, text, opts) => {
    if (opts?.layout) state.layout = opts.layout;
    if (opts?.grade) state.grade = opts.grade;
    if (opts?.size) previewSize = opts.size;
    state.panels = defaultPanels(state.layout, 2);
    if (opts?.caption !== undefined) state.caption = opts.caption;
    if (opts?.subtitle !== undefined) state.subtitle = opts.subtitle;
    images = [await loadImage(`./samples/${sample}.jpg`)];
    const second = sample === 'pier' ? 'boulevard' : 'pier';
    try { images.push(await loadImage(`./samples/${second}.jpg`)); } catch { /* one photo is enough */ }
    state.panels.forEach((p, i) => { p.photo = i % images.length; });
    (opts.oy ?? []).forEach((v, i) => { if (state.panels[i]) state.panels[i].oy = v; });
    renderPhotoList();
    syncControls();
    redraw();
  });
} else {
  await loadFonts();
  // Open on the two built-in sample photos so the app looks great immediately.
  try {
    images = [await loadImage('./samples/pier.jpg'), await loadImage('./samples/boulevard.jpg')];
    renderPhotoList();
  } catch { /* samples are a bonus, not a requirement */ }
  redraw();
}
