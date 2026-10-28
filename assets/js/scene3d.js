// Interactive sim scenes. A scene is a JSON file (assets/3d/scenes/, written by _work/scripts/scene3d/) listing GLB meshes
// (object, MANO hand, posed robot hand) with roles, the contact anchors, and a view. Paper panels are exported in the
// figure's screen frame ("frame": "screen": x right, y up, z toward the viewer, metres) with the panel's square window, so
// a scene opens on the paper's view. Scenes may instead pose a robot hand GLB (one node per URDF link) with world link
// matrices in the solver's z-up frame. three.js comes from the CDN through the import map in index.html, the first time a
// viewer gets near the viewport. All viewers share ONE WebGL renderer and copy each frame into their own 2-D canvas, so a
// page with many viewers holds a single WebGL context (browsers drop contexts beyond about 16, phones sooner).

let lib = null;
const three = () => lib ||= Promise.all([
  import('three'),
  import('three/addons/controls/OrbitControls.js'),
  import('three/addons/loaders/GLTFLoader.js'),
  import('three/addons/environments/RoomEnvironment.js'),
]).then(([THREE, oc, gl, re]) => ({ THREE, OrbitControls: oc.OrbitControls, GLTFLoader: gl.GLTFLoader, RoomEnvironment: re.RoomEnvironment }));

const cache = new Map();
const once = (key, make) => {                   // a failed load is dropped, so the next show() retries it
  if (!cache.has(key)) cache.set(key, make().catch(err => { cache.delete(key); throw err; }));
  return cache.get(key);
};
const json = url => once(url, () => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }));
const gltf = (L, url) => once(url, () => new Promise((ok, bad) => new L.GLTFLoader().load(url, g => ok(g.scene), undefined, bad)));
const base = url => url.slice(0, url.lastIndexOf('scenes/'));   // assets/3d/ from assets/3d/scenes/<section>/x.json

// the paper's look: pale blue-grey robot, off-white human hand, translucent object, orange anchors
const STYLE = {
  robot: { color: 0xc9d0db, roughness: .48, metalness: .12 },
  human: { color: 0xece7e1, roughness: .72, metalness: 0 },
  object: { color: 0xe9eaec, roughness: .35, metalness: 0, transparent: true, opacity: .42, depthWrite: false, side: 2 },
  anchor: { color: 0xe8731f, roughness: .45, metalness: 0, emissive: 0x6b2a05, emissiveIntensity: .35 },
};
const coarse = matchMedia('(pointer: coarse)').matches;
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

let shared = null;                                  // { renderer, env }: the one WebGL context, grown to the largest viewer
function sharedRenderer(L) {
  if (shared) return shared;
  const { THREE } = L;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);                        // viewers size it in device pixels
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const env = new THREE.PMREMGenerator(renderer).fromScene(new L.RoomEnvironment(), .04).texture;
  return shared = { renderer, env, w: 0, h: 0 };
}

