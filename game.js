import * as THREE from
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ===================================
// VECTOR ZERO : CORE GAME
// ===================================

const arena = document.getElementById('arena');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x182236);
scene.fog = new THREE.Fog(0x182236, 17, 36);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 12, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

arena.appendChild(renderer.domElement);

// ===================================
// LIGHTING
// ===================================

scene.add(new THREE.HemisphereLight(
  0xc9e8ff,
  0x263044,
  2.0
));

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-5, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const accent = new THREE.PointLight(0x75e5d0, 12, 18);
accent.position.set(0, 5, 0);
scene.add(accent);

// ===================================
// ARENA
// ===================================

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(28, 28),
  new THREE.MeshStandardMaterial({
    color: 0x26354b,
    roughness: 0.88
  })
);

floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Grid
const grid = new THREE.GridHelper(
  28, 28, 0x53677e, 0x3b4c63
);
grid.position.y = 0.015;
scene.add(grid);

// Arena boundary
const borderMaterial = new THREE.MeshStandardMaterial({
  color: 0x75e5d0,
  emissive: 0x245f5a,
  emissiveIntensity: 0.8
});

function makeWall(x, z, width, depth) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.35, depth),
    borderMaterial
  );
  wall.position.set(x, 0.17, z);
  wall.receiveShadow = true;
  scene.add(wall);
}

makeWall(0, -14, 28, 0.3);
makeWall(0, 14, 28, 0.3);
makeWall(-14, 0, 0.3, 28);
makeWall(14, 0, 0.3, 28);

// Decorative arena objects
for (let i = 0; i < 12; i++) {
  const angle = i / 12 * Math.PI * 2;
  const x = Math.cos(angle) * 11;
  const z = Math.sin(angle) * 11;

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 1.3, 6),
    new THREE.MeshStandardMaterial({
      color: 0x435873,
      roughness: 0.5
    })
  );

  pillar.position.set(x, 0.65, z);
  pillar.castShadow = true;
  scene.add(pillar);
}

// ===================================
// PLAYER
// ===================================

const player = new THREE.Group();
scene.add(player);

const bodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x75e5d0,
  roughness: 0.42,
  metalness: 0.12
});

const body = new THREE.Mesh(
  new THREE.SphereGeometry(0.58, 24, 18),
  bodyMaterial
);

body.scale.set(1, 0.85, 1);
body.position.y = 0.65;
body.castShadow = true;
player.add(body);

// Face
const eyeMaterial = new THREE.MeshStandardMaterial({
  color: 0x17243a
});

for (const x of [-0.2, 0.2]) {
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 12, 12),
    eyeMaterial
  );

  eye.position.set(x, 0.73, 0.49);
  player.add(eye);
}

// Player aura
const aura = new THREE.Mesh(
  new THREE.TorusGeometry(0.78, 0.035, 8, 40),
  new THREE.MeshBasicMaterial({
    color: 0x75e5d0,
    transparent: true,
    opacity: 0.65
  })
);

aura.rotation.x = Math.PI / 2;
aura.position.y = 0.08;
player.add(aura);

// Player shadow
const playerShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.55, 24),
  new THREE.MeshBasicMaterial({
    color: 0x07101d,
    transparent: true,
    opacity: 0.35
  })
);

playerShadow.rotation.x = -Math.PI / 2;
playerShadow.position.y = 0.025;
player.add(playerShadow);

// ===================================
// GAME STATE
// ===================================

let running = false;
let paused = false;
let gameOver = false;

let health = 100;
let maxHealth = 100;
let xp = 0;
let level = 1;
let kills = 0;
let elapsed = 0;

let damage = 1;
let attackRange = 8;
let attackCooldown = 0;
let attackSpeed = 0.65;
let playerSpeed = 5.5;
let dashCooldown = 0;
let dashTime = 0;

let enemies = [];
let projectiles = [];
let particles = [];

const keys = {};

const clock = new THREE.Clock();

// ===================================
// ENEMIES
// ===================================

function createEnemy() {
  if (enemies.length >= 24) return;

  const angle = Math.random() * Math.PI * 2;
  const distance = 11.5;

  const group = new THREE.Group();

  const type = Math.random();

  let color = 0xff8e9e;
  let size = 0.48;
  let hp = 2;
  let speed = 1.65;

  if (type > 0.72) {
    color = 0xa99aff;
    size = 0.65;
    hp = 4;
    speed = 1.15;
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5
  });

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(size, 1),
    material
  );

  mesh.position.y = size;
  mesh.castShadow = true;
  group.add(mesh);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.2, 0.035, 6, 20),
    new THREE.MeshBasicMaterial({ color })
  );

  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);

  group.position.set(
    Math.cos(angle) * distance,
    0,
    Math.sin(angle) * distance
  );

  scene.add(group);

  enemies.push({
    group,
    mesh,
    hp,
    maxHp: hp,
    speed,
    size,
    attack: 12,
    hitCooldown: 0
  });
}

// ===================================
// PROJECTILES
// ===================================

