import { BOARD_X, BOARD_Y, CELL_H, CELL_W, COLS, ROWS } from "../config/constants.js";
import { sound } from "../core/audio.js";
import { state } from "../core/state.js";
import { findSunHit, isRenderInteractionReady, screenToBoardPixel } from "../render/draw.js";
import { ui } from "../ui/dom.js";
import { showToast } from "../ui/panels.js";
import { placePlant, removePlant } from "./entities.js";

function eventToCanvasPixel(event) {
  const rect = ui.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left - ui.canvas.clientLeft;
  const y = event.clientY - rect.top - ui.canvas.clientTop;
  return { x, y };
}

export function gridFromPixel(x, y) {
  const col = Math.floor((x - BOARD_X) / CELL_W);
  const row = Math.floor((y - BOARD_Y) / CELL_H);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    return null;
  }
  return { row, col };
}

export function collectSunAt(x, y) {
  const sun = isRenderInteractionReady()
    ? findSunHit(x, y)
    : state.suns.find((item) => Math.hypot(item.x - x, item.y - y) <= 20);
  if (!sun) {
    return false;
  }
  sun.alive = false;
  state.sun += sun.value;
  state.stats.sunsCollected += sun.value;
  sound.beep(920, 0.06, "sine", 0.05);
  return true;
}

export function updateHoverFromScreen(x, y) {
  if (!state.running || state.paused || !isRenderInteractionReady()) {
    state.hoverCell = null;
    return;
  }

  const boardPoint = screenToBoardPixel(x, y);
  if (!boardPoint) {
    state.hoverCell = null;
    return;
  }

  const grid = gridFromPixel(boardPoint.x, boardPoint.y);
  if (!grid) {
    state.hoverCell = null;
    return;
  }

  state.hoverCell = {
    row: grid.row,
    col: grid.col,
    x: boardPoint.x,
    y: boardPoint.y,
    hasPlant: Boolean(state.plants[grid.row][grid.col]),
    blockedType: state.cellStates[grid.row]?.[grid.col]?.type || null,
  };
}

export function clearHoverCell() {
  state.hoverCell = null;
}

export function onCanvasMove(event) {
  const { x, y } = eventToCanvasPixel(event);
  updateHoverFromScreen(x, y);
}

export function onCanvasClick(event) {
  if (!state.running || state.paused) {
    return;
  }

  const { x, y } = eventToCanvasPixel(event);

  if (collectSunAt(x, y)) {
    return;
  }

  const boardPoint = screenToBoardPixel(x, y);
  if (!boardPoint) {
    return;
  }

  const grid = gridFromPixel(boardPoint.x, boardPoint.y);
  if (!grid) {
    return;
  }

  if (state.shovelMode) {
    if (!removePlant(grid.row, grid.col)) {
      showToast("该地块无植物");
    }
    return;
  }

  if (!state.selectedPlant) {
    showToast("先选择植物卡");
    return;
  }

  placePlant(grid.row, grid.col, state.selectedPlant);
}