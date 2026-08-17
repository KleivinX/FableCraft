'use strict';
/* FableCraft — generated structures: villages, wizard towers, ruins, mines, watch towers.
   One potential structure per 160-block cell, placed & built deterministically from the seed,
   so every chunk renders its own slice of multi-chunk buildings consistently. */

const Structures = {
  CELL: 160,
  RADIUS: 26, // max structure half-extent
  seed: 0,

  init(seed) { this.seed = seed >>> 0; },

  forCell(cellX, cellZ) {
    if (hash2(cellX, cellZ, this.seed ^ 0xabcd) > 0.5) return null;
    const ox = 36 + Math.floor(hash2(cellX, cellZ, this.seed ^ 0x1111) * (this.CELL - 72));
    const oz = 36 + Math.floor(hash2(cellX, cellZ, this.seed ^ 0x2222) * (this.CELL - 72));
    const x = cellX * this.CELL + ox, z = cellZ * this.CELL + oz;
    if (Utils.dist2D(x, z, World.SPAWN.x, World.SPAWN.z) < 90) return null;
    if (Utils.dist2D(x, z, World.ARENA.x, World.ARENA.z) < 140) return null;
    const t = World.terrainAt(x, z);
    if (t.h <= World.SEA + 1 || t.h > 86) return null;
    const r = hash2(cellX, cellZ, this.seed ^ 0x3333);
    let type;
    if (r < 0.28) type = 'village';
    else if (r < 0.48) type = 'tower';
    else if (r < 0.68) type = 'ruins';
    else if (r < 0.86) type = 'mine';
    else type = 'watch';
    return { type, x, z, h: t.h, cellX, cellZ };
  },

  stampIntoChunk(world, chunk) {
    const minX = chunk.cx * CHUNK_X - this.RADIUS, maxX = (chunk.cx + 1) * CHUNK_X + this.RADIUS;
    const minZ = chunk.cz * CHUNK_Z - this.RADIUS, maxZ = (chunk.cz + 1) * CHUNK_Z + this.RADIUS;
    for (let cx = Math.floor(minX / this.CELL); cx <= Math.floor(maxX / this.CELL); cx++) {
      for (let cz = Math.floor(minZ / this.CELL); cz <= Math.floor(maxZ / this.CELL); cz++) {
        const s = this.forCell(cx, cz);
        if (!s) continue;
        if (s.x < minX || s.x > maxX || s.z < minZ || s.z > maxZ) continue;
        const rng = new RNG(Math.floor(hash2(cx, cz, this.seed ^ 0x7777) * 0x7fffffff) || 1);
        const set = (wx, wy, wz, id, onlyAir) => world.stampBlock(chunk.blocks, chunk.cx, chunk.cz, wx, wy, wz, id, onlyAir);
        this[s.type](set, s, rng);
      }
    }
  },

  /* ---------- a small hut (used by villages) ---------- */
  hut(set, hx, hz, gh, rng, withChest) {
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        set(hx + ox, gh, hz + oz, BLOCK.PLANK);
        const isWall = Math.abs(ox) === 2 || Math.abs(oz) === 2;
        const isCorner = Math.abs(ox) === 2 && Math.abs(oz) === 2;
        for (let y = 1; y <= 3; y++) {
          if (isWall) {
            // door opening on the south face
            if (oz === 2 && ox === 0 && y <= 2) {
              set(hx + ox, gh + y, hz + oz, y === 1 ? BLOCK.DOOR_C : BLOCK.AIR);
            } else if (!isCorner && y === 2 && (ox === 2 || ox === -2) && oz === 0) {
              set(hx + ox, gh + y, hz + oz, BLOCK.AIR); // window
            } else {
              set(hx + ox, gh + y, hz + oz, isCorner ? BLOCK.WOOD : BLOCK.PLANK);
            }
          } else {
            set(hx + ox, gh + y, hz + oz, BLOCK.AIR);
          }
        }
        set(hx + ox, gh + 4, hz + oz, BLOCK.PLANK);
        set(hx + ox, gh + 5, hz + oz, BLOCK.AIR);
        set(hx + ox, gh + 6, hz + oz, BLOCK.AIR);
      }
    }
    set(hx - 1, gh + 1, hz - 1, withChest ? BLOCK.CHEST : BLOCK.TABLE);
    set(hx + 1, gh + 2, hz - 1, BLOCK.TORCH, true);
  },

  village(set, s, rng) {
    const spots = [[-9, -7], [9, -8], [-8, 9], [9, 9], [0, 0]];
    const count = 3 + rng.int(2);
    for (let i = 0; i < count; i++) {
      const [dx, dz] = spots[i];
      const hx = s.x + dx, hz = s.z + dz;
      const gh = World.terrainAt(hx, hz).h;
      if (gh <= World.SEA) continue;
      this.hut(set, hx, hz, gh, rng, i === 0);
    }
    // village center torch post
    const gh = World.terrainAt(s.x + 3, s.z + 3).h;
    set(s.x + 3, gh + 1, s.z + 3, BLOCK.WOOD);
    set(s.x + 3, gh + 2, s.z + 3, BLOCK.TORCH);
  },

  tower(set, s, rng) {
    const gh = s.h, H = 12;
    for (let ox = -3; ox <= 3; ox++) {
      for (let oz = -3; oz <= 3; oz++) {
        const r = Math.max(Math.abs(ox), Math.abs(oz));
        const corner = Math.abs(ox) === 3 && Math.abs(oz) === 3;
        if (corner) continue; // rounded silhouette
        for (let y = 0; y <= H; y++) {
          if (r === 3 || (r === 2 && Math.abs(ox) === 2 && Math.abs(oz) === 2)) {
            // walls, with a door at the south and window slits
            if (oz === 3 && ox === 0 && (y === 1 || y === 2)) {
              set(s.x + ox, gh + y, s.z + oz, y === 1 ? BLOCK.DOOR_C : BLOCK.AIR);
            } else if (y > 2 && y % 4 === 0 && (ox === 0 || oz === 0)) {
              set(s.x + ox, gh + y, s.z + oz, BLOCK.GLOW);
            } else {
              set(s.x + ox, gh + y, s.z + oz, BLOCK.STONE);
            }
          } else if (y === 0) {
            set(s.x + ox, gh, s.z + oz, BLOCK.SMOOTH);
          } else {
            // hollow interior with plank floors every 4
            set(s.x + ox, gh + y, s.z + oz, (y % 4 === 0 && !(ox === 1 && oz === 1)) ? BLOCK.PLANK : BLOCK.AIR);
          }
        }
        // battlements
        if (r >= 2 && !corner && (ox + oz) % 2 === 0) set(s.x + ox, gh + H + 1, s.z + oz, BLOCK.DARK);
      }
    }
    // ladder column up the inside
    for (let y = 1; y <= H; y++) set(s.x + 1, gh + y, s.z + 1, BLOCK.LADDER);
    // wizard's study at the top
    set(s.x - 1, gh + H + 1, s.z - 1, BLOCK.BREWING);
    set(s.x + 1, gh + H + 1, s.z - 1, BLOCK.RARE_CHEST);
    set(s.x, gh + H + 1, s.z + 1, BLOCK.TORCH, true);
  },

  ruins(set, s, rng) {
    const gh = s.h;
    for (let ox = -4; ox <= 4; ox++) {
      for (let oz = -3; oz <= 3; oz++) {
        const isWall = Math.abs(ox) === 4 || Math.abs(oz) === 3;
        if (rng.next() < 0.75) set(s.x + ox, gh, s.z + oz, BLOCK.SMOOTH);
        if (isWall) {
          const hWall = rng.int(4); // crumbled height
          for (let y = 1; y <= hWall; y++) set(s.x + ox, gh + y, s.z + oz, BLOCK.STONE);
        } else if (rng.next() < 0.08) {
          set(s.x + ox, gh + 1, s.z + oz, BLOCK.STONE); // rubble
        }
      }
    }
    set(s.x, gh + 1, s.z, rng.next() < 0.3 ? BLOCK.RARE_CHEST : BLOCK.CHEST);
    set(s.x + 2, gh + 1, s.z + 1, BLOCK.TORCH, true);
  },

  mine(set, s, rng) {
    const gh = s.h, bottom = 18;
    // entrance frame
    for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) {
      set(s.x + ox, gh + 1, s.z + oz, (Math.abs(ox) === 2 || Math.abs(oz) === 2) ? BLOCK.WOOD : BLOCK.AIR);
      set(s.x + ox, gh + 2, s.z + oz, (Math.abs(ox) === 2 && Math.abs(oz) === 2) ? BLOCK.WOOD : BLOCK.AIR);
      set(s.x + ox, gh + 3, s.z + oz, BLOCK.PLANK);
    }
    // shaft down with a ladder
    for (let y = bottom; y <= gh; y++) {
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        set(s.x + ox, y, s.z + oz, BLOCK.AIR);
      }
      set(s.x - 2, y, s.z, BLOCK.STONE); // ladder backing
      set(s.x - 1, y, s.z, BLOCK.LADDER);
    }
    // two tunnels at the bottom
    const dirs = [[1, 0], [0, -1]];
    for (let d = 0; d < 2; d++) {
      const [dx, dz] = dirs[d];
      for (let i = 2; i <= 12; i++) {
        const tx = s.x + dx * i, tz = s.z + dz * i;
        for (let w = -1; w <= 1; w++) {
          for (let y = bottom; y <= bottom + 2; y++) {
            set(tx + (dz !== 0 ? w : 0), y, tz + (dx !== 0 ? w : 0), BLOCK.AIR);
          }
        }
        // support beams every 4 blocks
        if (i % 4 === 0) {
          const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0;
          for (let y = bottom; y <= bottom + 2; y++) {
            set(tx + px, y, tz + pz, BLOCK.WOOD);
            set(tx - px, y, tz - pz, BLOCK.WOOD);
          }
          set(tx, bottom + 2, tz, BLOCK.WOOD);
          set(tx + px, bottom + 1, tz + pz, BLOCK.TORCH, true);
        }
        // exposed ore pockets in the walls
        if (rng.next() < 0.3) {
          const ores = [BLOCK.COAL_ORE, BLOCK.IRON_ORE, BLOCK.IRON_ORE, BLOCK.GOLD_ORE];
          set(tx + (dz !== 0 ? 2 : 0), bottom + rng.int(2), tz + (dx !== 0 ? 2 : 0), ores[rng.int(ores.length)]);
        }
      }
      const ex = s.x + dx * 13, ez = s.z + dz * 13;
      set(ex, bottom, ez, d === 0 ? BLOCK.RARE_CHEST : BLOCK.CHEST);
    }
  },

  watch(set, s, rng) {
    const gh = s.h, H = 9;
    for (let y = 1; y <= H; y++) {
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const wall = Math.abs(ox) === 1 || Math.abs(oz) === 1;
        set(s.x + ox, gh + y, s.z + oz, wall ? BLOCK.DARK : (y <= H ? BLOCK.AIR : BLOCK.AIR));
      }
      // doorway + interior ladder
      if (y <= 2) set(s.x, gh + y, s.z + 1, y === 1 ? BLOCK.DOOR_C : BLOCK.AIR);
      set(s.x, gh + y, s.z, BLOCK.LADDER);
    }
    // lookout platform
    for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) {
      set(s.x + ox, gh + H + 1, s.z + oz, BLOCK.PLANK);
      if (Math.abs(ox) === 2 && Math.abs(oz) === 2) {
        set(s.x + ox, gh + H + 2, s.z + oz, BLOCK.DARK);
        set(s.x + ox, gh + H + 3, s.z + oz, BLOCK.TORCH);
      }
    }
    set(s.x, gh + H + 2, s.z, BLOCK.AIR); // ladder exit
    set(s.x + 1, gh + H + 2, s.z - 1, BLOCK.CHEST);
  },
};
