'use strict';
/* FableCraft — block definitions + procedurally painted texture atlas.
   Every texture is generated at runtime on a canvas: 100% original, copyright-free. */

const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6, WATER: 7,
  PLANK: 8, TABLE: 9, FURNACE: 10, TORCH: 11, PORTAL: 12, SMOOTH: 13,
  DARK: 14, GLOW: 15, BEDROCK: 16, GOLD: 17,
  COAL_ORE: 18, IRON_ORE: 19, GOLD_ORE: 20, CRYSTAL_ORE: 21,
  CHEST: 22, RARE_CHEST: 23, LADDER: 24, DOOR_C: 25, DOOR_O: 26,
  BREWING: 27, EARTH: 28,
};

// Item ids (non-block items; defined here because block drops reference them)
const ITEM = {
  WOOD_SWORD: 100, STONE_SWORD: 101,
  WOOD_PICK: 102, STONE_PICK: 103,
  WOOD_AXE: 104, STONE_AXE: 105,
  STICK: 106, DRAGON_CORE: 107,
  IRON_SWORD: 108, CRYSTAL_SWORD: 109, DRAGON_SWORD: 110,
  IRON_PICK: 111, IRON_AXE: 112,
  WOOD_SHOVEL: 113, STONE_SHOVEL: 114, IRON_SHOVEL: 115,
  CRYSTAL_PICK: 116, DRAGON_PICK: 117, CRYSTAL_AXE: 118, DRAGON_AXE: 119,
  CRYSTAL_SHOVEL: 127, DRAGON_SHOVEL: 128,
  EMBER_STAFF: 133, FROST_STAFF: 134, STORM_STAFF: 135, DRAGONBONE_STAFF: 136,
  COAL: 120, IRON: 121, GOLD_INGOT: 122, CRYSTAL: 123,
  MANA_CRYSTAL: 124, DRAGON_CRYSTAL: 125, LEATHER: 126,
  WAND: 130, STAFF: 131, SPELL_BOOK: 132,
  L_HELM: 140, L_CHEST: 141, L_LEGS: 142, L_BOOTS: 143,
  I_HELM: 144, I_CHEST: 145, I_LEGS: 146, I_BOOTS: 147,
  C_HELM: 148, C_CHEST: 149, C_LEGS: 150, C_BOOTS: 151,
  D_HELM: 152, D_CHEST: 153, D_LEGS: 154, D_BOOTS: 155,
  SHIELD: 156,
  RING_VIT: 158, RING_FOCUS: 159, AMULET_REGEN: 160, AMULET_DRAGON: 161,
  POT_HEALTH: 170, POT_MANA: 171, POT_STAMINA: 172, POT_SPEED: 173,
  POT_STRENGTH: 174, POT_REGEN: 175, POT_FIRERES: 176, POT_DRAGON: 177,
};

const TILE = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, LOG_SIDE: 5, LOG_TOP: 6,
  LEAVES: 7, WATER: 8, PLANK: 9, TABLE_TOP: 10, TABLE_SIDE: 11, FURNACE: 12,
  FURNACE_TOP: 13, TORCH: 14, PORTAL: 15, SMOOTH: 16, DARK: 17, GLOW: 18, GOLD: 19, BEDROCK: 20,
  COAL_O: 21, IRON_O: 22, GOLD_O: 23, CRYS_O: 24, CHEST_T: 25, RARE_CHEST_T: 26,
  LADDER_T: 27, DOOR_T: 28, DOOR_O_T: 29, BREW_T: 30, EARTH_T: 31,
};

