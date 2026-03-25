import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_H, CELL_W, COLS, HOUSE_LINE_X } from "../config/constants.js";
import { PLANTS } from "../config/plants.js";
import { ZOMBIES } from "../config/zombies.js";
import { sound } from "../core/audio.js";
import { currentLevel, state } from "../core/state.js";
import {
  applyDamageToZombie,
  hasZombieAhead,
  maybePoleVaultJump,
  releaseProjectile,
  spawnProjectile,
  spawnSun,
  spawnWaveBatch,
} from "./entities.js";
import { endLevel } from "./flow.js";
import { ui } from "../ui/dom.js";

function activateLawnMower(row) {
  const mower = state.lawnMowers[row];
  if (!mower) {
    return false;
  }
  if (mower.active) {
    return true;
  }
  if (mower.spent) {
    return false;
  }
  if (!mower.active) {
    mower.active = true;
    mower.spent = true;
    state.effects.push({
      x: HOUSE_LINE_X + 10,
      y: BOARD_Y + row * CELL_H + CELL_H / 2,
      ttl: 0.35,
      type: "mower-start",
    });
    sound.beep(180, 0.12, "sawtooth", 0.05);
    sound.beep(120, 0.18, "square", 0.04);
  }
  return true;
}

function buildEndlessBatch() {
  const wave = state.endless.wave;
  const difficulty = Math.min(10, 1 + wave * 0.22);
  const picks = ["basic", "conehead"];
  if (wave >= 2) {
    picks.push("polevault");
  }
  if (wave >= 4) {
    picks.push("newspaper");
  }
  if (wave >= 6) {
    picks.push("screendoor");
  }
  if (wave >= 8) {
    picks.push("buckethead");
  }
  if (wave >= 10) {
    picks.push("flag");
  }
  if (wave >= 12) {
    picks.push("football");
  }

  const budget = 2 + Math.floor(difficulty * 1.6);
  const units = [];
  for (let i = 0; i < budget; i += 1) {
    const type = picks[Math.floor(Math.random() * picks.length)];
    const existing = units.find((unit) => unit.type === type);
    if (existing) {
      existing.count += 1;
    } else {
      units.push({ type, count: 1 });
    }
  }

  return {
    time: state.levelTime,
    units,
    bigWave: wave > 0 && wave % 5 === 0,
  };
}

export function updatePlants(dt) {
  for (let row = 0; row < state.plants.length; row += 1) {
    for (let col = 0; col < state.plants[row].length; col += 1) {
      const plant = state.plants[row][col];
      if (!plant) {
        continue;
      }

      plant.hitFlash = Math.max(0, (plant.hitFlash || 0) - dt);
      plant.actionTimer = Math.max(0, (plant.actionTimer || 0) - dt);
      if (plant.actionTimer <= 0 && plant.action !== "idle") {
        plant.action = "idle";
      }

      const def = PLANTS[plant.plantId];
      if (def.kind === "producer") {
        plant.produceTimer += dt;
        if (plant.produceTimer >= def.sunInterval) {
          plant.produceTimer = 0;
          spawnSun(plant.x, plant.y - 24, "plant");
          plant.action = "produce";
          plant.actionTimer = 0.25;
          sound.beep(760, 0.07, "sine", 0.04);
        }
      }

      if (def.kind === "shooter") {
        plant.fireTimer += dt;
        if (hasZombieAhead(row, col) && plant.fireTimer >= def.fireRate) {
          plant.fireTimer = 0;
          plant.action = "attack";
          plant.actionTimer = 0.18;
          if (def.burst) {
            plant.burstQueue = def.burst;
            plant.burstTimer = 0;
          } else {
            spawnProjectile(plant, def, 0, Boolean(def.slow));
          }
          sound.beep(460, 0.05, "triangle", 0.03);
        }
        if (plant.burstQueue > 0) {
          plant.burstTimer -= dt;
          if (plant.burstTimer <= 0) {
            spawnProjectile(plant, def, plant.burstQueue % 2 === 0 ? -4 : 4, Boolean(def.slow));
            plant.action = "attack";
            plant.actionTimer = 0.12;
            plant.burstQueue -= 1;
            plant.burstTimer = def.burstGap;
          }
        }
      }

      if (def.kind === "bomb") {
        plant.fuseTimer += dt;
        if (plant.fuseTimer >= def.fuse) {
          const radius = def.radiusCells * CELL_W;
          state.zombies.forEach((zombie) => {
            if (!zombie.alive) {
              return;
            }
            const zombieY = BOARD_Y + zombie.row * CELL_H + CELL_H / 2;
            const dist = Math.hypot(zombie.x - plant.x, zombieY - plant.y);
            if (dist <= radius) {
              applyDamageToZombie(zombie, def.damage);
            }
          });
          state.effects.push({ x: plant.x, y: plant.y, ttl: 0.4, type: "boom", radius: radius * 0.7 });
          state.plants[row][col] = null;
          sound.beep(90, 0.2, "sawtooth", 0.09);
        }
      }

      if (def.kind === "trap") {
        plant.armTimer += dt;
        if (!plant.armed && plant.armTimer >= def.armTime) {
          plant.armed = true;
          plant.action = "ready";
          plant.actionTimer = 0.3;
          sound.beep(520, 0.05, "triangle", 0.03);
        }

        if (!plant.armed) {
          continue;
        }

        const triggerZombie = state.zombies.find(
          (zombie) => zombie.alive && zombie.row === row && Math.abs(zombie.x - plant.x) <= CELL_W * 0.38
        );
        if (triggerZombie) {
          const radius = def.radiusCells * CELL_W;
          state.zombies.forEach((zombie) => {
            if (!zombie.alive) {
              return;
            }
            const zombieY = BOARD_Y + zombie.row * CELL_H + CELL_H / 2;
            const dist = Math.hypot(zombie.x - plant.x, zombieY - plant.y);
            if (dist <= radius) {
              applyDamageToZombie(zombie, def.damage);
            }
          });
          state.effects.push({ x: plant.x, y: plant.y, ttl: 0.34, type: "boom", radius: radius * 0.48 });
          state.plants[row][col] = null;
          sound.beep(110, 0.14, "sawtooth", 0.07);
        }
      }

      if (def.kind === "pouncer") {
        const triggerZombie = state.zombies.find(
          (zombie) => zombie.alive && zombie.row === row && Math.abs(zombie.x - plant.x) <= CELL_W * def.triggerRange
        );
        if (triggerZombie) {
          plant.action = "attack";
          plant.actionTimer = 0.22;
          applyDamageToZombie(triggerZombie, def.damage);
          state.effects.push({ x: triggerZombie.x, y: plant.y, ttl: 0.26, type: "boom", radius: 24 });
          state.plants[row][col] = null;
          sound.beep(150, 0.11, "square", 0.06);
        }
      }

      if (def.kind === "groundtrap") {
        plant.attackTimer += dt;
        if (plant.attackTimer < def.hitInterval) {
          continue;
        }
        const targetZombie = state.zombies.find(
          (zombie) => zombie.alive && zombie.row === row && Math.abs(zombie.x - plant.x) <= CELL_W * 0.42
        );
        if (targetZombie) {
          plant.attackTimer = 0;
          plant.action = "attack";
          plant.actionTimer = 0.1;
          applyDamageToZombie(targetZombie, def.damage);
          state.effects.push({ x: targetZombie.x, y: plant.y + 10, ttl: 0.12, type: "hit" });
          sound.beep(260, 0.03, "triangle", 0.02);
        }
      }
    }
  }
}

