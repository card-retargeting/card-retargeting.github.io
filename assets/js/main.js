// CARD project page. Plain ES modules, no build step.
import { glassify, initSeg } from './liquid-glass.js?v=20261027a';
import { initAnchorDemo } from './anchor.js?v=20261027a';
import { TASKS, HANDS, TILES, FIDELITY, HERO_SEGMENTS, SCENES } from './data.js?v=20261027a';
import { createViewer, pairViewers } from './scene3d.js?v=20261027a';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = !!(navigator.connection && navigator.connection.saveData);
const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };

/* ------------------------------------------------------------------ lazy video sources */
function ensureSrc(v) {
  if (v.dataset.poster && !v.getAttribute('poster')) v.poster = v.dataset.poster;
  if (v.dataset.src && v.getAttribute('src') !== v.dataset.src) { v.src = v.dataset.src; v.load(); }
}
const near = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const v = e.target; near.unobserve(v);
  if (v.dataset.poster && !v.getAttribute('poster')) v.poster = v.dataset.poster;
  ensureSrc(v);
}), { rootMargin: '700px 0px' });

// loops that play while visible
const inview = new IntersectionObserver(es => es.forEach(e => {
  const v = e.target;
  if (e.isIntersecting && e.intersectionRatio >= .3 && !reduced) { ensureSrc(v); v.play().catch(() => {}); }
  else v.pause();
}), { threshold: [0, .3, .6] });

// chart clips: play once on entry, hold the last frame, restart on the next entry
const charts = new IntersectionObserver(es => es.forEach(e => {
  const v = e.target;
  if (e.isIntersecting && e.intersectionRatio >= .55) {
    if (!v._shown) { v._shown = true; playChart(v); }
  } else if (!e.isIntersecting) v._shown = false;
}), { threshold: [0, .55] });
function playChart(v) {
  ensureSrc(v);
  if (reduced) { v.addEventListener('loadedmetadata', () => { v.currentTime = Math.max(0, v.duration - .05); }, { once: true }); return; }
  try { v.currentTime = 0; } catch (_) {}
  v.play().catch(() => {});
}
function setChart(v, src) {
  const poster = src.replace(/\.mp4$/, '.jpg');
  v.poster = poster; v.dataset.src = src; v.src = src; v.load();
  if (reduced) { v.addEventListener('loadedmetadata', () => { v.currentTime = Math.max(0, v.duration - .05); }, { once: true }); }
  else v.play().catch(() => {});
}

function initVideos() {
  // defer posters too: keep the attribute only for the hero
  $$('main video[poster]').forEach(v => { v.dataset.poster = v.getAttribute('poster'); v.removeAttribute('poster'); });
  $$('video[data-src]').forEach(v => near.observe(v));
  $$('video.inview').forEach(v => inview.observe(v));
  $$('video.chart').forEach(v => charts.observe(v));
  $$('.chart-card .replay').forEach(b => b.addEventListener('click', () => playChart(b.parentElement.querySelector('video'))));
  document.addEventListener('visibilitychange', () => { if (document.hidden) $$('video').forEach(v => v.pause()); });
}

/* ------------------------------------------------------------------ hero background */
function initHero() {
  const v = $('#hero-video'), hero = $('.hero'), btn = $('.hero-toggle'), label = $('#hero-label');
  if (!v) return;
  let visible = true, userPaused = false, attached = false, asked = false;
  const can = () => ((!reduced && !saveData) || asked) && visible && !document.hidden && !userPaused;
  const sync = () => {
    if (can()) {
      if (!attached) { v.src = v.dataset.video; attached = true; }
      v.play().then(() => { btn.hidden = false; }).catch(() => { btn.hidden = false; btn.classList.add('paused'); });
    } else v.pause();
  };
  v.addEventListener('playing', () => v.classList.add('is-playing'));
  // a fetch that dies before any data arrives (seen at page load on HTTP/1 servers) gets one more try
  let retried = false;
  v.addEventListener('error', () => {
    if (attached && !retried) { retried = true; v.src = v.dataset.video; sync(); return; }
    btn.hidden = true;
  });
  btn.addEventListener('click', () => {
    userPaused = !userPaused; if (!userPaused) asked = true; btn.classList.toggle('paused', userPaused);
    btn.setAttribute('aria-label', userPaused ? 'Play background video' : 'Pause background video');
    sync();
  });
  new IntersectionObserver(es => { visible = es[0].intersectionRatio >= .1; sync(); }, { threshold: [0, .1] }).observe(hero);
  document.addEventListener('visibilitychange', sync);
  if (reduced || saveData) { btn.hidden = false; btn.classList.add('paused'); userPaused = true; btn.setAttribute('aria-label', 'Play background video'); }

  // which replay is on screen: a tag with the task and hand that follows the montage
  if (label && HERO_SEGMENTS.length) {
    let last = -1;
    const show = i => {
      const t = TASKS.find(x => x.key === HERO_SEGMENTS[i].task);
      label.textContent = `${t.name} · ${t.hand}`; label.setAttribute('aria-label', `Open-loop replay: ${t.name} on the ${t.hand}. Show it in the hardware section`);
    };
    const tick = () => {
      const t = v.currentTime; let i = HERO_SEGMENTS.findIndex(s => t >= s.t0 && t < s.t1);
      if (i < 0) i = 0;
      if (i !== last) { last = i; show(i); }
    };
    show(0);
    v.addEventListener('timeupdate', tick);
    // the label is a link to that task's replay in the hardware section
    label.addEventListener('click', () => {
      const seg = HERO_SEGMENTS[Math.max(0, last)], k = TASKS.findIndex(t => t.key === seg.task);
      const btn = $(`#hw-list button[data-i="${k}"]`), hw = $('#hardware');
      if (btn) btn.click();
      if (!hw) return;
      // media above can still be loading and shift the page mid-scroll: re-aim until the heading sits under the nav
      const h2 = $('h2', hw), aim = (behavior) => scrollTo({ top: Math.max(0, h2.getBoundingClientRect().top + scrollY - 58 - 22), behavior });
      aim(reduced ? 'auto' : 'smooth');
      let n = 0;
      const check = () => { if (Math.abs(h2.getBoundingClientRect().top - 80) > 8 && n++ < 4) { aim('auto'); setTimeout(check, 400); } };
      setTimeout(check, 1100);
    });
  }
}

