// Content tables for the interactive parts. Numbers are copied from the paper (Table 1, Vid-HACO table,
// appendix E); frame times are where the paper's hardware-figure stills sit in each clip.
const V = 'assets/video/', C = 'assets/img/cut/';
const fr = (task, ts) => ts.map((t, i) => ({ t, img: `${C}realworld/${task}_f${i + 1}.webp` }));

export const TASKS = [
  { key: 'cube', name: "Rubik's cube pick-up", hand: 'SHARPA Wave', video: `${V}realworld/cube_crop.mp4`, poster: `${V}realworld/cube_crop.jpg`, thumb: `${V}realworld/cube_crop.jpg`,
    frames: fr('cube', [0.50, 3.03, 5.22, 8.15]), demo: `${V}demos/cube.mp4`, demoSrc: 'Tactile glove',
    desc: 'A fingertip grasp lifts the cube and sets it back down.' },
  { key: 'cards', name: 'Card deck pick-up', hand: 'SHARPA Wave', video: `${V}realworld/cards_crop.mp4`, poster: `${V}realworld/cards_crop.jpg`, thumb: `${V}realworld/cards_crop.jpg`,
    frames: fr('cards', [0.50, 5.63, 33.50, 116.63]), demo: `${V}demos/cards.mp4`, demoSrc: 'Tactile glove',
    desc: 'The index finger presses on the top card, then thumb and index pinch it up and place it beside the deck, card after card.' },
  { key: 'marker', name: 'Marker pick-up', hand: 'SHARPA Wave', video: `${V}realworld/marker_crop.mp4`, poster: `${V}realworld/marker_crop.jpg`, thumb: `${V}realworld/marker_crop.jpg`,
    frames: fr('marker', [0.47, 6.22, 10.78, 13.95]), demo: `${V}demos/marker.mp4`, demoSrc: 'Tactile glove',
    desc: 'A pinch picks the marker up from the table into a pen-like grip.' },
  { key: 'mustard', name: 'Mustard palm grasp', hand: 'Wuji Hand 2', video: `${V}realworld/mustard_crop.mp4`, poster: `${V}realworld/mustard_crop.jpg`, thumb: `${V}realworld/mustard_crop.jpg`,
    frames: fr('mustard', [0.50, 5.58, 8.40, 11.52]), demo: `${V}demos/mustard.mp4`, demoSrc: 'Motion capture',
    desc: 'The whole hand wraps the soft bottle, tilts it cap-down and sets it upright.' },
  { key: 'cup', name: 'Cup pick-up', hand: 'Wuji Hand 2', video: `${V}realworld/cup_crop.mp4`, poster: `${V}realworld/cup_crop.jpg`, thumb: `${V}realworld/cup_crop.jpg`,
    frames: fr('cup', [0.50, 3.62, 5.23, 7.87]), demo: `${V}demos/cup.mp4`, demoSrc: 'Phone video',
    desc: 'The hand takes a thin plastic cup near the rim, lifts and tilts it, and puts it back.' },
  { key: 'tongs', name: 'Tong use', hand: 'Unitree Dex3-1', video: `${V}realworld/tongs_crop.mp4`, poster: `${V}realworld/tongs_crop.jpg`, thumb: `${V}realworld/tongs_crop.jpg`,
    frames: fr('tongs', [0.00, 2.28, 6.57, 7.90]), demo: `${V}far/human_demo_tongs_contact_mesh.mp4`, demoSrc: 'Phone video',
    desc: 'A three-finger hand squeezes the tongs shut and opens them.' },
];

export const HANDS = {
  sharpa: { name: 'SHARPA Wave', map: `${C}semantic/sharpa.webp`, real: { video: `${V}realworld/cube_crop.mp4`, label: "Rubik's cube pick-up" } },
  wuji: { name: 'Wuji Hand 2', map: `${C}semantic/wuji.webp`, real: { video: `${V}realworld/mustard_crop.mp4`, label: 'Mustard palm grasp' } },
  dex3: { name: 'Unitree Dex3-1', map: `${C}semantic/dex3.webp`, real: { video: `${V}realworld/tongs_crop.mp4`, label: 'Tong use' } },
  gripper: { name: 'Parallel-jaw gripper', map: `${C}semantic/gripper.webp`, real: null },
};