export function updateProjectiles(dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = state.projectiles[i];
    if (!projectile.alive) {
      state.projectiles.splice(i, 1);
      continue;
    }
    projectile.x += projectile.speed * dt;
    if (projectile.x > BOARD_X + BOARD_W + 30) {
      releaseProjectile(projectile);
      state.projectiles.splice(i, 1);
      continue;
    }
    const hit = state.zombies.find(
      (zombie) => zombie.alive && zombie.row === projectile.row && Math.abs(zombie.x - projectile.x) < 22
    );
    if (hit) {
      applyDamageToZombie(hit, projectile.damage, projectile);
      releaseProjectile(projectile);
      state.projectiles.splice(i, 1);
    }
  }
}

export function updateZombies(dt) {
  state.zombies.forEach((zombie) => {
    if (!zombie.alive) {
      return;
    }

    zombie.hitFlash = Math.max(0, (zombie.hitFlash || 0) - dt);
    zombie.actionTimer = Math.max(0, (zombie.actionTimer || 0) - dt);
    if (zombie.actionTimer <= 0 && zombie.action === "hurt") {
      zombie.action = "walk";
    }

    const def = ZOMBIES[zombie.type];
    const rowPlants = state.plants[zombie.row];
    zombie.speed = zombie.baseSpeed;
    if (state.levelTime <= zombie.slowUntil) {
      zombie.speed *= 0.5;
    }
    zombie.damage = zombie.baseDamage;

    let targetCol = null;
    let targetPlant = null;
    for (let col = 0; col < COLS; col += 1) {
      const plant = rowPlants[col];
      if (!plant) {
        continue;
      }
      const plantFront = BOARD_X + col * CELL_W + 52;
      if (zombie.x <= plantFront) {
        targetCol = col;
        targetPlant = plant;
        break;
      }
    }

    if (targetPlant && Math.abs(zombie.x - targetPlant.x) < 45) {
      if (zombie.action !== "hurt") {
        zombie.action = "bite";
      }
      if (maybePoleVaultJump(zombie, targetPlant)) {
        return;
      }
      zombie.attackTimer += dt;
      if (zombie.attackTimer >= 1) {
        zombie.attackTimer = 0;
        targetPlant.hp -= zombie.damage;
        targetPlant.hitFlash = 0.15;
        targetPlant.action = "hurt";
        targetPlant.actionTimer = 0.12;
        sound.beep(220, 0.04, "square", 0.03);
        if (targetPlant.hp <= 0) {
          state.effects.push({
            x: targetPlant.x,
            y: targetPlant.y,
            ttl: 0.45,
            type: "plant-fall",
            plantId: targetPlant.plantId,
          });
          rowPlants[targetCol] = null;
          zombie.targetPlant = null;
        }
      }
    } else {
      if (zombie.action !== "hurt") {
        zombie.action = "walk";
      }
      zombie.x -= zombie.speed * dt;
      if (Math.random() < dt * 2.3) {
        state.effects.push({
          x: zombie.x - 3,
          y: BOARD_Y + zombie.row * CELL_H + CELL_H - 10,
          ttl: 0.28,
          type: "dust",
        });
      }
    }

    if (zombie.x <= HOUSE_LINE_X) {
      if (!activateLawnMower(zombie.row)) {
        endLevel(false, "僵尸突破了防线");
      }
    }

    if (def.enrageAt && !zombie.enraged && zombie.hp <= zombie.maxHp * def.enrageAt) {
      zombie.enraged = true;
      zombie.baseSpeed = def.enrageSpeed;
      zombie.baseDamage = def.enrageDamage;
    }
  });
  state.zombies = state.zombies.filter((zombie) => zombie.alive);
}

