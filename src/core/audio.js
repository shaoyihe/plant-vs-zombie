import { state } from "./state.js";

/**
 * 轻量级音效工具，基于 Web Audio API 的振荡器实现简单音效。
 * AudioContext 延迟初始化，首次调用 beep 时才创建。
 */
export const sound = {
  ctx: null,

  /**
   * 确保 AudioContext 已初始化（延迟创建以避免浏览器自动播放限制）。
   * @returns {boolean} 是否初始化成功
   */
  ensure() {
    if (!this.ctx) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        return false;
      }
      this.ctx = new AudioContextCtor();
    }
    return true;
  },

  /**
   * 播放一个短暂音效。
   * @param {number} freq - 频率 (Hz)
   * @param {number} duration - 持续时长 (秒)
   * @param {OscillatorType} type - 波形类型，默认 "sine"
   * @param {number} gain - 基础音量（会乘以用户音量设置）
   */
  beep(freq, duration, type = "sine", gain = 0.05) {
    if (!state.settings.audioEnabled || state.settings.volume <= 0) {
      return;
    }
    if (!this.ensure()) {
      return;
    }
    const oscillator = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    gainNode.gain.value = gain * state.settings.volume;
    oscillator.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    oscillator.start();
    oscillator.stop(this.ctx.currentTime + duration);
  },
};