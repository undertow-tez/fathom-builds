/*
 * mfSk8 — mfer skate prototype
 * THPS-style arcade skating starring an OG mfer (CC0).
 * three.js, no physics engine — analytic park surfaces for a tight arcade feel.
 *
 * Sections: CONFIG · INPUT · AUDIO · WORLD · SKATER · TRICKS/SCORE · HUD · LOOP
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================ CONFIG

const CFG = {
  runSeconds: 120,
  cruise: 8,          // auto-roll speed
  maxSpeed: 13.5,     // held-push speed
  accel: 7,
  turnRate: 2.3,      // rad/s on ground
  airSpin: 3.8,       // rad/s in air
  gravity: 13.5,
  ollieVy: 4.9,
  park: {
    x: 33, z: 20,           // half extents
    qp: { r: 3.6, zHalf: 16 },   // quarter pipes on +-x walls
    fun: { cx: 0, cz: -8, topY: 1.15, flatX: 5, kickL: 3.2, zHalf: 2.6 },
    rail: { z: 8, y: 0.62, xHalf: 9 },
  },
};
const QP_BASE = CFG.park.x - CFG.park.qp.r;

// LoFi dusk palette
const PAL = {
  skyTop: '#3b2d5e', skyMid: '#8a5a8f', skyLow: '#e8956d', sun: '#ffd9a0',
  fog: 0xc47c72, asphalt: 0x45405a, asphalt2: 0x3c3852,
  box: 0x6b5a7d, boxSide: 0x574a6b, coping: 0x0052ff, rail: 0x0052ff,
  silhouette: 0x2c2340, deck: 0x4a4a58, deckBelow: 0x0052ff,
  cream: '#fff3dd',
};

// ============================================================ INPUT

const input = { left: false, right: false, push: false, ollie: false, flip: false, shove: false, heel: false, grab: false };
const pressed = {}; // edge-triggered latches consumed by game logic
function latch(k) { if (!pressed[k]) { pressed[k] = true; input[k] = true; } }
function unlatch(k) { pressed[k] = false; input[k] = false; }

const KEYMAP = {
  ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
  ArrowUp: 'push', w: 'push', ' ': 'ollie',
  z: 'flip', x: 'shove', c: 'heel', v: 'grab',
};
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!k) return;
  e.preventDefault();
  if (k === 'left' || k === 'right' || k === 'push' || k === 'grab') input[k] = true; else latch(k);
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!k) return;
  if (k === 'left' || k === 'right' || k === 'push' || k === 'grab') input[k] = false; else unlatch(k);
});
function consume(k) { const v = input[k]; input[k] = false; return v; }

// ============================================================ AUDIO — generated lo-fi beat + SFX

const AudioSys = (() => {
  let ctx = null, master = null, muted = false, started = false;
  let rollGain = null, grindGain = null;

  function noiseBuffer(seconds = 1) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function start() {
    if (started) return; started = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);

    // --- continuous rolling noise (speed-driven)
    const nb = noiseBuffer(2);
    const roll = ctx.createBufferSource(); roll.buffer = nb; roll.loop = true;
    const rollF = ctx.createBiquadFilter(); rollF.type = 'lowpass'; rollF.frequency.value = 320;
    rollGain = ctx.createGain(); rollGain.gain.value = 0;
    roll.connect(rollF).connect(rollGain).connect(master); roll.start();

    // --- grind noise
    const gr = ctx.createBufferSource(); gr.buffer = nb; gr.loop = true;
    const grF = ctx.createBiquadFilter(); grF.type = 'bandpass'; grF.frequency.value = 2400; grF.Q.value = 2.5;
    grindGain = ctx.createGain(); grindGain.gain.value = 0;
    gr.connect(grF).connect(grindGain).connect(master); gr.start();

    // --- vinyl crackle
    const cr = ctx.createBufferSource(); cr.buffer = (() => {
      const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 0.6 : 0;
      return b;
    })(); cr.loop = true;
    const crG = ctx.createGain(); crG.gain.value = 0.11;
    cr.connect(crG).connect(master); cr.start();

    // --- lo-fi chord loop @ 72bpm
    const chords = [ // freqs: mellow ii-V-I-vi vibes
      [174.61, 220.0, 261.63, 329.63],  // Fmaj7
      [164.81, 196.0, 246.94, 329.63],  // Em7-ish
      [146.83, 174.61, 220.0, 293.66],  // Dm7
      [130.81, 164.81, 196.0, 246.94],  // Cmaj-ish
    ];
    const barLen = 60 / 72 * 4;
    let bar = 0, nextBar = ctx.currentTime + 0.1;
    function schedule() {
      while (nextBar < ctx.currentTime + 1.2) {
        const t = nextBar, chord = chords[bar % 4];
        for (const f of chord) {
          const o = ctx.createOscillator(); o.type = 'triangle';
          o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004); // wow/flutter
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.035, t + 0.4);
          g.gain.setValueAtTime(0.035, t + barLen - 0.9);
          g.gain.linearRampToValueAtTime(0, t + barLen - 0.05);
          o.connect(lp).connect(g).connect(master);
          o.start(t); o.stop(t + barLen);
        }
        for (let b8 = 0; b8 < 4; b8++) { // kick 1&3, hats offbeats
          const bt = t + b8 * barLen / 4;
          if (b8 % 2 === 0) kick(bt);
          hat(bt + barLen / 8);
        }
        bar++; nextBar += barLen;
      }
    }
    function kick(t) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.25);
    }
    function hat(t) {
      const s = ctx.createBufferSource(); s.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.06);
    }
    setInterval(schedule, 250); schedule();
  }

  function blip({ f0 = 500, f1 = 150, dur = 0.1, vol = 0.3, type = 'square' }) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    start,
    setRoll(v) { if (rollGain) rollGain.gain.value = muted ? 0 : v; },
    setGrind(v) { if (grindGain) grindGain.gain.value = muted ? 0 : v; },
    pop() { blip({ f0: 300, f1: 90, dur: 0.09, vol: 0.35, type: 'square' }); },
    land() { blip({ f0: 140, f1: 60, dur: 0.12, vol: 0.3, type: 'sine' }); },
    bank() { blip({ f0: 660, f1: 990, dur: 0.16, vol: 0.18, type: 'triangle' }); },
    bail() { blip({ f0: 220, f1: 40, dur: 0.4, vol: 0.4, type: 'sawtooth' }); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; return muted; },
  };
})();

// ============================================================ WORLD

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd98a70, 0.005);
{ // dusk gradient sky
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PAL.skyTop); grad.addColorStop(0.55, PAL.skyMid); grad.addColorStop(1, PAL.skyLow);
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 3, 10);

// lights — low warm sun + purple bounce
const hemi = new THREE.HemisphereLight(0xcaa0e8, 0x4a3d66, 1.45);
scene.add(hemi);
const fill = new THREE.DirectionalLight(0x9db4ff, 0.5); // cool fill from the dark side
fill.position.set(30, 18, -25);
scene.add(fill);
const sun = new THREE.DirectionalLight(0xffb87a, 1.6);
sun.position.set(-40, 22, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.far = 150;
scene.add(sun);

// sun disc on horizon
{
  const disc = new THREE.Mesh(new THREE.CircleGeometry(26, 40),
    new THREE.MeshBasicMaterial({ color: PAL.sun, fog: false, transparent: true, opacity: 0.9 }));
  disc.position.set(-190, 16, 120); disc.lookAt(0, 4, 0);
  scene.add(disc);
}

// ground with painted texture
function asphaltTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#45405a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  g.strokeStyle = 'rgba(255,240,210,0.08)'; g.lineWidth = 3;
  g.strokeRect(24, 24, 464, 464); // faint slab seams
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 6);
  return tex;
}
{
  const p = CFG.park;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(p.x * 2, p.z * 2),
    new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const apron = new THREE.Mesh( // dark surround out to horizon
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: PAL.asphalt2, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02;
  scene.add(apron);
}

// quarter pipes (visual mesh matches analytic profile)
function buildQuarterPipe(sideSign) {
  const { r, zHalf } = CFG.park.qp;
  const seg = 24, pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI / 2;              // 0=floor → π/2=vert
    pts.push(new THREE.Vector2(QP_BASE + Math.sin(a) * r, r - Math.cos(a) * r));
  }
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) shape.lineTo(p.x, p.y);
  shape.lineTo(CFG.park.x + 1.5, r); shape.lineTo(CFG.park.x + 1.5, 0); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: zHalf * 2, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: PAL.box, roughness: 0.9 }));
  mesh.rotation.x = 0; mesh.position.z = -zHalf;
  const grp = new THREE.Group();
  grp.add(mesh);
  // Base-blue coping pipe along the lip
  const coping = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, zHalf * 2, 10),
    new THREE.MeshStandardMaterial({ color: PAL.coping, roughness: 0.35, metalness: 0.5 }));
  coping.rotation.x = Math.PI / 2;
  coping.position.set(QP_BASE + r, r, 0);
  grp.add(coping);
  grp.scale.x = sideSign;
  grp.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  scene.add(grp);
}
buildQuarterPipe(1); buildQuarterPipe(-1);

// funbox with kickers + graffiti
function labelTexture(text, sub, w = 512, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#574a6b'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,243,221,0.9)';
  g.font = `bold ${h * 0.42}px ui-rounded, "Comic Sans MS", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h * (sub ? 0.38 : 0.5));
  if (sub) { g.font = `bold ${h * 0.16}px ui-rounded, sans-serif`; g.fillStyle = '#0052FF'; g.fillText(sub, w / 2, h * 0.75); }
  return new THREE.CanvasTexture(c);
}
{
  const f = CFG.park.fun;
  const grp = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color: PAL.box, roughness: 0.9 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(f.flatX * 2, f.topY, f.zHalf * 2), boxMat);
  box.position.set(f.cx, f.topY / 2, f.cz);
  grp.add(box);
  // graffiti on the long faces
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(f.flatX * 2 - 0.6, f.topY - 0.16),
    new THREE.MeshBasicMaterial({ map: labelTexture('mfers', 'we all mfers') }));
  tag.position.set(f.cx, f.topY / 2, f.cz + f.zHalf + 0.01);
  grp.add(tag);
  const tag2 = tag.clone(); tag2.rotation.y = Math.PI; tag2.position.z = f.cz - f.zHalf - 0.01;
  grp.add(tag2);
  for (const s of [1, -1]) { // kicker wedges
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(f.kickL, 0); shape.lineTo(f.kickL, f.topY); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: f.zHalf * 2, bevelEnabled: false });
    const wedge = new THREE.Mesh(geo, boxMat);
    wedge.scale.x = -s;
    wedge.position.set(f.cx + s * (f.flatX + f.kickL), 0, f.cz - f.zHalf);
    grp.add(wedge);
  }
  grp.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  scene.add(grp);
}

// grind rail
{
  const r = CFG.park.rail;
  const mat = new THREE.MeshStandardMaterial({ color: PAL.rail, roughness: 0.3, metalness: 0.6 });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, r.xHalf * 2, 12), mat);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, r.y, r.z);
  pipe.castShadow = true;
  scene.add(pipe);
  for (const px of [-r.xHalf + 0.4, 0, r.xHalf - 0.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, r.y, 8), mat);
    post.position.set(px, r.y / 2, r.z);
    post.castShadow = true;
    scene.add(post);
  }
}

// scenery: palm silhouettes, skyline, gm sign
function palm(x, z, s = 1) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: PAL.silhouette });
  let y = 0, lean = 0;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.19 - i * 0.02, 1.6), mat);
    lean += 0.06;
    seg.position.set(lean * i * 0.6, y + 0.8, 0); seg.rotation.z = -lean;
    grp.add(seg); y += 1.5;
  }
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), mat);
    frond.position.set(lean * 2.2, y + 0.55, 0);
    frond.rotation.set(Math.random() * 0.6 - 0.3, (i / 7) * Math.PI * 2, 0.5 + Math.random() * 0.4);
    grp.add(frond);
  }
  grp.position.set(x, 0, z); grp.scale.setScalar(s);
  scene.add(grp);
}
palm(-38, -14, 1.2); palm(-40, 6, 1); palm(38, 12, 1.1); palm(39, -8, 0.95); palm(-20, 26, 1.15); palm(18, 25, 1);
{ // distant skyline
  const mat = new THREE.MeshBasicMaterial({ color: 0x35304a });
  for (let i = 0; i < 26; i++) {
    const w = 6 + Math.random() * 10, h = 8 + Math.random() * 26;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), mat);
    const ang = Math.random() * Math.PI * 2, dist = 130 + Math.random() * 60;
    b.position.set(Math.cos(ang) * dist, h / 2, Math.sin(ang) * dist);
    scene.add(b);
  }
}
{ // gm neon billboard
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#1c1830'; g.fillRect(0, 0, 256, 160);
  g.shadowColor = '#7fffcf'; g.shadowBlur = 24;
  g.fillStyle = '#a8ffdd'; g.font = 'bold 96px ui-rounded, "Comic Sans MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('gm', 128, 84);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.75),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
  sign.position.set(10, 5.4, -26); sign.rotation.y = -0.25;
  scene.add(sign);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4),
    new THREE.MeshBasicMaterial({ color: PAL.silhouette }));
  pole.position.set(10, 2.7, -26.2);
  scene.add(pole);
}

// ---------- park height field ----------
function surfaceHeight(x, z) {
  const p = CFG.park;
  // quarter pipes
  if (Math.abs(z) <= p.qp.zHalf) {
    const d = Math.abs(x) - QP_BASE;
    if (d > 0) {
      const dd = Math.min(d, p.qp.r - 0.001);
      return p.qp.r - Math.sqrt(p.qp.r * p.qp.r - dd * dd);
    }
  }
  // funbox
  const f = p.fun;
  const lx = x - f.cx, lz = z - f.cz;
  if (Math.abs(lz) <= f.zHalf) {
    const ax = Math.abs(lx);
    if (ax <= f.flatX) return f.topY;
    if (ax <= f.flatX + f.kickL) {
      const t = 1 - (ax - f.flatX) / f.kickL;   // 1 at box edge → 0 at ground
      return f.topY * t * t;                     // quadratic: pops at the top
    }
  }
  return 0;
}
function inQP(x, z) {
  return Math.abs(z) <= CFG.park.qp.zHalf && Math.abs(x) > QP_BASE;
}

// ============================================================ SKATER

const skater = new THREE.Group();  // origin at board contact point
scene.add(skater);

// -- board built from primitives
const board = new THREE.Group();
const boardSpin = new THREE.Group();   // trick rotations happen here
{
  const deckMat = new THREE.MeshStandardMaterial({ color: PAL.deck, roughness: 0.7 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x18181d, roughness: 1 });
  const belowMat = new THREE.MeshStandardMaterial({ color: PAL.deckBelow, roughness: 0.5 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.018, 0.8), deckMat);
  deck.position.y = 0.1;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.004, 0.79), gripMat);
  grip.position.y = 0.112;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.72), belowMat);
  belly.position.y = 0.089;
  boardSpin.add(deck, grip, belly);
  for (const zs of [1, -1]) { // kicked nose/tail
    const kick = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.016, 0.16), deckMat);
    kick.position.set(0, 0.115, zs * 0.45); kick.rotation.x = -zs * 0.45;
    boardSpin.add(kick);
  }
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0xf7e6c0, roughness: 0.4 });
  for (const zs of [0.26, -0.26]) for (const xs of [0.09, -0.09]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.032, 12), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(xs, 0.036, zs);
    boardSpin.add(w);
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.4 }));
    truck.position.set(xs * 0.6, 0.07, zs); boardSpin.add(truck);
  }
  boardSpin.traverse((o) => { o.castShadow = true; });
  board.scale.setScalar(1.18); // reads better at gameplay camera distance
  board.add(boardSpin);
  skater.add(board);
}

// -- character (GLB) with hand-posed skate stance
const charGroup = new THREE.Group();
charGroup.position.y = 0.115;               // feet on deck
charGroup.rotation.y = -Math.PI / 2 + 0.55; // regular stance across the board
skater.add(charGroup);
const charLean = new THREE.Group();          // lean/tuck applied here
charGroup.add(charLean);

const bones = {}; const restQ = {};
let modelReady = false;

function boneKey(name) {
  return name.replace(/^mixamorig[:]?/i, '').replace(/[^A-Za-z0-9_]/g, '');
}
function setPose(name, x = 0, y = 0, z = 0) {
  const b = bones[name];
  if (!b) return;
  b.quaternion.copy(restQ[name]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
}

function loadModel() {
  const loader = new GLTFLoader();
  const done = (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
      if (o.isBone) { const k = boneKey(o.name); bones[k] = o; restQ[k] = o.quaternion.clone(); }
    });
    // normalize height to 1.5m, feet at y=0
    const bb = new THREE.Box3().setFromObject(model);
    const h = bb.max.y - bb.min.y;
    const s = 1.5 / h;
    model.scale.setScalar(s);
    bb.setFromObject(model);
    model.position.y = -bb.min.y;
    model.position.x = -(bb.min.x + bb.max.x) / 2;
    model.position.z = -(bb.min.z + bb.max.z) / 2;
    charLean.add(model);
    modelReady = true;
  };
  if (window.MFER_GLB_B64) {
    const bin = atob(window.MFER_GLB_B64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    loader.parse(buf.buffer, '', done, (e) => console.error('GLB parse', e));
  } else {
    loader.load('assets/mfer.glb', done, undefined, (e) => console.error('GLB load', e));
  }
}
loadModel();

// stance + dynamic pose applied every frame
function poseCharacter(dt) {
  if (!modelReady) return;
  const crouchT = pose.crouch;             // 0 standing … 1 deep tuck
  const grabT = pose.grab;
  const lean = pose.lean;

  setPose('Hips', 0.18 + crouchT * 0.5, 0, 0);
  bones.Hips && (bones.Hips.position.y = restHipsY - crouchT * 22);
  setPose('Spine', 0.1 + crouchT * 0.25, -0.15, lean * 0.25);
  setPose('Spine1', 0.06 + crouchT * 0.15, -0.1, lean * 0.2);
  setPose('Spine2', 0.05, -0.1, lean * 0.15);
  setPose('Neck', -0.15 - crouchT * 0.2, 0.35, 0);
  setPose('Head', -0.08, 0.25, 0);
  // legs: knees bend with crouch
  setPose('LeftUpLeg', -(0.35 + crouchT * 0.85), 0.15, 0.3);
  setPose('LeftLeg', 0.55 + crouchT * 1.15, 0, 0);
  setPose('LeftFoot', -(0.28 + crouchT * 0.35), -0.2, -0.15);
  setPose('RightUpLeg', -(0.3 + crouchT * 0.8), -0.2, -0.3);
  setPose('RightLeg', 0.5 + crouchT * 1.1, 0, 0);
  setPose('RightFoot', -(0.25 + crouchT * 0.3), 0.25, 0.15);
  // arms: rest pose already hangs relaxed — just add drift/balance + grab reach
  const swing = Math.min(1, state.speed / CFG.maxSpeed) * 0.2;
  setPose('LeftShoulder', 0, 0, 0.05);
  setPose('LeftArm', 0.1 + swing + crouchT * 0.3, 0.1, 0.25);
  setPose('LeftForeArm', -0.2 - grabT * 0.5, 0.2, 0);
  setPose('RightShoulder', 0, 0, -0.05);
  setPose('RightArm', 0.1 + swing + crouchT * 0.3, -0.1, -0.25 + grabT * 1.2);
  setPose('RightForeArm', -0.2, -0.2 - grabT * 0.6, 0);

  charLean.rotation.z = lean * 0.28;
  charLean.rotation.x = pose.pitch;

  // self-correcting foot plant: steer the feet midpoint onto the deck center,
  // whatever the armature origin or pose — converges in a few frames
  const model = charLean.children[0];
  if (model && bones.LeftFoot && bones.RightFoot) {
    charGroup.updateWorldMatrix(true, true);
    const wp = new THREE.Vector3();
    const mid = new THREE.Vector3();
    let minY = Infinity, n = 0;
    for (const k of ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot']) {
      if (!bones[k]) continue;
      bones[k].getWorldPosition(wp);
      const lp = skater.worldToLocal(wp.clone());
      minY = Math.min(minY, lp.y);
      mid.add(lp); n++;
    }
    if (n) {
      mid.divideScalar(n);
      // correction computed in skater space → re-express in the model's parent space
      const corr = new THREE.Vector3(-mid.x * 0.5, (0.13 - minY) * 0.6, -mid.z * 0.5);
      corr.applyQuaternion(skater.getWorldQuaternion(new THREE.Quaternion()));
      corr.applyQuaternion(charLean.getWorldQuaternion(new THREE.Quaternion()).invert());
      model.position.add(corr);
    }
  }
}
let restHipsY = 0;
const _hipInit = setInterval(() => {
  if (bones.Hips) { restHipsY = bones.Hips.position.y; clearInterval(_hipInit); }
}, 100);

const pose = { crouch: 0.25, grab: 0, lean: 0, pitch: 0 };

// ============================================================ GAME STATE / PHYSICS

const state = {
  mode: 'title',            // title | play | over
  phase: 'ground',          // ground | air | grind | bail
  pos: new THREE.Vector3(0, 0, 14),
  heading: Math.PI,         // facing -z toward park center
  speed: CFG.cruise,
  vy: 0,
  timeLeft: CFG.runSeconds,
  score: 0,
  best: +(localStorage.getItem('mfsk8_best') || 0),
  special: 0,
  diamond: false,           // diamond-hands grind active
  // combo
  combo: [],                // [{name, pts}]
  spinAccum: 0,
  grabHeld: 0,
  flipT: 1, flipKind: null, // board trick anim progress
  bailT: 0,
  grindCooldown: 0,
  lastGrindTick: 0,
};

function forward() {
  return new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading));
}

function startRun() {
  state.mode = 'play';
  state.phase = 'ground';
  state.pos.set(0, 0, 14);
  state.heading = Math.PI;
  state.speed = CFG.cruise;
  state.vy = 0; state.timeLeft = CFG.runSeconds;
  state.score = 0; state.special = 0; state.combo = [];
  state.flipT = 1; state.spinAccum = 0; state.diamond = false;
  HUD.overlay(null);
  HUD.sync();
}

// ---------- tricks / combo ----------
const FLIPS = {
  flip: { name: 'Kickflip', pts: 100, axis: 'z', dir: 1 },
  heel: { name: 'Heelflip', pts: 120, axis: 'z', dir: -1 },
  shove: { name: 'Pop Shove-it', pts: 80, axis: 'y', dir: 1 },
};

function addTrick(name, pts) {
  state.combo.push({ name, pts });
  HUD.combo();
}

function tryFlip(kind) {
  if (state.flipT < 1) return;               // one at a time
  const f = FLIPS[kind];
  state.flipT = 0; state.flipKind = kind;
  addTrick(f.name, f.pts);
  AudioSys.pop();
}

function bankCombo() {
  if (!state.combo.length) { state.spinAccum = 0; return; }
  // spins become a trick on landing
  const spins = Math.floor(state.spinAccum / Math.PI + 0.15);
  if (spins >= 1) state.combo.push({ name: `${spins * 180}`, pts: 75 * spins });
  const sum = state.combo.reduce((a, t) => a + t.pts, 0);
  const mult = state.combo.length;
  const total = sum * mult;
  state.score += total;
  state.special = Math.min(100, state.special + total / 40);
  HUD.banked(total, mult);
  AudioSys.bank();
  state.combo = []; state.spinAccum = 0;
}

function bail() {
  state.phase = 'bail';
  state.bailT = 0;
  state.combo = []; state.spinAccum = 0;
  state.flipT = 1; state.diamond = false;
  HUD.bailed();
  AudioSys.bail();
}

// ---------- main physics step ----------
function step(dt) {
  const p = CFG.park;
  if (state.mode !== 'play') return;

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) { endRun(); return; }
  state.grindCooldown = Math.max(0, state.grindCooldown - dt);

  // board trick animation
  if (state.flipT < 1) {
    state.flipT = Math.min(1, state.flipT + dt / 0.38);
    const f = FLIPS[state.flipKind];
    const ang = state.flipT * Math.PI * 2 * f.dir;
    boardSpin.rotation.set(0, f.axis === 'y' ? ang : 0, f.axis === 'z' ? ang : 0);
    if (state.flipT >= 1) boardSpin.rotation.set(0, 0, 0);
  }

  if (state.phase === 'bail') {
    state.bailT += dt;
    state.speed = Math.max(0, state.speed - 8 * dt);
    state.pos.addScaledVector(forward(), state.speed * dt);
    pose.pitch = Math.min(1.4, state.bailT * 6);
    pose.crouch = 0.1;
    if (state.bailT > 1.1) {
      state.phase = 'ground'; pose.pitch = 0; state.speed = CFG.cruise * 0.5;
    }
    return;
  }

  // steering
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (state.phase === 'ground') {
    const grip = Math.min(1, state.speed / 4);
    state.heading += steer * CFG.turnRate * grip * dt;
    pose.lean += (steer * 0.9 - pose.lean) * Math.min(1, dt * 8);
  } else if (state.phase === 'air') {
    state.heading += steer * CFG.airSpin * dt;
    state.spinAccum += Math.abs(steer * CFG.airSpin * dt);
    pose.lean += (steer * 0.5 - pose.lean) * Math.min(1, dt * 8);
  }

  // grab
  if (state.phase === 'air' && input.grab) {
    state.grabHeld += dt;
    pose.grab += (1 - pose.grab) * Math.min(1, dt * 10);
    if (state.grabHeld > 0.35 && !state.combo.some((t) => t.name.startsWith('Melon'))) {
      addTrick('Melon', 60);
    } else if (state.grabHeld > 0.35) {
      const t = state.combo.find((x) => x.name.startsWith('Melon'));
      t.pts = Math.round(60 + (state.grabHeld - 0.35) * 45);
    }
  } else {
    if (state.phase !== 'air') state.grabHeld = 0;
    pose.grab += (0 - pose.grab) * Math.min(1, dt * 10);
  }

  // ================= GROUND =================
  if (state.phase === 'ground') {
    // speed: auto-roll toward cruise, push toward max
    if (input.push) state.speed = Math.min(CFG.maxSpeed, state.speed + CFG.accel * dt);
    else state.speed += (CFG.cruise - state.speed) * 0.4 * dt;

    const fw = forward();
    const wasQP = inQP(state.pos.x, state.pos.z);

    // quarter-pipe energy: climbing costs speed, descending returns it
    if (wasQP) {
      const outward = Math.sign(state.pos.x) * fw.x > 0;
      const d = Math.min(Math.abs(state.pos.x) - QP_BASE, p.qp.r - 0.05);
      const slope = d / Math.sqrt(p.qp.r * p.qp.r - d * d);
      const dv = CFG.gravity * Math.min(slope, 3) * Math.abs(fw.x) * dt;
      if (outward) {
        state.speed -= dv;
        if (state.speed < 1.4) { // stall → roll back in
          state.heading = Math.atan2(fw.x * -1, fw.z);
          state.speed = 1.6;
        } else if (d >= p.qp.r - 0.12 && state.speed > 2.5) {
          // launch! vert air
          state.phase = 'air';
          state.vy = state.speed * 0.95;
          state.speed = 0.6;
          state.pos.y = surfaceHeight(state.pos.x, state.pos.z);
          AudioSys.pop();
        }
      } else {
        state.speed += dv;
      }
    }

    const prevH = surfaceHeight(state.pos.x, state.pos.z);
    state.pos.addScaledVector(fw, state.speed * dt);
    clampToPark();
    const hNow = surfaceHeight(state.pos.x, state.pos.z);

    if (hNow < prevH - 0.35) {
      // rode off an edge → airborne, keep momentum (no pop)
      state.phase = 'air';
      state.vy = 0;
      state.pos.y = prevH;
    } else {
      state.pos.y = hNow;
      // slope launch bonus stored for ollie
      state._slopeVy = Math.max(0, (hNow - prevH) / dt * 0.55);
    }

    // ollie
    if (consume('ollie')) {
      state.phase = 'air';
      state.vy = CFG.ollieVy + Math.min(4, state._slopeVy || 0);
      AudioSys.pop();
    }
    // queued flip buttons on ground do nothing (need air)
    consume('flip'); consume('shove'); consume('heel');
    pose.crouch += ((input.push ? 0.45 : 0.25) - pose.crouch) * Math.min(1, dt * 6);
  }

  // ================= AIR =================
  else if (state.phase === 'air') {
    if (consume('flip')) tryFlip('flip');
    if (consume('shove')) tryFlip('shove');
    if (consume('heel')) tryFlip('heel');
    consume('ollie');

    state.vy -= CFG.gravity * dt;
    state.pos.y += state.vy * dt;
    state.pos.addScaledVector(forward(), state.speed * dt);
    clampToPark();
    pose.crouch += (0.65 - pose.crouch) * Math.min(1, dt * 8);

    // grind capture
    const r = p.rail;
    if (state.vy < 0.5 && state.grindCooldown <= 0 &&
        Math.abs(state.pos.z - r.z) < 0.7 && Math.abs(state.pos.x) < r.xHalf &&
        state.pos.y > r.y - 0.15 && state.pos.y < r.y + 1.1) {
      startGrind();
      return;
    }

    // landing
    const h = surfaceHeight(state.pos.x, state.pos.z);
    if (state.pos.y <= h) {
      state.pos.y = h;
      const sketchy = state.flipT < 0.85;
      if (inQP(state.pos.x, state.pos.z)) {
        // vert landing: point back into the park, convert fall into roll speed
        state.heading = state.pos.x > 0 ? -Math.PI / 2 : Math.PI / 2; // inward; steering refines it
        state.speed = Math.max(5, Math.abs(state.vy) * 0.85);
      }
      state.vy = 0;
      if (sketchy) { bail(); return; }
      state.phase = 'ground';
      bankCombo();
      AudioSys.land();
    }
  }

  // ================= GRIND =================
  else if (state.phase === 'grind') {
    const r = p.rail;
    const dir = Math.sign(Math.sin(state.heading)) || 1;
    state.pos.x += dir * state.speed * dt;
    state.pos.y = r.y + 0.02;
    state.pos.z = r.z;
    state.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    pose.crouch += (0.5 - pose.crouch) * Math.min(1, dt * 8);

    // points tick into the grind trick entry
    state.lastGrindTick += dt;
    const rate = state.diamond ? 3 : 1;
    if (state.lastGrindTick > 0.25) {
      state.lastGrindTick = 0;
      const t = state.combo[state.combo.length - 1];
      t.pts += 8 * rate;
      HUD.combo();
    }
    if (state.diamond) state.special = Math.max(0, state.special - 25 * dt);
    if (state.diamond && state.special <= 0) state.diamond = false;

    const hop = consume('ollie');
    if (hop || Math.abs(state.pos.x) >= r.xHalf) {
      // hop off the rail
      state.phase = 'air';
      state.vy = hop ? 2.8 : 1.6;
      state.grindCooldown = 0.35;
      state.diamond = false;
      AudioSys.pop();
    }
    consume('flip'); consume('shove'); consume('heel');
  }

  // pitch follows vertical motion for style
  if (state.phase === 'air') pose.pitch = THREE.MathUtils.clamp(-state.vy * 0.04, -0.3, 0.35);
  else if (state.phase !== 'bail') pose.pitch *= 0.85;
}

function startGrind() {
  state.phase = 'grind';
  state.vy = 0;
  state.speed = Math.max(4.5, state.speed);
  state.diamond = state.special >= 99.5;
  const name = state.diamond ? 'DIAMOND HANDS 50-50' : '50-50 Grind';
  addTrick(name, state.diamond ? 100 : 40);
  state.lastGrindTick = 0;
  AudioSys.pop();
}

function clampToPark() {
  const p = CFG.park;
  const m = 0.4;
  state.pos.x = THREE.MathUtils.clamp(state.pos.x, -p.x + m, p.x - m);
  state.pos.z = THREE.MathUtils.clamp(state.pos.z, -p.z + m, p.z - m);
}

function endRun() {
  state.mode = 'over';
  bankCombo();
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('mfsk8_best', String(state.best));
  }
  HUD.gameOver();
}

// ============================================================ HUD (DOM)

const HUD = (() => {
  const css = document.createElement('style');
  css.textContent = `
    html,body{margin:0;height:100%;overflow:hidden;background:#2b2440;
      font-family:ui-rounded,'Segoe UI',system-ui,sans-serif;-webkit-user-select:none;user-select:none}
    canvas{display:block}
    #hud{position:fixed;inset:0;pointer-events:none;color:${PAL.cream};
      text-shadow:0 2px 8px rgba(30,20,50,.6)}
    #score{position:absolute;top:14px;left:18px;font-size:clamp(22px,4vw,34px);font-weight:800}
    #timer{position:absolute;top:14px;right:18px;font-size:clamp(22px,4vw,34px);font-weight:800;
      font-variant-numeric:tabular-nums}
    #combo{position:absolute;bottom:96px;left:0;right:0;text-align:center;
      font-size:clamp(15px,2.6vw,22px);font-weight:700;min-height:1.4em;opacity:.95}
    #special{position:absolute;bottom:74px;left:50%;transform:translateX(-50%);
      width:min(320px,60vw);height:10px;border-radius:6px;background:rgba(255,243,221,.18);overflow:hidden}
    #specialFill{height:100%;width:0%;border-radius:6px;background:linear-gradient(90deg,#0052ff,#7fffcf);
      transition:width .15s}
    #special.full #specialFill{background:linear-gradient(90deg,#ffd700,#fff3aa);
      animation:pulse .5s infinite alternate}
    @keyframes pulse{from{filter:brightness(1)}to{filter:brightness(1.5)}}
    .pop{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);
      font-size:clamp(26px,5vw,44px);font-weight:900;animation:popup 1.1s ease-out forwards;white-space:nowrap}
    @keyframes popup{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}
      15%{opacity:1;transform:translate(-50%,-50%) scale(1.12)}
      70%{opacity:1;transform:translate(-50%,-60%) scale(1)}
      100%{opacity:0;transform:translate(-50%,-90%) scale(.95)}}
    .overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:rgba(35,26,58,.78);backdrop-filter:blur(6px);pointer-events:auto;text-align:center;padding:20px}
    .overlay h1{font-size:clamp(40px,9vw,84px);margin:0 0 6px;font-weight:900;letter-spacing:-.02em}
    .overlay h1 .mf{color:#7fffcf}
    .overlay p{margin:.35em 0;font-size:clamp(14px,2.4vw,19px);opacity:.92;line-height:1.5}
    .overlay .keys{opacity:.75;font-size:clamp(12px,2vw,15px)}
    .overlay button{margin-top:22px;pointer-events:auto;font:inherit;font-weight:800;
      font-size:clamp(18px,3vw,24px);padding:.6em 2.2em;border-radius:999px;border:none;cursor:pointer;
      background:linear-gradient(135deg,#0052ff,#7fffcf);color:#14102a;box-shadow:0 6px 30px rgba(0,82,255,.45)}
    #touch{position:fixed;inset:0;pointer-events:none;display:none}
    #touch.on{display:block}
    .tbtn{position:absolute;pointer-events:auto;width:70px;height:70px;border-radius:50%;
      background:rgba(255,243,221,.14);border:2px solid rgba(255,243,221,.35);color:${PAL.cream};
      font:800 13px ui-rounded,system-ui;display:flex;align-items:center;justify-content:center;
      -webkit-tap-highlight-color:transparent}
    .tbtn:active{background:rgba(255,243,221,.3)}
    #muteBtn{position:absolute;top:60px;right:18px;pointer-events:auto;background:none;border:none;
      font-size:22px;cursor:pointer;opacity:.8}
  `;
  document.head.appendChild(css);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="score">0</div>
    <div id="timer">2:00</div>
    <button id="muteBtn">🔊</button>
    <div id="combo"></div>
    <div id="special"><div id="specialFill"></div></div>
    <div id="touch">
      <button class="tbtn" style="left:16px;bottom:110px">◀</button>
      <button class="tbtn" style="left:100px;bottom:110px">▶</button>
      <button class="tbtn" style="left:58px;bottom:190px">PUSH</button>
      <button class="tbtn" style="right:16px;bottom:190px">OLLIE</button>
      <button class="tbtn" style="right:100px;bottom:110px">FLIP</button>
      <button class="tbtn" style="right:16px;bottom:110px">GRAB</button>
    </div>`;
  document.body.appendChild(hud);
  const $ = (id) => document.getElementById(id);

  // touch bindings
  const tb = hud.querySelectorAll('.tbtn');
  const tmap = ['left', 'right', 'push', 'ollie', 'flip', 'grab'];
  tb.forEach((b, i) => {
    const k = tmap[i];
    const down = (e) => { e.preventDefault(); if (k === 'ollie' || k === 'flip') latch(k); else input[k] = true; };
    const up = (e) => { e.preventDefault(); if (k === 'ollie' || k === 'flip') unlatch(k); else input[k] = false; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  });
  if (matchMedia('(pointer:coarse)').matches) $('touch').classList.add('on');

  $('muteBtn').addEventListener('click', () => {
    $('muteBtn').textContent = AudioSys.toggleMute() ? '🔇' : '🔊';
  });

  let overlayEl = null;
  function overlay(html) {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (!html) return;
    overlayEl = document.createElement('div');
    overlayEl.className = 'overlay';
    overlayEl.innerHTML = html;
    hud.appendChild(overlayEl);
    const btn = overlayEl.querySelector('button');
    if (btn) btn.addEventListener('click', () => { AudioSys.start(); startRun(); });
  }

  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function comboText() {
    if (!state.combo.length) return '';
    const names = state.combo.map((t) => t.name).join(' + ');
    const sum = state.combo.reduce((a, t) => a + t.pts, 0);
    return `${names}  ·  ${sum} × ${state.combo.length}`;
  }

  return {
    overlay,
    sync() {
      $('score').textContent = state.score.toLocaleString();
      $('timer').textContent = fmtTime(state.timeLeft);
      $('specialFill').style.width = `${state.special}%`;
      $('special').classList.toggle('full', state.special >= 99.5);
      $('combo').textContent = comboText();
    },
    combo() { $('combo').textContent = comboText(); },
    banked(total, mult) {
      const d = document.createElement('div');
      d.className = 'pop';
      d.textContent = `+${total.toLocaleString()}${mult > 1 ? `  (x${mult})` : ''}`;
      d.style.color = '#a8ffdd';
      hud.appendChild(d); setTimeout(() => d.remove(), 1150);
      $('combo').textContent = '';
    },
    bailed() {
      const d = document.createElement('div');
      d.className = 'pop';
      d.textContent = Math.random() < 0.25 ? 'PAPER HANDS' : 'BAILED';
      d.style.color = '#ff7a7a';
      hud.appendChild(d); setTimeout(() => d.remove(), 1150);
      $('combo').textContent = '';
    },
    title() {
      overlay(`
        <h1>mf<span class="mf">Sk8</span></h1>
        <p>a lo-fi skate prototype starring an OG mfer · CC0</p>
        <p class="keys">🛹 auto-rolls — ◀▶ steer · SPACE ollie · Z kickflip · X shove-it · C heelflip · hold V grab<br>
        hold ▲ to push · land on the blue rail to grind · fill the meter for DIAMOND HANDS grinds<br>
        land clean to bank the combo — bail and you lose it</p>
        <button>SKATE</button>`);
    },
    gameOver() {
      const nb = state.score >= state.best && state.score > 0;
      overlay(`
        <h1>gn.</h1>
        <p style="font-size:clamp(24px,5vw,40px);font-weight:900">${state.score.toLocaleString()} pts</p>
        <p>${nb ? '🏆 new personal best' : `best: ${state.best.toLocaleString()}`}</p>
        <button>RUN IT BACK</button>`);
    },
  };
})();

HUD.title();

// ============================================================ CAMERA + LOOP

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 4, 22);

function updateCamera(dt) {
  if (window.__POSECAM) { // debug close-up for pose tuning
    camera.position.set(state.pos.x + 2.6, state.pos.y + 1.6, state.pos.z + 2.6);
    camera.lookAt(state.pos.x, state.pos.y + 0.8, state.pos.z);
    return;
  }
  const fw = forward();
  const back = state.phase === 'grind' ? 5.2 : 6.2;
  const up = state.phase === 'air' ? 2.2 : 2.7;
  const ideal = new THREE.Vector3()
    .copy(state.pos)
    .addScaledVector(fw, -back)
    .add(new THREE.Vector3(0, up + state.pos.y * 0.25, 0));
  const k = 1 - Math.exp(-5.5 * dt);
  camPos.lerp(ideal, k);
  camera.position.copy(camPos);
  camTarget.lerp(new THREE.Vector3().copy(state.pos).addScaledVector(fw, 2.5).add(new THREE.Vector3(0, 1.1, 0)), k * 1.4);
  camera.lookAt(camTarget);
  camera.fov += ((state.speed > 11 ? 72 : 65) - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  step(dt);

  // sync visuals
  skater.position.copy(state.pos);
  skater.rotation.y = state.heading;
  if (state.phase === 'bail' && modelReady) {
    charLean.rotation.x = pose.pitch;
  }
  // board tilts on quarter pipe surface
  if (state.phase === 'ground' && inQP(state.pos.x, state.pos.z)) {
    const d = Math.abs(state.pos.x) - QP_BASE;
    const slope = Math.atan2(d, Math.sqrt(Math.max(0.01, CFG.park.qp.r ** 2 - d * d)));
    board.rotation.x = -slope * Math.sign(Math.cos(state.heading)) * Math.sign(state.pos.x) * Math.sign(Math.sin(state.heading) * state.pos.x || 1);
    board.rotation.x = THREE.MathUtils.clamp(board.rotation.x, -1.2, 1.2);
  } else {
    board.rotation.x *= 0.8;
  }
  poseCharacter(dt);

  // audio follows state
  AudioSys.setRoll(state.phase === 'ground' && state.mode === 'play' ? Math.min(0.25, state.speed / 45) : 0);
  AudioSys.setGrind(state.phase === 'grind' ? 0.18 : 0);

  if (state.mode === 'play') HUD.sync();
  updateCamera(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// debug handle for automated tests
window.__mf = { state, pose, bones, startRun };
