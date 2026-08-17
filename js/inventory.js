'use strict';
/* FableCraft — inventory: 9-slot hotbar + 27-slot storage, 64-stack items, drag & drop UI. */

const Inv = {
  slots: new Array(36).fill(null), // 0-8 hotbar, 9-35 storage
  sel: 0,
  carried: null,
  isOpen: false,
  hbEls: [], gridEls: [],

  init() {
    const hb = document.getElementById('hotbar');
    hb.innerHTML = '';
    this.hbEls = [];
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'hb-slot';
      d.innerHTML = `<span class="hb-key">${i + 1}</span>`;
      hb.appendChild(d);
      this.hbEls.push(d);
    }

    const grid = document.getElementById('inv-grid');
    const hbRow = document.getElementById('inv-hotbar-row');
    grid.innerHTML = ''; hbRow.innerHTML = '';
    this.gridEls = new Array(36);
    const makeSlot = (parent, idx) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.addEventListener('mousedown', (e) => { e.preventDefault(); this.slotClick(idx, e); });
      parent.appendChild(d);
      this.gridEls[idx] = d;
    };
    for (let i = 9; i < 36; i++) makeSlot(grid, i);
    for (let i = 0; i < 9; i++) makeSlot(hbRow, i);

    document.addEventListener('mousemove', (e) => {
      const c = document.getElementById('carried-item');
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
    });
    document.getElementById('inv-close').addEventListener('click', () => this.close());

    this.refresh();
  },

  stackMax(id) { const it = Items.get(id); return it ? it.stack : 64; },

  add(id, count) {
    if (!Items.get(id)) return count;
    const want = count;
    const max = this.stackMax(id);
    // Merge into existing stacks (hotbar first)
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max) {
        const take = Math.min(max - s.count, count);
        s.count += take; count -= take;
      }
    }
    // Fill empty slots
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, count);
        this.slots[i] = { id, count: take };
        count -= take;
      }
    }
    if (want - count > 0) Quests.onCollect(id, want - count);
    this.refresh();
    return count;
  },

  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    if (this.carried && this.carried.id === id) n += this.carried.count;
    return n;
  },

  take(id, count) {
    if (this.countOf(id) < count) return false;
    for (let i = 35; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const t = Math.min(s.count, count);
        s.count -= t; count -= t;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    if (count > 0 && this.carried && this.carried.id === id) {
      const t = Math.min(this.carried.count, count);
      this.carried.count -= t; count -= t;
      if (this.carried.count <= 0) this.carried = null;
    }
    this.refresh();
    return true;
  },

  hasAll(ingredients) {
    return ingredients.every(g => this.countOf(g.id) >= g.count);
  },

  consumeAll(ingredients) {
    if (!this.hasAll(ingredients)) return false;
    for (const g of ingredients) this.take(g.id, g.count);
    return true;
  },

  selectedSlot() { return this.slots[this.sel]; },
  selectedItem() { const s = this.slots[this.sel]; return s ? Items.get(s.id) : null; },

  useSelected(n = 1) {
    const s = this.slots[this.sel];
    if (!s) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[this.sel] = null;
    this.refresh();
    return true;
  },

  select(i) {
    this.sel = Utils.clamp(i, 0, 8);
    this.refresh();
  },

  /* ---------- UI ---------- */
  slotHTML(s) {
    if (!s) return '';
    return `<img src="${Items.iconURL(s.id)}" alt="" draggable="false">` +
      (s.count > 1 ? `<span class="slot-count">${s.count}</span>` : '');
  },

  refresh() {
    for (let i = 0; i < 9; i++) {
      const el = this.hbEls[i];
      if (!el) continue;
      el.classList.toggle('selected', i === this.sel);
      el.innerHTML = `<span class="hb-key">${i + 1}</span>` + this.slotHTML(this.slots[i]);
    }
    if (this.isOpen) {
      for (let i = 0; i < 36; i++) {
        const el = this.gridEls[i];
        if (el) el.innerHTML = this.slotHTML(this.slots[i]);
      }
      const c = document.getElementById('carried-item');
      if (this.carried) {
        c.classList.remove('hidden');
        c.innerHTML = this.slotHTML(this.carried);
      } else {
        c.classList.add('hidden');
        c.innerHTML = '';
      }
      Crafting.refresh();
      Equipment.renderInto(document.getElementById('equip-grid'), document.getElementById('equip-stats'));
    }
  },

  slotClick(i, e) {
    AudioSys.play('click');
    const s = this.slots[i];
    if (e.shiftKey && s && !this.carried) {
      // With a chest open, shift-click deposits into the chest
      if (Chests.isOpen()) {
        const left = Chests.deposit(s.id, s.count);
        if (left <= 0) this.slots[i] = null;
        else s.count = left;
        this.refresh();
        return;
      }
      // Quick-move between hotbar and storage
      const targetRange = i < 9 ? [9, 36] : [0, 9];
      const max = this.stackMax(s.id);
      for (let j = targetRange[0]; j < targetRange[1] && s.count > 0; j++) {
        const t = this.slots[j];
        if (t && t.id === s.id && t.count < max) {
          const mv = Math.min(max - t.count, s.count);
          t.count += mv; s.count -= mv;
        }
      }
      if (s.count > 0) {
        for (let j = targetRange[0]; j < targetRange[1]; j++) {
          if (!this.slots[j]) { this.slots[j] = { id: s.id, count: s.count }; s.count = 0; break; }
        }
      }
      if (s.count <= 0) this.slots[i] = null;
      this.refresh();
      return;
    }

    if (e.button === 2 || (e.button === 0 && e.altKey)) {
      // Right-click on equipment/potions/books: equip, drink or use
      if (!this.carried && s) {
        const item = Items.get(s.id);
        if (item && item.kind === 'potion') {
          Player.drinkPotion(item);
          s.count--;
          if (s.count <= 0) this.slots[i] = null;
          this.refresh();
          return;
        }
        if (item && item.kind === 'use') {
          if (Spells.unlockRandom()) {
            s.count--;
            if (s.count <= 0) this.slots[i] = null;
          } else {
            UI.message('You already know every spell!', 2);
          }
          this.refresh();
          return;
        }
        if (item && Equipment.slotFor(item)) {
          this.slots[i] = null;
          const prev = Equipment.equip(s.id);
          if (prev) this.slots[i] = { id: prev, count: 1 };
          Player.applyEquipment();
          this.refresh();
          return;
        }
      }
      // Right-click: split / place one
      if (this.carried) {
        if (!s) {
          this.slots[i] = { id: this.carried.id, count: 1 };
          this.carried.count--;
        } else if (s.id === this.carried.id && s.count < this.stackMax(s.id)) {
          s.count++; this.carried.count--;
        }
        if (this.carried.count <= 0) this.carried = null;
      } else if (s && s.count > 1) {
        const half = Math.ceil(s.count / 2);
        this.carried = { id: s.id, count: half };
        s.count -= half;
        if (s.count <= 0) this.slots[i] = null;
      }
      this.refresh();
      return;
    }

    // Left click: pick up / put down / swap / merge
    if (!this.carried) {
      if (s) { this.carried = s; this.slots[i] = null; }
    } else if (!s) {
      this.slots[i] = this.carried; this.carried = null;
    } else if (s.id === this.carried.id) {
      const max = this.stackMax(s.id);
      const mv = Math.min(max - s.count, this.carried.count);
      s.count += mv; this.carried.count -= mv;
      if (this.carried.count <= 0) this.carried = null;
    } else {
      const tmp = this.carried; this.carried = s; this.slots[i] = tmp;
    }
    this.refresh();
  },

  open() {
    this.isOpen = true;
    document.getElementById('inventory-screen').classList.remove('hidden');
    Game.setUIOpen(true);
    this.refresh();
  },

  close() {
    // Return carried item to inventory before closing
    if (this.carried) {
      const { id, count } = this.carried;
      this.carried = null;
      const left = this.add(id, count);
      if (left > 0) Entities.spawnDrop(Player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { item: id, count: left });
    }
    this.isOpen = false;
    document.getElementById('inventory-screen').classList.add('hidden');
    document.getElementById('carried-item').classList.add('hidden');
    Game.setUIOpen(false);
  },

  toggle() { this.isOpen ? this.close() : this.open(); },

  serialize() { return this.slots.map(s => s ? [s.id, s.count] : 0); },

  load(arr) {
    if (!arr) return;
    this.slots = arr.map(v => (v && Array.isArray(v)) ? { id: v[0], count: v[1] } : null);
    while (this.slots.length < 36) this.slots.push(null);
    this.refresh();
  },
};
