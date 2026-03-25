import { LEVELS } from "./config/levels.js";
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
import { renderCards, syncTopButtons, updateUI } from "./ui/panels.js";

let previousTs = 0;
let statRefreshTimer = 0;
let autoSaveTimer = 0;

function loop(ts) {
  const rawDt = (ts - previousTs) / 1000;
  previousTs = ts;
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
  const level = LEVELS[Math.min(state.levelIndex, LEVELS.length - 1)] || LEVELS[0];
  ui.levelLabel.textContent = String(level.id);
  syncTopButtons();
  renderCards();
  draw();
  requestAnimationFrame((ts) => {
    previousTs = ts;
    requestAnimationFrame(loop);
  });
}

boot();
