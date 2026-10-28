// Liquid glass refraction for small glass shapes (pills, buttons, segmented controls), after eigendexplore's
// js/glass.js. Chromium can run an SVG filter inside backdrop-filter, so there the backdrop is bent at the rounded
// edge: a displacement map built from the signed distance to the rounded rect, strongest at the rim and falling off
// as (1 - t)^2 over a bevel, flat (clear) in the middle. Safari and Firefox keep the CSS frost and rim from
// liquid-glass.css, which already reads as glass.
const CHROMIUM = !!window.chrome && /Chrome\/\d+/.test(navigator.userAgent);
const NS = 'http://www.w3.org/2000/svg';
const made = new Map();
let defs = null, n = 0;

function ensureDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  defs = svg; document.body.prepend(svg);
  return defs;
}

// displacement map at reduced resolution (feImage stretches it): R/G = 128 -/+ the outward normal times the falloff
function mapURL(w, h, r, bevel) {
  const s = Math.min(1, 220 / Math.max(w, h));
  const W = Math.max(8, Math.round(w * s)), H = Math.max(8, Math.round(h * s));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
  const hx = w / 2, hy = h / 2, rr = Math.min(r, hx, hy);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const px = (i + .5) / W * w - hx, py = (j + .5) / H * h - hy;
      const qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
      let dist, nx, ny;
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; dist = rr - l; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
      else if (qx > qy) { dist = rr - qx; nx = Math.sign(px); ny = 0; }
      else { dist = rr - qy; nx = 0; ny = Math.sign(py); }
      const t = Math.min(1, Math.max(0, dist / bevel)), k = (1 - t) * (1 - t);
      const o = (j * W + i) * 4;                 // sample inward near the rim: the edge magnifies like a convex lens
      d[o] = 128 - nx * k * 127; d[o + 1] = 128 - ny * k * 127; d[o + 2] = 128; d[o + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c.toDataURL();
}

function filterFor(w, h, r) {
  const key = `${w}x${h}x${r}`;
  if (made.has(key)) return made.get(key);
  const id = `lg${n++}`;
  const bevel = Math.max(6, Math.min(18, Math.min(w, h) * .42));
  const scale = Math.max(6, Math.min(26, Math.min(w, h) * .55));
  const f = document.createElementNS(NS, 'filter');
  for (const [k, v] of Object.entries({ id, x: 0, y: 0, width: w, height: h, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
  const im = document.createElementNS(NS, 'feImage');
  for (const [k, v] of Object.entries({ href: mapURL(w, h, r, bevel), x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'm' })) im.setAttribute(k, v);
  const dm = document.createElementNS(NS, 'feDisplacementMap');
  for (const [k, v] of Object.entries({ in: 'SourceGraphic', in2: 'm', scale: scale.toFixed(1), xChannelSelector: 'R', yChannelSelector: 'G' })) dm.setAttribute(k, v);
  f.append(im, dm); ensureDefs().append(f);
  made.set(key, id);
  return id;
}

const near = new Set(), queue = new Set();
let raf = 0;
function apply(el) {
  if (!near.has(el)) return;
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  // big panels keep the plain frost: the map is a pixel loop + PNG encode, and a large displaced backdrop is costly
  if (w < 8 || h < 8 || w * h > 900 * 140) { el.style.removeProperty('backdrop-filter'); return; }
  const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
  const blur = el.dataset.lgBlur || (h < 60 ? 3 : 6);
  el.style.backdropFilter = `url(#${filterFor(w, h, Math.round(r))}) blur(${blur}px) saturate(175%) brightness(1.03)`;
}
const later = el => { queue.add(el); if (!raf) raf = requestAnimationFrame(() => { raf = 0; queue.forEach(apply); queue.clear(); }); };
const idle = cb => (window.requestIdleCallback ? requestIdleCallback(cb, { timeout: 800 }) : setTimeout(cb, 50));
const ro = CHROMIUM ? new ResizeObserver(es => es.forEach(e => later(e.target))) : null;
const io = CHROMIUM ? new IntersectionObserver(es => {
  for (const e of es) {
    if (!e.isIntersecting) { near.delete(e.target); continue; }
    near.add(e.target);
    const b = e.boundingClientRect;
    if (b.bottom > 0 && b.top < innerHeight) later(e.target); else idle(() => apply(e.target));   // on screen: now
  }
}, { rootMargin: '200% 0px' }) : null;

// opt in with class="lg" on any .glass / .glass-tag element
export function glassify(root = document) {
  if (!ro) return;
  root.querySelectorAll('.lg').forEach(el => { if (!el.dataset.lgOn) { el.dataset.lgOn = 1; ro.observe(el); io.observe(el); } });
}

// segmented control: slide the thumb under the pressed button
export function initSeg(seg, onPick) {
  const thumb = seg.querySelector('.seg-thumb'), btns = [...seg.querySelectorAll('button')];
  const place = () => { const b = btns.find(x => x.getAttribute('aria-pressed') === 'true') || btns[0];
    thumb.style.width = `${b.offsetWidth}px`; thumb.style.transform = `translateX(${b.offsetLeft}px)`; };
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.setAttribute('aria-pressed', x === b)); place(); onPick?.(b);
  }));
  new ResizeObserver(place).observe(seg);
  place();
}
