import { BOARD_X, BOARD_Y, CELL_H, CELL_W, COLS, ROWS } from "../config/constants.js";
import { sound } from "../core/audio.js";
import { state } from "../core/state.js";
import { findSunHit, isRenderInteractionReady, screenToBoardPixel } from "../render/draw.js";
import { ui } from "../ui/dom.js";
import { showToast } from "../ui/panels.js";
import { placePlant, removePlant } from "./entities.js";

/**
 * 棋盘交互模块：处理点击与鼠标移动事件。
 * 将屏幕坐标转换为棋盘格子坐标，并触发种植、铲除、收集阳光等操作。
 */

/** 将鼠标/触摸事件转换为相对 canvas 元素的坐标。 */
function eventToCanvasPixel(event) {
  const rect = ui.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left - ui.canvas.clientLeft;
  const y = event.clientY - rect.top - ui.canvas.clientTop;
  return { x, y };
}

/**
 * 将棋盘像素坐标转换为格子坐标 {row, col}。
 * 如果坐标超出棋盘范围则返回 null。
 * @param {number} x - 棋盘内像素坐标
 * @param {number} y - 棋盘内像素坐标
 * @returns {{row: number, col: number}|null}
 */
export function gridFromPixel(x, y) {
  const col = Math.floor((x - BOARD_X) / CELL_W);
  const row = Math.floor((y - BOARD_Y) / CELL_H);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    return null;
  }
  return { row, col };
}

/**
 * 尝试在屏幕坐标处收集一个阳光。
 * 若 3D 渲染就绪则使用投影圈检测，否则降级为简单距离检测。
 * @returns {boolean} 是否成功收集
 */
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

/**
 * 根据屏幕坐标更新 state.hoverCell，供渲染层绘制悬浮预览。
 * 游戏未运行、冲突或 3D 未就绪时清除 hoverCell。
 */
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

/** 游标离开 canvas 时清除悬浮单元格。 */
export function clearHoverCell() {
  state.hoverCell = null;
}

/** 处理 canvas mousemove 事件，更新悬浮单元格。 */
export function onCanvasMove(event) {
  const { x, y } = eventToCanvasPixel(event);
  updateHoverFromScreen(x, y);
}

/**
 * 处理 canvas 点击事件：
 * 1. 尝试收集点击位置的阳光
 * 2. 若处于铲除模式，尝试移除棋盘上的植物
 * 3. 若已选择植物卡，在对应格子种植
 */
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