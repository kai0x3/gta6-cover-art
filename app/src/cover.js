// Vice Cover Studio — the cover renderer.
//
// drawCover paints one GTA-poster-style cover onto any 2D canvas context at any
// size: a multi-panel photo grid, a Vice City sunset/neon colour grade, grain and
// vignette, a big gradient caption with a neon script subtitle, a badge ribbon
// and a heat meter. The same function draws the live preview and every export,
// so what you see is exactly what the PNG holds.
//
// A panel is { photo, zoom, ox, oy }: which loaded photo fills it, how far it is
// zoomed in, and how far its centre is dragged from the panel centre (fractions
// of the panel's width/height). A state is { layout, grade, caption, subtitle,
// badge, panels, grain, vignette, heat, showBadge }.

export const LAYOUTS = {
  grid4: { name: 'Four Panel', panels: 4, hint: 'The classic poster grid' },
  hero3: { name: 'Hero + Three', panels: 4, hint: 'One big moment, three below' },
  fullbleed: { name: 'Full Bleed', panels: 1, hint: 'One photo, edge to edge' },
  tilt: { name: 'Tilted Snapshots', panels: 3, hint: 'Polaroids tossed on the table' },
  nine: { name: 'Nine Panel', panels: 8, hint: 'A wall of moments, title in the middle' },
  split: { name: 'Split Screen', panels: 3, hint: 'Two worlds side by side' },
};

export const GRADES = {
  sunset: {
    name: 'Sunset',
    top: 'rgba(255, 122, 69, 0.20)', bottom: 'rgba(190, 30, 120, 0.42)',
    title: ['#ffe259', '#ff7e5f', '#e84393'],
    accent: '#ff5e62', glow: '#ff9a3d',
  },
  neon: {
    name: 'Neon Nights',
    top: 'rgba(0, 229, 255, 0.22)', bottom: 'rgba(255, 0, 140, 0.40)',
    title: ['#8afff1', '#00e5ff', '#ff2ea6'],
    accent: '#00e5ff', glow: '#ff2ea6',
  },
  gold: {
    name: 'Vice Gold',
    top: 'rgba(255, 205, 90, 0.24)', bottom: 'rgba(150, 80, 0, 0.45)',
    title: ['#fff6bf', '#ffd166', '#f4842b'],
    accent: '#ffb703', glow: '#ffe259',
  },
  teal: {
    name: 'Palm Teal',
    top: 'rgba(0, 255, 200, 0.20)', bottom: 'rgba(0, 55, 120, 0.46)',
    title: ['#c8fff2', '#4adeff', '#0077b6'],
    accent: '#2ec4b6', glow: '#90e0ef',
  },
  bubblegum: {
    name: 'Bubblegum',
    top: 'rgba(255, 140, 210, 0.22)', bottom: 'rgba(110, 30, 200, 0.44)',
    title: ['#ffe3f6', '#ff8fd3', '#9d4edd'],
    accent: '#ff70c0', glow: '#c77dff',
  },
};

export const EXPORT_SIZES = [
  { label: '1080 × 1080', w: 1080, h: 1080, key: 'square' },
  { label: '1080 × 1350', w: 1080, h: 1350, key: 'portrait' },
  { label: '1920 × 1080', w: 1920, h: 1080, key: 'wide' },
];

/** Panel rectangles for a layout at size W x H. Each is { x, y, w, h, rot }. */
export function layoutPanels(layout, W, H) {
  const g = Math.max(4, Math.round(W * 0.012)); // white gap between panels
  const half = (W - g) / 2;
  const third = (W - g * 2) / 3;
  switch (layout) {
    case 'hero3': {
      const top = Math.round(H * 0.58);
      const bottom = H - top - g;
      return [
        { x: 0, y: 0, w: W, h: top, rot: 0 },
        { x: 0, y: top + g, w: third, h: bottom, rot: 0 },
        { x: third + g, y: top + g, w: third, h: bottom, rot: 0 },
        { x: (third + g) * 2, y: top + g, w: third, h: bottom, rot: 0 },
      ];
    }
    case 'fullbleed':
      return [{ x: 0, y: 0, w: W, h: H, rot: 0 }];
    case 'tilt': {
      const cx = W * 0.5, cy = H * 0.38;
      return [
        { x: cx - W * 0.38, y: cy - H * 0.30, w: W * 0.76, h: H * 0.60, rot: -0.05 },
        { x: W * 0.05, y: H * 0.66, w: W * 0.42, h: H * 0.27, rot: -0.07 },
        { x: W * 0.53, y: H * 0.68, w: W * 0.42, h: H * 0.27, rot: 0.06 },
      ];
    }
    case 'nine': {
      const cell = (W - g * 2) / 3;
      const ch = (H - g * 2) / 3;
      const cells = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === 1 && c === 1) continue; // the middle cell holds the title
          cells.push({ x: c * (cell + g), y: r * (ch + g), w: cell, h: ch, rot: 0 });
        }
      }
      return cells;
    }
    case 'split': {
      const left = Math.round(W * 0.55);
      const right = W - left - g;
      const rh = (H - g) / 2;
      return [
        { x: 0, y: 0, w: left, h: H, rot: 0 },
        { x: left + g, y: 0, w: right, h: rh, rot: 0 },
        { x: left + g, y: rh + g, w: right, h: rh, rot: 0 },
      ];
    }
    case 'grid4':
    default: {
      const rh = (H - g) / 2;
      return [
        { x: 0, y: 0, w: half, h: rh, rot: 0 },
        { x: half + g, y: 0, w: half, h: rh, rot: 0 },
        { x: 0, y: rh + g, w: half, h: rh, rot: 0 },
        { x: half + g, y: rh + g, w: half, h: rh, rot: 0 },
      ];
    }
  }
}

