'use strict';
/* FableCraft — WAVE ARENA: portal travel, 3 enemy waves, boss warning, dragon fight,
   victory rewards and the Champion Portal home. */

const Arena = {
  active: false,
  phase: 'idle', // idle | intro | wave | reward | bosswarn | boss | done
  wave: 0,
  remaining: 0,
  spawnQueue: [],
  spawnT: 0,
  phaseT: 0,
  portalCd: 0,
  fireworks: [],
  shakeLoop: 0,

  WAVES: [
    { zombies: 5,  skeletons: 0, spiders: 0, xp: 50,  coins: 100 },
    { zombies: 10, skeletons: 2, spiders: 0, xp: 100, coins: 250 },
    { zombies: 15, skeletons: 5, spiders: 3, xp: 250, coins: 500 },
  ],

  init() {
    this.active = false;
    this.phase = 'idle';
    this.wave = 0;
    this.fireworks = [];
  },

  inBox(p, b) {
    return p.x >= b.minX && p.x <= b.maxX && p.y + 0.9 >= b.minY && p.y + 0.9 <= b.maxY && p.z >= b.minZ && p.z <= b.maxZ;
  },

  update(dt) {
    if (this.portalCd > 0) this.portalCd -= dt;

    // Overworld portal trigger
    if (!this.active && this.portalCd <= 0 && !Player.dead && World.PORTAL && this.inBox(Player.pos, World.PORTAL.trigger)) {
      this.enter();
      return;
    }

    if (!this.active) return;

    // Champion portal trigger
    if (World.championPortal && this.portalCd <= 0 && this.inBox(Player.pos, World.championPortal.trigger)) {
      this.exitToOverworld();
      return;
    }

    this.confinePlayer();

    this.phaseT -= dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT <= 0) this.startWave(1);
        break;

      case 'wave':
        if (this.spawnQueue.length > 0) {
          this.spawnT -= dt;
          if (this.spawnT <= 0) {
            this.spawnT = 0.7;
            this.spawnArenaEnemy(this.spawnQueue.shift());
          }
        }
        break;

      case 'reward':
        if (this.phaseT <= 0) {
          if (this.wave < 3) this.startWave(this.wave + 1);
          else this.startBossWarning();
        }
        break;

      case 'bosswarn':
        this.shakeLoop -= dt;
        if (this.shakeLoop <= 0) { this.shakeLoop = 0.3; Game.shake(0.35, 0.35); }
        if (this.phaseT <= 0) {
          UI.setDarken(0);
          this.phase = 'boss';
          DragonBoss.spawn(Game.scene);
          UI.waveInfo('SLAY THE DRAGON');
        }
        break;

      case 'done':
        for (let i = this.fireworks.length - 1; i >= 0; i--) {
          const fw = this.fireworks[i];
          fw.t -= dt;
          if (fw.t <= 0) {
            Particles.firework(fw.pos, fw.color);
            this.fireworks.splice(i, 1);
          }
        }
        break;
    }
  },

  confinePlayer() {
    // Player cannot leave the arena
    const A = World.ARENA;
    const dx = Player.pos.x - A.x, dz = Player.pos.z - A.z;
    const r = Math.hypot(dx, dz);
    if (r > 19) {
      const f = 19 / r;
      Player.pos.x = A.x + dx * f;
      Player.pos.z = A.z + dz * f;
      const outward = new THREE.Vector3(dx / r, 0, dz / r);
      const vDot = Player.vel.x * outward.x + Player.vel.z * outward.z;
      if (vDot > 0) { Player.vel.x -= outward.x * vDot; Player.vel.z -= outward.z * vDot; }
    }
    if (Player.pos.y > A.floor + 16) {
      Player.pos.y = A.floor + 16;
      if (Player.vel.y > 0) Player.vel.y = 0;
    }
  },

  enter() {
    this.portalCd = 4;
    AudioSys.play('portal');
    UI.fadeOut(() => {
      const A = World.ARENA;
      World.forceArea(A.x, A.z, 3);
      World.removeChampionPortal();
      Game.refreshWorldLabels();
      Entities.clearAll();
      Player.teleport(World.arenaSpawn);
      Player.yaw = 0; // spawn is on the +Z side; yaw 0 looks toward -Z, into the arena center
      Player.pitch = 0;
      this.active = true;
      this.phase = 'intro';
      this.phaseT = 4;
      this.wave = 0;
      AudioSys.setTrack('arena');
      UI.banner('WAVE ARENA', 'Survive 3 waves... then face the Dragon', 3.5);
      UI.waveInfo('PREPARE FOR BATTLE');
    });
  },

  startWave(n) {
    this.wave = n;
    const w = this.WAVES[n - 1];
    this.spawnQueue = [];
    for (let i = 0; i < w.zombies; i++) this.spawnQueue.push('zombie');
    for (let i = 0; i < w.skeletons; i++) this.spawnQueue.push('skeleton');
    for (let i = 0; i < w.spiders; i++) this.spawnQueue.push('spider');
    // Shuffle
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    this.remaining = this.spawnQueue.length;
    this.spawnT = 1;
    this.phase = 'wave';
    AudioSys.play('wave');
    UI.banner(`WAVE ${n}`, `${this.remaining} enemies approach`, 2.5);
    UI.waveInfo(`WAVE ${n} — ENEMIES LEFT: ${this.remaining}`);
  },

  spawnArenaEnemy(type) {
    const A = World.ARENA;
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 11;
    const x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r;
    const e = Entities.spawnEnemy(type, x, A.floor + 1.2, z, { arena: true });
    Particles.smoke(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 8);
  },

  notifyKill() {
    if (!this.active || this.phase !== 'wave') return;
    this.remaining--;
    UI.waveInfo(`WAVE ${this.wave} — ENEMIES LEFT: ${Math.max(0, this.remaining)}`);
    if (this.remaining <= 0 && this.spawnQueue.length === 0) this.completeWave();
  },

  completeWave() {
    const w = this.WAVES[this.wave - 1];
    Game.stats.waves++;
    Player.addXP(w.xp);
    Player.addCoins(w.coins);
    Game.stats.coinsEarned += w.coins;
    AudioSys.play('levelup');
    UI.banner(`WAVE ${this.wave} CLEARED`, `+${w.xp} XP   +${w.coins} coins`, 3);
    UI.waveInfo(this.wave < 3 ? 'NEXT WAVE INCOMING...' : '...');
    this.phase = 'reward';
    this.phaseT = 5;
  },

  startBossWarning() {
    this.phase = 'bosswarn';
    this.phaseT = 4.5;
    this.shakeLoop = 0;
    UI.setDarken(0.55);
    UI.banner('THE DRAGON AWAKENS', '', 4);
    UI.waveInfo('');
    AudioSys.play('roar');
    AudioSys.setTrack('boss');
  },

  victory(dropPos) {
    this.phase = 'done';
    Game.dragonDefeated = true;
    Game.stats.dragonKills++;
    AudioSys.setTrack('victory');
    UI.banner('FABLECRAFT CHAMPION', 'The Dragon has fallen!', 4);
    UI.waveInfo('');
    // Dragon rewards
    Player.addXP(5000);
    Player.addCoins(1000);
    Game.stats.coinsEarned += 1000;
    Entities.spawnDrop(dropPos.clone(), { coins: 10 });
    Spells.unlock('meteor'); // the ultimate spell is the champion's prize
    // Fireworks over the arena
    const A = World.ARENA;
    const colors = ['#ff5c5c', '#ffd34d', '#5eff7e', '#5ec9ff', '#b14df0'];
    this.fireworks = [];
    for (let i = 0; i < 12; i++) {
      this.fireworks.push({
        t: 0.8 + i * 0.55,
        pos: new THREE.Vector3(A.x + (Math.random() - 0.5) * 26, A.floor + 14 + Math.random() * 8, A.z + (Math.random() - 0.5) * 26),
        color: colors[i % colors.length],
      });
    }
    World.buildChampionPortal();
    setTimeout(() => { if (this.phase === 'done') UI.showVictory(); }, 2600);
    SaveSys.save();
  },

  exitToOverworld() {
    this.portalCd = 4;
    AudioSys.play('portal');
    UI.fadeOut(() => {
      Entities.clearAll(true);
      DragonBoss.cleanup(Game.scene);
      this.active = false;
      this.phase = 'idle';
      UI.waveInfo(null);
      UI.setDarken(0);
      World.forceArea(World.spawnPoint.x, World.spawnPoint.z, 2);
      Player.teleport(World.spawnPoint);
      AudioSys.setTrack('overworld');
      const first = !World.monumentBuilt;
      World.buildMonument();
      Game.refreshWorldLabels();
      UI.banner('DRAGON CONQUEROR', first ? 'A monument has been raised in your honor' : 'Welcome home, Champion', 4);
      SaveSys.save();
    });
  },

  // Called when the player dies inside the arena
  abort() {
    if (!this.active) return;
    this.active = false;
    this.phase = 'idle';
    Entities.clearAll(true);
    DragonBoss.cleanup(Game.scene);
    UI.waveInfo(null);
    UI.bossBar(null);
    UI.setDarken(0);
    this.portalCd = 5;
  },
};
