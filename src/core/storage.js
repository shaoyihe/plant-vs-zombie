import { SAVE_KEY } from "../config/constants.js";
import { LEVELS } from "../config/levels.js";
import { PLANTS } from "../config/plants.js";
import { state } from "./state.js";

/**
 * 存档与加载模块，将游戏进度持久化到 localStorage。
 * 存档格式：{ unlockedLevel, lastLevelIndex, settings, lastLoadout, activeRun }
 * activeRun 为空表示无进行中局对，否则包含完整棋盘快照。
 */

/** 防止非数字值导致存档数据损坏。 */
function clampNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/** 将棋盘上所有植物当前状态序列化为可存档的纯数据对象列表。 */
function snapshotPlants() {
  const plants = [];
  state.plants.forEach((row) => {
    row.forEach((plant) => {
      if (!plant) {
        return;
      }
      plants.push({
        id: plant.id,
        plantId: plant.plantId,
        row: plant.row,
        col: plant.col,
        hp: plant.hp,
        fireTimer: plant.fireTimer,
        produceTimer: plant.produceTimer,
        fuseTimer: plant.fuseTimer,
        armTimer: plant.armTimer,
        armed: plant.armed,
        attackTimer: plant.attackTimer,
        burstQueue: plant.burstQueue,
        burstTimer: plant.burstTimer,
        hitFlash: plant.hitFlash,
        action: plant.action,
        actionTimer: plant.actionTimer,
        animSeed: plant.animSeed,
      });
    });
  });
  return plants;
}

/** 将棋盘上所有僵尸当前状态序列化为可存档的纯数据对象列表。 */
function snapshotZombies() {
  return state.zombies.map((zombie) => ({
    id: zombie.id,
    type: zombie.type,
    row: zombie.row,
    x: zombie.x,
    hp: zombie.hp,
    maxHp: zombie.maxHp,
    shieldHp: zombie.shieldHp,
    baseSpeed: zombie.baseSpeed,
    speed: zombie.speed,
    baseDamage: zombie.baseDamage,
    damage: zombie.damage,
    attackTimer: zombie.attackTimer,
    targetPlant: zombie.targetPlant,
    slowUntil: zombie.slowUntil,
    jumped: zombie.jumped,
    enraged: zombie.enraged,
    underground: zombie.underground,
    emerged: zombie.emerged,
    mineTargetX: zombie.mineTargetX,
    mineTargetCol: zombie.mineTargetCol,
    warningTimer: zombie.warningTimer,
    summonTimer: zombie.summonTimer,
    summonCount: zombie.summonCount,
    action: zombie.action,
    hitFlash: zombie.hitFlash,
    animSeed: zombie.animSeed,
    propDropState: zombie.propDropState,
    alive: zombie.alive,
  }));
}

/** 将棋盘上所有子弹当前状态序列化为可存档的纯数据对象列表。 */
function snapshotProjectiles() {
  return state.projectiles.map((projectile) => ({
    id: projectile.id,
    x: projectile.x,
    y: projectile.y,
    row: projectile.row,
    speed: projectile.speed,
    damage: projectile.damage,
    slow: projectile.slow,
    slowRatio: projectile.slowRatio,
    slowDuration: projectile.slowDuration,
    fire: projectile.fire,
    transformedByTorch: projectile.transformedByTorch,
    alive: projectile.alive,
  }));
}

/** 将所有阳光当前状态序列化为可存档的纯数据对象列表。 */
function snapshotSuns() {
  return state.suns.map((sun) => ({
    id: sun.id,
    x: sun.x,
    y: sun.y,
    value: sun.value,
    ttl: sun.ttl,
    source: sun.source,
    vy: sun.vy,
    alive: sun.alive,
  }));
}

/** 将所有割草机当前状态序列化为可存档的纯数据对象列表。 */
function snapshotLawnMowers() {
  return state.lawnMowers.map((mower) => ({
    id: mower.id,
    row: mower.row,
    x: mower.x,
    active: mower.active,
    spent: mower.spent,
    speed: mower.speed,
  }));
}

/** 将非空单元格状态（如大坑）序列化为可存档对象列表。 */
function snapshotCellStates() {
  const cellStates = [];
  state.cellStates.forEach((row, rowIndex) => {
    row.forEach((cellState, colIndex) => {
      if (!cellState) {
        return;
      }
      cellStates.push({
        row: rowIndex,
        col: colIndex,
        type: cellState.type,
        ttl: cellState.ttl,
        maxTtl: cellState.maxTtl,
      });
    });
  });
  return cellStates;
}

/**
 * 构建当前局对的完整快照，用于存入 activeRun。
 * @returns {Object} 局对快照对象
 */
