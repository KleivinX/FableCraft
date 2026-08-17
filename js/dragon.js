'use strict';
/* FableCraft — the Dragon Boss: a flying voxel dragon with 3 phases and 5 attacks
   (fireball barrage, fire breath, dive attack, tail swipe, roar shockwave). */

const DragonBoss = {
  active: false,
  hp: 1000, maxHp: 1000,
  phase: 1,
  group: null, parts: null, mats: [],
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  yaw: 0,
  state: 'circle', stateT: 0, attackCd: 2,
  orbitAngle: 0,
  fireballs: [],
  hazards: [],
  hazardCd: 0,
  shockwaves: [],
  breathTick: 0,
  diveTarget: new THREE.Vector3(),
  fireLight: null,
  boomLight: null,
  flashT: 0,
  dead: false,
  fbGeo: null, fbMat: null,
  ringGeo: null, telegraphGeo: null,

  spawn(scene) {
    this.cleanup(scene);
    this.scene = scene;
    this.hp = this.maxHp = 1000;
    this.phase = 1;
    this.active = true;
    this.dead = false;
    this.state = 'circle';
    this.stateT = 3;
    this.attackCd = 3.5;
    this.fireballs = [];
    this.hazards = [];
    this.shockwaves = [];
    this.buildModel();
    const A = World.ARENA;
    this.pos.set(A.x, A.floor + 14, A.z);
    this.group.position.copy(this.pos);
    scene.add(this.group);

    this.fireLight = new THREE.PointLight(0xff7722, 0, 26);
    scene.add(this.fireLight);
    this.boomLight = new THREE.PointLight(0xffaa44, 0, 30);
    scene.add(this.boomLight);

    this.fbGeo = new THREE.SphereGeometry(0.4, 8, 8);
    this.fbMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a });
    this.ringGeo = new THREE.TorusGeometry(1, 0.18, 8, 40);
    this.telegraphGeo = new THREE.CircleGeometry(2.4, 24);
    AudioSys.play('roar');
    Game.shake(0.5, 1.2);
  },

  buildModel() {
    const g = new THREE.Group();
    this.mats = [];
    const M = (color, emissive) => {
      const m = new THREE.MeshLambertMaterial({ color });
      if (emissive) m.emissive = new THREE.Color(emissive);
      this.mats.push(m);
      return m;
    };
    const box = (w, h, d, mat, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, y, z);
      return b;
    };
    const scale = M(0x7a1f1f), belly = M(0x4a1212), dark = M(0x2a0d0d);
    const eyeMat = M(0x331100, 0xff7700);

    const parts = {};
    // Body — model faces +Z
    g.add(box(2.2, 1.8, 4.2, scale, 0, 0, -0.4));
    g.add(box(1.8, 0.5, 3.4, belly, 0, -1.0, -0.4));
    // Neck + head
    g.add(box(1.1, 1.1, 1.8, scale, 0, 0.7, 2.2));
    parts.head = new THREE.Group();
    parts.head.position.set(0, 1.2, 3.4);
    parts.head.add(box(1.4, 1.1, 1.8, scale, 0, 0, 0.4));
    parts.head.add(box(1.0, 0.5, 1.4, dark, 0, -0.55, 0.8)); // jaw
    parts.head.add(box(0.3, 0.7, 0.3, dark, -0.5, 0.8, -0.2)); // horns
    parts.head.add(box(0.3, 0.7, 0.3, dark, 0.5, 0.8, -0.2));
    parts.head.add(box(0.25, 0.25, 0.1, eyeMat, -0.45, 0.25, 1.3));
    parts.head.add(box(0.25, 0.25, 0.1, eyeMat, 0.45, 0.25, 1.3));
    g.add(parts.head);
    // Wings
    const mkWing = (side) => {
      const w = new THREE.Group();
      w.position.set(side * 1.1, 0.6, 0.2);
      w.add(box(4.4, 0.18, 2.6, scale, side * 2.2, 0, -0.3));
      w.add(box(2.6, 0.14, 1.6, dark, side * 4.6, -0.05, -0.5));
      g.add(w);
      return w;
    };
    parts.wingL = mkWing(-1);
    parts.wingR = mkWing(1);
    // Tail — chained pivots
    parts.tail = [];
    let parent = g, tz = -2.4;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, 0, tz);
      const size = 1.0 - i * 0.25;
      seg.add(box(size, size, 2.0, i === 2 ? dark : scale, 0, 0, -0.9));
      parent.add(seg);
      parts.tail.push(seg);
      parent = seg;
      tz = -1.9;
    }
    // Legs
    g.add(box(0.5, 1.4, 0.5, dark, -0.8, -1.4, 1.2));
    g.add(box(0.5, 1.4, 0.5, dark, 0.8, -1.4, 1.2));
    g.add(box(0.5, 1.4, 0.5, dark, -0.8, -1.4, -1.4));
    g.add(box(0.5, 1.4, 0.5, dark, 0.8, -1.4, -1.4));

    this.group = g;
    this.parts = parts;
  },

  headWorldPos() {
    const v = new THREE.Vector3();
    this.parts.head.getWorldPosition(v);
    return v;
  },

  tailWorldPos() {
    const v = new THREE.Vector3();
    this.parts.tail[2].getWorldPosition(v);
    return v;
  },

  // Points the player's melee swings can connect with
  getTargetPoints() {
    return [this.pos.clone(), this.headWorldPos(), this.tailWorldPos()];
  },

  damage(dmg) {
    if (!this.active || this.dead) return false;
    this.hp -= dmg;
    this.flashT = 0.15;
    Game.stats.damageDealt += dmg;
    AudioSys.play('hit');
    Particles.hit(this.headWorldPos());
    if (this.hp <= 700 && this.phase < 2) this.enterPhase(2);
    if (this.hp <= 300 && this.phase < 3) this.enterPhase(3);
    if (this.hp <= 0) {
      this.hp = 0;
      this.startDeath();
    }
    return true;
  },

  enterPhase(p) {
    this.phase = p;
    AudioSys.play('roar');
    Game.shake(0.6, 1.5);
    UI.banner(p === 2 ? 'THE DRAGON RAGES' : 'THE DRAGON BURNS WITH FURY', '', 2.2);
    this.state = 'roar';
    this.stateT = 1.6;
    this.spawnShockwave();
  },

  startDeath() {
    this.dead = true;
    this.state = 'dying';
    this.stateT = 2.4;
    AudioSys.play('roar');
    Game.shake(0.8, 2.2);
  },

  /* ---------- helpers ---------- */
  phaseMul() { return this.phase === 1 ? 1 : (this.phase === 2 ? 0.7 : 0.45); },

  faceTowards(target, dt, rate = 4) {
    const d = new THREE.Vector3().subVectors(target, this.pos);
    const targetYaw = Math.atan2(d.x, d.z);
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * Math.min(1, rate * dt);
  },

  spawnFireball(target) {
    AudioSys.play('fireball');
    const origin = this.headWorldPos();
    const lead = Player.vel.clone().multiplyScalar(0.35);
    const aim = target.clone().add(lead).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2));
    const vel = aim.sub(origin).normalize().multiplyScalar(this.phase === 3 ? 18 : 14);
    const mesh = new THREE.Mesh(this.fbGeo, this.fbMat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.fireballs.push({ pos: origin.clone(), vel, mesh, t: 5 });
  },

  explodeAt(pos, radius, dmg) {
    AudioSys.play('explosion');
    Particles.explosion(pos, 1.1);
    this.boomLight.position.copy(pos);
    this.boomLight.intensity = 4;
    Game.shake(0.25, 0.3);
    const d = pos.distanceTo(new THREE.Vector3(Player.pos.x, Player.pos.y + 0.9, Player.pos.z));
    if (d < radius && !Player.dead) {
      const kn = new THREE.Vector3(Player.pos.x - pos.x, 0, Player.pos.z - pos.z).normalize().multiplyScalar(7);
      kn.y = 4;
      Player.damage(dmg, kn, 'dragon fire');
    }
  },

  spawnShockwave() {
    const A = World.ARENA;
    const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.9 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.pos.x, A.floor + 1.2, this.pos.z);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, r: 1, hit: false });
    Game.shake(0.4, 0.8);
  },

  spawnHazard() {
    const A = World.ARENA;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 17;
    const x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r;
    const mesh = new THREE.Mesh(this.telegraphGeo, new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, A.floor + 1.06, z);
    this.scene.add(mesh);
    this.hazards.push({ mesh, t: 1.1, pos: new THREE.Vector3(x, A.floor + 1.2, z) });
  },

  /* ---------- update ---------- */
  update(dt) {
    if (!this.active) return;
    const A = World.ARENA;
    const playerC = new THREE.Vector3(Player.pos.x, Player.pos.y + 0.9, Player.pos.z);
    const distToPlayer = this.pos.distanceTo(playerC);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = this.flashT > 0 ? 0.8 : 0;
      for (const m of this.mats) m.emissive && m.color.getHex() !== 0x331100 && m.emissive.setRGB(f, f * 0.15, f * 0.1);
    }

    this.stateT -= dt;
    this.attackCd -= dt;

    switch (this.state) {
      case 'circle': {
        this.orbitAngle += dt * (0.45 + this.phase * 0.12);
        const targetPos = new THREE.Vector3(
          A.x + Math.cos(this.orbitAngle) * 13,
          A.floor + 11 + Math.sin(this.orbitAngle * 2.3) * 2.5,
          A.z + Math.sin(this.orbitAngle) * 13
        );
        this.pos.lerp(targetPos, Math.min(1, 1.6 * dt));
        this.faceTowards(playerC, dt, 2.5);
        // Tail swipe if player is close
        if (distToPlayer < 6 && this.attackCd <= 0) {
          this.state = 'swipe'; this.stateT = 0.65; this.swipeHit = false;
          break;
        }
        if (this.attackCd <= 0) {
          const roll = Math.random();
          if (this.phase >= 2 && roll < 0.18) { this.state = 'roar'; this.stateT = 1.4; this.roared = false; }
          else if (roll < 0.5) { this.state = 'barrage'; this.stateT = (this.phase === 1 ? 3 : this.phase === 2 ? 5 : 8) * 0.34 + 0.4; this.barrageT = 0; }
          else if (roll < 0.78) { this.state = 'breath'; this.stateT = 3.4; this.breathTick = 0; }
          else { this.state = 'dive'; this.stateT = 2.2; this.divePhase = 0; }
          this.attackCd = (3.2 + Math.random() * 2) * this.phaseMul();
        }
        break;
      }

      case 'barrage': {
        // Hover and launch fireballs at the player
        this.pos.y = Utils.lerp(this.pos.y, A.floor + 12, 2 * dt);
        this.faceTowards(playerC, dt, 5);
        this.barrageT -= dt;
        if (this.barrageT <= 0 && this.stateT > 0.3) {
          this.barrageT = 0.34;
          this.spawnFireball(playerC);
        }
        if (this.stateT <= 0) this.state = 'circle';
        break;
      }

      case 'breath': {
        // Swoop near the player and breathe fire in a cone
        const hover = playerC.clone().add(
          new THREE.Vector3().subVectors(this.pos, playerC).setY(0).normalize().multiplyScalar(7)
        );
        hover.y = A.floor + 4.5;
        this.pos.lerp(hover, Math.min(1, 2.2 * dt));
        this.faceTowards(playerC, dt, 6);
        if (this.stateT < 2.6) {
          const mouth = this.headWorldPos();
          const dir = new THREE.Vector3().subVectors(playerC, mouth).normalize();
          for (let i = 0; i < 3; i++) {
            const sp = mouth.clone().addScaledVector(dir, 1 + Math.random() * 6);
            Particles.fire(sp, 2);
          }
          this.fireLight.position.copy(mouth.clone().addScaledVector(dir, 3));
          this.fireLight.intensity = 3 + Math.random() * 2;
          this.breathTick -= dt;
          if (this.breathTick <= 0) {
            this.breathTick = 0.4;
            const toP = new THREE.Vector3().subVectors(playerC, mouth);
            const d = toP.length();
            if (d < 10 && toP.normalize().dot(dir) > 0.86 && !Player.dead) {
              Player.damage(8, dir.clone().multiplyScalar(3).setY(2), 'dragon fire breath');
            }
          }
        }
        if (this.stateT <= 0) { this.state = 'circle'; this.fireLight.intensity = 0; }
        break;
      }

      case 'dive': {
        if (this.divePhase === 0) { // telegraph: climb
          this.pos.y = Utils.lerp(this.pos.y, A.floor + 16, 3 * dt);
          this.faceTowards(playerC, dt, 6);
          if (this.stateT < 1.4) {
            this.divePhase = 1;
            this.diveTarget.copy(playerC);
            this.diveHit = false;
            AudioSys.play('swing');
          }
        } else {
          const dir = new THREE.Vector3().subVectors(this.diveTarget, this.pos);
          const d = dir.length();
          if (d > 1.5 && this.stateT > 0) {
            dir.normalize();
            this.pos.addScaledVector(dir, 27 * dt);
            this.yaw = Math.atan2(dir.x, dir.z);
            if (!this.diveHit && this.pos.distanceTo(playerC) < 2.8 && !Player.dead) {
              this.diveHit = true;
              const kn = dir.clone().multiplyScalar(9); kn.y = 5;
              Player.damage(25, kn, 'the dragon\'s dive');
              Game.shake(0.4, 0.5);
            }
          } else {
            this.state = 'circle';
          }
        }
        if (this.pos.y < A.floor + 2.5) this.pos.y = A.floor + 2.5;
        if (this.stateT <= -1) this.state = 'circle';
        break;
      }

      case 'swipe': {
        this.faceTowards(playerC, dt, 1);
        // Tail whips around
        const prog = 1 - Math.max(0, this.stateT) / 0.65;
        this.parts.tail.forEach((seg, i) => {
          seg.rotation.y = Math.sin(prog * Math.PI * 2) * (0.9 - i * 0.2);
        });
        if (!this.swipeHit && prog > 0.4) {
          this.swipeHit = true;
          AudioSys.play('swing');
          if (this.pos.distanceTo(playerC) < 7 && !Player.dead) {
            const kn = new THREE.Vector3(Player.pos.x - this.pos.x, 0, Player.pos.z - this.pos.z).normalize().multiplyScalar(11);
            kn.y = 6;
            Player.damage(15, kn, 'the dragon\'s tail');
          }
        }
        if (this.stateT <= 0) {
          this.parts.tail.forEach(seg => seg.rotation.y = 0);
          this.state = 'circle';
        }
        break;
      }

      case 'roar': {
        this.faceTowards(playerC, dt, 3);
        if (!this.roared && this.stateT < 1.1) {
          this.roared = true;
          AudioSys.play('roar');
          this.spawnShockwave();
        }
        if (this.stateT <= 0) { this.roared = false; this.state = 'circle'; }
        break;
      }

      case 'dying': {
        this.pos.y = Math.max(A.floor + 2, this.pos.y - 4 * dt);
        this.yaw += dt * 1.5;
        if (Math.random() < 0.3) Particles.explosion(
          this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4)), 0.7);
        if (this.stateT <= 0) this.finishDeath();
        break;
      }
    }

    // Phase 3 arena hazards: falling fire
    if (this.phase === 3 && !this.dead) {
      this.hazardCd -= dt;
      if (this.hazardCd <= 0) {
        this.hazardCd = 2.2;
        this.spawnHazard();
      }
    }

    /* ---- projectiles, hazards, shockwaves ---- */
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.t -= dt;
      f.pos.addScaledVector(f.vel, dt);
      f.mesh.position.copy(f.pos);
      Particles.fire(f.pos, 1);
      let boom = f.t <= 0 || World.isSolid(f.pos.x, f.pos.y, f.pos.z);
      if (!boom && f.pos.distanceTo(playerC) < 1.5) boom = true;
      if (boom) {
        this.explodeAt(f.pos, 3, 12);
        this.scene.remove(f.mesh);
        this.fireballs.splice(i, 1);
      }
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.t -= dt;
      hz.mesh.material.opacity = 0.25 + 0.3 * Math.abs(Math.sin(hz.t * 12));
      // Falling fire trail above the marked spot
      Particles.fire(hz.pos.clone().add(new THREE.Vector3(0, 6 * Math.max(0, hz.t), 0)), 1);
      if (hz.t <= 0) {
        this.explodeAt(hz.pos, 2.8, 15);
        this.scene.remove(hz.mesh);
        hz.mesh.material.dispose();
        this.hazards.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r += 13 * dt;
      sw.mesh.scale.set(sw.r, sw.r, 1);
      sw.mesh.material.opacity = Math.max(0, 0.9 - sw.r / 22);
      const pd = Utils.dist2D(Player.pos.x, Player.pos.z, sw.mesh.position.x, sw.mesh.position.z);
      if (!sw.hit && Math.abs(pd - sw.r) < 1.3 && !Player.dead && Player.pos.y < A.floor + 4) {
        sw.hit = true;
        const kn = new THREE.Vector3(Player.pos.x - sw.mesh.position.x, 0, Player.pos.z - sw.mesh.position.z).normalize().multiplyScalar(9);
        kn.y = 5;
        Player.damage(10, kn, 'the dragon\'s roar');
      }
      if (sw.r > 24) {
        this.scene.remove(sw.mesh);
        sw.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // Decay lights
    this.boomLight.intensity = Math.max(0, this.boomLight.intensity - 9 * dt);
    if (this.state !== 'breath') this.fireLight.intensity = Math.max(0, this.fireLight.intensity - 6 * dt);

    /* ---- animation ---- */
    const flapSpeed = this.state === 'dive' ? 14 : 6 + this.phase;
    const t = performance.now() / 1000;
    const flap = Math.sin(t * flapSpeed) * 0.55;
    this.parts.wingL.rotation.z = -flap - 0.1;
    this.parts.wingR.rotation.z = flap + 0.1;
    if (this.state !== 'swipe') {
      this.parts.tail.forEach((seg, i) => {
        seg.rotation.y = Math.sin(t * 2 + i) * 0.18;
      });
    }
    // Head tracks the player
    const headDir = new THREE.Vector3().subVectors(playerC, this.headWorldPos());
    this.parts.head.rotation.x = Utils.clamp(Math.atan2(headDir.y, Math.hypot(headDir.x, headDir.z)) * 0.6, -0.5, 0.5);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    UI.bossBar(this.hp / this.maxHp, this.phase === 3 ? 'ANCIENT DRAGON — ENRAGED' : 'ANCIENT DRAGON');
  },

  finishDeath() {
    this.active = false;
    Particles.explosion(this.pos, 3);
    Particles.explosion(this.pos.clone().add(new THREE.Vector3(2, 1, 0)), 2);
    Particles.explosion(this.pos.clone().add(new THREE.Vector3(-2, 2, 1)), 2);
    AudioSys.play('explosion');
    Game.shake(1, 1.5);
    const dropPos = this.pos.clone();
    this.scene.remove(this.group);
    UI.bossBar(null);
    // Dragon drops
    Entities.spawnDrop(dropPos, { item: ITEM.DRAGON_CORE, count: 1 });
    Entities.spawnDrop(dropPos.clone().add(new THREE.Vector3(1.5, 0, 0)), { item: ITEM.DRAGON_CRYSTAL, count: 3 });
    Arena.victory(dropPos);
  },

  cleanup(scene) {
    const s = scene || this.scene;
    if (!s) return;
    if (this.group) s.remove(this.group);
    for (const f of this.fireballs) s.remove(f.mesh);
    for (const h of this.hazards) { s.remove(h.mesh); h.mesh.material.dispose(); }
    for (const sw of this.shockwaves) { s.remove(sw.mesh); sw.mesh.material.dispose(); }
    if (this.fireLight) s.remove(this.fireLight);
    if (this.boomLight) s.remove(this.boomLight);
    this.fireballs = []; this.hazards = []; this.shockwaves = [];
    this.active = false;
    UI.bossBar(null);
  },
};
