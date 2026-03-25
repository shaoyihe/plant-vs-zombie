// 游戏棋盘布局常量
// 棋盘为 5 行 × 9 列的格子，左上角起始坐标为 (BOARD_X, BOARD_Y)

/** 棋盘行数 */
export const ROWS = 5;
/** 棋盘列数 */
export const COLS = 9;
/** 单个格子的像素宽度 */
export const CELL_W = 96;
/** 单个格子的像素高度 */
export const CELL_H = 96;
/** 棋盘左边界的像素横坐标 */
export const BOARD_X = 80;
/** 棋盘上边界的像素纵坐标 */
export const BOARD_Y = 84;
/** 棋盘总宽度（像素） */
export const BOARD_W = COLS * CELL_W;
/** 棋盘总高度（像素） */
export const BOARD_H = ROWS * CELL_H;
/** 房屋防线的横坐标，僵尸越过此线触发割草机 */
export const HOUSE_LINE_X = BOARD_X - 16;
/** localStorage 存档键名 */
export const SAVE_KEY = "pvz-web-save-v1";