const Blocks = {
  TS: 32, GRID: 8, // 8x8 tiles of 32px → 256px atlas. Painters draw in a 16-unit
  LS: 16,          // logical grid (LS) that is scaled up, so detail can exceed the grid.
  atlasCanvas: null,
  texture: null,
  solidMat: null, transMat: null,
  tileColors: [],

  DEFS: {
    [BLOCK.GRASS]:   { name: 'Grass',          solid: true,  opaque: true,  breakTime: 0.6, tool: 'shovel', drop: BLOCK.GRASS,  tiles: { top: TILE.GRASS_TOP, bottom: TILE.DIRT, side: TILE.GRASS_SIDE } },
    [BLOCK.DIRT]:    { name: 'Dirt',           solid: true,  opaque: true,  breakTime: 0.5, tool: 'shovel', drop: BLOCK.DIRT,   tiles: { all: TILE.DIRT } },
    [BLOCK.STONE]:   { name: 'Stone',          solid: true,  opaque: true,  breakTime: 3.0, tool: 'pickaxe', drop: BLOCK.STONE, tiles: { all: TILE.STONE } },
    [BLOCK.SAND]:    { name: 'Sand',           solid: true,  opaque: true,  breakTime: 0.5, tool: 'shovel', drop: BLOCK.SAND,   tiles: { all: TILE.SAND } },
    [BLOCK.WOOD]:    { name: 'Wood',           solid: true,  opaque: true,  breakTime: 1.6, tool: 'axe', drop: BLOCK.WOOD, tiles: { top: TILE.LOG_TOP, bottom: TILE.LOG_TOP, side: TILE.LOG_SIDE } },
    [BLOCK.LEAVES]:  { name: 'Leaves',         solid: true,  opaque: true,  breakTime: 0.3, drop: BLOCK.LEAVES, tiles: { all: TILE.LEAVES } },
    [BLOCK.WATER]:   { name: 'Water',          solid: false, opaque: false, liquid: true, translucent: true, unbreakable: true, tiles: { all: TILE.WATER } },
    [BLOCK.PLANK]:   { name: 'Planks',         solid: true,  opaque: true,  breakTime: 1.2, tool: 'axe', drop: BLOCK.PLANK, tiles: { all: TILE.PLANK } },
    [BLOCK.TABLE]:   { name: 'Crafting Table', solid: true,  opaque: true,  breakTime: 1.4, tool: 'axe', drop: BLOCK.TABLE, tiles: { top: TILE.TABLE_TOP, bottom: TILE.PLANK, side: TILE.TABLE_SIDE } },
    [BLOCK.FURNACE]: { name: 'Furnace',        solid: true,  opaque: true,  breakTime: 3.0, tool: 'pickaxe', drop: BLOCK.FURNACE, tiles: { top: TILE.FURNACE_TOP, bottom: TILE.FURNACE_TOP, side: TILE.FURNACE } },
    [BLOCK.TORCH]:   { name: 'Torch',          solid: false, opaque: false, breakTime: 0.1, drop: BLOCK.TORCH, torch: true, tiles: { all: TILE.TORCH } },
    [BLOCK.PORTAL]:  { name: 'Portal',         solid: false, opaque: false, translucent: true, unbreakable: true, tiles: { all: TILE.PORTAL } },
    [BLOCK.SMOOTH]:  { name: 'Arena Stone',    solid: true,  opaque: true,  unbreakable: true, tiles: { all: TILE.SMOOTH } },
    [BLOCK.DARK]:    { name: 'Dark Stone',     solid: true,  opaque: true,  unbreakable: true, tiles: { all: TILE.DARK } },
    [BLOCK.GLOW]:    { name: 'Glow Block',     solid: true,  opaque: true,  unbreakable: true, tiles: { all: TILE.GLOW } },
    [BLOCK.BEDROCK]: { name: 'Bedrock',        solid: true,  opaque: true,  unbreakable: true, tiles: { all: TILE.BEDROCK } },
    [BLOCK.GOLD]:    { name: 'Gold Block',     solid: true,  opaque: true,  unbreakable: true, tiles: { all: TILE.GOLD } },

    [BLOCK.COAL_ORE]:    { name: 'Coal Ore',    solid: true, opaque: true, breakTime: 3.5, tool: 'pickaxe', tier: 1, drop: ITEM.COAL,    tiles: { all: TILE.COAL_O } },
    [BLOCK.IRON_ORE]:    { name: 'Iron Ore',    solid: true, opaque: true, breakTime: 4.0, tool: 'pickaxe', tier: 2, drop: ITEM.IRON,    tiles: { all: TILE.IRON_O } },
    [BLOCK.GOLD_ORE]:    { name: 'Gold Ore',    solid: true, opaque: true, breakTime: 4.5, tool: 'pickaxe', tier: 3, drop: ITEM.GOLD_INGOT, tiles: { all: TILE.GOLD_O } },
    [BLOCK.CRYSTAL_ORE]: { name: 'Crystal Ore', solid: true, opaque: true, breakTime: 5.0, tool: 'pickaxe', tier: 3, drop: ITEM.CRYSTAL, tiles: { all: TILE.CRYS_O } },
    [BLOCK.CHEST]:       { name: 'Chest',       solid: true, opaque: true, breakTime: 1.6, tool: 'axe', drop: BLOCK.CHEST, tiles: { top: TILE.PLANK, bottom: TILE.PLANK, side: TILE.CHEST_T } },
    [BLOCK.RARE_CHEST]:  { name: 'Rare Chest',  solid: true, opaque: true, breakTime: 2.2, tool: 'axe', drop: BLOCK.CHEST, tiles: { top: TILE.GOLD, bottom: TILE.PLANK, side: TILE.RARE_CHEST_T } },
    [BLOCK.LADDER]:      { name: 'Ladder',      solid: false, opaque: false, breakTime: 0.4, climbable: true, panel: true, drop: BLOCK.LADDER, tiles: { all: TILE.LADDER_T } },
    [BLOCK.DOOR_C]:      { name: 'Door',        solid: true,  opaque: false, breakTime: 1.4, tool: 'axe', panel: true, drop: BLOCK.DOOR_C, tiles: { all: TILE.DOOR_T } },
    [BLOCK.DOOR_O]:      { name: 'Open Door',   solid: false, opaque: false, breakTime: 1.4, tool: 'axe', panel: true, drop: BLOCK.DOOR_C, tiles: { all: TILE.DOOR_O_T } },
    [BLOCK.BREWING]:     { name: 'Brewing Station', solid: true, opaque: true, breakTime: 2.5, tool: 'pickaxe', drop: BLOCK.BREWING, tiles: { top: TILE.FURNACE_TOP, bottom: TILE.FURNACE_TOP, side: TILE.BREW_T } },
    [BLOCK.EARTH]:       { name: 'Earth Wall',  solid: true, opaque: true, unbreakable: true, tiles: { all: TILE.EARTH_T } },
  },

  def(id) { return this.DEFS[id]; },
  isSolid(id) { const d = this.DEFS[id]; return !!(d && d.solid); },
  isOpaque(id) { const d = this.DEFS[id]; return !!(d && d.opaque); },

  // faceIndex: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
  tileFor(id, faceIndex) {
    const t = this.DEFS[id].tiles;
    if (t.all !== undefined) return t.all;
    if (faceIndex === 2) return t.top;
    if (faceIndex === 3) return t.bottom;
    return t.side;
  },

  uv(tile) {
    const tx = tile % this.GRID, ty = Math.floor(tile / this.GRID);
    const px = this.GRID * this.TS;
    const pad = 0.6 * (this.TS / this.LS); // keep the same relative inset at any tile size
    return {
      u0: (tx * this.TS + pad) / px,
      u1: ((tx + 1) * this.TS - pad) / px,
      v0: 1 - ((ty + 1) * this.TS - pad) / px,
      v1: 1 - (ty * this.TS + pad) / px,
    };
  },

  /* ---------------- atlas painting ---------------- */
  build() {
    const px = this.GRID * this.TS;
    const cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    const ctx = cv.getContext('2d');
    this.atlasCanvas = cv;
    const rng = new RNG(987654);

    // Ore = stone base + a rimmed mineral vein, so the ore reads clearly from a distance
    const ore = (p, specks, rim) => {
      p.speckle(['#9a9aa4', '#8e8e98', '#a6a6b0', '#82828c']);
      p.grain(0.16);
      p.cracks('#6b6b75', 3);
      p.blobs(specks, 6, rim);
      p.bevel();
    };

    const painters = {
      [TILE.GRASS_TOP]: (p) => {
        p.speckle(['#6cc043', '#5cae36', '#7ad152', '#519c2d', '#88de60']);
        p.scatter(0, 16, ['#3f7d22'], 0.10);
        p.scatter(0, 16, ['#9bea72'], 0.08);
        p.grain(0.14);
      },
      [TILE.GRASS_SIDE]: (p) => {
        p.speckle(['#8a5f3e', '#7a5234', '#96694a', '#6b4629']);
        p.grain(0.16);
        p.rows(0, 3, ['#6cc043', '#5cae36', '#7ad152']);
        p.scatter(3, 3, ['#5cae36', '#6cc043'], 0.45);
        p.scatter(6, 2, ['#4f9a2e'], 0.18);
        p.rows(0, 1, ['#9bea72'], true);
        p.bevel();
      },
      [TILE.DIRT]: (p) => {
        p.speckle(['#8a5f3e', '#7a5234', '#96694a', '#6b4629', '#5c3a22']);
        p.scatter(0, 16, ['#a87a55'], 0.10);
        p.grain(0.18);
        p.bevel();
      },
      [TILE.STONE]: (p) => {
        p.speckle(['#9a9aa4', '#8e8e98', '#a6a6b0', '#82828c']);
        p.scatter(0, 16, ['#70707a', '#b4b4be'], 0.13);
        p.cracks('#6b6b75', 4);
        p.grain(0.16);
        p.bevel();
      },
      [TILE.SAND]: (p) => {
        p.speckle(['#e6d89a', '#dccd8c', '#f2e5ac', '#d0c07e']);
        p.scatter(0, 16, ['#bfae6a'], 0.10);
        p.grain(0.12);
        p.bevel();
      },
      [TILE.LOG_SIDE]: (p) => {
        p.columns(['#7a5530', '#684628', '#8a6238', '#5a3b20']);
        p.scatter(0, 16, ['#4a2f18'], 0.09);
        p.grain(0.14);
        p.bevel();
      },
      [TILE.LOG_TOP]: (p) => { p.rings(['#c69a52', '#ac8546', '#7a5530', '#95723c']); p.grain(0.12); p.bevel(); },
      [TILE.LEAVES]: (p) => {
        p.speckle(['#357a26', '#2c6d1f', '#408c2e', '#235c17', '#4a9c36']);
        p.scatter(0, 16, ['#16400c'], 0.20);
        p.scatter(0, 16, ['#5fb945'], 0.10);
        p.grain(0.18);
      },
      [TILE.WATER]: (p) => {
        p.speckle(['#3670d6', '#2f66c8', '#3f7ee6', '#2a5cb8']);
        p.rows(3, 1, ['#5c95f0'], true); p.rows(9, 1, ['#5c95f0'], true);
        p.scatter(0, 16, ['#8fc0ff'], 0.05);
      },
      [TILE.PLANK]: (p) => { p.planks(['#b8874f', '#a97c45', '#c29357'], '#7f5a34'); p.grain(0.12); p.bevel(); },
      [TILE.TABLE_TOP]: (p) => {
        p.planks(['#b8874f', '#a97c45', '#c29357'], '#7f5a34');
        p.grain(0.12); p.border('#5d3f24', 2); p.rect(6, 6, 4, 4, '#5d3f24');
        p.rect(7, 7, 2, 2, '#3f2a17'); p.bevel();
      },
      [TILE.TABLE_SIDE]: (p) => {
        p.planks(['#a97c45', '#9c703c'], '#78522e'); p.grain(0.12);
        p.rect(2, 4, 4, 5, '#d2d2da'); p.rect(3, 5, 2, 3, '#9a9aa4');
        p.rect(10, 5, 4, 4, '#8a8a94'); p.bevel();
      },
      [TILE.FURNACE]: (p) => {
        p.speckle(['#87878f', '#7d7d85', '#91919a']); p.grain(0.16); p.border('#5a5a62', 1);
        p.rect(4, 7, 8, 6, '#151519'); p.rect(5, 9, 6, 3, '#ff8c1a'); p.rect(6, 10, 4, 2, '#ffd24d');
        p.rect(7, 11, 2, 1, '#fff3a8'); p.bevel();
      },
      [TILE.FURNACE_TOP]: (p) => { p.speckle(['#78787f', '#6e6e76', '#82828a']); p.grain(0.16); p.border('#535359', 1); p.bevel(); },
      [TILE.TORCH]: (p) => {
        p.clear();
        p.rect(6, 6, 4, 10, '#8a6035'); p.rect(6, 6, 4, 1, '#a3793f'); p.rect(9, 7, 1, 9, '#6b4826');
        p.rect(6, 3, 4, 3, '#ffce3d'); p.rect(7, 1, 2, 2, '#ff9b1a'); p.rect(7, 4, 2, 2, '#fff8d0');
      },
      [TILE.PORTAL]: (p) => {
        p.speckle(['#8636f0', '#7526dd', '#9645ff', '#631cc4']);
        p.scatter(0, 16, ['#d4afff', '#eddcff'], 0.18);
        p.scatter(0, 16, ['#3d0d80'], 0.13);
      },
      [TILE.SMOOTH]: (p) => { p.speckle(['#b0b0bc', '#a6a6b2', '#bcbcc8']); p.grain(0.12); p.border('#8a8a96', 1); p.bevel(); },
      [TILE.DARK]: (p) => { p.speckle(['#3f3f4e', '#373745', '#4a4a5a']); p.scatter(0, 16, ['#1e1e26'], 0.18); p.grain(0.16); p.bevel(); },
      [TILE.GLOW]: (p) => { p.speckle(['#fff3b8', '#ffec94', '#fffada']); p.scatter(0, 16, ['#ffd24d'], 0.26); p.bevel(0.6, 0.10, 0.10); },
      [TILE.GOLD]: (p) => {
        p.speckle(['#f0d052', '#e4c344', '#f8de66', '#d4b032']);
        p.scatter(0, 16, ['#fff6c0'], 0.18); p.scatter(0, 16, ['#b8860b'], 0.12);
        p.border('#c8a32e', 1); p.bevel();
      },
      [TILE.BEDROCK]: (p) => { p.speckle(['#33333a', '#232329', '#43434c', '#16161a']); p.grain(0.22); p.bevel(); },

      [TILE.COAL_O]: (p) => ore(p, ['#232329', '#111114', '#33333c'], '#4a4a55'),
      [TILE.IRON_O]: (p) => ore(p, ['#e0aa7e', '#c8946a', '#f0c49a'], '#8a6244'),
      [TILE.GOLD_O]: (p) => ore(p, ['#ffd851', '#eebb2c', '#fff0a8'], '#a8791a'),
      [TILE.CRYS_O]: (p) => ore(p, ['#7ee2f5', '#b4f2ff', '#4fc4dc'], '#2a8a9e'),
      [TILE.CHEST_T]: (p) => {
        p.planks(['#b8874f', '#a97c45'], '#7f5a34'); p.grain(0.12);
        p.border('#5d3f24', 1);
        p.rect(0, 7, 16, 2, '#5d3f24');
        p.rect(6, 6, 4, 4, '#d2d2da'); p.rect(7, 7, 2, 2, '#5a5a62');
        p.bevel();
      },
      [TILE.RARE_CHEST_T]: (p) => {
        p.speckle(['#f0d052', '#e4c344', '#d8b436']);
        p.scatter(0, 16, ['#fff6c0'], 0.14);
        p.border('#9c7c1a', 1);
        p.rect(0, 7, 16, 2, '#9c7c1a');
        p.rect(6, 6, 4, 4, '#eddcff'); p.rect(7, 7, 2, 2, '#8a2be2');
        p.bevel();
      },
      [TILE.LADDER_T]: (p) => {
        p.clear();
        p.rect(2, 0, 2, 16, '#8a6035'); p.rect(12, 0, 2, 16, '#8a6035');
        p.rect(2, 0, 1, 16, '#a3793f'); p.rect(12, 0, 1, 16, '#a3793f');
        p.rect(2, 2, 12, 2, '#a3793f'); p.rect(2, 7, 12, 2, '#a3793f'); p.rect(2, 12, 12, 2, '#a3793f');
      },
      [TILE.DOOR_T]: (p) => {
        p.planks(['#a97c45', '#9c703c'], '#78522e'); p.grain(0.12);
        p.border('#5d3f24', 1);
        p.rect(3, 3, 4, 4, '#5d3f24'); p.rect(9, 3, 4, 4, '#5d3f24');
        p.rect(12, 8, 2, 2, '#e4c344');
        p.bevel();
      },
      [TILE.DOOR_O_T]: (p) => {
        p.clear();
        p.rect(0, 0, 3, 16, '#a97c45'); p.rect(0, 0, 16, 2, '#a97c45');
        p.rect(0, 14, 16, 2, '#a97c45'); p.rect(1, 1, 1, 14, '#78522e');
      },
      [TILE.BREW_T]: (p) => {
        p.speckle(['#87878f', '#7d7d85', '#91919a']); p.grain(0.16); p.border('#5a5a62', 1);
        p.rect(5, 5, 6, 8, '#2a1a3a');
        p.rect(6, 7, 4, 5, '#b14df0'); p.rect(7, 4, 2, 2, '#d2d2da');
        p.rect(6, 7, 1, 4, '#e0b6ff');
        p.bevel();
      },
      [TILE.EARTH_T]: (p) => {
        p.speckle(['#7a6446', '#68553a', '#87704f', '#584730']);
        p.scatter(0, 16, ['#9a9aa4'], 0.13); p.grain(0.18);
        p.border('#4a3c2a', 1); p.bevel();
      },
    };

    for (const tileStr of Object.keys(painters)) {
      const tile = +tileStr;
      const ox = (tile % this.GRID) * this.TS, oy = Math.floor(tile / this.GRID) * this.TS;
      const p = this.painterAt(ctx, ox, oy, rng);
      ctx.fillStyle = '#f0f';
      ctx.fillRect(ox, oy, this.TS, this.TS);
      painters[tile](p);
    }

    // Average color per tile (used to tint break particles)
    const data = ctx.getImageData(0, 0, px, px).data;
    for (let t = 0; t <= TILE.EARTH_T; t++) {
      const ox = (t % this.GRID) * this.TS, oy = Math.floor(t / this.GRID) * this.TS;
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < this.TS; y++) for (let x = 0; x < this.TS; x++) {
        const i = ((oy + y) * px + (ox + x)) * 4;
        if (data[i + 3] < 100) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      n = Math.max(1, n);
      this.tileColors[t] = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
    }

    this.texture = new THREE.CanvasTexture(cv);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;

    this.solidMat = new THREE.MeshLambertMaterial({
      map: this.texture, vertexColors: true, alphaTest: 0.5,
    });
    this.transMat = new THREE.MeshLambertMaterial({
      map: this.texture, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
    });

    this.buildLUTs();
  },

  /* Flat lookup tables for the mesher's innermost loops. These are read millions of
     times per chunk, where a typed-array index beats an object property chain. */
  buildLUTs() {
    const MAX = 64; // block ids comfortably fit
    this.OPAQUE = new Uint8Array(MAX);
    this.SOLID = new Uint8Array(MAX);
    this.TILES = new Uint8Array(MAX * 6);
    for (const idStr of Object.keys(this.DEFS)) {
      const id = +idStr, d = this.DEFS[id];
      this.OPAQUE[id] = d.opaque ? 1 : 0;
      this.SOLID[id] = d.solid ? 1 : 0;
      for (let f = 0; f < 6; f++) this.TILES[id * 6 + f] = this.tileFor(id, f);
    }
    const tiles = this.GRID * this.GRID;
    this.UVS = new Float32Array(tiles * 4);
    for (let t = 0; t < tiles; t++) {
      const { u0, v0, u1, v1 } = this.uv(t);
      this.UVS[t * 4] = u0; this.UVS[t * 4 + 1] = v0;
      this.UVS[t * 4 + 2] = u1; this.UVS[t * 4 + 3] = v1;
    }
  },

  /* Painters address a 16-unit logical grid (LS); every coordinate is scaled by S to fill
     the real TS-pixel tile. Noise helpers work at full device resolution, so a bigger tile
     buys finer grain instead of just chunkier pixels. */
  painterAt(ctx, ox, oy, rng) {
    const TS = this.TS, LS = this.LS, S = TS / LS;

    // Shift a hex colour's brightness by k (-1..1) — used to derive highlight/shadow variants
    const shift = (hex, k) => {
      const n = parseInt(hex.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
        Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))))
      );
      return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
    };
    // Expand a palette with subtle lighter/darker variants for richer, higher-contrast noise
    const enrich = (colors) => {
      const out = colors.slice();
      for (const c of colors) { out.push(shift(c, 0.10)); out.push(shift(c, -0.12)); }
      return out;
    };
    const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); };

    return {
      clear() { ctx.clearRect(ox, oy, TS, TS); },
      rect(x, y, w, h, c) { px(x * S, y * S, w * S, h * S, c); },

      speckle(colors) {
        const pal = enrich(colors);
        for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(x, y, 1, 1, pal[rng.int(pal.length)]);
      },

      rows(y0, n, colors, sparse) {
        const pal = enrich(colors);
        const yA = Math.round(y0 * S), yB = Math.min(TS, Math.round((y0 + n) * S));
        for (let y = yA; y < yB; y++) for (let x = 0; x < TS; x++) {
          if (sparse && rng.next() > 0.5) continue;
          px(x, y, 1, 1, pal[rng.int(pal.length)]);
        }
      },

      scatter(y0, n, colors, chance) {
        const yA = Math.round(y0 * S), yB = Math.min(TS, Math.round((y0 + n) * S));
        for (let y = yA; y < yB; y++) for (let x = 0; x < TS; x++) {
          if (rng.next() < chance) px(x, y, 1, 1, colors[rng.int(colors.length)]);
        }
      },

      // Irregular mineral clumps; `rim` outlines them so ores pop against the stone
      blobs(colors, count, rim) {
        for (let i = 0; i < count; i++) {
          const bx = (2 + rng.int(11)) * S, by = (2 + rng.int(11)) * S;
          const r = 1.2 * S + rng.next() * 0.9 * S;
          for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
            for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
              const d = Math.hypot(dx, dy);
              if (d > r + 0.7) continue;
              const x = bx + dx, y = by + dy;
              if (x < 0 || y < 0 || x >= TS || y >= TS) continue;
              if (d > r - 0.2) {
                if (rim && rng.next() < 0.8) px(x, y, 1, 1, rim);
              } else if (rng.next() < 0.93) {
                px(x, y, 1, 1, colors[rng.int(colors.length)]);
              }
            }
          }
        }
      },

      columns(colors) {
        const pal = enrich(colors);
        for (let x = 0; x < TS; x++) {
          const base = colors[Math.floor(x / S) % colors.length];
          for (let y = 0; y < TS; y++) {
            px(x, y, 1, 1, rng.next() < 0.82 ? base : pal[rng.int(pal.length)]);
          }
        }
      },

      rings(colors) {
        const c = TS / 2 - 0.5, band = 1.8 * S;
        for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
          const d = Math.hypot(x - c, y - c) + (rng.next() - 0.5) * 0.8;
          px(x, y, 1, 1, colors[Math.floor(d / band) % colors.length]);
        }
      },

      planks(colors, seam) {
        const pal = enrich(colors);
        const boardH = 4 * S;
        for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
          const board = Math.floor(y / boardH);
          const isSeam = (y % boardH) >= boardH - S || (Math.floor(x / S) + board * 7) % LS === 0;
          px(x, y, 1, 1, isSeam ? seam : pal[(board + rng.int(3)) % pal.length]);
        }
      },

      border(c, w) {
        const t = Math.max(1, Math.round(w * S));
        px(0, 0, TS, t, c); px(0, TS - t, TS, t, c);
        px(0, 0, t, TS, c); px(TS - t, 0, t, TS, c);
      },

      // Random darker fissures — breaks up flat noise on stone and ore
      cracks(color, count) {
        for (let i = 0; i < count; i++) {
          let x = rng.int(TS), y = rng.int(TS);
          const len = Math.round((3 + rng.int(6)) * S);
          const dx = rng.next() < 0.5 ? 1 : -1, dy = rng.next() < 0.5 ? 1 : -1;
          for (let s = 0; s < len; s++) {
            if (x < 0 || y < 0 || x >= TS || y >= TS) break;
            px(x, y, 1, 1, color);
            if (rng.next() < 0.6) x += dx;
            if (rng.next() < 0.6) y += dy;
          }
        }
      },

      // Per-pixel light/dark dust for depth
      grain(strength = 0.14) {
        ctx.save();
        for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
          const r = rng.next();
          if (r < strength) {
            ctx.globalAlpha = 0.10 + rng.next() * 0.18;
            ctx.fillStyle = r < strength * 0.5 ? '#000000' : '#ffffff';
            ctx.fillRect(ox + x, oy + y, 1, 1);
          }
        }
        ctx.restore();
      },

      // Lit top-left / shadowed bottom-right edge: gives every block a chunky 3D read
      bevel(w = 1, lightA = 0.15, darkA = 0.22) {
        const t = Math.max(1, Math.round(w * S));
        ctx.save();
        ctx.globalAlpha = lightA;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox, oy, TS, t); ctx.fillRect(ox, oy, t, TS);
        ctx.globalAlpha = darkA;
        ctx.fillStyle = '#000000';
        ctx.fillRect(ox, oy + TS - t, TS, t); ctx.fillRect(ox + TS - t, oy, t, TS);
        ctx.restore();
      },
    };
  },
};
