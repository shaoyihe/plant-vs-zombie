import { PLANTS } from "../config/plants.js";
import { sound } from "../core/audio.js";
import { cardList, currentLevel, state } from "../core/state.js";
import { ui } from "./dom.js";

/**
 * UI 面板模块：负责所有 HUD 层的渲染和更新。
 * 包括植物卡面板、设置面板、Toast 提示及按鈕状态同步。
 */

/**
 * 生成种包卡片的 HTML 字符串。footerLeft/footerRight 分别为底部左右文字。
 * @param {boolean} includeCooldown - 是否包含冷却覆盖层（游戏内卡片需要，选卡界面不需要）
 */
function renderSeedPacket(plant, footerLeft, footerRight, includeCooldown = false) {
  return `
    <div class="seed-packet-top">
      <span class="seed-packet-cost">${plant.cost}</span>
      <span class="seed-packet-badge">${plant.name.slice(0, 1)}</span>
    </div>
    <div class="seed-packet-art ${plant.id}">
      <div class="seed-face">
        <span class="seed-eye left"></span>
        <span class="seed-eye right"></span>
      </div>
      <div class="seed-extra"></div>
    </div>
    <div class="card-title">${plant.name}</div>
    <div class="card-meta"><span>${footerLeft}</span><span>${footerRight}</span></div>
    ${includeCooldown ? '<div class="cooldown"></div><div class="cooldown-label"></div>' : ""}
  `;
}

/**
 * 渲染选卡界面的所有可用植物卡，并设置已选/禁用状态。
 * 每次选卡发生变化后重新调用以刷新 UI。
 */
export function renderPrepCards() {
  const level = currentLevel();
  if (state.mode === "endless") {
    ui.prepTitle.textContent = "无尽模式选卡";
    ui.prepDesc.textContent = `${level.name}规则，僵尸会不断增强，尽可能撑更多波次。`;
  } else {
    ui.prepTitle.textContent = `第 ${level.id} 关选卡`;
    ui.prepDesc.textContent = `${level.name}，从当前可用植物中选择最多 5 张卡牌进入战斗。`;
  }
  ui.prepCards.innerHTML = "";

  level.unlockPlants.forEach((id) => {
    const plant = PLANTS[id];
    const selected = state.selectedLoadout.includes(id);
    const limitReached = state.selectedLoadout.length >= 5 && !selected;
    const card = document.createElement("button");
    card.className = `prep-card${selected ? " active" : ""}${limitReached ? " disabled" : ""}`;
    card.disabled = limitReached;
    card.innerHTML = renderSeedPacket(plant, `冷却 ${plant.cooldown}s`, selected ? "已选" : "点击选择");
    card.addEventListener("click", () => {
      toggleLoadoutPlant(id);
    });
    ui.prepCards.appendChild(card);
  });

  ui.prepCount.textContent = `已选择 ${state.selectedLoadout.length} / 5`;
  ui.prepStartBtn.disabled = state.selectedLoadout.length === 0;
}

/**
 * 切换选卡界面中一张植物的选择状态。
 * @param {string} id - 植物 id
 */
export function toggleLoadoutPlant(id) {
  if (state.selectedLoadout.includes(id)) {
    state.selectedLoadout = state.selectedLoadout.filter((plantId) => plantId !== id);
  } else if (state.selectedLoadout.length < 5) {
    state.selectedLoadout = [...state.selectedLoadout, id];
  }
  renderPrepCards();
}

/** 渲染游戏内卡片面板，并绑定卡片选择事件。 */
export function renderCards() {
  const cards = cardList();
  ui.cardsPanel.innerHTML = "";
  cards.forEach((plant) => {
    const card = document.createElement("button");
    card.className = "card";
    card.dataset.plantId = plant.id;
    card.innerHTML = renderSeedPacket(plant, "种植卡", `${plant.cooldown}s`, true);
    card.addEventListener("click", () => {
      if (!state.running || state.paused) {
        return;
      }
      const remaining = state.cardCooldowns[plant.id];
      if (remaining > 0 || state.sun < plant.cost) {
        return;
      }
      state.selectedPlant = state.selectedPlant === plant.id ? null : plant.id;
      state.shovelMode = false;
      syncTopButtons();
      sound.beep(520, 0.05, "triangle", 0.04);
      updateCardsVisual();
    });
    ui.cardsPanel.appendChild(card);
  });
  updateCardsVisual();
}