let grainTile = null;

/** A small tile of random grey noise, reused for the grain pass. */
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 180;
  tile.height = 180;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 96);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

/** Draws one photo into one panel, cover-fit, with the panel's zoom and drag. */
function drawPanelPhoto(ctx, rect, image, panel, grade) {
  const { x, y, w, h, rot } = rect;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (rot) ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = '#1b1030';
  ctx.fillRect(0, 0, w, h);
  if (image) {
    const zoom = panel?.zoom ?? 1;
    const base = Math.max(w / image.naturalWidth, h / image.naturalHeight) * zoom;
    const pw = image.naturalWidth * base;
    const ph = image.naturalHeight * base;
    const ox = (panel?.ox ?? 0) * w;
    const oy = (panel?.oy ?? 0) * h;
    ctx.drawImage(image, (w - pw) / 2 + ox, (h - ph) / 2 + oy, pw, ph);
  } else {
    // Empty panel: a diagonal sunset wash so the grid still reads as a poster.
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, '#3b1d5a');
    wash.addColorStop(0.55, '#7a2d6e');
    wash.addColorStop(1, '#ff7e5f');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `bold ${Math.max(14, w * 0.055)}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+ ADD PHOTO', w / 2, h / 2);
  }
  // Colour grade: a warm wash from the top, a deep one from the bottom.
  const tint = ctx.createLinearGradient(0, 0, 0, h);
  tint.addColorStop(0, grade.top);
  tint.addColorStop(1, grade.bottom);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  // A faint dark foot so the caption scrim never fights the photo.
  const foot = ctx.createLinearGradient(0, h * 0.72, 0, h);
  foot.addColorStop(0, 'rgba(10, 4, 24, 0)');
  foot.addColorStop(1, 'rgba(10, 4, 24, 0.28)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // Crisp white frame, like a printed poster grid.
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (rot) ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);
  ctx.lineWidth = Math.max(2, W_GLOBAL * 0.004);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeRect(0, 0, w, h);
  ctx.restore();
}

let W_GLOBAL = 1080;

/** Fits one line of Anton capitals across `maxWidth`, shrinking until it fits. */
function fitCaption(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `${size}px Anton, sans-serif`;
  while (size > 16 && ctx.measureText(text).width > maxWidth) {
    size = Math.floor(size * 0.94);
    ctx.font = `${size}px Anton, sans-serif`;
  }
  return size;
}

/** The title block: gradient caption, neon script subtitle, badge and heat. */
function drawTitleBlock(ctx, W, H, state, grade, layout) {
  const caption = (state.caption || '').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim();
  const bandH = H * (layout === 'nine' ? 0.34 : 0.30);
  const bandY = H - bandH;

  if (layout === 'nine') {
    // The title lives in the middle cell of the nine-panel grid.
    const g = Math.max(4, Math.round(W * 0.012));
    const cell = (W - g * 2) / 3;
    const ch = (H - g * 2) / 3;
    const cx = cell + g + cell / 2;
    const cy = ch + g + ch / 2;
    ctx.save();
    ctx.fillStyle = '#12081f';
    ctx.fillRect(cell + g, ch + g, cell, ch);
    ctx.strokeStyle = grade.accent;
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.strokeRect(cell + g, ch + g, cell, ch);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (caption) {
      const size = fitCaption(ctx, caption, cell * 0.9, cell * 0.20);
      const grad = ctx.createLinearGradient(cx - cell / 2, cy - size, cx + cell / 2, cy + size);
      grade.title.forEach((c, i) => grad.addColorStop(i / (grade.title.length - 1), c));
      ctx.fillStyle = grad;
      ctx.fillText(caption, cx, cy - ch * 0.08);
    }
    if (subtitle) {
      ctx.font = `${Math.max(14, cell * 0.085)}px Pacifico, cursive`;
      ctx.fillStyle = grade.glow;
      ctx.shadowColor = grade.glow;
      ctx.shadowBlur = cell * 0.06;
      ctx.fillText(subtitle, cx, cy + ch * 0.26);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    return;
  }

  // Bottom scrim so the lettering reads on any photo.
  const scrim = ctx.createLinearGradient(0, bandY - H * 0.06, 0, H);
  scrim.addColorStop(0, 'rgba(12, 4, 26, 0)');
  scrim.addColorStop(0.45, 'rgba(12, 4, 26, 0.55)');
  scrim.addColorStop(1, 'rgba(12, 4, 26, 0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, bandY - H * 0.06, W, bandH + H * 0.06);

  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const capY = H - H * 0.15;
  if (caption) {
    const size = fitCaption(ctx, caption, W * 0.94, H * 0.105);
    const grad = ctx.createLinearGradient(0, capY - size, 0, capY + size * 0.15);
    grade.title.forEach((c, i) => grad.addColorStop(i / (grade.title.length - 1), c));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20, 4, 32, 0.9)';
    ctx.lineWidth = size * 0.14;
    ctx.strokeText(caption, cx, capY);
    ctx.fillStyle = grad;
    ctx.shadowColor = grade.glow;
    ctx.shadowBlur = size * 0.18;
    ctx.fillText(caption, cx, capY);
    ctx.restore();
  }
  if (subtitle) {
    const subSize = Math.max(16, H * 0.038);
    ctx.save();
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = grade.glow;
    ctx.shadowBlur = subSize * 0.9;
    ctx.fillText(subtitle, cx, H - H * 0.045);
    ctx.restore();
  }
}

/** A diagonal badge ribbon in the top corner, and a five-flame heat meter. */
function drawBadgeAndHeat(ctx, W, H, state, grade) {
  if (state.showBadge && (state.badge || '').trim()) {
    const text = state.badge.trim().toUpperCase();
    const fs = Math.max(13, W * 0.020);
    ctx.save();
    ctx.font = `${fs}px Anton, sans-serif`;
    const tw = ctx.measureText(text).width;
    const pad = fs * 0.9;
    const bw = tw + pad * 2;
    const bh = fs * 2.1;
    ctx.translate(W * 0.045, H * 0.045);
    ctx.rotate(-0.06);
    ctx.fillStyle = grade.accent;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bw, 0);
    ctx.lineTo(bw + bh * 0.45, bh / 2);
    ctx.lineTo(bw, bh);
    ctx.lineTo(0, bh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#160a24';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bw / 2, bh / 2 + fs * 0.04);
    ctx.restore();
  }
  const heat = Math.max(0, Math.min(5, state.heat ?? 0));
  if (heat > 0) {
    const r = Math.max(7, W * 0.011);
    const gap = r * 2.6;
    const total = gap * 5;
    let x = W - total - W * 0.035;
    const y = H * 0.045 + r;
    ctx.save();
    ctx.font = `${Math.max(11, W * 0.016)}px Anton, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('HEAT', x - r * 1.4, y);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x + r, y, r, 0, Math.PI * 2);
      ctx.fillStyle = i < heat ? grade.accent : 'rgba(255,255,255,0.28)';
      ctx.fill();
      if (i < heat) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = Math.max(1, r * 0.14);
        ctx.stroke();
      }
      x += gap;
    }
    ctx.restore();
  }
}

