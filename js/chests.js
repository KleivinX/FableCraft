'use strict';
/* FableCraft — chests: generated treasure (with rare variants) and player storage.
   Contents persist in the save file; first open of a generated chest rolls its loot. */

const Chests = {
  data: {}, // "x,y,z" -> array of 27 slots ([id,count] | 0)
  openKey: null,
  els: [],

  LOOT: [
    [ITEM.COAL, 1, 4, 0.18], [ITEM.IRON, 1, 3, 0.15], [ITEM.STICK, 2, 5, 0.10],
    [BLOCK.TORCH, 2, 5, 0.10], [BLOCK.PLANK, 2, 6, 0.10], [ITEM.LEATHER, 1, 3, 0.10],
    [ITEM.POT_HEALTH, 1, 2, 0.08], [ITEM.POT_STAMINA, 1, 1, 0.06],
    [ITEM.GOLD_INGOT, 1, 2, 0.07], [ITEM.CRYSTAL, 1, 1, 0.06],
  ],
  RARE_LOOT: [
    [ITEM.GOLD_INGOT, 2, 4, 0.16], [ITEM.CRYSTAL, 1, 3, 0.16], [ITEM.MANA_CRYSTAL, 1, 2, 0.13],
    [ITEM.DRAGON_CRYSTAL, 1, 1, 0.08], [ITEM.SPELL_BOOK, 1, 1, 0.07],
    [ITEM.POT_MANA, 1, 2, 0.09], [ITEM.POT_STRENGTH, 1, 1, 0.07], [ITEM.POT_REGEN, 1, 1, 0.07],
    [ITEM.IRON, 2, 5, 0.10],
  ],
  RARE_EQUIP: [ITEM.RING_VIT, ITEM.RING_FOCUS, ITEM.AMULET_REGEN, ITEM.SHIELD, ITEM.I_HELM, ITEM.I_BOOTS, ITEM.C_HELM, ITEM.C_BOOTS],

  init() {
    const grid = document.getElementById('chest-grid');
    grid.innerHTML = '';
    this.els = [];
    for (let i = 0; i < 27; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.addEventListener('mousedown', (e) => { e.preventDefault(); this.takeSlot(i); });
      grid.appendChild(d);
      this.els.push(d);
    }
    document.getElementById('chest-take-all').addEventListener('click', () => this.takeAll());
    document.getElementById('chest-close').addEventListener('click', () => this.close());
  },

  key(x, y, z) { return `${x},${y},${z}`; },

  markPlaced(x, y, z) {
    this.data[this.key(x, y, z)] = new Array(27).fill(0);
  },

  // The best loot in the game: a full Dragon armor set, top gear and rare materials
  bestLoot() {
    const items = [
      [ITEM.D_HELM, 1], [ITEM.D_CHEST, 1], [ITEM.D_LEGS, 1], [ITEM.D_BOOTS, 1],
      [ITEM.DRAGON_SWORD, 1], [ITEM.SHIELD, 1],
      [ITEM.AMULET_DRAGON, 1], [ITEM.RING_VIT, 1], [ITEM.RING_FOCUS, 1],
      [ITEM.STAFF, 1], [ITEM.SPELL_BOOK, 1],
      [ITEM.POT_HEALTH, 5], [ITEM.POT_MANA, 5], [ITEM.POT_STRENGTH, 3],
      [ITEM.POT_DRAGON, 3], [ITEM.POT_FIRERES, 3],
      [ITEM.MANA_CRYSTAL, 5], [ITEM.DRAGON_CRYSTAL, 4],
      [ITEM.CRYSTAL, 16], [ITEM.IRON, 16], [ITEM.GOLD_INGOT, 8],
    ];
    const slots = new Array(27).fill(0);
    for (let i = 0; i < items.length && i < 27; i++) slots[i] = items[i];
    return slots;
  },

  // Conjure a pre-filled rare chest on solid ground near the player (level-10 reward)
  spawnReward() {
    const px = Math.floor(Player.pos.x), py = Math.floor(Player.pos.y), pz = Math.floor(Player.pos.z);
    const offsets = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
    let spot = null;
    for (const [dx, dz] of offsets) {
      const x = px + dx, z = pz + dz;
      for (let y = py + 1; y >= py - 3; y--) {
        if (World.getBlock(x, y, z) === BLOCK.AIR && World.isSolid(x, y - 1, z)) { spot = { x, y, z }; break; }
      }
      if (spot) break;
    }
    if (!spot) spot = { x: px, y: py, z: pz }; // fallback: at the player's feet
    World.setBlock(spot.x, spot.y, spot.z, BLOCK.RARE_CHEST);
    this.data[this.key(spot.x, spot.y, spot.z)] = this.bestLoot();
    const center = new THREE.Vector3(spot.x + 0.5, spot.y + 0.5, spot.z + 0.5);
    Particles.levelUp(center);
    Particles.firework(center.clone().add(new THREE.Vector3(0, 1.5, 0)), '#ffd34d');
    AudioSys.play('quest');
    UI.banner('LEVEL 10!', 'A golden reward chest has appeared beside you', 4);
    UI.message('Open the golden chest for a full Dragon armor set and the best loot!', 5);
  },

  generateLoot(x, y, z, rare) {
    const rng = new RNG(Math.floor(hash3(x, y, z, World.seed ^ 0x10c4) * 0x7fffffff) || 1);
    const slots = new Array(27).fill(0);
    const table = rare ? this.RARE_LOOT : this.LOOT;
    const rolls = rare ? 4 + rng.int(3) : 3 + rng.int(3);
    let si = 0;
    for (let i = 0; i < rolls && si < 25; i++) {
      const roll = rng.next();
      let acc = 0;
      for (const [id, lo, hi, w] of table) {
        acc += w;
        if (roll < acc) {
          slots[si++] = [id, lo + rng.int(hi - lo + 1)];
          break;
        }
      }
    }
    if (rare && rng.next() < 0.55) slots[si++] = [this.RARE_EQUIP[rng.int(this.RARE_EQUIP.length)], 1];
    // Coins burst out when first opened
    const coins = rare ? 60 + rng.int(100) : 10 + rng.int(30);
    return { slots, coins };
  },

  open(x, y, z, blockId) {
    const key = this.key(x, y, z);
    if (!this.data[key]) {
      const { slots, coins } = this.generateLoot(x, y, z, blockId === BLOCK.RARE_CHEST);
      this.data[key] = slots;
      const pos = new THREE.Vector3(x + 0.5, y + 1.2, z + 0.5);
      for (let c = coins; c > 0;) {
        const v = Math.min(c, 10 + Math.floor(Math.random() * 10));
        Entities.spawnDrop(pos, { coins: v });
        c -= v;
      }
    }
    this.openKey = key;
    AudioSys.play('chestopen');
    document.getElementById('chest-title').textContent = blockId === BLOCK.RARE_CHEST ? 'Rare Chest' : 'Chest';
    document.getElementById('chest-screen').classList.remove('hidden');
    Game.setUIOpen(true);
    this.refresh();
  },

  close() {
    this.openKey = null;
    document.getElementById('chest-screen').classList.add('hidden');
    Game.setUIOpen(false);
  },

  isOpen() { return this.openKey !== null; },

  refresh() {
    const slots = this.data[this.openKey];
    if (!slots) return;
    for (let i = 0; i < 27; i++) {
      const s = slots[i];
      this.els[i].innerHTML = s
        ? `<img src="${Items.iconURL(s[0])}" alt="" draggable="false">` + (s[1] > 1 ? `<span class="slot-count">${s[1]}</span>` : '')
        : '';
    }
  },

  takeSlot(i) {
    const slots = this.data[this.openKey];
    if (!slots || !slots[i]) return;
    const [id, count] = slots[i];
    const left = Inv.add(id, count);
    slots[i] = left > 0 ? [id, left] : 0;
    if (left > 0) UI.message('Inventory full!', 1.5);
    AudioSys.play('click');
    this.refresh();
  },

  takeAll() {
    const slots = this.data[this.openKey];
    if (!slots) return;
    for (let i = 0; i < 27; i++) {
      if (!slots[i]) continue;
      const [id, count] = slots[i];
      const left = Inv.add(id, count);
      slots[i] = left > 0 ? [id, left] : 0;
    }
    AudioSys.play('click');
    this.refresh();
  },

  // Deposit from the player's selected inventory interaction (called by Inv when a chest is open)
  deposit(id, count) {
    const slots = this.data[this.openKey];
    if (!slots) return count;
    const max = Inv.stackMax(id);
    for (let i = 0; i < 27 && count > 0; i++) {
      if (slots[i] && slots[i][0] === id && slots[i][1] < max) {
        const mv = Math.min(max - slots[i][1], count);
        slots[i][1] += mv; count -= mv;
      }
    }
    for (let i = 0; i < 27 && count > 0; i++) {
      if (!slots[i]) {
        const mv = Math.min(max, count);
        slots[i] = [id, mv]; count -= mv;
      }
    }
    this.refresh();
    return count;
  },

  onBreak(x, y, z) {
    const key = this.key(x, y, z);
    const slots = this.data[key];
    if (slots) {
      const pos = new THREE.Vector3(x + 0.5, y + 0.6, z + 0.5);
      for (const s of slots) {
        if (s) Entities.spawnDrop(pos, { item: s[0], count: s[1] });
      }
      delete this.data[key];
    }
    if (this.openKey === key) this.close();
  },

  serialize() { return this.data; },
  load(d) { this.data = d || {}; },
};
