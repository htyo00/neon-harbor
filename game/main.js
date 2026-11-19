// NEON HARBOR — a neon-noir open-world crime game in the browser.
// Original fiction: Rook, a driver-for-hire, climbs the harbor underworld
// of a coastal city policed by the NHPD. Built fresh for make.fun gta6-01.
// Three.js is vendored locally (game/three.module.js); everything below is
// the game's own logic: city, driving, police, missions, shooting, garage,
// radio, respect, saves, and the screenshot staging modes (?shot=).
import * as THREE from './three.module.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- data
const NPCS = {
  ROOK: { name: 'ROOK', role: 'You · Driver', color: '#ff5da2', init: 'R' },
  VERA: { name: 'VERA', role: 'Fixer', color: '#7b5cff', init: 'V' },
  DIAL: { name: 'DETECTIVE DIAL', role: 'NHPD Dispatch', color: '#37b6e0', init: 'D' },
  MARROW: { name: 'MARROW', role: 'Dockside Boss', color: '#ff9f43', init: 'M' },
  GREASE: { name: 'GREASE', role: 'Garage Owner', color: '#37e08b', init: 'G' },
};
const RANKS = [[0, 'ROOKIE'], [50, 'HUSTLER'], [120, 'WHEELMAN'], [200, 'ENFORCER'], [300, 'KINGPIN']];
const rankFor = (rep) => { let r = RANKS[0]; for (const x of RANKS) if (rep >= x[0]) r = x; return r; };
const nextRankAt = (rep) => { for (const x of RANKS) if (x[0] > rep) return x[0]; return 400; };

const MISSIONS = [
  { name: 'FIRST WHEEL', price: 500, npc: 'VERA', par: 150,
    brief: 'Steal a car and bring it to the green marker at the Piers.',
    stages: ['Steal any car — walk up and press E.', 'Drive to the green marker at the Piers.'],
    lines: ['Rook. You want work in this harbor, you start with wheels. Take a car — any car — and bring it to my marker at the Piers.', 'Clean. The car is mine now. You drive like you mean it.'] },
  { name: 'HARBOR RUN', price: 800, npc: 'VERA', par: 150,
    brief: 'Race the harbor loop: hit all 4 checkpoints before the clock runs out.',
    stages: ['Get in a car.', 'Hit checkpoint 1/4.', 'Hit checkpoint 2/4.', 'Hit checkpoint 3/4.', 'Hit checkpoint 4/4.'],
    lines: ['A client needs a package moved fast, no questions. Four checkpoints, one loop, beat the clock.', 'One-fifty under the wire. The client is happy. You are officially useful.'] },
  { name: 'DOCKSIDE STANDOFF', price: 1200, npc: 'MARROW', par: 240,
    brief: 'Marrow’s crew jumped the deal. Go to the docks on foot and drop all 6 of them.',
    stages: ['Go to the docks marker — on foot.', 'Drop all 6 of Marrow’s crew.'],
    lines: ['You walk into MY docks with VERA’s name in your mouth? Boys — show this driver how the harbor says hello.', 'Hah! You shoot like you drive. The docks are yours, Rook. For now.'] },
  { name: "SMUGGLER'S TIDE", price: 1500, npc: 'VERA', par: 200, brief: 'Move a midnight shipment past the NHPD cordon.', stages: [], lines: ['The tide brings cargo at midnight. Be there, be quiet, be fast.'] },
  { name: 'NEON MILE HEIST', price: 2500, npc: 'GREASE', par: 300, brief: 'Lift the chrome coupe off Neon Mile — then lose the tail.', stages: [], lines: ['That coupe on Neon Mile? It wants a new owner. Bring it to my shop in one piece.'] },
  { name: 'KING OF THE HARBOR', price: 5000, npc: 'DIAL', par: 300, brief: 'The whole NHPD is coming. Outrun the harbor and take the crown.', stages: [], lines: ['All units, all units — Rook is running the harbor. Bring me that driver.'] },
];
const STATIONS = [
  { name: 'HARBOR FM 98.1', songs: ['"Sunset Over the Piers" — Neon Tide', '"Palm Static" — The Breakwater', '"Chrome Sunset" — Velvet Ferry'] },
  { name: 'BAYWAVE 104.7', songs: ['"Harbor Lights" — Midnight Ferry', '"Chrome Palms" — DJ Lowtide', '"Neon Mile" — The Gulls'] },
];
const DISTRICTS = [
  { name: 'THE PIERS', sub: 'SALT AIR · OLD DOCKS', x0: -320, x1: -160, z0: -320, z1: 320 },
  { name: 'NEON MILE', sub: 'BARS · BILLBOARDS · ALL NIGHT', x0: -160, x1: 160, z0: -320, z1: -160 },
  { name: 'DOWNTOWN', sub: 'GLASS TOWERS · CITY HALL', x0: -160, x1: 160, z0: -160, z1: 160 },
  { name: 'PALM ROW', sub: 'HOTELS · BEACHFRONT', x0: 160, x1: 320, z0: -320, z1: 320 },
  { name: 'DOCKSIDE', sub: 'WAREHOUSES · CONTAINERS', x0: -160, x1: 160, z0: 160, z1: 320 },
];
const COIN_SPOTS = [[-240, -240], [-40, -240], [200, -240], [-240, 40], [40, -40], [240, 40], [-240, 240], [40, 240], [240, -120], [-120, 120]];
const GARAGE_POS = { x: 200, z: 200 };

// ---------------------------------------------------------------- state
const SAVE_KEY = 'neon-harbor-save-v1';
const S = {
  started: false, paused: false, dead: false, deadKind: '',
  cash: 150, rep: 0, day: 1, minutes: 18 * 60 + 48, // 18:48 golden hour
  health: 100, wanted: 0, searchT: 0, hideT: 0,
  mission: 0, stage: 0, missionT: 0, missionActive: false,
  coins: 0, coinsGot: [], carsStolen: 0, highestWanted: 0,
  upgrades: { engine: 0, armour: 0, paint: 0 },
  weapon: 0, ammo: [Infinity, 48, 120, 0, 0], mag: [Infinity, 12, 30, 0, 0],
  radio: 0, song: 0, radioT: 0,
  inCar: false, car: null, speed: 0, nitro: 100,
  camYaw: Math.PI, camPitch: 0.32,
  shotMode: '', kills: 0, killsNeed: 0, checkpoints: 0,
};
function saveGame() {
  if (S.shotMode) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: S.cash, rep: S.rep, day: S.day, minutes: S.minutes, mission: S.mission,
      coins: S.coins, coinsGot: S.coinsGot, carsStolen: S.carsStolen,
      highestWanted: S.highestWanted, upgrades: S.upgrades,
    }));
  } catch (e) { /* storage unavailable */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

// ---------------------------------------------------------------- three setup
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !new URLSearchParams(location.search).has('nofx') });
const NOFX = new URLSearchParams(location.search).has('nofx');
renderer.setPixelRatio(NOFX ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !NOFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2a1540, 180, 620);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(0, 14, 26);

const hemi = new THREE.HemisphereLight(0xffb3d9, 0x1c1030, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xff8f3d, 2.4);
sun.position.set(-190, 120, 150);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 700;
scene.add(sun);
scene.add(sun.target);

// Golden-hour sky dome: pink-violet up high, burning orange at the horizon.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x6b2d8f) }, mid: { value: new THREE.Color(0xd94f8e) }, low: { value: new THREE.Color(0xff8f3d) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low; void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }',
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat));
// Low sun disc on the horizon, west.
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
sunDisc.position.set(-90, 180, -420);
sunDisc.lookAt(0, 40, 0);
scene.add(sunDisc);

// ---------------------------------------------------------------- canvas textures
function tex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildingTexture(base, lit) {
  return tex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 10; y += 22) for (let x = 10; x < w - 10; x += 18) {
      g.fillStyle = Math.random() < lit ? (Math.random() < 0.7 ? '#ffd27a' : '#9be7ff') : '#1a1430';
      g.fillRect(x, y, 11, 14);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, w, 6);
  });
}
const BUILDING_TEX = [buildingTexture('#3a2b5e', 0.55), buildingTexture('#243b5e', 0.5), buildingTexture('#4a2b3e', 0.6), buildingTexture('#2e4a3a', 0.45)];
function signTexture(text, bg, fg, sub) {
  return tex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2);
    if (sub) { g.font = 'bold 26px Arial'; g.fillText(sub, w / 2, h / 2 + 34); }
  });
}
const SIGN_TEX = [
  signTexture('NEON MILE', '#12082a', '#ff5da2', 'EAT · DRINK · ALL NIGHT'),
  signTexture('THE PIERS', '#0a2030', '#9be7ff', 'FRESH CATCH DAILY'),
  signTexture('HOTEL PALM', '#2a1048', '#ffd23e', 'VACANCY · POOL · BAR'),
  signTexture('DOCKSIDE', '#1a2a12', '#7dff9e', 'WAREHOUSE 9'),
  signTexture('HARBOR FM', '#300a1a', '#ff8fb3', '98.1 · ALL HITS'),
  signTexture('TACOS EL FARO', '#3a1a08', '#ffb347', 'OPEN 24 HRS'),
];

