// Stage 4 toy: one contact anchor c_f, one robot pad, and the contact cost the solver minimizes.
// E_contact is the paper's contact term for one anchor without anti-slip (rho_f = w_c = 1, the alpha correspondence term
// omitted): reach ||s* - c_f||^2 plus friction cone lambda r^2 (1 - n(s*) . d_f), lambda = 2, r = 10 mm, in mm^2.
// The pad is the flat palmar face (the tactile skin) of a fingertip's distal link; s* is its closest point to c_f and
// n(s*) its outward normal. The pose (x, y, theta) is the middle of the pad face and the link's rotation; the link and
// the middle link behind the joint may touch the surface but not sink into it.
// Behind the scene: E_contact over (x, y) at the current theta. Below it: E_contact over theta at the current (x, y).
// "Run CEM" animates the annealed sampler on this 3-DoF problem with the solver's schedule.

const MM = 7, HALF = 44, RAD = 26;                 // px per mm; half-length of the pad face and link radius, px
const CONE = 2 * 10 * 10;                           // lambda r^2, mm^2
const TH = 90;                                      // rotation range either way, degrees
const TOP = 230, BOT = 56, CELL = 4;                // air above and object below the surface; field grid step, px
const LEVELS = [25, 100, 400];                      // iso-cost contours, mm^2
const FADE = 30, AMAX = .52;                        // the field fades out at a (30 mm)^2 cost
const GREEN = [47, 158, 110];
const BAR = 400;                                    // scale of the stacked bar and the theta curve, mm^2
const K = 16, N = 128, NE = Math.round(N * .05), BETA = .2 ** (1 / K);
const SIG0 = [5 * MM, 3 * MM, 12];                  // initial noise: x, y (px) and theta (deg)
const TAXELS = Array.from({ length: 11 }, (_, i) => -40 + 8 * i);
const NS = 'http://www.w3.org/2000/svg';

const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// the middle link behind the joint, where it fades out (pad frame: origin mid-face, v along the palmar normal)
const LINK = [[80, -18], [80, 18]].map(([u, v]) => {
  const a = rad(-38);
  return [50 + u * Math.cos(a) - v * Math.sin(a), -32 + u * Math.sin(a) + v * Math.cos(a)];
});

// how far the middle of the pad face has to stay above the surface at rotation th, px
function lift(th) {
  const c = Math.cos(rad(th)), s = Math.sin(rad(th));
  let low = HALF * Math.abs(s) + RAD * (1 - c);
  for (const [u, v] of LINK) low = Math.max(low, u * s + v * c);
  return low;
}

// the anchor sits at the origin and the surface is y = 0 (y points down, into the object, along d_f)
function terms(x, y, th) {
  const c = Math.cos(rad(th)), s = Math.sin(rad(th));
  const u = -c * x - s * y, v = s * x - c * y;     // the anchor in the pad frame; v > 0 is the palmar side
  const su = clamp(u, -HALF, HALF);
  const gap = Math.hypot(u - su, v) / MM;
  return { su, gap, reach: gap * gap, cone: CONE * (1 - c) };
}
const econ = (x, y, th) => { const t = terms(x, y, th); return t.reach + t.cone; };