/** 根据当前冷却、阳光和游戏状态更新每张卡片的视觉状态（已选、冷却中、阳光不足等）。 */
export function updateCardsVisual() {
  const cards = ui.cardsPanel.querySelectorAll(".card");
  cards.forEach((cardNode) => {
    const id = cardNode.dataset.plantId;
    const def = PLANTS[id];
    const remaining = state.cardCooldowns[id] || 0;
    const isCooling = remaining > 0;
    const isInsufficient = state.sun < def.cost;
    const isInactive = state.paused || !state.running;
    cardNode.classList.toggle("selected", state.selectedPlant === id && !state.shovelMode);
    cardNode.classList.toggle("cooling", isCooling);
    cardNode.classList.toggle("insufficient", !isCooling && isInsufficient);
    cardNode.classList.toggle("disabled", isCooling || isInactive);
    cardNode.setAttribute("aria-pressed", state.selectedPlant === id && !state.shovelMode ? "true" : "false");
    const cooldownRatio = Math.max(0, Math.min(1, remaining / def.cooldown));
    cardNode.querySelector(".cooldown").style.height = `${cooldownRatio * 100}%`;
    const cooldownLabel = cardNode.querySelector(".cooldown-label");
    cooldownLabel.textContent = isCooling ? `${Math.ceil(remaining)}s` : "";
  });
}

/** 刷新锄子按鈕的文字，展示当前是否开启锄子模式。 */
export function syncTopButtons() {
  ui.shovelBtn.textContent = `铲子: ${state.shovelMode ? "开" : "关"}`;
}

/**
 * 显示一个短暂的 Toast 提示（1.4 秒后自动隐藏）。
 * @param {string} text - 提示内容
 */
export function showToast(text) {
  ui.toast.textContent = text;
  state.timers.toast = 1.4;
  ui.toast.classList.add("show");
}

/** 根据游戏是否当前暂停游戏且设置要求覆盖来显隐暂停遮罩。 */
export function updatePauseCover() {
  const shouldShow = state.running && state.paused && state.settings.pauseBehavior === "overlay";
  ui.pauseCover.classList.toggle("visible", shouldShow);
}

/**
 * 每帧调用一次，更新阳光计数器、Toast 计时器和卡片状态。
 * @param {number} dt
 */
export function updateUI(dt) {
  ui.sunCount.textContent = String(Math.floor(state.sun));
  if (state.timers.toast > 0) {
    state.timers.toast -= dt;
    if (state.timers.toast <= 0) {
      ui.toast.classList.remove("show");
    }
  }
  if (state.timers.torchHint > 0) {
    state.timers.torchHint = Math.max(0, state.timers.torchHint - dt);
  }
  updateCardsVisual();
  updatePauseCover();
}

/** 打开设置面板并将当前设置写入表单控件。 */
export function openSettings() {
  ui.volumeInput.value = String(state.settings.volume);
  ui.defaultSpeedSelect.value = String(state.settings.defaultSpeed);
  ui.pauseBehaviorSelect.value = state.settings.pauseBehavior;
  ui.graphicsQualitySelect.value = state.settings.graphicsQuality;
  ui.audioEnabledInput.checked = state.settings.audioEnabled;
  ui.performanceModeInput.checked = state.settings.performanceMode;
  ui.settingsOverlay.classList.add("visible");
}

/** 关闭设置面板。 */
export function closeSettings() {
  ui.settingsOverlay.classList.remove("visible");
}