/* ------------------------------------------------------------------ sticky nav + scroll spy */
function initNav() {
  const nav = $('#topnav'), hero = $('.hero');
  new IntersectionObserver(es => nav.classList.toggle('show', !es[0].isIntersecting), { rootMargin: '-80px 0px 0px 0px' }).observe(hero);
  const links = $$('nav a', nav), ids = links.map(a => a.getAttribute('href').slice(1));
  const secs = ids.map(id => document.getElementById(id)).filter(Boolean);
  const tones = $$('main > section, main > .bleed');
  const spy = () => {
    const y = innerHeight * .3; let cur = null;
    for (const s of secs) if (s.getBoundingClientRect().top <= y) cur = s.id;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) cur = secs.at(-1).id;
    links.forEach(a => {
      const on = a.getAttribute('href') === `#${cur}`;
      if (on && !a.classList.contains('active') && innerWidth < 760) a.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      a.classList.toggle('active', on);
    });
    // match the bar to whatever sits under it
    const under = tones.find(el => { const r = el.getBoundingClientRect(); return r.top <= 58 && r.bottom > 58; });
    let dark = false;
    if (under) {
      const r = under.getBoundingClientRect(), past = (58 - r.top) / r.height > .5;
      dark = under.classList.contains('dark') || (under.classList.contains('l2d') && past) || (under.classList.contains('d2l') && !past);
    }
    nav.classList.toggle('on-dark', dark);
  };
  addEventListener('scroll', spy, { passive: true }); spy();
}

function initReveal() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(el => io.observe(el));
}

/* ------------------------------------------------------------------ transport bar (one or many synced videos) */
class Transport {
  constructor(bar, videos, { ticks = [], loop = true, onTime } = {}) {
    this.bar = bar; this.vids = videos; this.loop = loop; this.onTime = onTime;
    this.pp = $('.pp', bar); this.scrub = $('.scrub', bar); this.fill = $('.fill', bar); this.knob = $('.knob', bar); this.clock = $('.clock', bar);
    this.dragging = false; this.raf = 0;
    this.pp.addEventListener('click', () => (this.master.paused ? this.play() : this.pause()));
    this.vids.forEach(v => v.addEventListener('seeked', () => { v._seeking = false; if (v._pending != null) { const t = v._pending; v._pending = null; this.seekV(v, t); } }));
    this.bindScrub(); this.setTicks(ticks);
    this.master.addEventListener('ended', () => { if (this.loop) { this.seek(0); this.play(); } else this.render(); });
    this.vids.forEach(v => v.addEventListener('loadedmetadata', () => this.render()));
  }
  get master() { return this.vids[0]; }
  setVideos(vids, ticks = []) { this.vids = vids; this.setTicks(ticks); this.render(); }
  setTicks(ticks) {
    const box = $('.ticks', this.bar); box.innerHTML = ''; this.ticks = ticks;
    ticks.forEach(t => { const s = document.createElement('span'); s.className = 'tick' + (t.l ? ' lbl' : ''); if (t.l) s.dataset.l = t.l; s.dataset.t = t.t; box.append(s); });
    this.placeTicks();
  }
  placeTicks() {
    const d = this.master.duration;
    $$('.tick', this.bar).forEach(s => { s.style.left = `${d ? (+s.dataset.t / d) * 100 : 0}%`; s.style.opacity = d ? 1 : 0; });
  }
  play() { this.vids.forEach(v => { ensureSrc(v); v.play().catch(() => {}); }); this.bar.classList.add('playing'); this.loopRaf(); }
  pause() { this.vids.forEach(v => v.pause()); this.bar.classList.remove('playing'); }
  seekV(v, t) { if (v._seeking) { v._pending = t; return; } v._seeking = true; try { v.currentTime = t; } catch (_) { v._seeking = false; } }
  seek(t) { this.vids.forEach(v => this.seekV(v, Math.min(t, (v.duration || t) - .03))); this.render(t); }
  loopRaf() {
    cancelAnimationFrame(this.raf);
    const step = () => {
      const m = this.master, t = m.currentTime;
      for (let i = 1; i < this.vids.length; i++) {          // followers chase the master clock
        const v = this.vids[i]; if (v.readyState < 2) continue;
        const drift = t - v.currentTime;
        if (Math.abs(drift) > .3) this.seekV(v, t);
        else { const r = Math.min(4, Math.max(.25, 1 + Math.max(-.3, Math.min(.3, drift * 1.6)))); if (Math.abs(v.playbackRate - r) > .02) v.playbackRate = r; }
        if (m.paused && !v.paused) v.pause();
      }
      this.render();
      if (!m.paused) this.raf = requestAnimationFrame(step); else this.bar.classList.remove('playing');
    };
    this.raf = requestAnimationFrame(step);
  }
  render(tOverride) {
    const m = this.master, d = m.duration || 0, t = tOverride ?? m.currentTime;
    const p = d ? Math.min(1, t / d) : 0;
    this.fill.style.width = `${p * 100}%`; this.knob.style.left = `${p * 100}%`;
    this.clock.textContent = `${fmt(t)} / ${fmt(d)}`;
    this.scrub.setAttribute('aria-valuenow', Math.round(p * 100)); this.scrub.setAttribute('aria-valuetext', this.clock.textContent);
    if (this.ticks.length) this.placeTicks();
    this.onTime?.(t);
  }
  bindScrub() {
    const at = e => { const r = this.scrub.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (this.master.duration || 0); };
    this.scrub.addEventListener('pointerdown', e => { this.dragging = true; this.wasPlaying = !this.master.paused; this.pause(); this.scrub.setPointerCapture(e.pointerId); this.seek(at(e)); });
    this.scrub.addEventListener('pointermove', e => { if (this.dragging) this.seek(at(e)); });
    const up = () => { if (!this.dragging) return; this.dragging = false; if (this.wasPlaying) this.play(); };
    this.scrub.addEventListener('pointerup', up); this.scrub.addEventListener('pointercancel', up);
    this.scrub.addEventListener('keydown', e => {
      const d = this.master.duration || 0; if (!d) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); this.seek(Math.min(d, Math.max(0, this.master.currentTime + (e.key === 'ArrowRight' ? 1 : -1)))); }
      if (e.key === ' ') { e.preventDefault(); this.master.paused ? this.play() : this.pause(); }
    });
  }
}
function transportBar() {
  const bar = document.createElement('div'); bar.className = 'transport glass';
  bar.innerHTML = `<button class="pp" type="button" aria-label="Play or pause"><svg class="i-play" aria-hidden="true"><use href="#i-play"/></svg><svg class="i-pause" aria-hidden="true"><use href="#i-pause"/></svg></button>
    <div class="scrub" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="track"><div class="fill"></div></div><div class="ticks"></div><span class="knob"></span></div>
    <span class="clock">0:00 / 0:00</span>`;
  return bar;
}
// play a transport while its stage is mostly on screen, pause when it leaves
function engage(stage, tr) {
  let user = false;
  tr.pp.addEventListener('click', () => { user = true; });
  new IntersectionObserver(es => {
    const r = es[0].intersectionRatio;
    if (r >= .6 && !reduced && !user) tr.play();
    else if (r < .3) { tr.pause(); user = false; }
  }, { threshold: [0, .3, .6] }).observe(stage);
}
function initSynced() {
  $$('[data-sync]').forEach(p => {
    const vids = $$('video', p); const bar = transportBar(); p.append(bar);
    vids.forEach(v => near.observe(v));
    const tr = new Transport(bar, vids); p._tr = tr; engage(p, tr);
  });
}

