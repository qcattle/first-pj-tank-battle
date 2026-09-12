(() => {
  'use strict';

  const TILE = 40;
  const COLS = 20, ROWS = 15;
  const W = COLS * TILE, H = ROWS * TILE;

  const TANK_SIZE = 32;
  const PLAYER_SPEED = 170;
  const ENEMY_SPEED = 95;
  const BULLET_SPEED = 430;
  const BULLET_SIZE = 6;

  const MAX_ENEMIES_ALIVE = 3;
  const TOTAL_ENEMIES = 10;
  const PLAYER_LIVES = 1;  // 一条命！
  const RESPAWN_DELAY = 1.5;
  const ENEMY_SPAWN_DELAY = 2.0;

  const MAP_STR = [
    '....................',
    '..BB..BB....BB..BB..',
    '..BB..BB....BB..BB..',
    '....................',
    '..BB..BBBBBBBB..BB..',
    '..BB..BB....BB..BB..',
    '....................',
    'SS......BBBB......SS',
    '....................',
    '..BB..BB....BB..BB..',
    '..BB..BBBBBBBB..BB..',
    '....................',
    '..BB..BB....BB..BB..',
    '..BB..BB....BB..BB..',
    '....................',
  ];

  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1  },
    left:  { x: -1, y: 0  },
    right: { x: 1,  y: 0  },
  };
  const DIR_LIST = ['up', 'down', 'left', 'right'];

  const SPAWN_POINTS = [
    { x: 44,  y: 4 },
    { x: 364, y: 4 },
    { x: 684, y: 4 },
  ];

  const canvas = document.getElementById('game');
  const leaderboardBtn = document.getElementById('leaderboard-btn');
  const leaderboardModal = document.getElementById('leaderboard-modal');
  const leaderboardList = document.getElementById('leaderboard-list');
  const nameInputModal = document.getElementById('name-input-modal');
  const finalScoreSpan = document.getElementById('final-score');
  const playerNameInput = document.getElementById('player-name-input');
  const saveScoreBtn = document.getElementById('save-score-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');

  function getLeaderboard() {
    return JSON.parse(localStorage.getItem('tankLeaderboard') || '[]');
  }
  function saveLeaderboard(data) {
    localStorage.setItem('tankLeaderboard', JSON.stringify(data));
  }
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  let grid, player, enemies, bullets, particles;
  let score, lives, killedCount, spawnedCount;
  let spawnTimer, respawnTimer, state;
  const keys = {};

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function rectHitsWall(x, y, w, h) {
    if (x < 0 || y < 0 || x + w > W || y + h > H) return true;
    const c1 = Math.floor(x / TILE);
    const c2 = Math.floor((x + w - 0.01) / TILE);
    const r1 = Math.floor(y / TILE);
    const r2 = Math.floor((y + h - 0.01) / TILE);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (grid[r][c] !== 0) return true;
      }
    }
    return false;
  }

  function tankBlocked(self, x, y) {
    const s = self.size;
    if (rectHitsWall(x, y, s, s)) return true;
    const others = self.isPlayer ? enemies : [player, ...enemies];
    for (const o of others) {
      if (!o || o === self || !o.alive) continue;
      if (rectsOverlap({ x, y, w: s, h: s }, { x: o.x, y: o.y, w: o.size, h: o.size })) {
        return true;
      }
    }
    return false;
  }

  saveScoreBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || '游客';
    const lb = getLeaderboard();
    lb.push({ name, score });
    lb.sort((a, b) => b.score - a.score);
    saveLeaderboard(lb.slice(0, 10));
    nameInputModal.classList.add('hidden');
    renderLeaderboard();
    leaderboardModal.classList.remove('hidden');
  });

  leaderboardBtn.addEventListener('click', () => {
    renderLeaderboard();
    leaderboardModal.classList.remove('hidden');
  });

  closeModalBtn.addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
  });

  function renderLeaderboard() {
    const lb = getLeaderboard();
    leaderboardList.innerHTML = '';
    if (lb.length === 0) {
      leaderboardList.innerHTML = '<li style="justify-content:center;color:#64748b;">暂无记录，快来创造记录吧！</li>';
      return;
    }
    lb.forEach((item, index) => {
      const li = document.createElement('li');
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      li.innerHTML = `<span>${medal} ${item.name}</span><span>${item.score} 分</span>`;
      leaderboardList.appendChild(li);
    });
  }
  function initGame() {
    grid = MAP_STR.map(row =>
      row.split('').map(ch => (ch === 'B' ? 1 : ch === 'S' ? 2 : 0))
    );
    bullets = [];
    enemies = [];
    particles = [];

    score = 0;
    lives = PLAYER_LIVES;
    killedCount = 0;
    spawnedCount = 0;
    spawnTimer = 0.6;
    respawnTimer = 0;
    state = 'playing';

    player = makePlayer();
    updateHUD();
  }

  function makePlayer() {
    return {
      x: W / 2 - TANK_SIZE / 2,
      y: H - 2 * TILE + 4,
      size: TANK_SIZE,
      dir: 'up',
      speed: PLAYER_SPEED,
      cooldown: 0,
      alive: true,
      isPlayer: true,
      shield: 0,
    };
  }

  function makeEnemy(x, y) {
    return {
      x, y,
      size: TANK_SIZE,
      dir: 'down',
      speed: ENEMY_SPEED,
      cooldown: 1,
      thinkTimer: 0,
      alive: true,
      isPlayer: false,
    };
  }

  function tryMove(t, dir, dt) {
    if (t.dir !== dir) {
      const off = (TILE - t.size) / 2;
      let ax = t.x, ay = t.y;
      if (dir === 'left' || dir === 'right') {
        ay = Math.round((t.y - off) / TILE) * TILE + off;
      } else {
        ax = Math.round((t.x - off) / TILE) * TILE + off;
      }
      if (!tankBlocked(t, ax, ay)) { t.x = ax; t.y = ay; }
      t.dir = dir;
    }

    const d = DIRS[dir];
    const dist = t.speed * dt;
    const nx = t.x + d.x * dist;
    const ny = t.y + d.y * dist;

    if (!tankBlocked(t, nx, ny)) {
      t.x = nx;
      t.y = ny;
      return true;
    }
    return false;
  }

  function shoot(t) {
    if (t.cooldown > 0) return;
    t.cooldown = t.isPlayer ? 0.32 : 1.1;

    const d = DIRS[t.dir];
    const cx = t.x + t.size / 2 + d.x * (t.size / 2 + 3);
    const cy = t.y + t.size / 2 + d.y * (t.size / 2 + 3);

    bullets.push({
      x: cx - BULLET_SIZE / 2,
      y: cy - BULLET_SIZE / 2,
      size: BULLET_SIZE,
      dir: t.dir,
      speed: t.isPlayer ? BULLET_SPEED : BULLET_SPEED * 0.78,
      owner: t.isPlayer ? 'player' : 'enemy',
      alive: true,
    });
  }

  function addParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 130;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: 2 + Math.random() * 3,
        life: 0.4 + Math.random() * 0.3,
        color,
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
  }

  function checkBulletHit(b) {
    const cx = b.x + b.size / 2;
    const cy = b.y + b.size / 2;

    if (cx < 0 || cy < 0 || cx > W || cy > H) {
      b.alive = false;
      return;
    }

    const c = Math.floor(cx / TILE);
    const r = Math.floor(cy / TILE);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const cell = grid[r][c];
      if (cell === 1) {
        grid[r][c] = 0;
        b.alive = false;
        addParticles(cx, cy, '#c2410c', 6);
        return;
      }
      if (cell === 2) {
        b.alive = false;
        addParticles(cx, cy, '#94a3b8', 6);
        return;
      }
    }

    if (b.owner === 'player') {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (cx > e.x && cx < e.x + e.size && cy > e.y && cy < e.y + e.size) {
          e.alive = false;
          b.alive = false;
          killedCount++;
          score += 100;
          addParticles(cx, cy, '#f87171', 14);
          return;
        }
      }
    } else if (player.alive && player.shield <= 0) {
      if (cx > player.x && cx < player.x + player.size &&
          cy > player.y && cy < player.y + player.size) {
        b.alive = false;
        player.alive = false;
        lives--;
        respawnTimer = RESPAWN_DELAY;
        addParticles(player.x + player.size / 2, player.y + player.size / 2, '#86efac', 16);
        return;
      }
    }

    for (const o of bullets) {
      if (o === b || !o.alive || o.owner === b.owner) continue;
      if (Math.abs(o.x - b.x) < 10 && Math.abs(o.y - b.y) < 10) {
        o.alive = false;
        b.alive = false;
        return;
      }
    }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      if (!b.alive) continue;
      const d = DIRS[b.dir];
      const dist = b.speed * dt;
      const steps = Math.max(1, Math.ceil(dist / 8));
      for (let i = 0; i < steps && b.alive; i++) {
        b.x += (d.x * dist) / steps;
        b.y += (d.y * dist) / steps;
        checkBulletHit(b);
      }
    }
    bullets = bullets.filter(b => b.alive);
  }

  function updateEnemy(e, dt) {
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.thinkTimer -= dt;

    if (e.thinkTimer <= 0) {
      e.thinkTimer = 0.6 + Math.random() * 1.2;
      if (player.alive && Math.random() < 0.4) {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        if (Math.abs(dx) > Math.abs(dy)) e.dir = dx > 0 ? 'right' : 'left';
        else e.dir = dy > 0 ? 'down' : 'up';
      } else {
        e.dir = DIR_LIST[Math.floor(Math.random() * 4)];
      }
    }

    const moved = tryMove(e, e.dir, dt);
    if (!moved) {
      e.dir = DIR_LIST[Math.floor(Math.random() * 4)];
      e.thinkTimer = 0.3 + Math.random() * 0.5;
    }

    if (e.cooldown <= 0 && Math.random() < dt * 1.4) shoot(e);
  }

  function spawnEnemy() {
    const free = SPAWN_POINTS.filter(p =>
      !tankBlocked({ size: TANK_SIZE, isPlayer: false }, p.x, p.y)
    );
    if (free.length === 0) return;

    const p = free[Math.floor(Math.random() * free.length)];
    enemies.push(makeEnemy(p.x, p.y));
    spawnedCount++;
  }

  function update(dt) {
    if (state !== 'playing') {
      updateParticles(dt);
      return;
    }

    if (player.alive) {
      player.cooldown = Math.max(0, player.cooldown - dt);
      if (player.shield > 0) player.shield -= dt;

      let dir = null;
      if (keys['ArrowUp'] || keys['KeyW']) dir = 'up';
      else if (keys['ArrowDown'] || keys['KeyS']) dir = 'down';
      else if (keys['ArrowLeft'] || keys['KeyA']) dir = 'left';
      else if (keys['ArrowRight'] || keys['KeyD']) dir = 'right';

      if (dir) tryMove(player, dir, dt);
      if (keys['Space']) shoot(player);
    } else {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        if (lives > 0) {
          player = makePlayer();
          player.shield = 2;
        } else {
          // 这里什么都不写，让下面的统一判定来处理
        }
      }
    }

    for (const e of enemies) updateEnemy(e, dt);
    updateBullets(dt);
    updateParticles(dt);

    spawnTimer -= dt;
    if (spawnTimer <= 0 && spawnedCount < TOTAL_ENEMIES && enemies.length < MAX_ENEMIES_ALIVE) {
      spawnEnemy();
      spawnTimer = ENEMY_SPAWN_DELAY;
    }

    enemies = enemies.filter(e => e.alive);

    if (state === 'playing') {
      if (killedCount >= TOTAL_ENEMIES) {
        state = 'win';
      }
      if (lives <= 0 && !player.alive && respawnTimer <= 0) {
        state = 'over';
      }

      if (state === 'win' || state === 'over') {
        setTimeout(() => {
          if (finalScoreSpan) finalScoreSpan.textContent = score;
          if (nameInputModal) nameInputModal.classList.remove('hidden');
          if (leaderboardBtn) leaderboardBtn.style.display = 'block';
        }, 800);
      }
    }

    updateHUD();
  }

  function drawBrick(x, y) {
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#c2410c';
    const bh = TILE / 4, bw = TILE / 2;
    for (let r = 0; r < 4; r++) {
      const ox = (r % 2) ? bw / 2 : 0;
      for (let c = 0; c < 2; c++) {
        const bx = x + c * bw + ox;
        const left = Math.max(x, bx);
        const right = Math.min(x + TILE, bx + bw - 2);
        if (right > left) ctx.fillRect(left, y + r * bh + 1, right - left, bh - 2);
      }
    }
  }

  function drawSteel(x, y) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x + 9, y + 9, TILE - 18, TILE - 18);
  }

  function drawTank(t) {
    const s = t.size;
    ctx.save();
    ctx.translate(t.x + s / 2, t.y + s / 2);
    const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[t.dir];
    ctx.rotate(angle);

    const body = t.isPlayer ? '#22c55e' : '#ef4444';
    const track = t.isPlayer ? '#15803d' : '#7f1d1d';

    ctx.fillStyle = track;
    ctx.fillRect(-s / 2, -s / 2, s * 0.22, s);
    ctx.fillRect(s / 2 - s * 0.22, -s / 2, s * 0.22, s);

    ctx.fillStyle = body;
    ctx.fillRect(-s * 0.28, -s * 0.38, s * 0.56, s * 0.76);

    ctx.beginPath();
    ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(-s * 0.07, -s * 0.58, s * 0.14, s * 0.42);

    if (t.isPlayer && t.shield > 0) {
      ctx.strokeStyle = 'rgba(96,165,250,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawOverlay(title, sub, hint) {
    ctx.fillStyle = 'rgba(2,6,23,0.78)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 40);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(sub, W / 2, H / 2 + 10);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(hint, W / 2, H / 2 + 60);
    ctx.textAlign = 'start';
  }

  function render() {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, H); ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(W, r * TILE); ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        if (v === 1) drawBrick(c * TILE, r * TILE);
        else if (v === 2) drawSteel(c * TILE, r * TILE);
      }
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (const e of enemies) drawTank(e);
    if (player.alive) drawTank(player);

    for (const b of bullets) {
      ctx.fillStyle = b.owner === 'player' ? '#fde047' : '#fb923c';
      ctx.beginPath();
      ctx.arc(b.x + b.size / 2, b.y + b.size / 2, b.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state === 'over') drawOverlay('游戏结束', `得分 ${score}`, '按 R 重新开始');
    if (state === 'win')  drawOverlay('胜  利', `得分 ${score}`, '按 R 再来一局');
  }

  function updateHUD() {
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = Math.max(0, lives);
    document.getElementById('left').textContent = Math.max(0, TOTAL_ENEMIES - killedCount);
  }

  function setupTouchControls() {
    const dirKeyMap = {
      up:    'ArrowUp',
      down:  'ArrowDown',
      left:  'ArrowLeft',
      right: 'ArrowRight',
    };

    document.querySelectorAll('.dpad-btn').forEach(btn => {
      const dir = btn.dataset.dir;
      const key = dirKeyMap[dir];
      if (!key) return;

      function press(e) {
        e.preventDefault();
        keys[key] = true;
        btn.classList.add('pressed');
      }
      function release(e) {
        e.preventDefault();
        keys[key] = false;
        btn.classList.remove('pressed');
      }

      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend',   release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown',  press);
      btn.addEventListener('mouseup',    release);
      btn.addEventListener('mouseleave', release);
    });

    const fireBtn = document.getElementById('fireBtn');
    if (fireBtn) {
      function pressFire(e) {
        e.preventDefault();
        keys['Space'] = true;
        fireBtn.classList.add('pressed');
      }
      function releaseFire(e) {
        e.preventDefault();
        keys['Space'] = false;
        fireBtn.classList.remove('pressed');
      }

      fireBtn.addEventListener('touchstart', pressFire, { passive: false });
      fireBtn.addEventListener('touchend',   releaseFire, { passive: false });
      fireBtn.addEventListener('touchcancel', releaseFire, { passive: false });
      fireBtn.addEventListener('mousedown',  pressFire);
      fireBtn.addEventListener('mouseup',    releaseFire);
      fireBtn.addEventListener('mouseleave', releaseFire);
    }

    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
      restartBtn.addEventListener('click', e => {
        e.preventDefault();
        if (state === 'over' || state === 'win') {
          initGame();
        }
      });
    }

    const canvas = document.getElementById('game');
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchend',   e => e.preventDefault(), { passive: false });
  }

  setupTouchControls();

  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'KeyR' && (state === 'over' || state === 'win')) {
      initGame();
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  let lastTime = 0;

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    let dt = (ts - lastTime) / 1000;
    lastTime = ts;
    dt = Math.min(dt, 0.05);

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  initGame();
  requestAnimationFrame(loop);
})();