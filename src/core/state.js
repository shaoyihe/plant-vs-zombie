import { COLS, HOUSE_LINE_X, ROWS } from "../config/constants.js";
import { LEVELS } from "../config/levels.js";
import { PLANTS } from "../config/plants.js";

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

export function createCellStateGrid() {
  return createGrid();
}

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

export function clearPendingSpawns() {
  state.pendingSpawnTimers.forEach((timerId) => window.clearTimeout(timerId));
  state.pendingSpawnTimers = [];
}

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

export function currentLevel() {
  return LEVELS[state.levelIndex];
}

export function createDefaultLoadout(level) {
  return level.unlockPlants.slice(0, Math.min(5, level.unlockPlants.length));
}

export function ensureValidLoadout(level, proposedLoadout = state.selectedLoadout) {
  const allowed = new Set(level.unlockPlants);
  const filtered = (proposedLoadout || []).filter((id) => allowed.has(id));
  if (filtered.length > 0) {
    return filtered.slice(0, 5);
  }
  return createDefaultLoadout(level);
}

export function cardList() {
  return state.selectedLoadout.map((id) => PLANTS[id]).filter(Boolean);
}

export function getContinueLevelNumber() {
  return Math.min(state.unlockedLevel, LEVELS.length);
}