/* ------------------------------------------------------------------ segmented controls */
function segs() {
  $$('.seg').forEach(s => { if (!s._init) { s._init = true; initSeg(s, b => s.dispatchEvent(new CustomEvent('pick', { detail: b }))); } });
}
const pressed = seg => $('button[aria-pressed="true"]', seg);

/* ------------------------------------------------------------------ 3D scenes */
const S3D = 'assets/3d/scenes/';
// a human panel and its robot panel as two viewers sharing one viewpoint, made when the card nears the viewport
// (each viewer holds a WebGL context); the paper renders underneath stay as posters and fallback
function scenePair(card, human, robot, labels, first) {
  human.classList.add('s3d'); robot.classList.add('s3d');
  new IntersectionObserver((es, io) => {
    if (!es[0].isIntersecting) return; io.disconnect();
    const hv = createViewer(human, { label: labels[0], reset: false }), rv = createViewer(robot, { label: labels[1] });
    pairViewers(hv, rv); card._rv = rv;
    hv.show(first[0]); rv.show(card._next || first[1]);
  }, { rootMargin: '600px 0px' }).observe(card);
}
// switch the robot panel, keeping the reader's viewpoint
function sceneSwap(card, url) { card._next = url; if (card._rv) card._rv.show(url, { keepView: true }); }
// small renders (the source tiles) open in one shared dialog, so the page holds a single extra WebGL context
// views: [{ name, url, on }] (the one marked `on`, else the first, opens); chips in the header switch views, keeping the viewpoint
let sceneDialog = null;
function openScene(views, title) {
  if (!sceneDialog) {
    const d = document.createElement('dialog'); d.className = 's3d-dialog';
    d.innerHTML = '<div class="s3d-dialog-head"><b></b><span class="s3d-views"></span><button type="button" class="s3d-close" aria-label="Close">&times;</button></div><div class="s3d-dialog-stage s3d"></div>';
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    $('.s3d-close', d).addEventListener('click', () => d.close());
    sceneDialog = { d, v: createViewer($('.s3d-dialog-stage', d), { label: `${title}, 3D: drag to rotate` }) };
  }
  const { d, v } = sceneDialog, chips = $('.s3d-views', d);
  $('b', d).textContent = title;
  const first = Math.max(0, views.findIndex(w => w.on));
  chips.innerHTML = views.length > 1 ? views.map((w, i) => `<button type="button" aria-pressed="${i === first}">${w.name}</button>`).join('') : '';
  $$('button', chips).forEach((b, i) => b.addEventListener('click', () => {
    $$('button', chips).forEach(o => o.setAttribute('aria-pressed', o === b)); v.show(views[i].url, { keepView: true });
  }));
  d.showModal(); v.show(views[first].url);
}

// stage 2's two renders as viewers; "View in 3D" buttons (data-scenes="path:name,...") open the dialog
function initPipeline3d() {
  $$('.anchor-fig .af-img').forEach(box => {
    const img = $('img', box), key = img.getAttribute('src').split('/').pop().replace(/\.webp$/, '');
    if (!SCENES.pipeline.includes(key)) return;
    box.classList.add('s3d');
    new IntersectionObserver((es, io) => {
      if (!es[0].isIntersecting) return; io.disconnect();
      createViewer(box, { label: `${img.alt}, 3D: drag to rotate` }).show(`${S3D}pipeline/${key}.json`);
    }, { rootMargin: '600px 0px' }).observe(box);
  });
  $$('[data-scenes]').forEach(b => b.addEventListener('click', () => openScene(
    b.dataset.scenes.split(',').map(x => { const [path, name] = x.split(':'); return { name, url: `${S3D}${path}.json` }; }), b.dataset.title)));
}

