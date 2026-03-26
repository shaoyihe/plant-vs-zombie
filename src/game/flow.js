import { formatLevelFullLabel, formatLevelShortLabel, LEVELS } from "../config/levels.js";
import { BOARD_X, BOARD_Y, CELL_H, CELL_W, COLS, HOUSE_LINE_X, ROWS } from "../config/constants.js";
import { PLANTS } from "../config/plants.js";
import { ZOMBIES } from "../config/zombies.js";
import { sound } from "../core/audio.js";
import {
  clearPendingSpawns,
  createCellStateGrid,
  createGrid,
  createLawnMowers,
  currentLevel,
  ensureValidLoadout,
  getContinueLevelNumber,
  resetBoardData,
  state,
} from "../core/state.js";
import { saveProgress } from "../core/storage.js";
import { draw } from "../render/draw.js";
import { ui } from "../ui/dom.js";
import { renderCards, renderChapterProgress, renderPrepCards, syncTopButtons, updatePauseCover } from "../ui/panels.js";

/**
 * 游戏流程模块：管理关卡宇张、局对准备、进行中局对和返回菜单等项层状态流转。
 * 不包含棋盘内部逐帧逻辑（见 update.js）。
 */

/** 帆整数并将其限制在 [min, max] 区间内。 */
function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));
}

function restorePlants(savedPlants) {
  const plants = createGrid();
  savedPlants.forEach((savedPlant) => {
    if (!savedPlant || !PLANTS[savedPlant.plantId]) {
      return;
    }
    const row = clampInt(savedPlant.row, 0, ROWS - 1);
    const col = clampInt(savedPlant.col, 0, COLS - 1);
    if (plants[row][col]) {
      return;
    }
    plants[row][col] = {
      id: savedPlant.id || crypto.randomUUID(),
      plantId: savedPlant.plantId,
      row,
      col,
      x: BOARD_X + col * CELL_W + CELL_W / 2,
      y: BOARD_Y + row * CELL_H + CELL_H / 2,
      hp: Number(savedPlant.hp) || PLANTS[savedPlant.plantId].hp,
      fireTimer: Number(savedPlant.fireTimer) || 0,
      produceTimer: Number(savedPlant.produceTimer) || 0,
      fuseTimer: Number(savedPlant.fuseTimer) || 0,
      armTimer: Number(savedPlant.armTimer) || 0,
      armed: savedPlant.armed ?? PLANTS[savedPlant.plantId].kind !== "trap",
      attackTimer: Number(savedPlant.attackTimer) || 0,
      burstQueue: Number(savedPlant.burstQueue) || 0,
      burstTimer: Number(savedPlant.burstTimer) || 0,
      hitFlash: Number(savedPlant.hitFlash) || 0,
      action: savedPlant.action || "idle",
      actionTimer: Number(savedPlant.actionTimer) || 0,
      animSeed: Number.isFinite(savedPlant.animSeed) ? savedPlant.animSeed : Math.random() * Math.PI * 2,
    };
  });
  return plants;
}

function restoreCellStates(savedCellStates) {
  const cellStates = createCellStateGrid();
  savedCellStates.forEach((savedCellState) => {
    if (!savedCellState || savedCellState.type !== "crater") {
      return;
    }
    const row = clampInt(savedCellState.row, 0, ROWS - 1);
    const col = clampInt(savedCellState.col, 0, COLS - 1);
    cellStates[row][col] = {
      type: "crater",
      ttl: Math.max(0.05, Number(savedCellState.ttl) || 0),
      maxTtl: Math.max(0.05, Number(savedCellState.maxTtl) || Number(savedCellState.ttl) || 0),
    };
  });
  return cellStates;
}

