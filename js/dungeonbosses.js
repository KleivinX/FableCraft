'use strict';
/* FableCraft — the two dungeon guardians.

   Bone Warden   (Catacombs)     — summons the dead, hurls bone shrapnel, slams the floor.
   Tide Warden   (Sunken Temple) — drags you in with a whirlpool, fires water lances,
                                   and floods the chamber with drowned crawlers.

   Both are ordinary entities under the hood, so melee and every spell already damage
   them; this module only adds the arrival trigger, the special attacks and the reward. */

const DungeonBosses = {
  active: null,     // { e, kind, key, name, phase, timers }
  defeated: {},     // "x,z" -> true, persisted with the save
  checkT: 0,

  KINDS: {
    catacomb: {
      type: 'warden', name: 'THE BONE WARDEN',
      intro: 'The bones of the crypt gather themselves.',
      minion: 'skeleton', minionName: 'risen dead',
      colors: ['#e4e0cf', '#b8b0a0', '#6d6a5a'],
      loot: [ITEM.D_HELM, ITEM.CRYSTAL_SWORD, ITEM.AMULET_REGEN, ITEM.SPELL_BOOK],
    },
    sunken: {
      type: 'leviathan', name: 'THE TIDE WARDEN',
      intro: 'The water stirs. Something ancient uncoils.',
      minion: 'spider', minionName: 'drowned crawlers',
      colors: ['#2ad4e8', '#9fe8dc', '#1d5f6b'],
      loot: [ITEM.D_CHEST, ITEM.STAFF, ITEM.RING_FOCUS, ITEM.SPELL_BOOK],
    },
  },

  init() { this.active = null; this.checkT = 0; },

  key(d) { return d.x + ',' + d.z; },
  isDefeated(d) { return !!this.defeated[this.key(d)]; },

  serialize() { return this.defeated; },
  load(data) { this.defeated = data || {}; },

  /* ---------------- arrival ---------------- */
  update(dt) {
    if (this.active) { this.fight(dt); return; }
    if (Player.dead || Arena.active) return;

    // Cheap proximity poll: only look for a dungeon a few times a second
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.4;

    const near = Dungeons.nearest(Player.pos.x, Player.pos.z, 40);
    if (!near || near.dist > 11) return;
    const d = near.dungeon;
    if (this.isDefeated(d)) return;

    // Only wake once the player is actually down in the chamber
    const room = d.type === 'catacomb'
      ? { y: Math.max(5, d.h - 17) + 2, span: 7 }
      : { y: d.h + 3, span: 6 };
    if (Math.abs(Player.pos.y - room.y) > 6) return;

    this.begin(d, room);
  },

  begin(d, room) {
    const K = this.KINDS[d.type];
    // Place the guardian across the chamber from the player
    const away = new THREE.Vector3(d.x + 0.5 - Player.pos.x, 0, d.z + 0.5 - Player.pos.z);
    if (away.lengthSq() < 0.1) away.set(1, 0, 0);
    away.normalize().multiplyScalar(4.5);
    const e = Entities.spawnEnemy(K.type, d.x + 0.5 + away.x, room.y, d.z + 0.5 + away.z, { arena: true });
    e.boss = true;

    this.active = {
      e, kind: d.type, key: this.key(d), dungeon: d, name: K.name,
      phase: 1, summonT: 6, rangedT: 3.5, slamT: 5, pullT: 7, roomY: room.y,
    };
    UI.bossBar(1, K.name);
    UI.banner(K.name, K.intro, 3.4);
    AudioSys.play('roar');
    AudioSys.setTrack('boss');
    Game.shake(0.35, 1.2);
    Particles.emit({
      pos: e.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
      count: 40, spread: 1.2, velSpread: 4, life: 1.2, size: 1.4,
      colors: K.colors, gravity: -1,
    });
  },

  /* ---------------- the fight ---------------- */
  fight(dt) {
    const A = this.active, e = A.e;

    if (Player.dead) { this.retreat(); return; }
    if (e.dead || e.dying > 0) { this.victory(); return; }

    // Leaving the chamber ends the encounter and resets the guardian
    const dist = Utils.dist2D(Player.pos.x, Player.pos.z, A.dungeon.x, A.dungeon.z);
    if (dist > 26 || Math.abs(Player.pos.y - A.roomY) > 14) { this.retreat(); return; }

    const frac = Math.max(0, e.hp / e.maxHp);
    UI.bossBar(frac, A.phase === 2 ? A.name + ' — ENRAGED' : A.name);

    // Half health: faster, angrier, glowing brighter
    if (A.phase === 1 && frac <= 0.5) {
      A.phase = 2;
      e.speed *= 1.3;
      e.dmg = Math.round(e.dmg * 1.25);
      UI.banner(A.name + ' RAGES', '', 2);
      AudioSys.play('roar');
      Game.shake(0.4, 1);
    }
    const rate = A.phase === 2 ? 0.68 : 1;
    const K = this.KINDS[A.kind];
    const toPlayer = new THREE.Vector3().subVectors(Player.pos, e.pos);
    const gap = toPlayer.length();

    // --- Summon reinforcements ---
    A.summonT -= dt;
    if (A.summonT <= 0) {
      A.summonT = (A.phase === 2 ? 9 : 13) * rate;
      let spawned = 0;
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const sx = e.pos.x + Math.cos(a) * 3, sz = e.pos.z + Math.sin(a) * 3;
        if (World.isSolid(sx, A.roomY, sz)) continue;
        const m = Entities.spawnEnemy(K.minion, sx, A.roomY, sz, { arena: true });
        m.bossMinion = true;
        Particles.emit({ pos: m.pos.clone().add(new THREE.Vector3(0, 1, 0)), count: 12, spread: 0.5,
                         velSpread: 2.5, life: 0.8, size: 1, colors: K.colors, gravity: -2 });
        spawned++;
      }
      if (spawned) {
        UI.message(`The warden calls up ${K.minionName}!`, 2);
        AudioSys.play(A.kind === 'catacomb' ? 'skeleton' : 'spider');
      }
    }

    // --- Ranged volley: shrapnel or water lances along the line of sight ---
    A.rangedT -= dt;
    if (A.rangedT <= 0 && gap > 3 && gap < 18) {
      A.rangedT = (A.phase === 2 ? 2.4 : 3.6) * rate;
      const from = e.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
      const dir = toPlayer.clone().normalize();
      for (let i = 1; i <= 10; i++) {
        Particles.emit({
          pos: from.clone().addScaledVector(dir, i * (gap / 10)),
          count: 3, spread: 0.3, velSpread: 1.2, life: 0.5, size: 1.1,
          colors: K.colors, gravity: A.kind === 'sunken' ? 1 : 4,
        });
      }
      AudioSys.play(A.kind === 'sunken' ? 'splash' : 'arrow');
      // Only lands if the player is roughly in front of the guardian and not behind cover
      const facing = dir.dot(new THREE.Vector3(Player.pos.x - e.pos.x, 0, Player.pos.z - e.pos.z).normalize());
      if (facing > 0.6 && !World.rayBlocked(from, Player.eye())) {
        Player.damage(Math.round(e.dmg * 0.6), null, A.kind === 'sunken' ? 'the Tide Warden' : 'the Bone Warden');
      }
    }

    // --- Ground slam: a telegraphed shockwave when you crowd it ---
    A.slamT -= dt;
    if (A.slamT <= 0 && gap < 6.5) {
      A.slamT = (A.phase === 2 ? 4.5 : 6.5) * rate;
      const c = e.pos.clone();
      Particles.emit({ pos: c.clone().add(new THREE.Vector3(0, 0.3, 0)), count: 46, spread: 2.4,
                       velSpread: 6, life: 0.9, size: 1.5, colors: K.colors, gravity: 7 });
      Game.shake(0.5, 0.7);
      AudioSys.play('explosion');
      if (Utils.dist2D(Player.pos.x, Player.pos.z, c.x, c.z) < 5 && Math.abs(Player.pos.y - c.y) < 4) {
        const push = new THREE.Vector3(Player.pos.x - c.x, 0, Player.pos.z - c.z).normalize().multiplyScalar(9);
        Player.damage(e.dmg, new THREE.Vector3(push.x, 6, push.z),
          A.kind === 'sunken' ? 'the Tide Warden' : 'the Bone Warden');
      }
    }

    // --- Whirlpool: the Tide Warden hauls you back into reach ---
    if (A.kind === 'sunken') {
      A.pullT -= dt;
      if (A.pullT <= 0 && gap > 3.5) {
        A.pullT = (A.phase === 2 ? 6 : 9) * rate;
        A.pulling = 1.6;
        UI.message('The whirlpool drags you in!', 1.8);
        AudioSys.play('splash');
      }
      if (A.pulling > 0) {
        A.pulling -= dt;
        const pull = new THREE.Vector3().subVectors(e.pos, Player.pos).normalize().multiplyScalar(11 * dt);
        Player.vel.x += pull.x;
        Player.vel.z += pull.z;
        Particles.emit({ pos: Player.pos.clone().add(new THREE.Vector3(0, 1, 0)), count: 2, spread: 0.6,
                         velSpread: 2, life: 0.5, size: 0.9, colors: K.colors, gravity: -1 });
      }
    }

    // Eyes pulse while it is alive
    const glow = 0.9 + Math.sin(performance.now() / 160) * 0.5;
    for (const m of e.mats) if (m.emissive && m.emissiveIntensity !== undefined) m.emissiveIntensity = glow;
  },

  /* ---------------- outcomes ---------------- */
  victory() {
    const A = this.active;
    this.active = null;
    this.defeated[A.key] = true;
    UI.bossBar(null);
    AudioSys.setTrack('overworld');

    const K = this.KINDS[A.kind];
    const at = A.e.pos.clone().add(new THREE.Vector3(0, 1, 0));
    UI.banner(A.name + ' FALLS', 'The guardian crumbles — take what it hoarded.', 4);
    Particles.firework(at, K.colors[0]);
    Game.shake(0.4, 1);

    // Reward: coins, XP and one guaranteed piece of high-tier gear
    Player.addCoins(650);
    Game.stats.coinsEarned += 650;
    Player.addXP(A.kind === 'sunken' ? 1400 : 1100);
    for (const id of K.loot) Entities.spawnDrop(at.clone(), { item: id, count: 1 });
    Entities.spawnDrop(at.clone(), { item: ITEM.POT_HEALTH, count: 3 });
    Quests.onBossKill && Quests.onBossKill(A.kind);
    SaveSys.save();
  },

  // Player fled or died — clear the fight so the dungeon can be attempted again
  retreat() {
    const A = this.active;
    this.active = null;
    UI.bossBar(null);
    AudioSys.setTrack('overworld');
    if (A && A.e && !A.e.dead && A.e.dying <= 0) {
      Entities.removeEntity ? Entities.removeEntity(A.e) : (A.e.hp = 0, A.e.dying = 0.001);
    }
    for (const m of Entities.list) if (m.bossMinion && !m.dead) m.dying = m.dying || 0.001;
  },
};
