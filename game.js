const mount = document.getElementById('gameMount');
const $ = (id) => document.getElementById(id);

const UNITS = {
  volt: { name: 'VOLT', color: 0x67f2cb, trim: 0xb39aff, hp: 100, speed: 8.2, damage: 18, fireRate: 0.58, description: '기본에 충실한 균형형. 어떤 상황에도 대응할 수 있다.' },
  bloom: { name: 'BLOOM', color: 0x9ee6a5, trim: 0xffd57c, hp: 132, speed: 7.3, damage: 17, fireRate: 0.67, description: '높은 체력과 안정적인 생존력을 지닌 방어형 유닛.' },
  nova: { name: 'NOVA', color: 0xc6a4ff, trim: 0xff8791, hp: 88, speed: 8.8, damage: 14, fireRate: 0.39, description: '빠른 연사와 민첩한 움직임을 갖춘 공격형 유닛.' }
};

const UPGRADES = [
  { icon: '✦', name: '출력 증폭', description: '공격력이 25% 증가한다.', apply: (p) => { p.damage *= 1.25; } },
  { icon: '⌁', name: '고속 연사', description: '공격 간격이 18% 줄어든다.', apply: (p) => { p.fireRate *= 0.82; } },
  { icon: '✚', name: '보호막 강화', description: '최대 체력 25 증가, 체력 30 회복.', apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { icon: '➤', name: '경량 프레임', description: '이동 속도가 12% 증가한다.', apply: (p) => { p.speed *= 1.12; } },
  { icon: '◎', name: '수집 범위 확장', description: '경험치 코어를 더 멀리서 끌어온다.', apply: (p) => { p.magnet += 2; } },
  { icon: '↗', name: '관통 코어', description: '탄환이 적 하나를 추가로 관통한다.', apply: (p) => { p.pierce += 1; } },
  { icon: '≫', name: '대시 튜닝', description: '대시 재사용 대기시간이 줄어든다.', apply: (p) => { p.dashCooldown = Math.max(0.9, p.dashCooldown - 0.4); } },
  { icon: '♥', name: '긴급 수복', description: '체력을 45 회복한다.', apply: (p) => { p.hp = Math.min(p.maxHp, p.hp + 45); } }
];

const ARENA_RADIUS = 15.8;
const STORAGE_KEYS = { scores: 'vzScores', best: 'vzBest', nickname: 'vzNick' };
let THREE;
let scene;
let camera;
let renderer;
let arena;
let player;
let playerMesh;
let selectedUnit = 'volt';
let gameState = 'menu';
let previousTime = 0;
let elapsed = 0;
let remaining = 150;
let score = 0;
let kills = 0;
let level = 1;
let xp = 0;
let xpRequired = 30;
let spawnTimer = 0.25;
let fireTimer = 0.2;
let invulnerableTimer = 0;
let dashTimer = 0;
let dashCooldownTimer = 0;
let enemies = [];
let playerShots = [];
let enemyShots = [];
let xpOrbs = [];
let particles = [];
let pressedKeys = Object.create(null);
let toastTimeout = 0;

function material(color, roughness = 0.42, metalness = 0.2, emissive = 0x000000, intensity = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: intensity });
}

function makeMesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildArena() {
  arena = new THREE.Group();
  scene.add(arena);

  const floor = makeMesh(new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS, 1.1, 96), material(0x152842, 0.82, 0.22), arena, 0, -0.72, 0);
  floor.receiveShadow = true;

  const innerFloor = makeMesh(new THREE.CircleGeometry(ARENA_RADIUS - 0.18, 96), material(0x12243a, 0.72, 0.12), arena, 0, -0.14, 0);
  innerFloor.rotation.x = -Math.PI / 2;
  innerFloor.receiveShadow = true;

  const grid = new THREE.GridHelper(ARENA_RADIUS * 2, 32, 0x355b72, 0x28445e);
  grid.position.y = -0.125;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  arena.add(grid);

  for (let radius = 4; radius < 16; radius += 3.5) {
    const ring = makeMesh(new THREE.RingGeometry(radius - 0.018, radius + 0.018, 96), new THREE.MeshBasicMaterial({ color: radius % 2 ? 0x477a8c : 0x7767ad, transparent: true, opacity: 0.3, side: THREE.DoubleSide }), arena, 0, -0.11, 0);
    ring.rotation.x = -Math.PI / 2;
  }

  const rim = makeMesh(new THREE.TorusGeometry(ARENA_RADIUS - 0.12, 0.19, 8, 128), new THREE.MeshStandardMaterial({ color: 0x55eacb, emissive: 0x145b57, emissiveIntensity: 1.45, metalness: 0.6, roughness: 0.28 }), arena, 0, -0.06, 0);
  rim.rotation.x = Math.PI / 2;

  const outerRim = makeMesh(new THREE.TorusGeometry(ARENA_RADIUS + 0.36, 0.075, 6, 128), new THREE.MeshStandardMaterial({ color: 0x8872dc, emissive: 0x34275e, emissiveIntensity: 1.2, metalness: 0.5 }), arena, 0, -0.38, 0);
  outerRim.rotation.x = Math.PI / 2;

  for (let i = 0; i < 12; i += 1) {
    const angle = i * Math.PI / 6;
    const pylon = new THREE.Group();
    pylon.position.set(Math.cos(angle) * (ARENA_RADIUS + 0.03), 0, Math.sin(angle) * (ARENA_RADIUS + 0.03));
    pylon.rotation.y = -angle;
    arena.add(pylon);
    const base = makeMesh(new THREE.CylinderGeometry(0.48, 0.58, 0.5, 6), material(0x263f5b, 0.4, 0.55), pylon, 0, -0.25, 0);
    base.castShadow = true;
    const crystalColor = i % 3 === 0 ? 0x70f3d1 : 0x8f83d9;
    const crystal = makeMesh(new THREE.OctahedronGeometry(0.28), material(crystalColor, 0.2, 0.45, crystalColor, 1.8), pylon, 0, 0.17, 0);
    crystal.castShadow = true;
  }

  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4;
    makeMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 32), new THREE.MeshBasicMaterial({ color: 0x49758c, transparent: true, opacity: 0.24 }), arena, Math.cos(angle) * 9, -0.06, Math.sin(angle) * 9);
  }
}

function createPlayerModel() {
  const unit = UNITS[selectedUnit];
  const root = new THREE.Group();
  const bodyMaterial = material(unit.color, 0.28, 0.42, unit.color, 0.38);
  const trimMaterial = material(unit.trim, 0.28, 0.55, unit.trim, 0.28);

  const core = makeMesh(new THREE.IcosahedronGeometry(0.64, 1), bodyMaterial, root, 0, 0.78, 0);
  core.scale.set(1, 1.12, 0.94);
  core.castShadow = true;

  const belt = makeMesh(new THREE.TorusGeometry(0.69, 0.07, 8, 32), trimMaterial, root, 0, 0.63, 0);
  belt.rotation.x = Math.PI / 2;

  const crystal = makeMesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: 0xf4ffff, emissive: unit.color, emissiveIntensity: 2.5, metalness: 0.15, roughness: 0.18 }), root, 0, 1.54, 0);
  crystal.castShadow = true;

  for (let i = 0; i < 3; i += 1) {
    const angle = i * Math.PI * 2 / 3;
    const spike = makeMesh(new THREE.ConeGeometry(0.15, 0.43, 5), trimMaterial, root, Math.cos(angle) * 0.52, 0.71, Math.sin(angle) * 0.52);
    spike.rotation.z = -0.35;
  }

  const aura = makeMesh(new THREE.TorusGeometry(1.02, 0.025, 6, 48), new THREE.MeshBasicMaterial({ color: unit.color, transparent: true, opacity: 0.66 }), root, 0, 0.12, 0);
  aura.rotation.x = Math.PI / 2;

  const shadow = makeMesh(new THREE.CircleGeometry(0.88, 32), new THREE.MeshBasicMaterial({ color: 0x050a16, transparent: true, opacity: 0.38, depthWrite: false }), root, 0, -0.11, 0);
  shadow.rotation.x = -Math.PI / 2;

  root.userData = { core, crystal, aura };
  return root;
}

