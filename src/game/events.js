import { LEVELS } from "../config/levels.js";
import { state } from "../core/state.js";
import { saveProgress } from "../core/storage.js";
import { clearHoverCell, onCanvasClick, onCanvasMove } from "./board.js";
import { prepareLevel, prepareNextLevel, resumeSavedRun, returnToMenu, startLevel, updateContinueButton } from "./flow.js";
import { ui } from "../ui/dom.js";
import { closeSettings, openSettings, syncTopButtons, updateCardsVisual, updatePauseCover } from "../ui/panels.js";
import { setPerformanceMode, setRenderQuality, toggleCameraMode } from "../render/draw.js";

/**
 * 事件绑定模块。
 * 将所有 UI 按鈕、键盘快捷键、页面退出前存档等事件统一注册。
 * 不包含任何逻辑，仅负责将用户操作转发到对应的处理函数。
 */

/**
 * 初始化并绑定所有游戏交互事件监听器。
 * 在游戏启动时调用一次。
 */
export function bindEvents() {
  ui.canvas.addEventListener("click", onCanvasClick);
  ui.canvas.addEventListener("mousemove", onCanvasMove);
  ui.canvas.addEventListener("mouseleave", clearHoverCell);

  ui.pauseBtn.addEventListener("click", () => {
    if (!state.running) {
      return;
    }
    state.paused = !state.paused;
    ui.pauseBtn.textContent = state.paused ? "继续" : "暂停";
    updateCardsVisual();
    updatePauseCover();
  });

  ui.speedBtn.addEventListener("click", () => {
    if (!state.running) {
      return;
    }
    state.speed = state.speed === 1 ? 2 : 1;
    ui.speedBtn.textContent = `${state.speed}x`;
  });

  ui.cameraBtn.addEventListener("click", () => {
    const mode = toggleCameraMode();
    ui.cameraBtn.textContent = `镜头: ${mode === "close" ? "近景" : "标准"}`;
  });

  ui.shovelBtn.addEventListener("click", () => {
    if (!state.running || state.paused) {
      return;
    }
    state.shovelMode = !state.shovelMode;
    if (state.shovelMode) {
      state.selectedPlant = null;
    }
    syncTopButtons();
    updateCardsVisual();
  });

  ui.settingsBtn.addEventListener("click", openSettings);
  ui.menuSettingsBtn.addEventListener("click", openSettings);

  ui.newGameBtn.addEventListener("click", () => {
    prepareLevel(0, "level");
  });

  ui.endlessGameBtn.addEventListener("click", () => {
    prepareLevel(LEVELS.length - 1, "endless");
  });

  ui.continueBtn.addEventListener("click", () => {
    if (!state.hasSavedGame) {
      return;
    }
    if (state.savedRun) {
      resumeSavedRun();
      updateContinueButton();
      return;
    }
    const levelIdx = Math.min(state.levelIndex, LEVELS.length - 1);
    prepareLevel(levelIdx, "level");
  });

  ui.prepStartBtn.addEventListener("click", () => {
    startLevel(state.levelIndex, state.mode);
  });

  ui.prepCancelBtn.addEventListener("click", () => {
    state.levelCarryOver = null;
    ui.prepOverlay.classList.remove("visible");
    ui.menuOverlay.classList.add("visible");
  });

  ui.retryBtn.addEventListener("click", () => {
    state.levelCarryOver = null;
    prepareLevel(state.levelIndex, state.mode);
  });

  ui.nextBtn.addEventListener("click", () => {
    prepareNextLevel();
  });

  ui.backMenuBtn.addEventListener("click", () => {
    returnToMenu();
  });

  ui.saveSettingsBtn.addEventListener("click", () => {
    state.settings.volume = Number(ui.volumeInput.value);
    state.settings.defaultSpeed = Number(ui.defaultSpeedSelect.value);
    state.settings.pauseBehavior = ui.pauseBehaviorSelect.value === "none" ? "none" : "overlay";
    state.settings.graphicsQuality = ui.graphicsQualitySelect.value;
    state.settings.performanceMode = ui.performanceModeInput.checked;
    state.settings.audioEnabled = ui.audioEnabledInput.checked;
    setRenderQuality(state.settings.graphicsQuality);
    setPerformanceMode(state.settings.performanceMode);
    saveProgress();
    updateContinueButton();
    updatePauseCover();
    closeSettings();
  });

  ui.cancelSettingsBtn.addEventListener("click", closeSettings);

  ui.settingsOverlay.addEventListener("click", (event) => {
    if (event.target === ui.settingsOverlay) {
      closeSettings();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "c") {
      const mode = toggleCameraMode();
      ui.cameraBtn.textContent = `镜头: ${mode === "close" ? "近景" : "标准"}`;
    }
  });

  window.addEventListener("beforeunload", () => {
    saveProgress({ includeCurrentRun: state.running });
  });
}