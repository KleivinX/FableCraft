'use strict';
/* FableCraft — magic: mana-driven spells with unlocks (levels / arena / loot) and
   per-spell upgrade levels (damage, range, cooldown, mana cost). */

const Spells = {
  DEFS: [
    { key: 'fireball',  name: 'Fireball',       unlockLevel: 2,  cost: 15, cd: 1.2, dmg: 18, aoe: 2.5, desc: 'Explosive bolt of flame' },
    { key: 'icespike',  name: 'Ice Spike',      unlockLevel: 4,  cost: 12, cd: 0.9, dmg: 12, slow: 3,  desc: 'Pierces and slows enemies' },
    { key: 'heal',      name: 'Healing Light',  unlockLevel: 5,  cost: 25, cd: 4,   heal: 30,          desc: 'Restores health' },
    { key: 'lightning', name: 'Lightning Bolt', unlockLevel: 7,  cost: 22, cd: 2.5, dmg: 30, range: 18, desc: 'Instant strike on a foe' },
    { key: 'dash',      name: 'Blink Dash',     unlockLevel: 9,  cost: 18, cd: 3,   dist: 8,           desc: 'Short teleport forward' },
    { key: 'earthwall', name: 'Earth Wall',     unlockLevel: 11, cost: 20, cd: 6,   dur: 8,            desc: 'Raises a defensive wall' },
    { key: 'meteor',    name: 'Meteor Strike',  unlockLevel: 0,  cost: 60, cd: 12,  dmg: 60, aoe: 6,   desc: 'Ultimate: rains destruction', special: true },
  ],

  state: { unlocked: [], levels: {}, active: 0 },
  cooldowns: {},
  projectiles: [],
  meteors: [],
  walls: [],
  bolts: [],
  iconCache: {},
  scene: null,
  fbGeo: null,

  init(scene) {
    this.scene = scene;
    this.projectiles = [];
    this.meteors = [];
    this.walls = [];
    this.bolts = [];
    this.cooldowns = {};
    this.fbGeo = new THREE.SphereGeometry(0.3, 8, 8);
  },

  def(key) { return this.DEFS.find(d => d.key === key); },
  isUnlocked(key) { return this.state.unlocked.includes(key); },
  level(key) { return this.state.levels[key] || 1; },

  activeSpell() {
    if (this.state.unlocked.length === 0) return null;
    this.state.active = Utils.clamp(this.state.active, 0, this.state.unlocked.length - 1);
    return this.def(this.state.unlocked[this.state.active]);
  },

  // Per-cast values after upgrades and held wand/staff power
  scaled(def) {
    const lvl = this.level(def.key);
    const held = Inv.selectedItem();
    const power = (held && held.magic ? held.magic.power : 1);
    const dmgK = (1 + 0.25 * (lvl - 1)) * power;
    return {
      cost: Math.round(def.cost * (1 - 0.08 * (lvl - 1))),
      cd: def.cd * (1 - 0.1 * (lvl - 1)),
      dmg: Math.round((def.dmg || 0) * dmgK),
      heal: Math.round((def.heal || 0) * dmgK),
      aoe: (def.aoe || 0) * (1 + 0.1 * (lvl - 1)),
      range: (def.range || 0) * (1 + 0.1 * (lvl - 1)),
      dist: (def.dist || 0) * (1 + 0.1 * (lvl - 1)),
      slow: def.slow || 0,
      dur: def.dur || 0,
    };
  },

  unlock(key, silent) {
    if (this.isUnlocked(key)) return false;
    this.state.unlocked.push(key);
    if (!this.state.levels[key]) this.state.levels[key] = 1;
    if (!silent) {
      const d = this.def(key);
      UI.banner('SPELL LEARNED', `${d.name} — ${d.desc}`, 3);
      AudioSys.play('levelup');
    }
    return true;
  },

  onLevel(level) {
    for (const d of this.DEFS) {
      if (!d.special && d.unlockLevel && level >= d.unlockLevel) this.unlock(d.key);
    }
  },

  unlockRandom() { // Spell Book effect
    const locked = this.DEFS.filter(d => !this.isUnlocked(d.key));
    if (locked.length === 0) return false;
    this.unlock(locked[Math.floor(Math.random() * locked.length)].key);
    return true;
  },

  upgradeCost(key) { return 150 * (this.level(key) + 1); },
  canUpgrade(key) { return this.isUnlocked(key) && this.level(key) < 5 && Player.coins >= this.upgradeCost(key); },
  upgrade(key) {
    if (!this.canUpgrade(key)) return false;
    Player.coins -= this.upgradeCost(key);
    this.state.levels[key] = this.level(key) + 1;
    AudioSys.play('craft');
    return true;
  },

  cycle(dir = 1) {
    if (this.state.unlocked.length < 2) return;
    this.state.active = (this.state.active + dir + this.state.unlocked.length) % this.state.unlocked.length;
    AudioSys.play('click');
  },

  cooldownFrac(key) {
    const d = this.def(key);
    const c = this.cooldowns[key] || 0;
    return c <= 0 ? 0 : c / this.scaled(d).cd;
  },

  tryCast() {
    const def = this.activeSpell();
    if (!def || Player.dead) return;
    if ((this.cooldowns[def.key] || 0) > 0) return;
    const s = this.scaled(def);
    if (Player.mana < s.cost) { UI.message('Not enough mana!', 1.2); return; }

    const eye = Player.eye();
    const look = Player.lookDir();
    let cast = true;

    switch (def.key) {
      case 'fireball': {
        AudioSys.play('cast');
        const mesh = new THREE.Mesh(this.fbGeo, new THREE.MeshBasicMaterial({ color: 0xff8c1a }));
        const pos = eye.clone().addScaledVector(look, 0.8);
        mesh.position.copy(pos);
        this.scene.add(mesh);
        this.projectiles.push({ kind: 'fire', pos, vel: look.clone().multiplyScalar(22), mesh, t: 3, dmg: s.dmg, aoe: s.aoe });
        break;
      }
      case 'icespike': {
        AudioSys.play('icecast');
        const mesh = new THREE.Mesh(this.fbGeo, new THREE.MeshBasicMaterial({ color: 0x9aeeff }));
        mesh.scale.set(0.7, 0.7, 1.6);
        const pos = eye.clone().addScaledVector(look, 0.8);
        mesh.position.copy(pos);
        this.scene.add(mesh);
        this.projectiles.push({ kind: 'ice', pos, vel: look.clone().multiplyScalar(30), mesh, t: 2.5, dmg: s.dmg, slow: s.slow });
        break;
      }
      case 'heal':
        AudioSys.play('healcast');
        Player.heal(s.heal);
        Combat.spawnNumber(eye.clone().add(new THREE.Vector3(0, 0.4, 0)), '+' + s.heal, 'heal');
        Particles.levelUp(Player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
        break;
      case 'lightning': {
        const target = this.findBoltTarget(eye, look, s.range);
        if (!target) { UI.message('No target in range', 1.2); cast = false; break; }
        AudioSys.play('lightning');
        this.spawnBolt(target.point);
        Game.shake(0.15, 0.2);
        if (target.entity) {
          const killed = Entities.damageEntity(target.entity, s.dmg, new THREE.Vector3(0, 4, 0), true);
          Combat.spawnNumber(target.point, String(s.dmg), killed ? 'player-hurt' : '');
        } else if (target.dragon) {
          DragonBoss.damage(Math.round(s.dmg * Player.dragonDamageMult()));
          Combat.spawnNumber(target.point, String(s.dmg), '');
        }
        break;
      }
      case 'dash': {
        AudioSys.play('dashcast');
        Particles.smoke(Player.pos.clone().add(new THREE.Vector3(0, 1, 0)), 8);
        const dir = new THREE.Vector3(look.x, 0, look.z).normalize();
        let best = null;
        for (let d = s.dist; d >= 1; d -= 0.5) {
          const c = Player.pos.clone().addScaledVector(dir, d);
          if (World.boxFree(c.x, c.y, c.z, Player.w, Player.h) ||
              World.boxFree(c.x, c.y + 1, c.z, Player.w, Player.h)) {
            if (!World.boxFree(c.x, c.y, c.z, Player.w, Player.h)) c.y += 1;
            best = c;
            break;
          }
        }
        if (best) {
          Player.pos.copy(best);
          Player.fallPeakY = Player.pos.y;
          Player.invuln = Math.max(Player.invuln, 0.5);
          Particles.levelUp(Player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
        }
        break;
      }
      case 'earthwall': {
        AudioSys.play('earthcast');
        const fwd = new THREE.Vector3(look.x, 0, look.z).normalize();
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const baseY = Math.floor(Player.pos.y);
        let placed = 0;
        for (let i = -2; i <= 2; i++) {
          const bx = Math.floor(Player.pos.x + fwd.x * 3 + right.x * i);
          const bz = Math.floor(Player.pos.z + fwd.z * 3 + right.z * i);
          for (let j = 0; j < 3; j++) {
            if (World.getBlock(bx, baseY + j, bz) === BLOCK.AIR) {
              World.setBlock(bx, baseY + j, bz, BLOCK.EARTH, false);
              this.walls.push({ x: bx, y: baseY + j, z: bz, t: s.dur });
              placed++;
            }
          }
        }
        if (placed === 0) cast = false;
        Game.shake(0.12, 0.25);
        break;
      }
      case 'meteor': {
        AudioSys.play('cast');
        const hit = World.raycast(eye, look, 24);
        const target = hit
          ? new THREE.Vector3(hit.x + 0.5, hit.y + 1, hit.z + 0.5)
          : eye.clone().addScaledVector(look, 20);
        const start = target.clone().add(new THREE.Vector3(6, 26, 3));
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
        mesh.position.copy(start);
        this.scene.add(mesh);
        this.meteors.push({
          pos: start, target, mesh, dmg: s.dmg, aoe: s.aoe,
          vel: target.clone().sub(start).normalize().multiplyScalar(26),
        });
        UI.message('Meteor incoming...', 1.5);
        break;
      }
    }

    if (cast) {
      Player.mana -= s.cost;
      this.cooldowns[def.key] = s.cd;
      Game.castAnim();
    }
  },

  findBoltTarget(eye, look, range) {
    let best = null, bestDist = range;
    for (const e of Entities.list) {
      if (e.dead || e.dying > 0 || e.npc) continue;
      const c = e.pos.clone().add(new THREE.Vector3(0, e.h * 0.6, 0));
      const to = c.clone().sub(eye);
      const d = to.length();
      if (d > bestDist) continue;
      if (to.normalize().dot(look) < 0.85) continue;
      best = { entity: e, point: c };
      bestDist = d;
    }
    if (!best && DragonBoss.active && !DragonBoss.dead) {
      for (const p of DragonBoss.getTargetPoints()) {
        const to = p.clone().sub(eye);
        const d = to.length();
        if (d < bestDist && to.normalize().dot(look) > 0.8) {
          best = { dragon: true, point: p };
          bestDist = d;
        }
      }
    }
    return best;
  },

  spawnBolt(point) {
    const pts = [];
    const top = point.clone().add(new THREE.Vector3(0, 18, 0));
    let cur = top.clone();
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      pts.push(cur.clone());
      cur = top.clone().lerp(point, (i + 1) / steps);
      cur.x += (Math.random() - 0.5) * 1.6;
      cur.z += (Math.random() - 0.5) * 1.6;
    }
    pts.push(point.clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff3a8, transparent: true, opacity: 1 }));
    this.scene.add(line);
    this.bolts.push({ line, t: 0.22 });
    Particles.explosion(point, 0.5);
  },

  hitEnemiesAt(pos, radius, dmg, slow) {
    for (const e of Entities.list) {
      if (e.dead || e.dying > 0 || e.npc) continue;
      const c = e.pos.clone().add(new THREE.Vector3(0, e.h * 0.5, 0));
      if (c.distanceTo(pos) <= radius + 0.6) {
        const kn = c.clone().sub(pos).setY(2).normalize().multiplyScalar(5);
        if (slow) e.slowT = Math.max(e.slowT || 0, slow);
        const killed = Entities.damageEntity(e, dmg, kn, true);
        Combat.spawnNumber(c, String(dmg), killed ? 'player-hurt' : '');
      }
    }
    if (DragonBoss.active && !DragonBoss.dead) {
      for (const p of DragonBoss.getTargetPoints()) {
        if (p.distanceTo(pos) <= radius + 1.5) {
          DragonBoss.damage(Math.round(dmg * Player.dragonDamageMult()));
          break;
        }
      }
    }
  },

  update(dt) {
    for (const k of Object.keys(this.cooldowns)) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.kind === 'fire') Particles.fire(p.pos, 1);
      else if (Math.random() < 0.5) Particles.emit({ pos: p.pos, count: 1, spread: 0.1, velSpread: 0.5, life: 0.4, size: 0.6, colors: ['#9aeeff', '#ffffff'], gravity: 0 });

      let hitEnt = null;
      for (const e of Entities.list) {
        if (e.dead || e.dying > 0 || e.npc) continue;
        if (p.pos.distanceTo(e.pos.clone().add(new THREE.Vector3(0, e.h * 0.5, 0))) < 1.1) { hitEnt = e; break; }
      }
      let hitDragon = false;
      if (!hitEnt && DragonBoss.active && !DragonBoss.dead) {
        for (const tp of DragonBoss.getTargetPoints()) {
          if (p.pos.distanceTo(tp) < 1.8) { hitDragon = true; break; }
        }
      }
      const hitBlock = World.isSolid(p.pos.x, p.pos.y, p.pos.z);

      if (hitEnt || hitDragon || hitBlock || p.t <= 0) {
        if (p.kind === 'fire') {
          AudioSys.play('explosion');
          Particles.explosion(p.pos, 0.8);
          this.hitEnemiesAt(p.pos, p.aoe, p.dmg);
        } else {
          if (hitEnt) {
            hitEnt.slowT = Math.max(hitEnt.slowT || 0, p.slow);
            const killed = Entities.damageEntity(hitEnt, p.dmg, p.vel.clone().normalize().multiplyScalar(3).setY(2), true);
            Combat.spawnNumber(p.pos, String(p.dmg), killed ? 'player-hurt' : '');
          } else if (hitDragon) {
            DragonBoss.damage(Math.round(p.dmg * Player.dragonDamageMult()));
          }
          Particles.emit({ pos: p.pos, count: 10, spread: 0.2, velSpread: 3, life: 0.5, size: 0.8, colors: ['#9aeeff', '#ffffff', '#74d6e8'], gravity: 6 });
        }
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // Meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      Particles.fire(m.pos, 3);
      Particles.smoke(m.pos, 1);
      if (m.pos.y <= m.target.y || World.isSolid(m.pos.x, m.pos.y, m.pos.z)) {
        AudioSys.play('explosion');
        Particles.explosion(m.pos, 2.2);
        Game.shake(0.6, 0.7);
        this.hitEnemiesAt(m.pos, m.aoe, m.dmg);
        this.scene.remove(m.mesh);
        m.mesh.material.dispose();
        this.meteors.splice(i, 1);
      }
    }

    // Earth walls crumble after their duration
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      w.t -= dt;
      if (w.t <= 0) {
        if (World.getBlock(w.x, w.y, w.z) === BLOCK.EARTH) {
          World.setBlock(w.x, w.y, w.z, BLOCK.AIR, false);
          Particles.blockBreak(new THREE.Vector3(w.x + 0.5, w.y + 0.5, w.z + 0.5), BLOCK.EARTH);
        }
        this.walls.splice(i, 1);
      }
    }

    // Lightning visuals
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      b.line.material.opacity = Math.max(0, b.t / 0.22);
      if (b.t <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
  },

  /* ---------- spell icons ---------- */
  iconURL(key) {
    if (this.iconCache[key]) return this.iconCache[key];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 40;
    const ctx = cv.getContext('2d');
    const orb = (c1, c2) => {
      const g = ctx.createRadialGradient(20, 20, 2, 20, 20, 16);
      g.addColorStop(0, c2); g.addColorStop(0.6, c1); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 40, 40);
    };
    switch (key) {
      case 'fireball': orb('#ff8c1a', '#fff3a8'); break;
      case 'icespike':
        ctx.fillStyle = '#74d6e8';
        ctx.beginPath(); ctx.moveTo(20, 4); ctx.lineTo(28, 24); ctx.lineTo(20, 36); ctx.lineTo(12, 24); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d8f8ff'; ctx.fillRect(18, 10, 3, 16);
        break;
      case 'heal':
        orb('#3bd95e', '#dfffea');
        ctx.fillStyle = '#fff'; ctx.fillRect(17, 10, 6, 20); ctx.fillRect(10, 17, 20, 6);
        break;
      case 'lightning':
        ctx.fillStyle = '#ffec6e';
        ctx.beginPath(); ctx.moveTo(24, 2); ctx.lineTo(12, 22); ctx.lineTo(19, 22); ctx.lineTo(14, 38); ctx.lineTo(28, 17); ctx.lineTo(21, 17); ctx.closePath(); ctx.fill();
        break;
      case 'dash':
        ctx.fillStyle = '#9aeeff';
        ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(20, 20); ctx.lineTo(8, 32); ctx.lineTo(13, 20); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(20, 8); ctx.lineTo(32, 20); ctx.lineTo(20, 32); ctx.lineTo(25, 20); ctx.closePath(); ctx.fill();
        break;
      case 'earthwall':
        ctx.fillStyle = '#6e5a40';
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          ctx.fillRect(6 + c * 10 + (r % 2) * 3, 10 + r * 9, 9, 8);
        }
        break;
      case 'meteor':
        orb('#d14a2e', '#ffd24d');
        ctx.fillStyle = '#ff8c1a';
        ctx.fillRect(4, 4, 5, 3); ctx.fillRect(8, 7, 4, 3); ctx.fillRect(11, 10, 4, 3);
        break;
    }
    const url = cv.toDataURL();
    this.iconCache[key] = url;
    return url;
  },

  serialize() { return this.state; },
  load(s) {
    if (s && Array.isArray(s.unlocked)) this.state = { unlocked: s.unlocked, levels: s.levels || {}, active: s.active || 0 };
  },
};
