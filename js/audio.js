'use strict';
/* FableCraft — fully procedural audio: synthesized sound effects + generative music.
   Everything is generated with the Web Audio API, so all audio is original and copyright-free. */

const AudioSys = {
  ctx: null,
  master: null, musicGain: null, sfxGain: null,
  noiseBuf: null,
  track: null, nextStep: 0, stepIndex: 0, trackTime: 0,
  volumes: { master: 0.8, music: 0.55, sfx: 0.9 },
  lastStepSfx: 0,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.applyVolumes();
    // Shared white-noise buffer for percussive sounds
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Ambient wind starts immediately; rain ramps with the weather
    this.setRainLevel(this.pendingRain !== undefined ? this.pendingRain : 0);
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  setVolumes(m, mu, s) {
    this.volumes = { master: m, music: mu, sfx: s };
    this.applyVolumes();
  },
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.musicGain.gain.value = this.volumes.music;
    this.sfxGain.gain.value = this.volumes.sfx;
  },

  /* ---------- low-level synth helpers ---------- */
  tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, attack = 0.005, delay = 0, dest = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(dest || this.sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },

  noise(dur, { vol = 0.2, freq = 1200, q = 1, slide = 0, delay = 0, type = 'bandpass', dest = null } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },

  CAPTIONS: {
    zombie: '[zombie groans]', skeleton: '[bones rattle]', spider: '[spider hisses]',
    roar: '[dragon roars]', explosion: '[explosion]', thunder: '[thunder cracks]',
    levelup: '[level up!]', portal: '[portal hums]', quest: '[quest updated]',
    wave: '[battle horn sounds]', enemydie: '[enemy defeated]', chestopen: '[chest creaks open]',
    fireball: '[fire whooshes]', lightning: '[lightning strikes]', playerdie: '[you died]',
  },

  /* ---------- sound effects ---------- */
  play(name) {
    if (this.CAPTIONS[name]) UI.subtitle(this.CAPTIONS[name]);
    if (!this.ctx) return;
    const r = Math.random;
    switch (name) {
      case 'step':
        if (this.ctx.currentTime - this.lastStepSfx < 0.18) return;
        this.lastStepSfx = this.ctx.currentTime;
        this.noise(0.07, { vol: 0.10, freq: 500 + r() * 300, q: 0.8, type: 'lowpass' });
        break;
      case 'jump': this.tone(250, 0.18, { type: 'sine', vol: 0.15, slide: 220 }); break;
      case 'land': this.noise(0.1, { vol: 0.16, freq: 350, type: 'lowpass' }); break;
      case 'mine': this.noise(0.06, { vol: 0.2, freq: 1700 + r() * 700, q: 2 }); this.tone(170 + r() * 60, 0.05, { type: 'triangle', vol: 0.1 }); break;
      case 'break': this.noise(0.16, { vol: 0.3, freq: 900, slide: -600, q: 1 }); this.tone(130, 0.12, { type: 'triangle', vol: 0.16, slide: -60 }); break;
      case 'place': this.noise(0.07, { vol: 0.2, freq: 700, type: 'lowpass' }); this.tone(320, 0.07, { type: 'triangle', vol: 0.13 }); break;
      case 'swing': this.noise(0.12, { vol: 0.13, freq: 2400, slide: -1700, q: 3 }); break;
      case 'hit': this.tone(220, 0.1, { type: 'square', vol: 0.2, slide: -120 }); this.noise(0.08, { vol: 0.2, freq: 1500, q: 1.5 }); break;
      case 'hurt': this.tone(300, 0.22, { type: 'sawtooth', vol: 0.22, slide: -190 }); break;
      case 'zombie': this.tone(95 + r() * 40, 0.65, { type: 'sawtooth', vol: 0.1, slide: -35 }); break;
      case 'skeleton': for (let i = 0; i < 3; i++) this.noise(0.05, { vol: 0.13, freq: 2300 + r() * 800, q: 6, delay: i * 0.07 }); break;
      case 'spider': this.tone(900 + r() * 300, 0.16, { type: 'sawtooth', vol: 0.07, slide: -450 }); break;
      case 'arrow': this.noise(0.2, { vol: 0.14, freq: 3000, slide: -2300, q: 4 }); break;
      case 'enemydie': this.tone(190, 0.4, { type: 'sawtooth', vol: 0.16, slide: -140 }); this.noise(0.3, { vol: 0.13, freq: 700, slide: -500 }); break;
      case 'coin': this.tone(990, 0.07, { type: 'square', vol: 0.12 }); this.tone(1320, 0.16, { type: 'square', vol: 0.12, delay: 0.07 }); break;
      case 'xp': this.tone(1180 + r() * 250, 0.09, { type: 'sine', vol: 0.09 }); break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.26, { type: 'triangle', vol: 0.18, delay: i * 0.1 }));
        break;
      case 'craft': this.noise(0.09, { vol: 0.16, freq: 1100 }); this.tone(620, 0.14, { type: 'triangle', vol: 0.14, delay: 0.05 }); break;
      case 'click': this.tone(750, 0.04, { type: 'square', vol: 0.08 }); break;
      case 'eat': this.noise(0.12, { vol: 0.15, freq: 600, type: 'lowpass' }); break;
      case 'fireball': this.noise(0.45, { vol: 0.25, freq: 600, slide: 1500, q: 1.2 }); break;
      case 'explosion':
        this.noise(0.75, { vol: 0.5, freq: 320, slide: -260, type: 'lowpass' });
        this.tone(70, 0.5, { type: 'sine', vol: 0.4, slide: -38 });
        break;
      case 'roar':
        this.tone(85, 1.3, { type: 'sawtooth', vol: 0.35, slide: -38 });
        this.tone(123, 1.2, { type: 'sawtooth', vol: 0.25, slide: -55 });
        this.noise(1.1, { vol: 0.22, freq: 420, slide: -280, type: 'lowpass' });
        break;
      case 'portal': this.tone(180, 1.1, { type: 'sine', vol: 0.25, slide: 480 }); this.tone(270, 1.1, { type: 'sine', vol: 0.18, slide: 700 }); break;
      case 'firework': this.noise(0.5, { vol: 0.3, freq: 500, slide: -380, type: 'lowpass' }); for (let i = 0; i < 5; i++) this.tone(700 + r() * 900, 0.2, { type: 'sine', vol: 0.07, delay: 0.05 + r() * 0.2 }); break;
      case 'playerdie': this.tone(400, 1.4, { type: 'sawtooth', vol: 0.25, slide: -330 }); break;
      case 'wave': [392, 494, 587].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.13, delay: i * 0.13 })); break;
      case 'splash': this.noise(0.25, { vol: 0.2, freq: 900, slide: -500 }); break;
      case 'swim': this.noise(0.18, { vol: 0.1, freq: 700 + r() * 300, slide: -300, type: 'lowpass' }); break;
      case 'cast': this.tone(420, 0.25, { type: 'sine', vol: 0.16, slide: 500 }); this.noise(0.2, { vol: 0.1, freq: 2400, slide: 1200, q: 3 }); break;
      case 'icecast': this.tone(880, 0.2, { type: 'triangle', vol: 0.14, slide: 420 }); this.noise(0.15, { vol: 0.1, freq: 4500, q: 5 }); break;
      case 'healcast': [660, 880, 1100].forEach((f, i) => this.tone(f, 0.22, { type: 'sine', vol: 0.1, delay: i * 0.07 })); break;
      case 'lightning': this.noise(0.3, { vol: 0.4, freq: 3200, slide: -2800, q: 0.8 }); this.tone(90, 0.3, { type: 'sawtooth', vol: 0.25, slide: -50 }); break;
      case 'dashcast': this.noise(0.22, { vol: 0.2, freq: 1400, slide: 2400, q: 2 }); break;
      case 'earthcast': this.noise(0.4, { vol: 0.3, freq: 300, slide: -180, type: 'lowpass' }); this.tone(80, 0.35, { type: 'sine', vol: 0.25, slide: -30 }); break;
      case 'thunder':
        this.noise(1.6, { vol: 0.4, freq: 220, slide: -150, type: 'lowpass' });
        this.noise(0.4, { vol: 0.3, freq: 1800, slide: -1400, delay: 0.05 });
        break;
      case 'drink': for (let i = 0; i < 3; i++) this.tone(300 - i * 40, 0.08, { type: 'sine', vol: 0.13, delay: i * 0.12, slide: 60 }); break;
      case 'equip': this.noise(0.1, { vol: 0.18, freq: 2000, q: 4 }); this.tone(440, 0.1, { type: 'triangle', vol: 0.1, delay: 0.04 }); break;
      case 'chestopen': this.noise(0.3, { vol: 0.16, freq: 500, slide: 300, type: 'lowpass' }); this.tone(180, 0.2, { type: 'triangle', vol: 0.1, slide: 80 }); break;
      case 'talk': for (let i = 0; i < 3; i++) this.tone(280 + r() * 160, 0.06, { type: 'square', vol: 0.06, delay: i * 0.09 }); break;
      case 'quest': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.13, delay: i * 0.09 })); break;
      case 'brew': for (let i = 0; i < 4; i++) this.tone(200 + r() * 300, 0.1, { type: 'sine', vol: 0.08, delay: i * 0.1, slide: 150 }); break;
    }
  },

  /* ---------- ambient loops (rain & wind) ---------- */
  rainGain: null, windGain: null,

  ensureLoops() {
    if (!this.ctx || this.rainGain) return;
    const mkLoop = (freq, type, q) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      return g;
    };
    this.rainGain = mkLoop(2200, 'lowpass', 0.5);
    this.windGain = mkLoop(400, 'bandpass', 0.6);
  },

  setRainLevel(level) {
    if (!this.ctx) { this.pendingRain = level; return; }
    this.ensureLoops();
    const t = this.ctx.currentTime;
    this.rainGain.gain.cancelScheduledValues(t);
    this.rainGain.gain.linearRampToValueAtTime(level * 0.1, t + 1.5);
    this.windGain.gain.cancelScheduledValues(t);
    this.windGain.gain.linearRampToValueAtTime(0.012 + level * 0.05, t + 1.5);
  },

  /* ---------- generative music ---------- */
  TRACKS: {
    overworld: {
      bpm: 76, vol: 1.0,
      scale: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3], // C major pentatonic-ish
      chords: [[130.8, 164.8, 196.0], [110.0, 130.8, 164.8], [146.8, 174.6, 220.0], [98.0, 123.5, 146.8]],
      melodyChance: 0.42, melodyType: 'triangle', melodyVol: 0.10,
      bass: false, hats: false, kick: false,
    },
    arena: {
      bpm: 122, vol: 1.0,
      scale: [220.0, 246.9, 261.6, 329.6, 349.2, 440.0, 493.9, 523.3], // A minor flavor
      chords: [[110.0, 130.8, 164.8], [87.3, 110.0, 130.8], [98.0, 123.5, 146.8], [103.8, 130.8, 155.6]],
      melodyChance: 0.5, melodyType: 'square', melodyVol: 0.07,
      bass: true, hats: true, kick: true,
    },
    boss: {
      bpm: 152, vol: 1.15,
      scale: [293.7, 311.1, 349.2, 392.0, 440.0, 466.2, 587.3, 622.3], // D minor / dark
      chords: [[73.4, 87.3, 110.0], [69.3, 82.4, 103.8], [73.4, 92.5, 110.0], [61.7, 73.4, 92.5]],
      melodyChance: 0.62, melodyType: 'sawtooth', melodyVol: 0.06,
      bass: true, hats: true, kick: true,
    },
    victory: {
      bpm: 112, vol: 1.0,
      scale: [392.0, 440.0, 493.9, 587.3, 659.3, 784.0, 880.0, 987.8], // G major bright
      chords: [[196.0, 246.9, 293.7], [146.8, 185.0, 220.0], [164.8, 207.7, 246.9], [196.0, 246.9, 293.7]],
      melodyChance: 0.7, melodyType: 'triangle', melodyVol: 0.11,
      bass: true, hats: false, kick: false,
    },
  },

  setTrack(name) {
    if (this.track === name) return;
    this.track = name;
    this.stepIndex = 0;
    if (this.ctx) this.nextStep = this.ctx.currentTime + 0.15;
  },

  update() {
    if (!this.ctx || !this.track || this.ctx.state !== 'running') return;
    const cfg = this.TRACKS[this.track];
    if (!cfg) return;
    const stepDur = 60 / cfg.bpm / 2; // 8th notes
    while (this.nextStep < this.ctx.currentTime + 0.35) {
      this.scheduleStep(cfg, this.stepIndex, this.nextStep, stepDur);
      this.nextStep += stepDur;
      this.stepIndex = (this.stepIndex + 1) % 64;
    }
  },

  scheduleStep(cfg, step, when, stepDur) {
    const delay = Math.max(0, when - this.ctx.currentTime);
    const bar = Math.floor(step / 8) % 4;
    const inBar = step % 8;
    const dest = this.musicGain;
    // Pad chord at the start of each bar
    if (inBar === 0) {
      const chord = cfg.chords[bar];
      chord.forEach(f => this.tone(f, stepDur * 7.5, { type: 'sine', vol: 0.05 * cfg.vol, attack: 0.3, delay, dest }));
    }
    // Bass
    if (cfg.bass && inBar % 2 === 0) {
      this.tone(cfg.chords[bar][0] / 2, stepDur * 0.9, { type: 'triangle', vol: 0.12 * cfg.vol, delay, dest });
    }
    // Kick & hats
    if (cfg.kick && inBar % 4 === 0) {
      this.tone(120, 0.12, { type: 'sine', vol: 0.2 * cfg.vol, slide: -75, delay, dest });
    }
    if (cfg.hats && inBar % 2 === 1) {
      this.noise(0.04, { vol: 0.04 * cfg.vol, freq: 7000, q: 2, delay, dest });
    }
    // Melody — deterministic-ish wandering line, seeded by step so it loops musically
    if (Math.random() < cfg.melodyChance) {
      const idx = (Math.floor(step / 2) * 3 + bar * 2 + (Math.random() < 0.4 ? 1 : 0)) % cfg.scale.length;
      this.tone(cfg.scale[idx], stepDur * (Math.random() < 0.3 ? 1.8 : 0.9),
        { type: cfg.melodyType, vol: cfg.melodyVol * cfg.vol, attack: 0.01, delay, dest });
    }
  },
};
