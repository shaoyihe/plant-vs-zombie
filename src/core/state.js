import { COLS, HOUSE_LINE_X, ROWS } from "../config/constants.js";
import { LEVELS } from "../config/levels.js";
import { PLANTS } from "../config/plants.js";

/**
 * 全局游戏内层状态对象。
 * 该对象是一个单例，由所有游戏模块共享读写。
 * 处于运行期间频繁变化的字段应通过 update.js 中的函数更改；
 * 关卡流程相关字段应通过 flow.js 中的函数更改。
 */
export const state = {
  running: false,
  paused: false,
  mode: "level",
  speed: 1,
  selectedPlant: null,
  selectedLoadout: [],
  shovelMode: false,
  hoverCell: null,
  levelIndex: 0,
  levelTime: 0,
  levelWaveIndex: 0,
  sun: 150,
  unlockedLevel: 1,
  hasSavedGame: false,
  savedRun: null,
  levelCarryOver: null,
  settings: {
    volume: 0.5,
    defaultSpeed: 1,
    audioEnabled: true,
    pauseBehavior: "overlay",
    graphicsQuality: "auto",
    performanceMode: false,
  },
  plants: [],
  cellStates: [],
  lawnMowers: [],
  zombies: [],
  projectiles: [],
  suns: [],
  effects: [],
  cardCooldowns: {},
  timers: {
    naturalSun: 0,
    toast: 0,
    torchHint: 0,
  },
  pendingSpawnTimers: [],
  result: null,
  endless: {
    wave: 0,
    nextWaveAt: 4,
  },
  pools: {
    projectiles: [],
  },
  stats: {
    kills: 0,
    spentSeconds: 0,
    sunsCollected: 0,
    sunsSpent: 0,
    plantsPlaced: 0,
    plantsRemoved: 0,
    projectilesFired: 0,
  },
};

/**
 * 创建一个 ROWS × COLS 的二维数组，初始化为全 null，用于存储植物实例。
 * @returns {Array<Array<null>>}
 */
export function createGrid() {
  const result = [];
  for (let row = 0; row < ROWS; row += 1) {
    const cols = [];
    for (let col = 0; col < COLS; col += 1) {
      cols.push(null);
    }
    result.push(cols);
  }
  return result;
}

/**
 * 创建单元格状态网格（如大坑标记），结构与植物网格相同。
 * @returns {Array<Array<null>>}
 */
export function createCellStateGrid() {
  return createGrid();
}

/**
 * 为每行创建割草机实例，初始敎置在房屋防线左侧。
 * @returns {Array<Object>}
 */
export function createLawnMowers() {
  const result = [];
  for (let row = 0; row < ROWS; row += 1) {
    result.push({
      id: `mower-${row}`,
      row,
      x: HOUSE_LINE_X - 44,
      active: false,
      spent: false,
      speed: 620,
    });
  }
  return result;
}

/** 取消所有尚未执行的僵尸延迟出生定时器。切居或重置时调用。 */
export function clearPendingSpawns() {
  state.pendingSpawnTimers.forEach((timerId) => window.clearTimeout(timerId));
  state.pendingSpawnTimers = [];
}

/**
 * 重置所有运行时棋盘数据，包括植物、僵尸、子弹、阳光等。
 * 启动新局对水、继续局对水、从存档恢复时均会调用。
 */
export function resetBoardData() {
  clearPendingSpawns();
  state.plants = createGrid();
  state.cellStates = createCellStateGrid();
  state.lawnMowers = createLawnMowers();
  state.zombies = [];
  state.projectiles = [];
  state.suns = [];
  state.effects = [];
  state.cardCooldowns = {};
  Object.keys(PLANTS).forEach((id) => {
    state.cardCooldowns[id] = 0;
  });
  state.levelTime = 0;
  state.levelWaveIndex = 0;
  state.endless.wave = 0;
  state.endless.nextWaveAt = 4;
  state.selectedPlant = null;
  state.shovelMode = false;
  state.hoverCell = null;
  state.stats.kills = 0;
  state.stats.spentSeconds = 0;
  state.stats.sunsCollected = 0;
  state.stats.sunsSpent = 0;
  state.stats.plantsPlaced = 0;
  state.stats.plantsRemoved = 0;
  state.stats.projectilesFired = 0;
  state.timers.naturalSun = 0;
  state.timers.torchHint = 0;
}

/** 返回当前局卡配置对象。 */
export function currentLevel() {
  return LEVELS[state.levelIndex];
}

/**
 * 生成关卡的默认选卡方案（取前 5 张可用植物）。
 * @param {Object} level - 关卡配置
 */
export function createDefaultLoadout(level) {
  return level.unlockPlants.slice(0, Math.min(5, level.unlockPlants.length));
}

/**
 * 核实选卡方案，过滤掉不属于当前局的植物，并限制最多 5 张。
 * @param {Object} level - 关卡配置
 * @param {string[]} proposedLoadout - 建议的植物 id 列表
 * @returns {string[]}
 */
export function ensureValidLoadout(level, proposedLoadout = state.selectedLoadout) {
  const allowed = new Set(level.unlockPlants);
  const filtered = (proposedLoadout || []).filter((id) => allowed.has(id));
  if (filtered.length > 0) {
    return filtered.slice(0, 5);
  }
  return createDefaultLoadout(level);
}

/** 返回当前已选卡的植物配置对象数组。 */
export function cardList() {
  return state.selectedLoadout.map((id) => PLANTS[id]).filter(Boolean);
}

/** 返回当前层局对应的局卡编号（不超过总局数）。 */
export function getContinueLevelNumber() {
  return Math.min(state.unlockedLevel, LEVELS.length);
}