function addPlayer() {
  if (playerMesh) scene.remove(playerMesh);
  playerMesh = createPlayerModel();
  scene.add(playerMesh);
  const unit = UNITS[selectedUnit];
  player = { x: 0, z: 0, hp: unit.hp, maxHp: unit.hp, speed: unit.speed, damage: unit.damage, fireRate: unit.fireRate, magnet: 3.2, pierce: 0, dashCooldown: 2.3, fireColor: unit.color };
  playerMesh.position.set(0, 0, 0);
}

function createEnemy(type) {
  const root = new THREE.Group();
  let radius;
  let hp;
  let speed;
  let damage;
  let value;
  let color;
  let geometry;

  if (type === 'runner') {
    radius = 0.43; hp = 20; speed = 7.7; damage = 9; value = 135; color = 0xffd079; geometry = new THREE.TetrahedronGeometry(0.48);
  } else if (type === 'brute') {
    radius = 0.76; hp = 104; speed = 2.8; damage = 20; value = 260; color = 0xb39aff; geometry = new THREE.DodecahedronGeometry(0.75);
  } else if (type === 'sniper') {
    radius = 0.53; hp = 44; speed = 3.4; damage = 11; value = 195; color = 0x75bfff; geometry = new THREE.OctahedronGeometry(0.58, 1);
  } else {
    radius = 0.53; hp = 34; speed = 4.3; damage = 12; value = 110; color = 0xff8999; geometry = new THREE.IcosahedronGeometry(0.52, 1);
  }

  const body = makeMesh(geometry, material(color, 0.34, 0.32, color, 0.35), root, 0, radius + 0.12, 0);
  body.castShadow = true;
  if (type === 'runner') body.rotation.y = Math.PI / 4;
  if (type === 'brute') body.scale.set(1.05, 1.1, 0.95);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x17243d });
  for (const side of [-1, 1]) {
    makeMesh(new THREE.SphereGeometry(0.065, 8, 8), eyeMaterial, root, side * radius * 0.26, radius + 0.15, radius * 0.76);
  }

  const ring = makeMesh(new THREE.TorusGeometry(radius * 0.8, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 }), root, 0, 0.12, 0);
  ring.rotation.x = Math.PI / 2;
  const shadow = makeMesh(new THREE.CircleGeometry(radius * 1.12, 20), new THREE.MeshBasicMaterial({ color: 0x020611, transparent: true, opacity: 0.34, depthWrite: false }), root, 0, -0.12, 0);
  shadow.rotation.x = -Math.PI / 2;

  root.userData = { type, radius, hp, maxHp: hp, speed, damage, value, color, body, ring, shotTimer: 1.5 + Math.random(), phase: Math.random() * 6, hitTimer: 0 };
  return root;
}

function spawnEnemy() {
  if (enemies.length >= 34) return;
  const angle = Math.random() * Math.PI * 2;
  const distance = ARENA_RADIUS - 1.2;
  const time = elapsed;
  const roll = Math.random();
  let type = 'drone';
  if (time < 28) type = roll < 0.78 ? 'drone' : 'runner';
  else if (time < 75) type = roll < 0.48 ? 'drone' : roll < 0.76 ? 'runner' : 'brute';
  else type = roll < 0.38 ? 'drone' : roll < 0.61 ? 'runner' : roll < 0.82 ? 'brute' : 'sniper';

  const enemy = createEnemy(type);
  const difficulty = 1 + time / 145;
  enemy.userData.hp *= difficulty;
  enemy.userData.maxHp = enemy.userData.hp;
  enemy.userData.speed += time * 0.008;
  enemy.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
  scene.add(enemy);
  enemies.push(enemy);
}

function closestEnemy() {
  let target = null;
  let nearestDistance = 14;
  for (const enemy of enemies) {
    const distance = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      target = enemy;
    }
  }
  return target;
}

