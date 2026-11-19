// Fixed scenes for screenshots: ?shot=cover shows the exported cover alone,
// ?shot=editor shows the editor with a sample photo loaded. `photo` picks the
// sample (samples/<photo>.jpg), `caption` and `subtitle` the words, `layout` and
// `grade` the look, and `size` the export size (square, portrait or wide).
// window.__shotReady is set once the scene has painted, so a screenshot taken
// after it is stable.

import { EXPORT_SIZES } from './cover.js';

/** Runs one shot scene, then marks the page ready for a screenshot. */
export async function runShot(shot, query, load) {
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const sizeKey = query.get('size') ?? 'wide';
  const size = EXPORT_SIZES.find((s) => s.key === sizeKey) ?? EXPORT_SIZES[2];
  // Optional per-panel vertical shifts (oy0..oy3) to frame a face in a shot.
  const oy = [0, 1, 2, 3].map((i) => {
    const v = Number(query.get(`oy${i}`));
    return Number.isFinite(v) ? v : 0;
  });
  await load(query.get('photo') ?? 'pier', query.get('caption') ?? 'Sunset Heist', {
    layout: query.get('layout') ?? 'grid4',
    grade: query.get('grade') ?? 'sunset',
    size,
    caption: query.get('caption') ?? 'Sunset Heist',
    subtitle: query.get('subtitle') ?? 'sunset heist',
    oy,
  });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
