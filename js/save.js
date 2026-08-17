'use strict';
/* FableCraft — auto-save to localStorage: inventory, position, levels, coins, world seed,
   edits, arena progress, spells, equipment, chests, quests, weather, stats, settings & binds. */

const SaveSys = {
  KEY: 'fablecraft_save_v1',
  OLD_KEY: 'claycraft_save_v1', // pre-rename saves are migrated on first load
  timer: 0,
  INTERVAL: 20,

  hasSave() {
    try { return !!(localStorage.getItem(this.KEY) || localStorage.getItem(this.OLD_KEY)); }
    catch (e) { return false; }
  },

  save() {
    if (!Game.started) return;
    try {
      const data = {
        v: 2,
        savedAt: Date.now(),
        seed: World.seed,
        dayTime: Game.dayTime,
        player: Player.serialize(),
        inv: Inv.serialize(),
        edits: World.serializeEdits(),
        monumentBuilt: World.monumentBuilt,
        dragonDefeated: Game.dragonDefeated,
        level10ChestGiven: Game.level10ChestGiven,
        stats: Game.stats,
        settings: Game.settings,
        binds: Game.binds,
        spells: Spells.serialize(),
        equipment: Equipment.serialize(),
        chests: Chests.serialize(),
        quests: Quests.serialize(),
        weather: Weather.serialize(),
        dungeonBosses: DungeonBosses.serialize(),
      };
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('FableCraft: save failed', e);
    }
  },

  load() {
    try {
      let raw = localStorage.getItem(this.KEY);
      if (!raw) {
        // Carry a ClayCraft-era save over to the new key
        raw = localStorage.getItem(this.OLD_KEY);
        if (raw) localStorage.setItem(this.KEY, raw);
      }
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || (data.v !== 1 && data.v !== 2)) return null;
      return data; // v1 saves load fine — new systems fall back to defaults
    } catch (e) {
      console.warn('FableCraft: load failed', e);
      return null;
    }
  },

  clear() {
    try { localStorage.removeItem(this.KEY); localStorage.removeItem(this.OLD_KEY); }
    catch (e) { /* storage unavailable */ }
  },

  update(dt) {
    if (!Game.started || Player.dead) return;
    this.timer += dt;
    if (this.timer >= this.INTERVAL) {
      this.timer = 0;
      this.save();
    }
  },
};