export const TILES = {
  video: [
    { label: 'Drill', frame: `${C}gallery/video_drill_frame.webp`, contact: `${C}gallery/video_drill_contact.webp` },
    { label: 'Spray bottle', frame: `${C}gallery/video_spray_frame.webp`, contact: `${C}gallery/video_spray_contact.webp` },
    { label: 'Mallet', frame: `${C}gallery/video_mallet_frame.webp`, contact: `${C}gallery/video_mallet_contact.webp` },
    { label: 'Can', frame: `${C}gallery/video_can_frame.webp`, contact: `${C}gallery/video_can_contact.webp` },
  ],
  glove: [
    { label: 'Cup', frame: `${C}gallery/glove_cup_frame.webp`, contact: `${C}gallery/glove_cup_contact.webp` },
    { label: "Rubik's cube", frame: `${C}gallery/glove_cube_frame.webp`, contact: `${C}gallery/glove_cube_contact.webp` },
    { label: 'Mustard', frame: `${C}gallery/glove_mustard_frame.webp`, contact: `${C}gallery/glove_mustard_contact.webp` },
    { label: 'Eraser', frame: `${C}gallery/glove_eraser_frame.webp`, contact: `${C}gallery/glove_eraser_contact.webp` },
  ],
  mocap: [
    { label: 'Power grasp', frame: `${C}gallery/mocap_power_frame.webp`, contact: `${C}gallery/mocap_power_contact.webp` },
    { label: 'Pinch at the cap', frame: `${C}gallery/mocap_pinch_frame.webp`, contact: `${C}gallery/mocap_pinch_contact.webp` },
    { label: 'Tripod', frame: `${C}gallery/mocap_tripod_frame.webp`, contact: `${C}gallery/mocap_tripod_contact.webp` },
    { label: 'Top grasp', frame: `${C}gallery/mocap_top_frame.webp`, contact: `${C}gallery/mocap_top_contact.webp` },
  ],
};

// hero montage: [t0, t1) in seconds of assets/video/hero/hero.mp4 (built by _work/scripts/hero_montage.py); task = TASKS key
// the label names and links to (its name and hand come from TASKS)
export const HERO_SEGMENTS = [
  { t0: 0, t1: 8.6, task: 'cards' },
  { t0: 8.6, t1: 17, task: 'cube' },
  { t0: 17, t1: 24.6, task: 'mustard' },
  { t0: 24.6, t1: 28, task: 'tongs' },
  { t0: 28, t1: 31.6, task: 'marker' },
  { t0: 31.6, t1: 99, task: 'cup' },
];

export const FIDELITY = {
  text: {
    force: {
      grasp: 'Three-finger grasp during the mustard-bottle pick-up replay, with step targets of 9.7, 7 and 2.6&nbsp;N (thumb, middle, index): the forces reach their set-points within a second of the step, the thumb overshoots while the bottle settles, and release returns every finger to zero within about a second.',
      periodic: 'Against a fixed object, the index finger follows a 0&ndash;4&nbsp;N periodic target: the measured force reaches the peaks within a few tenths of a newton and lags the target by about 0.2&nbsp;s. The floor near 0.5&nbsp;N is the preload kept while in contact.',
    },
  },
};

// interactive sim scenes, exported by _work/scripts/scene3d/ to assets/3d/scenes/<section>/<clip>_<variant>.json;
// a clip keeps its paper renders until it is listed here
export const SCENES = {
  baselines: ['hanger', 'cup'],
  crossemb: ['hammer', 'cube'],
  init: ['cup', 'hanger', 'can', 'cards', 'marker', 'bowl'],
  semantic: ['sharpa', 'wuji', 'dex3', 'gripper'],
  pipeline: ['unified_hand', 'unified_closeup'],
  thumbs: true,         // the framework diagram's sim thumbnails   // stage 2's figure; the other pipeline scenes open from the stage buttons
  // <source>_<object>, opened in the shared 3D dialog from the source tiles (mocap tiles also have <key>_frame: hand + object)
  gallery: ['video_drill', 'video_spray', 'video_mallet', 'video_can', 'glove_cup', 'glove_cube', 'glove_mustard', 'glove_eraser',
    'mocap_power', 'mocap_pinch', 'mocap_tripod', 'mocap_top'],
  galleryFrames: ['mocap_power', 'mocap_pinch', 'mocap_tripod', 'mocap_top'],
};