function shoot(enemy) {
  const direction = new THREE.Vector3(
    enemy.group.position.x - player.position.x,
    0,
    enemy.group.position.z - player.position.z
  ).normalize();

  const bullet = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0x75e5d0
    })
  );

  bullet.position.copy(player.position);
  bullet.position.y = 0.8;

  scene.add(bullet);

  projectiles.push({
    mesh: bullet,
    direction,
    speed: 12,
    damage,
    life: 1.5
  });
}

// ===================================
// PARTICLES
// ===================================

function burst(position, color) {
  for (let i = 0; i < 7; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 6),
      new THREE.MeshBasicMaterial({ color })
    );

    mesh.position.copy(position);
    scene.add(mesh);

    particles.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 3,
        (Math.random() - 0.5) * 5
      ),
      life: 0.45
    });
  }
}

// ===================================
// EXPERIENCE & UPGRADES
// ===================================

const upgrades = [
  {
    name: '강화 탄환',
    desc: '공격 피해량 증가',
    apply: () => damage += 1
  },
  {
    name: '신속한 공격',
    desc: '공격 속도 증가',
    apply: () => attackSpeed = Math.max(0.2, attackSpeed - 0.12)
  },
  {
    name: '에너지 확장',
    desc: '최대 체력 증가',
    apply: () => {
      maxHealth += 20;
      health = Math.min(maxHealth, health + 20);
    }
  },
  {
    name: '기동성 강화',
    desc: '이동 속도 증가',
    apply: () => playerSpeed += 0.7
  },
  {
    name: '에너지 회복',
    desc: '체력 30 회복',
    apply: () => health = Math.min(maxHealth, health + 30)
  }
];

function gainXP(amount) {
  xp += amount;

  if (xp >= level * 5) {
    xp -= level * 5;
    level++;

    running = false;

    const choices = document.getElementById('upgradeChoices');
    choices.innerHTML = '';

    const selected = [...upgrades]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    selected.forEach((upgrade, index) => {
      const button = document.createElement('button');

      button.innerHTML =
        `<strong>${index + 1}. ${upgrade.name}</strong><br>` +
        `<small>${upgrade.desc}</small>`;

      button.onclick = () => chooseUpgrade(upgrade);

      choices.appendChild(button);
    });

    document.getElementById('levelOverlay')
      .classList.remove('hidden');
  }
}

function chooseUpgrade(upgrade) {
  upgrade.apply();

  document.getElementById('levelOverlay')
    .classList.add('hidden');

  running = true;
  clock.getDelta();
}

// ===================================
// UI
// ===================================

