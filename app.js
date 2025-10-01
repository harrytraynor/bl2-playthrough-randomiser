(() => {
  const state = { categories: [], difficulty: 'standard', configSource: 'pending' };

  const difficultyDescriptionEl = document.getElementById('difficulty-description');
  const difficultyChipElements = Array.from(document.querySelectorAll('#difficulty-options .chip'));
  const randomiseBtn = document.getElementById('randomise');
  const downloadBtn = document.getElementById('download-run');
  const seedInputEl = document.getElementById('seed');
  const resultSummaryEl = document.getElementById('result-summary');
  const resultGridEl = document.getElementById('result-grid');

  const ADVANCED_CATEGORY_KEYS = ['grenademod', 'relic', 'shield', 'insaneplaythroughs', 'insanitydoseometer'];
  const RELAXED_CORE_KEYS = ['character', 'manufacturer', 'weapontype', 'weaponstype', 'itemsweapontypes', 'itemrarity', 'rarities'];
  const AWKWARD_ITEMS = {
    manufacturer: ['Tediore', 'Bandit', 'Jakobs', 'Torgue'],
    weapontype: ['Rocket Launcher', 'Sniper Rifle', 'Shotgun'],
    shield: ['Pangolin', 'Bandit', 'Torgue'],
    grenademod: ['Vladof', 'Torgue', 'Tediore'],
    relic: ['Tenacity', 'Resistance', 'Proficiency'],
    itemrarity: ['Legendary (Orange)']
  };

  const CARD_PALETTES = [
    { from: '#ffe66d', to: '#ef6f6c' },
    { from: '#b6f7ff', to: '#2bb5ff' },
    { from: '#f4cafe', to: '#b5179e' },
    { from: '#d3f36b', to: '#4cc9f0' },
    { from: '#f7d488', to: '#f15bb5' },
    { from: '#cddafd', to: '#7209b7' }
  ];

  const DIFFICULTY_FLAVOUR = {
    relaxed: 'Chill run. Focused kit, minimal constraints, maximal vibes.',
    standard: 'Classic vault hunting. Every pillar represented with balanced picks.',
    mayhem: 'Full-throttle pandemonium. Expect curveballs, awkward gear, and extra pulls.'
  };

  const difficultyProfiles = {
    relaxed: {
      label: 'Relaxed',
      description: 'Focuses on signature choices and trims the chaos for a breezy run.',
      prepare(baseCats, rng) {
        const core = baseCats.filter(cat => !isAdvanced(cat.name) && isRelaxedCore(cat.name));
        if (!core.length) return cloneForStandard(baseCats);
        const limit = Math.min(core.length, 6);
        const chosen = seededShuffle(core, rng).slice(0, limit);
        return chosen.map(cat => {
          const copy = cloneCategory(cat);
          const filtered = filterOutAwkward(copy.items, copy.name);
          copy.items = filtered.length ? filtered : copy.items.slice();
          copy.pick = Math.max(1, Math.min(copy.pick, 2, copy.items.length));
          copy.strategy = 'relaxed';
          copy.awkwardPool = [];
          copy.ensureAwkward = false;
          return copy;
        });
      }
    },
    standard: {
      label: 'Balanced',
      description: 'A classic randomiser experience touching every category once.',
      prepare(baseCats) {
        return cloneForStandard(baseCats);
      }
    },
    mayhem: {
      label: 'Mayhem',
      description: 'Dialled-up chaos: extra picks, awkward loadouts, and surprise wildcards.',
      prepare(baseCats, rng) {
        return baseCats.map(cat => {
          const copy = cloneCategory(cat);
          copy.strategy = 'mayhem';
          copy.awkwardPool = getAwkwardPool(copy);
          copy.ensureAwkward = copy.awkwardPool.length > 0;
          if (copy.items.length > 1) {
            copy.pick = Math.min(copy.items.length, copy.pick + 1);
          }
          copy.bonusRoll = copy.items.length > copy.pick && rng() > 0.45;
          return copy;
        });
      }
    }
  };

  function normalizeName(name) {
    return (name || '').trim().toLowerCase();
  }

  function normalizeItem(item) {
    return (item || '').trim().toLowerCase();
  }

  function sanitizeKey(name) {
    return normalizeName(name).replace(/[^a-z0-9]/g, '');
  }

  function isAdvanced(name) {
    const key = sanitizeKey(name);
    return ADVANCED_CATEGORY_KEYS.some(adv => key.includes(adv));
  }

  function isRelaxedCore(name) {
    const key = sanitizeKey(name);
    return RELAXED_CORE_KEYS.some(core => key.includes(core));
  }

  function cloneCategory(cat) {
    return { name: cat.name, pick: cat.pick, items: cat.items.slice() };
  }

  function cloneForStandard(baseCats) {
    return baseCats.map(cat => {
      const copy = cloneCategory(cat);
      copy.strategy = 'standard';
      copy.awkwardPool = [];
      copy.ensureAwkward = false;
      copy.bonusRoll = false;
      return copy;
    });
  }

  function resolveAwkwardList(categoryName) {
    const key = sanitizeKey(categoryName);
    const match = Object.keys(AWKWARD_ITEMS).find(k => key.includes(k));
    return match ? AWKWARD_ITEMS[match] : null;
  }

  function filterOutAwkward(items, categoryName) {
    const awkward = resolveAwkwardList(categoryName);
    if (!awkward) return items.slice();
    const awkwardSet = new Set(awkward.map(normalizeItem));
    return items.filter(item => !awkwardSet.has(normalizeItem(item)));
  }

  function getAwkwardPool(cat) {
    const awkward = resolveAwkwardList(cat.name);
    if (!awkward) return [];
    const awkwardSet = new Set(awkward.map(normalizeItem));
    return cat.items.filter(item => awkwardSet.has(normalizeItem(item)));
  }

  function parseConfig(text) {
    const lines = text.split(/\r?\n/);
    const cats = [];
    let current = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^\[Category:\s*(.+?)\]\s*(pick\s*=\s*(\d+))?/i);
      if (match) {
        if (current) cats.push(current);
        current = { name: match[1], pick: match[3] ? parseInt(match[3], 10) : 1, items: [] };
      } else if (current) {
        current.items.push(line);
      }
    }
    if (current) cats.push(current);
    return cats;
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, rng) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function ensureAwkwardPresence(selection, pool, awkwardPool) {
    if (!awkwardPool || !awkwardPool.length) return selection;
    const hasAwkward = selection.some(item => awkwardPool.includes(item));
    if (hasAwkward) return selection;
    const awkwardCandidate = pool.find(item => awkwardPool.includes(item));
    if (!awkwardCandidate) return selection;
    const next = selection.slice();
    next[next.length - 1] = awkwardCandidate;
    return next;
  }

  function showStatus(message) {
    if (resultSummaryEl) {
      resultSummaryEl.textContent = message;
    }
    if (resultGridEl) {
      resultGridEl.innerHTML = '';
    }
  }

  function renderResultSummary({ profileLabel, seedText, source, flavour }) {
    if (!resultSummaryEl) return;
    const lines = [
      `${profileLabel} Deployment Loaded`,
      `Seed: ${seedText}`,
      `Source: ${source}`
    ];
    if (flavour) {
      lines.push(flavour);
    }
    resultSummaryEl.textContent = lines.join('\n');
  }

  function renderResultGrid(picks) {
    if (!resultGridEl) return;
    resultGridEl.innerHTML = '';
    let paletteIndex = 0;
    picks.forEach(pick => {
      pick.items.forEach((item, idx) => {
        const palette = CARD_PALETTES[paletteIndex % CARD_PALETTES.length];
        paletteIndex += 1;

        const card = document.createElement('div');
        card.className = 'drop-card';
        card.style.setProperty('--card-from', palette.from);
        card.style.setProperty('--card-to', palette.to);

        const categoryEl = document.createElement('div');
        categoryEl.className = 'drop-category';
        categoryEl.textContent = pick.name;
        card.appendChild(categoryEl);

        const titleEl = document.createElement('div');
        titleEl.className = 'drop-title';
        titleEl.textContent = item;
        card.appendChild(titleEl);

        if (pick.bonusApplied && idx >= pick.planned) {
          const bonusEl = document.createElement('div');
          bonusEl.className = 'drop-footnote';
          bonusEl.textContent = 'Bonus Roll';
          card.appendChild(bonusEl);
        }

        resultGridEl.appendChild(card);
      });
    });
    resultGridEl.scrollTop = 0;
  }

  function selectDifficulty(key) {
    if (!difficultyProfiles[key]) return;
    state.difficulty = key;
    updateDifficultyChips();
    updateDifficultyDescription();
  }

  function updateDifficultyChips() {
    difficultyChipElements.forEach(chip => {
      chip.setAttribute('data-active', chip.dataset.difficulty === state.difficulty ? 'true' : 'false');
    });
  }

  function updateDifficultyDescription() {
    const profile = difficultyProfiles[state.difficulty];
    if (difficultyDescriptionEl) {
      difficultyDescriptionEl.textContent = profile ? profile.description : '';
    }
  }

  function drawCategoryPlan(plan, rng) {
    const pool = seededShuffle(plan.items, rng);
    const planned = Math.min(plan.pick, pool.length);
    if (!planned) return null;

    let selection = pool.slice(0, planned);
    if (plan.ensureAwkward && plan.awkwardPool && plan.awkwardPool.length) {
      selection = ensureAwkwardPresence(selection, pool, plan.awkwardPool);
    }

    let bonusApplied = false;
    if (plan.strategy === 'mayhem' && plan.bonusRoll && pool.length > planned) {
      selection.push(pool[planned]);
      bonusApplied = true;
    }

    return {
      name: plan.name,
      items: selection,
      planned,
      bonusApplied,
      strategy: plan.strategy || 'standard'
    };
  }

  function buildRun(seedInput) {
    const seedText = seedInput && seedInput.trim();
    const seedValue = seedText ? Array.from(seedText).reduce((acc, char) => acc + char.charCodeAt(0), 0) : (Math.random() * 1e9) | 0;
    const rng = mulberry32(seedValue);
    const profile = difficultyProfiles[state.difficulty] || difficultyProfiles.relaxed;
    const prepared = profile
      .prepare(state.categories, rng)
      .filter(cat => cat.items.length && cat.pick > 0);

    const picks = [];
    prepared.forEach(plan => {
      const drawn = drawCategoryPlan(plan, rng);
      if (drawn) {
        picks.push(drawn);
      }
    });

    const summary = {
      profileLabel: profile.label,
      seedText: seedText || seedValue,
      source: state.configSource,
      flavour: DIFFICULTY_FLAVOUR[state.difficulty] || ''
    };

    return {
      summary,
      picks,
      transcript: formatTranscript(summary, picks)
    };
  }

  function formatTranscript(summary, picks) {
    const lines = [];
    lines.push(`BL2 Random Playthrough (${summary.profileLabel})`);
    lines.push(`Seed: ${summary.seedText}`);
    lines.push(`Source: ${summary.source}`);
    if (summary.flavour) {
      lines.push(summary.flavour);
    }
    lines.push('');
    picks.forEach(pick => {
      lines.push(`[${pick.name}]`);
      pick.items.forEach(item => lines.push(`- ${item}`));
      lines.push('');
    });
    return lines.join('\n');
  }

  function randomise() {
    if (!state.categories.length) {
      showStatus('Loadout archives unavailable. Ensure config.txt is present beside index.html.');
      return;
    }
    const run = buildRun(seedInputEl ? seedInputEl.value : '');
    renderResultSummary(run.summary);
    renderResultGrid(run.picks);
    window.__lastRunText = run.transcript;
  }

  function downloadRun() {
    const txt = window.__lastRunText || 'No run generated yet.';
    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'BL2-random-run.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function loadConfigFromDisk() {
    const fallbackNode = document.getElementById('embedded-config');
    const fallbackText = fallbackNode ? fallbackNode.textContent : '';
    try {
      const response = await fetch('config.txt', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const parsed = parseConfig(text);
      if (!parsed.length) throw new Error('Config appears empty');
      state.categories = parsed;
      state.configSource = 'config.txt';
    } catch (err) {
      console.warn('Falling back to embedded config', err);
      if (fallbackText) {
        const parsed = parseConfig(fallbackText);
        state.categories = parsed;
        state.configSource = 'embedded fallback';
      } else {
        state.categories = [];
        state.configSource = 'unavailable';
      }
    }
  }

  async function bootstrapConfig() {
    showStatus('Syncing loadout archives...');
    await loadConfigFromDisk();
    updateDifficultyDescription();
    updateDifficultyChips();
    if (state.categories.length) {
      showStatus('Archives synced. Pick a difficulty and forge your run.');
    } else {
      showStatus('No configuration data found. Ensure config.txt sits beside this page.');
    }
  }

  if (randomiseBtn) {
    randomiseBtn.addEventListener('click', randomise);
  }
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadRun);
  }
  difficultyChipElements.forEach(chip => {
    chip.addEventListener('click', () => selectDifficulty(chip.dataset.difficulty));
  });

  updateDifficultyChips();
  updateDifficultyDescription();
  bootstrapConfig();
})();
