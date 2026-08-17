'use strict';
/* FableCraft — player: movement, swimming & oxygen, mana, buffs, equipment stats,
   damage with armor reduction, XP/levels. */

const Player = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  w: 0.6, h: 1.8, EYE: 1.62,
  yaw: 0, pitch: 0,
  onGround: false, inWater: false, headUnder: false, wasInWater: false, onLadder: false,
  health: 100, maxHealth: 100,
  stamina: 100, maxStamina: 100,
  mana: 100, maxMana: 100, manaRegen: 4,
  oxygen: 10, maxOxygen: 10, drownT: 0,
  xp: 0, level: 1, coins: 0,
  buffs: { speed: 0, strength: 0, regen: 0, fireres: 0, dragon: 0 },
  dead: false,
  invuln: 0,
  sprintBlocked: false,
  fallPeakY: 0,
  stepDist: 0,
  swimSoundT: 0,
  deathAnim: 0,
  JUMP_COST: 11,     // a real cost, so jump-spamming actually runs you down
  staminaHold: 0,    // pause on regeneration right after a jump

  init() {
    this.pos.copy(World.spawnPoint);
    this.vel.set(0, 0, 0);
    this.fallPeakY = this.pos.y;
    this.buffs = { speed: 0, strength: 0, regen: 0, fireres: 0, dragon: 0 };
    this.applyEquipment();
    this.health = this.maxHealth;
    this.mana = this.maxMana;
  },

  // Recompute derived stats from level + equipment
  applyEquipment() {
    const b = Equipment.bonuses();
    this.maxHealth = 100 + (this.level - 1) * 10 + (b.maxHp || 0);
    this.maxMana = 100 + (b.maxMana || 0);
    this.manaRegen = 4 + (b.manaRegen || 0);
    this.health = Math.min(this.health, this.maxHealth);
    this.mana = Math.min(this.mana, this.maxMana);
  },

  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.EYE, this.pos.z); },

  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  },

  update(dt, input) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dead) { this.deathAnim = Math.min(1, this.deathAnim + dt * 1.4); return; }
    if (!World.isLoadedAt(this.pos.x, this.pos.z)) return;

    // Buff timers + regeneration effects
    for (const k of Object.keys(this.buffs)) if (this.buffs[k] > 0) this.buffs[k] -= dt;
    const eq = Equipment.bonuses();
    let hpRegen = (eq.hpRegen || 0) + (this.buffs.regen > 0 ? 3 : 0);
    if (hpRegen > 0) this.heal(hpRegen * dt);
    this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);

    // Water / ladder state
    const feetBlock = World.getBlock(this.pos.x, this.pos.y + 0.4, this.pos.z);
    const eyeBlock = World.getBlock(this.pos.x, this.pos.y + this.EYE, this.pos.z);
    this.inWater = feetBlock === BLOCK.WATER || eyeBlock === BLOCK.WATER;
    this.headUnder = eyeBlock === BLOCK.WATER;
    this.onLadder = World.isClimbable(this.pos.x, this.pos.y + 0.4, this.pos.z) ||
                    World.isClimbable(this.pos.x, this.pos.y + 1.2, this.pos.z);
    if (this.inWater && !this.wasInWater && this.vel.y < -3) AudioSys.play('splash');
    this.wasInWater = this.inWater;

    // Oxygen & drowning
    if (this.headUnder) {
      this.oxygen = Math.max(0, this.oxygen - dt);
      if (this.oxygen <= 0) {
        this.drownT -= dt;
        if (this.drownT <= 0) {
          this.drownT = 1;
          this.invuln = 0; // drowning ignores hit invulnerability
          this.damage(5, null, 'the deep water');
        }
      }
      if (Math.random() < dt * 2) {
        Particles.emit({
          pos: this.eye().add(new THREE.Vector3(0, 0.2, 0)), count: 2, spread: 0.2,
          vel: new THREE.Vector3(0, 2, 0), velSpread: 0.5, life: 0.8, size: 0.5,
          colors: ['#bcdcff', '#e8f4ff'], gravity: -3,
        });
      }
    } else {
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 2.5);
      this.drownT = 0;
    }

    // Desired horizontal movement
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = fx * input.f + rx * input.s;
    let mz = fz * input.f + rz * input.s;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const moving = ml > 0.01;

    // Sprint & stamina. Regeneration pauses briefly after a jump, otherwise the
    // cost is refunded before you land and jumping is effectively free.
    let sprinting = false;
    if (this.staminaHold > 0) this.staminaHold -= dt;
    if (input.sprint && moving && !this.inWater && !this.sprintBlocked && this.stamina > 1) {
      sprinting = true;
      this.stamina = Math.max(0, this.stamina - 14 * dt);
      if (this.stamina <= 0.5) this.sprintBlocked = true;
    } else if (this.staminaHold <= 0) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 9 * dt);
      if (this.stamina > 12) this.sprintBlocked = false;
    }

    let speed = sprinting ? 6.8 : 4.3;
    if (this.buffs.speed > 0) speed *= 1.45;
    if (this.inWater) speed *= 0.55;

    const accel = this.onGround ? 13 : 4.5;
    this.vel.x = Utils.lerp(this.vel.x, mx * speed, Math.min(1, accel * dt));
    this.vel.z = Utils.lerp(this.vel.z, mz * speed, Math.min(1, accel * dt));

    // Vertical: ladders > water > gravity
    if (this.onLadder && !this.inWater) {
      const climb = (input.f > 0 || input.jump) ? 3 : (input.f < 0 ? -3 : Math.max(this.vel.y, -1.5));
      this.vel.y = Utils.lerp(this.vel.y, climb, Math.min(1, 12 * dt));
      this.fallPeakY = this.pos.y;
    } else if (this.inWater) {
      // Standing on the bottom of shallow water: jump normally instead of being
      // forced into the slow swim-rise, which used to feel like being stuck.
      const shallow = this.onGround && !this.headUnder;
      if (input.jump && shallow && this.stamina > this.JUMP_COST) {
        this.jump();
      } else {
        this.vel.y = Utils.lerp(this.vel.y, input.jump ? 4 : -2.6, Math.min(1, 5 * dt));
        // At the surface, pushing into a bank hauls you up onto it rather than
        // bobbing against the edge forever.
        if (input.jump && !this.headUnder && moving && this.ledgeAhead(mx, mz)) {
          this.vel.y = 7.4;
          this.vel.x += mx * 2.6;
          this.vel.z += mz * 2.6;
        }
      }
      this.fallPeakY = this.pos.y;
      if (moving || input.jump) {
        this.swimSoundT -= dt;
        if (this.swimSoundT <= 0) { this.swimSoundT = 0.7; AudioSys.play('swim'); }
      }
    } else {
      this.vel.y -= 24 * dt;
      if (this.vel.y < -50) this.vel.y = -50;
      if (input.jump && this.onGround && this.stamina > this.JUMP_COST) this.jump();
    }

    const wasGround = this.onGround;
    World.moveEntity(this, dt);

    // Fall damage
    if (!this.onGround) {
      this.fallPeakY = Math.max(this.fallPeakY, this.pos.y);
    } else if (!wasGround) {
      const fall = this.fallPeakY - this.pos.y;
      if (fall > 4.5 && !this.inWater) {
        this.damage(Math.floor((fall - 4) * 3), null, 'a hard fall');
        AudioSys.play('land');
      } else if (fall > 1.5) {
        AudioSys.play('land');
      }
      this.fallPeakY = this.pos.y;
    }

    // Footsteps
    if (this.onGround && moving) {
      this.stepDist += Math.hypot(this.vel.x, this.vel.z) * dt;
      if (this.stepDist > 2.2) { this.stepDist = 0; AudioSys.play('step'); }
    }

    if (this.pos.y < -10) this.teleport(World.spawnPoint);
  },

  jump() {
    this.vel.y = 8.4;
    this.stamina = Math.max(0, this.stamina - this.JUMP_COST);
    this.staminaHold = 0.55;
    if (this.stamina <= 0.5) this.sprintBlocked = true;
    AudioSys.play('jump');
  },

  // Is there a block to climb onto in the direction of travel?
  ledgeAhead(mx, mz) {
    const len = Math.hypot(mx, mz);
    if (len < 0.01) return false;
    const dx = (mx / len) * 0.7, dz = (mz / len) * 0.7;
    const x = this.pos.x + dx, z = this.pos.z + dz;
    const step = Math.floor(this.pos.y + 0.6);
    return World.isSolid(x, step, z) && !World.isSolid(x, step + 1, z) && !World.isSolid(x, step + 2, z);
  },

  teleport(v) {
    this.pos.copy(v);
    this.vel.set(0, 0, 0);
    this.fallPeakY = this.pos.y;
  },

  damage(amount, knock, cause) {
    if (this.dead || this.invuln > 0 || amount <= 0) return;
    // Armor + resistances
    const fire = /fire|dragon/.test(cause || '');
    let dmg = amount * (1 - Equipment.damageReduction());
    if (fire && this.buffs.fireres > 0) dmg *= 0.4;
    dmg = Math.max(1, Math.round(dmg));

    this.invuln = 0.6;
    this.health -= dmg;
    if (knock) {
      const kr = Equipment.bonuses().knockResist || 0;
      this.vel.addScaledVector(knock, Math.max(0.2, 1 - kr));
    }
    UI.vignetteFlash();
    AudioSys.play('hurt');
    Combat.spawnNumber(this.eye().add(new THREE.Vector3(0, 0.3, 0)), '-' + dmg, 'player-hurt');
    if (this.health <= 0) {
      this.health = 0;
      this.die(cause || 'the wilderness');
    }
  },

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); },

  drinkPotion(item) {
    const p = item.potion;
    AudioSys.play('drink');
    if (p.hp) {
      this.heal(p.hp);
      Combat.spawnNumber(this.eye(), '+' + p.hp, 'heal');
    } else if (p.mana) {
      this.mana = Math.min(this.maxMana, this.mana + p.mana);
    } else if (p.stamina) {
      this.stamina = this.maxStamina;
      this.sprintBlocked = false;
    } else if (p.buff) {
      this.buffs[p.buff] = Math.max(this.buffs[p.buff], p.dur);
      UI.message(`${item.name} active for ${p.dur}s`, 2);
    }
    Particles.emit({
      pos: this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
      count: 10, spread: 0.4, velSpread: 1.2, life: 0.7, size: 0.6,
      colors: [item.color, '#ffffff'], gravity: -2,
    });
  },

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathAnim = 0;
    AudioSys.play('playerdie');
    Game.onPlayerDeath(cause);
  },

  respawn() {
    this.dead = false;
    this.deathAnim = 0;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.oxygen = this.maxOxygen;
    this.invuln = 2;
    this.teleport(World.spawnPoint);
  },

  xpNeeded(lv) { return Math.floor(60 * Math.pow(lv, 1.4)); },

  addXP(n) {
    if (n <= 0) return;
    this.xp += n;
    AudioSys.play('xp');
    while (this.xp >= this.xpNeeded(this.level)) {
      this.xp -= this.xpNeeded(this.level);
      this.level++;
      this.applyEquipment();
      this.heal(25);
      AudioSys.play('levelup');
      UI.message(`Level up! You are now level ${this.level} (+10 max HP, +1 damage)`, 3.5);
      Particles.levelUp(this.pos.clone().add(new THREE.Vector3(0, 1, 0)));
      Spells.onLevel(this.level);
      // Reaching level 10 conjures a one-time treasure chest with the best loot
      if (this.level >= 10 && !Game.level10ChestGiven) {
        Game.level10ChestGiven = true;
        Chests.spawnReward();
      }
    }
  },

  addCoins(n) {
    this.coins += n;
    if (n > 0) AudioSys.play('coin');
  },

  attackDamage() {
    let dmg = 5 + (this.level - 1);
    const held = Inv.selectedItem();
    const heldDmg = (held && held.kind === 'tool') ? held.tool.dmg : 0;
    const equipped = Equipment.weaponDamage();
    dmg += Math.max(heldDmg, equipped) * (1 + Equipment.smith.weapon * 0.06);
    const b = Equipment.bonuses();
    let mult = 1 + (b.dmgMult || 0);
    if (this.buffs.strength > 0) mult += 0.3;
    return Math.round(dmg * mult);
  },

  dragonDamageMult() { return this.buffs.dragon > 0 ? 1.5 : 1; },

  toolSpeedFor(def) {
    const item = Inv.selectedItem();
    if (item && item.kind === 'tool' && def.tool && item.tool.type === def.tool) {
      return item.tool.speed;
    }
    return 1;
  },

  pickaxeTier() {
    const item = Inv.selectedItem();
    if (item && item.kind === 'tool' && item.tool.type === 'pickaxe') return item.tool.tier;
    return 0;
  },

  serialize() {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z],
      yaw: this.yaw, pitch: this.pitch,
      health: this.health, maxHealth: this.maxHealth,
      stamina: this.stamina, mana: this.mana,
      xp: this.xp, level: this.level, coins: this.coins,
    };
  },

  load(d) {
    if (!d) return;
    this.pos.set(d.pos[0], d.pos[1], d.pos[2]);
    this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
    this.health = d.health;
    this.stamina = d.stamina;
    this.mana = d.mana !== undefined ? d.mana : 100;
    this.xp = d.xp; this.level = d.level; this.coins = d.coins;
    this.fallPeakY = this.pos.y;
    this.applyEquipment();
    this.health = Math.min(this.health, this.maxHealth);
  },
};
