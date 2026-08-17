'use strict';
/* FableCraft — HUD, menus, banners, subtitles, accessibility and screen effects. */

const UI = {
  bannerT: 0, messageT: 0,
  pauseOpen: false, deathOpen: false, victoryOpen: false, rebindOpen: false,

  el(id) { return document.getElementById(id); },

  init() {
    // Pause menu
    this.el('btn-resume').addEventListener('click', () => this.hidePause());
    this.el('btn-character').addEventListener('click', () => Character.open());
    this.el('btn-intro-character').addEventListener('click', () => Character.open());
    this.el('char-done').addEventListener('click', () => Character.close());
    this.el('char-random').addEventListener('click', () => Character.randomize());
    this.el('char-reset').addEventListener('click', () => {
      Character.cfg = Object.assign({}, Character.DEFAULT);
      Character.buildControls();
      Character.refreshPreview();
      AudioSys.play('click');
    });
    this.el('btn-settings').addEventListener('click', () => {
      this.el('pause-main').classList.add('hidden');
      this.el('pause-settings').classList.remove('hidden');
    });
    this.el('btn-settings-back').addEventListener('click', () => {
      this.el('pause-settings').classList.add('hidden');
      this.el('pause-main').classList.remove('hidden');
    });
    this.el('btn-save').addEventListener('click', () => {
      SaveSys.save();
      this.message('Game saved!', 2);
      AudioSys.play('click');
    });
    this.el('btn-restart').addEventListener('click', () => {
      if (confirm('Restart with a brand new world? Your current world will be erased.')) {
        SaveSys.clear();
        location.reload();
      }
    });

    // Settings
    const S = Game.settings;
    const bind = (id, fn) => this.el(id).addEventListener('input', (e) => { fn(+e.target.value); this.applyAudio(); });
    bind('set-master', v => S.volMaster = v / 100);
    bind('set-music', v => S.volMusic = v / 100);
    bind('set-sfx', v => S.volSfx = v / 100);
    bind('set-sens', v => S.sensitivity = v / 100);
    this.el('set-dist').addEventListener('input', (e) => {
      S.renderDist = +e.target.value;
      this.el('dist-val').textContent = e.target.value;
      Game.applyFog();
    });
    this.el('set-quality').addEventListener('change', (e) => {
      S.quality = +e.target.value;
      Game.applyQuality();
    });
    this.el('set-uiscale').addEventListener('input', (e) => {
      S.uiScale = +e.target.value / 100;
      this.el('uiscale-val').textContent = e.target.value + '%';
      this.applyAccessibility();
    });
    this.el('set-colorblind').addEventListener('change', (e) => {
      S.colorblind = e.target.checked;
      this.applyAccessibility();
    });
    this.el('set-subtitles').addEventListener('change', (e) => {
      S.subtitles = e.target.checked;
    });
    this.el('btn-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => this.message('Fullscreen not available', 2));
    });
    this.el('btn-rebind').addEventListener('click', () => this.showRebind());
    this.el('rebind-close').addEventListener('click', () => this.hideRebind());

    // Death / victory
    this.el('btn-respawn').addEventListener('click', () => Game.respawn());
    this.el('btn-victory-close').addEventListener('click', () => {
      this.victoryOpen = false;
      this.el('victory-screen').classList.add('hidden');
      Game.updateLockState();
    });

    // Intro
    this.el('btn-continue').addEventListener('click', () => Game.start(false));
    this.el('btn-new').addEventListener('click', () => {
      if (!SaveSys.hasSave() || confirm('Start a new world? Your saved world will be erased.')) {
        Game.start(true);
      }
    });
  },

  applyAudio() {
    const S = Game.settings;
    AudioSys.setVolumes(S.volMaster, S.volMusic, S.volSfx);
  },

  applyAccessibility() {
    const S = Game.settings;
    document.documentElement.style.setProperty('--ui-scale', S.uiScale);
    document.body.classList.toggle('colorblind', !!S.colorblind);
  },

  syncSettings() {
    const S = Game.settings;
    this.el('set-master').value = Math.round(S.volMaster * 100);
    this.el('set-music').value = Math.round(S.volMusic * 100);
    this.el('set-sfx').value = Math.round(S.volSfx * 100);
    this.el('set-sens').value = Math.round(S.sensitivity * 100);
    this.el('set-dist').value = S.renderDist;
    this.el('dist-val').textContent = S.renderDist;
    this.el('set-quality').value = S.quality;
    this.el('set-uiscale').value = Math.round(S.uiScale * 100);
    this.el('uiscale-val').textContent = Math.round(S.uiScale * 100) + '%';
    this.el('set-colorblind').checked = !!S.colorblind;
    this.el('set-subtitles').checked = !!S.subtitles;
    this.applyAccessibility();
  },

  /* ---------- key rebinding ---------- */
  showRebind() {
    this.rebindOpen = true;
    this.el('rebind-screen').classList.remove('hidden');
    this.refreshRebinds();
  },

  hideRebind() {
    this.rebindOpen = false;
    Game.rebinding = null;
    this.el('rebind-screen').classList.add('hidden');
  },

  refreshRebinds() {
    const list = this.el('rebind-list');
    list.innerHTML = '';
    for (const [action, , label] of Game.BINDS_DEF) {
      const row = document.createElement('div');
      row.className = 'rebind-row';
      const listening = Game.rebinding === action;
      row.innerHTML = `<span>${label}</span>`;
      const b = document.createElement('button');
      b.className = 'btn key-btn' + (listening ? ' listening' : '');
      b.textContent = listening ? 'press a key...' : Game.bindLabel(action);
      b.addEventListener('click', () => {
        Game.rebinding = action;
        this.refreshRebinds();
      });
      row.appendChild(b);
      list.appendChild(row);
    }
  },

  /* ---------- HUD ---------- */
  // Only touch the DOM when a value actually changed. Writing every bar and label
  // each frame was costing more than the rest of the HUD combined.
  _hud: {},
  set(id, prop, value) {
    if (this._hud[id + prop] === value) return;
    this._hud[id + prop] = value;
    const el = this.el(id);
    if (prop === 'w') el.style.width = value;
    else el.textContent = value;
  },

  updateHUD() {
    const P = Player;
    const pct = (a, b) => (Math.round(a / b * 1000) / 10) + '%';
    this.set('hp-fill', 'w', pct(P.health, P.maxHealth));
    this.set('hp-text', 't', `${Math.ceil(P.health)} / ${P.maxHealth}`);
    this.set('st-fill', 'w', pct(P.stamina, P.maxStamina));
    this.set('mana-fill', 'w', pct(P.mana, P.maxMana));
    this.set('mana-text', 't', `${Math.floor(P.mana)} / ${P.maxMana}`);
    this.set('xp-fill', 'w', pct(P.xp, P.xpNeeded(P.level)));
    this.set('xp-text', 't', `${Math.floor(P.xp)} / ${P.xpNeeded(P.level)} XP`);
    this.set('level-label', 't', 'LV ' + P.level);
    this.set('coin-count', 't', String(P.coins));
    if (World.recipe) this.set('world-name', 't', World.recipe.name);
    const hours = (Game.dayTime * 24 + 8) % 24;
    const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
    this.set('clock-display', 't', `${Game.isNight ? '☾' : '☀'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);

    // Oxygen bar only while diving
    const oxyRow = this.el('oxy-row');
    if (P.oxygen < P.maxOxygen - 0.05) {
      oxyRow.classList.remove('hidden');
      this.set('oxy-fill', 'w', (Math.round(P.oxygen / P.maxOxygen * 1000) / 10) + '%');
    } else {
      oxyRow.classList.add('hidden');
    }

    // Buff chips
    const chips = [];
    const names = { speed: 'Speed', strength: 'Strength', regen: 'Regen', fireres: 'Fire Res', dragon: 'Dragon Slayer' };
    for (const k of Object.keys(P.buffs)) {
      if (P.buffs[k] > 0) chips.push(`<span class="buff-chip">${names[k]} ${Math.ceil(P.buffs[k])}s</span>`);
    }
    const buffsEl = this.el('buffs');
    const html = chips.join('');
    if (buffsEl.innerHTML !== html) buffsEl.innerHTML = html;

    // Spell bar
    const bar = this.el('spell-bar');
    const spell = Spells.activeSpell();
    if (!spell) {
      bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
      const icon = this.el('spell-icon');
      const url = Spells.iconURL(spell.key);
      if (icon.dataset.key !== spell.key) {
        icon.src = url;
        icon.dataset.key = spell.key;
      }
      const sc = Spells.scaled(spell);
      this.el('spell-name').textContent = `${spell.name} Lv${Spells.level(spell.key)}`;
      this.el('spell-cost').textContent = `${sc.cost} mana`;
      this.el('spell-hint').textContent = `${Game.bindLabel('cast')} cast · ${Game.bindLabel('cycleSpell')} next (${Spells.state.unlocked.length})`;
      this.el('spell-cd').style.height = (Spells.cooldownFrac(spell.key) * 100) + '%';
    }
  },

  /* Points at the closest dungeon: a compass arrow relative to where you are facing,
     refreshed on a timer because scanning cells is not free. */
  locatorT: 0, locatorFound: null,

  updateLocator(dt) {
    const el = this.el('dungeon-locator');
    this.locatorT -= dt;
    if (this.locatorT <= 0) {
      this.locatorT = 1.2;
      this.locatorFound = Arena.active ? null : Dungeons.nearest(Player.pos.x, Player.pos.z, 400);
    }
    const f = this.locatorFound;
    if (!f) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');

    // Bearing to the dungeon, rotated into the player's frame of reference
    const world = Math.atan2(f.dungeon.x - Player.pos.x, -(f.dungeon.z - Player.pos.z));
    let rel = world - Player.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const arrow = arrows[(Math.round(rel / (Math.PI / 4)) + 8) % 8];
    const dist = Math.round(Utils.dist2D(Player.pos.x, Player.pos.z, f.dungeon.x, f.dungeon.z));
    el.innerHTML = `<span class="dl-arrow">${arrow}</span> ${f.dungeon.name} <span class="dl-dist">${dist}m</span>`;
  },

  bossBar(frac, name) {
    const wrap = this.el('boss-bar-wrap');
    if (frac === null || frac === undefined) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    this.el('boss-fill').style.width = Math.max(0, frac * 100) + '%';
    this.el('boss-name').textContent = name || 'DRAGON';
  },

  waveInfo(text) {
    const w = this.el('wave-info');
    if (!text) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    w.textContent = text;
  },

  banner(main, sub, dur = 3) {
    this.el('banner-main').textContent = main;
    this.el('banner-sub').textContent = sub || '';
    const b = this.el('banner');
    b.classList.add('hidden');
    void b.offsetWidth;
    b.classList.remove('hidden');
    this.bannerT = dur;
  },

  message(text, dur = 2.5) {
    this.el('message').textContent = text;
    this.el('message').classList.remove('hidden');
    this.messageT = dur;
  },

  subtitle(text) {
    if (!Game.settings.subtitles) return;
    const box = this.el('subtitles');
    if (!box) return;
    // Avoid duplicate spam
    if (box.lastChild && box.lastChild.textContent === text) return;
    const line = document.createElement('div');
    line.className = 'sub-line';
    line.textContent = text;
    box.appendChild(line);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { line.style.opacity = '0'; }, 2200);
    setTimeout(() => { if (line.parentNode) line.parentNode.removeChild(line); }, 2900);
  },

  mineProgress(frac) {
    const wrap = this.el('mine-progress-wrap');
    if (frac === null || frac <= 0) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    this.el('mine-progress').style.width = Math.min(100, frac * 100) + '%';
  },

  vignetteFlash() {
    const v = this.el('vignette');
    v.style.opacity = 1;
    clearTimeout(this._vt);
    this._vt = setTimeout(() => { v.style.opacity = 0; }, 200);
  },

  setDarken(o) { this.el('darken').style.opacity = o; },
  setUnderwater(on) { this.el('underwater').style.opacity = on ? 1 : 0; },

  fadeOut(midCb) {
    const f = this.el('fade');
    f.style.opacity = 1;
    setTimeout(() => {
      midCb();
      setTimeout(() => { f.style.opacity = 0; }, 250);
    }, 550);
  },

  /* ---------- screens ---------- */
  showPause() {
    if (this.pauseOpen) return;
    this.pauseOpen = true;
    this.el('pause-screen').classList.remove('hidden');
    this.el('pause-main').classList.remove('hidden');
    this.el('pause-settings').classList.add('hidden');
    const s = Game.stats;
    this.el('pause-stats').innerHTML =
      `Playtime ${this.fmtTime(s.playtime)} · Enemies ${s.kills} · Mined ${s.mined} · Placed ${s.placed}<br>` +
      `Waves ${s.waves} · Damage ${Math.floor(s.damageDealt)} · Level ${Player.level} · Armor ${Equipment.totalArmor()}`;
    SaveSys.save();
  },

  hidePause() {
    this.pauseOpen = false;
    this.el('pause-screen').classList.add('hidden');
    this.hideRebind();
    Game.updateLockState();
  },

  showDeath(cause) {
    this.deathOpen = true;
    this.el('death-cause').textContent = 'Slain by ' + cause + '.';
    this.el('death-screen').classList.remove('hidden');
    Game.updateLockState();
  },

  hideDeath() {
    this.deathOpen = false;
    this.el('death-screen').classList.add('hidden');
    Game.updateLockState();
  },

  showVictory() {
    this.victoryOpen = true;
    const s = Game.stats;
    const rows = [
      ['Playtime', this.fmtTime(s.playtime)],
      ['Enemies defeated', s.kills],
      ['Blocks mined', s.mined],
      ['Blocks placed', s.placed],
      ['Waves completed', s.waves],
      ['Damage dealt', Math.floor(s.damageDealt)],
      ['Coins earned', s.coinsEarned],
      ['Dragons slain', s.dragonKills],
    ];
    this.el('victory-stats').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    this.el('victory-screen').classList.remove('hidden');
    Game.updateLockState();
  },

  /* ---------- loading screen ---------- */
  TIPS: [
    'Punch a tree to get your first wood — everything starts there.',
    'Press <b>V</b> to admire the hero you designed.',
    'Torches keep the monsters from spawning near your base.',
    'Ores need the right pickaxe — crystal will not budge for stone.',
    'Talk to <b>Bruna</b> at spawn to temper your armour.',
    'Rare golden chests hide the best loot in the world.',
    'A Crafting Table unlocks weapons, armour and magic recipes.',
    'Reach <b>level 10</b> and something golden will appear beside you.',
    'Sprinting drains stamina — pace yourself in the arena.',
    'Dig straight down and you will regret it.',
    'Eldrin the Wizard can upgrade every spell five ranks.',
    'The dragon breathes fire — brew Fire Resistance first.',
    'Ladders let you climb; doors keep the zombies out.',
    'Your world saves itself every 20 seconds.',
  ],
  tipTimer: null,

  setLoading(pct, status) {
    const fill = this.el('loader-fill'), st = this.el('loader-status');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (st && status !== undefined) st.textContent = status;
  },

  loadingDone() {
    this.setLoading(100, 'Ready');
    this.el('loader').classList.add('done');
  },

  startTips() {
    const tip = this.el('loader-tip');
    if (!tip) return;
    const show = () => {
      tip.innerHTML = '<b>Tip:</b> ' + this.TIPS[Math.floor(Math.random() * this.TIPS.length)];
    };
    show();
    clearInterval(this.tipTimer);
    this.tipTimer = setInterval(show, 5200);
  },

  // Tile the intro backdrop with the game's own dirt texture, Minecraft-menu style
  applyDirtBackdrop() {
    try {
      const ts = Blocks.TS;
      const cv = document.createElement('canvas');
      cv.width = cv.height = ts;
      const ctx = cv.getContext('2d');
      const tile = TILE.DIRT;
      ctx.drawImage(Blocks.atlasCanvas, (tile % Blocks.GRID) * ts, Math.floor(tile / Blocks.GRID) * ts, ts, ts, 0, 0, ts, ts);
      this.el('intro-dirt').style.backgroundImage = `url(${cv.toDataURL()})`;
    } catch (e) { /* backdrop is decorative — a plain dark screen is fine */ }
  },

  showIntro(hasSave) {
    this.el('btn-continue').style.display = hasSave ? 'block' : 'none';
    this.el('btn-new').textContent = hasSave ? 'New World' : 'Click to Play';
    this.el('intro-screen').classList.remove('hidden');
    // Let the finished bar read for a beat, then swap it for the menu
    setTimeout(() => {
      this.el('loader').classList.add('hidden-soft');
      this.el('intro-buttons').classList.remove('hidden');
    }, 380);
  },

  hideIntro() {
    clearInterval(this.tipTimer);
    this.el('intro-screen').classList.add('hidden');
    this.el('hud').classList.remove('hidden');
  },

  anyOpen() {
    return this.pauseOpen || this.deathOpen || this.victoryOpen || this.rebindOpen ||
           Inv.isOpen || Crafting.tableOpen || Brewing.isOpen || Chests.isOpen() ||
           NPC.isOpen() || Quests.isOpen || Character.isOpen;
  },

  // Modal screens that pause the simulation (death keeps the world alive)
  anyPausing() {
    return this.pauseOpen || this.victoryOpen || this.rebindOpen ||
           Inv.isOpen || Crafting.tableOpen || Brewing.isOpen || Chests.isOpen() ||
           NPC.isOpen() || Quests.isOpen || Character.isOpen;
  },

  // Close the topmost modal; returns true if something closed
  closeTopmost() {
    if (Character.isOpen) { Character.close(); return true; }
    if (this.rebindOpen) { this.hideRebind(); return true; }
    if (Inv.isOpen) { Inv.close(); return true; }
    if (Crafting.tableOpen) { Crafting.closeTable(); return true; }
    if (Brewing.isOpen) { Brewing.close(); return true; }
    if (Chests.isOpen()) { Chests.close(); return true; }
    if (NPC.isOpen()) { NPC.close(); return true; }
    if (Quests.isOpen) { Quests.close(); return true; }
    return false;
  },

  fmtTime(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  },

  update(dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el('banner').classList.add('hidden');
    }
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) this.el('message').classList.add('hidden');
    }
  },
};