// compact: a thumbnail (no hint, reset or labels). A drag sets data-dragged on el until the click it ends in has passed,
// so a viewer inside a button can rotate without triggering it.
export function createViewer(el, { label = 'Interactive 3D scene', reset = true, compact = false } = {}) {
  let L, cv, ctx, scene, camera, controls, root, pending = 0, mats = {}, home = null, shown = null, peers = [], syncing = false, tags = [], svg = null, occ = null, pinSig = '', pinVer = 0, exposure = 1;
  const ui = document.createElement('div'); ui.className = 's3d-ui';
  ui.innerHTML = `<span class="s3d-hint">${coarse ? 'Tap, then drag to turn' : `Drag to rotate · ${MOD} + scroll to zoom`}</span>`
    + '<button type="button" class="s3d-reset" aria-label="Reset the view" title="Reset the view"><svg aria-hidden="true"><use href="#i-replay"/></svg></button>';
  const $reset = ui.querySelector('.s3d-reset');
  if (!reset || compact) { $reset.remove(); el.classList.add('s3d-sub'); }   // linked viewers keep one reset and hint, on the main panel

  const ready = three().then(lib3 => {
    L = lib3; const { THREE } = L;
    const { env } = sharedRenderer(L);
    cv = document.createElement('canvas'); ctx = cv.getContext('2d');
    cv.className = 's3d-canvas'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', label);
    el.append(cv, ui);
    scene = new THREE.Scene();
    scene.environment = env; scene.environmentIntensity = .9;
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.2, 2.2, 1.6); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, .5); fill.position.set(-1.5, .6, -1); scene.add(fill);
    camera = new THREE.PerspectiveCamera(30, 1, .005, 20);
    controls = new L.OrbitControls(camera, cv);
    controls.enableDamping = true; controls.dampingFactor = .12; controls.rotateSpeed = .8; controls.zoomSpeed = .8;
    // a plain wheel or trackpad swipe scrolls the page (and sideways strips); pinch (ctrlKey) or the modifier zooms
    cv.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation(); }, { capture: true });
    controls.addEventListener('change', () => { request(); if (!syncing && home) { const st = pose(); peers.forEach(p => p.follow(st)); } });
    controls.addEventListener('start', () => el.classList.add('s3d-used'));
    let down = null;                                // pointer travel, not camera motion (damping keeps moving after a drag)
    cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', e => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { el.dataset.dragged = '1'; setTimeout(() => delete el.dataset.dragged, 0); }
      down = null;
    });
    if (coarse) {                                   // let the page scroll over the viewer until it is tapped
      controls.enabled = false; cv.style.touchAction = 'pan-x pan-y';
      cv.addEventListener('click', () => { wake(); peers.forEach(p => p.wake()); });
    }
    for (const [k, s] of Object.entries(STYLE)) mats[k] = new THREE.MeshStandardMaterial(s);
    mats.anchor.name = 'anchor';
    $reset.addEventListener('click', () => { goHome(); peers.forEach(p => p.reset()); });
    new ResizeObserver(resize).observe(el); resize();
    new IntersectionObserver(es => { if (!es[0].isIntersecting && coarse) { controls.enabled = false; cv.style.touchAction = 'pan-x pan-y'; el.classList.remove('s3d-live'); } }).observe(el);
  });

  function resize() {
    if (!cv) return;
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (home && !el.classList.contains('s3d-used')) setView(home);      // refit until the reader takes over
    request();
  }
  function request() { if (!pending) pending = requestAnimationFrame(frame); }
  function frame() {
    pending = 0;
    const moving = controls.update();             // damping keeps easing after the pointer lets go
    const S = shared, r = S.renderer, w = cv.width, h = cv.height;
    if (w && h) {
      if (w > S.w || h > S.h) { S.w = Math.max(S.w, w); S.h = Math.max(S.h, h); r.setSize(S.w, S.h, false); }
      r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.setScissorTest(true);
      r.toneMappingExposure = exposure;
      r.render(scene, camera);
      ctx.clearRect(0, 0, w, h);                   // GL rows start at the bottom: the frame is the canvas' bottom-left w x h
      ctx.drawImage(r.domElement, 0, S.h - h, w, h, 0, 0, w, h);
    }
    if (tags.length) place();
    if (moving) request();
  }
  // text labels from the figure, as HTML tags pinned to their 3-D points. A plain label is centred on its point. A pin
  // (a label with "offset" [dx, dy] px, "dir": a 3-D direction whose screen image, turned by "turn" degrees, it leans
  // along, or "span": a second 3-D point, the pair drawn as a dimension line "side" px off the segment) is set beside its
  // point instead: whenever the view changes it takes the cheapest spot (distance, plus a cost for leaning away from its
  // direction) where its box clears the rendered mesh (read from the canvas' alpha), the panel's edge and controls,
  // earlier pins and every drawn line, and keeps the last view's spot while that stays free and nearly as cheap. A
  // leader joins it to its point, from "gap" px out; crossing another line costs 30 px. "reach" caps how far it may go
  // (else it hides), "facing" (a 3-D normal) fades it as its point turns away, "min" hides it in panels narrower than
  // that. Lengths are px for a 260 px panel and scale with it.
  function place() {
    const w = el.clientWidth, h = el.clientHeight;
    const px = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h, p.z]; };
    for (const t of tags) {
      if (t.lb) continue;
      const [x, y, z] = px(t.at);
      t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      t.el.style.visibility = z < 1 ? 'visible' : 'hidden';
    }
    const sig = `${w} ${h} ${pinVer} ${camera.matrixWorld.elements.map(v => v.toFixed(5))}`;
    if (sig === pinSig || !w || !h || !tags.some(t => t.lb)) return;
    pinSig = sig;
    const k = Math.min(Math.max(Math.min(w, h) / 260, .6), 1.6), E = el.getBoundingClientRect();
    const hint = !el.classList.contains('s3d-used') && !el.classList.contains('s3d-live');    // shown on hover or until tapped
    const taken = [...el.querySelectorAll(':scope > i, .s3d-reset' + (hint ? ', .s3d-hint' : ''))]
      .map(c => c.getBoundingClientRect()).filter(r => r.width).map(r => [r.left - E.left, r.top - E.top, r.right - E.left, r.bottom - E.top]);
    const segs = [];
    let read = false;
    const pins = tags.filter(t => t.lb).map(t => {  // where each pin's point is and which way it leans
      const lb = t.lb, [x, y, z] = px(t.at), q = { t, P: [x, y], gap: (lb.gap || 0) * k, reach: (lb.reach || 1e4) * k, d: '' };
      q.o = z < 1 && x > 0 && x < w && y > 0 && y < h && !(lb.min && w < lb.min) ? 1 : 0;
      if (q.o && t.facing) q.o = Math.min(Math.max((t.facing.dot(camera.position.clone().sub(t.at).normalize()) + .05) / .2, 0), 1);
      if (t.span) {                                 // dimension line beside the segment, ticked at both ends
        const [bx, by] = px(t.span), L = Math.hypot(bx - x, by - y), s = (lb.side || 10) * k, c = 3 * k;
        const e = [(bx - x) / (L || 1), (by - y) / (L || 1)], n = [-e[1], e[0]];
        const a = [x + n[0] * s, y + n[1] * s], b = [bx + n[0] * s, by + n[1] * s];
        if (L < 14 * k) q.o = 0;
        const ticks = [a, b].map(p => [p[0] - n[0] * c, p[1] - n[1] * c, p[0] + n[0] * c, p[1] + n[1] * c]);
        q.lines = [[...a, ...b], ...ticks];
        q.d = q.lines.map(l => `M${l[0]} ${l[1]}L${l[2]} ${l[3]}`).join('');
        q.P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; q.u = n;
        if (q.o) segs.push(...q.lines);
      } else if (t.dir) {                           // the direction's screen image, turned
        const [qx, qy] = px(t.at.clone().addScaledVector(t.dir, .01)), m = Math.hypot(qx - x, qy - y);
        if (m > .5) t.u = [(qx - x) / m, (qy - y) / m];
        const r = (lb.turn || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), b = t.u || [0, -1];
        q.u = [b[0] * c - b[1] * sn, b[0] * sn + b[1] * c];
      } else if (lb.offset) { const m = Math.hypot(...lb.offset) || 1; q.u = lb.offset.map(v => v / m); }
      return q;
    });
    for (const q of pins) {
      const { t } = q, bw = t.el.offsetWidth, bh = t.el.offsetHeight;
      let x = q.P[0] - bw / 2, y = q.P[1] - bh / 2;
      if (q.o && q.u) {
        if (!read) { occupancy(w, h); read = true; }
        const s = spot(q, bw, bh, w, h, taken, segs);
        if (!s) q.o = 0;
        else {
          ({ x, y } = s); t.keep = [s.ax - q.P[0], s.ay - q.P[1]];
          if (t.lb.leader !== false && s.r - q.gap > 5) {
            const l = [q.P[0] + s.u[0] * q.gap, q.P[1] + s.u[1] * q.gap, s.ax, s.ay];
            q.d += `M${l[0]} ${l[1]}L${l[2]} ${l[3]}`; segs.push(l);
          }
        }
      }
      if (q.o) taken.push([x - 2, y - 2, x + bw + 2, y + bh + 2]);
      t.el.style.transform = `translate(${x}px, ${y}px)`;
      t.el.style.visibility = q.o ? 'visible' : 'hidden'; t.el.style.opacity = q.o;
      if (t.g) { t.g.style.visibility = t.el.style.visibility; t.g.style.opacity = q.o; for (const p of t.g.children) p.setAttribute('d', q.d); }
    }
  }
  // this frame's alpha at CSS-pixel resolution as a summed-area table, so any box can be checked for mesh in O(1). It is
  // read from the shared WebGL canvas, still holding the frame, not from the viewer's own canvas: reading that back
  // would push the browser to move it off the GPU.
  function occupancy(w, h) {
    if (!occ || occ.w !== w || occ.h !== h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      occ = { w, h, g: c.getContext('2d', { willReadFrequently: true }), S: new Int32Array((w + 1) * (h + 1)) };
    }
    const { g, S } = occ, W = w + 1;
    g.clearRect(0, 0, w, h); g.drawImage(shared.renderer.domElement, 0, shared.h - cv.height, cv.width, cv.height, 0, 0, w, h);
    const a = g.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) for (let x = 0, run = 0; x < w; x++) {
      run += a[(y * w + x) * 4 + 3] > 3; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + run;
    }
  }
  function onMesh(x0, y0, x1, y1) {
    const { w, h, S } = occ, W = w + 1;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1));
    return x1 > x0 && y1 > y0 && S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0] > 0;
  }
  const side = (l, x, y) => Math.sign((l[2] - l[0]) * (y - l[1]) - (l[3] - l[1]) * (x - l[0]));
  const meets = (l, m) => side(l, m[0], m[1]) * side(l, m[2], m[3]) < 0 && side(m, l[0], l[1]) * side(m, l[2], l[3]) < 0;
  const hits = (l, b) => {                          // a line through a box, sampled every 2 px
    const n = Math.max(1, Math.ceil(Math.hypot(l[2] - l[0], l[3] - l[1]) / 2));
    for (let i = 0; i <= n; i++) {
      const x = l[0] + (l[2] - l[0]) * i / n, y = l[1] + (l[3] - l[1]) * i / n;
      if (x > b[0] && x < b[2] && y > b[1] && y < b[3]) return true;
    }
    return false;
  };
  // a pin's spot: its box touches the point P + r (cos a, sin a) with the edge facing P; rings of growing r, 15 degree
  // steps out from its lean, cost r + 1/4 px per degree off the lean; last view's spot wins unless 10 px dearer
  function spot(q, bw, bh, w, h, taken, segs) {
    const [Px, Py] = q.P, a0 = Math.atan2(q.u[1], q.u[0]), pad = 2;
    const fit = (r, a) => {
      const u = [Math.cos(a), Math.sin(a)], m = Math.max(Math.abs(u[0]), Math.abs(u[1]));
      const ax = Px + u[0] * r, ay = Py + u[1] * r, x = ax - bw * (1 - u[0] / m) / 2, y = ay - bh * (1 - u[1] / m) / 2;
      if (x < 3 || y < 3 || x + bw > w - 3 || y + bh > h - 3) return null;
      const b = [x - pad, y - pad, x + bw + pad, y + bh + pad];
      if (onMesh(...b) || taken.some(o => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3]) || segs.some(l => hits(l, b))) return null;
      const lead = [Px + u[0] * q.gap, Py + u[1] * q.gap, ax - u[0], ay - u[1]], long = r - q.gap > 5;
      if (long && taken.some(o => hits(lead, o))) return null;
      return { x, y, ax, ay, u, r, n: long ? segs.filter(l => meets(lead, l)).length : 0 };
    };
    const cost = (r, d) => r + Math.abs(d) * 45 / Math.PI;
    let best = null, bc = Infinity;
    if (q.t.keep) {
      const r = Math.hypot(...q.t.keep), a = Math.atan2(q.t.keep[1], q.t.keep[0]), s = r <= q.reach && fit(r, a);
      if (s) { best = s; bc = cost(r, Math.atan2(Math.sin(a - a0), Math.cos(a - a0))) + 30 * s.n - 10; }
    }
    for (let r = Math.max(q.gap, 2); r < bc && r <= q.reach && r < w + h; r += 3) {
      for (let j = 0; j < 24; j++) {
        const d = (j & 1 ? -1 : 1) * Math.ceil(j / 2) * Math.PI / 12;
        if (cost(r, d) >= bc) continue;
        const s = fit(r, a0 + d), c = s && cost(r, d) + 30 * s.n;
        if (s && c < bc) { best = s; bc = c; }
      }
    }
    return best;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function lines(color) {                           // one leader or dimension line: a white halo under a thin stroke
    if (!svg) {
      svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 's3d-lines'); svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
      ui.prepend(svg);
    }
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', 'none'); g.setAttribute('stroke-linecap', 'round'); if (color) g.style.color = color;
    for (const [c, sw, op] of [['#fff', 3.2, .8], ['currentColor', 1.15, .9]]) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('stroke', c); p.setAttribute('stroke-width', sw); p.setAttribute('stroke-opacity', op); g.append(p);
    }
    svg.append(g); return g;
  }
  const tex = (t, s) => { try { window.katex.render(s, t, { throwOnError: false, output: 'html' }); } catch (_) {} };
  // z-up solver frame -> three.js y-up
  const up = (v, THREE) => new THREE.Vector3(v[0], v[2], -v[1]);
  // a view is a target, a unit direction to the camera and a half size to fit: the distance follows the canvas shape
  const fitDist = v => v.half * Math.max(1, 1 / camera.aspect) / Math.tan(v.fov * Math.PI / 360);
  function setView(v) {                            // programmatic: linked viewers are not told
    syncing = true;
    camera.fov = v.fov; camera.updateProjectionMatrix();
    controls.target.copy(v.target); camera.position.copy(v.dir).multiplyScalar(fitDist(v)).add(v.target); controls.update();
    syncing = false;
  }
  function wake() { if (!controls) return; controls.enabled = true; cv.style.touchAction = 'none'; el.classList.add('s3d-live'); }
  function goHome() { if (!home) return; el.classList.remove('s3d-used'); setView(home); request(); }
  // this viewer's camera relative to its home view, for linked viewers of other sizes
  function pose() {
    const off = camera.position.clone().sub(controls.target), d = off.length();
    return { dir: off.divideScalar(d), zoom: d / fitDist(home), shift: controls.target.clone().sub(home.target).divideScalar(home.half) };
  }

  function style(obj, role) {
    obj.traverse(o => {
      if (!o.isMesh) return;
      if (role === 'keep') {                        // figure colours (regions, contact maps), lit like the rest
        const m = o.material, a = m.opacity;
        o.material = mats[m.name] ||= new L.THREE.MeshStandardMaterial({ color: m.color, roughness: .6, metalness: 0,
          transparent: a < .99, opacity: a, side: 2 });      // translucent skin keeps depth: no inner folds showing through
        o.renderOrder = a < .99 ? 2 : 0; return;
      }
      const r = role || (o.material && STYLE[o.material.name] ? o.material.name : 'robot');
      o.material = mats[r]; o.renderOrder = r === 'object' ? 2 : 0;
    });
  }

  async function build(url) {
    const S = await json(url), root3 = base(url), { THREE } = L;
    const screen = S.frame === 'screen';
    const g = new THREE.Group(); if (!screen) g.rotation.x = -Math.PI / 2;   // children stay in their own coordinates
    if (S.hand) {
      const hand = (await gltf(L, `${root3}hands/${S.hand}.glb`)).clone(true);
      const links = {};                             // GLTFLoader sanitizes node names the same way
      for (const [k, m] of Object.entries(S.links)) links[THREE.PropertyBinding.sanitizeNodeName(k)] = m;
      hand.children.slice().forEach(node => {
        const m = links[node.name];
        if (!m) { node.visible = false; return; }
        node.matrixAutoUpdate = false; node.matrix.fromArray(m);
      });
      style(hand, 'robot'); g.add(hand);
    }
    for (const m of S.meshes || []) {
      const o = (await gltf(L, `${root3}${m.src}`)).clone(true);
      if (m.matrix) { o.matrixAutoUpdate = false; o.matrix.fromArray(m.matrix); }
      style(o, m.role); g.add(o);
    }
    if (S.anchors && S.anchors.length) {
      const geo = new THREE.SphereGeometry(S.anchorRadius || .0045, 20, 14);
      const inst = new THREE.InstancedMesh(geo, mats.anchor, S.anchors.length), M = new THREE.Matrix4();
      S.anchors.forEach((a, i) => inst.setMatrixAt(i, M.makeTranslation(a[0], a[1], a[2])));
      g.add(inst);
    }
    g.updateMatrixWorld(true);
    let view;
    if (S.window) view = { target: new THREE.Vector3(...S.window.center), dir: new THREE.Vector3(0, 0, 1), half: S.window.half, fov: 22 };
    else if (S.camera) {
      const t = up(S.camera.target, THREE), off = up(S.camera.position, THREE).sub(t), fov = S.camera.fov || 30;
      view = { target: t, dir: off.clone().normalize(), half: off.length() * Math.tan(fov * Math.PI / 360), fov };
    } else {                                        // frame the whole scene from the front-right, slightly above
      const sph = new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere());
      view = { target: sph.center.clone(), dir: new THREE.Vector3(.55, .45, .7).normalize(), half: sph.radius * 1.05, fov: 30 };
    }
    // figure-coloured scenes were shaded darker by matplotlib (faces x 0.62-1): a little less exposure keeps their tones
    const exposure = S.exposure || ((S.meshes || []).some(m => m.role === 'keep') ? .85 : 1);
    return { g, view, labels: S.labels || [], exposure };
  }

  return {
    el,
    // keepView: switching methods or hands on the same clip keeps the reader's viewpoint
    async show(url, { keepView = false } = {}) {
      shown = url; await ready;
      let built;
      try { built = await build(url); }
      catch (_) {                                   // one more try: a fetch can be dropped while the page is busy
        try { built = await build(url); } catch (err) { el.classList.add('s3d-fail'); console.warn('scene3d', err); return; }
      }
      if (shown !== url) return;                    // a later pick won
      if (root) scene.remove(root);
      root = built.g; scene.add(root); exposure = built.exposure;
      tags.forEach(t => { t.el.remove(); if (t.g) t.g.remove(); }); pinVer++;
      const V = v => new L.THREE.Vector3(...v), axis = v => v && V(v).transformDirection(root.matrixWorld);
      tags = (compact ? [] : built.labels).map(lb => {
        const t = document.createElement('span'); t.className = ['s3d-label', (lb.offset || lb.dir || lb.span) && 's3d-pin', lb.cls].filter(Boolean).join(' ');
        t.innerHTML = lb.html || (lb.text || '').replace(/[<&]/g, c => ({ '<': '&lt;', '&': '&amp;' })[c]).replace(/_(\w+)/, '<sub>$1</sub>');
        if (lb.tex) { if (window.katex) tex(t, lb.tex); else addEventListener('load', () => { if (window.katex) { tex(t, lb.tex); pinVer++; request(); } }, { once: true }); }
        if (lb.color) t.style.color = lb.color;
        ui.appendChild(t);
        const tag = { el: t, at: root.localToWorld(V(lb.at)) };
        if (lb.offset || lb.dir || lb.span || lb.facing || lb.min) Object.assign(tag, { lb, dir: axis(lb.dir), facing: axis(lb.facing),
          span: lb.span && root.localToWorld(V(lb.span)), g: (lb.offset || lb.dir || lb.span) && lines(lb.color) });
        return tag;
      });
      if (!home || !keepView) { home = built.view; setView(home); }
      el.classList.add('s3d-ready'); request();
    },
    link(other) { peers.push(other); },
    reset: () => goHome(),
    wake: () => wake(),
    follow(st) {                                    // take a linked viewer's rotation, zoom and pan, scaled to this view
      if (!controls || !home) return;
      syncing = true;
      controls.target.copy(st.shift).multiplyScalar(home.half).add(home.target);
      camera.position.copy(st.dir).multiplyScalar(st.zoom * fitDist(home)).add(controls.target);
      controls.update(); syncing = false; el.classList.add('s3d-used'); request();
    },
  };
}

// two viewers that share one viewpoint (the human source and its robot retarget)
export function pairViewers(a, b) { a.link(b); b.link(a); }