// ---------------------------------------------------------------- city build
const CITY = 320; // half-size
const colliders = []; // {x0,z0,x1,z1}
const world = new THREE.Group(); scene.add(world);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2 + 120, CITY * 2 + 120), new THREE.MeshLambertMaterial({ color: 0x554672 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);

// Roads: grid every 80 units, width 16, dark asphalt + center dashes.
const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3348 });
const dashMat = new THREE.MeshBasicMaterial({ color: 0x8a7a3a });
for (let i = -3; i <= 3; i++) {
  const p = i * 80;
  for (const horizontal of [true, false]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2, 16), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(horizontal ? 0 : p, 0.05, horizontal ? p : 0);
    if (!horizontal) r.rotation.z = Math.PI / 2;
    r.receiveShadow = true; world.add(r);
    for (let d = -CITY + 20; d < CITY; d += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(horizontal ? d : p, 0.08, horizontal ? p : d);
      if (!horizontal) dash.rotation.z = Math.PI / 2;
      world.add(dash);
    }
  }
}
// Sidewalks: lighter strips along roads.
const walkMat = new THREE.MeshLambertMaterial({ color: 0x5d5178 });
for (let i = -3; i <= 3; i++) {
  const p = i * 80;
  for (const horizontal of [true, false]) {
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2, 5), walkMat);
    w1.rotation.x = -Math.PI / 2;
    w1.position.set(horizontal ? 0 : p + 11, 0.06, horizontal ? p + 11 : 0);
    if (!horizontal) w1.rotation.z = Math.PI / 2;
    world.add(w1);
  }
}

// Buildings: one or two per block, with neon roof trim and billboards.
const trimMat = new THREE.MeshBasicMaterial({ color: 0xff5da2 });
const trimMat2 = new THREE.MeshBasicMaterial({ color: 0x37e0ff });
const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
const palmLeafMat = new THREE.MeshLambertMaterial({ color: 0x1f7a3a });
function addPalm(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 6), palmTrunkMat);
  trunk.position.y = 4.5; trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), palmLeafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6, 9.4, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 0.9; leaf.rotation.x = -Math.sin(a) * 0.9;
    g.add(leaf);
  }
  g.position.set(x, 0, z); world.add(g);
}
function addBuilding(x, z, w, d, h, ti) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: BUILDING_TEX[ti % BUILDING_TEX.length] }));
  m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; world.add(m);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), (ti % 2 ? trimMat2 : trimMat));
  trim.position.set(x, h + 0.2, z); world.add(trim);
  colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
}
for (let bx = -3; bx <= 2; bx++) for (let bz = -3; bz <= 2; bz++) {
  const cx = bx * 80 + 40, cz = bz * 80 + 40;
  if (Math.abs(cx) < 60 && Math.abs(cz) < 60) continue; // central plaza
  const h = rand(18, 55);
  addBuilding(cx - 12, cz - 10, 26, 24, h, bx + bz * 3 + 7);
  if (Math.random() < 0.6) addBuilding(cx + 16, cz + 14, 16, 14, rand(10, 26), bx * 2 + bz + 3);
  if (Math.random() < 0.5) addPalm(cx - 28, cz + 24);
  if (Math.random() < 0.4) addPalm(cx + 28, cz - 26);
}
// Billboards on tall poles along the boulevards.
for (let i = 0; i < 10; i++) {
  const along = [-240, -160, -80, 0, 80, 160, 240][i % 7];
  const side = i % 2 ? 1 : -1;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 6), new THREE.MeshLambertMaterial({ color: 0x333344 }));
  pole.position.set(along, 7, side * 96); pole.castShadow = true; world.add(pole);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), new THREE.MeshBasicMaterial({ map: SIGN_TEX[i % SIGN_TEX.length] }));
  board.position.set(along, 16.5, side * 96);
  board.rotation.y = side > 0 ? 0 : Math.PI;
  world.add(board);
}
// Streetlights along the main boulevard (z = 0) and the north road.
const lampMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
for (let x = -280; x <= 280; x += 40) {
  for (const z of [8, -8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 8, 6), lampMat);
    pole.position.set(x, 4, z); world.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampGlow);
    bulb.position.set(x, 8.2, z); world.add(bulb);
  }
}
// Central plaza fountain + benches.
const plaza = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 2, 24), new THREE.MeshLambertMaterial({ color: 0x4a3a6e }));
plaza.position.set(0, 1, 0); plaza.castShadow = true; world.add(plaza);
colliders.push({ x0: -16, z0: -16, x1: 16, z1: 16 });

// Coins: 10 spinning gold pickups.
const coinMeshes = [];
const coinGeo = new THREE.CylinderGeometry(1.4, 1.4, 0.3, 20);
const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x8a6a00 });
COIN_SPOTS.forEach(([x, z], i) => {
  const c = new THREE.Mesh(coinGeo, coinMat);
  c.rotation.x = Math.PI / 2; c.position.set(x, 1.6, z); world.add(c);
  coinMeshes.push({ mesh: c, x, z, i, taken: false });
});

// Garage building (Grease's Spray & Tune) at Palm Row.
addBuilding(GARAGE_POS.x, GARAGE_POS.z, 34, 22, 12, 1);
const garageSign = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), new THREE.MeshBasicMaterial({ map: signTexture("GREASE'S", '#12082a', '#7dff9e', 'SPRAY & TUNE') }));
garageSign.position.set(GARAGE_POS.x, 14, GARAGE_POS.z - 11.2); garageSign.rotation.y = 0; world.add(garageSign);

// ---------------------------------------------------------------- vehicles
function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x0e1a2a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(kind === 'van' ? 2.4 : 2.1, 0.85, kind === 'van' ? 5.4 : 4.6), bodyMat);
  body.position.y = 0.75; body.castShadow = true; g.add(body);
  const cabinH = kind === 'van' ? 1.1 : 0.7;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, cabinH, kind === 'van' ? 3.4 : 2.2), glassMat);
  cabin.position.set(0, 1.45, kind === 'van' ? -0.3 : -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const [wx, wz] of [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.5], [1.05, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.12), lightMat);
    hl.position.set(s * 0.7, 0.8, 2.32); g.add(hl);
  }
  return g;
}
const TRAFFIC_COLORS = [0xd8d8d8, 0x222831, 0xc0392b, 0x2471a3, 0xf1c40f, 0x7d3c98, 0x16a085, 0xe67e22];
const traffic = [];
function spawnTrafficCar(x, z, axis, dir) {
  const kind = Math.random() < 0.12 ? 'van' : (Math.random() < 0.18 ? 'taxi' : 'car');
  const color = kind === 'taxi' ? 0xf7c948 : TRAFFIC_COLORS[randi(0, TRAFFIC_COLORS.length - 1)];
  const mesh = makeCarMesh(color, kind);
  mesh.position.set(x, 0, z); world.add(mesh);
  const t = { mesh, axis, dir, speed: rand(9, 16), kind, x, z };
  traffic.push(t); return t;
}
for (let i = 0; i < 20; i++) {
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const road = randi(-3, 3) * 80;
  const along = rand(-280, 280);
  spawnTrafficCar(axis === 'x' ? along : road + (Math.random() < 0.5 ? -4 : 4), axis === 'x' ? road + (Math.random() < 0.5 ? -4 : 4) : along, axis, Math.random() < 0.5 ? 1 : -1);
}
// Player's starter car (parked on the road x=0, target of mission 1).
const playerCar = { mesh: makeCarMesh(0xff5da2, 'car'), x: 0, z: -44, heading: 0, speed: 0, condition: 100, name: 'PINK COMET', stolen: false };
playerCar.mesh.position.set(playerCar.x, 0, playerCar.z);
playerCar.mesh.rotation.y = playerCar.heading;
world.add(playerCar.mesh);

// Player character (on foot): low-poly figure in a neon jacket.
function makePersonMesh(jacket, pants) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.5), new THREE.MeshLambertMaterial({ color: jacket }));
  torso.position.y = 1.35; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.5), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 2.2; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.54), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 2.5; g.add(hair);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.9, 0.36), new THREE.MeshLambertMaterial({ color: pants }));
    leg.position.set(s * 0.22, 0.45, 0); g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.28), new THREE.MeshLambertMaterial({ color: jacket }));
    arm.position.set(s * 0.58, 1.35, 0); g.add(arm);
  }
  return g;
}
const player = { mesh: makePersonMesh(0xff5da2, 0x222831), x: 0, z: -30, heading: 0, walkPhase: 0 };
player.mesh.position.set(player.x, 0, player.z);
world.add(player.mesh);

