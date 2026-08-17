'use strict';
/* FableCraft — weather: rain, storms (with lightning) and fog banks. */

const Weather = {
  state: 'clear',
  timer: 60,
  lightningT: 0,
  flash: 0,
  rain: null,
  rainCount: 400,
  scene: null,

  init(scene) {
    this.scene = scene;
    const pos = new Float32Array(this.rainCount * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x9ab8d8, transparent: true, opacity: 0.45, fog: false });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.drops = [];
    for (let i = 0; i < this.rainCount; i++) {
      this.drops.push({
        x: (Math.random() - 0.5) * 30,
        y: Math.random() * 24,
        z: (Math.random() - 0.5) * 30,
        v: 18 + Math.random() * 8,
      });
    }
  },

  pickNext() {
    const r = Math.random();
    if (r < 0.5) this.state = 'clear';
    else if (r < 0.72) this.state = 'rain';
    else if (r < 0.87) this.state = 'fog';
    else this.state = 'storm';
    this.timer = 60 + Math.random() * 120;
    if (this.state === 'rain') UI.subtitle('[rain patters]');
    if (this.state === 'storm') UI.subtitle('[thunder rumbles in the distance]');
    if (this.state === 'fog') UI.subtitle('[a thick fog rolls in]');
    AudioSys.setRainLevel(this.state === 'rain' ? 0.5 : this.state === 'storm' ? 1 : 0);
  },

  // Lighting/sky multipliers for the current weather
  skyMod() {
    switch (this.state) {
      case 'rain': return { dark: 0.72, fogMul: 0.75 };
      case 'storm': return { dark: 0.5, fogMul: 0.6 };
      case 'fog': return { dark: 0.85, fogMul: 0.42 };
      default: return { dark: 1, fogMul: 1 };
    }
  },

  update(dt, playerPos) {
    this.timer -= dt;
    if (this.timer <= 0) this.pickNext();
    if (this.flash > 0) this.flash -= dt * 3;

    const raining = this.state === 'rain' || this.state === 'storm';
    this.rain.visible = raining;
    if (raining) {
      const arr = this.rain.geometry.attributes.position.array;
      const speed = this.state === 'storm' ? 1.5 : 1;
      for (let i = 0; i < this.rainCount; i++) {
        const d = this.drops[i];
        d.y -= d.v * speed * dt;
        if (d.y < 0) {
          d.y = 22 + Math.random() * 4;
          d.x = (Math.random() - 0.5) * 30;
          d.z = (Math.random() - 0.5) * 30;
        }
        const wx = playerPos.x + d.x, wy = playerPos.y - 4 + d.y, wz = playerPos.z + d.z;
        const j = i * 6;
        arr[j] = wx; arr[j + 1] = wy; arr[j + 2] = wz;
        arr[j + 3] = wx; arr[j + 4] = wy - 0.7 * speed; arr[j + 5] = wz;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    if (this.state === 'storm') {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 4 + Math.random() * 8;
        this.flash = 1;
        AudioSys.play('thunder');
        Game.shake(0.1, 0.3);
      }
    }
  },

  serialize() { return { state: this.state, timer: this.timer }; },
  load(d) {
    if (d && d.state) { this.state = d.state; this.timer = d.timer || 60; }
    AudioSys.setRainLevel(this.state === 'rain' ? 0.5 : this.state === 'storm' ? 1 : 0);
  },
};
