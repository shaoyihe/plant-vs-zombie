import { state } from "./state.js";

export const sound = {
  ctx: null,
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