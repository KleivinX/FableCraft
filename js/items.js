'use strict';
/* FableCraft — item database + generated pixel-art icons (all drawn in code).
   Kinds: block | tool | misc | material | magic | equip | potion | use */

const Items = {
  DB: {},
  iconCache: {},

  TIER_COLORS: {
    wood: '#c8b078', stone: '#9a9aa2', iron: '#c8ccd4',
    crystal: '#74d6e8', dragon: '#d14a2e',
    leather: '#8a5a33', gold: '#ffd34d',
  },

  build() {
    // Block items share the block id
    for (const idStr of Object.keys(Blocks.DEFS)) {
      const id = +idStr;
      if (id === BLOCK.WATER || id === BLOCK.PORTAL || id === BLOCK.BEDROCK ||
          id === BLOCK.DOOR_O || id === BLOCK.EARTH || id === BLOCK.RARE_CHEST) continue;
      const d = Blocks.DEFS[id];
      this.DB[id] = { id, name: d.name, stack: 64, kind: 'block', blockId: id, value: 2 };
    }
    this.DB[BLOCK.CHEST].value = 20;
    this.DB[BLOCK.BREWING].value = 60;
    this.DB[BLOCK.TORCH].value = 3;
    this.DB[BLOCK.LADDER].value = 4;
    this.DB[BLOCK.DOOR_C].value = 12;

    const T = (id, name, toolType, dmg, speed, tier, value) => {
      this.DB[id] = { id, name, stack: 1, kind: 'tool', tool: { type: toolType, dmg, speed, tier }, value };
    };
    T(ITEM.WOOD_SWORD, 'Wooden Sword', 'sword', 4, 1, 1, 12);
    T(ITEM.STONE_SWORD, 'Stone Sword', 'sword', 7, 1, 2, 25);
    T(ITEM.IRON_SWORD, 'Iron Sword', 'sword', 11, 1, 3, 80);
    T(ITEM.CRYSTAL_SWORD, 'Crystal Sword', 'sword', 16, 1, 4, 220);
    T(ITEM.DRAGON_SWORD, 'Dragon Sword', 'sword', 24, 1, 5, 600);
    T(ITEM.WOOD_PICK, 'Wooden Pickaxe', 'pickaxe', 1, 3.5, 1, 12);
    T(ITEM.STONE_PICK, 'Stone Pickaxe', 'pickaxe', 2, 5.5, 2, 25);
    T(ITEM.IRON_PICK, 'Iron Pickaxe', 'pickaxe', 3, 8, 3, 80);
    T(ITEM.WOOD_AXE, 'Wooden Axe', 'axe', 2, 3, 1, 12);
    T(ITEM.STONE_AXE, 'Stone Axe', 'axe', 3, 4.5, 2, 25);
    T(ITEM.IRON_AXE, 'Iron Axe', 'axe', 4, 7, 3, 80);
    T(ITEM.CRYSTAL_PICK, 'Crystal Pickaxe', 'pickaxe', 4, 11, 4, 230);
    T(ITEM.DRAGON_PICK, 'Dragon Pickaxe', 'pickaxe', 5, 15, 5, 620);
    T(ITEM.CRYSTAL_AXE, 'Crystal Axe', 'axe', 6, 10, 4, 230);
    T(ITEM.DRAGON_AXE, 'Dragon Axe', 'axe', 8, 13.5, 5, 620);
    T(ITEM.WOOD_SHOVEL, 'Wooden Shovel', 'shovel', 1, 3.5, 1, 10);
    T(ITEM.STONE_SHOVEL, 'Stone Shovel', 'shovel', 2, 5.5, 2, 20);
    T(ITEM.IRON_SHOVEL, 'Iron Shovel', 'shovel', 3, 8, 3, 70);
    T(ITEM.CRYSTAL_SHOVEL, 'Crystal Shovel', 'shovel', 4, 11, 4, 210);
    T(ITEM.DRAGON_SHOVEL, 'Dragon Shovel', 'shovel', 5, 15, 5, 580);

    const M = (id, name, value) => { this.DB[id] = { id, name, stack: 64, kind: 'material', value }; };
    M(ITEM.STICK, 'Stick', 1);
    M(ITEM.COAL, 'Coal', 6);
    M(ITEM.IRON, 'Iron Ingot', 14);
    M(ITEM.GOLD_INGOT, 'Gold Ingot', 28);
    M(ITEM.CRYSTAL, 'Crystal Shard', 35);
    M(ITEM.MANA_CRYSTAL, 'Mana Crystal', 90);
    M(ITEM.DRAGON_CRYSTAL, 'Dragon Crystal', 180);
    M(ITEM.LEATHER, 'Leather', 8);
    this.DB[ITEM.DRAGON_CORE] = { id: ITEM.DRAGON_CORE, name: 'Dragon Core', stack: 64, kind: 'material', value: 500 };

    // Magic implements: boost spell power when held
    this.DB[ITEM.WAND] = { id: ITEM.WAND, name: 'Wand', stack: 1, kind: 'magic', magic: { power: 1.15 }, value: 120 };
    this.DB[ITEM.STAFF] = { id: ITEM.STAFF, name: 'Arcane Staff', stack: 1, kind: 'magic', magic: { power: 1.35 }, value: 300 };
    const ST = (id, name, power, value) => {
      this.DB[id] = { id, name, stack: 1, kind: 'magic', magic: { power }, value };
    };
    ST(ITEM.EMBER_STAFF, 'Ember Staff', 1.5, 420);
    ST(ITEM.FROST_STAFF, 'Frost Staff', 1.6, 500);
    ST(ITEM.STORM_STAFF, 'Storm Staff', 1.75, 720);
    ST(ITEM.DRAGONBONE_STAFF, 'Dragonbone Staff', 2.0, 1100);
    this.DB[ITEM.SPELL_BOOK] = { id: ITEM.SPELL_BOOK, name: 'Spell Book', stack: 16, kind: 'use', value: 250 };

    // Armor: [slot, leather/iron/crystal/dragon armor points]
    const armorSets = [
      ['L', 'Leather', 'leather', 2, [5, 8, 7, 4], 30],
      ['I', 'Iron', 'iron', 4, [5, 8, 7, 4], 90],
      ['C', 'Crystal', 'crystal', 6, [5, 8, 7, 4], 240],
      ['D', 'Dragon', 'dragon', 9, [3, 5, 4, 2], 550],
    ];
    const slots = [['HELM', 'helmet', 'Helmet'], ['CHEST', 'chest', 'Chestplate'], ['LEGS', 'legs', 'Leggings'], ['BOOTS', 'boots', 'Boots']];
    for (const [pfx, setName, tier, armor, , value] of armorSets) {
      for (const [key, slot, slotName] of slots) {
        const id = ITEM[`${pfx}_${key}`];
        const mult = { helmet: 0.8, chest: 1.3, legs: 1.1, boots: 0.8 }[slot];
        this.DB[id] = {
          id, name: `${setName} ${slotName}`, stack: 1, kind: 'equip',
          equip: { slot, armor: Math.round(armor * mult), tier },
          value: Math.round(value * mult),
        };
      }
    }
    this.DB[ITEM.SHIELD] = { id: ITEM.SHIELD, name: 'Iron Shield', stack: 1, kind: 'equip', equip: { slot: 'shield', armor: 4, tier: 'iron', bonus: { knockResist: 0.5 } }, value: 100 };
    this.DB[ITEM.RING_VIT] = { id: ITEM.RING_VIT, name: 'Ring of Vitality', stack: 1, kind: 'equip', equip: { slot: 'ring', armor: 0, tier: 'gold', bonus: { maxHp: 25 } }, value: 200 };
    this.DB[ITEM.RING_FOCUS] = { id: ITEM.RING_FOCUS, name: 'Ring of Focus', stack: 1, kind: 'equip', equip: { slot: 'ring', armor: 0, tier: 'crystal', bonus: { maxMana: 30 } }, value: 200 };
    this.DB[ITEM.AMULET_REGEN] = { id: ITEM.AMULET_REGEN, name: 'Amulet of Renewal', stack: 1, kind: 'equip', equip: { slot: 'amulet', armor: 0, tier: 'gold', bonus: { hpRegen: 1, manaRegen: 2 } }, value: 300 };
    this.DB[ITEM.AMULET_DRAGON] = { id: ITEM.AMULET_DRAGON, name: 'Dragonfang Amulet', stack: 1, kind: 'equip', equip: { slot: 'amulet', armor: 1, tier: 'dragon', bonus: { dmgMult: 0.12 } }, value: 450 };

    const P = (id, name, potion, color, value) => {
      this.DB[id] = { id, name, stack: 16, kind: 'potion', potion, color, value };
    };
    P(ITEM.POT_HEALTH, 'Health Potion', { hp: 60 }, '#e23b3b', 30);
    P(ITEM.POT_MANA, 'Mana Potion', { mana: 80 }, '#4d6df0', 30);
    P(ITEM.POT_STAMINA, 'Stamina Potion', { stamina: 100 }, '#3bd95e', 22);
    P(ITEM.POT_SPEED, 'Speed Potion', { buff: 'speed', dur: 30 }, '#5ec9ff', 40);
    P(ITEM.POT_STRENGTH, 'Strength Potion', { buff: 'strength', dur: 30 }, '#ff8c1a', 50);
    P(ITEM.POT_REGEN, 'Regeneration Potion', { buff: 'regen', dur: 20 }, '#ff7ab8', 50);
    P(ITEM.POT_FIRERES, 'Fire Resistance Potion', { buff: 'fireres', dur: 60 }, '#ffd34d', 60);
    P(ITEM.POT_DRAGON, 'Dragon Slayer Potion', { buff: 'dragon', dur: 60 }, '#b14df0', 80);
  },

  get(id) { return this.DB[id]; },

  describe(id) {
    const it = this.DB[id];
    if (!it) return '';
    if (it.kind === 'tool') return it.tool.type === 'sword' ? `+${it.tool.dmg} damage` : `Tier ${it.tool.tier} ${it.tool.type}`;
    if (it.kind === 'equip') {
      const parts = [];
      if (it.equip.armor) parts.push(`+${it.equip.armor} armor`);
      const b = it.equip.bonus || {};
      if (b.maxHp) parts.push(`+${b.maxHp} HP`);
      if (b.maxMana) parts.push(`+${b.maxMana} mana`);
      if (b.hpRegen) parts.push('HP regen');
      if (b.manaRegen) parts.push('mana regen');
      if (b.dmgMult) parts.push(`+${Math.round(b.dmgMult * 100)}% damage`);
      if (b.knockResist) parts.push('knockback resist');
      return parts.join(', ');
    }
    if (it.kind === 'magic') return `+${Math.round((it.magic.power - 1) * 100)}% spell power`;
    if (it.kind === 'potion') {
      const p = it.potion;
      if (p.hp) return `Restores ${p.hp} HP`;
      if (p.mana) return `Restores ${p.mana} mana`;
      if (p.stamina) return 'Restores stamina';
      return `${p.dur}s buff`;
    }
    if (it.kind === 'use') return 'Use: unlocks a new spell';
    return '';
  },

  /* ================= ICONS ================= */
  iconURL(id) {
    if (this.iconCache[id]) return this.iconCache[id];
    const cv = document.createElement('canvas');
    cv.width = 48; cv.height = 48;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const item = this.DB[id];
    if (!item) return '';
    if (item.kind === 'block') this.drawBlockIcon(ctx, item.blockId);
    else this.drawIcon(ctx, item);
    const url = cv.toDataURL();
    this.iconCache[id] = url;
    return url;
  },

  drawBlockIcon(ctx, blockId) {
    const tile = Blocks.tileFor(blockId, 0);
    const topTile = Blocks.tileFor(blockId, 2);
    const ts = Blocks.TS;
    const sx = (tile % Blocks.GRID) * ts, sy = Math.floor(tile / Blocks.GRID) * ts;
    const def = Blocks.DEFS[blockId];
    if (def.torch || def.panel) {
      ctx.drawImage(Blocks.atlasCanvas, sx, sy, ts, ts, 4, 4, 40, 40);
      return;
    }
    const tx = (topTile % Blocks.GRID) * ts, ty = Math.floor(topTile / Blocks.GRID) * ts;
    ctx.drawImage(Blocks.atlasCanvas, sx, sy, ts, ts, 5, 14, 38, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(5, 14, 38, 30);
    ctx.drawImage(Blocks.atlasCanvas, sx, sy, ts, ts, 5, 14, 38, 30);
    ctx.drawImage(Blocks.atlasCanvas, tx, ty, ts, ts, 5, 5, 38, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(5, 5, 38, 11);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeRect(5.5, 5.5, 37, 38);
  },

  toolTint(item) {
    if (!item.tool) return this.TIER_COLORS.wood;
    return [null, this.TIER_COLORS.wood, this.TIER_COLORS.stone, this.TIER_COLORS.iron, this.TIER_COLORS.crystal, this.TIER_COLORS.dragon][item.tool.tier];
  },

  drawIcon(ctx, item) {
    const wood = '#8a6035', woodDark = '#6b4a2b';
    const id = item.id;
    ctx.save();

    if (item.kind === 'tool') {
      const c = this.toolTint(item);
      const hi = '#ffffff44';
      ctx.translate(24, 24);
      ctx.rotate(-Math.PI / 4);
      switch (item.tool.type) {
        case 'sword':
          ctx.fillStyle = c; ctx.fillRect(-3, -22, 6, 26);
          ctx.fillStyle = hi; ctx.fillRect(-3, -22, 2, 26);
          ctx.fillStyle = woodDark; ctx.fillRect(-8, 4, 16, 4);
          ctx.fillStyle = wood; ctx.fillRect(-2, 8, 4, 12);
          break;
        case 'pickaxe':
          ctx.fillStyle = wood; ctx.fillRect(-2, -14, 4, 34);
          ctx.fillStyle = c;
          ctx.fillRect(-14, -16, 28, 4);
          ctx.fillRect(-16, -14, 4, 7); ctx.fillRect(12, -14, 4, 7);
          break;
        case 'axe':
          ctx.fillStyle = wood; ctx.fillRect(-2, -14, 4, 34);
          ctx.fillStyle = c;
          ctx.fillRect(-2, -18, 14, 9); ctx.fillRect(2, -10, 9, 5);
          break;
        case 'shovel':
          ctx.fillStyle = wood; ctx.fillRect(-2, -12, 4, 32);
          ctx.fillStyle = c;
          ctx.fillRect(-5, -20, 10, 10); ctx.fillRect(-3, -22, 6, 2);
          break;
      }
      ctx.restore();
      return;
    }

    switch (id) {
      case ITEM.STICK:
        ctx.translate(24, 24); ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = wood; ctx.fillRect(-2, -14, 4, 28);
        ctx.fillStyle = woodDark; ctx.fillRect(-2, -14, 1.5, 28);
        break;
      case ITEM.COAL:
        this.lump(ctx, ['#1d1d1d', '#0f0f0f', '#333']);
        break;
      case ITEM.IRON: this.ingot(ctx, '#c8ccd4', '#9aa0aa'); break;
      case ITEM.GOLD_INGOT: this.ingot(ctx, '#ffd34d', '#c8a32e'); break;
      case ITEM.LEATHER:
        ctx.fillStyle = '#8a5a33'; ctx.fillRect(10, 12, 28, 24);
        ctx.fillStyle = '#6e4626'; ctx.fillRect(10, 12, 28, 5); ctx.fillRect(10, 12, 5, 24);
        ctx.fillStyle = '#a3713f'; ctx.fillRect(30, 28, 8, 8);
        break;
      case ITEM.CRYSTAL: this.gem(ctx, '#74d6e8', '#b8f0fa'); break;
      case ITEM.MANA_CRYSTAL: this.gem(ctx, '#8a4df0', '#d9b8ff', true); break;
      case ITEM.DRAGON_CRYSTAL: this.gem(ctx, '#d14a2e', '#ffb35c', true); break;
      case ITEM.DRAGON_CORE: {
        const g = ctx.createRadialGradient(24, 24, 2, 24, 24, 18);
        g.addColorStop(0, '#ffe9b0'); g.addColorStop(0.4, '#ff8c1a'); g.addColorStop(0.8, '#8a2be2'); g.addColorStop(1, 'rgba(80,10,140,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(24, 24, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(18, 16, 3, 3); ctx.fillRect(28, 26, 2, 2);
        break;
      }
      case ITEM.WAND:
        ctx.translate(24, 24); ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = wood; ctx.fillRect(-2, -8, 4, 26);
        this.gemAt(ctx, 0, -13, 6, '#74d6e8', '#b8f0fa');
        break;
      case ITEM.STAFF:
        ctx.translate(24, 24); ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = woodDark; ctx.fillRect(-2.5, -10, 5, 32);
        this.gemAt(ctx, 0, -15, 9, '#8a4df0', '#d9b8ff');
        break;
      // Elemental staffs: same silhouette, each crowned with its own focus stone
      case ITEM.EMBER_STAFF:
      case ITEM.FROST_STAFF:
      case ITEM.STORM_STAFF:
      case ITEM.DRAGONBONE_STAFF: {
        const focus = {
          [ITEM.EMBER_STAFF]: ['#e2452b', '#ffc46a', '#6b3a22'],
          [ITEM.FROST_STAFF]: ['#3fa8e8', '#c8f0ff', '#4a6b8a'],
          [ITEM.STORM_STAFF]: ['#7a5cf0', '#e0d4ff', '#3a3355'],
          [ITEM.DRAGONBONE_STAFF]: ['#d14a2e', '#ffe9b0', '#e4e0cf'],
        }[id];
        ctx.translate(24, 24); ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = focus[2]; ctx.fillRect(-2.5, -10, 5, 32);
        ctx.fillStyle = '#ffffff33'; ctx.fillRect(-2.5, -10, 1.5, 32);
        // Prongs cradling the stone
        ctx.fillStyle = focus[2];
        ctx.fillRect(-7, -18, 3, 9); ctx.fillRect(4, -18, 3, 9);
        this.gemAt(ctx, 0, -16, 9, focus[0], focus[1]);
        break;
      }
      case ITEM.SPELL_BOOK:
        ctx.fillStyle = '#4a2a7a'; ctx.fillRect(10, 8, 28, 32);
        ctx.fillStyle = '#6b3db0'; ctx.fillRect(10, 8, 6, 32);
        ctx.fillStyle = '#ffd34d';
        ctx.fillRect(22, 16, 10, 3); ctx.fillRect(25, 13, 4, 9);
        ctx.fillRect(20, 30, 14, 2);
        break;
      case ITEM.SHIELD:
        ctx.fillStyle = '#9aa0aa';
        ctx.beginPath(); ctx.moveTo(24, 6); ctx.lineTo(40, 12); ctx.lineTo(38, 30); ctx.lineTo(24, 42); ctx.lineTo(10, 30); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c8ccd4';
        ctx.fillRect(22, 10, 4, 28); ctx.fillRect(12, 22, 24, 4);
        break;
      case ITEM.RING_VIT:
      case ITEM.RING_FOCUS: {
        ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(24, 28, 11, 0, Math.PI * 2); ctx.stroke();
        this.gemAt(ctx, 24, 12, 6, id === ITEM.RING_VIT ? '#e23b3b' : '#74d6e8', '#fff');
        break;
      }
      case ITEM.AMULET_REGEN:
      case ITEM.AMULET_DRAGON: {
        ctx.strokeStyle = '#c8a32e'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(24, 16, 12, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
        this.gemAt(ctx, 24, 30, 8, id === ITEM.AMULET_REGEN ? '#ff7ab8' : '#d14a2e', '#ffe9b0');
        break;
      }
      default:
        if (item.kind === 'potion') this.bottle(ctx, item.color);
        else if (item.kind === 'equip') this.armorIcon(ctx, item);
        break;
    }
    ctx.restore();
  },

  lump(ctx, colors) {
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(12 + Math.floor(Math.random() * 20), 14 + Math.floor(Math.random() * 18), 5, 5);
    }
  },

  ingot(ctx, c, dark) {
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(8, 30); ctx.lineTo(16, 18); ctx.lineTo(40, 18); ctx.lineTo(32, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(8, 28); ctx.lineTo(16, 16); ctx.lineTo(40, 16); ctx.lineTo(32, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff55'; ctx.fillRect(18, 18, 14, 3);
  },

  gem(ctx, c, hi, glow) {
    if (glow) {
      const g = ctx.createRadialGradient(24, 24, 4, 24, 24, 20);
      g.addColorStop(0, c + 'aa'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 48, 48);
    }
    this.gemAt(ctx, 24, 24, 14, c, hi);
  },

  gemAt(ctx, x, y, r, c, hi) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x + r * 0.3, y); ctx.lineTo(x, y + r * 0.2); ctx.lineTo(x - r * 0.3, y); ctx.closePath(); ctx.fill();
  },

  bottle(ctx, liquid) {
    ctx.fillStyle = '#b8d4e2';
    ctx.fillRect(20, 6, 8, 8);
    ctx.fillStyle = '#8a6035'; ctx.fillRect(19, 4, 10, 4);
    ctx.fillStyle = '#b8d4e288';
    ctx.beginPath(); ctx.arc(24, 28, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = liquid;
    ctx.beginPath(); ctx.arc(24, 30, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff66'; ctx.fillRect(18, 22, 4, 4);
  },

  armorIcon(ctx, item) {
    const c = this.TIER_COLORS[item.equip.tier] || '#999';
    const dark = '#00000033';
    ctx.fillStyle = c;
    switch (item.equip.slot) {
      case 'helmet':
        ctx.fillRect(12, 14, 24, 12);
        ctx.fillRect(14, 10, 20, 6);
        ctx.fillStyle = dark; ctx.fillRect(16, 20, 7, 5); ctx.fillRect(25, 20, 7, 5);
        break;
      case 'chest':
        ctx.fillRect(14, 10, 20, 26);
        ctx.fillRect(8, 10, 7, 12); ctx.fillRect(33, 10, 7, 12);
        ctx.fillStyle = dark; ctx.fillRect(22, 14, 4, 18);
        break;
      case 'legs':
        ctx.fillRect(14, 10, 20, 9);
        ctx.fillRect(14, 19, 8, 20); ctx.fillRect(26, 19, 8, 20);
        break;
      case 'boots':
        ctx.fillRect(11, 22, 8, 12); ctx.fillRect(11, 30, 12, 6);
        ctx.fillRect(28, 22, 8, 12); ctx.fillRect(28, 30, 12, 6);
        break;
      default:
        ctx.fillRect(14, 14, 20, 20);
    }
  },
};