// the framework's sim thumbnails (and their copies in the stage articles) as compact viewers: drag turns, a click still navigates
const THUMBS = { mocap_power_frame: 'gallery/mocap_power_frame', raw_contact: 'pipeline/raw_contact', unified_hand: 'pipeline/unified_hand',
  unified_closeup: 'pipeline/unified_closeup', geominit_hand: 'pipeline/geominit_hand', geominit_closeup: 'pipeline/geominit_closeup',
  retarget_hand: 'pipeline/retarget_hand', retarget_closeup: 'pipeline/retarget_closeup' };
function initThumbs3d() {
  if (!SCENES.thumbs) return;
  $$('.fw-img').forEach(box => {
    const img = $('img', box), key = img.getAttribute('src').split('/').pop().replace(/\.webp$/, '');
    if (!THUMBS[key]) return;
    box.classList.add('s3d');
    new IntersectionObserver((es, io) => {
      if (!es[0].isIntersecting || !box.clientWidth) return; io.disconnect();
      createViewer(box, { compact: true, label: `${key.replace(/_/g, ' ')}, 3D thumbnail` }).show(`${S3D}${THUMBS[key]}.json`);
    }, { rootMargin: '400px 0px' }).observe(box);
  });
  $$('.fw-box').forEach(b => b.addEventListener('click', e => {
    if (e.target.closest('[data-dragged]')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true));
}
/* ------------------------------------------------------------------ baselines viewer */
const METHODS = [['human', 'Human', 'human'], ['card', 'CARD', 'ours'], ['dexpilot', 'DexPilot', 'kin'], ['anyteleopk', 'AnyTeleop-K', 'kin'],
  ['fingertipik', 'AnyTeleop-P', 'kin'], ['init', 'CARD (init only)', 'kin']];
function initBaselines() {
  const root = $('#baselines'); if (!root) return;
  $$('.cmp-case', root).forEach(card => {
    const clip = card.dataset.clip, strip = $('.cmp-strip', card), on3d = SCENES.baselines.includes(clip);
    strip.innerHTML = METHODS.map(([m, name, tag]) =>
      `<div class="cmp-panel${m === 'card' ? ' ours' : ''}" data-m="${m}"><div class="cmp-view"><img src="assets/img/cut/baselines/${clip}_${m}.webp" alt="${name} on the ${clip}" loading="lazy"></div><span class="lbl glass-tag ${tag}">${name}</span></div>`).join('');
    $$('.cmp-nav button', card).forEach(b => b.addEventListener('click', () => {
      const w = $('.cmp-panel', strip).getBoundingClientRect().width + 10;
      strip.scrollBy({ left: +b.dataset.dir * w * 2, behavior: reduced ? 'auto' : 'smooth' });
    }));
    const ends = () => { $('.cmp-nav [data-dir="-1"]', card).disabled = strip.scrollLeft < 4; $('.cmp-nav [data-dir="1"]', card).disabled = strip.scrollLeft + strip.clientWidth > strip.scrollWidth - 4; };
    strip.addEventListener('scroll', ends, { passive: true }); new ResizeObserver(ends).observe(strip); ends();
    if (!on3d) return;
    // all six panels as linked viewers: one viewpoint per case
    const views = $$('.cmp-view', strip); views.forEach(v => v.classList.add('s3d'));
    new IntersectionObserver((es, io) => {
      if (!es[0].isIntersecting) return; io.disconnect();
      const vs = views.map((v, k) => createViewer(v, { label: `${METHODS[k][1]} on the ${clip}, 3D: drag to rotate`, reset: METHODS[k][0] === 'card' }));
      vs.forEach((a, k) => vs.slice(k + 1).forEach(b => pairViewers(a, b)));
      vs.forEach((v, k) => v.show(`${S3D}baselines/${clip}_${METHODS[k][0]}.json`));
    }, { rootMargin: '600px 0px' }).observe(card);
  });
}

/* ------------------------------------------------------------------ sources: tabs + tiles */
function initSources() {
  $$('[data-tiles]').forEach(box => {
    const list = TILES[box.dataset.tiles] || [];
    box.innerHTML = list.map(t => `<button class="tile" type="button" aria-label="${t.label}: show contact">
      <img src="${t.frame}" alt="${t.label}, source frame" loading="lazy"><img class="contact" src="${t.contact}" alt="${t.label}, contact on the MANO hand" loading="lazy">
      <span class="glass-tag plain">${t.label}</span></button>`).join('');
    $$('.tile', box).forEach((b, i) => {
      const key = list[i].contact.split('/').pop().replace(/_contact\.webp$/, '');
      if (!SCENES.gallery.includes(key)) { b.addEventListener('click', () => b.classList.toggle('flip')); return; }
      // with a 3D scene: hover (or a first tap) shows the contact, a click opens it in 3D
      b.classList.add('has3d'); b.setAttribute('aria-label', `${list[i].label}: contact on the hand, open in 3D`);
      b.insertAdjacentHTML('beforeend', '<span class="glass-tag plain t3d">3D</span>');
      // the tile's sim renders as compact viewers (contact on hover; mocap's hand + object as the face): drag turns in place
      const frame = SCENES.galleryFrames.includes(key);
      const mk = (cls, url) => { const d = document.createElement('div'); d.className = `s3d s3d-tile ${cls}`; b.prepend(d); return () => createViewer(d, { compact: true, label: `${list[i].label}, 3D` }).show(url); };
      const later = [mk('contact', `${S3D}gallery/${key}.json`)].concat(frame ? [mk('frame', `${S3D}gallery/${key}_frame.json`)] : []);
      new IntersectionObserver((es, io) => { if (!es[0].isIntersecting || !b.clientWidth) return; io.disconnect(); later.forEach(f => f()); }, { rootMargin: '300px 0px' }).observe(b);
      b.addEventListener('click', e => {
        if (e.target.closest('[data-dragged]')) return;
        const views = (frame ? [{ name: 'Hand and object', url: `${S3D}gallery/${key}_frame.json` }] : [])
          .concat({ name: 'Contact', url: `${S3D}gallery/${key}.json`, on: true });
        if (matchMedia('(hover: hover)').matches || b.classList.contains('flip')) openScene(views, list[i].label);
        else b.classList.add('flip');
      });
    });
  });
}

/* ------------------------------------------------------------------ chart toggles */
function initCharts() {
  // stage 5: force-tracking clips redrawn from the paper's figure, one test at a time
  $$('[data-chart]').forEach(seg => {
    const g = seg.dataset.chart, v = $(`video[data-group="${g}"]`);
    seg.addEventListener('pick', e => {
      setChart(v, `assets/video/charts/${g}_${e.detail.dataset.v}.mp4`);
      const txt = FIDELITY.text[g]?.[e.detail.dataset.v]; const el = $(`#${g}-text`);
      if (txt && el) el.innerHTML = txt;
    });
  });

  // contact fidelity: our data left (video or glove + mocap), GRAB right, for the picked metric;
  // penetration needs a ground-truth object mesh, so it is shown for GRAB only
  const ctl = $('#fid-ctl'), pair = $('#fid-pair'); if (!ctl || !pair) return;
  const metSeg = $('[data-k="metric"]', ctl);
  const show = card => {
    const met = pressed(metSeg).dataset.v, bed = card.dataset.bed, v = $('video', card), na = $('.chart-na', card), none = bed !== 'grab' && met === 'pen';
    v.hidden = none; if (na) na.hidden = !none;
    if (!none) setChart(v, `assets/video/charts/fidelity_${bed}_${met}.mp4`);
  };
  metSeg.addEventListener('pick', () => $$('[data-bed]', pair).filter(c => c.matches('figure')).forEach(show));
  $$('.bed-switch button', pair).forEach(b => b.addEventListener('click', () => {
    const card = b.closest('figure');
    $$('button', b.parentElement).forEach(x => x.setAttribute('aria-pressed', x === b));
    card.dataset.bed = b.dataset.bed; show(card);
  }));
}

/* ------------------------------------------------------------------ wipe compare */
function initWipe() {
  const w = $('#wipe'); if (!w) return;
  const input = $('input', w), under = $('img.under', w), top = $('.top img', w);
  const set = x => w.style.setProperty('--x', `${x}%`);
  const at = e => { const r = w.getBoundingClientRect(); const x = Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)); input.value = x; set(x); };
  let clip = pressed($('#wipe-ctl')).dataset.c, show3d = null;
  input.addEventListener('input', () => set(input.value));
  if (SCENES.init.includes(clip)) {
    // 3D: two linked viewers, CARD's clipped by the wipe; the bar drags the wipe, the rest of the stage turns the view
    const base = document.createElement('div'); under.replaceWith(base); base.appendChild(under);
    const topBox = $('.top', w), bar = $('.bar', w);
    base.classList.add('s3d'); topBox.classList.add('s3d'); w.classList.add('w3d');
    let vu = null, vt = null;
    show3d = c => { if (vu) { vu.show(`${S3D}init/${c}_init.json`); vt.show(`${S3D}init/${c}_card.json`); } };
    new IntersectionObserver((es, io) => {
      if (!es[0].isIntersecting) return; io.disconnect();
      vu = createViewer(base, { label: 'Geometric initialization, 3D: drag to rotate', reset: false });
      vt = createViewer(topBox, { label: 'CARD solution, 3D: drag to rotate' });
      pairViewers(vu, vt); show3d(clip);
    }, { rootMargin: '600px 0px' }).observe(w);
    bar.addEventListener('pointerdown', e => { bar.setPointerCapture(e.pointerId); at(e); e.preventDefault(); });
    bar.addEventListener('pointermove', e => { if (bar.hasPointerCapture(e.pointerId)) at(e); });
  } else {
    w.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && e.buttons === 0) return; at(e); });
  }
  $('#wipe-ctl').addEventListener('pick', e => {
    const c = clip = e.detail.dataset.c;
    under.src = `assets/img/cut/init/${c}_init.webp`; top.src = `assets/img/cut/init/${c}_card.webp`;
    under.alt = `Geometric initialization on the ${c}`; top.alt = `CARD solution on the ${c}`;
    if (show3d) show3d(c);
  });
  // a short sweep when its method stage first becomes current, so it reads as draggable
  let swept = false;
  w.addEventListener('sweep', () => {
    if (swept || reduced) return; swept = true;
    const t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 1600); const x = 50 + 28 * Math.sin(k * Math.PI * 2) * (1 - k); set(x); input.value = x; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------------------ hardware gallery */
function initHardware() {
  const list = $('#hw-list'), v = $('#hw-video'), demo = $('#hw-demo'), demoCard = $('#hw-demo-card'), frames = $('#hw-frames');
  if (!list) return;
  list.innerHTML = TASKS.map((t, i) => `<button type="button" aria-pressed="${i === 0}" data-i="${i}"><img src="${t.thumb}" alt="" loading="lazy"><span><b>${t.name}</b>${t.hand}</span></button>`).join('');
  const tr = new Transport($('#hw-transport'), [v], { onTime: t => {
    $$('button', frames).forEach(b => b.classList.toggle('near', Math.abs(+b.dataset.t - t) < .6));
  } });
  let cur = -1;
  const pick = (i, autoplay = true) => {
    if (i === cur) return; cur = i; const t = TASKS[i];
    $$('button', list).forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i));
    if (autoplay) v.poster = t.poster; else { v.removeAttribute('poster'); v.dataset.poster = t.poster; }
    v.dataset.src = t.video; v.setAttribute('aria-label', `${t.hand} replaying: ${t.name}`);
    $('#hw-tag').textContent = t.hand;
    frames.innerHTML = t.frames.map((s, k) => `<button type="button" data-t="${s.t}" aria-label="Jump to frame ${k + 1} at ${s.t.toFixed(1)} s"><img src="${s.img}" alt="" loading="lazy"><span>${fmt(s.t)}</span></button>`).join('');
    $$('button', frames).forEach(b => b.addEventListener('click', () => { ensureSrc(v); tr.seek(+b.dataset.t); }));
    tr.setTicks(t.frames.map((s, k) => ({ t: s.t })));
    if (autoplay) ensureSrc(v); else near.observe(v);
    if (t.demo) {
      demoCard.hidden = false; demo.removeAttribute('poster'); demo.dataset.poster = t.demo.replace(/\.mp4$/, '.jpg'); demo.dataset.src = t.demo;
      $('#hw-demo-tag').textContent = `Human demonstration · ${t.demoSrc}`; demo.setAttribute('aria-label', `Human demonstration of the ${t.name.toLowerCase()}, ${t.demoSrc.toLowerCase()}`);
      if (autoplay) { ensureSrc(demo); if (!reduced) demo.play().catch(() => {}); }
    }
    else { demoCard.hidden = true; demo.pause(); }
    $('#hw-desc').innerHTML = t.desc;
    if (autoplay && !reduced) tr.play(); else tr.render(0);
  };
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(+b.dataset.i); });
  pick(0, false);
  inview.observe(demo);
  engage($('#hw'), tr);
}

