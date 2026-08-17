'use strict';
/* FableCraft — character designer: every player builds their own voxel hero.
   The avatar is assembled from boxes, previewed live in its own little renderer,
   worn as the first-person arms, and shown in full when you flip to third person. */

const Character = {
  KEY: 'fablecraft_character',
  isOpen: false,

  /* ---------------- palettes ---------------- */
  cfg: null,

  PALETTES: {
    skin: ['#f6d5b8', '#efc19c', '#e0a878', '#c78a5a', '#a06a3f', '#7a4d2b', '#54331a', '#b8e6c8', '#d8c2f0'],
    hairColor: ['#1c1410', '#3d2b1f', '#6b4423', '#a9713b', '#d9b166', '#f0e0b0', '#b33a3a', '#e8e8ee', '#4d7fd6', '#c04dbe', '#3fae72'],
    eyes: ['#2b2b33', '#4a7a3a', '#3a6ba8', '#7a4a2a', '#8a3ab8', '#b03a3a', '#2aa8a8'],
    shirt: ['#2f7ad6', '#c8432f', '#3fa85c', '#e0a52c', '#8a3ec4', '#e06aa8', '#2b2f3a', '#e8e8ee', '#5a3a22', '#2aa8a8', '#f0782c', '#7a8a9a'],
    pants: ['#38445c', '#2b2f3a', '#5a3a22', '#3f5a3a', '#6a3a5a', '#8a8a94', '#1f2430', '#a05a2c'],
    shoes: ['#2b2118', '#1c1c22', '#5a3a22', '#8a8a94', '#c8432f', '#e8e8ee'],
    cape: ['#c8432f', '#2f7ad6', '#3fa85c', '#8a3ec4', '#1f2430', '#e0a52c', '#e8e8ee'],
  },

  HAIR_STYLES: ['None', 'Short', 'Long', 'Mohawk', 'Ponytail', 'Bun', 'Curly'],
  HATS: ['None', 'Cap', 'Wizard Hat', 'Crown', 'Helmet', 'Horns'],
  BUILDS: ['Slim', 'Normal', 'Broad'],

  DEFAULT: {
    name: 'Hero', skin: 0, hairStyle: 1, hairColor: 1, eyes: 0,
    shirt: 0, pants: 0, shoes: 0, hat: 0, build: 1, cape: -1,
  },

  /* ---------------- persistence ---------------- */
  init() {
    this.cfg = Object.assign({}, this.DEFAULT);
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) Object.assign(this.cfg, JSON.parse(raw));
    } catch (e) { /* storage unavailable — keep defaults */ }
    this.clampCfg();
  },

  clampCfg() {
    const c = this.cfg, P = this.PALETTES;
    const lim = (v, n) => Math.max(0, Math.min(n - 1, v | 0));
    c.skin = lim(c.skin, P.skin.length);
    c.hairColor = lim(c.hairColor, P.hairColor.length);
    c.eyes = lim(c.eyes, P.eyes.length);
    c.shirt = lim(c.shirt, P.shirt.length);
    c.pants = lim(c.pants, P.pants.length);
    c.shoes = lim(c.shoes, P.shoes.length);
    c.hairStyle = lim(c.hairStyle, this.HAIR_STYLES.length);
    c.hat = lim(c.hat, this.HATS.length);
    c.build = lim(c.build, this.BUILDS.length);
    if (c.cape >= P.cape.length) c.cape = P.cape.length - 1;
    if (typeof c.name !== 'string' || !c.name.trim()) c.name = 'Hero';
    c.name = c.name.slice(0, 16);
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); }
    catch (e) { /* storage unavailable */ }
  },

  colors() {
    const c = this.cfg, P = this.PALETTES;
    return {
      skin: P.skin[c.skin], hair: P.hairColor[c.hairColor], eyes: P.eyes[c.eyes],
      shirt: P.shirt[c.shirt], pants: P.pants[c.pants], shoes: P.shoes[c.shoes],
      cape: c.cape >= 0 ? P.cape[c.cape] : null,
    };
  },

  /* ---------------- avatar construction ----------------
     Built facing +Z so the preview looks straight at the camera; the world model
     is turned by yaw + PI so it faces wherever the player is looking. */
  build(cfg) {
    const c = cfg || this.cfg;
    const P = this.PALETTES;
    const col = {
      skin: P.skin[c.skin], hair: P.hairColor[c.hairColor], eyes: P.eyes[c.eyes],
      shirt: P.shirt[c.shirt], pants: P.pants[c.pants], shoes: P.shoes[c.shoes],
      cape: c.cape >= 0 ? P.cape[c.cape] : null,
    };
    const mat = (hex) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
    const M = { skin: mat(col.skin), hair: mat(col.hair), eyes: mat(col.eyes),
                shirt: mat(col.shirt), pants: mat(col.pants), shoes: mat(col.shoes),
                mouth: mat('#7a4a44'), metal: mat('#c8ccd4'), gold: mat('#e4c344') };

    const g = new THREE.Group();
    const parts = [];
    const box = (parent, w, h, d, m, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      parts.push(mesh);
      return mesh;
    };

    // Build affects torso width and limb thickness
    const bw = [0.86, 1, 1.16][c.build];
    const torsoW = 0.52 * bw, armT = 0.16 * bw, legT = 0.19 * bw;
    const HIP = 0.68, SHOULDER = 1.28, HEAD_Y = 1.52, HEAD = 0.44;

    // Legs (pivot at the hip so they can swing)
    const legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (legT * 0.62), HIP, 0);
      g.add(pivot);
      box(pivot, legT, HIP, legT, M.pants, 0, -HIP / 2, 0);
      box(pivot, legT + 0.03, 0.1, legT + 0.06, M.shoes, 0, -HIP + 0.05, 0.02);
      legs.push(pivot);
    }

    // Torso
    box(g, torsoW, SHOULDER - HIP, 0.27, M.shirt, 0, (HIP + SHOULDER) / 2, 0);

    // Arms (pivot at the shoulder)
    const arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (torsoW / 2 + armT / 2), SHOULDER - 0.02, 0);
      g.add(pivot);
      box(pivot, armT, 0.44, armT, M.shirt, 0, -0.22, 0);   // sleeve
      box(pivot, armT, 0.16, armT, M.skin, 0, -0.52, 0);    // hand
      arms.push(pivot);
    }

    // Head + face
    const head = new THREE.Group();
    head.position.set(0, HEAD_Y, 0);
    g.add(head);
    box(head, HEAD, HEAD, HEAD, M.skin, 0, 0, 0);
    box(head, 0.07, 0.07, 0.03, M.eyes, -0.10, 0.04, HEAD / 2);
    box(head, 0.07, 0.07, 0.03, M.eyes, 0.10, 0.04, HEAD / 2);
    box(head, 0.13, 0.03, 0.02, M.mouth, 0, -0.10, HEAD / 2);  // mouth

    // Hair
    const hairTop = HEAD / 2;
    switch (this.HAIR_STYLES[c.hairStyle]) {
      case 'Short':
        box(head, HEAD + 0.02, 0.08, HEAD + 0.02, M.hair, 0, hairTop - 0.02, 0);
        box(head, HEAD + 0.02, 0.16, 0.06, M.hair, 0, 0.06, -HEAD / 2);
        break;
      case 'Long':
        box(head, HEAD + 0.02, 0.08, HEAD + 0.02, M.hair, 0, hairTop - 0.02, 0);
        box(head, 0.06, 0.36, HEAD, M.hair, -(HEAD / 2), -0.06, 0);
        box(head, 0.06, 0.36, HEAD, M.hair, HEAD / 2, -0.06, 0);
        box(head, HEAD + 0.02, 0.42, 0.06, M.hair, 0, -0.10, -HEAD / 2);
        break;
      case 'Mohawk':
        box(head, 0.10, 0.18, HEAD + 0.02, M.hair, 0, hairTop + 0.06, 0);
        break;
      case 'Ponytail':
        box(head, HEAD + 0.02, 0.08, HEAD + 0.02, M.hair, 0, hairTop - 0.02, 0);
        box(head, 0.12, 0.34, 0.12, M.hair, 0, -0.02, -(HEAD / 2 + 0.06));
        break;
      case 'Bun':
        box(head, HEAD + 0.02, 0.08, HEAD + 0.02, M.hair, 0, hairTop - 0.02, 0);
        box(head, 0.20, 0.20, 0.20, M.hair, 0, hairTop + 0.06, -0.14);
        break;
      case 'Curly':
        box(head, HEAD + 0.02, 0.10, HEAD + 0.02, M.hair, 0, hairTop - 0.01, 0);
        for (const [hx, hz] of [[-0.16, 0.16], [0.16, 0.16], [-0.16, -0.16], [0.16, -0.16], [0, -0.2], [0, 0.2]]) {
          box(head, 0.16, 0.16, 0.16, M.hair, hx, hairTop + 0.03, hz);
        }
        break;
    }

    // Hats
    const hatY = hairTop + 0.04;
    switch (this.HATS[c.hat]) {
      case 'Cap':
        box(head, HEAD + 0.04, 0.12, HEAD + 0.04, M.shirt, 0, hatY + 0.05, 0);
        box(head, HEAD, 0.04, 0.18, M.shirt, 0, hatY, HEAD / 2 + 0.05);
        break;
      case 'Wizard Hat':
        box(head, HEAD + 0.22, 0.05, HEAD + 0.22, M.shirt, 0, hatY, 0);
        box(head, 0.32, 0.14, 0.32, M.shirt, 0, hatY + 0.10, 0);
        box(head, 0.22, 0.14, 0.22, M.shirt, 0, hatY + 0.23, 0);
        box(head, 0.12, 0.14, 0.12, M.shirt, 0, hatY + 0.35, -0.02);
        break;
      case 'Crown':
        box(head, HEAD + 0.03, 0.09, HEAD + 0.03, M.gold, 0, hatY + 0.04, 0);
        for (const sx of [-0.15, 0, 0.15]) box(head, 0.07, 0.09, 0.07, M.gold, sx, hatY + 0.12, HEAD / 2 - 0.04);
        for (const sx of [-0.15, 0, 0.15]) box(head, 0.07, 0.09, 0.07, M.gold, sx, hatY + 0.12, -(HEAD / 2 - 0.04));
        break;
      case 'Helmet':
        box(head, HEAD + 0.05, 0.24, HEAD + 0.05, M.metal, 0, 0.12, 0);
        box(head, 0.06, 0.16, 0.04, M.metal, 0, 0.02, HEAD / 2 + 0.01);
        break;
      case 'Horns':
        box(head, 0.08, 0.16, 0.08, M.metal, -0.17, hatY + 0.06, 0);
        box(head, 0.08, 0.16, 0.08, M.metal, 0.17, hatY + 0.06, 0);
        break;
    }

    // Cape
    if (col.cape) box(g, torsoW + 0.04, 0.72, 0.05, mat(col.cape), 0, 0.94, -0.17);

    g.userData = { legs, arms, head, parts, phase: 0 };
    return g;
  },

  dispose(model) {
    if (!model) return;
    model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  },

  /* ---------------- world (third-person) model ---------------- */
  worldModel: null,

  ensureWorldModel(scene) {
    if (this.worldModel) {
      scene.remove(this.worldModel);
      this.dispose(this.worldModel);
    }
    this.worldModel = this.build();
    this.worldModel.visible = false;
    scene.add(this.worldModel);
  },

  updateWorldModel(dt) {
    const m = this.worldModel;
    if (!m || !m.visible) return;
    m.position.set(Player.pos.x, Player.pos.y, Player.pos.z);
    m.rotation.y = Player.yaw + Math.PI;

    const ud = m.userData;
    const speed = Math.hypot(Player.vel.x, Player.vel.z);
    if (speed > 0.4 && Player.onGround) ud.phase += dt * Math.min(14, 3 + speed * 2.2);
    else ud.phase += dt * 1.2;
    const swing = speed > 0.4 && Player.onGround ? Math.min(0.85, speed * 0.22) : 0.06;
    const s = Math.sin(ud.phase);
    ud.legs[0].rotation.x = s * swing;
    ud.legs[1].rotation.x = -s * swing;
    ud.arms[0].rotation.x = -s * swing * 0.85;
    ud.arms[1].rotation.x = s * swing * 0.85;
    // Head follows the camera pitch
    ud.head.rotation.x = -Utils.clamp(Player.pitch, -0.7, 0.7);
    if (Player.inWater) { ud.arms[0].rotation.x = -1.2; ud.arms[1].rotation.x = -1.2; }
  },

  /* ---------------- designer UI ---------------- */
  pv: null, // { renderer, scene, camera, model, raf, spin }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    document.getElementById('character-screen').classList.remove('hidden');
    this.buildControls();
    this.startPreview();
    AudioSys.play('click');
    if (Game.started) Game.updateLockState();
  },

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.getElementById('character-screen').classList.add('hidden');
    this.stopPreview();
    this.save();
    this.apply();
    if (Game.started) Game.updateLockState();
  },

  // Push the current look into the game: arms, world model, name tag
  apply() {
    this.clampCfg();
    if (Game.scene) this.ensureWorldModel(Game.scene);
    if (Game.refreshArmColors) Game.refreshArmColors();
    if (Game.thirdPerson && this.worldModel) this.worldModel.visible = true;
  },

  randomize() {
    const P = this.PALETTES, c = this.cfg;
    const pick = (n) => Math.floor(Math.random() * n);
    c.skin = pick(P.skin.length);
    c.hairStyle = pick(this.HAIR_STYLES.length);
    c.hairColor = pick(P.hairColor.length);
    c.eyes = pick(P.eyes.length);
    c.shirt = pick(P.shirt.length);
    c.pants = pick(P.pants.length);
    c.shoes = pick(P.shoes.length);
    c.hat = pick(this.HATS.length);
    c.build = pick(this.BUILDS.length);
    c.cape = Math.random() < 0.4 ? pick(P.cape.length) : -1;
    this.buildControls();
    this.refreshPreview();
    AudioSys.play('click');
  },

  buildControls() {
    const wrap = document.getElementById('char-controls');
    wrap.innerHTML = '';
    const c = this.cfg;

    // Name field
    const nameRow = document.createElement('div');
    nameRow.className = 'char-row';
    nameRow.innerHTML = '<span class="char-label">Name</span>';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'char-name';
    input.maxLength = 16;
    input.value = c.name;
    input.addEventListener('input', () => { c.name = input.value.slice(0, 16); });
    nameRow.appendChild(input);
    wrap.appendChild(nameRow);

    // Swatch rows
    const swatchRow = (label, key, colors, allowNone) => {
      const row = document.createElement('div');
      row.className = 'char-row';
      row.innerHTML = `<span class="char-label">${label}</span>`;
      const strip = document.createElement('div');
      strip.className = 'char-swatches';
      const mk = (i, color) => {
        const b = document.createElement('button');
        b.className = 'swatch' + (c[key] === i ? ' active' : '');
        if (color) b.style.background = color;
        else { b.classList.add('none'); b.textContent = '∅'; }
        b.title = color || 'None';
        b.addEventListener('click', () => {
          c[key] = i;
          this.buildControls();
          this.refreshPreview();
          AudioSys.play('click');
        });
        strip.appendChild(b);
      };
      if (allowNone) mk(-1, null);
      colors.forEach((col, i) => mk(i, col));
      row.appendChild(strip);
      wrap.appendChild(row);
    };

    // Option (text) rows
    const optionRow = (label, key, names) => {
      const row = document.createElement('div');
      row.className = 'char-row';
      row.innerHTML = `<span class="char-label">${label}</span>`;
      const strip = document.createElement('div');
      strip.className = 'char-options';
      names.forEach((n, i) => {
        const b = document.createElement('button');
        b.className = 'btn opt' + (c[key] === i ? ' active' : '');
        b.textContent = n;
        b.addEventListener('click', () => {
          c[key] = i;
          this.buildControls();
          this.refreshPreview();
          AudioSys.play('click');
        });
        strip.appendChild(b);
      });
      row.appendChild(strip);
      wrap.appendChild(row);
    };

    const P = this.PALETTES;
    swatchRow('Skin', 'skin', P.skin);
    optionRow('Build', 'build', this.BUILDS);
    optionRow('Hair', 'hairStyle', this.HAIR_STYLES);
    swatchRow('Hair Colour', 'hairColor', P.hairColor);
    swatchRow('Eyes', 'eyes', P.eyes);
    optionRow('Hat', 'hat', this.HATS);
    swatchRow('Shirt', 'shirt', P.shirt);
    swatchRow('Trousers', 'pants', P.pants);
    swatchRow('Boots', 'shoes', P.shoes);
    swatchRow('Cape', 'cape', P.cape, true);
  },

  /* ---------------- live 3D preview ---------------- */
  startPreview() {
    const canvas = document.getElementById('char-preview');
    if (!this.pv) {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth || 280, canvas.clientHeight || 340, false);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, (canvas.clientWidth || 280) / (canvas.clientHeight || 340), 0.1, 40);
      camera.position.set(0, 1.05, 3.5);
      camera.lookAt(0, 0.95, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(2, 4, 3);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xb14df0, 0.35);
      rim.position.set(-3, 2, -2);
      scene.add(rim);
      this.pv = { renderer, scene, camera, model: null, raf: 0, spin: 0, drag: null };
      this.bindPreviewDrag(canvas);
    }
    this.refreshPreview();
    const loop = () => {
      if (!this.isOpen) return;
      this.pv.raf = requestAnimationFrame(loop);
      if (this.pv.model && !this.pv.drag) this.pv.spin += 0.008;
      if (this.pv.model) this.pv.model.rotation.y = this.pv.spin;
      this.pv.renderer.render(this.pv.scene, this.pv.camera);
    };
    loop();
  },

  bindPreviewDrag(canvas) {
    let last = null;
    canvas.addEventListener('pointerdown', (e) => { last = e.clientX; this.pv.drag = true; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (last === null) return;
      this.pv.spin += (e.clientX - last) * 0.012;
      last = e.clientX;
    });
    const end = () => { last = null; this.pv.drag = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
  },

  refreshPreview() {
    if (!this.pv) return;
    if (this.pv.model) {
      this.pv.scene.remove(this.pv.model);
      this.dispose(this.pv.model);
    }
    this.clampCfg();
    const m = this.build();
    m.rotation.y = this.pv.spin;
    this.pv.scene.add(m);
    this.pv.model = m;
  },

  stopPreview() {
    if (this.pv && this.pv.raf) cancelAnimationFrame(this.pv.raf);
  },
};
