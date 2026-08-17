'use strict';
/* FableCraft — melee combat + floating damage numbers (pooled DOM elements). */

const Combat = {
  attackT: 0,
  numbers: [],
  poolSize: 28,

  init() {
    const layer = document.getElementById('dmg-layer');
    layer.innerHTML = '';
    this.numbers = [];
    for (let i = 0; i < this.poolSize; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      layer.appendChild(el);
      this.numbers.push({ el, alive: false, pos: new THREE.Vector3(), t: 0, vy: 0 });
    }
  },

  spawnNumber(worldPos, text, cls = '') {
    let slot = this.numbers.find(n => !n.alive);
    if (!slot) slot = this.numbers[0];
    slot.alive = true;
    slot.pos.copy(worldPos);
    slot.pos.x += (Math.random() - 0.5) * 0.5;
    slot.t = 1.0;
    slot.vy = 1.6;
    slot.el.textContent = text;
    slot.el.className = 'dmg-num ' + cls;
    slot.el.style.display = 'block';
  },

  tryAttack() {
    if (this.attackT > 0 || Player.dead) return;
    this.attackT = 0.45;
    AudioSys.play('swing');
    Game.swingArm();

    const eye = Player.eye();
    const look = Player.lookDir();
    const dmg = Player.attackDamage();

    // Nearest enemy in front of us
    let best = null, bestDist = 3.8;
    for (const e of Entities.list) {
      if (e.dead || e.dying > 0) continue;
      const c = e.pos.clone().add(new THREE.Vector3(0, e.h * 0.55, 0));
      const to = c.sub(eye);
      const d = to.length();
      if (d > bestDist) continue;
      if (to.normalize().dot(look) < 0.55) continue;
      best = e; bestDist = d;
    }
    if (best) {
      const kn = look.clone().setY(0).normalize().multiplyScalar(6);
      kn.y = 3.5;
      const killed = Entities.damageEntity(best, dmg, kn, true);
      this.spawnNumber(best.pos.clone().add(new THREE.Vector3(0, best.h + 0.2, 0)), String(dmg), killed ? 'player-hurt' : '');
      return;
    }

    // The dragon (Dragon Slayer potions amplify this)
    if (DragonBoss.active && !DragonBoss.dead) {
      for (const p of DragonBoss.getTargetPoints()) {
        const to = p.clone().sub(eye);
        const d = to.length();
        if (d < 5.2 && to.normalize().dot(look) > 0.45) {
          const dragonDmg = Math.round(dmg * Player.dragonDamageMult());
          DragonBoss.damage(dragonDmg);
          this.spawnNumber(p, String(dragonDmg), '');
          return;
        }
      }
    }
  },

  update(dt, camera, w, h) {
    if (this.attackT > 0) this.attackT -= dt;
    const v = new THREE.Vector3();
    for (const n of this.numbers) {
      if (!n.alive) continue;
      n.t -= dt;
      if (n.t <= 0) { n.alive = false; n.el.style.display = 'none'; continue; }
      n.pos.y += n.vy * dt;
      n.vy *= 0.94;
      v.copy(n.pos).project(camera);
      if (v.z > 1 || v.z < -1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = 'block';
      n.el.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
      n.el.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
      n.el.style.opacity = Math.min(1, n.t * 2.5);
    }
  },
};