/* ------------------------------------------------------------------ tracker on/off */
// Paired clips (assets/video/tactile, cut by _work/scripts/tactile_pairs.py). rate: successes over 10 trials (paper, Sec. 4.2).
// fail: [from s, to s, what goes wrong] in the clip without the tracker, read off the footage frame by frame.
const ONOFF = {
  hammer: { noun: 'hammer', res: ['Held', 'Slipped'], rate: ['8/10', '1/10'], fail: [[5.5, 99, 'The handle pivots out of the fingers as the hand lifts, and the hammer drops back to the table']] },
  cup: { noun: 'cup', res: ['Held', 'Slipped'], rate: ['10/10', '3/10'], fail: [[4.8, 7.3, 'The cup tilts and slides down through the fingers']] },
  mustard: { noun: 'mustard bottle', res: ['Dispensed', 'Nothing comes out'], rate: ['7/10', '0/10'], fail: [[9, 15.5, 'Bottle held nozzle-down over the glass but not squeezed: no mustard comes out']] },
  cards: { noun: 'card deck', res: ['Card picked up', 'Card falls back'], fail: [[4.7, 99, 'The card tips up in the pinch, slips out and falls back onto the deck']] },
};
function initOnOff() {
  const box = $('#onoff'); if (!box) return;
  const cards = ['on', 'off'].map(s => $(`[data-side="${s}"]`, box));
  const offCard = cards[1], callTxt = $('.fail-call .txt', offCard);
  let vids = [], fail = [], visible = false, timer = 0, raf = 0;
  // timeline under each clip, with the failure spans in red on the clip without the tracker
  const spans = (card, v, f) => {
    const bar = $('.of-bar', card); $$('s', bar).forEach(e => e.remove());
    const d = v.duration; if (!d) return;
    f.forEach(([a, b]) => { const e = document.createElement('s'); e.style.left = `${a / d * 100}%`; e.style.width = `${(Math.min(b, d) - a) / d * 100}%`; bar.appendChild(e); });
  };
  const mark = () => {
    vids.forEach((v, k) => {
      const card = cards[k], d = v.duration || 0, x = d ? Math.min(1, v.currentTime / d) : 0;
      $('.of-bar b', card).style.transform = `scaleX(${x})`; $('.of-bar i', card).style.left = `${x * 100}%`;
      if (k !== 1) return;
      const ev = fail.find(([a, b]) => v.currentTime >= a && v.currentTime < b);
      offCard.classList.toggle('failing', !!ev);
      if (ev) callTxt.textContent = ev[2];
    });
  };
  const loop = () => { mark(); raf = requestAnimationFrame(loop); };
  const playAll = () => {
    if (reduced || !visible) return;
    vids.forEach(v => { ensureSrc(v); v.play().catch(() => {}); });
    if (vids.length && !raf) raf = requestAnimationFrame(loop);
  };
  const pauseAll = () => { vids.forEach(v => v.pause()); cancelAnimationFrame(raf); raf = 0; };
  // the shorter clip holds its last frame; both restart together once both have ended
  const ended = () => {
    if (!vids.length || !vids.every(v => v.ended)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { vids.forEach(v => { v.currentTime = 0; }); playAll(); }, 1200);
  };
  function show(t) {
    const d = ONOFF[t]; if (!d) return;
    clearTimeout(timer); pauseAll(); vids = []; fail = d.fail;
    cards.forEach((card, k) => {
      const s = k ? 'off' : 'on';
      const what = k ? ` ${d.fail.map(f => f[2]).join('; ')}.` : '';
      const rate = d.rate ? `, ${d.rate[k]} trials succeed` : '';
      const label = (k ? `Position replay only: ${d.noun}, ${d.res[1].toLowerCase()}${rate}.` : `With the tactile tracker: ${d.noun}, ${d.res[0].toLowerCase()}${rate}.`) + what;
      const el = document.createElement('video');
      el.muted = true; el.playsInline = true; el.preload = 'none';
      el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
      el.poster = `assets/video/tactile/${t}_${s}.jpg`;
      el.dataset.src = `assets/video/tactile/${t}_${s}.mp4`;
      el.setAttribute('aria-label', label);
      el.addEventListener('ended', ended);
      el.addEventListener('loadedmetadata', () => { spans(card, el, k ? d.fail : []); mark(); });
      el.addEventListener('seeked', mark);
      vids.push(el);
      card.firstElementChild.replaceWith(el);
      $('.res', card).textContent = d.rate ? `${d.res[k]} · ${d.rate[k]} trials` : d.res[k];
      $$('.of-bar s', card).forEach(e => e.remove());
    });
    // no motion: name the failure without waiting for the frame
    const fixed = reduced;
    offCard.classList.toggle('failing', fixed);
    callTxt.textContent = fixed ? d.fail[0][2] : '';
    if (!fixed) mark();
    playAll();
  }
  new IntersectionObserver(es => {
    visible = es[0].isIntersecting && es[0].intersectionRatio >= .3;
    if (visible) playAll(); else pauseAll();
  }, { threshold: [0, .3, .6] }).observe(box);
  $('#onoff-ctl').addEventListener('pick', e => show(e.detail.dataset.t));
  show(pressed($('#onoff-ctl')).dataset.t);
}

