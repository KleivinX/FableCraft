'use strict';
/* FableCraft — voxel world: procedural terrain, chunk meshing, physics & raycasting.
   Also stamps the spawn safe-zone, the WAVE ARENA portal, the colosseum and the victory monument. */

const World = {
  SEA: 46,
  scene: null,
  seed: 1,
  chunks: new Map(),       // "cx,cz" -> chunk
  dirty: new Set(),
  genQueue: [],
  edits: {},               // "x,y,z" -> block id (player modifications, persisted)
  editsByChunk: new Map(), // "cx,cz" -> [[lx,ly,lz,id], ...]
  noise: {},
  SPAWN: { x: 8, z: 8, h: 50 },
  spawnPoint: new THREE.Vector3(),
  PORTAL: null,            // overworld WAVE ARENA portal
  ARENA: { x: 10000, z: 10000, floor: 40, radius: 20 },
  arenaTorches: new Set(),
  championPortal: null,
  monumentBuilt: false,
  recipe: null,            // per-seed terrain personality (see rollRecipe)

  /* Each seed draws one of these world types, then jitters its numbers, so two
     worlds are never merely "the same terrain with different noise offsets". */
  WORLD_TYPES: [
    { name: 'Verdant Plains',      contAmp: 11, mountAmp: 58,  mountGate: 0.34, seaShift: 0,  trees: 1.5, forest: 0.02,  caves: 0.62, weight: 1.1 },
    { name: 'Highland Peaks',      contAmp: 20, mountAmp: 150, mountGate: 0.14, seaShift: -2, trees: 0.8, forest: 0.16,  caves: 0.60, weight: 1.0 },
    { name: 'Sunken Archipelago',  contAmp: 22, mountAmp: 70,  mountGate: 0.30, seaShift: 7,  trees: 1.2, forest: -0.05, caves: 0.64, weight: 0.9 },
    { name: 'Ancient Forest',      contAmp: 13, mountAmp: 65,  mountGate: 0.30, seaShift: 0,  trees: 2.6, forest: -0.25, caves: 0.63, weight: 1.0 },
    { name: 'Arid Badlands',       contAmp: 16, mountAmp: 95,  mountGate: 0.22, seaShift: -5, trees: 0.25, forest: 0.42, caves: 0.58, weight: 0.9 },
    { name: 'Hollow Karst',        contAmp: 14, mountAmp: 80,  mountGate: 0.26, seaShift: -1, trees: 1.0, forest: 0.10,  caves: 0.50, weight: 0.8 },
    { name: 'Rolling Downs',       contAmp: 9,  mountAmp: 40,  mountGate: 0.40, seaShift: -3, trees: 1.1, forest: 0.06,  caves: 0.63, weight: 1.0 },
    { name: 'Shattered Isles',     contAmp: 26, mountAmp: 120, mountGate: 0.18, seaShift: 5,  trees: 0.9, forest: 0.00,  caves: 0.57, weight: 0.7 },
  ],

  rollRecipe(seed) {
    const rng = new RNG((seed ^ 0x5eed11) >>> 0);
    // Weighted pick of the world type
    const total = this.WORLD_TYPES.reduce((s, t) => s + t.weight, 0);
    let roll = rng.next() * total, pick = this.WORLD_TYPES[0];
    for (const t of this.WORLD_TYPES) { roll -= t.weight; if (roll <= 0) { pick = t; break; } }
    const jitter = (v, pct) => v * (1 + (rng.next() * 2 - 1) * pct);
    return {
      name: pick.name,
      contScale: jitter(0.0035, 0.35),   // landmass size
      contAmp: jitter(pick.contAmp, 0.18),
      mountScale: jitter(0.011, 0.3),
      mountAmp: jitter(pick.mountAmp, 0.2),
      mountGate: jitter(pick.mountGate, 0.15),
      sea: Math.round(46 + pick.seaShift + (rng.next() * 2 - 1) * 1.5),
      trees: jitter(pick.trees, 0.25),
      forest: pick.forest + (rng.next() * 2 - 1) * 0.06,
      caves: jitter(pick.caves, 0.05),
    };
  },

  /* ================= INIT ================= */
  init(scene, seed, edits, monumentBuilt) {
    this.scene = scene;
    this.seed = seed >>> 0;
    // Drop any meshes from a previous world before forgetting the chunks that own them
    for (const c of this.chunks.values()) {
      if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
      if (c.transMesh) { scene.remove(c.transMesh); c.transMesh.geometry.dispose(); }
    }
    this.chunks.clear(); this.dirty.clear(); this.genQueue.length = 0;
    this.edits = edits || {};
    this.monumentBuilt = !!monumentBuilt;
    this.championPortal = null;
    this.indexEdits();

    this.recipe = this.rollRecipe(this.seed);
    this.SEA = this.recipe.sea;

    const rng = new RNG(this.seed);
    this.noise = {
      cont: new SimplexNoise(rng),
      mount: new SimplexNoise(rng),
      detail: new SimplexNoise(rng),
      moist: new SimplexNoise(rng),
      cave: new SimplexNoise(rng),
    };
    Structures.init(this.seed);
    Dungeons.init(this.seed);

    // Find a dry, reasonably flat spawn near the origin (deterministic per seed)
    let found = false;
    outer:
    for (let r = 0; r <= 200 && !found; r += 8) {
      const cands = r === 0 ? [[0, 0]] : [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]];
      for (const [x, z] of cands) {
        const t = this.terrainAt(x, z);
        if (t.h >= this.SEA + 3 && t.h <= 72 && t.biome !== 'lake') {
          this.SPAWN = { x, z, h: t.h };
          found = true;
          break outer;
        }
      }
    }
    if (!found) this.SPAWN = { x: 0, z: 0, h: Math.max(this.terrainAt(0, 0).h, this.SEA + 3) };

    const S = this.SPAWN;
    this.spawnPoint.set(S.x + 0.5, S.h + 1, S.z + 0.5);

    // WAVE ARENA portal: directly in front of spawn (facing -Z)
    const pz = S.z - 10;
    this.PORTAL = {
      x: S.x, z: pz, baseY: S.h,
      trigger: {
        minX: S.x - 2, maxX: S.x + 3,
        minY: S.h + 1, maxY: S.h + 7,
        minZ: pz - 0.6, maxZ: pz + 1.6,
      },
      labelPos: new THREE.Vector3(S.x + 0.5, S.h + 10.5, pz + 0.5),
    };

    // Arena wall-top torch ring
    this.arenaTorches.clear();
    const A = this.ARENA;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const tx = Math.round(A.x + 21.2 * Math.cos(a));
      const tz = Math.round(A.z + 21.2 * Math.sin(a));
      this.arenaTorches.add(`${tx},45,${tz}`);
    }
    this.arenaSpawn = new THREE.Vector3(A.x + 0.5, A.floor + 1, A.z + 14.5);
  },

  indexEdits() {
    this.editsByChunk.clear();
    for (const key of Object.keys(this.edits)) {
      const [x, y, z] = key.split(',').map(Number);
      const cx = Math.floor(x / CHUNK_X), cz = Math.floor(z / CHUNK_Z);
      const ck = `${cx},${cz}`;
      if (!this.editsByChunk.has(ck)) this.editsByChunk.set(ck, []);
      this.editsByChunk.get(ck).push([x - cx * CHUNK_X, y, z - cz * CHUNK_Z, this.edits[key]]);
    }
  },

  /* ================= TERRAIN ================= */
  terrainAt(wx, wz) {
    const n = this.noise, R = this.recipe;
    const e = n.cont.noise2D(wx * R.contScale, wz * R.contScale);
    const m = n.mount.noise2D(wx * R.mountScale, wz * R.mountScale);
    const d = n.detail.noise2D(wx * 0.045, wz * 0.045);
    const moist = n.moist.noise2D(wx * 0.004 + 500, wz * 0.004 + 500);
    let h = 50 + e * R.contAmp + d * 2.5;
    const mt = Math.max(0, m - R.mountGate);
    h += mt * mt * R.mountAmp;
    h = Utils.clamp(Math.round(h), 2, 120);
    let biome;
    if (h <= this.SEA + 1) biome = 'lake';
    else if (mt > 0.3) biome = 'mountain';
    else if (moist > R.forest) biome = 'forest';
    else biome = 'plains';
    return { h, biome };
  },

  // Cave networks: carved where 3D noise crosses a threshold; deep caves flood into lakes
  caveAt(wx, wy, wz) {
    return this.noise.cave.noise3D(wx * 0.055, wy * 0.075, wz * 0.055) > this.recipe.caves;
  },

  // Ore veins: 2x2x2 clustered, rarer and richer with depth
  oreAt(wx, wy, wz) {
    const r = hash3(wx >> 1, wy >> 1, wz >> 1, this.seed ^ 0x9e37);
    if (wy < 16 && r < 0.008) return BLOCK.CRYSTAL_ORE;
    if (wy < 28 && r >= 0.008 && r < 0.018) return BLOCK.GOLD_ORE;
    if (wy < 48 && r >= 0.020 && r < 0.038) return BLOCK.IRON_ORE;
    if (wy < 72 && r >= 0.042 && r < 0.064) return BLOCK.COAL_ORE;
    return 0;
  },

  isClimbable(wx, wy, wz) {
    const d = Blocks.DEFS[this.getBlock(wx, wy, wz)];
    return !!(d && d.climbable);
  },

  treeAt(wx, wz) {
    // Cheapest tests first: the hash rejects ~99% of columns before any noise is sampled
    const f = hash2(wx, wz, this.seed ^ 0x51ab);
    if (f >= 0.022 * this.recipe.trees) return null;
    const S = this.SPAWN, A = this.ARENA;
    if (Utils.dist2D(wx, wz, S.x, S.z) < 20) return null;   // spawn safe-zone
    if (Utils.dist2D(wx, wz, A.x, A.z) < 45) return null;   // arena grounds
    const t = this.terrainAt(wx, wz);
    if (t.h <= this.SEA + 1 || t.biome === 'mountain' || t.biome === 'lake') return null;
    const chance = (t.biome === 'forest' ? 0.022 : 0.004) * this.recipe.trees;
    if (f >= chance) return null;
    return { h: t.h, trunk: 4 + Math.floor(hash2(wx, wz, this.seed ^ 0xbeef) * 3) };
  },

  /* Structure stamps: returns block id, or -1 for "no override" */
  structureAt(wx, wy, wz) {
    const A = this.ARENA;
    const adx = wx - A.x, adz = wz - A.z;
    if (Math.abs(adx) <= 40 && Math.abs(adz) <= 40) {
      const r = Math.sqrt(adx * adx + adz * adz);
      if (r <= 38) return this.arenaBlockAt(wx, wy, wz, r, adx, adz);
    }

    const S = this.SPAWN;
    // Portal frame (stamped before the flatten so it wins inside the safe zone)
    const P = this.PORTAL;
    if (wz === P.z && wx >= S.x - 3 && wx <= S.x + 3 && wy >= S.h + 1 && wy <= S.h + 7) {
      const edgeX = (wx === S.x - 3 || wx === S.x + 3);
      const edgeY = (wy === S.h + 1 || wy === S.h + 7);
      if (edgeX && edgeY) return BLOCK.GLOW;
      if (edgeX || edgeY) return BLOCK.DARK;
      return BLOCK.PORTAL;
    }

    // Spawn safe-zone flatten
    const sr = Utils.dist2D(wx, wz, S.x, S.z);
    if (sr <= 16) {
      const t = this.terrainAt(wx, wz);
      const th = Math.round(Utils.lerp(S.h, t.h, Utils.smoothstep(12, 16, sr)));
      if (wy > th) return BLOCK.AIR;
      if (wy === th) return BLOCK.GRASS;
      if (wy >= th - 3) return BLOCK.DIRT;
      if (wy === 0) return BLOCK.BEDROCK;
      return BLOCK.STONE;
    }
    return -1;
  },

  arenaBlockAt(wx, wy, wz, r, dx, dz) {
    const A = this.ARENA;
    if (wy === 0) return BLOCK.BEDROCK;
    if (wy < A.floor) return BLOCK.STONE;
    if (wy === A.floor) return r <= 33 ? BLOCK.SMOOTH : BLOCK.GRASS;
    // Above floor level
    if (r <= 20) return BLOCK.AIR;
    const isGate = Math.abs(dz) <= 1.5 && dx > 0;
    if (r <= 22.4) { // inner wall ring (with closed wooden gate to the east)
      if (wy <= 44) return isGate ? BLOCK.WOOD : BLOCK.DARK;
      if (this.arenaTorches.has(`${wx},${wy},${wz}`)) return BLOCK.TORCH;
      return BLOCK.AIR;
    }
    if (r <= 30) { // spectator stands, stepping upward
      const standH = 41 + Math.floor((r - 22.4) / 2);
      return wy <= standH ? BLOCK.SMOOTH : BLOCK.AIR;
    }
    if (r <= 33) { // outer colosseum wall with glowing inlays
      if (wy <= 58) {
        if (wy >= 52 && (wx * 7 + wz * 13 + wy) % 23 === 0) return BLOCK.GLOW;
        return BLOCK.DARK;
      }
      return BLOCK.AIR;
    }
    return BLOCK.AIR;
  },

  /* ================= CHUNK GENERATION ================= */
  chunkNearStructure(cx, cz) {
    const minX = cx * CHUNK_X - 3, maxX = cx * CHUNK_X + CHUNK_X + 3;
    const minZ = cz * CHUNK_Z - 3, maxZ = cz * CHUNK_Z + CHUNK_Z + 3;
    const S = this.SPAWN, A = this.ARENA;
    const near = (px, pz, rad) => px >= minX - rad && px <= maxX + rad && pz >= minZ - rad && pz <= maxZ + rad;
    return near(S.x, S.z, 18) || near(A.x, A.z, 40);
  },

  genChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK_X * CHUNK_Z * CHUNK_Y);
    const hasStruct = this.chunkNearStructure(cx, cz);

    for (let lx = 0; lx < CHUNK_X; lx++) {
      for (let lz = 0; lz < CHUNK_Z; lz++) {
        const wx = cx * CHUNK_X + lx, wz = cz * CHUNK_Z + lz;
        const t = this.terrainAt(wx, wz);
        const colBase = (lx * CHUNK_Z + lz) * CHUNK_Y;
        // Everything above the surface (or the waterline) is air, which the array
        // already holds — so only fill up to what this column actually needs.
        const colTop = hasStruct ? CHUNK_Y - 1 : Math.min(CHUNK_Y - 1, Math.max(t.h, this.SEA) + 1);
        for (let y = 0; y <= colTop; y++) {
          let id = BLOCK.AIR;
          if (hasStruct) {
            const ov = this.structureAt(wx, y, wz);
            if (ov >= 0) { blocks[colBase + y] = ov; continue; }
          }
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y < t.h - 3) id = BLOCK.STONE;
          else if (y < t.h) id = t.h > 88 ? BLOCK.STONE : BLOCK.DIRT;
          else if (y === t.h) {
            if (t.h > 88) id = BLOCK.STONE;
            else if (t.h <= this.SEA + 2) id = BLOCK.SAND;
            else id = BLOCK.GRASS;
          } else if (y <= this.SEA) id = BLOCK.WATER;
          // Caves & ores (below the surface crust only)
          if (id !== BLOCK.AIR && id !== BLOCK.BEDROCK && id !== BLOCK.WATER && y > 1 && y < t.h - 2) {
            if (this.caveAt(wx, y, wz)) {
              id = y <= 14 ? BLOCK.WATER : BLOCK.AIR; // deep caves hold underground lakes
            } else if (id === BLOCK.STONE) {
              const o = this.oreAt(wx, y, wz);
              if (o) id = o;
            }
          }
          blocks[colBase + y] = id;
        }
      }
    }

    // Trees (scan an extended footprint so canopies cross chunk borders cleanly)
    for (let wx = cx * CHUNK_X - 3; wx < (cx + 1) * CHUNK_X + 3; wx++) {
      for (let wz = cz * CHUNK_Z - 3; wz < (cz + 1) * CHUNK_Z + 3; wz++) {
        const tree = this.treeAt(wx, wz);
        if (!tree) continue;
        const topY = tree.h + tree.trunk;
        // Canopy
        for (let dy = topY - 2; dy <= topY + 1; dy++) {
          const rad = dy <= topY ? (dy <= topY - 1 ? 2 : 1) : 1;
          for (let ox = -rad; ox <= rad; ox++) for (let oz = -rad; oz <= rad; oz++) {
            if (Math.abs(ox) === rad && Math.abs(oz) === rad && hash2(wx + ox, wz + oz + dy, this.seed) < 0.5) continue;
            this.stampBlock(blocks, cx, cz, wx + ox, dy, wz + oz, BLOCK.LEAVES, true);
          }
        }
        // Trunk
        for (let y = tree.h + 1; y <= topY; y++) this.stampBlock(blocks, cx, cz, wx, y, wz, BLOCK.WOOD, false);
      }
    }

    // Generated structures (villages, towers, ruins, mines...) and dungeons
    Structures.stampIntoChunk(this, { cx, cz, blocks });
    Dungeons.stampIntoChunk(this, { cx, cz, blocks });

    // Player edits
    const ed = this.editsByChunk.get(`${cx},${cz}`);
    if (ed) for (const [lx, ly, lz, id] of ed) {
      if (ly >= 0 && ly < CHUNK_Y) blocks[(lx * CHUNK_Z + lz) * CHUNK_Y + ly] = id;
    }

    // Highest non-air block in the chunk — lets the mesher skip the empty sky above.
    let maxY = 0;
    for (let col = 0; col < CHUNK_X * CHUNK_Z; col++) {
      const base = col * CHUNK_Y;
      for (let y = CHUNK_Y - 1; y > maxY; y--) {
        if (blocks[base + y] !== BLOCK.AIR) { maxY = y; break; }
      }
    }

    return { cx, cz, blocks, maxY, mesh: null, transMesh: null, torches: [] };
  },

  stampBlock(blocks, cx, cz, wx, wy, wz, id, onlyAir) {
    const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
    if (lx < 0 || lx >= CHUNK_X || lz < 0 || lz >= CHUNK_Z || wy < 0 || wy >= CHUNK_Y) return;
    const i = (lx * CHUNK_Z + lz) * CHUNK_Y + wy;
    if (onlyAir && blocks[i] !== BLOCK.AIR) return;
    blocks[i] = id;
  },

  /* ================= BLOCK ACCESS ================= */
  key(cx, cz) { return `${cx},${cz}`; },

  getBlock(wx, wy, wz) {
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    if (wy < 0 || wy >= CHUNK_Y) return BLOCK.AIR;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c) return BLOCK.AIR;
    return c.blocks[((wx - cx * CHUNK_X) * CHUNK_Z + (wz - cz * CHUNK_Z)) * CHUNK_Y + wy];
  },

  isLoadedAt(wx, wz) {
    return this.chunks.has(this.key(Math.floor(wx / CHUNK_X), Math.floor(wz / CHUNK_Z)));
  },

  isSolid(wx, wy, wz) {
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    if (wy < 0) return true;
    if (wy >= CHUNK_Y) return false;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c) return true; // unloaded terrain is impassable
    const id = c.blocks[((wx - cx * CHUNK_X) * CHUNK_Z + (wz - cz * CHUNK_Z)) * CHUNK_Y + wy];
    return Blocks.isSolid(id);
  },

  setBlock(wx, wy, wz, id, record = true) {
    wx = Math.floor(wx); wy = Math.floor(wy); wz = Math.floor(wz);
    if (wy < 0 || wy >= CHUNK_Y) return false;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const ck = this.key(cx, cz);
    const c = this.chunks.get(ck);
    if (record) {
      this.edits[`${wx},${wy},${wz}`] = id;
      const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
      if (!this.editsByChunk.has(ck)) this.editsByChunk.set(ck, []);
      this.editsByChunk.get(ck).push([lx, wy, lz, id]);
    }
    if (!c) return false;
    const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
    c.blocks[(lx * CHUNK_Z + lz) * CHUNK_Y + wy] = id;
    if (id !== BLOCK.AIR && wy > c.maxY) c.maxY = wy; // keep the mesher's vertical cap valid
    this.dirty.add(ck);
    if (lx === 0) this.dirty.add(this.key(cx - 1, cz));
    if (lx === CHUNK_X - 1) this.dirty.add(this.key(cx + 1, cz));
    if (lz === 0) this.dirty.add(this.key(cx, cz - 1));
    if (lz === CHUNK_Z - 1) this.dirty.add(this.key(cx, cz + 1));
    return true;
  },

  // True when solid terrain sits between two points (line-of-sight test for ranged attacks)
  rayBlocked(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.001) return false;
    dir.divideScalar(dist);
    const hit = this.raycast(from, dir, dist);
    return !!hit;
  },

  surfaceY(wx, wz) {
    wx = Math.floor(wx); wz = Math.floor(wz);
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c) return this.terrainAt(wx, wz).h;
    const base = ((wx - cx * CHUNK_X) * CHUNK_Z + (wz - cz * CHUNK_Z)) * CHUNK_Y;
    for (let y = CHUNK_Y - 1; y >= 0; y--) {
      if (Blocks.isSolid(c.blocks[base + y])) return y;
    }
    return 0;
  },

  inArenaRegion(x, z) {
    return Utils.dist2D(x, z, this.ARENA.x, this.ARENA.z) < 38;
  },

  /* ================= MESHING ================= */
  FACES: [
    { n: [1, 0, 0],  c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.72 },
    { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.72 },
    { n: [0, 1, 0],  c: [[1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 1]], shade: 1.0 },
    { n: [0, -1, 0], c: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], shade: 0.5 },
    { n: [0, 0, 1],  c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.85 },
    { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.85 },
  ],

  buildChunkMesh(chunk) {
    const { cx, cz, blocks } = chunk;
    if (chunk.mesh) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); }
    if (chunk.transMesh) { this.scene.remove(chunk.transMesh); chunk.transMesh.geometry.dispose(); }
    chunk.torches = [];
    this.cacheNeighbors(chunk);

    const solid = { pos: [], norm: [], uv: [], col: [], idx: [] };
    const trans = { pos: [], norm: [], uv: [], col: [], idx: [] };

    const OP = Blocks.OPAQUE, UVS = Blocks.UVS, AO = this.aoOffsets();
    const aos = [1, 1, 1, 1];

    // Classic voxel ambient occlusion: darken verts hemmed in by neighbours.
    // Sample offsets are precomputed per face/corner, so this allocates nothing.
    const aoFor = (lx, ly, lz, f, i) => {
      const b = (f * 4 + i) * 9;
      const s1 = OP[this.neighborId(chunk, lx + AO[b],     ly + AO[b + 1], lz + AO[b + 2])];
      const s2 = OP[this.neighborId(chunk, lx + AO[b + 3], ly + AO[b + 4], lz + AO[b + 5])];
      const cr = OP[this.neighborId(chunk, lx + AO[b + 6], ly + AO[b + 7], lz + AO[b + 8])];
      const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cr);
      return 0.55 + ao * 0.15;
    };

    const pushFace = (buf, face, f, lx, ly, lz, tile, topScale, withAO) => {
      const t4 = tile * 4;
      const u0 = UVS[t4], v0 = UVS[t4 + 1], u1 = UVS[t4 + 2], v1 = UVS[t4 + 3];
      const base = buf.pos.length / 3;
      const n0 = face.n[0], n1 = face.n[1], n2 = face.n[2];
      for (let i = 0; i < 4; i++) {
        const c = face.c[i];
        let cy = c[1];
        if (topScale !== undefined && cy === 1) cy = topScale;
        aos[i] = withAO ? aoFor(lx, ly, lz, f, i) : 1;
        const b = face.shade * aos[i];
        buf.pos.push(lx + c[0], ly + cy, lz + c[2]);
        buf.norm.push(n0, n1, n2);
        buf.uv.push(i === 0 || i === 1 ? u0 : u1, i === 0 || i === 3 ? v0 : v1);
        buf.col.push(b, b, b);
      }
      // Flip the quad diagonal when AO is anisotropic to avoid banding
      if (aos[0] + aos[2] >= aos[1] + aos[3]) {
        buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      } else {
        buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      }
    };

    const topY = Math.min(CHUNK_Y - 1, chunk.maxY === undefined ? CHUNK_Y - 1 : chunk.maxY);
    for (let lx = 0; lx < CHUNK_X; lx++) {
      const wx = cx * CHUNK_X + lx;
      for (let lz = 0; lz < CHUNK_Z; lz++) {
        const wz = cz * CHUNK_Z + lz;
        const colBase = (lx * CHUNK_Z + lz) * CHUNK_Y;
        for (let ly = 0; ly <= topY; ly++) {
          const id = blocks[colBase + ly];
          if (id === BLOCK.AIR) continue;
          const def = Blocks.DEFS[id];

          if (def.torch || def.panel) {
            if (def.torch) chunk.torches.push({ x: wx + 0.5, y: ly + 0.6, z: wz + 0.5 });
            // small free-standing box (torch) or thin full-height panel (ladder/door), all faces drawn
            const d = def.torch
              ? { x0: 0.34, x1: 0.66, y0: 0, y1: 0.7, z0: 0.34, z1: 0.66 }
              : { x0: 0.06, x1: 0.94, y0: 0, y1: 1, z0: 0.37, z1: 0.63 };
            const bright = def.torch ? 1.2 : 0.95;
            const tile = Blocks.tileFor(id, 0);
            for (let f = 0; f < 6; f++) {
              const face = this.FACES[f];
              const { u0, v0, u1, v1 } = Blocks.uv(tile);
              const us = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
              const base = solid.pos.length / 3;
              for (let i = 0; i < 4; i++) {
                const c = face.c[i];
                solid.pos.push(
                  lx + (c[0] ? d.x1 : d.x0),
                  ly + (c[1] ? d.y1 : d.y0),
                  lz + (c[2] ? d.z1 : d.z0)
                );
                solid.norm.push(face.n[0], face.n[1], face.n[2]);
                solid.uv.push(us[i][0], us[i][1]);
                solid.col.push(bright, bright, bright);
              }
              solid.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
            continue;
          }

          const translucent = def.translucent;
          const tileBase = id * 6;
          for (let f = 0; f < 6; f++) {
            const face = this.FACES[f];
            const nid = this.neighborId(chunk, lx + face.n[0], ly + face.n[1], lz + face.n[2]);
            if (translucent) {
              if (nid === id || OP[nid]) continue;
              const topScale = (def.liquid && f === 2) ? 0.875 : undefined;
              pushFace(trans, face, f, lx, ly, lz, Blocks.TILES[tileBase + f], topScale, false);
            } else {
              if (OP[nid]) continue;
              pushFace(solid, face, f, lx, ly, lz, Blocks.TILES[tileBase + f], undefined, true);
            }
          }
        }
      }
    }

    const makeMesh = (buf, mat) => {
      if (buf.idx.length === 0) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.norm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
      g.setIndex(buf.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.position.set(cx * CHUNK_X, 0, cz * CHUNK_Z);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      return m;
    };

    chunk.mesh = makeMesh(solid, Blocks.solidMat);
    chunk.transMesh = makeMesh(trans, Blocks.transMat);
    if (chunk.mesh) this.scene.add(chunk.mesh);
    if (chunk.transMesh) this.scene.add(chunk.transMesh);
  },

  /* Neighbour lookups run six times per solid block, so the four adjacent chunks are
     resolved once per mesh build instead of hashing a string key every call. */
  /* Per face and corner, the three neighbour offsets an AO sample needs. Built once. */
  aoOffsets() {
    if (this._aoOff) return this._aoOff;
    const T = new Int8Array(6 * 4 * 9);
    for (let f = 0; f < 6; f++) {
      const face = this.FACES[f], n = face.n;
      const a = n[0] !== 0 ? 0 : (n[1] !== 0 ? 1 : 2);
      const u = (a + 1) % 3, v = (a + 2) % 3;
      for (let i = 0; i < 4; i++) {
        const c = face.c[i];
        const du = [0, 0, 0], dv = [0, 0, 0];
        du[u] = c[u] === 1 ? 1 : -1;
        dv[v] = c[v] === 1 ? 1 : -1;
        const b = (f * 4 + i) * 9;
        for (let k = 0; k < 3; k++) {
          T[b + k] = n[k] + du[k];
          T[b + 3 + k] = n[k] + dv[k];
          T[b + 6 + k] = n[k] + du[k] + dv[k];
        }
      }
    }
    this._aoOff = T;
    return T;
  },

  cacheNeighbors(chunk) {
    const { cx, cz } = chunk;
    this._nb = {
      xm: this.chunks.get(this.key(cx - 1, cz)) || null,
      xp: this.chunks.get(this.key(cx + 1, cz)) || null,
      zm: this.chunks.get(this.key(cx, cz - 1)) || null,
      zp: this.chunks.get(this.key(cx, cz + 1)) || null,
    };
  },

  neighborId(chunk, lx, ly, lz) {
    if (ly < 0) return BLOCK.BEDROCK;
    if (ly >= CHUNK_Y) return BLOCK.AIR;
    if (lx >= 0 && lx < CHUNK_X && lz >= 0 && lz < CHUNK_Z) {
      return chunk.blocks[(lx * CHUNK_Z + lz) * CHUNK_Y + ly];
    }
    const nb = this._nb;
    let c = null, nx = lx, nz = lz;
    if (lx < 0) { c = nb.xm; nx = lx + CHUNK_X; }
    else if (lx >= CHUNK_X) { c = nb.xp; nx = lx - CHUNK_X; }
    else if (lz < 0) { c = nb.zm; nz = lz + CHUNK_Z; }
    else { c = nb.zp; nz = lz - CHUNK_Z; }
    if (!c) return BLOCK.AIR;
    return c.blocks[(nx * CHUNK_Z + nz) * CHUNK_Y + ly];
  },

  /* ================= CHUNK STREAMING ================= */
  update(playerPos) {
    const R = Game.settings.renderDist;
    const pcx = Math.floor(playerPos.x / CHUNK_X), pcz = Math.floor(playerPos.z / CHUNK_Z);

    // Queue missing chunks, nearest first
    this.genQueue.length = 0;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      const cx = pcx + dx, cz = pcz + dz;
      if (!this.chunks.has(this.key(cx, cz))) this.genQueue.push([cx, cz, dx * dx + dz * dz]);
    }
    this.genQueue.sort((a, b) => a[2] - b[2]);

    // Time-boxed streaming: keep generating while there is frame budget left, so fast
    // machines fill the world quickly and slow ones simply stream a little further out
    // instead of dropping frames.
    const t0 = performance.now();
    const BUDGET_MS = 6;
    let made = 0;
    for (const [cx, cz] of this.genQueue) {
      const c = this.genChunk(cx, cz);
      this.chunks.set(this.key(cx, cz), c);
      this.buildChunkMesh(c);
      made++;
      if (performance.now() - t0 > BUDGET_MS) break;
      if (made >= 4) break;
    }

    // Remesh dirty chunks with whatever budget remains (always do at least one so
    // block edits never feel laggy)
    let meshed = 0;
    for (const ck of Array.from(this.dirty)) {
      const c = this.chunks.get(ck);
      this.dirty.delete(ck);
      if (!c) continue;
      this.buildChunkMesh(c);
      if (++meshed >= 4 || performance.now() - t0 > BUDGET_MS + 4) break;
    }

    // Unload far chunks
    for (const [ck, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (R + 2) * (R + 2)) {
        if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
        if (c.transMesh) { this.scene.remove(c.transMesh); c.transMesh.geometry.dispose(); }
        this.chunks.delete(ck);
      }
    }
  },

  forceArea(x, z, chunkRadius) {
    const pcx = Math.floor(x / CHUNK_X), pcz = Math.floor(z / CHUNK_Z);
    for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
      for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (this.chunks.has(this.key(cx, cz))) continue;
        const c = this.genChunk(cx, cz);
        this.chunks.set(this.key(cx, cz), c);
        this.buildChunkMesh(c);
      }
    }
  },

  /* ================= PHYSICS ================= */
  boxFree(px, py, pz, w, h) {
    const r = w / 2, e = 0.001;
    const x0 = Math.floor(px - r), x1 = Math.floor(px + r - e);
    const y0 = Math.floor(py), y1 = Math.floor(py + h - e);
    const z0 = Math.floor(pz - r), z1 = Math.floor(pz + r - e);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      if (this.isSolid(x, y, z)) return false;
    }
    return true;
  },

  moveEntity(ent, dt) {
    ent.onGround = false;
    const maxV = Math.max(Math.abs(ent.vel.x), Math.abs(ent.vel.y), Math.abs(ent.vel.z));
    const sub = Math.max(1, Math.min(20, Math.ceil(maxV * dt / 0.2)));
    const sdt = dt / sub;
    for (let s = 0; s < sub; s++) {
      const nx = ent.pos.x + ent.vel.x * sdt;
      if (this.boxFree(nx, ent.pos.y, ent.pos.z, ent.w, ent.h)) ent.pos.x = nx;
      else ent.vel.x = 0;
      const nz = ent.pos.z + ent.vel.z * sdt;
      if (this.boxFree(ent.pos.x, ent.pos.y, nz, ent.w, ent.h)) ent.pos.z = nz;
      else ent.vel.z = 0;
      const ny = ent.pos.y + ent.vel.y * sdt;
      if (this.boxFree(ent.pos.x, ny, ent.pos.z, ent.w, ent.h)) ent.pos.y = ny;
      else { if (ent.vel.y < 0) ent.onGround = true; ent.vel.y = 0; }
    }
  },

  /* ================= RAYCASTING (voxel DDA) ================= */
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tdx = Math.abs(dir.x) < 1e-9 ? Infinity : Math.abs(1 / dir.x);
    const tdy = Math.abs(dir.y) < 1e-9 ? Infinity : Math.abs(1 / dir.y);
    const tdz = Math.abs(dir.z) < 1e-9 ? Infinity : Math.abs(1 / dir.z);
    let tx = tdx === Infinity ? Infinity : (stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tdx;
    let ty = tdy === Infinity ? Infinity : (stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tdy;
    let tz = tdz === Infinity ? Infinity : (stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tdz;
    let px = x, py = y, pz = z, t = 0;

    for (let i = 0; i < 256; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER && id !== BLOCK.PORTAL) {
        return { x, y, z, id, px, py, pz, dist: t };
      }
      px = x; py = y; pz = z;
      if (tx <= ty && tx <= tz) { t = tx; tx += tdx; x += stepX; }
      else if (ty <= tz) { t = ty; ty += tdy; y += stepY; }
      else { t = tz; tz += tdz; z += stepZ; }
      if (t > maxDist) return null;
    }
    return null;
  },

  /* ================= LIVE STRUCTURES ================= */
  buildMonument() {
    if (this.monumentBuilt) return;
    this.monumentBuilt = true;
    const S = this.SPAWN;
    const bx = S.x + 7, bz = S.z + 5, by = S.h;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      this.setBlock(bx + ox, by + 1, bz + oz, BLOCK.SMOOTH);
    }
    this.setBlock(bx, by + 2, bz, BLOCK.GOLD);
    this.setBlock(bx, by + 3, bz, BLOCK.GOLD);
    this.setBlock(bx, by + 4, bz, BLOCK.GLOW);
    this.monumentLabelPos = new THREE.Vector3(bx + 0.5, by + 6.2, bz + 0.5);
  },

  monumentLabelPosition() {
    const S = this.SPAWN;
    return new THREE.Vector3(S.x + 7.5, S.h + 6.2, S.z + 5.5);
  },

  buildChampionPortal() {
    const A = this.ARENA;
    const x = A.x + 15, by = A.floor;
    for (let oz = -2; oz <= 2; oz++) {
      for (let y = by + 1; y <= by + 6; y++) {
        const edge = (oz === -2 || oz === 2 || y === by + 1 || y === by + 6);
        this.setBlock(x, y, A.z + oz, edge ? BLOCK.GLOW : BLOCK.PORTAL, false);
      }
    }
    this.championPortal = {
      trigger: {
        minX: x - 0.6, maxX: x + 1.6,
        minY: by + 1, maxY: by + 6,
        minZ: A.z - 1, maxZ: A.z + 2,
      },
      labelPos: new THREE.Vector3(x + 0.5, by + 8, A.z + 0.5),
    };
  },

  removeChampionPortal() {
    if (!this.championPortal) return;
    const A = this.ARENA;
    const x = A.x + 15, by = A.floor;
    for (let oz = -2; oz <= 2; oz++) {
      for (let y = by + 1; y <= by + 6; y++) this.setBlock(x, y, A.z + oz, BLOCK.AIR, false);
    }
    this.championPortal = null;
  },

  serializeEdits() { return this.edits; },
};