// Pedestrians strolling the sidewalks.
const peds = [];
const PED_COLORS = [0x37e08b, 0x9be7ff, 0xffd23e, 0xff9f43, 0x7b5cff, 0xffffff];
for (let i = 0; i < 26; i++) {
  const road = randi(-3, 3) * 80;
  const along = rand(-280, 280);
  const axis = Math.random() < 0.5 ? 'x' : 'z';
  const m = makePersonMesh(PED_COLORS[randi(0, PED_COLORS.length - 1)], 0x333344);
  m.position.set(axis === 'x' ? along : road + 12, 0, axis === 'x' ? road + 12 : along);
  m.scale.setScalar(rand(0.9, 1.1));
  world.add(m);
  peds.push({ mesh: m, axis, dir: Math.random() < 0.5 ? 1 : -1, speed: rand(1.2, 2.4), road });
}

// Police cruisers.
const police = [];
function makePoliceMesh() {
  const g = makeCarMesh(0x1a1a2e, 'car');
  const barMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), barMat);
  bar.position.set(0, 1.95, -0.2); g.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
  bar2.position.set(0.7, 1.95, -0.2); g.add(bar2);
  g.userData.bar = bar;
  return g;
}
const CALLSIGNS = ['PELICAN-11', 'BARRACUDA-18', 'VIPER-07', 'TIDE-22', 'SHARK-03', 'REEF-14'];
function spawnPoliceUnit(callsign) {
  const mesh = makePoliceMesh();
  const a = rand(0, Math.PI * 2);
  mesh.position.set(player.x + Math.cos(a) * 70, 0, player.z + Math.sin(a) * 70);
  world.add(mesh);
  const u = { mesh, callsign, status: 'PURSUIT', speed: 0, heading: 0, dist: 70, flash: 0 };
  police.push(u); return u;
}
// Helicopter with spotlight cone.
const heli = { mesh: null, cone: null, light: null, active: false };
{
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 5.2), new THREE.MeshLambertMaterial({ color: 0x1a2a44 }));
  body.castShadow = true; g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5), new THREE.MeshLambertMaterial({ color: 0x1a2a44 }));
  tail.position.set(0, 0.3, -4.2); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.1; g.add(rotor); g.userData.rotor = rotor;
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const s of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 4), skidMat); sk.position.set(s * 1.1, -1.1, 0); g.add(sk); }
  heli.mesh = g; heli.mesh.visible = false; scene.add(g);
  // No cone mesh: a big translucent cone reads as a broken wedge from the
  // chase camera. The spotlight is a bright pool on the ground instead.
  heli.pool = new THREE.Mesh(new THREE.CircleGeometry(3.5, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.2, depthWrite: false }));
  heli.pool.rotation.x = -Math.PI / 2; heli.pool.position.y = 0.12; heli.pool.visible = false;
  scene.add(heli.pool);
  heli.light = new THREE.SpotLight(0xfff2b0, 60, 120, 0.32, 0.5);
  heli.light.visible = false; scene.add(heli.light); scene.add(heli.light.target);
}
// Roadblock: two cruisers parked across the road ahead of the player.
const roadblock = { meshes: [], active: false, x: 0, z: 0 };
for (let i = 0; i < 2; i++) {
  const m = makePoliceMesh(); m.visible = false; world.add(m); roadblock.meshes.push(m);
}
// Mission marker beacon: light pillar + floating diamond.
const beacon = new THREE.Group();
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dff9e, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
beam.position.y = 30; beacon.add(beam);
const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), new THREE.MeshBasicMaterial({ color: 0x7dff9e }));
diamond.position.y = 5; beacon.add(diamond);
const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.6, 24), new THREE.MeshBasicMaterial({ color: 0x7dff9e, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; beacon.add(ring);
beacon.visible = false; world.add(beacon);
let markerPos = { x: 12, z: -44 };
function setMarker(x, z, color = 0x7dff9e) {
  markerPos = { x, z };
  beacon.position.set(x, 0, z); beacon.visible = true;
  beam.material.color.setHex(color); diamond.material.color.setHex(color); ring.material.color.setHex(color);
}
// Muzzle flash light + sprite.
const muzzle = new THREE.PointLight(0xffd27a, 0, 18);
scene.add(muzzle);
const flashSprite = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
scene.add(flashSprite);

// ---------------------------------------------------------------- input
const keys = {};
let mouseX = innerWidth / 2, mouseY = innerHeight / 2;
let wheelOpen = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'KeyP' || e.code === 'Escape') { if (!$('garageov').classList.contains('hidden')) closeGarage(); else if (!$('mapov').classList.contains('hidden')) toggleMap(); else togglePause(); }
  if (e.code === 'KeyR') cycleRadio();
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyF') punch();
  if (e.code === 'KeyQ') { wheelOpen = true; $('wheel').classList.remove('hidden'); updateWheel(); }
  if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)); if (n >= 1 && n <= 5) selectWeapon(n - 1); }
  if (e.code === 'Enter' && !$('title').classList.contains('hidden')) startGame(false);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  ensureAudio();
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyQ') { wheelOpen = false; $('wheel').classList.add('hidden'); }
});
addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; if (S.started && !S.inCar && document.pointerLockElement === canvas) S.camYaw -= e.movementX * 0.0022; });
canvas.addEventListener('mousedown', (e) => {
  if (!S.started || S.paused) return;
  if (e.button === 0) {
    if (!S.inCar && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    shoot();
  }
});
$('btnstart').onclick = () => startGame(false);
$('btncontinue').onclick = () => startGame(true);
$('btnresume').onclick = () => togglePause();
$('btnclosemap').onclick = () => toggleMap();
$('btnclosegarage').onclick = () => closeGarage();
$('btnretry').onclick = () => { location.reload(); };
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- audio (tiny synth radio)
let audioCtx = null, radioTimer = null;
const SCALES = [[0, 3, 5, 7, 10], [0, 2, 4, 7, 9]];
function ensureAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    radioTimer = setInterval(() => {
      if (!audioCtx || !S.started || S.paused || document.hidden) return;
      const scale = SCALES[S.radio];
      const note = scale[Math.floor(Math.random() * scale.length)] + 12;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = 220 * Math.pow(2, note / 12);
      g.gain.setValueAtTime(0.05, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.55);
    }, 620);
  } catch (e) { /* no audio */ }
}
function blip(freq = 660, dur = 0.12) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.12, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + dur);
}

