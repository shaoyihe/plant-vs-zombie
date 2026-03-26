import { formatLevelShortLabel, LEVELS } from "./config/levels.js";
import { PLANTS } from "./config/plants.js";
import { createCellStateGrid, createGrid, state } from "./core/state.js";
import { loadSave, saveProgress } from "./core/storage.js";
import { bindEvents } from "./game/events.js";
import { updateContinueButton } from "./game/flow.js";
import {
  updateCooldowns,
  updateEffects,
  updateNaturalSun,
  updatePlants,
  updateProjectiles,
  updateLawnMowers,
  updateSuns,
  updateWaves,
  updateZombies,
} from "./game/update.js";
import { draw, getRenderStats, setPerformanceMode, setRenderQuality } from "./render/draw.js";
import { ui } from "./ui/dom.js";
import { renderCards, renderChapterProgress, syncTopButtons, updateUI } from "./ui/panels.js";

/**
 * 应用入口模块。
 * 负责初始化游戏并启动主循环。
 *
 * 主循环逻辑：
 *   1. 计算 dt（距上帧间隔）并限制最大到 50ms，防止切屏后大跳帧
 *   2. 游戏运行且未暂停时逐帧推进全部棋盘逻辑
 *   3. 每两秒自动保存一次棋盘快照
 *   4. 每帧更新 HUD 并触发渲染
 *   5. 每 0.2 秒刷新 FPS/画质统计显示
 */

/** 记录上一帧的时间戳（用于计算 dt）。 */
let previousTs = 0;
/** 统计刷新计时器。 */
let statRefreshTimer = 0;
/** 自动保存计时器。 */
let autoSaveTimer = 0;

/**
 * requestAnimationFrame 主循环。
 * @param {DOMHighResTimeStamp} ts - 浏览器提供的当前时间戳（毫秒）
 */
function loop(ts) {
  const rawDt = (ts - previousTs) / 1000;
  previousTs = ts;
  // 限制单帧时间最大 50ms，防止切屏恢复时大跳帧
  const dt = Math.min(0.05, rawDt || 0.016);

  if (state.running && !state.paused) {
    const step = dt * state.speed;
    state.levelTime += step;
    state.stats.spentSeconds += step;

    updateNaturalSun(step);
    updateCooldowns(step);
    updatePlants(step);
    updateProjectiles(step);
    updateZombies(step);
    updateLawnMowers(step);
    updateSuns(step);
    updateEffects(step);
    updateWaves();
  }

  if (state.running) {
    autoSaveTimer += dt;
    if (autoSaveTimer >= 2) {
      // 游戏运行时每 2 秒自动保存筛盘快照
      autoSaveTimer = 0;
      saveProgress({ includeCurrentRun: true });
    }
  } else {
    autoSaveTimer = 0;
  }

  updateUI(dt);
  draw();

  statRefreshTimer += dt;
  if (statRefreshTimer >= 0.2) {
    statRefreshTimer = 0;
    const stats = getRenderStats();
    ui.renderStat.textContent = `FPS ${stats.fps} | 3D ${stats.quality}${stats.performanceMode ? " | 性能优先" : ""}`;
  }

  requestAnimationFrame(loop);
}

/**
 * 游戏启动函数：加载存档、初始化渲染和事件系统，然后启动主循环。
 */
function boot() {
  loadSave();
  setRenderQuality(state.settings.graphicsQuality);
  setPerformanceMode(state.settings.performanceMode);
  bindEvents();
  state.plants = createGrid();
  state.cellStates = createCellStateGrid();
  Object.keys(PLANTS).forEach((id) => {
    state.cardCooldowns[id] = 0;
  });
  updateContinueButton();
  renderChapterProgress();
  const level = LEVELS[Math.min(state.levelIndex, LEVELS.length - 1)] || LEVELS[0];
  ui.levelLabel.textContent = formatLevelShortLabel(level);
  syncTopButtons();
  renderCards();
  draw();
  requestAnimationFrame((ts) => {
    previousTs = ts;
    requestAnimationFrame(loop);
  });
}

boot();