function restoreZombies(savedZombies) {
  return savedZombies
    .filter((savedZombie) => savedZombie && ZOMBIES[savedZombie.type])
    .map((savedZombie) => {
      const def = ZOMBIES[savedZombie.type];
      return {
        id: savedZombie.id || crypto.randomUUID(),
        type: savedZombie.type,
        row: clampInt(savedZombie.row, 0, ROWS - 1),
        x: Number(savedZombie.x) || BOARD_X + COLS * CELL_W + 25,
        hp: Number(savedZombie.hp) || def.hp,
        maxHp: Number(savedZombie.maxHp) || def.hp,
        shieldHp: Number(savedZombie.shieldHp) || def.shieldHp || 0,
        baseSpeed: Number(savedZombie.baseSpeed) || def.speed,
        speed: Number(savedZombie.speed) || def.speed,
        baseDamage: Number(savedZombie.baseDamage) || def.damage,
        damage: Number(savedZombie.damage) || def.damage,
        attackTimer: Number(savedZombie.attackTimer) || 0,
        targetPlant: savedZombie.targetPlant || null,
        slowUntil: Number(savedZombie.slowUntil) || 0,
        jumped: Boolean(savedZombie.jumped),
        enraged: Boolean(savedZombie.enraged),
        underground: Boolean(savedZombie.underground),
        emerged: Boolean(savedZombie.emerged),
        mineTargetX: Number(savedZombie.mineTargetX) || null,
        mineTargetCol: Number.isInteger(savedZombie.mineTargetCol) ? savedZombie.mineTargetCol : null,
        warningTimer: Number(savedZombie.warningTimer) || 0,
        summonTimer: Number(savedZombie.summonTimer) || 0,
        summonCount: Number(savedZombie.summonCount) || 0,
        action: savedZombie.action || "walk",
        hitFlash: Number(savedZombie.hitFlash) || 0,
        animSeed: Number.isFinite(savedZombie.animSeed) ? savedZombie.animSeed : Math.random() * Math.PI * 2,
        propDropState: savedZombie.propDropState || {
          coneDropped: false,
          bucketDropped: false,
          paperDropped: false,
          shieldDropped: false,
          poleDropped: false,
        },
        alive: savedZombie.alive !== false,
      };
    });
}

function restoreProjectiles(savedProjectiles) {
  return savedProjectiles.map((projectile) => ({
    id: projectile.id || crypto.randomUUID(),
    x: Number(projectile.x) || BOARD_X,
    y: Number(projectile.y) || BOARD_Y,
    row: clampInt(projectile.row, 0, ROWS - 1),
    speed: Number(projectile.speed) || 0,
    damage: Number(projectile.damage) || 0,
    slow: Boolean(projectile.slow),
    slowRatio: Number(projectile.slowRatio) || 1,
    slowDuration: Number(projectile.slowDuration) || 0,
    fire: Boolean(projectile.fire),
    transformedByTorch: Boolean(projectile.transformedByTorch),
    alive: projectile.alive !== false,
  }));
}

function restoreSuns(savedSuns) {
  return savedSuns.map((sun) => ({
    id: sun.id || crypto.randomUUID(),
    x: Number(sun.x) || BOARD_X,
    y: Number(sun.y) || BOARD_Y,
    value: Number(sun.value) || 25,
    ttl: Number(sun.ttl) || 0,
    source: sun.source || "sky",
    vy: Number(sun.vy) || 0,
    alive: sun.alive !== false,
  }));
}

function restoreLawnMowers(savedMowers) {
  const lawnMowers = createLawnMowers();
  savedMowers.forEach((savedMower) => {
    const row = clampInt(savedMower?.row, 0, ROWS - 1);
    lawnMowers[row] = {
      ...lawnMowers[row],
      id: savedMower?.id || lawnMowers[row].id,
      x: Number(savedMower?.x) || HOUSE_LINE_X - 44,
      active: Boolean(savedMower?.active),
      spent: Boolean(savedMower?.spent),
      speed: Number(savedMower?.speed) || lawnMowers[row].speed,
    };
  });
  return lawnMowers;
}

