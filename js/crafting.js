'use strict';
/* FableCraft — crafting. Basic recipes are available from the inventory;
   the placed Crafting Table opens a dedicated categorized workshop UI. */

const Crafting = {
  CATS: ['Weapons', 'Tools', 'Armor', 'Magic', 'Utility'],
  activeCat: 'Weapons',
  tableOpen: false,
  basicEls: [],

  RECIPES: [
    // Basics (craftable anywhere, shown in the inventory panel)
    { cat: 'Basics', name: 'Planks ×4', result: { id: BLOCK.PLANK, count: 4 }, ing: [{ id: BLOCK.WOOD, count: 1 }] },
    { cat: 'Basics', name: 'Sticks ×4', result: { id: ITEM.STICK, count: 4 }, ing: [{ id: BLOCK.PLANK, count: 2 }] },
    { cat: 'Basics', name: 'Crafting Table', result: { id: BLOCK.TABLE, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 4 }] },
    { cat: 'Basics', name: 'Torch ×4', result: { id: BLOCK.TORCH, count: 4 }, ing: [{ id: ITEM.STICK, count: 1 }, { id: BLOCK.WOOD, count: 1 }] },

    // Weapons
    { cat: 'Weapons', result: { id: ITEM.WOOD_SWORD, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 2 }, { id: ITEM.STICK, count: 1 }] },
    { cat: 'Weapons', result: { id: ITEM.STONE_SWORD, count: 1 }, ing: [{ id: BLOCK.STONE, count: 2 }, { id: ITEM.STICK, count: 1 }] },
    { cat: 'Weapons', result: { id: ITEM.IRON_SWORD, count: 1 }, ing: [{ id: ITEM.IRON, count: 2 }, { id: ITEM.STICK, count: 1 }] },
    { cat: 'Weapons', result: { id: ITEM.CRYSTAL_SWORD, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 2 }, { id: ITEM.IRON, count: 1 }, { id: ITEM.STICK, count: 1 }] },
    { cat: 'Weapons', result: { id: ITEM.DRAGON_SWORD, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 3 }, { id: ITEM.IRON, count: 1 }, { id: ITEM.STICK, count: 1 }] },

    // Tools
    { cat: 'Tools', result: { id: ITEM.WOOD_PICK, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 3 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.STONE_PICK, count: 1 }, ing: [{ id: BLOCK.STONE, count: 3 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.IRON_PICK, count: 1 }, ing: [{ id: ITEM.IRON, count: 3 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.WOOD_AXE, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 3 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.STONE_AXE, count: 1 }, ing: [{ id: BLOCK.STONE, count: 3 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.IRON_AXE, count: 1 }, ing: [{ id: ITEM.IRON, count: 3 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.WOOD_SHOVEL, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 1 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.STONE_SHOVEL, count: 1 }, ing: [{ id: BLOCK.STONE, count: 1 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.IRON_SHOVEL, count: 1 }, ing: [{ id: ITEM.IRON, count: 1 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.CRYSTAL_PICK, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 3 }, { id: ITEM.IRON, count: 1 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.CRYSTAL_AXE, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 3 }, { id: ITEM.IRON, count: 1 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.CRYSTAL_SHOVEL, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 2 }, { id: ITEM.IRON, count: 1 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.DRAGON_PICK, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 3 }, { id: ITEM.CRYSTAL, count: 2 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.DRAGON_AXE, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 3 }, { id: ITEM.CRYSTAL, count: 2 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Tools', result: { id: ITEM.DRAGON_SHOVEL, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 2 }, { id: ITEM.CRYSTAL, count: 2 }, { id: ITEM.STICK, count: 2 }] },

    // Armor
    { cat: 'Armor', result: { id: ITEM.L_HELM, count: 1 }, ing: [{ id: ITEM.LEATHER, count: 5 }] },
    { cat: 'Armor', result: { id: ITEM.L_CHEST, count: 1 }, ing: [{ id: ITEM.LEATHER, count: 8 }] },
    { cat: 'Armor', result: { id: ITEM.L_LEGS, count: 1 }, ing: [{ id: ITEM.LEATHER, count: 7 }] },
    { cat: 'Armor', result: { id: ITEM.L_BOOTS, count: 1 }, ing: [{ id: ITEM.LEATHER, count: 4 }] },
    { cat: 'Armor', result: { id: ITEM.I_HELM, count: 1 }, ing: [{ id: ITEM.IRON, count: 5 }] },
    { cat: 'Armor', result: { id: ITEM.I_CHEST, count: 1 }, ing: [{ id: ITEM.IRON, count: 8 }] },
    { cat: 'Armor', result: { id: ITEM.I_LEGS, count: 1 }, ing: [{ id: ITEM.IRON, count: 7 }] },
    { cat: 'Armor', result: { id: ITEM.I_BOOTS, count: 1 }, ing: [{ id: ITEM.IRON, count: 4 }] },
    { cat: 'Armor', result: { id: ITEM.C_HELM, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 5 }] },
    { cat: 'Armor', result: { id: ITEM.C_CHEST, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 8 }] },
    { cat: 'Armor', result: { id: ITEM.C_LEGS, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 7 }] },
    { cat: 'Armor', result: { id: ITEM.C_BOOTS, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 4 }] },
    { cat: 'Armor', result: { id: ITEM.D_HELM, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 3 }, { id: ITEM.IRON, count: 2 }] },
    { cat: 'Armor', result: { id: ITEM.D_CHEST, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 5 }, { id: ITEM.IRON, count: 3 }] },
    { cat: 'Armor', result: { id: ITEM.D_LEGS, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 4 }, { id: ITEM.IRON, count: 2 }] },
    { cat: 'Armor', result: { id: ITEM.D_BOOTS, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 2 }, { id: ITEM.IRON, count: 1 }] },
    { cat: 'Armor', result: { id: ITEM.SHIELD, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 6 }, { id: ITEM.IRON, count: 1 }] },

    // Magic
    { cat: 'Magic', result: { id: ITEM.WAND, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 1 }, { id: ITEM.STICK, count: 2 }] },
    { cat: 'Magic', result: { id: ITEM.STAFF, count: 1 }, ing: [{ id: ITEM.MANA_CRYSTAL, count: 2 }, { id: ITEM.STICK, count: 3 }] },
    { cat: 'Magic', result: { id: ITEM.EMBER_STAFF, count: 1 }, ing: [{ id: ITEM.MANA_CRYSTAL, count: 2 }, { id: ITEM.COAL, count: 6 }, { id: ITEM.STICK, count: 3 }] },
    { cat: 'Magic', result: { id: ITEM.FROST_STAFF, count: 1 }, ing: [{ id: ITEM.MANA_CRYSTAL, count: 2 }, { id: ITEM.CRYSTAL, count: 4 }, { id: ITEM.STICK, count: 3 }] },
    { cat: 'Magic', result: { id: ITEM.STORM_STAFF, count: 1 }, ing: [{ id: ITEM.MANA_CRYSTAL, count: 3 }, { id: ITEM.GOLD_INGOT, count: 3 }, { id: ITEM.STICK, count: 3 }] },
    { cat: 'Magic', result: { id: ITEM.DRAGONBONE_STAFF, count: 1 }, ing: [{ id: ITEM.DRAGON_CRYSTAL, count: 3 }, { id: ITEM.MANA_CRYSTAL, count: 2 }, { id: ITEM.STICK, count: 3 }] },
    { cat: 'Magic', result: { id: ITEM.SPELL_BOOK, count: 1 }, ing: [{ id: ITEM.LEATHER, count: 3 }, { id: ITEM.MANA_CRYSTAL, count: 2 }] },
    { cat: 'Magic', result: { id: ITEM.MANA_CRYSTAL, count: 1 }, ing: [{ id: ITEM.CRYSTAL, count: 4 }] },

    // Utility
    { cat: 'Utility', name: 'Torch ×4', result: { id: BLOCK.TORCH, count: 4 }, ing: [{ id: ITEM.STICK, count: 1 }, { id: BLOCK.WOOD, count: 1 }] },
    { cat: 'Utility', result: { id: BLOCK.CHEST, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 8 }] },
    { cat: 'Utility', result: { id: BLOCK.FURNACE, count: 1 }, ing: [{ id: BLOCK.STONE, count: 8 }] },
    { cat: 'Utility', name: 'Ladder ×4', result: { id: BLOCK.LADDER, count: 4 }, ing: [{ id: ITEM.STICK, count: 7 }] },
    { cat: 'Utility', result: { id: BLOCK.DOOR_C, count: 1 }, ing: [{ id: BLOCK.PLANK, count: 6 }] },
    { cat: 'Utility', result: { id: BLOCK.BREWING, count: 1 }, ing: [{ id: BLOCK.STONE, count: 4 }, { id: ITEM.IRON, count: 2 }, { id: ITEM.CRYSTAL, count: 1 }] },
  ],

  init() {
    // Basic crafting panel inside the inventory screen
    const list = document.getElementById('craft-list');
    list.innerHTML = '';
    this.basicEls = [];
    this.RECIPES.filter(r => r.cat === 'Basics').forEach((r) => {
      const el = this.recipeEl(r);
      list.appendChild(el);
      this.basicEls.push([r, el]);
    });

    // Crafting table screen tabs
    const tabs = document.getElementById('craft-tabs');
    tabs.innerHTML = '';
    for (const cat of this.CATS) {
      const b = document.createElement('button');
      b.className = 'btn tab';
      b.textContent = cat;
      b.dataset.cat = cat;
      b.addEventListener('click', () => { this.activeCat = cat; this.refreshTable(); });
      tabs.appendChild(b);
    }
    document.getElementById('craftscreen-close').addEventListener('click', () => this.closeTable());
  },

  recipeEl(r) {
    const item = Items.get(r.result.id);
    const d = document.createElement('div');
    d.className = 'recipe';
    const ingText = r.ing.map(g => `${g.count}× ${Items.get(g.id).name}`).join(', ');
    const desc = Items.describe(r.result.id);
    d.innerHTML = `
      <img src="${Items.iconURL(r.result.id)}" alt="">
      <div class="r-info">
        <div class="r-name">${r.name || item.name}</div>
        <div class="r-ing">${ingText}</div>
        ${desc ? `<div class="r-desc">${desc}</div>` : ''}
      </div>
      <button class="btn">Craft</button>`;
    d.querySelector('button').addEventListener('click', () => this.craft(r));
    return d;
  },

  canCraft(r) { return Inv.hasAll(r.ing); },

  craft(r) {
    if (!this.canCraft(r)) return;
    Inv.consumeAll(r.ing);
    const left = Inv.add(r.result.id, r.result.count);
    if (left > 0) Entities.spawnDrop(Player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { item: r.result.id, count: left });
    AudioSys.play('craft');
    Quests.onCraft(r.result.id);
    this.refresh();
    this.refreshTable();
  },

  /* ---- inventory basic panel ---- */
  refresh() {
    for (const [r, el] of this.basicEls) {
      el.querySelector('button').disabled = !this.canCraft(r);
      el.querySelector('.r-ing').classList.toggle('missing', !this.canCraft(r));
    }
  },

  /* ---- crafting table screen ---- */
  openTable() {
    this.tableOpen = true;
    document.getElementById('craft-screen').classList.remove('hidden');
    Game.setUIOpen(true);
    this.refreshTable();
  },

  closeTable() {
    this.tableOpen = false;
    document.getElementById('craft-screen').classList.add('hidden');
    Game.setUIOpen(false);
  },

  refreshTable() {
    if (!this.tableOpen) return;
    document.querySelectorAll('#craft-tabs .tab').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === this.activeCat);
    });
    const list = document.getElementById('craft-table-list');
    list.innerHTML = '';
    for (const r of this.RECIPES.filter(r => r.cat === this.activeCat)) {
      const el = this.recipeEl(r);
      el.querySelector('button').disabled = !this.canCraft(r);
      el.querySelector('.r-ing').classList.toggle('missing', !this.canCraft(r));
      list.appendChild(el);
    }
  },
};