function rng32(a) {                                 // mulberry32: the sampler is seeded, so a run is repeatable
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const TEMPLATE = `
<div class="adx-card">
  <div class="adx-scene">
    <canvas class="adx-field" aria-hidden="true"></canvas>
    <svg class="adx-svg" role="group" aria-label="A robot finger pad above contact anchor c_f on an object surface, over a map of the contact cost">
      <defs>
        <linearGradient id="adx-obj" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d7d2"/><stop offset="1" stop-color="#cdcac3"/></linearGradient>
        <linearGradient id="adx-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f8fa"/><stop offset=".55" stop-color="#dde1e6"/><stop offset="1" stop-color="#bcc3cc"/></linearGradient>
        <linearGradient id="adx-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a6270"/><stop offset="1" stop-color="#343a44"/></linearGradient>
        <linearGradient id="adx-link" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e3e7eb"/><stop offset=".55" stop-color="#e3e7eb"/><stop offset="1" stop-color="#e3e7eb" stop-opacity="0"/></linearGradient>
        <linearGradient id="adx-links" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d98a6"/><stop offset=".55" stop-color="#8d98a6"/><stop offset="1" stop-color="#8d98a6" stop-opacity="0"/></linearGradient>
        <radialGradient id="adx-hub" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#c3cad3"/></radialGradient>
        <pattern id="adx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#efede8"/><path d="M0 0V6" stroke="#cbc7be" stroke-width="1.5"/></pattern>
        <marker id="adx-ao" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e8731f"/></marker>
        <marker id="adx-at" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#0e8fa3"/></marker>
      </defs>
      <rect x="-2000" y="0" width="4000" height="${BOT}" fill="url(#adx-obj)"/>
      <path d="M-2000 0H2000" stroke="#b3afa7" stroke-width="1.5"/>
      <rect class="adx-band" x="-2000" width="4000" fill="url(#adx-hatch)"/>
      <path class="adx-band-edge" fill="none" stroke="#b9b5ac" stroke-width="1"/>
      <text class="adx-band-l">collision</text>
      <g class="adx-lev"></g>
      <path class="adx-basin" fill="none" stroke="#1f7a53" stroke-width="4" stroke-linecap="round"/>
      <text class="adx-min" text-anchor="end"></text>
      <path d="M-62 -62L0 0L62 -62" fill="none" stroke="#e8731f" stroke-opacity=".55" stroke-width="1.3" stroke-dasharray="3 4"/>
      <line x1="0" y1="0" x2="0" y2="44" stroke="#e8731f" stroke-width="2.5" marker-end="url(#adx-ao)"/>
      <text class="adx-sym adx-o" x="-11" y="20" text-anchor="end">c<tspan class="adx-sub" dy="4">f</tspan></text>
      <g class="adx-o"><text class="adx-sym" x="-28" y="49">d<tspan class="adx-sub" dy="4">f</tspan></text><path class="adx-hat" d="M-24.7 35.6L-21.5 33L-18.3 35.6"/></g>
      <rect class="adx-ghost" x="-70" y="-52" width="140" height="52" rx="26"/>
      <g class="adx-pad" tabindex="0" role="slider" aria-roledescription="draggable pad" aria-label="Pad position. Arrow keys move it, Q and E turn it.">
        <rect class="adx-ring" x="-76" y="-58" width="152" height="64" rx="32"/>
        <rect transform="translate(50 -32) rotate(-38)" x="-6" y="-18" width="98" height="36" rx="14" fill="url(#adx-link)" stroke="url(#adx-links)" stroke-width="1.5"/>
        <rect x="-70" y="-52" width="140" height="52" rx="26" fill="url(#adx-shell)" stroke="#8d98a6" stroke-width="1.5"/>
        <rect x="-58" y="-47" width="86" height="11" rx="5.5" fill="#cfd5dc" stroke="rgba(60,70,85,.14)"/>
        <circle cx="-48" cy="-41.5" r="1.6" fill="#99a2ad"/><circle cx="18" cy="-41.5" r="1.6" fill="#99a2ad"/>
        <path d="M-44 0V-7a3 3 0 0 1 3-3H41a3 3 0 0 1 3 3V0Z" fill="url(#adx-skin)"/>
        <g class="adx-tax"></g>
        <circle cx="50" cy="-32" r="12" fill="url(#adx-hub)" stroke="#8d98a6" stroke-width="1.5"/><circle cx="50" cy="-32" r="4.5" fill="#8d98a6"/>
        <circle cx="0" cy="0" r="3.2" fill="#fff" stroke="#1d1d1f" stroke-width="1.3"/>
      </g>
      <g class="adx-trail"><ellipse class="adx-sig" fill="none" stroke="#1d1d1f" stroke-opacity=".38" stroke-dasharray="4 4"/><path class="adx-path" fill="none" stroke="#1d1d1f" stroke-opacity=".5" stroke-width="1.2"/><g class="adx-means"></g></g>
      <line class="adx-gap" stroke="#1d1d1f" stroke-width="1.4" stroke-dasharray="3 3"/>
      <line class="adx-n" stroke="#0e8fa3" stroke-width="2.5" marker-end="url(#adx-at)"/>
      <g class="adx-t adx-n-l"><text class="adx-sym" text-anchor="middle">n</text><path class="adx-hat" d="M-2.2 -12.4L1 -15L4.2 -12.4"/></g>
      <circle class="adx-s" r="4" fill="#1d1d1f" stroke="#fff" stroke-width="1.2"/>
      <text class="adx-sym adx-s-l" text-anchor="middle">s*</text>
      <circle cx="0" cy="0" r="6" fill="#e8731f" stroke="#fff" stroke-width="2"/>
      <g class="adx-cands"></g>
    </svg>
    <p class="adx-hint" aria-hidden="true">Drag the pad · drag the curve below to turn it</p>
    <div class="adx-key" aria-hidden="true">
      <span class="adx-key-t"><i>E</i><sub>contact</sub> by pad position, mm²</span>
      <span class="adx-key-bar">${LEVELS.map(l => `<i style="left:${(Math.sqrt(l) / FADE * 100).toFixed(1)}%"></i>`).join('')}</span>
      <span class="adx-key-n"><b style="left:0">0</b>${LEVELS.map(l => `<b style="left:${(Math.sqrt(l) / FADE * 100).toFixed(1)}%">${l}</b>`).join('')}</span>
    </div>
    <p class="adx-iter" aria-hidden="true"></p>
  </div>
  <div class="adx-theta" tabindex="0" role="slider" aria-label="Pad rotation" aria-valuemin="${-TH}" aria-valuemax="${TH}">
    <svg aria-hidden="true">
      <rect class="adx-zone"/>
      <g class="adx-grid"></g>
      <rect class="adx-band-t"/>
      <path class="adx-ar" fill="rgba(232,115,31,.30)"/>
      <path class="adx-ac" fill="rgba(14,143,163,.30)"/>
      <path class="adx-at" fill="none" stroke="#1d1d1f" stroke-width="1.6" stroke-linejoin="round"/>
      <g class="adx-rug"></g>
      <line class="adx-mk" stroke="#1d1d1f" stroke-opacity=".45"/>
      <circle class="adx-md" r="3.6" fill="#1d1d1f"/>
      <circle class="adx-thumb" r="7" fill="#fff" stroke="#1d1d1f" stroke-width="1.5"/>
    </svg>
  </div>
  <div class="adx-read">
    <div class="adx-total"><span class="adx-k"><i>E</i><sub>contact</sub></span><span class="adx-v num"></span><span class="adx-u">mm²</span></div>
    <div class="adx-terms">
      <div class="adx-barrow" aria-hidden="true"><div class="adx-bar"><i class="adx-br"></i><i class="adx-bc"></i></div><span class="adx-bar-max num">${BAR}</span></div>
      <div class="adx-leg">
        <span class="adx-lr">reach ‖<i>s</i>*−<i>c</i><sub>f</sub>‖² <b class="num"></b></span>
        <span class="adx-lc">cone <i>λr</i>²(1−<i class="adx-h">n</i>·<i class="adx-h">d</i><sub>f</sub>) <b class="num"></b></span>
      </div>
    </div>
    <button type="button" class="adx-run"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z"/></svg><span>Run CEM</span></button>
  </div>
  <div class="adx-foot">
    <span class="adx-chip adx-c1"></span><span class="adx-chip adx-c2"></span>
    <span class="adx-note">${N} samples × ${K} iterations here; CARD samples 1024 full-hand poses.</span>
  </div>
  <p class="sr adx-live" aria-live="polite"></p>
</div>`;

export function initAnchorDemo(root) {
  if (!root) return;
  root.innerHTML = TEMPLATE;
  const q = s => root.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = q('.adx-scene'), svg = q('.adx-svg'), canvas = q('.adx-field'), ctx = canvas.getContext('2d');
  const pad = q('.adx-pad'), theta = q('.adx-theta'), tsvg = q('.adx-theta svg'), runBtn = q('.adx-run');
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent?.appendChild(e); return e;
  };
  const lit = TAXELS.map(u => {
    el('circle', { cx: u, cy: -5, r: 1.6, fill: 'rgba(255,255,255,.24)' }, q('.adx-tax'));
    return el('circle', { cx: u, cy: -5, r: 2.6, fill: '#ff9d4d', opacity: 0 }, q('.adx-tax'));
  });

  let W = 640, dpr = 1;                             // viewBox width follows the card so text stays legible on phones
  const st = { x: 80, y: -70, th: 30 };             // y is where the reader put the pad; collision may hold it higher
  const pose = () => ({ x: st.x, y: Math.min(st.y, -lift(st.th)), th: st.th });
  const bounds = () => { st.x = clamp(st.x, -W / 2 + 34, W / 2 - 34); st.y = clamp(st.y, -TOP + 66, 0); st.th = clamp(st.th, -TH, TH); };

  // ------------------------------------------------------------ cost field over (x, y) at one rotation
  const off = document.createElement('canvas'), offx = off.getContext('2d');
  let img = null, fieldKey = '';
  function drawField(th) {
    const cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(TOP / CELL) + 1, x0 = -W / 2;
    if (off.width !== cols || off.height !== rows || !img) { off.width = cols; off.height = rows; img = offx.createImageData(cols, rows); }
    const c = Math.cos(rad(th)), s = Math.sin(rad(th)), cone = CONE * (1 - c), E = new Float32Array(cols * rows), d = img.data;
    for (let j = 0, k = 0; j < rows; j++) {
      const y = -TOP + j * CELL;
      for (let i = 0; i < cols; i++, k++) {
        const x = x0 + i * CELL, u = -c * x - s * y, v = s * x - c * y, du = u - clamp(u, -HALF, HALF);
        const e = (du * du + v * v) / (MM * MM) + cone, t = Math.min(1, Math.sqrt(e) / FADE);
        E[k] = e; d[4 * k] = GREEN[0]; d[4 * k + 1] = GREEN[1]; d[4 * k + 2] = GREEN[2];
        d[4 * k + 3] = 255 * AMAX * (1 - t) ** 1.7;
      }
    }
    offx.putImageData(img, 0, 0);
    const k = canvas.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, W / 2 * k, TOP * k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, x0 - CELL / 2, -TOP - CELL / 2, cols * CELL, rows * CELL);
    // iso-cost contours, marching squares on the grid nodes
    ctx.beginPath();
    const SEG = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[3, 0], [2, 1]], [[0, 2]], [[3, 0]], [[3, 0]], [[0, 2]], [[0, 1], [3, 2]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];
    for (const L of LEVELS) {
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = E[j * cols + i], b = E[j * cols + i + 1], cc = E[(j + 1) * cols + i + 1], dd = E[(j + 1) * cols + i];
        const id = (a > L) << 3 | (b > L) << 2 | (cc > L) << 1 | (dd > L);
        if (id === 0 || id === 15) continue;
        const X = x0 + i * CELL, Y = -TOP + j * CELL;
        const P = e => e === 0 ? [X + (L - a) / (b - a) * CELL, Y] : e === 1 ? [X + CELL, Y + (L - b) / (cc - b) * CELL]
          : e === 2 ? [X + (L - dd) / (cc - dd) * CELL, Y + CELL] : [X, Y + (L - a) / (dd - a) * CELL];
        for (const [e1, e2] of SEG[id]) { const p1 = P(e1), p2 = P(e2); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); }
      }
    }
    ctx.strokeStyle = 'rgba(29,29,31,.30)'; ctx.lineWidth = dpr / k; ctx.lineCap = 'round'; ctx.stroke();

    // collision band, the basin floor along its edge, contour labels above the basin
    const h = lift(th), yb = -h;
    q('.adx-band').setAttribute('y', yb); q('.adx-band').setAttribute('height', h);
    q('.adx-band-edge').setAttribute('d', h > .5 ? `M-2000 ${yb}H2000` : '');
    const bl = q('.adx-band-l'); bl.setAttribute('x', -W / 2 + 12); bl.setAttribute('y', yb + h / 2 + 4); bl.style.opacity = h >= 15 ? 1 : 0;
    let emin = Infinity;
    const along = [];
    for (let x = Math.ceil(-W / 2); x <= W / 2; x++) { const e = econ(x, yb, th); along.push([x, e]); emin = Math.min(emin, e); }
    const tol = Math.max(.5, emin * .02), near = along.filter(([, e]) => e <= emin + tol);
    const xa = near[0][0], xb = near[near.length - 1][0];
    const basinX = (xa + xb) / 2;
    q('.adx-basin').setAttribute('d', `M${xa} ${yb - 1}H${xb === xa ? xa + .01 : xb}`);
    const ml = q('.adx-min'); ml.setAttribute('x', xa - 9); ml.setAttribute('y', yb + 3); ml.textContent = `min ${fmt(emin)}`;
    const lev = q('.adx-lev'); lev.textContent = '';
    for (const L of LEVELS) {
      if (L <= emin + 1) continue;
      let y = yb;
      while (y > -TOP + 10 && econ(basinX, y, th) < L) y -= 1;
      if (y > -TOP + 10 && y < yb - 14) el('text', { x: basinX, y: y + 4, 'text-anchor': 'middle' }, lev).textContent = L;
    }
    fieldKey = `${W}|${th.toFixed(2)}`;
  }

  // ------------------------------------------------------------ cost over rotation at the current position
  const T = { w: 600, h: 96, ml: 36, mr: 14, mt: 10, y0: 66 };
  const tx = th => T.ml + (th + TH) / (2 * TH) * (T.w - T.ml - T.mr);
  const ty = e => T.y0 - Math.min(e, BAR) / BAR * (T.y0 - T.mt);
  function layoutTheta() {
    T.w = Math.max(280, theta.clientWidth || 600);
    tsvg.setAttribute('viewBox', `0 0 ${T.w} ${T.h}`); tsvg.setAttribute('height', T.h);
    const g = q('.adx-grid'); g.textContent = '';
    for (const e of [0, 200, 400]) {
      el('line', { x1: T.ml, x2: T.w - T.mr, y1: ty(e), y2: ty(e), class: e ? 'adx-gl' : 'adx-axis' }, g);
      el('text', { x: T.ml - 7, y: ty(e) + 4, 'text-anchor': 'end' }, g).textContent = e;
    }
    for (const a of [-90, -45, 0, 45, 90]) {
      if (Math.abs(a) === 45) el('line', { x1: tx(a), x2: tx(a), y1: T.mt, y2: T.y0, class: 'adx-c45' }, g);
      el('text', { x: tx(a), y: T.y0 + 24, 'text-anchor': 'middle' }, g).textContent = a ? `${a < 0 ? '−' : ''}${Math.abs(a)}°` : 'θ = 0°';
    }
    el('text', { x: tx(-45) + 6, y: T.mt + 12, class: 'adx-zl' }, g).textContent = 'in cone';
    const z = q('.adx-zone');
    z.setAttribute('x', tx(-45)); z.setAttribute('width', tx(45) - tx(-45)); z.setAttribute('y', T.mt); z.setAttribute('height', T.y0 - T.mt);
  }
  function drawTheta(p) {
    let up = '', lo = '', top = '';
    const pts = [];
    for (let a = -TH; a <= TH; a += 1) {
      const t = terms(p.x, Math.min(st.y, -lift(a)), a);
      pts.push([tx(a), ty(t.reach), ty(t.reach + t.cone)]);
    }
    pts.forEach(([x, r, c], i) => { up += `${i ? 'L' : 'M'}${x.toFixed(1)} ${r.toFixed(1)}`; top += `${i ? 'L' : 'M'}${x.toFixed(1)} ${c.toFixed(1)}`; });
    for (let i = pts.length - 1; i >= 0; i--) lo += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
    q('.adx-ar').setAttribute('d', `${up}L${tx(TH)} ${T.y0}L${tx(-TH)} ${T.y0}Z`);
    q('.adx-ac').setAttribute('d', `${top}${lo}Z`);
    q('.adx-at').setAttribute('d', top);
    const t = terms(p.x, p.y, p.th), x = tx(p.th), y = ty(t.reach + t.cone);
    const mk = q('.adx-mk'); mk.setAttribute('x1', x); mk.setAttribute('x2', x); mk.setAttribute('y1', T.y0); mk.setAttribute('y2', y);
    q('.adx-md').setAttribute('cx', x); q('.adx-md').setAttribute('cy', y);
    q('.adx-thumb').setAttribute('cx', x); q('.adx-thumb').setAttribute('cy', T.y0);
  }

  // ------------------------------------------------------------ scene, readout
  const fmt = e => e < 9.95 ? e.toFixed(1) : Math.round(e).toString();
  let last = null;
  function render() {
    frame = 0;
    const p = pose(), c = Math.cos(rad(p.th)), s = Math.sin(rad(p.th)), t = terms(p.x, p.y, p.th);
    if (fieldKey !== `${W}|${p.th.toFixed(2)}`) drawField(p.th);
    pad.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.th.toFixed(2)})`);
    const sx = p.x + c * t.su, sy = p.y + s * t.su, set = (sel, a) => { const n = q(sel); for (const k in a) n.setAttribute(k, a[k]); return n; };
    set('.adx-s', { cx: sx, cy: sy });
    set('.adx-n', { x1: sx, y1: sy, x2: sx - s * 30, y2: sy + c * 30 });
    set('.adx-n-l', { transform: `translate(${(sx - s * 27 + c * 14).toFixed(1)} ${(sy + c * 27 + s * 14 + 5).toFixed(1)})` });
    set('.adx-gap', { x1: sx, y1: sy, x2: 0, y2: 0 }).style.opacity = t.gap > .4 ? 1 : 0;
    q('.adx-min').style.opacity = t.gap > 5 ? 1 : 0;
    set('.adx-s-l', { x: sx - s * 14 - c * 15, y: sy + c * 14 - s * 15 + 5 }).style.opacity = t.gap > 2.5 ? 1 : 0;
    const est = t.gap <= 2, inc = Math.abs(p.th) <= 45, tot = t.reach + t.cone;
    lit.forEach((d, i) => d.setAttribute('opacity', est ? Math.exp(-((TAXELS[i] - t.su) ** 2) / 162).toFixed(3) : 0));
    q('.adx-v').textContent = fmt(tot);
    q('.adx-lr b').textContent = fmt(t.reach); q('.adx-lc b').textContent = fmt(t.cone);
    const wr = Math.min(t.reach, BAR) / BAR * 100, wc = Math.min(t.cone, BAR - Math.min(t.reach, BAR)) / BAR * 100;
    q('.adx-br').style.width = `${wr}%`; q('.adx-bc').style.width = `${wc}%`;
    q('.adx-bar').classList.toggle('over', tot > BAR);
    const c1 = q('.adx-c1'), c2 = q('.adx-c2');
    c1.classList.toggle('ok', est); c2.classList.toggle('ok', inc);
    c1.innerHTML = `${est ? 'Contact' : 'No contact'} <b class="num">${t.gap.toFixed(1)} mm</b>`;
    c2.innerHTML = `${inc ? 'In cone' : 'Outside cone'} <b class="num">${Math.round(Math.abs(p.th))}°</b>`;
    const say = `cost ${fmt(tot)} mm², gap ${t.gap.toFixed(1)} mm, tilt ${Math.round(Math.abs(p.th))}°${est ? ', contact' : ''}${inc ? ', in cone' : ''}`;
    pad.setAttribute('aria-valuenow', Math.round(p.x / MM)); pad.setAttribute('aria-valuetext', `x ${(p.x / MM).toFixed(0)} mm, height ${(-p.y / MM).toFixed(1)} mm; ${say}`);
    theta.setAttribute('aria-valuenow', Math.round(p.th)); theta.setAttribute('aria-valuetext', `${Math.round(p.th)}°; ${say}`);
    drawTheta(p);
    last = { ...p, ...t, total: tot, est, inc };
  }
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

  function layout() {
    const cw = scene.clientWidth || 640;
    dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.round(clamp(cw, 380, 720));
    const H = TOP + BOT;
    svg.setAttribute('viewBox', `${-W / 2} ${-TOP} ${W} ${H}`);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(cw * H / W * dpr);
    pad.setAttribute('aria-valuemin', Math.round((-W / 2 + 34) / MM)); pad.setAttribute('aria-valuemax', Math.round((W / 2 - 34) / MM));
    fieldKey = ''; bounds(); layoutTheta(); render();
  }
  new ResizeObserver(layout).observe(scene);

  // ------------------------------------------------------------ input
  const toSvg = e => new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const moveTo = (x, y) => { st.x = x; st.y = Math.min(0, y); bounds(); schedule(); };
  // pointer helper: mouse and pen act at once; touch acts on a sideways drag or a tap, so vertical swipes still scroll
  function track(target, { start, move, end, grab }) {
    let id = null, sx = 0, sy = 0, live = false;
    target.addEventListener('pointerdown', e => {
      if (id !== null || e.button > 0) return;
      const g = grab?.(e); id = e.pointerId; sx = e.clientX; sy = e.clientY;
      live = e.pointerType !== 'touch' || !!g;
      if (live) { interrupt(); start(e, g); target.setPointerCapture(e.pointerId); }
    });
    target.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      if (!live && Math.abs(e.clientX - sx) > 6) { live = true; interrupt(); start(e); target.setPointerCapture(e.pointerId); }
      if (live) move(e);
    });
    const stop = e => {
      if (e.pointerId !== id) return;
      if (!live && e.type === 'pointerup' && Math.hypot(e.clientX - sx, e.clientY - sy) < 10) { interrupt(); start(e); move(e); }
      id = null; live = false; end?.();
    };
    target.addEventListener('pointerup', stop); target.addEventListener('pointercancel', stop);
  }
  let drag = null;
  track(svg, {
    grab: e => e.target.closest('.adx-pad'),
    start: (e, onPad) => {
      const p = pose(), m = toSvg(e);
      drag = onPad ? { dx: p.x - m.x, dy: p.y - m.y } : { dx: 0, dy: 0 };
      pad.classList.add('grabbing');
    },
    move: e => { const m = toSvg(e); moveTo(m.x + drag.dx, m.y + drag.dy); },
    end: () => pad.classList.remove('grabbing'),
  });
  // a touch that starts on the pad drags it instead of scrolling the page
  svg.addEventListener('touchstart', e => { if (e.target.closest('.adx-pad')) e.preventDefault(); }, { passive: false });
  const setTh = e => { const b = theta.getBoundingClientRect(); st.th = Math.round(((e.clientX - b.left) / b.width * T.w - T.ml) / (T.w - T.ml - T.mr) * 2 * TH - TH); bounds(); schedule(); };
  track(theta, { start: setTh, move: setTh });
  pad.addEventListener('keydown', e => {
    const k = e.key, d = (e.shiftKey ? 4 : 1) * MM, a = e.shiftKey ? 10 : 3, p = pose();
    if (k === 'ArrowLeft') moveTo(p.x - d, p.y); else if (k === 'ArrowRight') moveTo(p.x + d, p.y);
    else if (k === 'ArrowUp') moveTo(p.x, p.y - d); else if (k === 'ArrowDown') moveTo(p.x, p.y + d);
    else if (k === 'q' || k === 'Q') { st.th -= a; bounds(); schedule(); } else if (k === 'e' || k === 'E') { st.th += a; bounds(); schedule(); }
    else return;
    e.preventDefault(); interrupt();
  });
  theta.addEventListener('keydown', e => {
    const k = e.key, a = e.shiftKey ? 10 : 1;
    const to = { ArrowLeft: st.th - a, ArrowDown: st.th - a, ArrowRight: st.th + a, ArrowUp: st.th + a, PageDown: st.th - 15, PageUp: st.th + 15, Home: -TH, End: TH }[k];
    if (to === undefined) return;
    e.preventDefault(); interrupt(); st.th = Math.round(to); bounds(); schedule();
  });

  // ------------------------------------------------------------ CEM on (x, y, theta)
  // per iteration: N samples around the mean with noise sigma_i = beta^i sigma_0 (beta = 0.2^(1/K)), the mean moves
  // to a softmax-weighted average of the lowest-cost 5%. Sinking into the surface is penalized like E_col.
  const objective = (x, y, th) => { const pen = Math.max(0, y + lift(th)) / MM; return econ(x, y, th) + 100 * pen * pen; };
  function sample() {
    const r = rng32(20261025), gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const p = pose(); let mu = [p.x, p.y, p.th];
    const steps = [];
    for (let i = 0; i < K; i++) {
      const sig = SIG0.map(s0 => s0 * BETA ** i), cand = [];
      for (let n = 0; n < N; n++) {
        const x = clamp(mu[0] + sig[0] * gauss(), -W / 2 + 34, W / 2 - 34), y = clamp(mu[1] + sig[1] * gauss(), -TOP + 66, BOT - 8);
        const th = clamp(mu[2] + sig[2] * gauss(), -TH, TH);
        cand.push({ x, y, th, e: objective(x, y, th), bad: y > -lift(th) + .5 });
      }
      cand.sort((a, b) => a.e - b.e);
      const elite = cand.slice(0, NE), e0 = elite[0].e, temp = elite.reduce((s, c) => s + c.e, 0) / NE - e0 + 1e-3;
      const w = elite.map(c => Math.exp(-(c.e - e0) / temp)), ws = w.reduce((a, b) => a + b, 0);
      const next = [0, 1, 2].map(j => elite.reduce((s, c, n) => s + w[n] * [c.x, c.y, c.th][j], 0) / ws);
      steps.push({ from: mu, to: next, sig, cand, elite });
      mu = next;
    }
    return steps;
  }
  const cg = q('.adx-cands'), rug = q('.adx-rug'), sigE = q('.adx-sig'), pathE = q('.adx-path'), iterE = q('.adx-iter');
  function showStep(s, elites) {
    cg.textContent = ''; rug.textContent = '';
    for (const c of s.cand) {
      if (elites && s.elite.includes(c)) continue;
      el('circle', { cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: 2.1, class: c.bad ? 'adx-cd bad' : 'adx-cd' }, cg);
      el('line', { x1: tx(c.th), x2: tx(c.th), y1: T.y0 - 5, y2: T.y0, class: 'adx-rg' }, rug);
    }
    if (elites) for (const c of s.elite) {
      el('circle', { cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: 3.6, class: 'adx-cd el' }, cg);
      el('line', { x1: tx(c.th), x2: tx(c.th), y1: T.y0 - 10, y2: T.y0, class: 'adx-rg el' }, rug);
    }
  }
  let anim = 0, trail = [], touched = false;
  const clearRun = () => { cg.textContent = ''; rug.textContent = ''; sigE.style.opacity = 0; pathE.setAttribute('d', ''); meansE.textContent = ''; iterE.textContent = ''; scene.classList.remove('running', 'ran'); };
  const setPose = m => { st.x = m[0]; st.y = Math.min(0, m[1]); st.th = m[2]; bounds(); };
  const meansE = q('.adx-means');
  const drawTrail = () => {
    const pts = trail.map(m => [m[0], Math.min(m[1], -lift(m[2]))]);
    pathE.setAttribute('d', pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(''));
    meansE.textContent = '';
    pts.slice(0, -1).forEach(([x, y]) => el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 2.4 }, meansE));
  };
  // the button reads Run CEM with a play triangle, or Stop with a square while the sampler runs
  const runLabel = on => { runBtn.querySelector('span').textContent = on ? 'Stop' : 'Run CEM'; runBtn.querySelector('path').setAttribute('d', on ? 'M2.5 2.5h7v7h-7z' : 'M3 1.8v8.4L10 6z'); };
  function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = 0; runLabel(false); scene.classList.remove('running'); }
  function interrupt() { touched = true; if (anim) stopAnim(); clearRun(); }
  function finish(steps) {
    const s = steps[K - 1];
    stopAnim(); setPose(s.to); trail = [steps[0].from, ...steps.map(t => t.to)]; drawTrail();
    showStep(s, true); sigE.style.opacity = 0; scene.classList.add('ran');
    iterE.textContent = `${K} / ${K}  ·  σ = 0.2 σ₀`;
    render();
    q('.adx-live').textContent = `Sampler done: cost ${fmt(last.total)} mm², ${last.est ? 'contact' : 'no contact'}, ${last.inc ? 'in cone' : 'outside the cone'}.`;
  }
  function play() {
    stopAnim(); clearRun();
    const steps = sample(), p0 = pose();
    q('.adx-ghost').setAttribute('transform', `translate(${p0.x.toFixed(1)} ${p0.y.toFixed(1)}) rotate(${p0.th.toFixed(1)})`);
    if (reduced.matches) { finish(steps); return; }
    runLabel(true); scene.classList.add('running');
    const D = 340, t0 = performance.now(); let shown = -1, elShown = false; trail = [steps[0].from];
    const ease = k => k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const tick = now => {
      const k = Math.max(0, now - t0) / D, i = Math.floor(k), f = k - i;
      if (i >= K) { finish(steps); return; }
      const s = steps[i];
      if (i !== shown) { shown = i; elShown = false; showStep(s, false); trail.push(s.from); iterE.textContent = `${i + 1} / ${K}  ·  σ = ${BETA ** i < .995 ? (BETA ** i).toFixed(2) : '1'} σ₀`; }
      if (f > .3 && !elShown) { elShown = true; showStep(s, true); }
      const g = ease(clamp((f - .3) / .62, 0, 1)), m = s.from.map((v, j) => v + (s.to[j] - v) * g);
      setPose(m); trail[trail.length - 1] = m; drawTrail();
      const sg = s.sig.map((v, j) => v * (1 + (BETA - 1) * g));
      const p = pose();
      sigE.setAttribute('cx', p.x); sigE.setAttribute('cy', p.y); sigE.setAttribute('rx', sg[0]); sigE.setAttribute('ry', sg[1]); sigE.style.opacity = 1;
      render();
      anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  }
  runBtn.addEventListener('click', () => { if (anim) { stopAnim(); return; } touched = true; play(); });

  layout();
  return {
    // run the sampler once when the stage first comes into view, unless the reader got there first
    solve() { if (!touched && !anim && !reduced.matches) play(); },
    get state() { return last; },
  };
}