/* ------------------------------------------------------------------ embodiments */
function initEmbodiments() {
  const emb = $('#emb'); if (!emb) return;
  const keys = Object.keys(HANDS);
  $$('.emb-card', emb).forEach(card => {
    const d = card.dataset.demo;
    $('[data-role="human"]', card).src = `assets/img/cut/crossemb/${d}_human.webp`;
    $('[data-role="robot"]', card).innerHTML = keys.map((h, i) => `<img class="${i === 0 ? 'on' : ''}" data-h="${h}" src="assets/img/cut/crossemb/${d}_${h}.webp" alt="${HANDS[h].name} retargeted grasp on the ${d}" loading="lazy">`).join('');
    if (SCENES.crossemb.includes(d)) {
      const img = $('[data-role="human"]', card), wrap = document.createElement('div');
      img.replaceWith(wrap); wrap.appendChild(img);
      scenePair(card, wrap, $('[data-role="robot"]', card), [`Human source grasp on the ${d}, 3D: drag to rotate`, `Retargeted grasp on the ${d}, 3D: drag to rotate`],
        [`${S3D}crossemb/${d}_human.json`, `${S3D}crossemb/${d}_${keys[0]}.json`]);
    }
  });
  $('#emb-map').innerHTML = keys.map((h, i) => `<img class="${i === 0 ? 'on' : ''}" data-h="${h}" src="${HANDS[h].map}" alt="Semantic map from human hand regions to ${HANDS[h].name}" loading="lazy">`).join('');
  const real = $('#emb-real');
  // semantic maps in 3D: the human regions and the robot regions as two linked viewers over the map image
  let showMap = null;
  if (SCENES.semantic.length) {
    const map = $('#emb-map'), hBox = document.createElement('div'), rBox = document.createElement('div');
    hBox.className = 's3d s3d-half l'; rBox.className = 's3d s3d-half r'; map.classList.add('s3d-map'); map.append(hBox, rBox);
    let hv = null, rv = null, cur = keys[0];
    showMap = h => { cur = h; if (hv && SCENES.semantic.includes(h)) { hv.show(`${S3D}semantic/${h}_human.json`); rv.show(`${S3D}semantic/${h}_robot.json`); } };
    new IntersectionObserver((es, io) => {
      if (!es[0].isIntersecting) return; io.disconnect();
      hv = createViewer(hBox, { label: 'Human hand regions, 3D: drag to rotate', reset: false });
      rv = createViewer(rBox, { label: 'Robot hand regions, 3D: drag to rotate' });
      pairViewers(hv, rv); showMap(cur);
    }, { rootMargin: '600px 0px' }).observe(map);
  }
  const pick = h => {
    const H = HANDS[h];
    $$('[data-h]', emb).forEach(img => img.classList.toggle('on', img.dataset.h === h));
    $$('.emb-card', emb).forEach(card => { if (SCENES.crossemb.includes(card.dataset.demo)) sceneSwap(card, `${S3D}crossemb/${card.dataset.demo}_${h}.json`); });
    $$('.h-name', emb).forEach(c => { c.textContent = H.name; });
    $$('#emb-map img').forEach(img => img.classList.toggle('on', img.dataset.h === h));
    if (showMap) showMap(h);
    const old = $('video', real); if (old) old.pause();
    real.innerHTML = H.real
      ? `<div class="media-card"><video muted loop playsinline preload="none" data-src="${H.real.video}" data-poster="${H.real.video.replace(/\.mp4$/, '.jpg')}" aria-label="${H.real.label}"></video><div class="tags"><span class="glass-tag ours">${H.name}</span></div><div class="tags br"><span class="glass-tag plain">${H.real.label}</span></div></div>`
      : `<figure class="still" style="margin:0"><img src="assets/img/cut/crossemb/cube_gripper.webp" alt="Parallel-jaw gripper retargeted onto the cube demonstration" loading="lazy"><p>Retargeting only, no hardware replay.</p></figure>`;
    const nv = $('video', real); if (nv) inview.observe(nv);
    const still = $('.still', real);
    if (still && SCENES.crossemb.includes('cube')) {         // the gripper has no hardware replay: its cube retarget in 3D
      const img = $('img', still), wrap = document.createElement('div');
      wrap.className = 's3d'; img.replaceWith(wrap); wrap.appendChild(img);
      createViewer(wrap, { label: 'Parallel-jaw gripper on the cube demonstration, 3D: drag to rotate' }).show(`${S3D}crossemb/cube_gripper.json`);
    }
  };
  $('#emb-ctl').addEventListener('pick', e => pick(e.detail.dataset.h));
  pick('sharpa');
}