function createShot(x, z, dx, dz, hostile = false) {
  const color = hostile ? 0xff728f : player.fireColor;
  const mesh = makeMesh(new THREE.SphereGeometry(hostile ? 0.13 : 0.105, 10, 10), new THREE.MeshBasicMaterial({ color }), scene, x, 0.92, z);
  return { mesh, vx: dx * (hostile ? 8.5 : 19), vz: dz * (hostile ? 8.5 : 19), life: hostile ? 3 : 1.2, damage: hostile ? 12 : player.damage, pierce: hostile ? 0 : player.pierce, hit: new Set(), hostile };
}

function fireAtTarget() {
  const target = closestEnemy();
  if (!target) return;
  const dx = target.position.x - player.x;
  const dz = target.position.z - player.z;
  const distance = Math.hypot(dx, dz) || 1;
  playerShots.push(createShot(player.x + dx / distance * 0.65, player.z + dz / distance * 0.65, dx / distance, dz / distance));
  createBurst(player.x, 0.9, player.z, player.fireColor, 4, 0.65);
}

function createOrb(x, z, value) {
  const root = new THREE.Group();
  makeMesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0xd3b5ff, emissive: 0x8660ce, emissiveIntensity: 2.3, metalness: 0.35, roughness: 0.22 }), root, 0, 0, 0);
  const halo = makeMesh(new THREE.TorusGeometry(0.29, 0.025, 5, 20), new THREE.MeshBasicMaterial({ color: 0xb39aff, transparent: true, opacity: 0.8 }), root, 0, 0, 0);
  halo.rotation.x = Math.PI / 2;
  root.position.set(x, 0.42, z);
  scene.add(root);
  xpOrbs.push({ mesh: root, value, phase: Math.random() * 6 });
}

function createBurst(x, y, z, color, count = 8, power = 3) {
  for (let i = 0; i < count; i += 1) {
    const mesh = makeMesh(new THREE.SphereGeometry(0.055 + Math.random() * 0.045, 6, 6), new THREE.MeshBasicMaterial({ color, transparent: true }), scene, x, y, z);
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * power;
    particles.push({ mesh, vx: Math.cos(angle) * speed, vy: Math.random() * power, vz: Math.sin(angle) * speed, life: 0.35 + Math.random() * 0.25, maxLife: 0.6 });
  }
}

function setScreen(nextState) {
  gameState = nextState;
  const visibleId = { menu: 'startScreen', paused: 'pauseScreen', upgrade: 'upgradeScreen', result: 'resultScreen' }[nextState] || '';
  for (const id of ['startScreen', 'pauseScreen', 'upgradeScreen', 'resultScreen']) {
    $(id).classList.toggle('hidden', id !== visibleId);
  }
}

function showToast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => $('toast').classList.remove('show'), 1250);
}