// ---------------------------------------------------------------- HUD helpers
let toastT = null;
function toast(msg, ms = 2600) {
  $('toast').textContent = msg;
  clearTimeout(toastT); toastT = setTimeout(() => { $('toast').textContent = ''; }, ms);
}
let dialogT = null;
function showDialog(npcKey, line, ms = 5200) {
  const n = NPCS[npcKey];
  $('portrait').textContent = n.init;
  $('portrait').style.background = n.color;
  $('dwho').textContent = n.name + ' · ' + n.role.toUpperCase();
  $('dline').textContent = line;
  $('dialog').classList.remove('hidden');
  clearTimeout(dialogT); dialogT = setTimeout(() => $('dialog').classList.add('hidden'), ms);
}
let districtT = null, currentDistrict = '';
function districtBanner(name, sub) {
  $('dname').textContent = name; $('dsub').textContent = sub;
  $('district').classList.add('show');
  clearTimeout(districtT); districtT = setTimeout(() => $('district').classList.remove('show'), 2600);
}
function updateHUD() {
  const stars = '★'.repeat(S.wanted) + '☆'.repeat(5 - S.wanted);
  $('stars').textContent = stars;
  $('stars').classList.toggle('blink', S.wanted > 0 && S.hideT > 0);
  $('cash').textContent = fmt$(S.cash);
  const r = rankFor(S.rep);
  $('rep').textContent = `REP ${S.rep}/${nextRankAt(S.rep)} · ${r[1]}`;
  const hh = String(Math.floor(S.minutes / 60) % 24).padStart(2, '0');
  const mm = String(Math.floor(S.minutes % 60)).padStart(2, '0');
  $('clock').textContent = `DAY ${S.day} · ${hh}:${mm}`;
  const st = STATIONS[S.radio];
  $('radio').textContent = `${st.name} — ${st.songs[S.song]}`;
  $('healthfill').style.width = S.health + '%';
  const wnames = ['FISTS', 'PISTOL', 'SMG', 'SHOTGUN', 'RIFLE'];
  $('weaponname').textContent = wnames[S.weapon];
  $('ammo').innerHTML = S.weapon === 0 ? '— <small>/ ∞</small>' : `${S.mag[S.weapon]} <small>/ ${S.ammo[S.weapon]}</small>`;
  $('wammo1').textContent = S.ammo[1] + ' rds';
  $('wammo2').textContent = S.ammo[2] + ' rds';
  const m = MISSIONS[S.mission];
  $('mtitle').textContent = `JOB ${S.mission + 1}/6 · ${m.name}`;
  $('mnpc').textContent = NPCS[m.npc].name + ' · ' + NPCS[m.npc].role.toUpperCase();
  $('mobj').textContent = S.missionActive ? (m.stages[S.stage] || m.brief) : m.brief;
  const prog = S.missionActive ? (S.killsNeed ? S.kills / S.killsNeed : S.stage / Math.max(1, m.stages.length)) : 0;
  $('mbar').style.width = Math.round(clamp(prog, 0, 1) * 100) + '%';
  const nxt = MISSIONS[S.mission + 1];
  $('mnext').textContent = nxt ? `NEXT: ${nxt.name} — ${fmt$(nxt.price)}` : 'FINAL JOB — TAKE THE CROWN';
  if (S.missionT > 0 && S.missionActive) { $('mtimer').classList.remove('hidden'); $('mtimer').textContent = '⏱ ' + Math.ceil(S.missionT) + 's'; }
  else $('mtimer').classList.add('hidden');
  // vehicle card
  if (S.inCar && playerCar) {
    $('vehicle').classList.remove('hidden');
    $('vname').textContent = playerCar.name + (S.upgrades.engine ? ` · TUNE Lv${S.upgrades.engine}` : '');
    $('vcond').textContent = `CONDITION ${Math.round(playerCar.condition)}%${S.upgrades.armour ? ' · ARMOURED' : ''}`;
    $('vspeed').textContent = Math.round(Math.abs(S.speed) * 2.4);
    const gear = S.speed < 1 ? 'N' : Math.min(5, 1 + Math.floor(Math.abs(S.speed) / 11));
    $('vgear').textContent = `GEAR ${gear} · ${S.nitro > 20 ? 'NITRO READY' : 'NITRO ' + Math.round(S.nitro) + '%'}`;
  } else $('vehicle').classList.add('hidden');
  $('cross').classList.toggle('hidden', S.inCar || !S.started);
  // dispatch panel
  if (S.wanted > 0) {
    $('dispatch').classList.remove('hidden');
    $('dtitle').textContent = `NHPD RESPONSE — ${police.length + (heli.active ? 1 : 0) + (roadblock.active ? 2 : 0)} UNITS · CODE ${S.wanted}`;
    let html = '';
    const units = [...police];
    if (heli.active) units.push({ callsign: 'AIR-1', status: 'SPOTLIGHT', dist: 55 });
    if (roadblock.active) units.push({ callsign: 'ROADBLOCK', status: 'ROADBLOCK', dist: Math.round(dist2(player.x, player.z, roadblock.x, roadblock.z)) });
    for (const u of units.slice(0, 5)) {
      const d = u.dist !== undefined ? u.dist : Math.round(dist2(player.x, player.z, u.mesh.position.x, u.mesh.position.z));
      html += `<div class="unit"><b>${u.callsign}</b><span>${d} m</span><span class="st-${u.status}">${u.status}</span></div>`;
    }
    $('dunits').innerHTML = html;
    const extra = (police.length + (heli.active ? 1 : 0) + (roadblock.active ? 2 : 0)) - 5;
    $('dmore').textContent = extra > 0 ? `+${extra} more units in the search zone` : (S.hideT > 0 ? 'SEARCHING — stay out of sight, the heat is cooling.' : 'NHPD is converging on your position.');
  } else $('dispatch').classList.add('hidden');
}
function updateWheel() {
  document.querySelectorAll('#wheel .slot').forEach((el) => {
    const w = Number(el.dataset.w);
    el.classList.toggle('sel', w === S.weapon);
  });
}
function selectWeapon(i) {
  if (i === 3 || i === 4) { toast('🔒 ' + (i === 3 ? 'SHOTGUN' : 'RIFLE') + ' locked — finish more jobs to unlock.'); return; }
  S.weapon = i; updateWheel(); updateHUD(); blip(520, 0.08);
}
function cycleRadio() {
  S.radio = (S.radio + 1) % STATIONS.length; S.song = 0;
  toast('📻 ' + STATIONS[S.radio].name); updateHUD(); blip(880, 0.1);
}

// ---------------------------------------------------------------- missions
function startMission(i) {
  const m = MISSIONS[i];
  S.mission = i; S.stage = 0; S.missionActive = true; S.missionT = 0;
  S.kills = 0; S.killsNeed = 0; S.checkpoints = 0;
  if (i === 0) setMarker(0, -44);
  if (i === 1) { S.missionT = 150; setMarker(-240, -240, 0xffd23e); if (S.inCar) S.stage = 1; }
  if (i === 2) setMarker(-40, 240, 0xff6b6b);
  showDialog(m.npc, m.lines[0]);
  updateHUD();
}
function completeMission() {
  const m = MISSIONS[S.mission];
  const grade = (S.health > 70 && S.missionT >= 0) ? 'S' : (S.health > 40 ? 'A' : 'B');
  const bonus = grade === 'S' ? Math.round(m.price * 0.1) : 0;
  S.cash += m.price + bonus; S.rep += 25;
  beacon.visible = false;
  showDialog(m.npc, m.lines[1] || 'Job done, Rook.');
  toast(`✓ JOB COMPLETE — GRADE ${grade} — +${fmt$(m.price + bonus)}`);
  blip(990, 0.2); setTimeout(() => blip(1320, 0.25), 160);
  S.missionActive = false; S.stage = 0;
  if (S.mission < 5) { S.mission++; }
  saveGame(); updateHUD();
  // Chain into the next playable job (missions 1–3 are playable; 4–6 stay
  // locked as NEXT on the map until the player is ready for them).
  if (S.mission <= 2) setTimeout(() => { if (!S.dead && S.started) startMission(S.mission); }, 4000);
}
function failMission(reason) {
  toast('✗ JOB FAILED — ' + reason);
  S.missionActive = false; S.missionT = 0; beacon.visible = false;
  startMission(S.mission);
}
function missionStageDone() {
  const m = MISSIONS[S.mission];
  S.stage++;
  if (S.mission === 0) {
    if (S.stage === 1) { setMarker(-200, 40); toast('Drive to the green marker at the Piers.'); }
    else completeMission();
  } else if (S.mission === 1) {
    const cps = [[-240, -240], [200, -240], [240, 160], [-200, 40]];
    S.checkpoints++;
    if (S.checkpoints >= 4) completeMission();
    else setMarker(cps[S.checkpoints][0], cps[S.checkpoints][1], 0xffd23e);
  } else if (S.mission === 2) {
    if (S.stage === 1) { spawnShootout(); toast('Drop all 6 of Marrow’s crew!'); }
  }
}