/* ------------------------------------------------------------------ BibTeX, KaTeX */
function initBib() {
  const b = $('.bib-copy'); if (!b) return;
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#bib-text').textContent); b.textContent = 'Copied'; }
    catch (_) { const r = document.createRange(); r.selectNodeContents($('#bib-text')); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Press ⌘C or Ctrl+C'; }
    setTimeout(() => { b.textContent = 'Copy'; }, 1600);
  });
}
function renderMath() {
  const go = () => $$('.tex').forEach(el => {
    if (el._k) return; el._k = true;
    try { window.katex.render(el.textContent, el, { displayMode: el.classList.contains('display'), throwOnError: false, output: 'html' }); } catch (_) {}
  });
  if (window.katex) go(); else addEventListener('load', () => window.katex && go());
}

/* ------------------------------------------------------------------ pipeline figure hotspots */
async function initPipeline() {
  const fig = $('#pipe-fig'), steps = $('#steps'); if (!fig) return;
  let boxes = null;
  try { boxes = await (await fetch('assets/img/cut/pipeline/hotspots.json')).json(); } catch (_) {}
  if (boxes) {
    for (const [k, b] of Object.entries(boxes)) for (const [x, y, w, h] of b.rects) {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'hot'; el.dataset.hot = k; el.setAttribute('aria-label', b.label || k);
      Object.assign(el.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
      fig.append(el);
    }
  }
  const pick = k => {
    $$('.step', steps).forEach(s => s.setAttribute('aria-expanded', s.dataset.hot === k));
    $$('.hot', fig).forEach(h => h.classList.toggle('on', h.dataset.hot === k));
  };
  steps.addEventListener('click', e => { const s = e.target.closest('.step'); if (s) pick(s.dataset.hot); });
  fig.addEventListener('click', e => { const h = e.target.closest('.hot'); if (h) pick(h.dataset.hot); });
  pick('uhcr');
}

/* ------------------------------------------------------------------ method: sticky framework, stages light up on scroll */
function initMethod(anchorDemo) {
  const fw = $('#fw'), stages = $$('.method-stages .stage[data-stage]'); if (!fw || !stages.length) return;
  const boxes = $$('.fw-box', fw), narrow = matchMedia('(max-width: 860px)');
  // on narrow screens the framework is hidden; each stage shows its own box instead
  stages.forEach(st => {
    const box = $(`.fw-box[data-stage="${st.dataset.stage}"]`, fw), slot = $('.stage-crop', st);
    if (box && slot) { const c = box.cloneNode(true); const d = document.createElement('div'); d.className = c.className; d.style.cssText = c.getAttribute('style') || ''; d.innerHTML = c.innerHTML; slot.append(d); }
  });
  const once = {
    3: () => $('#wipe')?.dispatchEvent(new CustomEvent('sweep')),
    4: () => setTimeout(() => anchorDemo?.solve(), 350),
  };
  let cur = null;
  const setActive = n => {
    if (n === cur) return; cur = n;
    fw.classList.add('has-active');
    boxes.forEach(b => { const on = b.dataset.stage === n; b.classList.toggle('is-active', on); on ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'); });
    stages.forEach(st => {
      const on = st.dataset.stage === n; st.classList.toggle('is-active', on);
      if (on && !st.classList.contains('seen')) { st.classList.add('seen'); once[n]?.(); }
      $$('video.stagevid', st).forEach(v => {
        const shown = v.closest('[data-panel]') ? v.closest('[data-panel]').classList.contains('on') : true;
        if (on && shown && !reduced) { ensureSrc(v); v.play().catch(() => {}); } else v.pause();
      });
    });
  };
  const io = new IntersectionObserver(es => {
    es.forEach(e => { e.target._in = e.isIntersecting; });
    let act = null; stages.forEach(st => { if (st._in) act = st.dataset.stage; });
    if (act) setActive(act);
  }, { rootMargin: '-40% 0px -52% 0px', threshold: 0 });
  stages.forEach(st => io.observe(st));
  boxes.forEach(b => b.addEventListener('click', () => {
    const st = $(`#stage-${b.dataset.stage}`); if (!st) return;
    const y = $('h3', st).getBoundingClientRect().top + scrollY - 58 - 22;
    scrollTo({ top: Math.max(0, y), behavior: reduced ? 'auto' : 'smooth' });
  }));
  // a stage that is already on screen when it loads (or on narrow screens) counts as seen
  const seenIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && narrow.matches && !e.target.classList.contains('seen')) { e.target.classList.add('seen'); once[e.target.dataset.stage]?.(); }
  }), { threshold: .25 });
  stages.forEach(st => seenIO.observe(st));
  if (reduced) stages.forEach(st => st.classList.add('seen'));
}

/* ------------------------------------------------------------------ boot */
if (matchMedia('(max-width: 600px)').matches) $$('details.fallback-table').forEach(d => { d.open = true; });
renderMath();
segs();
initVideos();
initHero();
initNav();
initReveal();
initSynced();
initBaselines();
initPipeline3d();
initSources();
initCharts();
initWipe();
initHardware();
initOnOff();
initEmbodiments();
initBib();
initPipeline();
// the stage 4 widget is optional: if it fails, the rest of the page still boots
let anchorDemo = null;
try { anchorDemo = initAnchorDemo($('#anchor-demo')); } catch (err) { console.error(err); }
initMethod(anchorDemo);
initThumbs3d();
glassify();
