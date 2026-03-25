import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_H, CELL_W, COLS, HOUSE_LINE_X, ROWS } from "../config/constants.js";
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
import { showToast } from "../ui/panels.js";

/**
 * 棋盘每帧逻辑更新模块。
 * 每个公开函数对应一类实体的逐帧状态推进，
 * 由 main.js 的游戏主循环逐帧调用。
 */

/** 激活指定行的割草机，若已激活或已使用过则跳过。 */
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

/**
 * 为无尽模式动态生成一波僵尸。
 * 随波次递增毹度，解锁更多类型的僵尸并增加召唤数量。
 */
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
  if (wave >= 13) {
    picks.push("miner");
  }
  if (wave >= 14) {
    picks.push("dancing", "backup");
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

function spawnBackupDancer(row, x) {
  state.zombies.push({
    id: crypto.randomUUID(),
    type: "backup",
    row,
    x,
    hp: ZOMBIES.backup.hp,
    maxHp: ZOMBIES.backup.hp,
    shieldHp: 0,
    baseSpeed: ZOMBIES.backup.speed,
    speed: ZOMBIES.backup.speed,
    baseDamage: ZOMBIES.backup.damage,
    damage: ZOMBIES.backup.damage,
    attackTimer: 0,
    targetPlant: null,
    slowUntil: 0,
    jumped: false,
    enraged: false,
    summonTimer: 0,
    summonCount: 0,
    action: "summon",
    actionTimer: 0.42,
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

function findMinerTarget(row) {
  const rowPlants = state.plants[row] || [];
  for (let col = 0; col < COLS; col += 1) {
    const plant = rowPlants[col];
    if (plant && PLANTS[plant.plantId]?.kind !== "tank") {
      return { col, plant };
    }
  }
  for (let col = 0; col < COLS; col += 1) {
    const plant = rowPlants[col];
    if (plant) {
      return { col, plant };
    }
  }
  return null;
}

function findMinerEmergeX(row) {
  const target = findMinerTarget(row);
  if (target?.plant) {
    return Math.min(target.plant.x + 28, BOARD_X + BOARD_W - 40);
  }
  return HOUSE_LINE_X + 60;
}

function igniteProjectile(projectile, torchwood) {
  if (!projectile || projectile.transformedByTorch) {
    return;
  }
  const wasSlow = Boolean(projectile.slow);
  projectile.transformedByTorch = true;
  projectile.fire = true;
  projectile.damage = Math.max(projectile.damage * 2, projectile.damage + (PLANTS.torchwood.boostDamage || 20));
  projectile.slow = false;
  projectile.slowDuration = 0;
  projectile.slowRatio = 1;
  state.effects.push({
    x: torchwood.x,
    y: torchwood.y,
    ttl: 0.16,
    type: "fire-hit",
  });
  if (wasSlow && state.timers.torchHint <= 0) {
    state.timers.torchHint = 2.4;
    showToast("寒冰豌豆被火炬点燃，已变为火焰豌豆");
  }
}

function hasMetalGear(zombie) {
  if (!zombie || !zombie.alive || zombie.underground) {
    return false;
  }
  if (zombie.type === "buckethead" && !zombie.propDropState.bucketDropped && zombie.hp > zombie.maxHp * 0.48) {
    return true;
  }
  if (zombie.type === "screendoor" && zombie.shieldHp > 0 && !zombie.propDropState.shieldDropped) {
    return true;
  }
  if (zombie.type === "football" && !zombie.propDropState.helmetDropped && zombie.hp > zombie.maxHp * 0.42) {
    return true;
  }
  if (zombie.type === "miner" && !zombie.propDropState.minerHelmetDropped) {
    return true;
  }
  return false;
}

function stripMetalGear(zombie) {
  if (!zombie || !hasMetalGear(zombie)) {
    return false;
  }

  const effectY = BOARD_Y + zombie.row * CELL_H + CELL_H / 2;
  if (zombie.type === "buckethead") {
    zombie.propDropState.bucketDropped = true;
    zombie.hp = Math.min(zombie.hp, zombie.maxHp * 0.48);
    state.effects.push({ x: zombie.x, y: effectY - 12, ttl: 0.6, type: "bucket-drop" });
  } else if (zombie.type === "screendoor") {
    zombie.propDropState.shieldDropped = true;
    zombie.shieldHp = 0;
    state.effects.push({ x: zombie.x - 18, y: effectY, ttl: 0.6, type: "door-drop" });
  } else if (zombie.type === "football") {
    zombie.propDropState.helmetDropped = true;
    zombie.hp = Math.min(zombie.hp, zombie.maxHp * 0.42);
    state.effects.push({ x: zombie.x, y: effectY - 10, ttl: 0.5, type: "bucket-drop" });
  } else if (zombie.type === "miner") {
    zombie.propDropState.minerHelmetDropped = true;
    state.effects.push({ x: zombie.x, y: effectY - 10, ttl: 0.5, type: "bucket-drop" });
  }

  zombie.action = "hurt";
  zombie.actionTimer = 0.2;
  state.effects.push({ x: zombie.x, y: effectY, ttl: 0.22, type: "magnet-pull" });
  sound.beep(340, 0.05, "triangle", 0.03);
  return true;
}

/**
 * 逐帧更新所有植物状态：冷却计时、产阳光、射击、爆炸、降温、吸铁等行为。
 * @param {number} dt - 帧时间间隔（秒）
 */
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
        const targetRows = Array.isArray(def.spreadRows)
          ? def.spreadRows
              .map((offset) => row + offset)
              .filter((candidateRow, index, rows) => candidateRow >= 0 && candidateRow < ROWS && rows.indexOf(candidateRow) === index)
          : [row];
        const hasTarget = targetRows.some((targetRow) => hasZombieAhead(targetRow, col));
        if (hasTarget && plant.fireTimer >= def.fireRate) {
          plant.fireTimer = 0;
          plant.action = "attack";
          plant.actionTimer = 0.18;
          if (def.burst) {
            plant.burstQueue = def.burst;
            plant.burstTimer = 0;
          } else {
            targetRows.forEach((targetRow) => {
              if (!hasZombieAhead(targetRow, col)) {
                return;
              }
              const rowOffset = targetRow - row;
              spawnProjectile(plant, def, rowOffset * CELL_H, Boolean(def.slow), targetRow);
            });
          }
          sound.beep(460, 0.05, "triangle", 0.03);
        }
        if (plant.burstQueue > 0) {
          plant.burstTimer -= dt;
          if (plant.burstTimer <= 0) {
            if (Array.isArray(def.spreadRows)) {
              targetRows.forEach((targetRow) => {
                if (!hasZombieAhead(targetRow, col)) {
                  return;
                }
                const rowOffset = targetRow - row;
                spawnProjectile(
                  plant,
                  def,
                  rowOffset * CELL_H + (plant.burstQueue % 2 === 0 ? -4 : 4),
                  Boolean(def.slow),
                  targetRow
                );
              });
            } else {
              spawnProjectile(plant, def, plant.burstQueue % 2 === 0 ? -4 : 4, Boolean(def.slow));
            }
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

      if (def.kind === "freezebomb") {
        plant.fuseTimer += dt;
        if (plant.fuseTimer >= def.fuse) {
          state.zombies.forEach((zombie) => {
            if (!zombie.alive || zombie.underground) {
              return;
            }
            zombie.slowUntil = Math.max(zombie.slowUntil, state.levelTime + def.freezeDuration);
            zombie.hitFlash = 0.18;
            zombie.action = "hurt";
            zombie.actionTimer = 0.18;
            zombie.hp -= def.damage;
            state.effects.push({
              x: zombie.x,
              y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
              ttl: 0.24,
              type: "ice-hit",
            });
            if (zombie.hp <= 0) {
              zombie.alive = false;
              state.stats.kills += 1;
              state.effects.push({
                x: zombie.x,
                y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
                ttl: 0.6,
                type: "zombie-fall",
                zombieType: zombie.type,
                slowed: true,
              });
              state.effects.push({
                x: zombie.x,
                y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
                ttl: 0.45,
                type: "pop",
              });
            }
          });
          state.effects.push({ x: plant.x, y: plant.y, ttl: 0.45, type: "ice-wave", radius: BOARD_W * 0.42 });
          state.plants[row][col] = null;
          sound.beep(210, 0.16, "sine", 0.05);
        }
      }

      if (def.kind === "megabomb") {
        plant.fuseTimer += dt;
        if (plant.fuseTimer >= def.fuse) {
          const radius = def.radiusCells * CELL_W;
          state.zombies.forEach((zombie) => {
            if (!zombie.alive || zombie.underground) {
              return;
            }
            const zombieY = BOARD_Y + zombie.row * CELL_H + CELL_H / 2;
            const dist = Math.hypot(zombie.x - plant.x, zombieY - plant.y);
            if (dist <= radius) {
              applyDamageToZombie(zombie, def.damage);
            }
          });
          state.effects.push({ x: plant.x, y: plant.y, ttl: 0.58, type: "doom-blast", radius: radius * 0.86 });
          state.effects.push({ x: plant.x, y: plant.y, ttl: 0.44, type: "boom", radius: radius * 0.62 });
          state.effects.push({ x: plant.x, y: plant.y, ttl: 1.15, type: "doom-heat", radius: radius * 0.92 });
          state.effects.push({ x: plant.x, y: plant.y, ttl: 1.55, type: "doom-edge", radius: radius * 0.8 });
          for (let index = 0; index < 7; index += 1) {
            const angle = (index / 7) * Math.PI * 2;
            const distance = 10 + index * 4;
            state.effects.push({
              x: plant.x + Math.cos(angle) * distance,
              y: plant.y + Math.sin(angle) * distance * 0.45,
              ttl: 0.95 + index * 0.05,
              type: "doom-smoke",
              driftX: Math.cos(angle) * (10 + Math.random() * 8),
              rise: 0,
              size: 12 + index * 2.6,
            });
          }
          state.cellStates[row][col] = {
            type: "crater",
            ttl: def.craterDuration,
            maxTtl: def.craterDuration,
          };
          state.plants[row][col] = null;
          sound.beep(70, 0.32, "sawtooth", 0.1);
          sound.beep(48, 0.2, "square", 0.05);
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

      if (def.kind === "magnet") {
        plant.fireTimer += dt;
        if (plant.fireTimer >= def.fireRate) {
          const rangePx = def.range * CELL_W;
          const candidates = state.zombies
            .filter((zombie) => hasMetalGear(zombie))
            .map((zombie) => ({
              zombie,
              dist: Math.hypot(zombie.x - plant.x, BOARD_Y + zombie.row * CELL_H + CELL_H / 2 - plant.y),
            }))
            .filter((entry) => entry.dist <= rangePx)
            .sort((left, right) => left.dist - right.dist);
          const target = candidates[0]?.zombie;
          if (target && stripMetalGear(target)) {
            plant.fireTimer = 0;
            plant.action = "attack";
            plant.actionTimer = 0.26;
          }
        }
      }

      if (def.kind === "torch") {
        plant.action = "idle";
      }

      if (def.kind === "devourer") {
        plant.attackTimer = Math.max(0, (plant.attackTimer || 0) - dt);
        if (plant.attackTimer > 0) {
          plant.action = "digest";
          plant.actionTimer = 0.18;
          continue;
        }
        const targetZombie = state.zombies.find(
          (zombie) => zombie.alive && zombie.row === row && zombie.x >= plant.x - 12 && zombie.x - plant.x <= CELL_W * def.range
        );
        if (targetZombie) {
          plant.action = "attack";
          plant.actionTimer = 0.24;
          plant.attackTimer = def.chewTime;
          targetZombie.alive = false;
          state.stats.kills += 1;
          state.effects.push({ x: targetZombie.x, y: plant.y + 6, ttl: 0.32, type: "pop" });
          sound.beep(180, 0.08, "square", 0.04);
        }
      }
    }
  }
}

/**
 * 逐帧更新所有子弹：移动、穿越火炬转化、边界清除以及命中僵尸检测。
 * @param {number} dt - 帧时间间隔（秒）
 */
export function updateProjectiles(dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = state.projectiles[i];
    if (!projectile.alive) {
      state.projectiles.splice(i, 1);
      continue;
    }
    const previousX = projectile.x;
    projectile.x += projectile.speed * dt;
    state.plants[projectile.row]?.forEach((plant) => {
      if (!plant || plant.plantId !== "torchwood") {
        return;
      }
      if (previousX < plant.x && projectile.x >= plant.x - 4) {
        igniteProjectile(projectile, plant);
      }
    });
    if (projectile.x > BOARD_X + BOARD_W + 30) {
      releaseProjectile(projectile);
      state.projectiles.splice(i, 1);
      continue;
    }
    const hit = state.zombies.find(
      (zombie) => zombie.alive && zombie.row === projectile.row && !zombie.underground && Math.abs(zombie.x - projectile.x) < 22
    );
    if (hit) {
      applyDamageToZombie(hit, projectile.damage, projectile);
      releaseProjectile(projectile);
      state.projectiles.splice(i, 1);
    }
  }
}

/**
 * 逐帧更新所有僵尸状态：移动、攻击植物、矿工出土、舞王召唤伴舞、割草机触发及关卡失败检测。
 * @param {number} dt - 帧时间间隔（秒）
 */
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
    if (zombie.actionTimer <= 0 && zombie.action === "emerge") {
      zombie.action = "walk";
    }
    if (zombie.actionTimer <= 0 && zombie.action === "summon") {
      zombie.action = "walk";
    }

    const def = ZOMBIES[zombie.type];
    const rowPlants = state.plants[zombie.row];

    if (zombie.type === "miner" && zombie.underground) {
      zombie.action = "dig";
      zombie.damage = zombie.baseDamage;
      zombie.speed = def.undergroundSpeed;
      const minerTarget = findMinerTarget(zombie.row);
      if (minerTarget) {
        zombie.mineTargetCol = minerTarget.col;
      }
      zombie.mineTargetX = zombie.mineTargetX ?? findMinerEmergeX(zombie.row);
      zombie.warningTimer = Math.max(0, (zombie.warningTimer || 0) - dt);
      if (zombie.warningTimer <= 0 && zombie.mineTargetCol !== null) {
        const warningX = BOARD_X + zombie.mineTargetCol * CELL_W + CELL_W / 2;
        state.effects.push({
          x: warningX,
          y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
          ttl: 0.42,
          type: "miner-warning",
        });
        zombie.warningTimer = 0.72;
      }
      zombie.x -= zombie.speed * dt;
      if (zombie.x <= zombie.mineTargetX) {
        zombie.underground = false;
        zombie.emerged = true;
        zombie.action = "emerge";
        zombie.actionTimer = 0.45;
        zombie.x = zombie.mineTargetX;
        state.effects.push({
          x: zombie.x,
          y: BOARD_Y + zombie.row * CELL_H + CELL_H - 12,
          ttl: 0.3,
          type: "dust",
        });
        sound.beep(150, 0.05, "square", 0.03);
      }
      return;
    }

    zombie.speed = zombie.baseSpeed;
    if (state.levelTime <= zombie.slowUntil) {
      zombie.speed *= 0.5;
    }
    zombie.damage = zombie.baseDamage;

    if (zombie.type === "dancing") {
      zombie.summonTimer += dt;
      const canSummon = zombie.summonCount < 1 && zombie.summonTimer >= ZOMBIES.dancing.summonCooldown;
      if (canSummon) {
        const summonSlots = [
          { row: zombie.row - 1, x: zombie.x + 18 },
          { row: zombie.row + 1, x: zombie.x + 18 },
          { row: zombie.row, x: zombie.x + CELL_W * 0.52 },
          { row: zombie.row, x: zombie.x - CELL_W * 0.48 },
        ];
        summonSlots.forEach((slot) => {
          if (slot.row < 0 || slot.row >= state.plants.length) {
            return;
          }
          const occupied = state.zombies.some(
            (other) => other.alive && other.row === slot.row && Math.abs(other.x - slot.x) < 28
          );
          if (occupied) {
            return;
          }
          spawnBackupDancer(slot.row, slot.x);
        });
        zombie.summonTimer = 0;
        zombie.summonCount += 1;
        zombie.action = "summon";
        zombie.actionTimer = 0.7;
        state.effects.push({
          x: zombie.x,
          y: BOARD_Y + zombie.row * CELL_H + CELL_H / 2,
          ttl: 0.32,
          type: "mower-spark",
        });
      }
    }

    let targetCol = null;
    let targetPlant = null;
    const targetCols = [];
    if (zombie.type === "miner" && zombie.emerged && zombie.mineTargetCol !== null) {
      targetCols.push(zombie.mineTargetCol);
    }
    for (let index = 0; index < COLS; index += 1) {
      if (!targetCols.includes(index)) {
        targetCols.push(index);
      }
    }
    for (const col of targetCols) {
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
      if (zombie.action !== "hurt" && zombie.action !== "emerge") {
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
      if (zombie.action !== "hurt" && zombie.action !== "emerge") {
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

/**
 * 逐帧更新割草机：过棋盘右侧后标记为已用完并垂到地僵尸。
 * @param {number} dt
 */
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

/**
 * 逐帧更新阳光实体：天降阳光慢慢下落并超时后移除。
 * @param {number} dt
 */
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

/**
 * 逐帧更新特效实体（爆炸、冰冻波等）和单元格状态（如大坑倒计时）。
 * @param {number} dt
 */
export function updateEffects(dt) {
  state.cellStates.forEach((row, rowIndex) => {
    row.forEach((cellState, colIndex) => {
      if (!cellState) {
        return;
      }
      cellState.ttl -= dt;
      if (cellState.ttl <= 0) {
        state.cellStates[rowIndex][colIndex] = null;
      }
    });
  });
  state.effects.forEach((effect) => {
    if (effect.type === "doom-smoke") {
      effect.x += (effect.driftX || 0) * dt;
      effect.rise = (effect.rise || 0) + 22 * dt;
    }
    effect.ttl -= dt;
  });
  state.effects = state.effects.filter((effect) => effect.ttl > 0);
}

/**
 * 逐帧减少所有植物卡的冷却情况。
 * @param {number} dt
 */
export function updateCooldowns(dt) {
  Object.keys(state.cardCooldowns).forEach((id) => {
    state.cardCooldowns[id] = Math.max(0, state.cardCooldowns[id] - dt);
  });
}

/**
 * 根据局卡时间触发关卡或无尽模式波次，并更新进度条和波次标签。
 * 每帧调用一次，内部不传入 dt（支掤关卡时间和无尽 timer）。
 */
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

/**
 * 逐帧确认是否应该天降阳光，满足间隔时在随机列位生成阳光。
 * @param {number} dt
 */
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