// ---------------------------------------------------------------- shooting
const enemies = [];
const raycaster = new THREE.Raycaster();
function markerTexture() {
  return tex(64, 64, (g) => {
    g.fillStyle = '#ff2222'; g.beginPath();
    g.moveTo(32, 4); g.lineTo(58, 32); g.lineTo(32, 60); g.lineTo(6, 32); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 34);
  });
}
const MARK_TEX = markerTexture();
function spawnEnemy(x, z, boss) {
  const mesh = makePersonMesh(boss ? 0x8b0000 : 0x333344, 0x222222);
  mesh.position.set(x, 0, z); world.add(mesh);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: MARK_TEX, depthTest: false }));
  marker.scale.setScalar(3); marker.position.y = 3.6; mesh.add(marker);
  const e = { mesh, marker, hp: boss ? 120 : 40, boss, alive: true, shootT: rand(1, 2), x, z };
  enemies.push(e); return e;
}
function spawnShootout() {
  S.killsNeed = 6; S.kills = 0;
  const spots = [[-60, 220], [-20, 260], [-70, 280], [0, 220], [-40, 300], [-90, 240]];
  spots.forEach(([x, z], i) => spawnEnemy(x, z, i === 5));
  showDialog('MARROW', 'You walk into MY docks with VERA’s name in your mouth? Boys — show this driver how the harbor says hello.', 6000);
}
function shoot() {
  if (!S.started || S.paused || S.inCar || S.dead) return;
  if (S.weapon === 0) { punch(); return; }
  if (S.mag[S.weapon] <= 0) {
    if (S.ammo[S.weapon] > 0) { const take = Math.min(S.weapon === 1 ? 12 : 30, S.ammo[S.weapon]); S.ammo[S.weapon] -= take; S.mag[S.weapon] = take; toast('Reloaded.'); }
    else { toast('Out of ammo — switch weapons [Q].'); }
    updateHUD(); return;
  }
  S.mag[S.weapon]--;
  // Aim from the gun toward the crosshair's ground point at torso height:
  // the camera looks down at the player, so a raw center-screen ray would
  // strike the dirt a few meters ahead and could never reach a distant foe.
  const gunPos = player.mesh.position.clone(); gunPos.y = 1.6;
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const aimDir = camDir.clone();
  if (camDir.y < -0.02) {
    const t = (camera.position.y - 1.4) / -camDir.y;
    const p = camera.position.clone().addScaledVector(camDir, t);
    aimDir.copy(p.sub(gunPos)).normalize();
  }
  raycaster.set(gunPos, aimDir);
  raycaster.camera = camera;
  // Raycast body meshes only: the red "!" markers are Sprites, and sprites
  // cannot be raycast with an origin/direction raycaster (they need
  // Raycaster.camera and throw on matrixWorld).
  const targets = [];
  for (const e of enemies.filter((x) => x.alive)) {
    e.mesh.children.forEach((c) => { if (c.type === 'Mesh') targets.push(c); });
  }
  const hits = raycaster.intersectObjects(targets, false);
  window.__lastShot = { hits: hits.length, weapon: S.weapon, mag: S.mag[S.weapon] };
  muzzle.position.copy(player.mesh.position).add(new THREE.Vector3(0, 1.6, 0));
  muzzle.intensity = 30;
  flashSprite.position.copy(muzzle.position);
  flashSprite.material.opacity = 0.95;
  flashSprite.lookAt(camera.position);
  setTimeout(() => { muzzle.intensity = 0; flashSprite.material.opacity = 0; }, 60);
  blip(180, 0.06);
  let targetEnemy = null;
  if (hits.length) {
    let o = hits[0].object;
    while (o.parent && o.parent !== world) o = o.parent;
    const e = enemies.find((en) => en.mesh === o);
    if (e) targetEnemy = e;
  }
  if (!targetEnemy) {
    // Aim assist: the follow camera looks down at Rook, so a raw center ray
    // drops to the dirt within a few meters. The nearest living enemy
    // inside a small cone of the camera's forward direction is the target
    // the crosshair is sitting on.
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    let bestA = 16 * Math.PI / 180;
    for (const e of enemies.filter((x) => x.alive)) {
      const v = new THREE.Vector3(e.x - gunPos.x, 1.4 - gunPos.y, e.z - gunPos.z);
      const d = v.length();
      if (d > 50) continue;
      const a = v.normalize().angleTo(fwd);
      if (a < bestA) { bestA = a; targetEnemy = e; }
    }
  }
  if (targetEnemy) {
    const e = targetEnemy;
    {
      e.hp -= S.weapon === 1 ? 34 : 22;
      e.mesh.children.forEach((c) => { if (c.material) c.material.emissive?.setHex?.(0x550000); });
      setTimeout(() => e.mesh.children.forEach((c) => { if (c.material?.emissive) c.material.emissive.setHex(0x000000); }), 90);
      if (e.hp <= 0 && e.alive) {
        e.alive = false; S.kills++;
        e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.y = 0.4; e.marker.visible = false;
        toast(e.boss ? '💀 MARROW IS DOWN!' : `Enemy down — ${S.kills}/${S.killsNeed}`);
        if (S.missionActive && S.mission === 2 && S.kills >= S.killsNeed) completeMission();
      }
    }
  }
  updateHUD();
}
function punch() {
  if (!S.started || S.paused || S.inCar || S.dead) return;
  blip(140, 0.08);
  for (const e of enemies.filter((x) => x.alive)) {
    if (dist2(player.x, player.z, e.x, e.z) < 3) {
      e.hp -= 15;
      if (e.hp <= 0) { e.alive = false; S.kills++; e.mesh.rotation.x = -Math.PI / 2; e.marker.visible = false; if (S.missionActive && S.mission === 2 && S.kills >= S.killsNeed) completeMission(); }
    }
  }
}

