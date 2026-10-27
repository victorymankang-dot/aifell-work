// ================== 게임 설정 ==================
const MAX_STAGE = 5;
const START_LIVES = 3;
const SCORE_BONUS_STEP = 1000;   // 이 점수마다 보너스 아이템
const TIME_BONUS_STEP = 60;      // 생존 n초마다 보너스 아이템
const WEAPON_DURATION = 15;      // 보너스 무기 지속 시간(초)
const INVULN_TIME = 2;           // 부활 직후 무적 시간(초)
const HIT_POINTS = 20;           // 보스를 맞췄지만 아직 안 죽었을 때 점수

const WEAPON_NAMES = { 1: '단발 SINGLE', 2: '쌍발 DOUBLE', 3: '3연발 TRIPLE' };

// 단계별 난이도
function stageCfg(s) {
  return {
    diveInterval: Math.max(0.7, 2.8 - s * 0.4),
    diveSpeed: 18 + s * 2.5,
    bulletSpeed: 18 + s * 3,
    shotsPerDiver: 1 + Math.floor(s / 2),
    formationFire: 0.25 + s * 0.15,
    maxDivers: 1 + Math.floor(s / 2),
    bossHp: s >= 4 ? 3 : 2,
  };
}

// ================== 렌더러 / 장면 ==================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 60, 130);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
const LOOK = new THREE.Vector3(0, 0, -22);
const CAM_OFFSET = new THREE.Vector3(0, 15, 35);
let camScale = 1;

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(5, 20, 10);
scene.add(sun);

// 세로 화면(모바일)에서는 카메라를 뒤로 빼서 좌우 전장이 다 보이게 한다
function fitScreen() {
  const aspect = innerWidth / innerHeight;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = aspect;
  camScale = THREE.MathUtils.clamp(1.3 / aspect, 1, 2.6);
  camera.position.copy(LOOK).addScaledVector(CAM_OFFSET, camScale);
  camera.lookAt(LOOK);
  scene.fog.near = 60 + (camScale - 1) * 40;
  scene.fog.far = 130 + (camScale - 1) * 40;
  camera.updateProjectionMatrix();
}
addEventListener('resize', fitScreen);
fitScreen();

// ================== 별 배경 ==================
const STAR_N = 900;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STAR_N * 3);
for (let i = 0; i < STAR_N; i++) {
  starPos[i * 3] = (Math.random() - 0.5) * 200;
  starPos[i * 3 + 1] = -20 + Math.random() * 60;
  starPos[i * 3 + 2] = -150 + Math.random() * 170;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35 })));

// ================== 사운드 ==================
let actx = null;
function initAudio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
}
function beep(freq, dur, type = 'square', vol = 0.06, slide = 0) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, actx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
function jingle(notes, step = 0.15) {
  notes.forEach((f, i) => setTimeout(() => beep(f, step * 1.5), i * step * 1000));
}

// ================== 모델 ==================
function makePlayer() {
  const g = new THREE.Group();
  const white = new THREE.MeshPhongMaterial({ color: 0xeeeeee, flatShading: true });
  const red = new THREE.MeshPhongMaterial({ color: 0xff2222, flatShading: true });
  const blue = new THREE.MeshPhongMaterial({ color: 0x3366ff, emissive: 0x112244, flatShading: true });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.4, 6), white);
  body.rotation.x = -Math.PI / 2;
  g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 0.8), red);
  wing.position.z = 0.5; g.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.2, 4), white);
    tip.rotation.x = -Math.PI / 2; tip.position.set(s * 1.5, 0, 0.2); g.add(tip);
  }
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), blue);
  cockpit.position.set(0, 0.35, 0.1); g.add(cockpit);
  return g;
}

