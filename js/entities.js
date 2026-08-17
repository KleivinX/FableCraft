'use strict';
/* FableCraft — enemies (zombie / skeleton / spider), arrows, and loot drops.
   AI: chase + obstacle jumping; skeletons kite and shoot arrows. */

const Entities = {
  scene: null,
  list: [],
  drops: [],
  arrows: [],
  spawnTimer: 0,
  arrowGeo: null,
  dropTexCache: {},

  STATS: {
    zombie:   { hp: 50, dmg: 10, speed: 1.9, attackRange: 1.7, attackRate: 1.2, aggro: 26, xp: 12, w: 0.6, h: 1.8 },
    skeleton: { hp: 40, dmg: 8,  speed: 2.4, attackRange: 14,  attackRate: 2.4, aggro: 28, xp: 15, w: 0.6, h: 1.8 },
    spider:   { hp: 35, dmg: 6,  speed: 3.5, attackRange: 1.9, attackRate: 0.55, aggro: 22, xp: 15, w: 0.9, h: 0.9 },
    // Dungeon bosses — they never lose interest, and hit hard enough to matter
    warden:    { hp: 420, dmg: 20, speed: 2.2, attackRange: 2.8, attackRate: 1.5, aggro: 9999, xp: 900, w: 1.1, h: 2.7 },
    leviathan: { hp: 480, dmg: 22, speed: 2.7, attackRange: 3.0, attackRate: 1.3, aggro: 9999, xp: 1100, w: 1.3, h: 2.5 },
  },

  init(scene) {
    this.scene = scene;
    this.list = [];
    this.drops = [];
    this.arrows = [];
    this.arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
  },

  /* ================= MODELS ================= */
  box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  },

  buildModel(type) {
    const g = new THREE.Group();
    const mats = [];
    const M = (color) => {
      const m = new THREE.MeshLambertMaterial({ color });
      mats.push(m);
      return m;
    };
    const parts = {};

    if (type === 'zombie' || type === 'skeleton') {
      const thin = type === 'skeleton' ? 0.13 : 0.18;
      const skin = M(type === 'skeleton' ? 0xd8d8d0 : 0x4a8f3c);
      const cloth = M(type === 'skeleton' ? 0xb8b8b0 : 0x2a6b8f);
      const legMat = M(type === 'skeleton' ? 0xd0d0c8 : 0x3a3a6b);
      const dark = M(0x111111);

      parts.head = this.box(0.5, 0.5, 0.5, skin, 0, 1.78, 0);
      parts.head.add(this.box(0.09, 0.09, 0.04, dark, -0.12, 0.04, 0.26));
      parts.head.add(this.box(0.09, 0.09, 0.04, dark, 0.12, 0.04, 0.26));
      g.add(parts.head);
      g.add(this.box(0.5, 0.72, 0.26, cloth, 0, 1.16, 0));

      const mkLimb = (x, y, len, mat, fwd) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        pivot.add(this.box(thin, len, thin, mat, 0, -len / 2, 0));
        if (fwd) pivot.rotation.x = -1.35;
        g.add(pivot);
        return pivot;
      };
      parts.armL = mkLimb(-0.34, 1.45, 0.62, skin, true);
      parts.armR = mkLimb(0.34, 1.45, 0.62, skin, true);
      parts.legL = mkLimb(-0.14, 0.8, 0.8, legMat, false);
      parts.legR = mkLimb(0.14, 0.8, 0.8, legMat, false);
      if (type === 'skeleton') {
        parts.armR.add(this.box(0.07, 0.7, 0.07, M(0x6b4a2b), 0, -0.55, 0.12));
      }
    } else if (type === 'warden' || type === 'leviathan') {
      const sea = type === 'leviathan';
      const body = M(sea ? 0x1d5f6b : 0x6d6a5a);
      const plate = M(sea ? 0x2a8f8a : 0x3d3a33);
      const bone = M(sea ? 0x9fe8dc : 0xe4e0cf);
      const eyeMat = new THREE.MeshLambertMaterial({
        color: sea ? 0x0a3a44 : 0x3a1a00,
        emissive: sea ? 0x2ad4e8 : 0xff8c1a, emissiveIntensity: 1.4,
      });
      mats.push(eyeMat);
      const S = sea ? 1.15 : 1.0;

      // Torso and shoulder plates
      g.add(this.box(1.05 * S, 1.15, 0.62, body, 0, 1.45, 0));
      g.add(this.box(1.45 * S, 0.26, 0.78, plate, 0, 2.0, 0));
      g.add(this.box(0.75 * S, 0.5, 0.5, plate, 0, 0.85, 0));

      parts.head = this.box(0.62, 0.62, 0.62, bone, 0, 2.42, 0);
      parts.head.add(this.box(0.13, 0.13, 0.05, eyeMat, -0.16, 0.06, 0.33));
      parts.head.add(this.box(0.13, 0.13, 0.05, eyeMat, 0.16, 0.06, 0.33));
      // Crown of horns / coral spines
      for (const hx of [-0.26, 0, 0.26]) parts.head.add(this.box(0.1, 0.34, 0.1, sea ? bone : plate, hx, 0.42, 0));
      g.add(parts.head);

      const mkLimb = (x, y, len, thick, mat, fwd) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        pivot.add(this.box(thick, len, thick, mat, 0, -len / 2, 0));
        if (fwd) pivot.rotation.x = -1.1;
        g.add(pivot);
        return pivot;
      };
      parts.armL = mkLimb(-0.72 * S, 1.92, 0.95, 0.26, body, true);
      parts.armR = mkLimb(0.72 * S, 1.92, 0.95, 0.26, body, true);
      parts.armL.add(this.box(0.34, 0.34, 0.34, plate, 0, -0.95, 0));  // heavy fists
      parts.armR.add(this.box(0.34, 0.34, 0.34, plate, 0, -0.95, 0));
      parts.legL = mkLimb(-0.28, 0.9, 0.92, 0.3, plate, false);
      parts.legR = mkLimb(0.28, 0.9, 0.92, 0.3, plate, false);

    } else { // spider
      const bodyMat = M(0x2a1f1a), headMat = M(0x1a1410);
      const eyeMat = new THREE.MeshLambertMaterial({ color: 0x330000, emissive: 0xcc1111 });
      mats.push(eyeMat);
      g.add(this.box(0.85, 0.42, 1.05, bodyMat, 0, 0.5, -0.15));
      parts.head = this.box(0.45, 0.4, 0.45, headMat, 0, 0.48, 0.55);
      parts.head.add(this.box(0.07, 0.07, 0.04, eyeMat, -0.13, 0.06, 0.23));
      parts.head.add(this.box(0.07, 0.07, 0.04, eyeMat, 0.13, 0.06, 0.23));
      parts.head.add(this.box(0.05, 0.05, 0.04, eyeMat, -0.05, 0.12, 0.23));
      parts.head.add(this.box(0.05, 0.05, 0.04, eyeMat, 0.05, 0.12, 0.23));
      g.add(parts.head);
      parts.legs = [];
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 4; i++) {
          const pivot = new THREE.Group();
          pivot.position.set(s * 0.42, 0.55, -0.5 + i * 0.3);
          pivot.add(this.box(0.06, 0.55, 0.06, bodyMat, s * 0.18, -0.22, 0));
          pivot.rotation.z = -s * 0.85;
          g.add(pivot);
          parts.legs.push(pivot);
        }
      }
    }
    return { group: g, parts, mats };
  },

  /* ================= SPAWNING ================= */
  spawnEnemy(type, x, y, z, opts = {}) {
    const st = this.STATS[type];
    const model = this.buildModel(type);
    const e = {
      type, hp: st.hp, maxHp: st.hp,
      pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(),
      w: st.w, h: st.h,
      speed: st.speed, dmg: st.dmg,
      attackRange: st.attackRange, attackRate: st.attackRate,
      aggro: opts.arena ? 9999 : st.aggro,
      xpVal: st.xp,
      mesh: model.group, parts: model.parts, mats: model.mats,
      attackCd: Math.random(), soundCd: 2 + Math.random() * 5,
      walkPhase: Math.random() * 6, flashT: 0, slowT: 0, dying: 0, dead: false,
      onGround: false, yaw: Math.random() * Math.PI * 2,
      arena: !!opts.arena, natural: !!opts.natural, cave: !!opts.cave,
      dayTimer: 3 + Math.random() * 8,
      wanderDir: Math.random() * Math.PI * 2, wanderT: 0,
    };
    e.mesh.position.copy(e.pos);
    this.scene.add(e.mesh);
    this.list.push(e);
    return e;
  },

  count(filter) {
    let n = 0;
    for (const e of this.list) if (!e.dead && !e.dying && (!filter || filter(e))) n++;
    return n;
  },

  naturalSpawn(dt) {
    if (Arena.active || Player.dead) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 1.8;
    const underground = Player.pos.y < World.surfaceY(Player.pos.x, Player.pos.z) - 8;
    if (!Game.isNight && !underground) return;
    if (this.count(e => e.natural) >= 10) return;
    const r = Math.random();
    const type = r < 0.5 ? 'zombie' : (r < 0.75 ? 'skeleton' : 'spider');

    if (underground) {
      // Spawn inside nearby cave pockets
      for (let tries = 0; tries < 6; tries++) {
        const x = Player.pos.x + (Math.random() - 0.5) * 32;
        const z = Player.pos.z + (Math.random() - 0.5) * 32;
        if (!World.isLoadedAt(x, z)) continue;
        if (Utils.dist2D(x, z, Player.pos.x, Player.pos.z) < 10) continue;
        for (let y = Math.floor(Player.pos.y) + 4; y > Math.floor(Player.pos.y) - 8 && y > 2; y--) {
          if (World.isSolid(x, y - 1, z) && !World.isSolid(x, y, z) && !World.isSolid(x, y + 1, z) &&
              World.getBlock(x, y, z) !== BLOCK.WATER) {
            this.spawnEnemy(type, Math.floor(x) + 0.5, y, Math.floor(z) + 0.5, { natural: true, cave: true });
            return;
          }
        }
      }
      return;
    }

    const a = Math.random() * Math.PI * 2;
    const d = 22 + Math.random() * 18;
    const x = Player.pos.x + Math.cos(a) * d;
    const z = Player.pos.z + Math.sin(a) * d;
    if (!World.isLoadedAt(x, z)) return;
    if (Utils.dist2D(x, z, World.SPAWN.x, World.SPAWN.z) < 20) return; // safe zone
    if (World.inArenaRegion(x, z)) return;
    const y = World.surfaceY(x, z) + 1;
    if (y >= CHUNK_Y - 4 || y <= World.SEA) return;
    this.spawnEnemy(type, x, y, z, { natural: true });
  },

  /* ================= COMBAT ================= */
  damageEntity(e, dmg, knock, fromPlayer = true) {
    if (e.dead || e.dying > 0) return false;
    e.hp -= dmg;
    e.flashT = 0.15;
    if (knock) e.vel.add(knock);
    if (fromPlayer) Game.stats.damageDealt += dmg;
    Particles.hit(e.pos.clone().add(new THREE.Vector3(0, e.h * 0.6, 0)));
    if (e.hp <= 0) {
      this.kill(e, fromPlayer);
      return true;
    }
    AudioSys.play('hit');
    return false;
  },

  kill(e, fromPlayer) {
    e.dying = 0.001;
    AudioSys.play('enemydie');
    Game.stats.kills++;
    const dpos = e.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
    // Loot: coins / XP / materials with random chances
    this.spawnDrop(dpos, { xp: e.xpVal });
    if (Math.random() < 0.65) this.spawnDrop(dpos, { coins: 1 + Math.floor(Math.random() * 4) });
    if (Math.random() < 0.4) {
      const mat = { zombie: ITEM.LEATHER, skeleton: ITEM.COAL, spider: ITEM.LEATHER }[e.type];
      this.spawnDrop(dpos, { item: mat, count: 1 + Math.floor(Math.random() * 2) });
    }
    if (e.arena) Arena.notifyKill(e);
  },

  clearAll(arenaOnly = false) {
    for (const e of this.list) {
      if (arenaOnly && !e.arena) continue;
      this.scene.remove(e.mesh);
      e.dead = true;
    }
    this.list = this.list.filter(e => !e.dead);
    for (const a of this.arrows) this.scene.remove(a.mesh);
    this.arrows = [];
  },

  /* ================= UPDATE ================= */
  update(dt) {
    this.naturalSpawn(dt);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) { this.list.splice(i, 1); continue; }

      // Death animation: keel over, sink, fade
      if (e.dying > 0) {
        e.dying += dt;
        const t = Math.min(1, e.dying / 0.9);
        e.mesh.rotation.z = t * Math.PI / 2;
        e.mesh.position.y = e.pos.y - t * 0.4;
        for (const m of e.mats) { m.transparent = true; m.opacity = 1 - t; }
        if (t >= 1) {
          this.scene.remove(e.mesh);
          this.list.splice(i, 1);
        }
        continue;
      }

      // Hit flash / ice-slow tint
      if (e.slowT > 0) e.slowT -= dt;
      if (e.flashT > 0) {
        e.flashT -= dt;
        const f = e.flashT > 0 ? 0.7 : 0;
        for (const m of e.mats) if (m.emissive) m.emissive.setRGB(f, f * 0.1, f * 0.1);
      } else if (e.slowT > 0) {
        for (const m of e.mats) if (m.emissive) m.emissive.setRGB(0, 0.12, 0.25);
        if (e.slowT <= dt) for (const m of e.mats) if (m.emissive) m.emissive.setRGB(0, 0, 0);
      }

      const toPlayer = new THREE.Vector3().subVectors(Player.pos, e.pos);
      const dist = toPlayer.length();
      const distH = Math.hypot(toPlayer.x, toPlayer.z);

      // Despawn rules (cave dwellers persist through the day)
      if (!e.arena && (dist > 70 || (!Game.isNight && e.natural && !e.cave && (e.dayTimer -= dt) <= 0))) {
        Particles.smoke(e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 6);
        this.scene.remove(e.mesh);
        this.list.splice(i, 1);
        continue;
      }

      e.attackCd -= dt;
      e.soundCd -= dt;
      const aggro = dist < e.aggro && !Player.dead;

      if (aggro && e.soundCd <= 0 && dist < 22) {
        e.soundCd = 3 + Math.random() * 6;
        AudioSys.play(e.type);
      }

      // ---- steering ----
      let wantX = 0, wantZ = 0, wantSpeed = 0;
      if (aggro) {
        const nx = toPlayer.x / (distH || 1), nz = toPlayer.z / (distH || 1);
        if (e.type === 'skeleton') {
          if (distH > 11) { wantX = nx; wantZ = nz; wantSpeed = e.speed; }
          else if (distH < 7) { wantX = -nx; wantZ = -nz; wantSpeed = e.speed * 0.8; }
          // Shoot
          if (e.attackCd <= 0 && distH < e.attackRange && distH > 2) {
            e.attackCd = e.attackRate;
            this.shootArrow(e);
          }
        } else {
          wantX = nx; wantZ = nz; wantSpeed = e.speed;
          if (e.attackCd <= 0 && dist < e.attackRange) {
            e.attackCd = e.attackRate;
            const kn = new THREE.Vector3(nx * 5, 3, nz * 5);
            Player.damage(e.dmg, kn, `a ${e.type}`);
          }
        }
        e.yaw = Math.atan2(toPlayer.x, toPlayer.z);
      } else {
        // Idle wander
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = 2 + Math.random() * 4;
          e.wanderDir = Math.random() * Math.PI * 2;
          e.wanderPause = Math.random() < 0.4;
        }
        if (!e.wanderPause) {
          wantX = Math.sin(e.wanderDir); wantZ = Math.cos(e.wanderDir);
          wantSpeed = e.speed * 0.35;
          e.yaw = e.wanderDir;
        }
      }

      if (e.slowT > 0) wantSpeed *= 0.45; // chilled by ice magic
      const accel = e.onGround ? 10 : 3;
      e.vel.x = Utils.lerp(e.vel.x, wantX * wantSpeed, Math.min(1, accel * dt));
      e.vel.z = Utils.lerp(e.vel.z, wantZ * wantSpeed, Math.min(1, accel * dt));
      e.vel.y -= 24 * dt;
      if (e.vel.y < -45) e.vel.y = -45;

      // Jump over obstacles ("pathfinding where possible")
      if (wantSpeed > 0 && e.onGround) {
        const ahead = 0.7;
        const ax = e.pos.x + wantX * ahead, az = e.pos.z + wantZ * ahead;
        const blocked = World.isSolid(ax, e.pos.y + 0.4, az);
        const clearAbove = !World.isSolid(ax, e.pos.y + 1.4, az);
        if (blocked && clearAbove) e.vel.y = 8;
      }

      World.moveEntity(e, dt);

      // ---- animation ----
      const hSpeed = Math.hypot(e.vel.x, e.vel.z);
      e.walkPhase += hSpeed * dt * 2.4;
      const sw = Math.sin(e.walkPhase) * Math.min(1, hSpeed) * 0.65;
      if (e.type === 'spider') {
        for (let l = 0; l < e.parts.legs.length; l++) {
          e.parts.legs[l].rotation.x = Math.sin(e.walkPhase + l * 1.4) * 0.45 * Math.min(1, hSpeed);
        }
      } else {
        e.parts.legL.rotation.x = sw;
        e.parts.legR.rotation.x = -sw;
        if (e.type === 'skeleton') {
          e.parts.armL.rotation.x = -1.35 - sw * 0.2;
          e.parts.armR.rotation.x = -1.35 + sw * 0.2;
        } else {
          const bob = Math.sin(e.walkPhase * 0.7) * 0.1;
          e.parts.armL.rotation.x = -1.35 + bob;
          e.parts.armR.rotation.x = -1.35 - bob;
        }
      }
      e.mesh.position.copy(e.pos);
      e.mesh.rotation.y = e.yaw;
    }

    this.updateArrows(dt);
    this.updateDrops(dt);
  },

  /* ================= ARROWS ================= */
  shootArrow(e) {
    AudioSys.play('arrow');
    const origin = e.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const target = Player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = target.sub(origin);
    const dist = dir.length();
    dir.normalize();
    const vel = dir.multiplyScalar(20);
    vel.y += dist * 0.24; // arc compensation
    const mesh = new THREE.Mesh(this.arrowGeo, new THREE.MeshLambertMaterial({ color: 0xc8b078 }));
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.arrows.push({ pos: origin.clone(), vel, mesh, t: 6 });
  },

  updateArrows(dt) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.t -= dt;
      a.vel.y -= 10 * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(a.vel));
      let remove = a.t <= 0;
      if (World.isSolid(a.pos.x, a.pos.y, a.pos.z)) remove = true;
      const dp = new THREE.Vector3(Player.pos.x, Player.pos.y + 0.9, Player.pos.z).distanceTo(a.pos);
      if (!remove && dp < 0.9 && !Player.dead) {
        const kn = a.vel.clone().setY(0).normalize().multiplyScalar(4);
        kn.y = 2;
        Player.damage(8, kn, 'a skeleton arrow');
        remove = true;
      }
      if (remove) {
        this.scene.remove(a.mesh);
        a.mesh.material.dispose();
        this.arrows.splice(i, 1);
      }
    }
  },

  /* ================= DROPS ================= */
  dropTexture(key, drawFn) {
    if (this.dropTexCache[key]) return this.dropTexCache[key];
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    drawFn(cv.getContext('2d'));
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    this.dropTexCache[key] = tex;
    return tex;
  },

  dropSprite(d) {
    let tex;
    if (d.coins) {
      tex = this.dropTexture('coin', (ctx) => {
        const g = ctx.createRadialGradient(16, 13, 2, 16, 16, 13);
        g.addColorStop(0, '#fff2b0'); g.addColorStop(0.6, '#ffd34d'); g.addColorStop(1, '#b8860b');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(16, 16, 12, 0, Math.PI * 2); ctx.fill();
      });
    } else if (d.xp) {
      tex = this.dropTexture('xp', (ctx) => {
        const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 11);
        g.addColorStop(0, '#dffffa'); g.addColorStop(0.5, '#3ee87e'); g.addColorStop(1, 'rgba(20,120,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
      });
    } else {
      tex = this.dropTexture('item' + d.item, (ctx) => {
        const img = new Image();
        img.src = Items.iconURL(d.item);
        // icons are data URLs — they decode synchronously enough for next frame, draw on load to be safe
        img.onload = () => { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, 32, 32); tex.needsUpdate = true; };
      });
    }
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(d.coins || d.xp ? 0.32 : 0.45);
    return s;
  },

  spawnDrop(pos, what) {
    const d = {
      pos: pos.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 2),
      item: what.item || 0, count: what.count || 0,
      coins: what.coins || 0, xp: what.xp || 0,
      t: what.coins || what.xp ? 45 : 90, grace: 0.5,
    };
    d.sprite = this.dropSprite(d);
    d.sprite.position.copy(d.pos);
    this.scene.add(d.sprite);
    this.drops.push(d);
  },

  updateDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t -= dt; d.grace -= dt;
      const toP = new THREE.Vector3(Player.pos.x, Player.pos.y + 0.8, Player.pos.z).sub(d.pos);
      const dist = toP.length();
      if (dist < 3 && d.grace <= 0 && !Player.dead) {
        // Magnet pull
        d.vel.addScaledVector(toP.normalize(), 26 * dt);
        d.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt));
      } else {
        d.vel.y -= 13 * dt;
        d.vel.x *= 0.96; d.vel.z *= 0.96;
        if (World.isSolid(d.pos.x, d.pos.y - 0.22, d.pos.z) && d.vel.y < 0) {
          d.vel.y = 0;
          d.pos.y = Math.floor(d.pos.y - 0.22) + 1.22;
        }
      }
      d.pos.addScaledVector(d.vel, dt);
      d.sprite.position.copy(d.pos);

      let remove = d.t <= 0;
      if (dist < 1.1 && d.grace <= 0 && !Player.dead) {
        if (d.coins) { Player.addCoins(d.coins); Game.stats.coinsEarned += d.coins; }
        else if (d.xp) Player.addXP(d.xp);
        else {
          const left = Inv.add(d.item, d.count);
          if (left > 0) { d.count = left; d.grace = 1.5; continue; }
          AudioSys.play('click');
        }
        remove = true;
      }
      if (remove) {
        this.scene.remove(d.sprite);
        d.sprite.material.dispose();
        this.drops.splice(i, 1);
      }
    }
  },
};