function updateHud() {
  if (!player) return;
  $('hpValue').textContent = String(Math.max(0, Math.ceil(player.hp)));
  $('hpBar').style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`;
  $('levelValue').textContent = String(level).padStart(2, '0');
  $('timeValue').textContent = formatTime(remaining);
  $('killValue').textContent = String(kills).padStart(3, '0');
  $('xpLabel').textContent = `${xp} / ${xpRequired}`;
  $('xpBar').style.width = `${Math.min(100, xp / xpRequired * 100)}%`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function openUpgradeScreen() {
  if (gameState !== 'playing') return;
  setScreen('upgrade');
  const choices = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  const host = $('upgradeOptions');
  host.replaceChildren();
  for (const upgrade of choices) {
    const button = document.createElement('button');
    button.className = 'upgrade-card';
    const icon = document.createElement('div');
    icon.className = 'upgrade-icon';
    icon.textContent = upgrade.icon;
    const name = document.createElement('b');
    name.textContent = upgrade.name;
    const description = document.createElement('small');
    description.textContent = upgrade.description;
    button.append(icon, name, description);
    button.addEventListener('click', () => {
      upgrade.apply(player);
      setScreen('playing');
      previousTime = performance.now();
      showToast(`${upgrade.name} 적용`);
      updateHud();
    }, { once: true });
    host.append(button);
  }
}

function collectXp(value) {
  if (gameState !== 'playing') return;
  xp += value;
  if (xp >= xpRequired) {
    xp -= xpRequired;
    level += 1;
    xpRequired = Math.round(30 + level * 14);
    openUpgradeScreen();
  }
  updateHud();
}

function damagePlayer(amount) {
  if (invulnerableTimer > 0 || gameState !== 'playing') return;
  player.hp -= amount;
  invulnerableTimer = 0.65;
  createBurst(player.x, 0.8, player.z, 0xff718e, 10, 2.2);
  showToast('피격! 거리를 벌려!');
  if (player.hp <= 0) endGame(false);
  updateHud();
}

function clearObjects() {
  for (const group of [enemies, playerShots, enemyShots, xpOrbs, particles]) {
    for (const item of group) {
      const object = item.mesh || item;
      if (object.parent) object.parent.remove(object);
    }
    group.length = 0;
  }
  if (playerMesh) {
    scene.remove(playerMesh);
    playerMesh = null;
  }
  player = null;
  pressedKeys = Object.create(null);
}

function startGame() {
  clearObjects();
  elapsed = 0;
  remaining = 150;
  score = 0;
  kills = 0;
  level = 1;
  xp = 0;
  xpRequired = 30;
  spawnTimer = 0.25;
  fireTimer = 0.2;
  invulnerableTimer = 0;
  dashTimer = 0;
  dashCooldownTimer = 0;
  addPlayer();
  updateHud();
  setScreen('playing');
  previousTime = performance.now();
}

function endGame(won) {
  if (gameState === 'result') return;
  setScreen('result');
  $('resultKicker').textContent = won ? 'TRIAL COMPLETE' : 'SIGNAL LOST';
  $('resultTitle').innerHTML = won ? '생존 <em>성공.</em>' : '전투 <em>종료.</em>';
  $('finalScore').textContent = Math.floor(score).toLocaleString();
  $('resultDescription').textContent = `생존 ${formatTime(elapsed)} · 제거 ${kills}기 · 레벨 ${level} · 닉네임을 입력해 기록을 저장해.`;
  const best = Math.max(Math.floor(score), Number(localStorage.getItem(STORAGE_KEYS.best) || 0));
  localStorage.setItem(STORAGE_KEYS.best, String(best));
  $('bestValue').textContent = best.toLocaleString();
  $('nickname').value = localStorage.getItem(STORAGE_KEYS.nickname) || '';
  $('saveButton').disabled = false;
  $('saveButton').textContent = 'SAVE';
}

function loadScores() {
  try {
    const scores = JSON.parse(localStorage.getItem(STORAGE_KEYS.scores) || '[]');
    return Array.isArray(scores) ? scores : [];
  } catch {
    return [];
  }
}

function renderScores() {
  const scores = loadScores().sort((a, b) => b.score - a.score).slice(0, 5);
  const host = $('rankList');
  host.replaceChildren();
  if (scores.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'rank-empty';
    empty.textContent = '아직 기록이 없어. 첫 번째 랭커가 되어 봐.';
    host.append(empty);
    return;
  }
  scores.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'rank-row';
    const rank = document.createElement('span');
    rank.className = 'rank-no';
    rank.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'rank-name';
    name.textContent = entry.name;
    const points = document.createElement('span');
    points.className = 'rank-score';
    points.textContent = Number(entry.score).toLocaleString();
    row.append(rank, name, points);
    host.append(row);
  });
}

function saveScore() {
  const nickname = $('nickname').value.trim().replace(/[<>]/g, '').slice(0, 12) || 'PLAYER';
  localStorage.setItem(STORAGE_KEYS.nickname, nickname);
  const scores = loadScores();
  scores.push({ name: nickname, score: Math.floor(score), unit: UNITS[selectedUnit].name, date: Date.now() });
  scores.sort((a, b) => b.score - a.score);
  localStorage.setItem(STORAGE_KEYS.scores, JSON.stringify(scores.slice(0, 30)));
  renderScores();
  $('saveButton').disabled = true;
  $('saveButton').textContent = 'SAVED';
  showToast('기록 저장 완료');
}

function updateEnemyMotion(delta) {
  for (const enemy of enemies) {
    const data = enemy.userData;
    const dx = player.x - enemy.position.x;
    const dz = player.z - enemy.position.z;
    const distance = Math.hypot(dx, dz) || 1;
    let direction = 1;
    data.phase += delta * 2.5;
    data.hitTimer = Math.max(0, data.hitTimer - delta);

    if (data.type === 'sniper') {
      if (distance < 7) direction = -0.8;
      else if (distance < 9) direction = 0;
      data.shotTimer -= delta;
      if (data.shotTimer <= 0 && distance < 15) {
        enemyShots.push(createShot(enemy.position.x, enemy.position.z, dx / distance, dz / distance, true));
        data.shotTimer = 2.2 + Math.random() * 0.5;
      }
    }

    enemy.position.x += dx / distance * data.speed * direction * delta;
    enemy.position.z += dz / distance * data.speed * direction * delta;
    enemy.position.y = Math.sin(data.phase) * 0.07;
    data.body.rotation.y += delta * (data.type === 'runner' ? 3 : 1.1);
    data.ring.rotation.z -= delta * 0.7;
    data.body.material.emissiveIntensity = data.hitTimer > 0 ? 1.7 : 0.35;

    if (distance < data.radius + 0.72) damagePlayer(data.damage * delta * 1.45);
  }
}

function updateProjectiles(delta) {
  updateShotList(playerShots, delta, false);
  updateShotList(enemyShots, delta, true);
}

function updateShotList(shots, delta, hostile) {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    shot.mesh.position.x += shot.vx * delta;
    shot.mesh.position.z += shot.vz * delta;
    shot.life -= delta;
    let remove = shot.life <= 0;

    if (!hostile) {
      for (let j = enemies.length - 1; j >= 0 && !remove; j -= 1) {
        const enemy = enemies[j];
        const data = enemy.userData;
        if (shot.hit.has(enemy)) continue;
        const distance = Math.hypot(shot.mesh.position.x - enemy.position.x, shot.mesh.position.z - enemy.position.z);
        if (distance < data.radius + 0.16) {
          data.hp -= shot.damage;
          data.hitTimer = 0.1;
          shot.hit.add(enemy);
          createBurst(shot.mesh.position.x, 0.9, shot.mesh.position.z, player.fireColor, 3, 1.2);
          if (data.hp <= 0) {
            score += data.value;
            kills += 1;
            createOrb(enemy.position.x, enemy.position.z, data.type === 'brute' ? 15 : 8);
            createBurst(enemy.position.x, 0.85, enemy.position.z, data.color, 13, 2.4);
            scene.remove(enemy);
            enemies.splice(j, 1);
          }
          if (shot.pierce > 0) shot.pierce -= 1;
          else remove = true;
        }
      }
    } else {
      const distance = Math.hypot(shot.mesh.position.x - player.x, shot.mesh.position.z - player.z);
      if (distance < 0.78) {
        damagePlayer(shot.damage);
        remove = true;
      }
    }

    if (remove) {
      scene.remove(shot.mesh);
      shots.splice(i, 1);
    }
  }
}

function updateOrbs(delta) {
  for (let i = xpOrbs.length - 1; i >= 0; i -= 1) {
    const orb = xpOrbs[i];
    const mesh = orb.mesh;
    orb.phase += delta * 2.4;
    mesh.rotation.y += delta * 1.7;
    mesh.position.y = 0.42 + Math.sin(orb.phase) * 0.12;
    const dx = player.x - mesh.position.x;
    const dz = player.z - mesh.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < player.magnet) {
      const pull = Math.min(1, delta * (2.4 + (player.magnet - distance) * 0.24));
      mesh.position.x += dx * pull;
      mesh.position.z += dz * pull;
    }
    if (distance < 0.95) {
      scene.remove(mesh);
      xpOrbs.splice(i, 1);
      collectXp(orb.value);
      if (gameState !== 'playing') return;
    }
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.mesh.position.x += particle.vx * delta;
    particle.mesh.position.y += particle.vy * delta;
    particle.mesh.position.z += particle.vz * delta;
    particle.vy -= 8 * delta;
    particle.life -= delta;
    particle.mesh.material.opacity = Math.max(0, particle.life / particle.maxLife);
    particle.mesh.scale.setScalar(Math.max(0.01, particle.life / particle.maxLife));
    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      particles.splice(i, 1);
    }
  }
}

function updatePlayer(delta) {
  let dx = Number(Boolean(pressedKeys.KeyD || pressedKeys.ArrowRight)) - Number(Boolean(pressedKeys.KeyA || pressedKeys.ArrowLeft));
  let dz = Number(Boolean(pressedKeys.KeyS || pressedKeys.ArrowDown)) - Number(Boolean(pressedKeys.KeyW || pressedKeys.ArrowUp));
  const length = Math.hypot(dx, dz) || 1;
  dx /= length;
  dz /= length;
  const movementBoost = dashTimer > 0 ? 2.8 : 1;
  player.x += dx * player.speed * movementBoost * delta;
  player.z += dz * player.speed * movementBoost * delta;

  const distance = Math.hypot(player.x, player.z);
  if (distance > ARENA_RADIUS - 1.2) {
    const scale = (ARENA_RADIUS - 1.2) / distance;
    player.x *= scale;
    player.z *= scale;
  }

  playerMesh.position.set(player.x, Math.sin(elapsed * 5) * 0.045, player.z);
  if (dx !== 0 || dz !== 0) playerMesh.rotation.y = Math.atan2(dx, dz);
  playerMesh.userData.core.rotation.y += delta * 1.3;
  playerMesh.userData.crystal.rotation.y -= delta * 1.6;
  playerMesh.userData.crystal.rotation.x += delta * 0.8;
  playerMesh.userData.aura.rotation.z += delta * 0.8;
  playerMesh.userData.aura.material.opacity = 0.48 + Math.sin(elapsed * 5) * 0.17;
}

function updateGame(delta) {
  if (gameState !== 'playing') return;
  elapsed += delta;
  remaining = Math.max(0, 150 - elapsed);
  invulnerableTimer = Math.max(0, invulnerableTimer - delta);
  dashTimer = Math.max(0, dashTimer - delta);
  dashCooldownTimer = Math.max(0, dashCooldownTimer - delta);

  updatePlayer(delta);

  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = Math.max(0.48, 1.05 - elapsed * 0.003) + Math.random() * 0.18;
  }

  fireTimer -= delta;
  if (fireTimer <= 0) {
    fireAtTarget();
    fireTimer = player.fireRate;
  }

  updateEnemyMotion(delta);
  updateProjectiles(delta);
  updateOrbs(delta);
  updateParticles(delta);
  score += delta * 5;

  if (remaining <= 0) {
    endGame(true);
    return;
  }
  updateHud();
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(0.035, Math.max(0, (now - previousTime) / 1000 || 0));
  previousTime = now;
  if (gameState === 'playing') updateGame(delta);
  if (arena && (gameState === 'playing' || gameState === 'menu')) arena.rotation.y = Math.sin(now * 0.00012) * 0.012;
  renderer.render(scene, camera);
}

function selectUnit(unitId) {
  if (!UNITS[unitId] || gameState !== 'menu') return;
  selectedUnit = unitId;
  document.querySelectorAll('.operator-card').forEach((button) => {
    const selected = button.dataset.unit === unitId;
    button.classList.toggle('selected', selected);
    button.querySelector('.select-mark').textContent = selected ? 'SELECTED' : 'SELECT';
  });
  $('operatorDescription').textContent = UNITS[unitId].description;
}

function handleDash() {
  if (gameState !== 'playing' || dashCooldownTimer > 0) return;
  dashTimer = 0.2;
  dashCooldownTimer = player.dashCooldown;
  let dx = Number(Boolean(pressedKeys.KeyD || pressedKeys.ArrowRight)) - Number(Boolean(pressedKeys.KeyA || pressedKeys.ArrowLeft));
  let dz = Number(Boolean(pressedKeys.KeyS || pressedKeys.ArrowDown)) - Number(Boolean(pressedKeys.KeyW || pressedKeys.ArrowUp));
  const length = Math.hypot(dx, dz);
  if (length === 0) {
    const target = closestEnemy();
    if (target) {
      dx = player.x - target.position.x;
      dz = player.z - target.position.z;
      const targetLength = Math.hypot(dx, dz) || 1;
      dx /= targetLength;
      dz /= targetLength;
    } else {
      dz = -1;
    }
  } else {
    dx /= length;
    dz /= length;
  }
  player.x += dx * 1.25;
  player.z += dz * 1.25;
  const radius = Math.hypot(player.x, player.z);
  if (radius > ARENA_RADIUS - 1.2) {
    const scale = (ARENA_RADIUS - 1.2) / radius;
    player.x *= scale;
    player.z *= scale;
  }
  createBurst(player.x, 0.8, player.z, player.fireColor, 12, 2.2);
}

function handleKeyDown(event) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  pressedKeys[event.code] = true;
  if (event.repeat) return;
  if (event.code === 'KeyP' && gameState === 'playing') {
    setScreen('paused');
    pressedKeys = Object.create(null);
  } else if (event.code === 'KeyP' && gameState === 'paused') {
    setScreen('playing');
    previousTime = performance.now();
  } else if (event.code === 'Space') {
    handleDash();
  }
}

function showStartupError(error) {
  console.error(error);
  mount.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'error-panel';
  const message = document.createElement('div');
  const heading = document.createElement('b');
  heading.textContent = '3D ENGINE COULD NOT START';
  const detail = document.createElement('span');
  detail.textContent = '인터넷 연결을 확인한 뒤 페이지를 새로고침해 줘.';
  message.append(heading, detail);
  panel.append(message);
  mount.append(panel);
}

async function boot() {
  try {
    THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081326);
    scene.fog = new THREE.FogExp2(0x081326, 0.027);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 23, 25);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    mount.append(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xaacaff, 0x17243e, 2.15));
    const keyLight = new THREE.DirectionalLight(0xcaf9ff, 3.2);
    keyLight.position.set(-7, 18, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -22;
    keyLight.shadow.camera.right = 22;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    scene.add(keyLight);
    const violetLight = new THREE.PointLight(0x9876ff, 22, 26);
    violetLight.position.set(9, 7, -8);
    scene.add(violetLight);
    const mintLight = new THREE.PointLight(0x52f4d0, 16, 24);
    mintLight.position.set(-10, 5, 8);
    scene.add(mintLight);

    buildArena();
    addPlayer();
    playerMesh.visible = false;
    renderScores();
    $('bestValue').textContent = Number(localStorage.getItem(STORAGE_KEYS.best) || 0).toLocaleString();

    document.querySelectorAll('.operator-card').forEach((button) => button.addEventListener('click', () => selectUnit(button.dataset.unit)));
    $('startButton').addEventListener('click', startGame);
    $('resumeButton').addEventListener('click', () => {
      setScreen('playing');
      previousTime = performance.now();
    });
    $('retryButton').addEventListener('click', startGame);
    $('homeButton').addEventListener('click', () => {
      clearObjects();
      setScreen('menu');
      renderScores();
    });
    $('saveButton').addEventListener('click', saveScore);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', (event) => { pressedKeys[event.code] = false; });
    window.addEventListener('blur', () => {
      pressedKeys = Object.create(null);
      if (gameState === 'playing') setScreen('paused');
    });
    window.addEventListener('resize', resizeRenderer);
    const resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(mount);

    previousTime = performance.now();
    requestAnimationFrame(animate);
  } catch (error) {
    showStartupError(error);
  }
}

boot();