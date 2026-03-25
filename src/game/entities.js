import { BOARD_W, BOARD_X, BOARD_Y, CELL_H, CELL_W, HOUSE_LINE_X, ROWS } from "../config/constants.js";
import { PLANTS } from "../config/plants.js";
import { ZOMBIES } from "../config/zombies.js";
import { sound } from "../core/audio.js";
import { state } from "../core/state.js";
import { updateCardsVisual, showToast } from "../ui/panels.js";

export function cellCenter(row, col) {
  return {
    x: BOARD_X + col * CELL_W + CELL_W / 2,
    y: BOARD_Y + row * CELL_H + CELL_H / 2,
  };
}

export function spawnSun(x, y, source = "sky") {
  state.suns.push({
    id: crypto.randomUUID(),
    x,
    y,
    value: 25,
    ttl: source === "sky" ? 10 : 8,
    source,
    vy: source === "sky" ? 30 : 0,
    alive: true,
  });
}

export function placePlant(row, col, plantId) {
  const def = PLANTS[plantId];
  if (!def) {
    return false;
  }
  if (state.sun < def.cost) {
    showToast("阳光不足");
    return false;
  }
  if (state.cardCooldowns[plantId] > 0) {
    showToast("卡片冷却中");
    return false;
  }
  if (state.plants[row][col]) {
    showToast("该地块已有植物");
    return false;
  }

  const center = cellCenter(row, col);
  state.plants[row][col] = {
    id: crypto.randomUUID(),
    plantId,
    row,
    col,
    x: center.x,
    y: center.y,
    hp: def.hp,
    fireTimer: 0,
    produceTimer: 0,
    fuseTimer: 0,
    armTimer: 0,
    armed: def.kind !== "trap",
    attackTimer: 0,
    burstQueue: 0,
    burstTimer: 0,
    hitFlash: 0,
    action: "idle",
    actionTimer: 0,
    animSeed: Math.random() * Math.PI * 2,
  };

  state.sun -= def.cost;
  state.stats.sunsSpent += def.cost;
  state.stats.plantsPlaced += 1;
  state.cardCooldowns[plantId] = def.cooldown;
  state.selectedPlant = null;
  sound.beep(620, 0.07, "triangle", 0.06);
  updateCardsVisual();
  return true;
}

export function removePlant(row, col) {
  if (!state.plants[row][col]) {
    return false;
  }
  state.plants[row][col] = null;
  state.stats.plantsRemoved += 1;
  sound.beep(180, 0.08, "square", 0.05);
  return true;
}

export function spawnZombie(type, row) {
  const def = ZOMBIES[type];
  if (!def) {
    return;
  }
  state.zombies.push({
    id: crypto.randomUUID(),
    type,
    row,
    x: BOARD_X + BOARD_W + 25,
    hp: def.hp,
    maxHp: def.hp,
    shieldHp: def.shieldHp || 0,
    baseSpeed: def.speed,
    speed: def.speed,
    baseDamage: def.damage,
    damage: def.damage,
    attackTimer: 0,
    targetPlant: null,
    slowUntil: 0,
    jumped: false,
    enraged: false,
    action: "walk",
    hitFlash: 0,
    animSeed: Math.random() * Math.PI * 2,
    propDropState: {
      coneDropped: false,
      bucketDropped: false,
      paperDropped: false,
      shieldDropped: false,
      poleDropped: false,
    },
    alive: true,
  });
}

export function spawnWaveBatch(batch) {
  if (batch.bigWave) {
    showToast("一大波僵尸正在逼近");
    sound.beep(180, 0.18, "sawtooth", 0.08);
  }

  batch.units.forEach((unit) => {
    for (let i = 0; i < unit.count; i += 1) {
      const timerId = window.setTimeout(() => {
        if (state.running) {
          const row = Math.floor(Math.random() * ROWS);
          spawnZombie(unit.type, row);
        }
        state.pendingSpawnTimers = state.pendingSpawnTimers.filter((id) => id !== timerId);
      }, i * 550);
      state.pendingSpawnTimers.push(timerId);
    }
  });
}

export function hasZombieAhead(row, col) {
  const leftX = BOARD_X + col * CELL_W;
  return state.zombies.some((zombie) => zombie.row === row && zombie.x > leftX - 30 && zombie.alive);
}