// ---------------------------------------------------------------- interact / garage / map / pause
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const t of traffic) { const d = dist2(player.x, player.z, t.mesh.position.x, t.mesh.position.z); if (d < bd) { bd = d; best = t; } }
  const dp = dist2(player.x, player.z, playerCar.x, playerCar.z);
  if (dp < bd) return { kind: 'player', d: dp };
  return best ? { kind: 'traffic', t: best, d: bd } : null;
}
function tryInteract() {
  if (!S.started || S.paused || S.dead) return;
  if (!$('garageov').classList.contains('hidden')) return;
  if (S.inCar) { // step out
    S.inCar = false; player.x = playerCar.x + 3; player.z = playerCar.z + 3;
    player.mesh.visible = true; player.mesh.position.set(player.x, 0, player.z);
    $('prompt').classList.add('hidden'); updateHUD(); return;
  }
  const gd = dist2(player.x, player.z, GARAGE_POS.x, GARAGE_POS.z - 14);
  if (gd < 10) { openGarage(); return; }
  const near = nearestCar(6);
  if (near) {
    S.inCar = true; player.mesh.visible = false;
    if (near.kind === 'player') { S.car = playerCar; }
    else {
      // steal the traffic car: it becomes yours
      const t = near.t; world.remove(t.mesh); traffic.splice(traffic.indexOf(t), 1);
      playerCar.mesh.position.set(t.mesh.position.x, 0, t.mesh.position.z);
      playerCar.x = t.mesh.position.x; playerCar.z = t.mesh.position.z;
      playerCar.heading = t.mesh.rotation.y; playerCar.mesh.rotation.y = playerCar.heading;
      playerCar.name = t.kind === 'taxi' ? 'STOLEN TAXI' : 'STOLEN SEDAN';
      playerCar.condition = 100; S.car = playerCar; S.carsStolen++;
      S.wanted = Math.max(S.wanted, 1); S.highestWanted = Math.max(S.highestWanted, S.wanted);
      toast('🚗 Car stolen! The NHPD noticed.');
    }
    S.speed = 0;
    if (S.missionActive && S.mission === 0 && S.stage === 0) missionStageDone();
    if (S.missionActive && S.mission === 1 && S.stage === 0) { S.stage = 1; toast('Harbor Run — hit checkpoint 1/4!'); updateHUD(); }
    updateHUD();
  }
}
const SHOP = [
  { key: 'repair', name: 'Repair — full condition', price: 150 },
  { key: 'respray', name: 'Respray — fresh neon paint', price: 200 },
  { key: 'engine', name: 'Engine tune Lv+1 — faster top speed', price: 600 },
  { key: 'armour', name: 'Armour plating Lv+1 — tougher ride', price: 500 },
];
function openGarage() {
  S.paused = true;
  renderShop(); $('garageov').classList.remove('hidden');
  showDialog('GREASE', 'Your ride, my rules. Cash up front, no refunds.', 4000);
}
function closeGarage() { $('garageov').classList.add('hidden'); S.paused = false; }
function renderShop() {
  const rows = SHOP.map((s) => {
    const owned = (s.key === 'engine' && S.upgrades.engine >= 3) || (s.key === 'armour' && S.upgrades.armour >= 3);
    return `<div class="shoprow"><span>${s.name}${owned ? ' — MAXED' : ''}</span><button class="btn" style="padding:8px 16px;font-size:14px" data-shop="${s.key}" ${owned || S.cash < s.price ? 'disabled style="opacity:.4;padding:8px 16px;font-size:14px"' : ''}>${fmt$(s.price)}</button></div>`;
  }).join('');
  $('shoprows').innerHTML = rows;
  const spd = 55 + S.upgrades.engine * 12, acc = 50 + S.upgrades.engine * 14, arm = 30 + S.upgrades.armour * 22, han = 62 + S.upgrades.engine * 6;
  const bar = (v) => `<span class="statbar"><div style="width:${v}%"></div></span> ${v}`;
  $('carstats').innerHTML = `TOP SPEED&nbsp;&nbsp;${bar(spd)}<br>ACCELERATION&nbsp;&nbsp;${bar(acc)}<br>ARMOUR&nbsp;&nbsp;${bar(arm)}<br>HANDLING&nbsp;&nbsp;${bar(han)}<br>CONDITION ${Math.round(playerCar.condition)}% · CASH ${fmt$(S.cash)}`;
  document.querySelectorAll('[data-shop]').forEach((b) => b.onclick = () => buyShop(b.dataset.shop));
}
function buyShop(key) {
  const s = SHOP.find((x) => x.key === key);
  if (!s || S.cash < s.price) { toast('Not enough cash.'); return; }
  S.cash -= s.price;
  if (key === 'repair') playerCar.condition = 100;
  if (key === 'respray') { S.upgrades.paint++; playerCar.mesh.children[0].material.color.setHex([0xff5da2, 0x37e0ff, 0xffd23e][S.upgrades.paint % 3]); }
  if (key === 'engine') S.upgrades.engine = Math.min(3, S.upgrades.engine + 1);
  if (key === 'armour') S.upgrades.armour = Math.min(3, S.upgrades.armour + 1);
  toast('✓ ' + s.name + ' — done.'); blip(990, 0.15);
  saveGame(); renderShop(); updateHUD();
}
let mapOpen = false;
function toggleMap() {
  if (!S.started) return;
  mapOpen = !mapOpen;
  $('mapov').classList.toggle('hidden', !mapOpen);
  if (mapOpen) { S.paused = true; drawMap(); } else S.paused = false;
}
function drawMap() {
  const cv = $('mapcanvas'), g = cv.getContext('2d');
  g.fillStyle = '#0c0620'; g.fillRect(0, 0, 380, 380);
  const toMap = (x, z) => [190 + (x / CITY) * 180, 190 + (z / CITY) * 180];
  g.strokeStyle = '#3a3350'; g.lineWidth = 7;
  for (let i = -3; i <= 3; i++) {
    const [x1, y1] = toMap(i * 80, -CITY); const [x2, y2] = toMap(i * 80, CITY);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const [a1, b1] = toMap(-CITY, i * 80); const [a2, b2] = toMap(CITY, i * 80);
    g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
  }
  g.fillStyle = '#ff5da2'; g.font = 'bold 11px Arial';
  for (const d of DISTRICTS) { const [x, y] = toMap((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2); g.fillText(d.name, x - 24, y); }
  const [gx, gy] = toMap(GARAGE_POS.x, GARAGE_POS.z); g.fillStyle = '#7dff9e'; g.font = 'bold 13px Arial'; g.fillText('🔧 GARAGE', gx - 26, gy);
  if (beacon.visible) { const [mx, my] = toMap(markerPos.x, markerPos.z); g.fillStyle = '#7dff9e'; g.beginPath(); g.arc(mx, my, 7, 0, 7); g.fill(); }
  const [px, py] = toMap(player.x, player.z); g.fillStyle = '#ffd23e'; g.beginPath(); g.arc(px, py, 6, 0, 7); g.fill();
  g.strokeStyle = '#fff'; g.stroke();
  const list = MISSIONS.map((m, i) => {
    const st = i < S.mission ? '<span class="done">✓ DONE</span>' : i === S.mission ? '<span class="next">▶ NEXT</span>' : '<span class="locked">🔒 LOCKED</span>';
    return `<div>${i + 1}. <b>${m.name}</b> — ${fmt$(m.price)} · ${st}<br><span style="color:#aaa">${m.brief}</span></div>`;
  }).join('<hr style="border-color:#333">');
  const r = rankFor(S.rep);
  $('maplist').innerHTML = list + `<hr style="border-color:#333">
    <b>CAREER</b><br>Cash ${fmt$(S.cash)} · REP ${S.rep} (${r[1]})<br>
    Coins ${S.coins}/10 · Cars stolen ${S.carsStolen} · Highest wanted ${'★'.repeat(S.highestWanted) || '—'}<br>
    Districts 5 · Day ${S.day} · Missions done ${S.mission}/6`;
}
function togglePause() {
  if (!S.started || S.dead) return;
  S.paused = !S.paused;
  $('pauseov').classList.toggle('hidden', !S.paused);
}
function endGame(kind, text) {
  if (S.dead) return;
  S.dead = true; S.deadKind = kind;
  document.exitPointerLock?.();
  $('endtitle').textContent = kind;
  $('endtitle').style.color = kind === 'BUSTED' ? '#37b6e0' : '#ff3b3b';
  $('endtext').textContent = text;
  $('endov').classList.remove('hidden');
  saveGame();
}

// ---------------------------------------------------------------- game loop
const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0, fpsValue = 0;
window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
const tmpV = new THREE.Vector3();
function resolveCollision(p, radius) {
  for (const c of colliders) {
    const nx = clamp(p.x, c.x0, c.x1), nz = clamp(p.z, c.z0, c.z1);
    const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 0.0001) { p.x = c.x1 + radius; continue; }
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * radius; p.z = nz + (dz / d) * radius;
      return true;
    }
  }
  return false;
}
function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  return DISTRICTS[2];
}
function ensurePolice() {
  const want = Math.min(S.wanted, 4);
  while (police.length < want) spawnPoliceUnit(CALLSIGNS[police.length % CALLSIGNS.length]);
  while (police.length > want) { const u = police.pop(); world.remove(u.mesh); }
}
let roadblockT = 0;
function updateRoadblock(dt) {
  const want = S.wanted >= 3;
  roadblock.active = want;
  roadblock.meshes.forEach((m) => { m.visible = want; });
  if (!want) return;
  roadblockT -= dt;
  const d = dist2(player.x, player.z, roadblock.x, roadblock.z);
  if (roadblockT <= 0 || d > 90) {
    roadblockT = 5;
    const fx = S.inCar ? Math.sin(playerCar.heading) : -Math.sin(S.camYaw);
    const fz = S.inCar ? Math.cos(playerCar.heading) : -Math.cos(S.camYaw);
    roadblock.x = clamp(player.x + fx * 45, -280, 280);
    roadblock.z = clamp(player.z + fz * 45, -280, 280);
    const perp = Math.atan2(fx, fz) + Math.PI / 2;
    roadblock.meshes[0].position.set(roadblock.x - Math.sin(perp) * 4, 0, roadblock.z - Math.cos(perp) * 4);
    roadblock.meshes[1].position.set(roadblock.x + Math.sin(perp) * 4, 0, roadblock.z + Math.cos(perp) * 4);
    roadblock.meshes.forEach((m) => { m.rotation.y = perp; });
  }
}
function updatePolice(dt) {
  ensurePolice();
  const px = S.inCar ? playerCar.x : player.x;
  const pz = S.inCar ? playerCar.z : player.z;
  let nearest = 999;
  for (const u of police) {
    const dx = px - u.mesh.position.x, dz = pz - u.mesh.position.z;
    const d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    u.dist = Math.round(d);
    const targetSpeed = Math.min(30 + S.wanted * 1.5, S.inCar ? 34 + S.upgrades.engine * 3 : 16);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - u.heading;
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    u.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
    u.speed = Math.min(targetSpeed, u.speed + 14 * dt);
    // On foot, cruisers slow to a crawl up close so they can actually make
    // the arrest instead of endlessly circling past the player.
    if (!S.inCar && d < 8) u.speed = Math.min(u.speed, 5);
    if (d > 130) { // too far: respawn closer
      const a = rand(0, Math.PI * 2);
      u.mesh.position.set(px + Math.cos(a) * 80, 0, pz + Math.sin(a) * 80);
    }
    u.mesh.position.x += Math.sin(u.heading) * u.speed * dt;
    u.mesh.position.z += Math.cos(u.heading) * u.speed * dt;
    u.mesh.rotation.y = u.heading;
    u.flash += dt * 10;
    u.mesh.userData.bar.material.color.setHex(Math.floor(u.flash) % 2 ? 0xff2222 : 0x2244ff);
    if (d < 5) {
      u.status = 'RAMMING';
      if (S.inCar) {
        if (!u.ramT || u.ramT <= 0) {
          playerCar.condition -= S.upgrades.armour ? 3 : 6;
          playerCar.x += Math.sin(u.heading) * 2; playerCar.z += Math.cos(u.heading) * 2;
          u.ramT = 1.2; blip(120, 0.15);
          if (playerCar.condition <= 0) {
            playerCar.condition = 0; S.inCar = false; player.mesh.visible = true;
            player.x = playerCar.x + 3; player.z = playerCar.z + 3;
            player.mesh.position.set(player.x, 0, player.z);
            toast('Your car is wrecked! Run!'); S.wanted = Math.max(S.wanted, 2);
          }
        }
      } else {
        S.health -= 14 * dt;
        if (!u.arrestT) u.arrestT = 0;
        u.arrestT += dt;
        if (u.arrestT > 1.5) { endGame('BUSTED', 'The NHPD caught Rook on foot. The harbor keeps its secrets — and your cash.'); return; }
      }
    } else {
      u.status = d < 25 ? 'PURSUIT' : 'SEARCHING';
      u.arrestT = Math.max(0, (u.arrestT || 0) - dt * 0.5);
    }
    if (u.ramT) u.ramT -= dt;
  }
  // wanted decay: hide long enough and the heat cools
  if (S.wanted > 0) {
    if (nearest > 70) { S.hideT += dt; if (S.hideT > 6) { S.wanted--; S.hideT = 0; toast('Heat cooling — wanted level down.'); } }
    else S.hideT = 0;
  }
  // helicopter at 3+ stars
  const heliWant = S.wanted >= 3;
  heli.active = heliWant;
  heli.mesh.visible = heliWant; heli.pool.visible = heliWant; heli.light.visible = heliWant;
  if (heliWant) {
    heli.mesh.position.set(px + 12, 55, pz - 10);
    heli.mesh.userData.rotor.rotation.y += dt * 22;
    heli.pool.position.set(px, 0.12, pz);
    heli.light.position.set(px + 12, 54, pz - 10);
    heli.light.target.position.set(px, 0, pz);
  }
  updateRoadblock(dt);
}
function updateTraffic(dt) {
  for (const t of traffic) {
    t.speed = clamp(t.speed, 8, 17);
    if (t.axis === 'x') {
      t.mesh.position.x += t.dir * t.speed * dt;
      const atIsect = Math.abs((t.mesh.position.x % 80 + 80) % 80) < 1.2;
      if (atIsect && Math.random() < 0.01) { t.axis = 'z'; t.dir = Math.random() < 0.5 ? 1 : -1; t.mesh.position.z += t.dir * 4; }
      if (t.mesh.position.x > CITY) t.mesh.position.x = -CITY;
      if (t.mesh.position.x < -CITY) t.mesh.position.x = CITY;
      t.mesh.rotation.y = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      t.mesh.position.z += t.dir * t.speed * dt;
      const atIsect = Math.abs((t.mesh.position.z % 80 + 80) % 80) < 1.2;
      if (atIsect && Math.random() < 0.01) { t.axis = 'x'; t.dir = Math.random() < 0.5 ? 1 : -1; t.mesh.position.x += t.dir * 4; }
      if (t.mesh.position.z > CITY) t.mesh.position.z = -CITY;
      if (t.mesh.position.z < -CITY) t.mesh.position.z = CITY;
      t.mesh.rotation.y = t.dir > 0 ? 0 : Math.PI;
    }
    // slow down near the player's car so traffic feels alive, not ghostly
    const d = dist2(t.mesh.position.x, t.mesh.position.z, S.inCar ? playerCar.x : player.x, S.inCar ? playerCar.z : player.z);
    if (d < 12) t.speed = Math.max(6, t.speed - 6 * dt); else t.speed = Math.min(16, t.speed + 4 * dt);
  }
}
function updatePlayer(dt) {
  const up = keys.ArrowUp || keys.KeyW, down = keys.ArrowDown || keys.KeyS;
  const left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD;
  if (S.inCar) {
    const maxSpd = 40 + S.upgrades.engine * 6;
    if (up) S.speed += (keys.ShiftLeft || keys.ShiftRight ? 34 : 22) * dt;
    if (down) S.speed -= 26 * dt;
    if (keys.Space) S.speed *= Math.max(0, 1 - 3.2 * dt);
    if (!up && !down) S.speed *= Math.max(0, 1 - 0.5 * dt);
    if (keys.ShiftLeft || keys.ShiftRight) S.nitro = Math.max(0, S.nitro - 30 * dt); else S.nitro = Math.min(100, S.nitro + 6 * dt);
    S.speed = clamp(S.speed, -12, maxSpd);
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    playerCar.heading += steer * clamp(Math.abs(S.speed) / 12, 0, 1) * 1.9 * dt * (S.speed < 0 ? -1 : 1);
    playerCar.x += Math.sin(playerCar.heading) * S.speed * dt;
    playerCar.z += Math.cos(playerCar.heading) * S.speed * dt;
    playerCar.x = clamp(playerCar.x, -CITY, CITY); playerCar.z = clamp(playerCar.z, -CITY, CITY);
    if (resolveCollision(playerCar, 2.4)) { if (Math.abs(S.speed) > 14) { playerCar.condition -= 4; blip(110, 0.12); } S.speed *= 0.45; }
    playerCar.mesh.position.set(playerCar.x, 0, playerCar.z);
    playerCar.mesh.rotation.y = playerCar.heading;
    player.x = playerCar.x; player.z = playerCar.z;
    S.camYaw += (((playerCar.heading + Math.PI) - S.camYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, 2.2 * dt);
  } else {
    const lookX = -Math.sin(S.camYaw), lookZ = -Math.cos(S.camYaw);
    const rightX = Math.cos(S.camYaw), rightZ = -Math.sin(S.camYaw);
    let mx = 0, mz = 0;
    if (up) { mx += lookX; mz += lookZ; }
    if (down) { mx -= lookX; mz -= lookZ; }
    if (right) { mx += rightX; mz += rightZ; }
    if (left) { mx -= rightX; mz -= rightZ; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      player.x += mx * 10 * dt; player.z += mz * 10 * dt;
      player.heading = Math.atan2(mx, mz);
      player.walkPhase += dt * 10;
      player.mesh.position.y = Math.abs(Math.sin(player.walkPhase)) * 0.12;
    } else player.mesh.position.y = 0;
    player.x = clamp(player.x, -CITY, CITY); player.z = clamp(player.z, -CITY, CITY);
    resolveCollision(player, 0.9);
    // face the aim direction (camera look) when standing still with a gun
    if (len === 0 && S.weapon > 0) player.heading = Math.atan2(lookX, lookZ);
    player.mesh.position.set(player.x, player.mesh.position.y, player.z);
    player.mesh.rotation.y = player.heading;
  }
  // prompt
  let prompt = '';
  if (!S.inCar) {
    if (dist2(player.x, player.z, GARAGE_POS.x, GARAGE_POS.z - 14) < 10) prompt = '[E] ENTER GREASE’S GARAGE';
    else if (nearestCar(6)) prompt = '[E] ' + (dist2(player.x, player.z, playerCar.x, playerCar.z) < 6 ? 'ENTER CAR' : 'STEAL CAR');
  } else prompt = '[E] STEP OUT · [Shift] NITRO · [Space] BRAKE';
  const pel = $('prompt');
  if (prompt) { pel.textContent = prompt; pel.classList.remove('hidden'); } else pel.classList.add('hidden');
}
function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = dist2(player.x, player.z, e.x, e.z);
    if (d > 13) {
      const h = Math.atan2(player.x - e.x, player.z - e.z);
      e.x += Math.sin(h) * 4.5 * dt; e.z += Math.cos(h) * 4.5 * dt;
      e.mesh.rotation.y = h;
    } else {
      e.mesh.rotation.y = Math.atan2(player.x - e.x, player.z - e.z);
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.shootT -= dt;
    if (e.shootT <= 0 && d < 36) {
      e.shootT = rand(1.4, 2.4);
      S.health -= e.boss ? 4 : rand(2, 3);
      blip(150, 0.1);
      if (S.health <= 0) {
        S.health = 0;
        const near = police.some((u) => dist2(player.x, player.z, u.mesh.position.x, u.mesh.position.z) < 40);
        endGame(near ? 'BUSTED' : 'WASTED', near ? 'Shot down and cuffed by the NHPD.' : 'Rook went down at the docks. The harbor forgets fast.');
      }
    }
  }
}
function updateWorld(dt) {
  // clock: 1 game minute per 2 real seconds
  S.minutes += dt * 0.5;
  if (S.minutes >= 1440) { S.minutes -= 1440; S.day++; }
  // sun by hour: golden 17–20, night 20–6, day 6–17
  const h = S.minutes / 60;
  if (h >= 17 && h < 20) { sun.intensity = 2.4; sun.color.setHex(0xff8f3d); hemi.intensity = 1.05; }
  else if (h >= 20 || h < 6) { sun.intensity = 0.35; sun.color.setHex(0x8fb3ff); hemi.intensity = 0.4; }
  else { sun.intensity = 1.7; sun.color.setHex(0xfff0c0); hemi.intensity = 0.7; }
  // coins spin + collect
  for (const c of coinMeshes) {
    if (c.taken) continue;
    c.mesh.rotation.y += dt * 2;
    c.mesh.position.y = 1.6 + Math.sin(performance.now() * 0.002 + c.i) * 0.25;
    if (dist2(player.x, player.z, c.x, c.z) < 3.5) {
      c.taken = true; c.mesh.visible = false;
      S.coins++; S.coinsGot.push(c.i); S.cash += 50; S.rep += 5;
      toast(`🪙 Harbor coin ${S.coins}/10 — +$50, +5 REP`); blip(1320, 0.12); saveGame();
    }
  }
  // district banner
  const d = districtAt(player.x, player.z);
  if (d.name !== currentDistrict) { currentDistrict = d.name; if (S.started) districtBanner(d.name, d.sub); }
  // mission marker + timer
  if (S.missionActive) {
    diamond.rotation.y += dt * 2;
    if (S.mission === 1) {
      S.missionT -= dt;
      if (S.missionT <= 0) { failMission('Out of time on the Harbor Run.'); return; }
    }
    if (dist2(player.x, player.z, markerPos.x, markerPos.z) < 7) {
      if (S.mission === 0 && S.stage === 1) missionStageDone();
      else if (S.mission === 1 && (S.stage >= 1 || S.inCar)) missionStageDone();
      else if (S.mission === 2 && S.stage === 0 && !S.inCar) missionStageDone();
    }
  }
  const nearFoe = enemies.some((e) => e.alive && dist2(player.x, player.z, e.x, e.z) < 40);
  if (S.wanted === 0 && S.health < 100 && !nearFoe) S.health = Math.min(100, S.health + 2 * dt);
  // radio song rotates
  S.radioT += dt;
  if (S.radioT > 45) { S.radioT = 0; S.song = (S.song + 1) % STATIONS[S.radio].songs.length; }
  // peds stroll
  for (const p of peds) {
    if (p.axis === 'x') { p.mesh.position.x += p.dir * p.speed * dt; if (Math.abs(p.mesh.position.x) > CITY) p.dir *= -1; p.mesh.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { p.mesh.position.z += p.dir * p.speed * dt; if (Math.abs(p.mesh.position.z) > CITY) p.dir *= -1; p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI; }
  }
}
function updateCamera(dt) {
  const tx = S.inCar ? playerCar.x : player.x;
  const tz = S.inCar ? playerCar.z : player.z;
  const dist = S.inCar ? 13 : 8.5;
  const height = S.inCar ? 5 : 3.4;
  const cx = tx + Math.sin(S.camYaw) * dist;
  const cz = tz + Math.cos(S.camYaw) * dist;
  camera.position.x += (cx - camera.position.x) * Math.min(1, 6 * dt);
  camera.position.y += (height - camera.position.y) * Math.min(1, 6 * dt);
  camera.position.z += (cz - camera.position.z) * Math.min(1, 6 * dt);
  camera.lookAt(tx, S.inCar ? 2 : 1.8, tz);
}
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (S.started && !S.paused && !S.dead) {
    updatePlayer(dt);
    updateTraffic(dt);
    updatePolice(dt);
    updateEnemies(dt);
    updateWorld(dt);
    updateCamera(dt);
    updateHUD();
  }
  renderer.render(scene, camera);
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 1) {
    fpsValue = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    window.__fps = fpsValue;
    $('fps').textContent = fpsValue + ' FPS';
  }
}