export function updateLawnMowers(dt) {
  state.lawnMowers.forEach((mower) => {
    if (!mower.active) {
      return;
    }

    mower.x += mower.speed * dt;
    state.zombies.forEach((zombie) => {
      if (!zombie.alive || zombie.row !== mower.row) {
        return;
      }
      if (zombie.x <= mower.x + 46 && zombie.x >= mower.x - 28) {
        zombie.alive = false;
        state.stats.kills += 1;
        state.effects.push({
          x: zombie.x,
          y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
          ttl: 0.45,
          type: "zombie-fall",
          zombieType: zombie.type,
          slowed: false,
        });
        state.effects.push({
          x: zombie.x + 8,
          y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
          ttl: 0.28,
          type: "mower-spark",
        });
      }
    });

    if (mower.x > BOARD_X + BOARD_W + 120) {
      mower.active = false;
    }
  });
}

export function updateSuns(dt) {
  state.suns.forEach((sun) => {
    if (!sun.alive) {
      return;
    }
    sun.ttl -= dt;
    if (sun.source === "sky") {
      sun.y += sun.vy * dt;
      const cap = BOARD_Y + BOARD_H - 28;
      if (sun.y > cap) {
        sun.y = cap;
      }
    }
    if (sun.ttl <= 0) {
      sun.alive = false;
    }
  });
  state.suns = state.suns.filter((sun) => sun.alive);
}

export function updateEffects(dt) {
  state.effects.forEach((effect) => {
    effect.ttl -= dt;
  });
  state.effects = state.effects.filter((effect) => effect.ttl > 0);
}

export function updateCooldowns(dt) {
  Object.keys(state.cardCooldowns).forEach((id) => {
    state.cardCooldowns[id] = Math.max(0, state.cardCooldowns[id] - dt);
  });
}

export function updateWaves() {
  if (state.mode === "endless") {
    if (state.levelTime >= state.endless.nextWaveAt) {
      const batch = buildEndlessBatch();
      spawnWaveBatch(batch);
      state.endless.wave += 1;
      const gap = Math.max(5, 9 - state.endless.wave * 0.22);
      state.endless.nextWaveAt = state.levelTime + gap;
    }

    const interval = Math.max(1, state.endless.nextWaveAt - state.levelTime);
    const fullGap = Math.max(5, 9 - Math.max(0, state.endless.wave - 1) * 0.22);
    const progress = Math.max(0, Math.min(1, 1 - interval / fullGap));
    ui.waveBar.style.width = `${Math.floor(progress * 100)}%`;
    ui.waveLabel.textContent = `∞ ${state.endless.wave}`;
    return;
  }

  const level = currentLevel();
  while (state.levelWaveIndex < level.waves.length && state.levelTime >= level.waves[state.levelWaveIndex].time) {
    spawnWaveBatch(level.waves[state.levelWaveIndex]);
    state.levelWaveIndex += 1;
  }

  const lastWaveTime = level.waves[level.waves.length - 1].time;
  const progress = Math.min(1, state.levelTime / (lastWaveTime + 15));
  ui.waveBar.style.width = `${Math.floor(progress * 100)}%`;
  ui.waveLabel.textContent = `${Math.floor(progress * 100)}%`;

  if (state.levelWaveIndex >= level.waves.length && state.zombies.length === 0) {
    endLevel(true, "防守成功，花园守住了");
  }
}

export function updateNaturalSun(dt) {
  const level = currentLevel();
  state.timers.naturalSun += dt;
  if (state.timers.naturalSun >= level.naturalSunInterval) {
    state.timers.naturalSun = 0;
    const x = BOARD_X + 70 + Math.random() * (BOARD_W - 140);
    const y = BOARD_Y + 30;
    spawnSun(x, y, "sky");
  }
}