const ENEMY_TYPES = {
  boss: { body: 0x22aa44, wing: 0x8844ff, score: 150 },
  butterfly: { body: 0xff3333, wing: 0x3388ff, score: 80 },
  bee: { body: 0x3366ff, wing: 0xffdd22, score: 50 },
};
function makeEnemy(type) {
  const t = ENEMY_TYPES[type];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: t.body, emissive: t.body, emissiveIntensity: 0.25, flatShading: true });
  const wingMat = new THREE.MeshPhongMaterial({ color: t.wing, emissive: t.wing, emissiveIntensity: 0.25, flatShading: true, side: THREE.DoubleSide });
  const size = type === 'boss' ? 0.8 : 0.6;
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), bodyMat));
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.8), wingMat);
    w.position.x = s * (size + 0.45);
    g.add(w); wings.push(w);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), eyeMat);
    e.position.set(s * 0.25, 0.3, 0.35 * size); g.add(e);
  }
  g.scale.setScalar(1.3);
  g.userData.wings = wings;
  g.userData.bodyMat = bodyMat;
  return g;
}

function makeItem() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9, 0),
    new THREE.MeshPhongMaterial({ color: 0x33e0ff, emissive: 0x1188aa, flatShading: true })
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.12, 6, 20),
    new THREE.MeshBasicMaterial({ color: 0xff5cf0 })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(core, ring);
  return g;
}

const bulletGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
bulletGeo.rotateX(Math.PI / 2);
const BULLET_MATS = {
  1: new THREE.MeshBasicMaterial({ color: 0xffff66 }),
  2: new THREE.MeshBasicMaterial({ color: 0x33e0ff }),
  3: new THREE.MeshBasicMaterial({ color: 0xff5cf0 }),
};
const eBulletGeo = new THREE.SphereGeometry(0.25, 8, 6);
const eBulletMat = new THREE.MeshBasicMaterial({ color: 0xff5533 });

// ================== 상태 ==================
const player = makePlayer();
scene.add(player);

let state = 'title'; // title | ready | play | dead | clear | over | victory
let score, lives, stage, kills, playTime;
let aliveTime, nextTimeBonus, nextScoreBonus;
let weaponLevel = 1, weaponTime = 0;
let playerAlive = true, invuln = 0;
let enemies = [], pBullets = [], eBullets = [], particles = [], items = [];
let fireCooldown = 0, diveTimer = 0, stateTimer = 0, time = 0, formationTime = 0;
let cfg = stageCfg(1);
const keys = {};

function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
let hi = +(storeGet('galaga3d-hi') || 0);

// ================== HUD ==================
const $ = id => document.getElementById(id);
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let bannerKey = '';
function setBanner(cls, text) {
  const key = cls + text;
  if (key === bannerKey) return;
  bannerKey = key;
  const b = $('banner');
  b.className = cls;
  b.textContent = text;
}