// ---------------------------------------------------------------- start + shot staging
function startGame(useSave) {
  const sv = useSave ? loadSave() : null;
  if (sv) {
    Object.assign(S, { cash: sv.cash, rep: sv.rep, day: sv.day, minutes: sv.minutes, mission: sv.mission, coins: sv.coins, coinsGot: sv.coinsGot || [], carsStolen: sv.carsStolen, highestWanted: sv.highestWanted });
    if (sv.upgrades) S.upgrades = sv.upgrades;
    for (const i of S.coinsGot) { const c = coinMeshes[i]; if (c) { c.taken = true; c.mesh.visible = false; } }
    toast(`Save loaded — Day ${S.day}, ${fmt$(S.cash)}, Job ${S.mission + 1}/6.`);
  }
  $('title').classList.add('hidden');
  ['mission', 'topright', 'vitals'].forEach((id) => $(id).classList.remove('hidden'));
  S.started = true;
  startMission(S.mission);
  updateHUD();
}
const params = new URLSearchParams(location.search);
S.shotMode = params.get('shot') || '';
function stageCover() {
  startGame(false);
  S.cash = 48250; S.rep = 210; S.mission = 5; S.missionActive = true; S.stage = 0;
  S.minutes = 18 * 60 + 12; S.wanted = 4; S.highestWanted = 4;
  S.inCar = true; player.mesh.visible = false;
  playerCar.x = 0; playerCar.z = -120; playerCar.heading = Math.PI;
  playerCar.mesh.position.set(0, 0, -120); playerCar.mesh.rotation.y = Math.PI;
  player.x = 0; player.z = -120; S.speed = 18; S.camYaw = 0;
  setMarker(0, -200, 0xffd23e);
  ensurePolice();
  // Chase formation: cruisers spread around the player's car, none on top
  // of it, two ahead on the boulevard and two closing from behind.
  const formation = [[-12, -132, 0.4], [13, -108, 2.8], [-9, -158, 0.2], [11, -174, -0.3]];
  police.forEach((u, i) => {
    const f = formation[i % formation.length];
    u.mesh.position.set(f[0], 0, f[1]);
    u.heading = f[2]; u.mesh.rotation.y = f[2];
    u.status = i < 2 ? 'PURSUIT' : 'RAMMING';
  });
  for (let i = 0; i < 6; i++) { const t = traffic[i]; t.mesh.position.set(i % 2 ? 4 : -4, 0, -260 + i * 12); t.axis = 'z'; t.dir = -1; }
  // Roadblock parked across the boulevard 30 m ahead, held in place so the
  // cover frame shows it.
  roadblock.active = true; roadblock.x = 0; roadblock.z = -150; roadblockT = 60;
  roadblock.meshes[0].position.set(4, 0, -150); roadblock.meshes[0].rotation.y = Math.PI / 2; roadblock.meshes[0].visible = true;
  roadblock.meshes[1].position.set(-4, 0, -150); roadblock.meshes[1].rotation.y = Math.PI / 2; roadblock.meshes[1].visible = true;
  updateHUD();
}
function stageShootout() {
  startGame(false);
  S.mission = 2; startMission(2);
  S.stage = 1; spawnShootout();
  player.x = -40; player.z = 285; player.heading = Math.PI;
  player.mesh.position.set(-40, 0, 285); player.mesh.rotation.y = Math.PI;
  S.camYaw = 0; S.weapon = 2; S.health = 82;
  wheelOpen = true; $('wheel').classList.remove('hidden'); updateWheel();
  showDialog('MARROW', 'You walk into MY docks with VERA’s name in your mouth? Boys — show this driver how the harbor says hello.', 9000);
  updateHUD();
}
function stageGarage() {
  startGame(false);
  player.x = GARAGE_POS.x; player.z = GARAGE_POS.z - 18;
  player.mesh.position.set(player.x, 0, player.z);
  openGarage();
}
function stageMap() {
  startGame(false);
  S.cash = 12450; S.rep = 145; S.coins = 4; S.carsStolen = 7; S.highestWanted = 3;
  toggleMap();
}
function applyShotMode() {
  if (S.shotMode === 'cover') stageCover();
  else if (S.shotMode === 'shootout') stageShootout();
  else if (S.shotMode === 'garage') stageGarage();
  else if (S.shotMode === 'map') stageMap();
  else {
    const sv = loadSave();
    if (sv) $('continue').textContent = `↻ CONTINUE — Job ${sv.mission + 1}/6 · ${fmt$(sv.cash)} · Day ${sv.day} · ${String(Math.floor(sv.minutes / 60)).padStart(2, '0')}:${String(Math.floor(sv.minutes % 60)).padStart(2, '0')}`;
    else $('continue').textContent = 'No save yet — start a new story.';
  }
}
window.__NH = {
  S, startMission, completeMission, setWanted: (n) => { S.wanted = n; S.highestWanted = Math.max(S.highestWanted, n); },
  warp: (x, z) => { player.x = x; player.z = z; player.mesh.position.set(x, 0, z); if (S.inCar) { playerCar.x = x; playerCar.z = z; playerCar.mesh.position.set(x, 0, z); } },
  toMarker: () => { window.__NH.warp(markerPos.x, markerPos.z); },
  aim: () => { // point the camera at the nearest living enemy (test helper)
    let best = null, bd = 1e9;
    for (const e of enemies) if (e.alive) { const d = dist2(player.x, player.z, e.x, e.z); if (d < bd) { bd = d; best = e; } }
    if (best) { const lx = best.x - player.x, lz = best.z - player.z; S.camYaw = Math.atan2(-lx, -lz); }
  },
  snapCam: () => { // snap the camera behind the player instantly (test helper)
    camera.position.set(player.x + Math.sin(S.camYaw) * 9.5, 4.2, player.z + Math.cos(S.camYaw) * 9.5);
    camera.lookAt(player.x, 2, player.z);
  },
  state: () => ({ started: S.started, mission: S.mission, stage: S.stage, active: S.missionActive, cash: S.cash, rep: S.rep, wanted: S.wanted, health: S.health, inCar: S.inCar, kills: S.kills, coins: S.coins, x: player.x, z: player.z, fps: fpsValue, errors: window.__errors }),
};
applyShotMode();
if (!$('title').classList.contains('hidden')) {
  // Title screen: keep the HUD out of the way until the story starts.
  ['mission', 'topright', 'vitals'].forEach((id) => $(id).classList.add('hidden'));
}
updateHUD();
tick();