function restoreEffects(savedEffects) {
  return savedEffects.map((effect) => ({
    x: Number(effect.x) || BOARD_X,
    y: Number(effect.y) || BOARD_Y,
    ttl: Math.max(0.05, Number(effect.ttl) || 0.12),
    type: effect.type || "dust",
    radius: Number(effect.radius) || 0,
    zombieType: effect.zombieType || null,
    slowed: Boolean(effect.slowed),
    plantId: effect.plantId || null,
  }));
}

function renderResultStats() {
  ui.resultStats.innerHTML = `
    <div>总击杀：${state.stats.kills}</div>
    <div>作战时长：${Math.floor(state.stats.spentSeconds)} 秒</div>
    <div>收集阳光：${state.stats.sunsCollected}</div>
    <div>消耗阳光：${state.stats.sunsSpent}</div>
    <div>放置植物：${state.stats.plantsPlaced}</div>
    <div>移除植物：${state.stats.plantsRemoved}</div>
    <div>发射子弹：${state.stats.projectilesFired}</div>
  `;
}

function snapshotCarryOverPlants() {
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

function snapshotCarryOverMowers() {
  return state.lawnMowers.map((mower) => ({
    id: mower.id,
    row: mower.row,
    x: mower.x,
    active: mower.active,
    spent: mower.spent,
    speed: mower.speed,
  }));
}

function snapshotCarryOverCellStates() {
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

function snapshotCarryOverSuns() {
  return state.suns
    .filter((sun) => sun && sun.alive)
    .map((sun) => ({
      id: sun.id,
      x: sun.x,
      y: sun.y,
      value: sun.value,
      ttl: sun.ttl,
      source: sun.source,
      vy: sun.vy,
      alive: true,
    }));
}

function snapshotCarryOverProjectiles() {
  return state.projectiles
    .filter((projectile) => projectile && projectile.alive)
    .map((projectile) => ({
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
      alive: true,
    }));
}

function snapshotCarryOverEffects() {
  const allowedTypes = new Set(["dust", "mower-spark", "mower-start"]);
  return state.effects
    .filter((effect) => effect && allowedTypes.has(effect.type) && Number(effect.ttl) > 0.04)
    .map((effect) => ({
      x: effect.x,
      y: effect.y,
      ttl: Math.min(0.35, Math.max(0.08, Number(effect.ttl) || 0.12)),
      type: effect.type,
      radius: effect.radius,
      zombieType: effect.zombieType,
      slowed: effect.slowed,
      plantId: effect.plantId,
    }));
}

/**
 * 展示选卡介面（prepOverlay），让玩家选择植物卡片。
 * @param {number} index - 局卡索引
 * @param {"level"|"endless"} mode - 游戏模式
 * @param {Object} options
 * @param {boolean} options.preserveCarryOver - 为 true 时保留节关数据
 */
export function prepareLevel(index, mode = "level", options = {}) {
  const { preserveCarryOver = false } = options;
  state.mode = mode;
  state.levelIndex = index;
  if (!preserveCarryOver) {
    state.levelCarryOver = null;
  }
  const level = currentLevel();
  state.selectedLoadout = ensureValidLoadout(level);
  ui.resultStats.innerHTML = "";
  renderPrepCards();
  ui.resultOverlay.classList.remove("visible");
  ui.menuOverlay.classList.remove("visible");
  ui.prepOverlay.classList.add("visible");
}

/**
 * 实际启动局对：重置棋盘、将上局结束时的植物、阳光等数据继承到新局。
 * @param {number} index - 局卡索引
 * @param {"level"|"endless"} mode - 游戏模式
 */
export function startLevel(index, mode = state.mode) {
  state.mode = mode;
  state.levelIndex = index;
  const carryOver =
    state.mode === "level" && state.levelCarryOver && state.levelCarryOver.targetLevelIndex === index
      ? state.levelCarryOver
      : null;
  resetBoardData();
  state.savedRun = null;
  const level = currentLevel();
  state.selectedLoadout = ensureValidLoadout(level);
  state.speed = state.settings.defaultSpeed;
  state.sun = carryOver ? Math.max(0, Number(carryOver.sun) || 0) : level.startSun;
  if (carryOver) {
    state.plants = restorePlants(carryOver.plants || []);
    state.cellStates = restoreCellStates(carryOver.cellStates || []);
    state.lawnMowers = restoreLawnMowers(carryOver.lawnMowers || []);
    state.suns = restoreSuns(carryOver.suns || []);
    state.projectiles = restoreProjectiles(carryOver.projectiles || []);
    state.effects = restoreEffects(carryOver.effects || []);
    Object.keys(state.cardCooldowns).forEach((id) => {
      state.cardCooldowns[id] = Math.max(0, Number(carryOver.cardCooldowns?.[id]) || 0);
    });
  }
  state.levelCarryOver = null;
  state.running = true;
  state.paused = false;
  state.result = null;
  ui.resultStats.innerHTML = "";
  ui.resultOverlay.classList.remove("visible");
  ui.menuOverlay.classList.remove("visible");
  ui.prepOverlay.classList.remove("visible");
  ui.speedBtn.textContent = `${state.speed}x`;
  ui.pauseBtn.textContent = "暂停";
  syncTopButtons();
  renderCards();
  updatePauseCover();
  ui.levelLabel.textContent = state.mode === "endless" ? "∞" : formatLevelShortLabel(level);
  saveProgress({ clearActiveRun: true });
}

/**
 * 將1关勝利后进入下一关，将当前棋盘数据快照并存入 levelCarryOver。
 * 若已是最后一关，则停留在最后一关的选卡界面。
 */
export function prepareNextLevel() {
  if (state.mode !== "level" || !state.result?.victory) {
    return;
  }
  const next = Math.min(state.levelIndex + 1, LEVELS.length - 1);
  state.levelCarryOver = {
    sourceLevelIndex: state.levelIndex,
    targetLevelIndex: next,
    sun: state.sun,
    plants: snapshotCarryOverPlants(),
    cellStates: snapshotCarryOverCellStates(),
    lawnMowers: snapshotCarryOverMowers(),
    suns: snapshotCarryOverSuns(),
    projectiles: snapshotCarryOverProjectiles(),
    effects: snapshotCarryOverEffects(),
    cardCooldowns: { ...state.cardCooldowns },
  };
  prepareLevel(next, "level", { preserveCarryOver: true });
}

/**
 * 从 state.savedRun 恢复保存的局对。
 * @returns {boolean} 是否成功恢复
 */
export function resumeSavedRun() {
  if (!state.savedRun) {
    return false;
  }

  state.mode = state.savedRun.mode;
  state.levelIndex = clampInt(state.savedRun.levelIndex, 0, LEVELS.length - 1);
  resetBoardData();
  const level = currentLevel();
  state.selectedLoadout = ensureValidLoadout(level, state.savedRun.selectedLoadout);
  state.speed = state.savedRun.speed;
  state.sun = Math.max(0, Number(state.savedRun.sun) || level.startSun);
  state.levelTime = Math.max(0, Number(state.savedRun.levelTime) || 0);
  state.levelWaveIndex = Math.max(0, Number(state.savedRun.levelWaveIndex) || 0);
  state.endless.wave = Math.max(0, Number(state.savedRun.endless?.wave) || 0);
  state.endless.nextWaveAt = Math.max(0, Number(state.savedRun.endless?.nextWaveAt) || 4);
  state.timers.naturalSun = Math.max(0, Number(state.savedRun.timers?.naturalSun) || 0);
  Object.keys(state.cardCooldowns).forEach((id) => {
    state.cardCooldowns[id] = Math.max(0, Number(state.savedRun.cardCooldowns?.[id]) || 0);
  });
  state.stats.kills = Math.max(0, Number(state.savedRun.stats?.kills) || 0);
  state.stats.spentSeconds = Math.max(0, Number(state.savedRun.stats?.spentSeconds) || 0);
  state.stats.sunsCollected = Math.max(0, Number(state.savedRun.stats?.sunsCollected) || 0);
  state.stats.sunsSpent = Math.max(0, Number(state.savedRun.stats?.sunsSpent) || 0);
  state.stats.plantsPlaced = Math.max(0, Number(state.savedRun.stats?.plantsPlaced) || 0);
  state.stats.plantsRemoved = Math.max(0, Number(state.savedRun.stats?.plantsRemoved) || 0);
  state.stats.projectilesFired = Math.max(0, Number(state.savedRun.stats?.projectilesFired) || 0);
  state.plants = restorePlants(state.savedRun.plants || []);
  state.cellStates = restoreCellStates(state.savedRun.cellStates || []);
  state.zombies = restoreZombies(state.savedRun.zombies || []);
  state.projectiles = restoreProjectiles(state.savedRun.projectiles || []);
  state.suns = restoreSuns(state.savedRun.suns || []);
  state.lawnMowers = restoreLawnMowers(state.savedRun.lawnMowers || []);
  state.running = true;
  state.paused = false;
  state.result = null;
  ui.resultStats.innerHTML = "";
  ui.resultOverlay.classList.remove("visible");
  ui.menuOverlay.classList.remove("visible");
  ui.prepOverlay.classList.remove("visible");
  ui.speedBtn.textContent = `${state.speed}x`;
  ui.pauseBtn.textContent = "暂停";
  syncTopButtons();
  renderCards();
  updatePauseCover();
  ui.levelLabel.textContent = state.mode === "endless" ? "∞" : formatLevelShortLabel(level);
  return true;
}

/**
 * 结束局对，展示胜败结果界面并保存进度。
 * @param {boolean} victory - 是否胜利
 * @param {string} reason - 展示在结果界面的简短描述
 */
export function endLevel(victory, reason) {
  if (!state.running) {
    return;
  }

  state.running = false;
  clearPendingSpawns();
  state.result = { victory, reason };
  ui.resultTitle.textContent = victory ? "胜利" : "失败";
  if (state.mode === "endless") {
    ui.resultDesc.textContent = `${reason}，你抵挡到了第 ${state.endless.wave} 波`;
  } else {
    ui.resultDesc.textContent = `${formatLevelFullLabel(state.levelIndex)}，${reason}，击杀 ${state.stats.kills}，用时 ${Math.floor(state.stats.spentSeconds)} 秒`;
  }
  renderResultStats();
  ui.nextBtn.style.display =
    state.mode === "level" && victory && state.levelIndex + 1 < LEVELS.length ? "inline-block" : "none";
  ui.resultOverlay.classList.add("visible");
  if (state.mode === "level" && victory) {
    state.unlockedLevel = Math.max(state.unlockedLevel, state.levelIndex + 2);
  }
  saveProgress({ clearActiveRun: true });
  sound.beep(victory ? 720 : 120, victory ? 0.2 : 0.3, "triangle", 0.08);
  updateContinueButton();
}

/** 保存局对（若局对进行中）并返回主菜单。 */
export function returnToMenu() {
  state.levelCarryOver = null;
  if (state.running) {
    saveProgress({ includeCurrentRun: true });
  }
  state.running = false;
  state.paused = false;
  clearPendingSpawns();
  ui.resultOverlay.classList.remove("visible");
  ui.prepOverlay.classList.remove("visible");
  ui.menuOverlay.classList.add("visible");
  updatePauseCover();
  draw();
}

/** 根据当前存档状态更新菜单上“继续”按鈕的文字和禁用状态。 */
export function updateContinueButton() {
  ui.continueBtn.disabled = !state.hasSavedGame;
  renderChapterProgress();
  if (!state.hasSavedGame) {
    ui.continueBtn.textContent = "暂无存档";
    return;
  }
  if (state.savedRun) {
    ui.continueBtn.textContent =
      state.savedRun.mode === "endless" ? "继续无尽对局" : `继续${formatLevelFullLabel(state.savedRun.levelIndex)}对局`;
    return;
  }
  ui.continueBtn.textContent = `继续${formatLevelFullLabel(getContinueLevelNumber() - 1)}`;
}