/**
 * Draws the whole cover. `images` is an array of loaded HTMLImageElements (or
 * nulls) indexed the same way as state.panels' `photo` fields. Pass a 2D context
 * whose canvas is exactly W x H.
 */
export function drawCover(ctx, W, H, state, images) {
  W_GLOBAL = W;
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const layout = state.layout in LAYOUTS ? state.layout : 'grid4';
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12081f';
  ctx.fillRect(0, 0, W, H);

  const rects = layoutPanels(layout, W, H);
  rects.forEach((rect, i) => {
    const panel = state.panels?.[i] ?? { photo: 0, zoom: 1, ox: 0, oy: 0 };
    const image = panel.photo != null ? images?.[panel.photo] ?? null : null;
    drawPanelPhoto(ctx, rect, image, panel, grade);
  });

  drawTitleBlock(ctx, W, H, state, grade, layout);
  drawBadgeAndHeat(ctx, W, H, state, grade);

  if (state.vignette !== false) {
    const vig = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.42,
      W / 2, H / 2, Math.max(W, H) * 0.78,
    );
    vig.addColorStop(0, 'rgba(8, 2, 18, 0)');
    vig.addColorStop(1, 'rgba(8, 2, 18, 0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.grain !== false) {
    const tile = getGrainTile();
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** A fresh default state for a layout: panels spread across the loaded photos. */
export function defaultPanels(layout, photoCount) {
  const count = LAYOUTS[layout]?.panels ?? 4;
  const panels = [];
  for (let i = 0; i < count; i++) {
    panels.push({
      photo: photoCount > 0 ? i % photoCount : 0,
      zoom: 1,
      ox: 0,
      oy: 0,
    });
  }
  return panels;
}

/** The state the app opens with: the strongest default — grid, sunset, sample photos. */
export function defaultState() {
  return {
    layout: 'grid4',
    grade: 'sunset',
    caption: 'VICE CITY',
    subtitle: 'sunset heist',
    badge: 'VICE CITY • 2026',
    panels: defaultPanels('grid4', 2),
    grain: true,
    vignette: true,
    heat: 4,
    showBadge: true,
  };
}
