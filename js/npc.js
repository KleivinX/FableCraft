'use strict';
/* FableCraft — friendly NPCs at the spawn plaza: Merchant (shop), Blacksmith (forge),
   Wizard (spell upgrades) and the Arena Master (lore + quests). */

const NPC = {
  list: [],
  scene: null,
  current: null,

  ROLES: {
    merchant: {
      name: 'Maro the Merchant', robe: 0x2a6b3f, trim: 0xffd34d,
      greet: 'Welcome, traveler! Coins for goods, goods for coins — everyone leaves happy.',
    },
    blacksmith: {
      name: 'Bruna the Blacksmith', robe: 0x5a3a2a, trim: 0xc8ccd4,
      greet: 'Steel sharpens steel. Bring me coin and iron, and I\'ll make your gear bite harder.',
    },
    wizard: {
      name: 'Eldrin the Wizard', robe: 0x4a2a7a, trim: 0xb14df0,
      greet: 'Ah, a spark of talent! Magic grows with practice... and a modest tuition fee.',
    },
    arenamaster: {
      name: 'Korga the Arena Master', robe: 0x6b2a2a, trim: 0xff8c1a,
      greet: 'See that purple portal? Three waves of monsters, then the Dragon. Win, and you\'ll be a legend.',
    },
  },

  SHOP: [
    { id: ITEM.POT_HEALTH, price: 60 }, { id: ITEM.POT_MANA, price: 60 },
    { id: ITEM.POT_STAMINA, price: 45 }, { id: ITEM.POT_SPEED, price: 80 },
    { id: ITEM.POT_STRENGTH, price: 100 }, { id: ITEM.POT_REGEN, price: 100 },
    { id: ITEM.POT_FIRERES, price: 120 }, { id: ITEM.POT_DRAGON, price: 160 },
    { id: BLOCK.TORCH, price: 4 }, { id: BLOCK.LADDER, price: 8 },
    { id: ITEM.COAL, price: 12 }, { id: ITEM.IRON, price: 28 }, { id: ITEM.LEATHER, price: 16 },
    { id: ITEM.CRYSTAL, price: 70 }, { id: ITEM.MANA_CRYSTAL, price: 180 },
    { id: ITEM.WAND, price: 240 }, { id: ITEM.STAFF, price: 600 },
    { id: ITEM.SHIELD, price: 200 }, { id: ITEM.RING_VIT, price: 400 },
    { id: ITEM.RING_FOCUS, price: 400 }, { id: ITEM.AMULET_REGEN, price: 600 },
  ],

  init(scene) {
    this.scene = scene;
    for (const n of this.list) {
      scene.remove(n.mesh);
      if (n.label) scene.remove(n.label);
    }
    this.list = [];
    const S = World.SPAWN;
    const spots = [
      ['merchant', S.x - 6, S.z + 3, 0.9],
      ['blacksmith', S.x - 6, S.z - 4, 0.5],
      ['wizard', S.x + 6, S.z - 4, -0.5],
      ['arenamaster', S.x + 6, S.z + 3, -0.9],
    ];
    for (const [role, x, z, yaw] of spots) {
      this.spawn(role, x + 0.5, S.h + 1, z + 0.5, yaw);
    }
  },

  spawn(role, x, y, z, yaw) {
    const R = this.ROLES[role];
    const g = new THREE.Group();
    const M = (c) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w, h, d, mat, bx, by, bz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(bx, by, bz);
      return m;
    };
    const robe = M(R.robe), trim = M(R.trim), skin = M(0xd9a878), dark = M(0x222222);
    g.add(box(0.62, 1.05, 0.4, robe, 0, 0.85, 0));        // robe body
    g.add(box(0.66, 0.12, 0.44, trim, 0, 1.32, 0));        // trim band
    const head = box(0.46, 0.46, 0.46, skin, 0, 1.62, 0);
    head.add(box(0.08, 0.08, 0.04, dark, -0.1, 0.04, 0.24));
    head.add(box(0.08, 0.08, 0.04, dark, 0.1, 0.04, 0.24));
    g.add(head);
    g.add(box(0.5, 0.14, 0.5, trim, 0, 1.9, 0));           // hat brim
    g.add(box(0.3, 0.28, 0.3, robe, 0, 2.06, 0));          // hat top
    g.add(box(0.16, 0.7, 0.16, robe, -0.39, 0.95, 0));     // arms
    g.add(box(0.16, 0.7, 0.16, robe, 0.39, 0.95, 0));
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.scene.add(g);

    const label = Utils.makeTextSprite(R.name.split(' ')[0], { color: '#aef2b6', glow: '#2a6b3f', scale: 0.55, fontSize: 48 });
    label.position.set(x, y + 2.6, z);
    this.scene.add(label);

    this.list.push({ role, mesh: g, head, label, pos: new THREE.Vector3(x, y, z), baseYaw: yaw, bob: Math.random() * 6 });
  },

  update(dt) {
    for (const n of this.list) {
      n.bob += dt;
      n.mesh.position.y = n.pos.y + Math.sin(n.bob * 1.6) * 0.03;
      const d = Utils.dist2D(Player.pos.x, Player.pos.z, n.pos.x, n.pos.z);
      if (d < 7) {
        const target = Math.atan2(Player.pos.x - n.pos.x, Player.pos.z - n.pos.z);
        let dy = target - n.mesh.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        n.mesh.rotation.y += dy * Math.min(1, 5 * dt);
      }
    }
  },

  // Find an NPC under the crosshair within reach
  rayPick(eye, look, maxDist) {
    let best = null, bestDist = maxDist;
    for (const n of this.list) {
      const c = n.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
      const to = c.sub(eye);
      const d = to.length();
      if (d > bestDist) continue;
      if (to.normalize().dot(look) < 0.8) continue;
      best = n; bestDist = d;
    }
    return best;
  },

  /* ---------------- dialogue UI ---------------- */
  el(id) { return document.getElementById(id); },

  openDialogue(npc) {
    this.current = npc;
    AudioSys.play('talk');
    const R = this.ROLES[npc.role];
    this.el('npc-name').textContent = R.name;
    this.el('npc-text').textContent = R.greet;
    this.el('npc-screen').classList.remove('hidden');
    Game.setUIOpen(true);
    this.showMain();
  },

  close() {
    this.current = null;
    this.el('npc-screen').classList.add('hidden');
    Game.setUIOpen(false);
  },

  isOpen() { return this.current !== null; },

  buttons(list) {
    const row = this.el('npc-buttons');
    row.innerHTML = '';
    for (const [label, fn] of list) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      row.appendChild(b);
    }
  },

  showMain() {
    const role = this.current.role;
    this.el('npc-content').innerHTML = '';
    const btns = [];
    if (role === 'merchant') {
      btns.push(['Buy', () => this.showBuy()], ['Sell', () => this.showSell()]);
    } else if (role === 'blacksmith') {
      btns.push(['Forge Upgrades', () => this.showSmith()]);
    } else if (role === 'wizard') {
      btns.push(['Spell Training', () => this.showWizard()]);
    } else if (role === 'arenamaster') {
      btns.push(
        ['About the Arena', () => this.showAbout()],
        ['Quests', () => { this.close(); Quests.open(); }]
      );
    }
    btns.push(['Farewell', () => this.close()]);
    this.buttons(btns);
  },

  showAbout() {
    this.el('npc-content').innerHTML = `
      <div class="npc-lore">
        <p>The <b>WAVE ARENA</b> lies beyond the purple portal. Step through and the gates seal behind you.</p>
        <p>Three waves: zombies first, then skeleton archers, then the spiders join. Clear them all and the
        <b>Ancient Dragon</b> wakes — three phases, each angrier than the last.</p>
        <p>Bring a strong sword, armor, and potions. The dragon's fire melts the unprepared. Win, and the
        Champion Portal carries you home a legend.</p>
      </div>`;
    this.buttons([['Back', () => this.showMain()], ['Farewell', () => this.close()]]);
  },

  showBuy() {
    const c = this.el('npc-content');
    c.innerHTML = '<div class="shop-list"></div>';
    const listEl = c.firstChild;
    for (const entry of this.SHOP) {
      const item = Items.get(entry.id);
      const row = document.createElement('div');
      row.className = 'recipe';
      row.innerHTML = `
        <img src="${Items.iconURL(entry.id)}" alt="">
        <div class="r-info"><div class="r-name">${item.name}</div><div class="r-ing">${Items.describe(entry.id) || '&nbsp;'}</div></div>
        <span class="price">${entry.price}🪙</span>
        <button class="btn" ${Player.coins < entry.price ? 'disabled' : ''}>Buy</button>`;
      row.querySelector('button').addEventListener('click', () => {
        if (Player.coins < entry.price) return;
        const left = Inv.add(entry.id, 1);
        if (left > 0) { UI.message('Inventory full!', 1.5); return; }
        Player.coins -= entry.price;
        AudioSys.play('coin');
        this.showBuy();
      });
      listEl.appendChild(row);
    }
    this.buttons([['Back', () => this.showMain()], ['Farewell', () => this.close()]]);
  },

  showSell() {
    const c = this.el('npc-content');
    c.innerHTML = '<div class="shop-list"></div>';
    const listEl = c.firstChild;
    const counted = {};
    for (const s of Inv.slots) if (s) counted[s.id] = (counted[s.id] || 0) + s.count;
    const ids = Object.keys(counted).map(Number).filter(id => (Items.get(id) || {}).value > 0);
    if (ids.length === 0) listEl.innerHTML = '<p class="dim">Nothing to sell.</p>';
    for (const id of ids) {
      const item = Items.get(id);
      const price = Math.max(1, Math.floor(item.value / 2));
      const row = document.createElement('div');
      row.className = 'recipe';
      row.innerHTML = `
        <img src="${Items.iconURL(id)}" alt="">
        <div class="r-info"><div class="r-name">${item.name} ×${counted[id]}</div><div class="r-ing">${price}🪙 each</div></div>
        <button class="btn" data-one>Sell 1</button>
        <button class="btn" data-all>All</button>`;
      const sell = (n) => {
        const have = Inv.countOf(id);
        n = Math.min(n, have);
        if (n <= 0) return;
        Inv.take(id, n);
        Player.addCoins(price * n);
        Game.stats.coinsEarned += price * n;
        this.showSell();
      };
      row.querySelector('[data-one]').addEventListener('click', () => sell(1));
      row.querySelector('[data-all]').addEventListener('click', () => sell(counted[id]));
      listEl.appendChild(row);
    }
    this.buttons([['Back', () => this.showMain()], ['Farewell', () => this.close()]]);
  },

  showSmith() {
    const c = this.el('npc-content');
    const row = (kind, label) => {
      const lvl = Equipment.smith[kind];
      if (lvl >= 5) return `<div class="recipe"><div class="r-info"><div class="r-name">${label} — MAX</div></div></div>`;
      const cost = Equipment.smithUpgradeCost(kind);
      return `<div class="recipe">
        <div class="r-info">
          <div class="r-name">${label} ${lvl}/5 → +${(lvl + 1) * 6}%</div>
          <div class="r-ing">${cost.coins}🪙 + ${cost.iron}× Iron Ingot</div>
        </div>
        <button class="btn" data-kind="${kind}" ${Equipment.canSmithUpgrade(kind) ? '' : 'disabled'}>Forge</button>
      </div>`;
    };
    c.innerHTML = row('weapon', 'Weapon Honing') + row('armor', 'Armor Tempering');
    c.querySelectorAll('button[data-kind]').forEach(b => {
      b.addEventListener('click', () => {
        if (Equipment.smithUpgrade(b.dataset.kind)) {
          Player.applyEquipment();
          this.showSmith();
        }
      });
    });
    this.buttons([['Back', () => this.showMain()], ['Farewell', () => this.close()]]);
  },

  showWizard() {
    const c = this.el('npc-content');
    c.innerHTML = '';
    for (const def of Spells.DEFS) {
      const unlocked = Spells.isUnlocked(def.key);
      const lvl = Spells.level(def.key);
      const row = document.createElement('div');
      row.className = 'recipe';
      if (!unlocked) {
        const hint = def.special ? 'Defeat the Dragon, or read a Spell Book' : `Unlocks at level ${def.unlockLevel}`;
        row.innerHTML = `
          <img src="${Spells.iconURL(def.key)}" alt="" style="opacity:0.35">
          <div class="r-info"><div class="r-name dim">${def.name}</div><div class="r-ing">${hint}</div></div>`;
      } else if (lvl >= 5) {
        row.innerHTML = `
          <img src="${Spells.iconURL(def.key)}" alt="">
          <div class="r-info"><div class="r-name">${def.name} — MASTERED</div><div class="r-ing">${def.desc}</div></div>`;
      } else {
        row.innerHTML = `
          <img src="${Spells.iconURL(def.key)}" alt="">
          <div class="r-info">
            <div class="r-name">${def.name} Lv ${lvl}/5</div>
            <div class="r-ing">+25% power, -10% cooldown, -8% cost · ${Spells.upgradeCost(def.key)}🪙</div>
          </div>
          <button class="btn" ${Spells.canUpgrade(def.key) ? '' : 'disabled'}>Train</button>`;
        row.querySelector('button').addEventListener('click', () => {
          if (Spells.upgrade(def.key)) this.showWizard();
        });
      }
      c.appendChild(row);
    }
    this.buttons([['Back', () => this.showMain()], ['Farewell', () => this.close()]]);
  },
};