function buildActiveRunSnapshot() {
  return {
    mode: state.mode,
    levelIndex: state.levelIndex,
    selectedLoadout: state.selectedLoadout.filter((id) => PLANTS[id]),
    sun: state.sun,
    speed: state.speed,
    levelTime: state.levelTime,
    levelWaveIndex: state.levelWaveIndex,
    timers: {
      naturalSun: state.timers.naturalSun,
    },
    endless: {
      wave: state.endless.wave,
      nextWaveAt: state.endless.nextWaveAt,
    },
    cardCooldowns: { ...state.cardCooldowns },
    stats: { ...state.stats },
    plants: snapshotPlants(),
    cellStates: snapshotCellStates(),
    zombies: snapshotZombies(),
    projectiles: snapshotProjectiles(),
    suns: snapshotSuns(),
    lawnMowers: snapshotLawnMowers(),
  };
}

/**
 * 对从 localStorage 读取的 activeRun 数据进行安全消毒：
 * 校验类型、范围院制数字、过滤非法植物 id，防止污数据导致常。
 */
function sanitizeActiveRun(activeRun) {
  if (!activeRun || typeof activeRun !== "object") {
    return null;
  }

  return {
    mode: activeRun.mode === "endless" ? "endless" : "level",
    levelIndex: Math.max(0, Math.min(LEVELS.length - 1, Number(activeRun.levelIndex) || 0)),
    selectedLoadout: Array.isArray(activeRun.selectedLoadout)
      ? activeRun.selectedLoadout.filter((id) => PLANTS[id]).slice(0, 5)
      : [],
    sun: clampNumber(activeRun.sun, 150),
    speed: Number(activeRun.speed) === 2 ? 2 : 1,
    levelTime: Math.max(0, clampNumber(activeRun.levelTime, 0)),
    levelWaveIndex: Math.max(0, clampNumber(activeRun.levelWaveIndex, 0)),
    timers: {
      naturalSun: Math.max(0, clampNumber(activeRun.timers?.naturalSun, 0)),
    },
    endless: {
      wave: Math.max(0, clampNumber(activeRun.endless?.wave, 0)),
      nextWaveAt: Math.max(0, clampNumber(activeRun.endless?.nextWaveAt, 4)),
    },
    cardCooldowns: activeRun.cardCooldowns && typeof activeRun.cardCooldowns === "object" ? activeRun.cardCooldowns : {},
    stats: activeRun.stats && typeof activeRun.stats === "object" ? activeRun.stats : {},
    plants: Array.isArray(activeRun.plants) ? activeRun.plants : [],
    cellStates: Array.isArray(activeRun.cellStates) ? activeRun.cellStates : [],
    zombies: Array.isArray(activeRun.zombies) ? activeRun.zombies : [],
    projectiles: Array.isArray(activeRun.projectiles) ? activeRun.projectiles : [],
    suns: Array.isArray(activeRun.suns) ? activeRun.suns : [],
    lawnMowers: Array.isArray(activeRun.lawnMowers) ? activeRun.lawnMowers : [],
  };
}

/**
 * 从 localStorage 加载存档，并将数据写入 state。
 * 若存档中包含 activeRun 字段，将其消毒后存入 state.savedRun 严备继续。
 */
export function loadSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  state.hasSavedGame = Boolean(raw);
  if (!raw) {
    return;
  }

  try {
    const save = JSON.parse(raw);
    state.unlockedLevel = Math.max(1, Math.min(LEVELS.length, save.unlockedLevel || 1));
    state.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, save.lastLevelIndex || 0));
    if (save.settings) {
      state.settings.volume = Number(save.settings.volume ?? 0.5);
      state.settings.defaultSpeed = Number(save.settings.defaultSpeed ?? 1);
      state.settings.audioEnabled = Boolean(save.settings.audioEnabled ?? true);
      state.settings.pauseBehavior = save.settings.pauseBehavior === "none" ? "none" : "overlay";
      state.settings.graphicsQuality = ["auto", "high", "medium", "low"].includes(save.settings.graphicsQuality)
        ? save.settings.graphicsQuality
        : "auto";
      state.settings.performanceMode = Boolean(save.settings.performanceMode ?? false);
    }
    if (Array.isArray(save.lastLoadout)) {
      state.selectedLoadout = save.lastLoadout.filter((id) => PLANTS[id]);
    }
    state.savedRun = sanitizeActiveRun(save.activeRun);
  } catch {
    localStorage.removeItem(SAVE_KEY);
    state.hasSavedGame = false;
    state.savedRun = null;
  }
}

/**
 * 将当前进度序列化后写入 localStorage。
 * @param {Object} options
 * @param {boolean} options.includeCurrentRun - 为 true 时快照当前局对状态并保存到 activeRun
 * @param {boolean} options.clearActiveRun   - 为 true 时清除 activeRun（开始新局时使用）
 */
export function saveProgress(options = {}) {
  const { includeCurrentRun = false, clearActiveRun = false } = options;
  let activeRun = state.savedRun;
  if (clearActiveRun) {
    activeRun = null;
    state.savedRun = null;
  } else if (includeCurrentRun) {
    activeRun = buildActiveRunSnapshot();
    state.savedRun = activeRun;
  }

  const payload = {
    unlockedLevel: state.unlockedLevel,
    lastLevelIndex: state.levelIndex,
    settings: state.settings,
    lastLoadout: state.selectedLoadout,
    activeRun,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  state.hasSavedGame = true;
}