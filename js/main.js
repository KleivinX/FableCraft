'use strict';
/* FableCraft — main: bootstrap, game loop, day/night & weather, input with rebindable keys,
   mining/placing/interacting, first-person arm, camera and world effects. */

const Game = {
  settings: {
    sensitivity: 1, renderDist: 4,
    volMaster: 0.8, volMusic: 0.55, volSfx: 0.9,
    quality: 2, uiScale: 1, colorblind: false, subtitles: true,
  },
  stats: { playtime: 0, kills: 0, mined: 0, placed: 0, waves: 0, damageDealt: 0, coinsEarned: 0, dragonKills: 0 },
  dayTime: 0.3, DAY_LEN: 600,
  isNight: false,
  started: false,
  bootDone: false,
  starting: false,
  dragonDefeated: false,
  level10ChestGiven: false,

  BINDS_DEF: [
    ['forward', 'KeyW', 'Move Forward'],
    ['back', 'KeyS', 'Move Back'],
    ['left', 'KeyA', 'Strafe Left'],
    ['right', 'KeyD', 'Strafe Right'],
    ['jump', 'Space', 'Jump / Swim Up'],
    ['sprint', 'ShiftLeft', 'Sprint'],
    ['inventory', 'KeyE', 'Inventory'],
    ['cast', 'KeyF', 'Cast Spell'],
    ['cycleSpell', 'KeyR', 'Next Spell'],
    ['quests', 'KeyJ', 'Quest Log'],
    ['thirdPerson', 'KeyV', 'Third-person View'],
    ['drop', 'KeyQ', 'Drop Held Item'],
  ],
  binds: {},
  rebinding: null,
  thirdPerson: false,

  scene: null, camera: null, renderer: null, clock: null,
  ambient: null, sunLight: null, moonLight: null,
  sunSprite: null, moonSprite: null, stars: null,
  highlight: null,
  heldGroup: null, itemMount: null, armGroup: null, heldKey: null,
  torchLights: [], torchT: 0,
  portalLight: null, playerLight: null,
  labels: [],
  tileTexCache: {},

  keys: {},
  mineHold: false, placeHold: false, placeT: 0,
  mineKey: null, mineProg: 0, mineSoundT: 0, tierMsgT: 0,
  armAnim: { kind: null, t: 0, dur: 1 },
  bobPhase: 0,
  shakeI: 0, shakeT: 0, shakeDur: 1,
  deathTimer: -1, deathCause: '',
  saveData: null,

  COL_DAY: new THREE.Color(0x87ceeb),
  COL_NIGHT: new THREE.Color(0x070a1c),
  COL_DAWN: new THREE.Color(0xff9a5c),
  COL_WATER: new THREE.Color(0x123a78),
  COL_WHITE: new THREE.Color(0xffffff),
  skyCol: new THREE.Color(),

  bindLabel(action) {
    const code = this.binds[action] || '?';
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift');
  },

  /* ================= BOOT ================= */
  boot() {
    for (const [action, code] of this.BINDS_DEF) this.binds[action] = code;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a1c);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Staged start-up so the loading bar reports real work instead of guessing
    UI.startTips();
    UI.setLoading(6, 'Waking the world engine');
    this.runStages([
      [22, 'Painting block textures', () => { Blocks.build(); UI.applyDirtBackdrop(); }],
      [38, 'Forging items and tools', () => Items.build()],
      [54, 'Hanging the sun and stars', () => this.buildSky()],
      [68, 'Kindling the torches', () => this.buildSceneProps()],
      [84, 'Conjuring particles and spells', () => {
        Particles.init(this.scene);
        Entities.init(this.scene);
        Spells.init(this.scene);
        Weather.init(this.scene);
      }],
      [96, 'Packing your rucksack', () => {
        Combat.init(); Arena.init(); Inv.init(); Crafting.init();
        Brewing.init(); Chests.init(); Quests.init(); Character.init(); UI.init();
      }],
      [100, 'Ready', () => {
        this.saveData = SaveSys.load();
        if (this.saveData && this.saveData.settings) Object.assign(this.settings, this.saveData.settings);
        if (this.saveData && this.saveData.binds) Object.assign(this.binds, this.saveData.binds);
        UI.syncSettings();
        this.applyQuality();
        this.bootDone = true;
        UI.loadingDone();
        UI.showIntro(!!this.saveData);
      }],
    ]);

    // Events
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.renderer.domElement) return;
      const s = 0.0022 * this.settings.sensitivity;
      Player.yaw -= e.movementX * s;
      Player.pitch = Utils.clamp(Player.pitch - e.movementY * s, -1.55, 1.55);
    });
    this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mineHold = false;
      if (e.button === 2) this.placeHold = false;
    });
    document.addEventListener('wheel', (e) => {
      if (document.pointerLockElement !== this.renderer.domElement) return;
      Inv.select((Inv.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9);
      this.refreshHeld();
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.started && !UI.anyOpen() && !Player.dead) UI.showPause();
    });
    window.addEventListener('beforeunload', () => SaveSys.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) SaveSys.save(); });

    this.clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      this.frame(Math.min(0.05, this.clock.getDelta()));
    };
    animate();
  },

  /* Run heavy set-up steps one per frame, painting the bar before each so the
     loading screen shows genuine progress rather than jumping 0 → 100. */
  runStages(stages, done) {
    let i = 0;
    // Wait for a paint, but fall back to a timer: rAF is throttled to a standstill
    // in background tabs, and loading must finish whether or not anyone is watching.
    const afterPaint = (cb) => {
      let fired = false;
      const run = () => { if (fired) return; fired = true; cb(); };
      requestAnimationFrame(() => requestAnimationFrame(run));
      setTimeout(run, 150);
    };
    const next = () => {
      if (i >= stages.length) { if (done) done(); return; }
      const [pct, label, fn] = stages[i++];
      UI.setLoading(pct, label);
      afterPaint(() => {
        try { fn(); } catch (e) { console.error('FableCraft: stage "' + label + '" failed', e); }
        next();
      });
    };
    next();
  },

  buildSky() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambient);
    this.sunLight = new THREE.DirectionalLight(0xfff2d0, 1);
    this.sunLight.position.set(60, 100, 40);
    this.scene.add(this.sunLight);
    this.moonLight = new THREE.DirectionalLight(0x8899ff, 0);
    this.scene.add(this.moonLight);

    this.sunSprite = this.glowSprite('#fff7c0', '#ffd34d', 70);
    this.moonSprite = this.glowSprite('#e8ecff', '#9aa6d0', 44);
    this.scene.add(this.sunSprite);
    this.scene.add(this.moonSprite);
    this.stars = this.makeStars();
    this.scene.add(this.stars);
  },

  buildSceneProps() {
    // Block highlight
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7 })
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // First-person arm + held item
    this.heldGroup = new THREE.Group();
    this.heldGroup.position.set(0.48, -0.46, -0.72);
    this.camera.add(this.heldGroup);
    this.buildArm();

    // Torch light pool + the player's own torch light
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 9);
      this.scene.add(l);
      this.torchLights.push(l);
    }
    this.playerLight = new THREE.PointLight(0xffaa55, 0, 11);
    this.scene.add(this.playerLight);
  },

  glowSprite(inner, outer, scale) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, fog: false, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(scale, scale, 1);
    return s;
  },

  makeStars() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    const rng = new RNG(42);
    for (let i = 0; i < n; i++) {
      const t = rng.next() * Math.PI * 2;
      const p = Math.acos(rng.next() * 2 - 1);
      const r = 430;
      pos[i * 3] = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(p)) * 0.9 + 20;
      pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    return new THREE.Points(geo, mat);
  },

  buildArm() {
    const skin = this.armSkinMat = new THREE.MeshLambertMaterial({ color: 0xd9a878 });
    const sleeve = this.armSleeveMat = new THREE.MeshLambertMaterial({ color: 0x2a6b8f });
    this.armGroup = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.38), skin);
    fore.position.set(0.1, -0.14, 0.12);
    fore.rotation.set(0.55, -0.3, 0.12);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), sleeve);
    sl.position.set(0.17, -0.25, 0.3);
    sl.rotation.copy(fore.rotation);
    this.armGroup.add(fore);
    this.armGroup.add(sl);
    this.heldGroup.add(this.armGroup);
    this.itemMount = new THREE.Group();
    this.itemMount.position.set(0, 0.04, -0.16);
    this.heldGroup.add(this.itemMount);
  },

  // Your designed character's skin and shirt colour the first-person arm
  refreshArmColors() {
    if (!this.armSkinMat || !Character.cfg) return;
    const c = Character.colors();
    this.armSkinMat.color.set(c.skin);
    this.armSleeveMat.color.set(c.shirt);
  },

  /* ================= START ================= */
  start(newGame) {
    // Never let world generation overlap start-up (or itself) — the two stage
    // sequences would interleave and re-initialise systems mid-load.
    if (!this.bootDone) { setTimeout(() => this.start(newGame), 120); return; }
    if (this.starting || this.started) return;
    this.starting = true;

    AudioSys.init();
    AudioSys.resume();
    UI.applyAudio();
    document.getElementById('intro-buttons').classList.add('hidden');
    const loader = document.getElementById('loader');
    loader.classList.remove('done', 'hidden-soft');
    UI.setLoading(5, 'Rolling up a new world');

    if (newGame) { SaveSys.clear(); this.saveData = null; }
    const sd = this.saveData;

    this.runStages([
      [24, 'Sowing the terrain', () => {
        const seed = sd ? sd.seed : ((Math.random() * 0x7fffffff) | 0);
        this.dragonDefeated = sd ? !!sd.dragonDefeated : false;
        this.dayTime = sd ? sd.dayTime : 0.3;
        if (sd && sd.stats) Object.assign(this.stats, sd.stats);
        // Don't gift the level-10 chest again on reload (or on old saves already past level 10)
        this.level10ChestGiven = sd ? (sd.level10ChestGiven || (sd.player && sd.player.level >= 10)) : false;
        World.init(this.scene, seed, sd ? sd.edits : {}, sd ? sd.monumentBuilt : false);
        DungeonBosses.init();
        Player.init();
        Spells.init(this.scene);
        UI.setLoading(24, 'Sowing the terrain — ' + World.recipe.name);
      }],
      [44, 'Recalling your journey', () => {
        if (sd) {
          Equipment.load(sd.equipment);
          Player.load(sd.player);
          Inv.load(sd.inv);
          Spells.load(sd.spells);
          Chests.load(sd.chests);
          Quests.load(sd.quests);
          Weather.load(sd.weather);
          DungeonBosses.load(sd.dungeonBosses);
          if (World.inArenaRegion(Player.pos.x, Player.pos.z)) Player.teleport(World.spawnPoint);
        }
        Spells.onLevel(Player.level);
        if (this.dragonDefeated) Spells.unlock('meteor', true);
      }],
      [70, 'Carving caves and raising villages', () => {
        World.forceArea(Player.pos.x, Player.pos.z, 2);
        if (!World.boxFree(Player.pos.x, Player.pos.y, Player.pos.z, Player.w, Player.h)) {
          Player.pos.y = World.surfaceY(Player.pos.x, Player.pos.z) + 1;
        }
      }],
      [88, 'Waking the villagers', () => {
        this.portalLight = new THREE.PointLight(0xb14df0, 2.2, 20);
        const P = World.PORTAL;
        this.portalLight.position.set(P.x + 0.5, P.baseY + 4, P.z + 0.5);
        this.scene.add(this.portalLight);

        NPC.init(this.scene);
        Character.apply(); // avatar + first-person arm colours
        this.refreshWorldLabels();
        this.applyFog();
        this.heldKey = null;
        this.refreshHeld();
        Inv.refresh();
      }],
      [100, 'Lighting the portal', () => {
        UI.loadingDone();
        this.started = true;
        this.starting = false;
        UI.hideIntro();
        AudioSys.setTrack('overworld');
        this.requestLock();
        if (!sd) UI.banner(World.recipe.name.toUpperCase(), 'A world spun just for you — follow the glowing spires to the dungeons.', 4.5);
        SaveSys.save();
      }],
    ]);
  },

  applyFog() {
    const far = this.settings.renderDist * CHUNK_X - 6;
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(0x87ceeb, far * 0.5, far);
    else { this.scene.fog.near = far * 0.5; this.scene.fog.far = far; }
  },

  applyQuality() {
    const q = this.settings.quality;
    this.renderer.setPixelRatio([1, 1.5, Math.min(window.devicePixelRatio, 2)][q] || 1);
    Particles.density = [0.45, 0.75, 1][q] || 1;
  },

  refreshWorldLabels() {
    for (const l of this.labels) this.scene.remove(l);
    this.labels = [];
    const add = (sprite, pos) => {
      sprite.position.copy(pos);
      this.scene.add(sprite);
      this.labels.push(sprite);
    };
    add(Utils.makeTextSprite('WAVE ARENA', { color: '#d9a6ff', glow: '#8a2be2', scale: 2.2 }), World.PORTAL.labelPos);
    if (World.monumentBuilt) {
      add(Utils.makeTextSprite('Dragon Conqueror', { color: '#ffd34d', glow: '#ff8c1a', scale: 1.4 }), World.monumentLabelPosition());
    }
    if (World.championPortal) {
      add(Utils.makeTextSprite('CHAMPION PORTAL', { color: '#ffd34d', glow: '#8a2be2', scale: 1.6 }), World.championPortal.labelPos);
    }
  },

  requestLock() {
    if (UI.anyOpen() || !this.started) return;
    try {
      const p = this.renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock unavailable */ }
  },

  updateLockState() {
    if (UI.anyOpen()) {
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      this.requestLock();
    }
  },

  setUIOpen() { this.updateLockState(); },

  /* ================= INPUT ================= */
  onKeyDown(e) {
    // Typing in a text field (character name) must never reach the game bindings
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.code === 'Escape') e.target.blur();
      return;
    }
    if (this.rebinding) {
      if (e.code !== 'Escape') this.binds[this.rebinding] = e.code;
      this.rebinding = null;
      UI.refreshRebinds();
      e.preventDefault();
      return;
    }
    if (!this.started) return;
    this.keys[e.code] = true;

    if (e.code.startsWith('Digit')) {
      const n = +e.code.slice(5);
      if (n >= 1 && n <= 9) { Inv.select(n - 1); this.refreshHeld(); }
    }
    const b = this.binds;
    if (e.code === b.inventory && !UI.pauseOpen && !UI.deathOpen && !UI.victoryOpen) {
      if (Inv.isOpen) Inv.close();
      else if (!UI.anyOpen()) Inv.open();
    }
    if (e.code === b.quests && !UI.pauseOpen && !UI.deathOpen && !UI.victoryOpen) {
      if (Quests.isOpen) Quests.close();
      else if (!UI.anyOpen()) Quests.open();
    }
    if (e.code === b.cast && !UI.anyOpen()) Spells.tryCast();
    if (e.code === b.cycleSpell && !UI.anyOpen()) Spells.cycle();
    if (e.code === b.thirdPerson && !UI.anyOpen()) this.toggleThirdPerson();
    if (e.code === b.drop && !UI.anyOpen()) this.dropHeld(e.shiftKey);
    if (e.code === 'Escape') UI.closeTopmost();
  },

  // Toss the held item out in front of you. Shift drops the whole stack.
  dropHeld(wholeStack) {
    if (Player.dead) return;
    const slot = Inv.selectedSlot();
    if (!slot) return;
    const count = wholeStack ? slot.count : 1;
    const id = slot.id;

    const look = Player.lookDir();
    const at = Player.eye().add(new THREE.Vector3(look.x * 0.6, -0.25, look.z * 0.6));
    const d = Entities.spawnDrop(at, { item: id, count });
    if (d) {
      d.vel.set(look.x * 5.2, 2.6, look.z * 5.2);
      d.grace = 1.2;   // long enough that it does not fly straight back into the pack
    }

    slot.count -= count;
    if (slot.count <= 0) Inv.slots[Inv.sel] = null;
    Inv.refresh();
    this.refreshHeld();
    AudioSys.play('click');
    UI.message(`Dropped ${count}× ${Items.get(id).name}`, 1.2);
  },

  toggleThirdPerson() {
    this.thirdPerson = !this.thirdPerson;
    if (Character.worldModel) Character.worldModel.visible = this.thirdPerson;
    UI.message(this.thirdPerson ? `Third-person view — meet ${Character.cfg.name}` : 'First-person view', 1.8);
    AudioSys.play('click');
  },

  onMouseDown(e) {
    if (!this.started) return;
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked) {
      if (!UI.anyOpen() && !Player.dead) this.requestLock();
      return;
    }
    if (e.button === 0) {
      this.mineHold = true;
      this.mineKey = null;
      Combat.tryAttack();
    } else if (e.button === 2) {
      this.placeHold = true;
      this.placeT = 0.28;
      this.interact();
    }
  },

  /* ================= INTERACTION ================= */
  interact() {
    if (Player.dead) return;
    const eye = Player.eye(), look = Player.lookDir();

    // Friendly NPCs first
    const npc = NPC.rayPick(eye, look, 3.8);
    if (npc) { NPC.openDialogue(npc); this.placeHold = false; return; }

    // Interactive blocks
    const hit = World.raycast(eye, look, 5.5);
    if (hit) {
      if (hit.id === BLOCK.TABLE) { Crafting.openTable(); this.placeHold = false; return; }
      if (hit.id === BLOCK.CHEST || hit.id === BLOCK.RARE_CHEST) {
        Chests.open(hit.x, hit.y, hit.z, hit.id);
        this.placeHold = false;
        return;
      }
      if (hit.id === BLOCK.BREWING) { Brewing.open(); this.placeHold = false; return; }
      if (hit.id === BLOCK.DOOR_C || hit.id === BLOCK.DOOR_O) {
        World.setBlock(hit.x, hit.y, hit.z, hit.id === BLOCK.DOOR_C ? BLOCK.DOOR_O : BLOCK.DOOR_C);
        AudioSys.play('place');
        this.placeHold = false;
        return;
      }
    }

    // Held item actions
    const s = Inv.selectedSlot();
    const item = s ? Items.get(s.id) : null;
    if (item) {
      if (item.kind === 'potion') {
        Player.drinkPotion(item);
        Inv.useSelected();
        this.placeHold = false;
        return;
      }
      if (item.kind === 'use') {
        if (Spells.unlockRandom()) Inv.useSelected();
        else UI.message('You already know every spell!', 2);
        this.placeHold = false;
        return;
      }
      if (item.kind === 'magic') {
        Spells.tryCast();
        this.placeHold = false;
        return;
      }
    }

    this.tryPlaceBlock(hit);
  },

  tryPlaceBlock(hit) {
    if (Player.dead) return;
    if (Arena.active) { UI.message("The arena's magic suppresses building here."); return; }
    if (!hit) hit = World.raycast(Player.eye(), Player.lookDir(), 5.5);
    if (!hit) return;
    const s = Inv.selectedSlot();
    if (!s) return;
    const item = Items.get(s.id);
    if (!item || item.kind !== 'block') return;
    const { px, py, pz } = hit;
    const cur = World.getBlock(px, py, pz);
    if (cur !== BLOCK.AIR && cur !== BLOCK.WATER) return;
    const bdef = Blocks.def(item.blockId);

    if (bdef.solid) {
      const overlaps = (pos, w, h) =>
        px + 1 > pos.x - w / 2 && px < pos.x + w / 2 &&
        py + 1 > pos.y && py < pos.y + h &&
        pz + 1 > pos.z - w / 2 && pz < pos.z + w / 2;
      if (overlaps(Player.pos, Player.w, Player.h)) return;
      for (const en of Entities.list) {
        if (!en.dead && !en.dying && overlaps(en.pos, en.w, en.h)) return;
      }
    }
    World.setBlock(px, py, pz, item.blockId);
    if (item.blockId === BLOCK.CHEST) Chests.markPlaced(px, py, pz);
    Inv.useSelected();
    this.refreshHeld();
    this.stats.placed++;
    AudioSys.play('place');
    this.swingArm();
  },

  /* ================= MINING ================= */
  interactUpdate(dt) {
    if (Player.dead) { this.highlight.visible = false; UI.mineProgress(null); return; }
    const locked = document.pointerLockElement === this.renderer.domElement;
    const eye = Player.eye(), look = Player.lookDir();
    const hit = Arena.active ? null : World.raycast(eye, look, 5.5);
    const def = hit ? Blocks.def(hit.id) : null;
    const breakable = def && !def.unbreakable;

    this.highlight.visible = !!(hit && breakable);
    if (hit) this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    if (this.tierMsgT > 0) this.tierMsgT -= dt;

    if (locked && this.mineHold && hit && breakable) {
      // Tool tier gate for ores
      if (def.tier && Player.pickaxeTier() < def.tier) {
        this.mineKey = null;
        this.mineProg = 0;
        UI.mineProgress(null);
        if (this.tierMsgT <= 0) {
          this.tierMsgT = 1.6;
          UI.message(`${def.name} needs a ${['', 'wooden', 'stone', 'iron'][def.tier]} pickaxe or better!`, 1.5);
        }
        return;
      }
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (key !== this.mineKey) { this.mineKey = key; this.mineProg = 0; }
      const speed = Player.toolSpeedFor(def);
      this.mineProg += dt * speed / def.breakTime;
      this.mineSoundT -= dt;
      if (this.mineSoundT <= 0) {
        this.mineSoundT = 0.25;
        AudioSys.play('mine');
        this.swingArm(0.22);
      }
      UI.mineProgress(this.mineProg);
      if (this.mineProg >= 1) this.breakBlock(hit, def);
    } else {
      this.mineKey = null;
      this.mineProg = 0;
      UI.mineProgress(null);
    }

    if (locked && this.placeHold) {
      this.placeT -= dt;
      if (this.placeT <= 0) { this.placeT = 0.28; this.tryPlaceBlock(null); }
    }
  },

  breakBlock(hit, def) {
    if (hit.id === BLOCK.CHEST || hit.id === BLOCK.RARE_CHEST) Chests.onBreak(hit.x, hit.y, hit.z);
    World.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
    this.mineKey = null;
    this.mineProg = 0;
    AudioSys.play('break');
    const center = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    Particles.blockBreak(center, hit.id);
    this.stats.mined++;
    Quests.onMine(hit.id);
    const ore = def.tier ? def.tier + 1 : 0;
    Player.addXP(hit.id === BLOCK.STONE || hit.id === BLOCK.WOOD ? 2 : (ore ? ore + 1 : 1));
    if (def.drop) {
      const left = Inv.add(def.drop, 1);
      if (left > 0) Entities.spawnDrop(center, { item: def.drop, count: left });
    }
  },

  /* ================= HELD ITEM VIEW-MODEL ================= */
  tileTex(tile) {
    if (this.tileTexCache[tile]) return this.tileTexCache[tile];
    const ts = Blocks.TS;
    const cv = document.createElement('canvas');
    cv.width = cv.height = ts;
    const ctx = cv.getContext('2d');
    ctx.drawImage(Blocks.atlasCanvas, (tile % Blocks.GRID) * ts, Math.floor(tile / Blocks.GRID) * ts, ts, ts, 0, 0, ts, ts);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    this.tileTexCache[tile] = tex;
    return tex;
  },

  refreshHeld() {
    const s = Inv.selectedSlot();
    const key = s ? s.id : 0;
    if (key === this.heldKey) return;
    this.heldKey = key;
    while (this.itemMount.children.length) {
      const c = this.itemMount.children[0];
      this.itemMount.remove(c);
      if (c.material && c.material.dispose) c.material.dispose();
      if (c.geometry && c.geometry.dispose) c.geometry.dispose();
    }
    if (!s) return;
    const item = Items.get(s.id);
    let mesh;
    if (item.kind === 'block') {
      const tex = this.tileTex(Blocks.tileFor(item.blockId, 0));
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ map: tex }));
      mesh.rotation.y = Math.PI / 5;
    } else {
      const tex = new THREE.TextureLoader().load(Items.iconURL(s.id));
      tex.magFilter = THREE.NearestFilter;
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.5),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
      );
      mesh.rotation.z = -0.3;
      mesh.position.y = 0.1;
    }
    this.itemMount.add(mesh);
  },

  swingArm(dur = 0.3) { this.armAnim = { kind: 'swing', t: dur, dur }; },

  castAnim() {
    this.armAnim = { kind: 'cast', t: 0.45, dur: 0.45 };
    const hand = new THREE.Vector3();
    this.heldGroup.getWorldPosition(hand);
    Particles.emit({
      pos: hand, count: 8, spread: 0.15, velSpread: 1.2, life: 0.5, size: 0.5,
      colors: ['#b14df0', '#d9a6ff', '#ffffff'], gravity: -1,
    });
  },

  /* ================= CAMERA & SKY ================= */
  cameraUpdate(dt) {
    let ox = 0, oy = 0, oz = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeI * Math.max(0, this.shakeT / this.shakeDur);
      ox = (Math.random() - 0.5) * 2 * k;
      oy = (Math.random() - 0.5) * 2 * k;
      oz = (Math.random() - 0.5) * 2 * k;
    }
    const eye = Player.eye();
    const drop = Player.deathAnim * 1.0;

    // Third person: pull the camera back along the view ray, stopping short of walls
    if (this.thirdPerson) {
      const back = Player.lookDir().multiplyScalar(-1);
      let dist = 3.4;
      for (let d = 0.5; d <= 3.4; d += 0.25) {
        const p = eye.clone().addScaledVector(back, d);
        if (World.isSolid(p.x, p.y, p.z)) { dist = Math.max(0.8, d - 0.35); break; }
      }
      this.camera.position.set(eye.x + back.x * dist + ox, eye.y + back.y * dist + oy - drop, eye.z + back.z * dist + oz);
    } else {
      this.camera.position.set(eye.x + ox, eye.y + oy - drop, eye.z + oz);
    }
    this.camera.rotation.y = Player.yaw;
    this.camera.rotation.x = Player.pitch;
    this.camera.rotation.z = Player.deathAnim * 0.8;

    Character.updateWorldModel(dt);
    this.heldGroup.visible = !this.thirdPerson;
    if (this.thirdPerson) return; // no first-person arm bob to compute

    // Arm: bob, swim stroke, swing & cast animations
    const hSpeed = Math.hypot(Player.vel.x, Player.vel.z);
    if (Player.onGround) this.bobPhase += hSpeed * dt * 1.7;
    const t = performance.now() / 1000;

    let rotX = 0, rotZ = 0, posY = -0.46;
    if (this.armAnim.kind) {
      this.armAnim.t -= dt;
      const p = 1 - Math.max(0, this.armAnim.t) / this.armAnim.dur;
      if (this.armAnim.kind === 'swing') {
        rotX = -Math.sin(p * Math.PI) * 1.1;
        rotZ = -Math.sin(p * Math.PI) * 0.4;
      } else { // cast: raise the arm, palm forward
        rotX = Math.sin(p * Math.PI) * 0.9;
        posY += Math.sin(p * Math.PI) * 0.18;
      }
      if (this.armAnim.t <= 0) this.armAnim.kind = null;
    } else if (Player.inWater && hSpeed > 0.5) {
      rotX = Math.sin(t * 4) * 0.35; // swimming stroke
      rotZ = Math.cos(t * 4) * 0.18;
    }
    this.heldGroup.rotation.x = rotX;
    this.heldGroup.rotation.z = rotZ;
    this.heldGroup.position.y = posY + Math.sin(this.bobPhase * 2) * 0.018;
    this.heldGroup.position.x = 0.48 + Math.cos(this.bobPhase) * 0.012;
  },

  shake(intensity, duration) {
    this.shakeI = Math.max(this.shakeI * (this.shakeT > 0 ? 1 : 0), intensity);
    this.shakeT = Math.max(this.shakeT, duration);
    this.shakeDur = Math.max(this.shakeT, 0.001);
  },

  skyUpdate() {
    const ang = this.dayTime * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.3).normalize();
    const elev = sunDir.y;
    const dl = Utils.smoothstep(-0.06, 0.22, elev);
    this.isNight = elev < -0.04;

    const mod = Weather.skyMod();
    this.skyCol.copy(this.COL_NIGHT).lerp(this.COL_DAY, dl);
    const dawnK = Math.max(0, 1 - Math.abs(elev) * 4) * 0.55;
    this.skyCol.lerp(this.COL_DAWN, dawnK);
    this.skyCol.multiplyScalar(mod.dark);
    if (Weather.flash > 0) this.skyCol.lerp(this.COL_WHITE, Math.max(0, Weather.flash) * 0.5);

    // Fog: weather-driven, replaced by murky blue underwater
    const baseFar = this.settings.renderDist * CHUNK_X - 6;
    if (Player.headUnder) {
      this.skyCol.copy(this.COL_WATER).multiplyScalar(0.4 + dl * 0.6);
      this.scene.fog.near = 1;
      this.scene.fog.far = 16;
      UI.setUnderwater(true);
    } else {
      this.scene.fog.near = baseFar * mod.fogMul * 0.5;
      this.scene.fog.far = baseFar * mod.fogMul;
      UI.setUnderwater(false);
    }
    this.scene.background.copy(this.skyCol);
    this.scene.fog.color.copy(this.skyCol);

    this.sunLight.position.copy(sunDir).multiplyScalar(140);
    this.sunLight.intensity = (0.12 + 0.95 * dl) * mod.dark;
    this.moonLight.position.copy(sunDir).multiplyScalar(-140);
    this.moonLight.intensity = 0.15 * (1 - dl);
    this.ambient.intensity = (0.22 + 0.46 * dl) * (0.7 + 0.3 * mod.dark) + Math.max(0, Weather.flash) * 0.8;

    const cp = this.camera.position;
    this.sunSprite.position.copy(cp).addScaledVector(sunDir, 400);
    this.moonSprite.position.copy(cp).addScaledVector(sunDir, -400);
    this.stars.position.copy(cp);
    this.stars.material.opacity = (1 - dl) * 0.9 * mod.dark;
  },

  effectsUpdate(dt) {
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) UI.showDeath(this.deathCause);
    }

    // Torch light pool
    this.torchT -= dt;
    if (this.torchT <= 0) {
      this.torchT = 0.5;
      const px = Player.pos.x, pz = Player.pos.z;
      const pcx = Math.floor(px / CHUNK_X), pcz = Math.floor(pz / CHUNK_Z);
      const cands = [];
      for (const c of World.chunks.values()) {
        if (Math.abs(c.cx - pcx) > 2 || Math.abs(c.cz - pcz) > 2) continue;
        for (const tch of c.torches) {
          const d = (tch.x - px) * (tch.x - px) + (tch.z - pz) * (tch.z - pz);
          cands.push([d, tch]);
        }
      }
      cands.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < this.torchLights.length; i++) {
        const l = this.torchLights[i];
        if (i < cands.length) {
          const tch = cands[i][1];
          l.position.set(tch.x, tch.y + 0.3, tch.z);
          l.intensity = 1.1;
        } else {
          l.intensity = 0;
        }
      }
    }
    for (const l of this.torchLights) {
      if (l.intensity > 0) l.intensity = 1.0 + Math.sin(performance.now() / 90 + l.position.x) * 0.18;
    }

    // Held torch lights the way
    if (this.heldKey === BLOCK.TORCH) {
      this.playerLight.position.copy(Player.eye());
      this.playerLight.intensity = 1.2 + Math.sin(performance.now() / 80) * 0.15;
    } else {
      this.playerLight.intensity = 0;
    }

    // Portal ambience
    const P = World.PORTAL;
    const portalCenter = new THREE.Vector3(P.x + 0.5, P.baseY + 4, P.z + 0.5);
    if (Player.pos.distanceTo(portalCenter) < 70) {
      if (Math.random() < 0.5) Particles.portalSwirl(portalCenter);
      if (this.portalLight) this.portalLight.intensity = 2 + Math.sin(performance.now() / 320) * 0.7;
    }
    if (World.championPortal) {
      const cc = new THREE.Vector3(World.championPortal.labelPos.x, World.championPortal.labelPos.y - 4, World.championPortal.labelPos.z);
      if (Player.pos.distanceTo(cc) < 60 && Math.random() < 0.5) Particles.portalSwirl(cc);
    }
  },

  /* ================= DEATH ================= */
  onPlayerDeath(cause) {
    this.deathCause = cause;
    this.deathTimer = 1.5;
    this.mineHold = false;
    this.placeHold = false;
    if (Arena.active) Arena.abort();
  },

  respawn() {
    UI.hideDeath();
    Player.respawn();
    World.forceArea(Player.pos.x, Player.pos.z, 2);
    AudioSys.setTrack('overworld');
    UI.setDarken(0);
    SaveSys.save();
    this.updateLockState();
  },

  /* ================= FRAME ================= */
  frame(dt) {
    AudioSys.update();
    UI.update(dt);

    if (this.started) {
      const paused = UI.anyPausing();
      if (!paused) {
        this.stats.playtime += dt;
        this.dayTime = (this.dayTime + dt / this.DAY_LEN) % 1;

        World.update(Player.pos);
        const b = this.binds;
        const input = {
          f: (this.keys[b.forward] ? 1 : 0) - (this.keys[b.back] ? 1 : 0),
          s: (this.keys[b.right] ? 1 : 0) - (this.keys[b.left] ? 1 : 0),
          jump: !!this.keys[b.jump],
          sprint: !!this.keys[b.sprint],
        };
        Player.update(dt, input);
        Entities.update(dt);
        NPC.update(dt);
        Arena.update(dt);
        DungeonBosses.update(dt);
        if (DragonBoss.active) DragonBoss.update(dt);
        Spells.update(dt);
        Particles.update(dt);
        Weather.update(dt, Player.pos);
        this.interactUpdate(dt);
        Combat.update(dt, this.camera, window.innerWidth, window.innerHeight);
        Quests.update(dt);
        UI.updateLocator(dt);
        this.effectsUpdate(dt);
        SaveSys.update(dt);
      }
      this.cameraUpdate(dt);
      this.skyUpdate();
      UI.updateHUD();
    }

    this.renderer.render(this.scene, this.camera);
  },
};

window.addEventListener('load', () => Game.boot());
