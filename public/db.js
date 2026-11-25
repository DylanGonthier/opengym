'use strict';
// Couche de données 100 % locale : tout est stocké dans IndexedDB, sur le téléphone.
// Expose Local.handle(method, path, query, body) avec les mêmes routes que l'ancienne API serveur.

const Local = (() => {
  const OFF = 'https://world.openfoodfacts.org';
  const OFF_FIELDS = 'code,product_name,product_name_fr,brands,nutriments,serving_quantity';
  const DEF = { weight: 75, kcal_goal: 2200, goal_weight: 0, set_minutes: 2.5 };
  const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const SEED = [
    // [nom, muscle, type, MET]  (MET approximatifs, Compendium of Physical Activities)
    ['Développé couché', 'Pectoraux', 'strength', 5], ['Développé incliné haltères', 'Pectoraux', 'strength', 5],
    ['Écartés poulie', 'Pectoraux', 'strength', 3.5], ['Pompes', 'Pectoraux', 'strength', 4.5], ['Dips', 'Pectoraux', 'strength', 5],
    ['Tractions', 'Dos', 'strength', 5], ['Tirage vertical', 'Dos', 'strength', 4.5], ['Rowing barre', 'Dos', 'strength', 5],
    ['Tirage horizontal', 'Dos', 'strength', 4.5], ['Soulevé de terre', 'Dos', 'strength', 6], ['Rowing haltère', 'Dos', 'strength', 4.5],
    ['Développé militaire', 'Épaules', 'strength', 5], ['Élévations latérales', 'Épaules', 'strength', 3.5],
    ['Oiseau', 'Épaules', 'strength', 3.5], ['Face pull', 'Épaules', 'strength', 3.5],
    ['Curl biceps barre', 'Biceps', 'strength', 3.5], ['Curl haltères', 'Biceps', 'strength', 3.5], ['Curl marteau', 'Biceps', 'strength', 3.5],
    ['Extension triceps poulie', 'Triceps', 'strength', 3.5], ['Barre au front', 'Triceps', 'strength', 3.5], ['Dips banc', 'Triceps', 'strength', 4],
    ['Squat', 'Jambes', 'strength', 6], ['Presse à cuisses', 'Jambes', 'strength', 5], ['Fentes', 'Jambes', 'strength', 5],
    ['Leg extension', 'Jambes', 'strength', 3.5], ['Leg curl', 'Jambes', 'strength', 3.5], ['Soulevé de terre roumain', 'Jambes', 'strength', 5.5],
    ['Hip thrust', 'Fessiers', 'strength', 5], ['Mollets debout', 'Mollets', 'strength', 3.5],
    ['Crunch', 'Abdos', 'strength', 3.5], ['Gainage', 'Abdos', 'strength', 3.5], ['Relevé de jambes', 'Abdos', 'strength', 4],
    ['Course à pied', 'Cardio', 'cardio', 9.8], ['Tapis de course (marche)', 'Cardio', 'cardio', 4.3],
    ['Tapis incliné', 'Cardio', 'cardio', 6], ['Vélo', 'Cardio', 'cardio', 7.5], ['Rameur', 'Cardio', 'cardio', 7],
    ['Elliptique', 'Cardio', 'cardio', 5], ['Corde à sauter', 'Cardio', 'cardio', 11], ['HIIT', 'Cardio', 'cardio', 8],
  ];
  const TABLES = ['exercises', 'workouts', 'sets', 'foods', 'food_log', 'weights'];

  let state = null;
  let idb = null;
  let memoryOnly = false;

  const nid = (t) => (state.seq[t] = (state.seq[t] || 0) + 1);
  function fresh() {
    state = { version: 1, seq: {}, settings: {}, meta: {}, exercises: [], workouts: [], sets: [], foods: [], food_log: [], weights: [] };
    for (const [name, muscle, type, met] of SEED) state.exercises.push({ id: nid('exercises'), name, muscle, type, met, note: '', custom: 0 });
  }

  /* ---------- persistance ---------- */
  const openDb = () => new Promise((res, rej) => {
    const r = indexedDB.open('gym-tracker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
  // Dans l'appli Android, chaque modification est aussi copiée dans le dossier choisi par l'utilisateur.
  const hasFolder = () => { try { return !!window.Android?.hasFolder?.(); } catch { return false; } };
  let mirrorTimer = null;
  function mirrorNow() {
    clearTimeout(mirrorTimer); mirrorTimer = null;
    if (!state || !hasFolder()) return false;
    try {
      const ok = window.Android.writeBackup(JSON.stringify({ ...state, exported: new Date().toISOString() }));
      if (ok) state.meta.lastBackup = Date.now();
      return !!ok;
    } catch { return false; }
  }
  const scheduleMirror = () => { if (hasFolder()) { clearTimeout(mirrorTimer); mirrorTimer = setTimeout(mirrorNow, 1500); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && mirrorTimer) mirrorNow(); });
  window.addEventListener('pagehide', () => { if (mirrorTimer) mirrorNow(); });

  function save() {
    scheduleMirror();
    if (!idb) return Promise.resolve();
    return new Promise((res, rej) => {
      const tx = idb.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(state, 'state');
      tx.oncomplete = () => res();
      tx.onerror = tx.onabort = () => rej(tx.error || new Error("Écriture impossible : stockage plein ou bloqué"));
    });
  }
  const ready = (async () => {
    try {
      idb = await openDb();
      state = await new Promise((res, rej) => {
        const q = idb.transaction('kv').objectStore('kv').get('state');
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    } catch { memoryOnly = true; idb = null; }
    if (!state) { fresh(); await save().catch(() => {}); }
    try { navigator.storage?.persist?.(); } catch { /* facultatif */ }
  })();

  /* ---------- helpers ---------- */
  const r1 = (n) => Math.round((+n || 0) * 10) / 10;
  const nz = (v, d = 0) => (v === undefined || v === null || v === '' || !isFinite(+v) ? d : +v);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const settings = () => ({ ...DEF, ...state.settings });
  const exById = (id) => state.exercises.find((e) => e.id === id);
  const workoutOf = (date) => state.workouts.find((w) => w.date === date);
  const byDateDesc = (a, b) => b.date.localeCompare(a.date);
  const bodyKg = () => [...state.weights].sort(byDateDesc)[0]?.kg || settings().weight || 75;

  // Calories = MET x poids (kg) x durée (h). Muscu : durée = séries x minutes/série (repos inclus).
  function workoutKcal(wid) {
    const cfg = settings(), kg = bodyKg(), per = new Map();
    for (const s of state.sets) {
      if (s.workout_id !== wid) continue;
      const a = per.get(s.exercise_id) || { n: 0, mins: 0 };
      a.n++; a.mins += s.minutes || 0;
      per.set(s.exercise_id, a);
    }
    let k = 0;
    for (const [eid, a] of per) {
      const e = exById(eid);
      if (!e) continue;
      k += (e.met * kg * (e.type === 'cardio' ? a.mins : a.n * cfg.set_minutes)) / 60;
    }
    return Math.round(k);
  }
  const wDates = () => new Map(state.workouts.map((w) => [w.id, w.date]));
  function lastSession(exId, date) {
    const wd = wDates();
    let best = null;
    for (const s of state.sets) {
      if (s.exercise_id !== exId) continue;
      const d = wd.get(s.workout_id);
      if (d && d < date && (!best || d > best)) best = d;
    }
    if (!best) return null;
    const sets = state.sets.filter((s) => s.exercise_id === exId && wd.get(s.workout_id) === best)
      .sort((a, b) => a.id - b.id).map(({ reps, weight, minutes }) => ({ reps, weight, minutes }));
    return { date: best, sets };
  }
  const prWeight = (exId) => Math.max(0, ...state.sets.filter((s) => s.exercise_id === exId).map((s) => s.weight || 0));
  function cleanupWorkout(id) {
    if (!state.sets.some((s) => s.workout_id === id)) state.workouts = state.workouts.filter((w) => w.id !== id);
  }
  function workoutDetail(date) {
    const w = workoutOf(date);
    if (!w) return { date, id: null, exercises: [], kcal: 0 };
    const map = new Map();
    for (const s of state.sets.filter((x) => x.workout_id === w.id).sort((a, b) => a.id - b.id)) {
      if (!map.has(s.exercise_id)) {
        const e = exById(s.exercise_id);
        map.set(s.exercise_id, {
          exercise: { id: e.id, name: e.name, muscle: e.muscle, type: e.type, note: e.note },
          sets: [], last: lastSession(e.id, date), pr: prWeight(e.id),
        });
      }
      map.get(s.exercise_id).sets.push({ id: s.id, reps: s.reps, weight: s.weight, minutes: s.minutes });
    }
    return { date, id: w.id, exercises: [...map.values()], kcal: workoutKcal(w.id) };
  }
  function totals(date) {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const i of state.food_log) if (i.date === date) { t.kcal += i.kcal; t.protein += i.protein; t.carbs += i.carbs; t.fat += i.fat; }
    return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
  }

  /* ---------- Open Food Facts (appelé directement depuis le téléphone) ---------- */
  async function offJson(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('OFF ' + r.status);
    return r.json();
  }
  function normOff(p) {
    const name = (p.product_name_fr || p.product_name || '').trim();
    const n = p.nutriments || {};
    let kcal = n['energy-kcal_100g'];
    if (kcal == null && n['energy_100g'] != null) kcal = n['energy_100g'] / 4.184;
    if (!name || kcal == null) return null;
    return {
      barcode: p.code ? String(p.code) : null, name, brand: (p.brands || '').split(',')[0].trim(),
      kcal: r1(kcal), protein: r1(n.proteins_100g), carbs: r1(n.carbohydrates_100g), fat: r1(n.fat_100g),
      serving: +p.serving_quantity || 0,
    };
  }
  function saveFood(f) {
    if (f.barcode) {
      const ex = state.foods.find((x) => x.barcode === f.barcode);
      if (ex) return ex;
    }
    const food = { id: nid('foods'), barcode: f.barcode || null, name: f.name, brand: f.brand || '', kcal: f.kcal, protein: f.protein,
      carbs: f.carbs, fat: f.fat, serving: f.serving || 0, custom: f.custom ? 1 : 0 };
    state.foods.push(food);
    return food;
  }

  /* ---------- routes ---------- */
  const routes = [];
  const R = (m, p, fn) => routes.push([m, new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn]);

  R('GET', '/settings', () => ({
    ...settings(), body_kg: bodyKg(), last_backup: state.meta.lastBackup || 0, memory_only: memoryOnly, folder: hasFolder(),
    has_data: state.workouts.length + state.weights.length + state.food_log.length > 0,
  }));
  R('PUT', '/settings', ({ body }) => {
    for (const k of Object.keys(DEF)) if (body[k] !== undefined && isFinite(+body[k])) state.settings[k] = +body[k];
    return settings();
  });

  // exercices
  R('GET', '/exercises', () => [...state.exercises].sort((a, b) => a.muscle.localeCompare(b.muscle) || a.name.localeCompare(b.name)));
  R('POST', '/exercises', ({ body }) => {
    const name = String(body.name || '').trim();
    if (!name) throw new Error('Nom requis');
    const ex = state.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (ex) return ex;
    const type = body.type === 'cardio' ? 'cardio' : 'strength';
    const e = { id: nid('exercises'), name, muscle: String(body.muscle || '').trim(), type, met: nz(body.met, type === 'cardio' ? 7 : 5), note: '', custom: 1 };
    state.exercises.push(e);
    return e;
  });
  R('PUT', '/exercises/:id', ({ params, body }) => {
    const e = exById(+params.id);
    if (!e) throw new Error('Introuvable');
    if (body.note !== undefined) e.note = String(body.note).slice(0, 300);
    if (body.met !== undefined) e.met = nz(body.met, e.met);
    return e;
  });
  R('GET', '/exercises/:id/history', ({ params }) => {
    const e = exById(+params.id);
    if (!e) throw new Error('Introuvable');
    const wd = wDates();
    const dates = [...new Set(state.sets.filter((s) => s.exercise_id === e.id).map((s) => wd.get(s.workout_id)).filter(Boolean))].sort().reverse().slice(0, 20);
    const sessions = dates.map((date) => ({
      date, sets: state.sets.filter((s) => s.exercise_id === e.id && wd.get(s.workout_id) === date)
        .sort((a, b) => a.id - b.id).map(({ reps, weight, minutes }) => ({ reps, weight, minutes })),
    }));
    return { exercise: e, pr: prWeight(e.id), sessions };
  });

  // séances
  R('GET', '/workouts', ({ q }) => [...state.workouts].sort(byDateDesc).slice(0, Math.min(+q.limit || 60, 365)).map((w) => {
    const sets = state.sets.filter((s) => s.workout_id === w.id).sort((a, b) => a.id - b.id);
    return { date: w.date, id: w.id, kcal: workoutKcal(w.id), sets: sets.length,
      exercises: [...new Set(sets.map((s) => exById(s.exercise_id)?.name).filter(Boolean))] };
  }));
  R('GET', '/workouts/:date', ({ params }) => {
    if (!isDate(params.date)) throw new Error('Date invalide');
    return workoutDetail(params.date);
  });
  R('DELETE', '/workouts/:id', ({ params }) => {
    const id = +params.id;
    state.sets = state.sets.filter((s) => s.workout_id !== id);
    state.workouts = state.workouts.filter((w) => w.id !== id);
    return { ok: true };
  });
  R('DELETE', '/workouts/:id/exercises/:eid', ({ params }) => {
    state.sets = state.sets.filter((s) => !(s.workout_id === +params.id && s.exercise_id === +params.eid));
    cleanupWorkout(+params.id);
    return { ok: true };
  });

  // séries
  R('POST', '/sets', ({ body }) => {
    if (!isDate(body.date)) throw new Error('Date invalide');
    const ex = exById(+body.exercise_id);
    if (!ex) throw new Error('Exercice inconnu');
    let w = workoutOf(body.date);
    if (!w) { w = { id: nid('workouts'), date: body.date, notes: '' }; state.workouts.push(w); }
    let { reps, weight, minutes } = body;
    if (reps === undefined && weight === undefined && minutes === undefined) {
      const s = lastSession(ex.id, body.date)?.sets[0];
      if (s) ({ reps, weight, minutes } = s);
      else if (ex.type === 'cardio') { reps = 0; weight = 0; minutes = 20; }
      else { reps = 10; weight = 0; minutes = 0; }
    }
    const s = { id: nid('sets'), workout_id: w.id, exercise_id: ex.id, reps: Math.round(nz(reps)), weight: nz(weight), minutes: nz(minutes) };
    state.sets.push(s);
    return { id: s.id };
  });
  R('PUT', '/sets/:id', ({ params, body }) => {
    const s = state.sets.find((x) => x.id === +params.id);
    if (!s) throw new Error('Introuvable');
    s.reps = Math.round(nz(body.reps, s.reps)); s.weight = nz(body.weight, s.weight); s.minutes = nz(body.minutes, s.minutes);
    return { ok: true };
  });
  R('DELETE', '/sets/:id', ({ params }) => {
    const s = state.sets.find((x) => x.id === +params.id);
    state.sets = state.sets.filter((x) => x.id !== +params.id);
    if (s) cleanupWorkout(s.workout_id);
    return { ok: true };
  });

  // poids
  R('GET', '/weights', () => [...state.weights].sort((a, b) => a.date.localeCompare(b.date)));
  R('POST', '/weights', ({ body }) => {
    const kg = +body.kg;
    if (!isDate(body.date) || !(kg > 20 && kg < 500)) throw new Error('Date ou poids invalide');
    const ex = state.weights.find((w) => w.date === body.date);
    if (ex) ex.kg = kg; else state.weights.push({ id: nid('weights'), date: body.date, kg });
    return { ok: true };
  });
  R('DELETE', '/weights/:id', ({ params }) => { state.weights = state.weights.filter((w) => w.id !== +params.id); return { ok: true }; });

  // aliments
  R('GET', '/foods/recent', () => {
    const seen = new Set(), out = [];
    for (const l of [...state.food_log].sort((a, b) => b.id - a.id)) {
      if (l.food_id == null || seen.has(l.food_id)) continue;
      seen.add(l.food_id);
      const f = state.foods.find((x) => x.id === l.food_id);
      if (f) out.push(f);
      if (out.length >= 15) break;
    }
    return out;
  });
  R('GET', '/foods/barcode/:code', async ({ params }) => {
    const code = params.code.replace(/\D/g, '');
    if (code.length < 6) throw new Error('Code-barres invalide');
    const local = state.foods.find((f) => f.barcode === code);
    if (local) return local;
    let j;
    try { j = await offJson(`${OFF}/api/v2/product/${code}.json?fields=${OFF_FIELDS}`); }
    catch { throw new Error('Open Food Facts est injoignable : vérifie ta connexion. Un produit déjà scanné reste disponible hors ligne.'); }
    const f = j.status === 1 && j.product ? normOff({ ...j.product, code }) : null;
    if (!f) throw new Error('Produit introuvable ou sans valeurs nutritionnelles');
    return saveFood(f);
  });
  R('GET', '/foods/search', async ({ q }) => {
    const term = String(q.q || '').trim();
    if (!term) return { items: [], offline: false };
    const t = term.toLowerCase();
    const items = state.foods.filter((f) => f.name.toLowerCase().includes(t) || f.brand.toLowerCase().includes(t))
      .sort((a, b) => b.custom - a.custom || a.name.localeCompare(b.name)).slice(0, 20);
    let offline = false;
    if (term.length >= 3) {
      try {
        const j = await offJson(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`);
        for (const p of j.products || []) {
          const f = normOff(p);
          if (!f) continue;
          const saved = saveFood(f);
          if (!items.some((i) => i.id === saved.id)) items.push(saved);
        }
      } catch { offline = true; }
    }
    return { items, offline };
  });
  R('POST', '/foods', ({ body }) => {
    const name = String(body.name || '').trim();
    if (!name || body.kcal === '' || body.kcal == null || !isFinite(+body.kcal)) throw new Error('Nom et calories requis');
    const barcode = String(body.barcode || '').replace(/\D/g, '') || null;
    if (barcode && state.foods.some((f) => f.barcode === barcode)) throw new Error('Ce code-barres existe déjà');
    return saveFood({ barcode, name, brand: String(body.brand || '').trim(), kcal: nz(body.kcal), protein: nz(body.protein),
      carbs: nz(body.carbs), fat: nz(body.fat), serving: nz(body.serving), custom: true });
  });

  // journal alimentaire
  R('GET', '/log', ({ q }) => {
    if (!isDate(q.date)) throw new Error('Date invalide');
    return { items: state.food_log.filter((i) => i.date === q.date).sort((a, b) => a.id - b.id), totals: totals(q.date), goal: settings().kcal_goal };
  });
  R('POST', '/log', ({ body }) => {
    const f = state.foods.find((x) => x.id === +body.food_id);
    const grams = +body.grams;
    if (!f || !isDate(body.date) || !MEALS.includes(body.meal) || !(grams > 0)) throw new Error('Données invalides');
    const k = grams / 100;
    const item = { id: nid('food_log'), date: body.date, meal: body.meal, food_id: f.id, name: f.brand ? `${f.name} (${f.brand})` : f.name,
      grams, kcal: r1(f.kcal * k), protein: r1(f.protein * k), carbs: r1(f.carbs * k), fat: r1(f.fat * k), created: Date.now() };
    state.food_log.push(item);
    return { id: item.id };
  });
  R('DELETE', '/log/:id', ({ params }) => { state.food_log = state.food_log.filter((i) => i.id !== +params.id); return { ok: true }; });

  R('GET', '/summary', ({ q }) => {
    if (!isDate(q.date)) throw new Error('Date invalide');
    const w = workoutOf(q.date);
    return { eaten: totals(q.date), burned: w ? workoutKcal(w.id) : 0, trained: !!w, goal: settings().kcal_goal };
  });

  // sauvegarde / restauration
  R('GET', '/export', () => ({ ...state, exported: new Date().toISOString() }));
  R('POST', '/backup-done', () => { state.meta.lastBackup = Date.now(); return { ok: true }; });
  R('POST', '/import', ({ body }) => {
    if (!body || !TABLES.every((t) => Array.isArray(body[t]))) throw new Error('Fichier de sauvegarde invalide');
    const seq = { ...(body.seq || {}) };
    for (const t of TABLES) seq[t] = Math.max(seq[t] || 0, ...body[t].map((r) => +r.id || 0));
    state = { version: 1, seq, settings: body.settings || {}, meta: { ...(body.meta || {}), lastBackup: Date.now() } };
    for (const t of TABLES) state[t] = body[t];
    return { ok: true };
  });

  async function handle(method, path, q = {}, body = {}) {
    await ready;
    for (const [m, re, fn] of routes) {
      if (m !== method) continue;
      const match = re.exec(path);
      if (!match) continue;
      const out = await fn({ params: match.groups || {}, q, body });
      // les GET /foods/* mettent aussi en cache les produits trouvés sur Open Food Facts
      if (method !== 'GET' || path.startsWith('/foods/')) await save();
      return structuredClone(out);
    }
    throw new Error('Route inconnue : ' + path);
  }

  return { handle, ready, mirrorNow };
})();