function updateUI() {
  document.getElementById('timer').textContent =
    `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:` +
    `${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;

  document.getElementById('kills').textContent = kills;
  document.getElementById('level').textContent = level;

  document.getElementById('healthText').textContent =
    `${Math.ceil(health)} / ${maxHealth}`;

  document.getElementById('healthBar').style.width =
    `${Math.max(0, health / maxHealth * 100)}%`;

  document.getElementById('xpText').textContent =
    `${xp} / ${level * 5}`;

  document.getElementById('xpBar').style.width =
    `${xp / (level * 5) * 100}%`;
}

// ===================================
// DAMAGE & GAME OVER
// ===================================

function endGame() {
  running = false;
  gameOver = true;

  document.getElementById('finalStats').textContent =
    `생존 시간 ${Math.floor(elapsed)}초 · 처치 ${kills}마리 · 레벨 ${level}`;

  document.getElementById('gameOverOverlay')
    .classList.remove('hidden');
}

// ===================================
// INPUT
// ===================================

window.addEventListener('keydown', event => {
  keys[event.code] = true;

  if ([
    'ArrowUp', 'ArrowDown', 'ArrowLeft',
    'ArrowRight', 'Space'
  ].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === 'KeyP' && running) {
    paused = !paused;
    running = !paused;

    document.getElementById('pauseOverlay')
      .classList.toggle('hidden', !paused);
  }

  if (event.code === 'Space' && running && dashCooldown <= 0) {
    dashTime = 0.22;
    dashCooldown = 2;
  }

  if (
    running === false &&
    !gameOver &&
    document.getElementById('levelOverlay')
      .classList.contains('hidden') === false
  ) {
    const number = Number(event.key);

    if (number >= 1 && number <= 3) {
      const button = document.querySelectorAll(
        '#upgradeChoices button'
      )[number - 1];

      if (button) button.click();
    }
  }
});

window.addEventListener('keyup', event => {
  keys[event.code] = false;
});

// ===================================
// START / RESTART
// ===================================

function resetGame() {
  for (const enemy of enemies) {
    scene.remove(enemy.group);
  }

  for (const bullet of projectiles) {
    scene.remove(bullet.mesh);
  }

  for (const particle of particles) {
    scene.remove(particle.mesh);
  }

  enemies = [];
  projectiles = [];
  particles = [];

  health = 100;
  maxHealth = 100;
  xp = 0;
  level = 1;
  kills = 0;
  elapsed = 0;

  damage = 1;
  attackSpeed = 0.65;
  playerSpeed = 5.5;
  attackCooldown = 0;
  dashCooldown = 0;
  dashTime = 0;

  player.position.set(0, 0, 0);

  paused = false;
  gameOver = false;
  running = true;

  document.getElementById('overlay')
    .classList.add('hidden');

  document.getElementById('gameOverOverlay')
    .classList.add('hidden');

  document.getElementById('levelOverlay')
    .classList.add('hidden');

  document.getElementById('pauseOverlay')
    .classList.add('hidden');

  updateUI();
  clock.getDelta();
}

document.getElementById('startButton')
  .addEventListener('click', resetGame);

document.getElementById('restartButton')
  .addEventListener('click', resetGame);

// ===================================
// MAIN GAME LOOP
// ===================================

function update(delta) {
  if (!running) return;

  elapsed += delta;

  dashCooldown -= delta;
  attackCooldown -= delta;
  dashTime -= delta;

  // Movement
  const move = new THREE.Vector3();

  if (keys.KeyW || keys.ArrowUp) move.z -= 1;
  if (keys.KeyS || keys.ArrowDown) move.z += 1;
  if (keys.KeyA || keys.ArrowLeft) move.x -= 1;
  if (keys.KeyD || keys.ArrowRight) move.x += 1;

  if (move.length() > 0) {
    move.normalize();

    const speed = dashTime > 0
      ? playerSpeed * 3
      : playerSpeed;

    player.position.x += move.x * speed * delta;
    player.position.z += move.z * speed * delta;

    player.rotation.y = Math.atan2(move.x, move.z);
  }

  player.position.x = THREE.MathUtils.clamp(
    player.position.x, -12.8, 12.8
  );

  player.position.z = THREE.MathUtils.clamp(
    player.position.z, -12.8, 12.8
  );

  body.position.y = 0.65 + Math.sin(elapsed * 5) * 0.055;
  aura.rotation.z += delta * 0.8;

  // Enemy spawn
  if (Math.random() < delta * (1.1 + elapsed * 0.018)) {
    createEnemy();
  }

  // Enemy movement
  for (const enemy of enemies) {
    const direction = new THREE.Vector3(
      player.position.x - enemy.group.position.x,
      0,
      player.position.z - enemy.group.position.z
    );

    const distance = direction.length();

    if (distance > 0.95) {
      direction.normalize();

      enemy.group.position.x +=
        direction.x * enemy.speed * delta;

      enemy.group.position.z +=
        direction.z * enemy.speed * delta;
    }

    enemy.mesh.rotation.x += delta * 1.4;
    enemy.mesh.rotation.y += delta * 1.8;

    enemy.hitCooldown -= delta;

    if (distance < 1.1 && enemy.hitCooldown <= 0) {
      health -= enemy.attack;
      enemy.hitCooldown = 0.8;

      burst(player.position.clone(), 0xff8e9e);

      if (health <= 0) {
        health = 0;
        updateUI();
        endGame();
        return;
      }
    }
  }

  // Automatic targeting
  if (attackCooldown <= 0 && enemies.length > 0) {
    let target = null;
    let nearest = attackRange;

    for (const enemy of enemies) {
      const distance = player.position.distanceTo(
        enemy.group.position
      );

      if (distance < nearest) {
        nearest = distance;
        target = enemy;
      }
    }

    if (target) {
      shoot(target);
      attackCooldown = attackSpeed;
    }
  }

  // Projectile movement
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const bullet = projectiles[i];

    bullet.mesh.position.x +=
      bullet.direction.x * bullet.speed * delta;

    bullet.mesh.position.z +=
      bullet.direction.z * bullet.speed * delta;

    bullet.life -= delta;

    let hit = false;

    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];

      if (
        bullet.mesh.position.distanceTo(
          enemy.group.position.clone().add(
            new THREE.Vector3(0, 0.5, 0)
          )
        ) < enemy.size + 0.2
      ) {
        enemy.hp -= bullet.damage;
        hit = true;

        burst(bullet.mesh.position, 0x75e5d0);

        if (enemy.hp <= 0) {
          scene.remove(enemy.group);
          enemies.splice(j, 1);

          kills++;
          gainXP(1);
        }

        break;
      }
    }

    if (hit || bullet.life <= 0) {
      scene.remove(bullet.mesh);
      projectiles.splice(i, 1);
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.mesh.position.addScaledVector(p.velocity, delta);
    p.life -= delta;

    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  // Camera follow
  camera.position.x +=
    (player.position.x * 0.22 - camera.position.x) *
    delta * 2;

  camera.position.z +=
    (15 + player.position.z * 0.22 - camera.position.z) *
    delta * 2;

  camera.lookAt(
    player.position.x * 0.2,
    0,
    player.position.z * 0.2
  );

  updateUI();
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.04);

  if (running && !paused) {
    update(delta);
  }

  renderer.render(scene, camera);
}

animate();

// ===================================
// RESPONSIVE
// ===================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
});