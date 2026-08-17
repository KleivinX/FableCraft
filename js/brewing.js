'use strict';
/* FableCraft — potion brewing at the Brewing Station: herbal base + a reagent → 2 potions. */

const Brewing = {
  RECIPES: [
    { result: ITEM.POT_HEALTH,   ing: [[BLOCK.LEAVES, 3], [ITEM.LEATHER, 1]] },
    { result: ITEM.POT_MANA,     ing: [[BLOCK.LEAVES, 3], [ITEM.CRYSTAL, 1]] },
    { result: ITEM.POT_STAMINA,  ing: [[BLOCK.LEAVES, 3], [BLOCK.SAND, 2]] },
    { result: ITEM.POT_SPEED,    ing: [[BLOCK.LEAVES, 3], [ITEM.STICK, 2]] },
    { result: ITEM.POT_STRENGTH, ing: [[BLOCK.LEAVES, 3], [ITEM.IRON, 2]] },
    { result: ITEM.POT_REGEN,    ing: [[BLOCK.LEAVES, 3], [ITEM.GOLD_INGOT, 1]] },
    { result: ITEM.POT_FIRERES,  ing: [[BLOCK.LEAVES, 3], [ITEM.COAL, 3]] },
    { result: ITEM.POT_DRAGON,   ing: [[BLOCK.LEAVES, 3], [ITEM.DRAGON_CRYSTAL, 1]] },
  ],
  els: [],
  isOpen: false,

  init() {
    const list = document.getElementById('brew-list');
    list.innerHTML = '';
    this.els = [];
    this.RECIPES.forEach((r, i) => {
      const item = Items.get(r.result);
      const d = document.createElement('div');
      d.className = 'recipe';
      const ingText = r.ing.map(([id, n]) => `${n}× ${Items.get(id).name}`).join(', ');
      d.innerHTML = `
        <img src="${Items.iconURL(r.result)}" alt="">
        <div class="r-info">
          <div class="r-name">${item.name} ×2</div>
          <div class="r-ing">${ingText}</div>
          <div class="r-desc">${Items.describe(r.result)}</div>
        </div>
        <button class="btn">Brew</button>`;
      d.querySelector('button').addEventListener('click', () => this.brew(i));
      list.appendChild(d);
      this.els.push(d);
    });
    document.getElementById('brew-close').addEventListener('click', () => this.close());
  },

  ingredients(r) { return r.ing.map(([id, count]) => ({ id, count })); },

  brew(i) {
    const r = this.RECIPES[i];
    if (!Inv.hasAll(this.ingredients(r))) return;
    Inv.consumeAll(this.ingredients(r));
    const left = Inv.add(r.result, 2);
    if (left > 0) Entities.spawnDrop(Player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { item: r.result, count: left });
    AudioSys.play('brew');
    Particles.emit({
      pos: Player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
      count: 12, spread: 0.4, velSpread: 1.5, life: 0.8, size: 0.7,
      colors: [Items.get(r.result).color, '#ffffff'], gravity: -2,
    });
    Quests.onCraft(r.result);
    this.refresh();
  },

  open() {
    this.isOpen = true;
    document.getElementById('brew-screen').classList.remove('hidden');
    Game.setUIOpen(true);
    this.refresh();
  },

  close() {
    this.isOpen = false;
    document.getElementById('brew-screen').classList.add('hidden');
    Game.setUIOpen(false);
  },

  refresh() {
    if (!this.isOpen) return;
    this.RECIPES.forEach((r, i) => {
      const ok = Inv.hasAll(this.ingredients(r));
      this.els[i].querySelector('button').disabled = !ok;
      this.els[i].querySelector('.r-ing').classList.toggle('missing', !ok);
    });
  },
};
