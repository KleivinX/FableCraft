'use strict';
/* FableCraft — dungeons. Two flavours, both deliberately easy to spot:

   Catacombs    — found on foot. A glowing stone archway on the surface marks a
                  ladder shaft down into a pillared crypt full of loot.
   Sunken Temple — found in deep water. A lit spire breaks the surface above a
                  flooded temple with a sealed air pocket at its heart.

   One candidate per cell, placed deterministically from the seed, so every chunk
   renders its own slice of a multi-chunk dungeon consistently. */

const Dungeons = {
  CELL: 192,
  RADIUS: 14,     // max half-extent, used when deciding which cells touch a chunk
  CHANCE: 0.78,   // generous: dungeons are meant to be found, not hunted
  seed: 0,

  init(seed) { this.seed = seed >>> 0; this._cache = new Map(); },

  /* A cell yields at most one dungeon. The cell decides which kind it *wants* first,
     then probes a handful of spots for ground that suits it — otherwise water-poor
     worlds would never grow a single temple. */
  forCell(cellX, cellZ) {
    const cached = this._cache && this._cache.get(cellX + ',' + cellZ);
    if (cached !== undefined) return cached;

    const result = this.computeCell(cellX, cellZ);
    if (!this._cache) this._cache = new Map();
    if (this._cache.size > 4096) this._cache.clear();
    this._cache.set(cellX + ',' + cellZ, result);
    return result;
  },

  computeCell(cellX, cellZ) {
    if (hash2(cellX, cellZ, this.seed ^ 0xd0e5) > this.CHANCE) return null;
    const wantSunken = hash2(cellX, cellZ, this.seed ^ 0x6666) < 0.45;
    const sea = World.SEA;
    const inner = this.CELL - 80;
    let fallback = null;

    for (let i = 0; i < 7; i++) {
      const ox = 40 + Math.floor(hash2(cellX * 31 + i, cellZ, this.seed ^ 0x4444) * inner);
      const oz = 40 + Math.floor(hash2(cellX, cellZ * 31 + i, this.seed ^ 0x5555) * inner);
      const x = cellX * this.CELL + ox, z = cellZ * this.CELL + oz;
      if (Utils.dist2D(x, z, World.SPAWN.x, World.SPAWN.z) < 64) continue;
      if (Utils.dist2D(x, z, World.ARENA.x, World.ARENA.z) < 140) continue;

      const t = World.terrainAt(x, z);
      const deepWater = t.h <= sea - 5 && t.h > 8;
      const dryLand = t.h >= sea + 4 && t.h <= 84;
      if (wantSunken && deepWater) return { type: 'sunken', name: 'Sunken Temple', x, z, h: t.h, cellX, cellZ };
      if (!wantSunken && dryLand) return { type: 'catacomb', name: 'Catacombs', x, z, h: t.h, cellX, cellZ };
      // Remember the first usable site of the other kind in case the preferred one never appears
      if (!fallback) {
        if (deepWater) fallback = { type: 'sunken', name: 'Sunken Temple', x, z, h: t.h, cellX, cellZ };
        else if (dryLand) fallback = { type: 'catacomb', name: 'Catacombs', x, z, h: t.h, cellX, cellZ };
      }
    }
    return fallback;
  },

  /* Nearest dungeon to a point, for the HUD locator. Scans the cells around the
     player rather than the whole world. */
  nearest(px, pz, maxDist = 420) {
    const c0x = Math.floor(px / this.CELL), c0z = Math.floor(pz / this.CELL);
    const span = Math.ceil(maxDist / this.CELL);
    let best = null, bestD = maxDist;
    for (let cx = c0x - span; cx <= c0x + span; cx++) {
      for (let cz = c0z - span; cz <= c0z + span; cz++) {
        const d = this.forCell(cx, cz);
        if (!d) continue;
        const dist = Utils.dist2D(px, pz, d.x, d.z);
        if (dist < bestD) { bestD = dist; best = d; }
      }
    }
    return best ? { dungeon: best, dist: bestD } : null;
  },

  stampIntoChunk(world, chunk) {
    const minX = chunk.cx * CHUNK_X - this.RADIUS, maxX = (chunk.cx + 1) * CHUNK_X + this.RADIUS;
    const minZ = chunk.cz * CHUNK_Z - this.RADIUS, maxZ = (chunk.cz + 1) * CHUNK_Z + this.RADIUS;
    for (let cx = Math.floor(minX / this.CELL); cx <= Math.floor(maxX / this.CELL); cx++) {
      for (let cz = Math.floor(minZ / this.CELL); cz <= Math.floor(maxZ / this.CELL); cz++) {
        const d = this.forCell(cx, cz);
        if (!d) continue;
        if (d.x < minX || d.x > maxX || d.z < minZ || d.z > maxZ) continue;
        const rng = new RNG(Math.floor(hash2(cx, cz, this.seed ^ 0x9999) * 0x7fffffff) || 1);
        const set = (wx, wy, wz, id, onlyAir) =>
          world.stampBlock(chunk.blocks, chunk.cx, chunk.cz, wx, wy, wz, id, onlyAir);
        this[d.type](set, d, rng);
      }
    }
  },

  /* ---------------- Catacombs (surface entrance) ---------------- */
  catacomb(set, d, rng) {
    const gh = d.h;
    const floor = Math.max(5, gh - 17);
    const R = 6;                 // room half-width
    const ceil = floor + 6;

    // --- Surface marker: a lit archway you can spot from a long way off ---
    for (let y = 1; y <= 5; y++) {
      set(d.x - 3, gh + y, d.z, BLOCK.DARK);
      set(d.x + 3, gh + y, d.z, BLOCK.DARK);
    }
    for (let x = -3; x <= 3; x++) set(d.x + x, gh + 6, d.z, BLOCK.DARK);
    set(d.x - 3, gh + 7, d.z, BLOCK.GLOW);
    set(d.x + 3, gh + 7, d.z, BLOCK.GLOW);
    set(d.x, gh + 7, d.z, BLOCK.GLOW);
    // A short beacon column so it reads even over hills
    for (let y = 8; y <= 12; y++) set(d.x, gh + y, d.z, y % 2 ? BLOCK.GLOW : BLOCK.DARK);
    // Ringed stone apron + torches
    for (let ox = -4; ox <= 4; ox++) {
      for (let oz = -4; oz <= 4; oz++) {
        if (ox * ox + oz * oz > 20) continue;
        set(d.x + ox, gh, d.z + oz, BLOCK.SMOOTH);
      }
    }
    set(d.x - 4, gh + 1, d.z - 3, BLOCK.TORCH, true);
    set(d.x + 4, gh + 1, d.z + 3, BLOCK.TORCH, true);

    // --- Ladder shaft from the surface down into the crypt ---
    for (let y = floor + 1; y <= gh + 1; y++) {
      set(d.x, y, d.z, BLOCK.LADDER);
      // keep the shaft clear on the entry side
      set(d.x, y, d.z + 1, y >= gh ? BLOCK.AIR : BLOCK.DARK);
    }

    // --- Crypt chamber ---
    for (let ox = -R; ox <= R; ox++) {
      for (let oz = -R; oz <= R; oz++) {
        const wall = Math.abs(ox) === R || Math.abs(oz) === R;
        set(d.x + ox, floor, d.z + oz, BLOCK.SMOOTH);            // floor
        for (let y = floor + 1; y <= ceil; y++) {
          set(d.x + ox, y, d.z + oz, wall ? BLOCK.DARK : BLOCK.AIR);
        }
        set(d.x + ox, ceil + 1, d.z + oz, BLOCK.DARK);           // ceiling
      }
    }
    // Pillars with torches
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      for (let y = floor + 1; y <= ceil; y++) set(d.x + px, y, d.z + pz, BLOCK.STONE);
      set(d.x + px, floor + 3, d.z + pz + 1, BLOCK.TORCH, true);
    }
    // Loot: a rare chest on a plinth, plus two ordinary chests in the corners
    set(d.x, floor + 1, d.z - 4, BLOCK.SMOOTH);
    set(d.x, floor + 2, d.z - 4, BLOCK.RARE_CHEST);
    set(d.x - 5, floor + 1, d.z - 5, BLOCK.CHEST);
    set(d.x + 5, floor + 1, d.z + 5, BLOCK.CHEST);
    set(d.x + 5, floor + 1, d.z - 5, BLOCK.BREWING);
    set(d.x - 5, floor + 1, d.z + 5, BLOCK.TABLE);
    // Scattered ore in the walls as a reward for spelunking
    for (let i = 0; i < 8; i++) {
      const ox = -R + rng.int(R * 2 + 1), oz = -R + rng.int(R * 2 + 1);
      const y = floor + 1 + rng.int(4);
      if (Math.abs(ox) !== R && Math.abs(oz) !== R) continue;
      set(d.x + ox, y, d.z + oz, rng.next() < 0.4 ? BLOCK.GOLD_ORE : BLOCK.IRON_ORE);
    }
  },

  /* ---------------- Sunken Temple (underwater) ---------------- */
  sunken(set, d, rng) {
    const bed = d.h;                 // sea floor
    const sea = World.SEA;
    const R = 7;
    const roomTop = bed + 6;

    // --- Solid temple shell sitting on the sea bed ---
    for (let ox = -R; ox <= R; ox++) {
      for (let oz = -R; oz <= R; oz++) {
        if (Math.abs(ox) === R || Math.abs(oz) === R) {
          for (let y = bed; y <= roomTop + 1; y++) set(d.x + ox, y, d.z + oz, BLOCK.SMOOTH);
        }
        set(d.x + ox, bed, d.z + oz, BLOCK.SMOOTH);              // base slab
        set(d.x + ox, roomTop + 1, d.z + oz, BLOCK.SMOOTH);      // roof
      }
    }
    // --- Hollow, dry interior: the air pocket that makes this survivable ---
    for (let ox = -(R - 1); ox <= R - 1; ox++) {
      for (let oz = -(R - 1); oz <= R - 1; oz++) {
        for (let y = bed + 1; y <= roomTop; y++) set(d.x + ox, y, d.z + oz, BLOCK.AIR);
      }
    }
    // Corner pillars + light so the interior is readable
    for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      for (let y = bed + 1; y <= roomTop; y++) set(d.x + px, y, d.z + pz, BLOCK.DARK);
      set(d.x + px, roomTop, d.z + pz, BLOCK.GLOW);
    }
    set(d.x, roomTop, d.z, BLOCK.GLOW);

    // --- Entrance: a flooded stair well down through the roof ---
    for (let y = bed + 1; y <= sea + 1; y++) {
      set(d.x + R, y, d.z, BLOCK.AIR);          // vertical entry slot in the east wall
      set(d.x + R, y, d.z + 1, BLOCK.SMOOTH);
      set(d.x + R, y, d.z - 1, BLOCK.SMOOTH);
      set(d.x + R + 1, y, d.z, BLOCK.LADDER);   // climb back out
    }

    // --- Marker spire breaking the surface, lit at the top ---
    for (let y = roomTop + 2; y <= sea + 6; y++) {
      const glow = y > sea || y % 3 === 0;
      set(d.x, y, d.z, glow ? BLOCK.GLOW : BLOCK.DARK);
      if (y === sea + 3) {
        set(d.x - 1, y, d.z, BLOCK.DARK);
        set(d.x + 1, y, d.z, BLOCK.DARK);
        set(d.x, y, d.z - 1, BLOCK.DARK);
        set(d.x, y, d.z + 1, BLOCK.DARK);
      }
    }

    // --- Treasure: temples are the richer of the two ---
    set(d.x - 2, bed + 1, d.z - 2, BLOCK.RARE_CHEST);
    set(d.x + 2, bed + 1, d.z + 2, BLOCK.RARE_CHEST);
    set(d.x - 2, bed + 1, d.z + 2, BLOCK.CHEST);
    set(d.x + 2, bed + 1, d.z - 2, BLOCK.CHEST);
    set(d.x, bed + 1, d.z, BLOCK.GOLD);
    set(d.x, bed + 2, d.z, BLOCK.BREWING);
    for (let i = 0; i < 6; i++) {
      const ox = -(R - 2) + rng.int((R - 2) * 2 + 1), oz = -(R - 2) + rng.int((R - 2) * 2 + 1);
      set(d.x + ox, bed, d.z + oz, rng.next() < 0.5 ? BLOCK.CRYSTAL_ORE : BLOCK.GOLD_ORE);
    }
  },
};
