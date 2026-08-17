'use strict';
/* FableCraft — pooled particle system using a single InstancedMesh (object pooling + instanced rendering). */

const Particles = {
  MAX: 700,
  mesh: null,
  pool: [],
  dummy: new THREE.Object3D(),

  init(scene) {
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const mat = new THREE.MeshBasicMaterial({ fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pool = [];
    for (let i = 0; i < this.MAX; i++) {
      this.pool.push({
        alive: false,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        life: 0, maxLife: 1, size: 1, gravity: 0, drag: 0,
        color: new THREE.Color(1, 1, 1),
      });
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.dummy.position.set(0, -9999, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  },

  density: 1, // scaled by the graphics-quality setting

  emit({ pos, count = 10, spread = 0.3, vel = null, velSpread = 2.5, life = 0.8, lifeVar = 0.4, size = 1, sizeVar = 0.5, color = 0xffffff, colors = null, gravity = 9, drag = 0.5 }) {
    count = Math.max(1, Math.round(count * this.density));
    let spawned = 0;
    for (let i = 0; i < this.MAX && spawned < count; i++) {
      const p = this.pool[i];
      if (p.alive) continue;
      p.alive = true;
      p.pos.set(
        pos.x + (Math.random() - 0.5) * spread * 2,
        pos.y + (Math.random() - 0.5) * spread * 2,
        pos.z + (Math.random() - 0.5) * spread * 2
      );
      p.vel.set(
        (vel ? vel.x : 0) + (Math.random() - 0.5) * velSpread * 2,
        (vel ? vel.y : 0) + (Math.random() - 0.5) * velSpread * 2,
        (vel ? vel.z : 0) + (Math.random() - 0.5) * velSpread * 2
      );
      p.maxLife = p.life = life + Math.random() * lifeVar;
      p.size = size + Math.random() * sizeVar;
      p.gravity = gravity;
      p.drag = drag;
      if (colors) p.color.set(colors[Math.floor(Math.random() * colors.length)]);
      else if (color instanceof THREE.Color) p.color.copy(color);
      else p.color.set(color);
      this.mesh.setColorAt(i, p.color);
      spawned++;
    }
    if (spawned > 0) this.mesh.instanceColor.needsUpdate = true;
  },

  update(dt) {
    if (!this.mesh) return;
    let touched = false;
    for (let i = 0; i < this.MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) continue; // dead slots are already parked off-screen
      touched = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.dummy.position.set(0, -9999, 0);
        this.dummy.scale.setScalar(0.001);
      } else {
        p.vel.y -= p.gravity * dt;
        p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.pos.addScaledVector(p.vel, dt);
        this.dummy.position.copy(p.pos);
        const s = p.size * Math.min(1, p.life / (p.maxLife * 0.4));
        this.dummy.scale.setScalar(Math.max(0.001, s));
        this.dummy.rotation.set(p.life * 3, p.life * 5, 0);
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (touched) this.mesh.instanceMatrix.needsUpdate = true;
  },

  /* ---------- presets ---------- */
  blockBreak(pos, blockId) {
    const tile = Blocks.tileFor(blockId, 0);
    const c = Blocks.tileColors[tile] || new THREE.Color(0.6, 0.6, 0.6);
    this.emit({ pos, count: 16, spread: 0.4, velSpread: 3, life: 0.6, size: 1, color: c, gravity: 12 });
  },

  hit(pos) {
    this.emit({ pos, count: 8, spread: 0.25, velSpread: 3, life: 0.4, size: 0.8, colors: ['#ff5544', '#ffaa44', '#ffffff'], gravity: 6 });
  },

  levelUp(pos) {
    this.emit({ pos, count: 26, spread: 0.5, vel: new THREE.Vector3(0, 4, 0), velSpread: 2, life: 1.1, size: 0.9, colors: ['#2fc5e8', '#9aeeff', '#ffffff'], gravity: 2, drag: 1 });
  },

  portalSwirl(center) {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 1.6;
    this.emit({
      pos: new THREE.Vector3(center.x + Math.cos(a) * r, center.y + (Math.random() - 0.5) * 5, center.z + Math.sin(a) * 0.7),
      count: 1, spread: 0.1, vel: new THREE.Vector3(0, 1.2, 0), velSpread: 0.4,
      life: 1.6, size: 0.8, colors: ['#b14df0', '#8a2be2', '#e2ccff'], gravity: -0.5, drag: 0.2,
    });
  },

  explosion(pos, scale = 1) {
    this.emit({ pos, count: Math.floor(36 * scale), spread: 0.6 * scale, velSpread: 7 * scale, life: 0.9, size: 1.6 * scale, colors: ['#ff8c1a', '#ffd24d', '#e2452b', '#fff3a8'], gravity: 4, drag: 1.5 });
    this.smoke(pos, Math.floor(14 * scale));
  },

  smoke(pos, n = 10) {
    this.emit({ pos, count: n, spread: 0.7, vel: new THREE.Vector3(0, 2.2, 0), velSpread: 1.2, life: 1.6, lifeVar: 0.8, size: 1.8, colors: ['#444444', '#333333', '#555555'], gravity: -1.2, drag: 1 });
  },

  fire(pos, n = 4) {
    this.emit({ pos, count: n, spread: 0.4, vel: new THREE.Vector3(0, 3, 0), velSpread: 1.4, life: 0.55, size: 1.1, colors: ['#ff8c1a', '#ffd24d', '#ff5544'], gravity: -3, drag: 0.4 });
  },

  firework(pos, colorHex) {
    this.emit({ pos, count: 60, spread: 0.2, velSpread: 9, life: 1.3, lifeVar: 0.6, size: 1, colors: [colorHex, '#ffffff', colorHex], gravity: 5, drag: 1.2 });
    AudioSys.play('firework');
  },
};
