'use strict';
/* FableCraft — equipment: 8 gear slots with armor and stat bonuses,
   plus blacksmith forge levels that scale weapon damage and armor. */

const Equipment = {
  SLOTS: ['helmet', 'chest', 'legs', 'boots', 'weapon', 'shield', 'ring', 'amulet'],
  SLOT_LABELS: { helmet: 'Helmet', chest: 'Chestplate', legs: 'Leggings', boots: 'Boots', weapon: 'Weapon', shield: 'Shield', ring: 'Ring', amulet: 'Amulet' },
  slots: { helmet: null, chest: null, legs: null, boots: null, weapon: null, shield: null, ring: null, amulet: null },
  smith: { weapon: 0, armor: 0 }, // blacksmith forge levels (0-5)

  slotFor(item) {
    if (!item) return null;
    if (item.kind === 'equip') return item.equip.slot;
    if (item.kind === 'tool' && item.tool.type === 'sword') return 'weapon';
    return null;
  },

  // Equip an item id; returns the previously equipped id (or null), or undefined if not equippable
  equip(itemId) {
    const item = Items.get(itemId);
    const slot = this.slotFor(item);
    if (!slot) return undefined;
    const prev = this.slots[slot];
    this.slots[slot] = itemId;
    AudioSys.play('equip');
    return prev || null;
  },

  unequip(slot) {
    const id = this.slots[slot];
    this.slots[slot] = null;
    return id;
  },

  totalArmor() {
    let a = 0;
    for (const s of this.SLOTS) {
      const id = this.slots[s];
      if (!id) continue;
      const it = Items.get(id);
      if (it && it.equip) a += it.equip.armor;
    }
    return Math.round(a * (1 + this.smith.armor * 0.06));
  },

  damageReduction() {
    const a = this.totalArmor();
    return a / (a + 50);
  },

  bonuses() {
    const out = { maxHp: 0, maxMana: 0, manaRegen: 0, hpRegen: 0, dmgMult: 0, knockResist: 0 };
    for (const s of this.SLOTS) {
      const id = this.slots[s];
      if (!id) continue;
      const it = Items.get(id);
      const b = it && it.equip && it.equip.bonus;
      if (!b) continue;
      for (const k of Object.keys(out)) if (b[k]) out[k] += b[k];
    }
    return out;
  },

  weaponDamage() {
    const id = this.slots.weapon;
    if (!id) return 0;
    const it = Items.get(id);
    return it && it.tool ? it.tool.dmg : 0;
  },

  smithUpgradeCost(kind) { return { coins: 200 * (this.smith[kind] + 1), iron: 3 }; },
  canSmithUpgrade(kind) {
    if (this.smith[kind] >= 5) return false;
    const c = this.smithUpgradeCost(kind);
    return Player.coins >= c.coins && Inv.countOf(ITEM.IRON) >= c.iron;
  },
  smithUpgrade(kind) {
    if (!this.canSmithUpgrade(kind)) return false;
    const c = this.smithUpgradeCost(kind);
    Player.coins -= c.coins;
    Inv.take(ITEM.IRON, c.iron);
    this.smith[kind]++;
    AudioSys.play('craft');
    return true;
  },

  /* ---------- UI (rendered into the inventory screen) ---------- */
  renderInto(container, statsEl) {
    container.innerHTML = '';
    for (const slot of this.SLOTS) {
      const d = document.createElement('div');
      d.className = 'equip-slot';
      const id = this.slots[slot];
      if (id) {
        d.innerHTML = `<img src="${Items.iconURL(id)}" alt="" draggable="false" title="${Items.get(id).name}">`;
        d.title = `${Items.get(id).name} — click to unequip`;
      } else {
        d.innerHTML = `<span class="equip-label">${this.SLOT_LABELS[slot]}</span>`;
        d.title = this.SLOT_LABELS[slot];
      }
      d.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const cur = this.slots[slot];
        if (!cur) return;
        const left = Inv.add(cur, 1);
        if (left > 0) { UI.message('Inventory full!', 1.5); return; }
        this.unequip(slot);
        AudioSys.play('click');
        Player.applyEquipment();
        Inv.refresh();
      });
      container.appendChild(d);
    }
    if (statsEl) {
      const b = this.bonuses();
      const red = Math.round(this.damageReduction() * 100);
      statsEl.innerHTML =
        `<div>Damage <b>${Player.attackDamage()}</b></div>` +
        `<div>Armor <b>${this.totalArmor()}</b> <span class="dim">(-${red}% dmg)</span></div>` +
        `<div>Max HP <b>${Player.maxHealth}</b> · Max Mana <b>${Player.maxMana}</b></div>` +
        `<div>Forge: weapon +${this.smith.weapon * 6}% · armor +${this.smith.armor * 6}%</div>` +
        (b.dmgMult ? `<div>Bonus damage +${Math.round(b.dmgMult * 100)}%</div>` : '');
    }
  },

  serialize() { return { slots: this.slots, smith: this.smith }; },
  load(d) {
    if (!d) return;
    if (d.slots) for (const s of this.SLOTS) this.slots[s] = d.slots[s] || null;
    if (d.smith) this.smith = { weapon: d.smith.weapon || 0, armor: d.smith.armor || 0 };
  },
};