export function spawnProjectile(plant, def, offsetY = 0, slow = false) {
  const pooled = state.pools.projectiles.pop() || {};
  pooled.id = crypto.randomUUID();
  pooled.x = plant.x + 22;
  pooled.y = plant.y + offsetY;
  pooled.row = plant.row;
  pooled.speed = def.projectileSpeed;
  pooled.damage = def.damage;
  pooled.slow = slow;
  pooled.slowRatio = def.slow || 1;
  pooled.slowDuration = def.slowDuration || 0;
  pooled.alive = true;
  state.projectiles.push(pooled);
  state.stats.projectilesFired += 1;
}

export function releaseProjectile(projectile) {
  projectile.alive = false;
  if (state.pools.projectiles.length < 400) {
    state.pools.projectiles.push(projectile);
  }
}

export function applyDamageToZombie(zombie, damage, projectile) {
  const prevHp = zombie.hp;
  const prevShieldHp = zombie.shieldHp;
  zombie.hitFlash = 0.14;
  zombie.action = "hurt";
  zombie.actionTimer = 0.12;

  if (zombie.shieldHp > 0) {
    const shieldDamage = Math.min(damage, zombie.shieldHp);
    zombie.shieldHp -= shieldDamage;
    damage -= shieldDamage;
    if (shieldDamage > 0) {
      state.effects.push({
        x: zombie.x - 12,
        y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
        ttl: 0.16,
        type: "shield-hit",
      });
      if (prevShieldHp > 0 && zombie.shieldHp <= 0 && !zombie.propDropState.shieldDropped) {
        zombie.propDropState.shieldDropped = true;
        state.effects.push({
          x: zombie.x - 18,
          y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
          ttl: 0.6,
          type: "door-drop",
        });
      }
    }
  }

  zombie.hp -= damage;
  if (projectile && projectile.slow) {
    zombie.slowUntil = Math.max(zombie.slowUntil, state.levelTime + projectile.slowDuration);
    state.effects.push({
      x: zombie.x - 2,
      y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
      ttl: 0.2,
      type: "ice-hit",
    });
  } else {
    state.effects.push({
      x: zombie.x,
      y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
      ttl: 0.15,
      type: "hit",
    });
  }

  const def = ZOMBIES[zombie.type];
  if (zombie.type === "conehead" && prevHp > zombie.maxHp * 0.55 && zombie.hp <= zombie.maxHp * 0.55 && !zombie.propDropState.coneDropped) {
    zombie.propDropState.coneDropped = true;
    state.effects.push({
      x: zombie.x,
      y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2 - 12,
      ttl: 0.55,
      type: "cone-drop",
    });
  }
  if (zombie.type === "buckethead" && prevHp > zombie.maxHp * 0.48 && zombie.hp <= zombie.maxHp * 0.48 && !zombie.propDropState.bucketDropped) {
    zombie.propDropState.bucketDropped = true;
    state.effects.push({
      x: zombie.x,
      y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2 - 12,
      ttl: 0.6,
      type: "bucket-drop",
    });
  }
  if (def.enrageAt && !zombie.enraged && zombie.hp <= zombie.maxHp * def.enrageAt) {
    zombie.enraged = true;
    zombie.baseSpeed = def.enrageSpeed;
    zombie.baseDamage = def.enrageDamage;
    zombie.propDropState.paperDropped = true;
    state.effects.push({
      x: zombie.x - 12,
      y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
      ttl: 0.65,
      type: "paper-burst",
    });
    showToast("读报僵尸暴怒了");
  }

  if (zombie.hp > 0) {
    return;
  }

  zombie.alive = false;
  state.stats.kills += 1;
  state.effects.push({
    x: zombie.x,
    y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
    ttl: 0.6,
    type: "zombie-fall",
    zombieType: zombie.type,
    slowed: state.levelTime <= zombie.slowUntil,
  });
  state.effects.push({
    x: zombie.x,
    y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
    ttl: 0.45,
    type: "pop",
  });
  sound.beep(130, 0.06, "square", 0.04);
}

export function maybePoleVaultJump(zombie, target) {
  const def = ZOMBIES[zombie.type];
  if (!def.canJump || zombie.jumped || !target) {
    return false;
  }
  zombie.jumped = true;
  if (!zombie.propDropState.poleDropped) {
    zombie.propDropState.poleDropped = true;
    state.effects.push({
      x: zombie.x + 8,
      y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
      ttl: 0.55,
      type: "pole-drop",
    });
  }
  zombie.x -= CELL_W * 1.05;
  if (zombie.x < HOUSE_LINE_X + 8) {
    zombie.x = HOUSE_LINE_X + 8;
  }
  sound.beep(300, 0.08, "square", 0.05);
  return true;
}