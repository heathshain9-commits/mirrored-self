export type AudioMode = 'distorted' | 'delayed' | 'shattered' | 'multiplicity' | 'none';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  
  private currentMode: AudioMode = 'none';

  public async init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Master Out
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;
      this.masterGain.connect(this.ctx.destination);
      
      // Filter (Lowpass)
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 200;
      this.filter.Q.value = 2;
      
      // Delay (For certain mode effects)
      this.delayNode = this.ctx.createDelay();
      this.delayNode.delayTime.value = 0.5;
      
      this.feedbackGain = this.ctx.createGain();
      this.feedbackGain.gain.value = 0.4;
      
      this.filter.connect(this.delayNode);
      this.delayNode.connect(this.feedbackGain);
      this.feedbackGain.connect(this.delayNode);
      this.delayNode.connect(this.masterGain);
      this.filter.connect(this.masterGain);

      // Main Oscillator (Drone)
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'sine';
      this.osc.frequency.value = 65.41; // C2 drone
      this.osc.connect(this.filter);
      
      // LFO to modulate filter
      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'sine';
      this.lfo.frequency.value = 0.1;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 100;
      this.lfo.connect(lfoGain);
      lfoGain.connect(this.filter.frequency);
      
      this.osc.start();
      this.lfo.start();
      
      // Fade in
      this.masterGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 2);
    } catch (e) {
      console.warn("AudioContext init failed", e);
    }
  }

  public setMode(mode: AudioMode) {
    this.currentMode = mode;
    if (!this.ctx || !this.osc || !this.filter || !this.delayNode || !this.feedbackGain || !this.masterGain) return;
    
    const t = this.ctx.currentTime;
    
    // Reset/Transition values smoothly
    switch (mode) {
      case 'distorted':
        this.osc.type = 'triangle';
        this.osc.frequency.setTargetAtTime(55.00, t, 1); // A1
        this.filter.frequency.setTargetAtTime(300, t, 1);
        this.filter.Q.setTargetAtTime(10, t, 1);
        this.delayNode.delayTime.setTargetAtTime(0.05, t, 1);
        this.feedbackGain.gain.setTargetAtTime(0.8, t, 1);
        break;
      case 'delayed':
        this.osc.type = 'sine';
        this.osc.frequency.setTargetAtTime(73.42, t, 1); // D2
        this.filter.frequency.setTargetAtTime(150, t, 1);
        this.filter.Q.setTargetAtTime(2, t, 1);
        this.delayNode.delayTime.setTargetAtTime(0.8, t, 1);
        this.feedbackGain.gain.setTargetAtTime(0.6, t, 1);
        break;
      case 'shattered':
        this.osc.type = 'sawtooth';
        this.osc.frequency.setTargetAtTime(43.65, t, 1); // F1
        this.filter.frequency.setTargetAtTime(800, t, 1);
        this.filter.Q.setTargetAtTime(1, t, 1);
        this.delayNode.delayTime.setTargetAtTime(0.1, t, 1);
        this.feedbackGain.gain.setTargetAtTime(0.2, t, 1);
        break;
      case 'multiplicity':
        this.osc.type = 'square';
        this.osc.frequency.setTargetAtTime(55.00, t, 1); // A1
        this.filter.frequency.setTargetAtTime(400, t, 1);
        this.filter.Q.setTargetAtTime(5, t, 1);
        this.delayNode.delayTime.setTargetAtTime(0.3, t, 1);
        this.feedbackGain.gain.setTargetAtTime(0.4, t, 1);
        break;
      default:
        this.masterGain.gain.setTargetAtTime(0, t, 0.5);
    }
  }

  public modulateWithMouse(normalizedX: number, normalizedY: number) {
    if (!this.ctx || !this.filter) return;
    // Map X to slight frequency variations, Y to filter cutoff
    const t = this.ctx.currentTime;
    
    let baseFreq = 200;
    if (this.currentMode === 'distorted') baseFreq = 300;
    if (this.currentMode === 'delayed') baseFreq = 150;
    if (this.currentMode === 'shattered') baseFreq = 800;
    
    const modFreq = baseFreq + normalizedY * 400;
    this.filter.frequency.setTargetAtTime(modFreq, t, 0.1);
  }
}

export const engine = new AudioEngine();
