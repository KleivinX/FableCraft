'use strict';
/* FableCraft — quest chain: mining, combat, crafting, arena and the dragon.
   Quests auto-track; rewards are claimed from the quest log (J). */

const Quests = {
  counters: { wood: 0, ores: 0, swords: 0, iron: 0 },
  claimed: [],
  notified: [],
  isOpen: false,
  checkT: 0,

  DEFS: [
    { id: 'q1', name: 'First Steps', desc: 'Mine 10 blocks', need: 10, cur: () => Game.stats.mined, reward: { xp: 50, coins: 50 } },
    { id: 'q2', name: 'Lumberjack', desc: 'Collect 10 wood', need: 10, cur: () => Quests.counters.wood, reward: { xp: 60, items: [[BLOCK.TORCH, 5]] } },
    { id: 'q3', name: 'Armed and Ready', desc: 'Craft any sword', need: 1, cur: () => Quests.counters.swords, reward: { xp: 80, coins: 100 } },
    { id: 'q4', name: 'Night Watch', desc: 'Defeat 5 enemies', need: 5, cur: () => Game.stats.kills, reward: { xp: 120, coins: 150, items: [[ITEM.POT_HEALTH, 2]] } },
    { id: 'q5', name: 'Into the Depths', desc: 'Mine 5 ore blocks', need: 5, cur: () => Quests.counters.ores, reward: { xp: 150, items: [[ITEM.IRON, 3]] } },
    { id: 'q6', name: 'Iron Age', desc: 'Craft an iron item', need: 1, cur: () => Quests.counters.iron, reward: { xp: 200, coins: 200 } },
    { id: 'q7', name: 'Gladiator', desc: 'Clear arena wave 1', need: 1, cur: () => Math.min(1, Game.stats.waves), reward: { xp: 250, coins: 300, items: [[ITEM.POT_MANA, 2]] } },
    { id: 'q8', name: 'Arena Veteran', desc: 'Clear 3 arena waves', need: 3, cur: () => Game.stats.waves, reward: { xp: 400, coins: 500, items: [[ITEM.CRYSTAL, 3]] } },
    { id: 'q9', name: 'Dragonslayer', desc: 'Defeat the Ancient Dragon', need: 1, cur: () => Game.stats.dragonKills, reward: { xp: 1000, coins: 1000, items: [[ITEM.DRAGON_CRYSTAL, 2]] } },
    { id: 'q10', name: "Champion's Legacy", desc: 'Hold a Dragon Core', need: 1, cur: () => Math.min(1, Inv.countOf(ITEM.DRAGON_CORE)), reward: { xp: 500, items: [[ITEM.SPELL_BOOK, 1]] } },
  ],

  init() {
    document.getElementById('quest-close').addEventListener('click', () => this.close());
  },

  onCollect(id, count) {
    if (id === BLOCK.WOOD) this.counters.wood += count;
  },

  onMine(id) {
    if (id === BLOCK.COAL_ORE || id === BLOCK.IRON_ORE || id === BLOCK.GOLD_ORE || id === BLOCK.CRYSTAL_ORE) {
      this.counters.ores++;
    }
  },

  onCraft(resultId) {
    const it = Items.get(resultId);
    if (!it) return;
    if (it.tool && it.tool.type === 'sword') this.counters.swords++;
    if ([ITEM.IRON_SWORD, ITEM.IRON_PICK, ITEM.IRON_AXE, ITEM.IRON_SHOVEL, ITEM.I_HELM, ITEM.I_CHEST, ITEM.I_LEGS, ITEM.I_BOOTS, ITEM.SHIELD].includes(resultId)) {
      this.counters.iron++;
    }
  },

  isComplete(q) { return q.cur() >= q.need; },
  isClaimed(q) { return this.claimed.includes(q.id); },

  // Quests unlock in order: a quest is visible once the previous one is claimed
  visibleQuests() {
    const out = [];
    for (const q of this.DEFS) {
      out.push(q);
      if (!this.isClaimed(q)) break;
    }
    return out;
  },

  claim(q) {
    if (this.isClaimed(q) || !this.isComplete(q)) return;
    this.claimed.push(q.id);
    const r = q.reward;
    if (r.xp) Player.addXP(r.xp);
    if (r.coins) { Player.addCoins(r.coins); Game.stats.coinsEarned += r.coins; }
    if (r.items) {
      for (const [id, count] of r.items) {
        const left = Inv.add(id, count);
        if (left > 0) Entities.spawnDrop(Player.pos.clone().add(new THREE.Vector3(0, 1, 0)), { item: id, count: left });
      }
    }
    AudioSys.play('quest');
    UI.banner('QUEST COMPLETE', q.name, 2.5);
    this.refresh();
  },

  rewardText(q) {
    const parts = [];
    if (q.reward.xp) parts.push(`${q.reward.xp} XP`);
    if (q.reward.coins) parts.push(`${q.reward.coins}🪙`);
    if (q.reward.items) for (const [id, n] of q.reward.items) parts.push(`${n}× ${Items.get(id).name}`);
    return parts.join(', ');
  },

  open() {
    this.isOpen = true;
    document.getElementById('quest-screen').classList.remove('hidden');
    Game.setUIOpen(true);
    this.refresh();
  },

  close() {
    this.isOpen = false;
    document.getElementById('quest-screen').classList.add('hidden');
    Game.setUIOpen(false);
  },

  refresh() {
    if (!this.isOpen) return;
    const list = document.getElementById('quest-list');
    list.innerHTML = '';
    for (const q of this.visibleQuests()) {
      const claimed = this.isClaimed(q);
      const cur = Math.min(q.need, q.cur());
      const done = this.isComplete(q);
      const d = document.createElement('div');
      d.className = 'quest' + (claimed ? ' claimed' : '');
      d.innerHTML = `
        <div class="q-head"><span class="q-name">${q.name}</span><span class="q-prog">${claimed ? '✔ done' : `${cur} / ${q.need}`}</span></div>
        <div class="q-desc">${q.desc}</div>
        <div class="q-bar"><div class="q-fill" style="width:${(cur / q.need) * 100}%"></div></div>
        <div class="q-reward">Reward: ${this.rewardText(q)}</div>`;
      if (!claimed) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = done ? 'Claim Reward' : 'In Progress';
        b.disabled = !done;
        b.addEventListener('click', () => this.claim(q));
        d.appendChild(b);
      }
      list.appendChild(d);
    }
  },

  // Notify when a quest first becomes claimable
  update(dt) {
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    for (const q of this.visibleQuests()) {
      if (!this.isClaimed(q) && this.isComplete(q) && !this.notified.includes(q.id)) {
        this.notified.push(q.id);
        UI.message(`Quest ready: ${q.name} — press ${Game.bindLabel('quests')} to claim!`, 4);
        AudioSys.play('quest');
      }
    }
    if (this.isOpen) this.refresh();
  },

  serialize() { return { counters: this.counters, claimed: this.claimed, notified: this.notified }; },
  load(d) {
    if (!d) return;
    this.counters = Object.assign({ wood: 0, ores: 0, swords: 0, iron: 0 }, d.counters);
    this.claimed = d.claimed || [];
    this.notified = d.notified || [];
  },
};