let toastTimer = null;
function toast(text, color = '#33e0ff') {
  const t = $('toast');
  t.textContent = text;
  t.style.color = color;
  t.style.textShadow = `0 0 14px ${color}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
}

function updateHud() {
  $('score').textContent = score ?? 0;
  $('hi').textContent = Math.max(hi, score || 0);
  $('stage').textContent = `${stage || 1} / ${MAX_STAGE}`;
  const l = Math.max(0, lives ?? START_LIVES);
  $('lives').textContent = l ? '▲'.repeat(l) + ` ${l}` : '0';
  $('livesBox').classList.toggle('low', l === 1);

  const a = aliveTime || 0;
  $('aliveTime').textContent = fmtTime(a);
  const toNext = (nextTimeBonus || TIME_BONUS_STEP) - a;
  $('timeLeft').textContent = Math.max(0, Math.ceil(toNext));
  $('timeBar').style.width = `${(1 - toNext / TIME_BONUS_STEP) * 100}%`;

  $('weaponBox').className = `meter weapon-${weaponLevel}`;
  $('weaponName').textContent = `무기: ${WEAPON_NAMES[weaponLevel]}`;
  $('weaponTime').textContent = weaponLevel > 1 ? `${Math.ceil(weaponTime)}초 남음` : '기본';
  $('weaponBar').style.width = weaponLevel > 1 ? `${(weaponTime / WEAPON_DURATION) * 100}%` : '100%';
}

// ================== 입력 ==================
function tryStart() {
  initAudio();
  if (state === 'title' || ((state === 'over' || state === 'victory') && stateTimer > 1)) startGame();
}

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (state === 'title') tryStart();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

$('startBtn').addEventListener('click', tryStart);
$('retryBtn').addEventListener('click', tryStart);

// 모바일 버튼: 누르고 있는 동안 해당 키가 눌린 것으로 처리
function bindTouch(id, code) {
  const el = $(id);
  const on = e => { e.preventDefault(); initAudio(); keys[code] = true; el.classList.add('active'); };
  const off = e => { e.preventDefault(); keys[code] = false; el.classList.remove('active'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
bindTouch('btnLeft', 'ArrowLeft');
bindTouch('btnRight', 'ArrowRight');
bindTouch('btnFire', 'Space');

// ================== 게임 흐름 ==================
function removeAll(arr) {
  for (const o of arr) scene.remove(o.mesh);
  arr.length = 0;
}

function startGame() {
  removeAll(particles);
  score = 0; lives = START_LIVES; stage = 1; kills = 0; playTime = 0;
  aliveTime = 0; nextTimeBonus = TIME_BONUS_STEP; nextScoreBonus = SCORE_BONUS_STEP;
  weaponLevel = 1; weaponTime = 0;
  $('startScreen').classList.add('hidden');
  $('resultScreen').classList.add('hidden');
  respawnPlayer(false);
  beginStage();
}

function beginStage() {
  removeAll(enemies); removeAll(pBullets); removeAll(eBullets); removeAll(items);
  cfg = stageCfg(stage);
  spawnWave();
  state = 'ready'; stateTimer = 0;
  updateHud();
  jingle([523, 659, 784]);
}

function respawnPlayer(withInvuln = true) {
  playerAlive = true;
  player.visible = true;
  player.position.set(0, 0, 0);
  invuln = withInvuln ? INVULN_TIME : 0;
}

function showResult(win) {
  if (score > hi) { hi = score; storeSet('galaga3d-hi', hi); }
  const title = $('resultTitle');
  title.textContent = win ? '승리! ALL CLEAR' : '게임 오버';
  title.className = win ? 'win' : 'lose';
  $('rScore').textContent = score;
  $('rStage').textContent = `${stage} / ${MAX_STAGE}`;
  $('rKills').textContent = kills;
  $('rTime').textContent = fmtTime(playTime);
  $('rHi').textContent = hi;
  $('resultScreen').classList.remove('hidden');
  updateHud();
}

// 편대 위치: z축(깊이)으로 줄을 세운다
function slotPos(e, t) {
  const sway = Math.sin(t * 0.8) * 3;
  const breathe = 1 + Math.sin(t * 1.6) * 0.06;
  return new THREE.Vector3(e.col * breathe * 2.8 + sway, 0, -32 - e.row * 3.6);
}

function spawnWave() {
  const rows = [['boss', 4], ['butterfly', 8], ['butterfly', 8], ['bee', 10], ['bee', 10]];
  let delay = 0;
  rows.forEach(([type, n], r) => {
    for (let i = 0; i < n; i++) {
      const mesh = makeEnemy(type);
      const e = {
        mesh, type, hp: type === 'boss' ? cfg.bossHp : 1,
        row: 4 - r, col: i - (n - 1) / 2,
        mode: 'enter', t: -delay, side: i % 2 ? 1 : -1,
        vel: new THREE.Vector3(), shots: 0, flash: 0,
      };
      delay += 0.05;
      mesh.position.set(e.side * 40, 0, -110);
      scene.add(mesh);
      enemies.push(e);
    }
  });
  formationTime = 0;
  diveTimer = 2;
}

function explode(pos, color, n = 24) {
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    particles.push({
      mesh, life: 0.6 + Math.random() * 0.5,
      vel: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.3) * 12, (Math.random() - 0.5) * 18),
    });
  }
}

function spawnItem() {
  const mesh = makeItem();
  mesh.position.set((Math.random() - 0.5) * 24, 0, -40);
  scene.add(mesh);
  items.push({ mesh });
  toast('보너스 무기 등장!\n아이템을 잡으세요');
  jingle([880, 1175, 1568], 0.08);
}

function fire() {
  // 화면에 남은 내 탄 수를 무기 단계에 비례해 제한 (갤러그식 연사 제한)
  if (pBullets.length >= 3 * weaponLevel) return;
  const shots = weaponLevel === 1 ? [[0, 0]]
    : weaponLevel === 2 ? [[-0.7, 0], [0.7, 0]]
    : [[0, 0], [-0.5, -9], [0.5, 9]];
  for (const [dx, vx] of shots) {
    const mesh = new THREE.Mesh(bulletGeo, BULLET_MATS[weaponLevel]);
    mesh.position.set(player.position.x + dx, 0, -1.2);
    mesh.rotation.y = -Math.atan2(vx, 70);
    scene.add(mesh);
    pBullets.push({ mesh, vx });
  }
  beep(880, 0.08, 'square', 0.04, -500);
}

function enemyFire(e) {
  const mesh = new THREE.Mesh(eBulletGeo, eBulletMat);
  mesh.position.copy(e.mesh.position);
  const dir = new THREE.Vector3().subVectors(player.position, mesh.position);
  dir.y = 0; dir.normalize().multiplyScalar(cfg.bulletSpeed);
  scene.add(mesh);
  eBullets.push({ mesh, vel: dir });
}

function addScore(n) {
  score += n;
  // 규칙 3: 점수가 1000점 쌓일 때마다 보너스 아이템
  while (score >= nextScoreBonus) {
    nextScoreBonus += SCORE_BONUS_STEP;
    spawnItem();
  }
  updateHud();
}

function killPlayer() {
  if (!playerAlive || invuln > 0) return;
  explode(player.position, 0xffffff, 40);
  explode(player.position, 0xff3333, 30);
  playerAlive = false;
  player.visible = false;
  beep(200, 0.8, 'sawtooth', 0.12, -170);
  lives--;
  // 폭발하면 생존 시간과 보너스 무기는 초기화
  aliveTime = 0; nextTimeBonus = TIME_BONUS_STEP;
  weaponLevel = 1; weaponTime = 0;
  stateTimer = 0;
  if (lives > 0) {
    state = 'dead';
  } else {
    state = 'over';
    setBanner('st-over', '게임 오버 GAME OVER');
  }
  updateHud();
}

// ================== 업데이트 ==================
function updateStars(dt) {
  const sp = starGeo.attributes.position.array;
  for (let i = 0; i < STAR_N; i++) {
    sp[i * 3 + 2] += dt * 30;
    if (sp[i * 3 + 2] > 20) sp[i * 3 + 2] -= 170;
  }
  starGeo.attributes.position.needsUpdate = true;
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 10;
    p.vel.multiplyScalar(0.96);
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
  }
}

function updatePlayer(dt) {
  if (!playerAlive) return;
  let dir = 0;
  if (keys.ArrowLeft || keys.KeyA) dir -= 1;
  if (keys.ArrowRight || keys.KeyD) dir += 1;
  player.position.x = THREE.MathUtils.clamp(player.position.x + dir * 16 * dt, -16, 16);
  player.rotation.z = THREE.MathUtils.lerp(player.rotation.z, -dir * 0.5, 0.15);

  if (invuln > 0) {
    invuln -= dt;
    player.visible = invuln <= 0 || Math.floor(invuln * 10) % 2 === 0;
  }

  fireCooldown -= dt;
  if (keys.Space && fireCooldown <= 0 && (state === 'play' || state === 'ready')) {
    fire(); fireCooldown = 0.18;
  }

  // 보너스 무기 지속 시간
  if (weaponLevel > 1) {
    weaponTime -= dt;
    if (weaponTime <= 0) {
      weaponLevel = 1; weaponTime = 0;
      toast('보너스 무기 종료', '#e6e6e6');
    }
  }

  // 규칙 3: 생존 시간 60초마다 보너스 아이템
  if (state === 'play' || state === 'ready' || state === 'clear') {
    aliveTime += dt;
    if (aliveTime >= nextTimeBonus) {
      nextTimeBonus += TIME_BONUS_STEP;
      spawnItem();
    }
  }
}

function updateBullets(dt) {
  for (let i = pBullets.length - 1; i >= 0; i--) {
    const b = pBullets[i];
    b.mesh.position.z -= 70 * dt;
    b.mesh.position.x += b.vx * dt;
    let hit = false;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (e.mode === 'enter' && e.t < 0) continue;
      if (e.mesh.position.distanceTo(b.mesh.position) < 1.5) {
        hit = true;
        e.hp--;
        if (e.hp > 0) {
          // 규칙 2: 맞출 때마다 점수 누적
          e.flash = 0.2;
          e.mesh.userData.bodyMat.color.set(0x44ddff);
          beep(600, 0.1, 'square', 0.05);
          addScore(HIT_POINTS);
        } else {
          const bonus = e.mode === 'dive' ? 2 : 1;
          kills++;
          explode(e.mesh.position, ENEMY_TYPES[e.type].body);
          scene.remove(e.mesh);
          enemies.splice(j, 1);
          beep(300, 0.25, 'sawtooth', 0.07, -250);
          addScore(ENEMY_TYPES[e.type].score * bonus);
        }
        break;
      }
    }
    if (hit || b.mesh.position.z < -120) { scene.remove(b.mesh); pBullets.splice(i, 1); }
  }

  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    b.mesh.position.addScaledVector(b.vel, dt);
    // 규칙 1: 적 탄에 맞으면 폭발
    if (playerAlive && invuln <= 0 && b.mesh.position.distanceTo(player.position) < 1.1) {
      scene.remove(b.mesh); eBullets.splice(i, 1);
      killPlayer();
      continue;
    }
    if (b.mesh.position.z > 20 || Math.abs(b.mesh.position.x) > 60) { scene.remove(b.mesh); eBullets.splice(i, 1); }
  }
}

function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i], m = it.mesh;
    m.position.z += 11 * dt;
    m.position.y = Math.sin(time * 4) * 0.4;
    m.rotation.y += dt * 3;
    if (playerAlive && m.position.distanceTo(player.position) < 2.2) {
      weaponLevel = Math.min(3, weaponLevel + 1);
      weaponTime = WEAPON_DURATION;
      toast(`무기 강화! ${WEAPON_NAMES[weaponLevel]}`, weaponLevel === 3 ? '#ff5cf0' : '#33e0ff');
      jingle([1047, 1319, 1568, 2093], 0.07);
      scene.remove(m); items.splice(i, 1);
      continue;
    }
    if (m.position.z > 18) { scene.remove(m); items.splice(i, 1); }
  }
}

function updateEnemies(dt) {
  formationTime += dt;
  for (const e of enemies) {
    const m = e.mesh;
    e.t += dt;
    const flap = Math.sin(time * 10 + e.col) * 0.4;
    m.userData.wings[0].rotation.z = flap;
    m.userData.wings[1].rotation.z = -flap;

    if (e.mode === 'enter') {
      if (e.t < 0) continue;
      // 곡선을 그리며 편대 자리로 진입
      const target = slotPos(e, formationTime);
      const k = Math.min(1, e.t / 2.2);
      const arc = Math.sin(k * Math.PI) * 18 * e.side;
      const start = new THREE.Vector3(e.side * 40, 0, -110);
      m.position.lerpVectors(start, target, k * k * (3 - 2 * k));
      m.position.x += arc;
      m.position.y = Math.sin(k * Math.PI) * 6;
      if (k >= 1) e.mode = 'formation';
    } else if (e.mode === 'formation') {
      m.position.lerp(slotPos(e, formationTime), 0.2);
      m.rotation.y = THREE.MathUtils.lerp(m.rotation.y, 0, 0.1);
    } else if (e.mode === 'dive') {
      // 플레이어를 향해 휘어지며 돌진
      const dx = player.position.x - m.position.x;
      e.vel.x += Math.sign(dx) * dt * (18 + stage * 4) + Math.sin(e.t * 4) * dt * 30 * e.side;
      e.vel.x = THREE.MathUtils.clamp(e.vel.x, -14, 14);
      e.vel.z = cfg.diveSpeed;
      m.position.addScaledVector(e.vel, dt);
      m.position.y = Math.sin(e.t * 3) * 1.5;
      m.rotation.y = Math.atan2(e.vel.x, e.vel.z) + Math.PI;
      if (e.shots > 0 && m.position.z < -6 && Math.random() < dt * 1.5) { enemyFire(e); e.shots--; }
      // 규칙 1: 적 전투기와 부딪히면 폭발 (적도 함께 폭발)
      if (playerAlive && invuln <= 0 && m.position.distanceTo(player.position) < 1.8) {
        explode(m.position, ENEMY_TYPES[e.type].body);
        scene.remove(m);
        e.dead = true;
        kills++;
        killPlayer();
      }
      if (m.position.z > 18) {
        // 화면 밖으로 빠지면 뒤쪽에서 다시 편대로 복귀
        e.mode = 'enter'; e.t = 0;
      }
    }
    if (e.flash > 0) {
      e.flash -= dt;
      if (e.flash <= 0) m.userData.bodyMat.color.set(ENEMY_TYPES[e.type].body);
    }
  }
  enemies = enemies.filter(e => !e.dead);
}

function updateAttacks(dt) {
  if (state !== 'play' || !playerAlive) return;
  diveTimer -= dt;
  if (diveTimer <= 0) {
    const idle = enemies.filter(e => e.mode === 'formation');
    const count = Math.min(idle.length, 1 + Math.floor(Math.random() * cfg.maxDivers));
    for (let i = 0; i < count; i++) {
      const e = idle.splice(Math.floor(Math.random() * idle.length), 1)[0];
      e.mode = 'dive'; e.t = 0; e.vel.set(0, 0, 0); e.shots = cfg.shotsPerDiver;
      e.side = Math.random() < 0.5 ? -1 : 1;
      beep(1200, 0.3, 'triangle', 0.03, -900);
    }
    diveTimer = cfg.diveInterval + Math.random();
  }
  if (Math.random() < dt * cfg.formationFire) {
    const shooters = enemies.filter(e => e.mode === 'formation');
    if (shooters.length) enemyFire(shooters[Math.floor(Math.random() * shooters.length)]);
  }
}

// 위험 판정: 돌격 중인 적이나 적 탄이 가까이 있으면 DANGER
function inDanger() {
  if (!playerAlive) return false;
  const p = player.position;
  for (const e of enemies) if (e.mode === 'dive' && e.mesh.position.distanceTo(p) < 10) return true;
  for (const b of eBullets) if (b.mesh.position.distanceTo(p) < 7) return true;
  return false;
}

function updateState() {
  if (state === 'ready') {
    setBanner('st-ready', `STAGE ${stage} 준비 READY`);
    if (stateTimer > 2) { state = 'play'; stateTimer = 0; }
  } else if (state === 'play') {
    if (inDanger()) setBanner('st-danger', '위험! DANGER');
    else setBanner('st-fight', '전투 중 FIGHTING');
    // 규칙 4: 적을 모두 격추하면 스테이지 클리어
    if (enemies.length === 0) {
      state = 'clear'; stateTimer = 0;
      removeAll(eBullets);
      jingle([784, 988, 1175, 1568]);
    }
  } else if (state === 'clear') {
    setBanner('st-clear', stage < MAX_STAGE ? `STAGE ${stage} 클리어 CLEAR!` : '전 단계 클리어 ALL CLEAR!');
    if (stateTimer > 2.5) {
      if (stage >= MAX_STAGE) {
        // 끝나는 조건: 5단계 모두 클리어 → 승리
        state = 'victory'; stateTimer = 0;
        showResult(true);
      } else {
        stage++;
        beginStage();
      }
    }
  } else if (state === 'dead') {
    setBanner('st-hit', `피격! 남은 목숨 ${lives}`);
    if (stateTimer > 2) {
      removeAll(eBullets);
      respawnPlayer(true);
      state = 'play'; stateTimer = 0;
    }
  } else if (state === 'over') {
    // 끝나는 조건: 목숨을 모두 잃음 → 패배
    if (stateTimer > 1.5 && $('resultScreen').classList.contains('hidden')) showResult(false);
  }
}

let hudTick = 0;
function update(dt) {
  time += dt;
  stateTimer += dt;
  updateStars(dt);
  updateParticles(dt);

  if (state === 'title') {
    player.rotation.z = Math.sin(time * 2) * 0.3;
    return;
  }
  if (state !== 'over' && state !== 'victory') playTime += dt;

  updatePlayer(dt);
  updateBullets(dt);
  updateItems(dt);
  updateEnemies(dt);
  updateAttacks(dt);
  updateState();

  hudTick -= dt;
  if (hudTick <= 0) { updateHud(); hudTick = 0.1; }
}

// ================== 루프 ==================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  const camX = LOOK.x + player.position.x * 0.3;
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, camX, 0.05);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
updateHud();
setBanner('st-ready', '준비 READY');
requestAnimationFrame(loop);
