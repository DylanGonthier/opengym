'use strict';
// Gym Tracker - interface (JS pur, sans dépendances)

const app = document.getElementById('app');
const S = { tab: 'home', date: null, wView: 'day', cfg: {} };

/* ---------- utilitaires ---------- */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
S.date = today();
const shift = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const label = (s) => s === today() ? "Aujourd'hui" : s === shift(today(), -1) ? 'Hier' : s === shift(today(), 1) ? 'Demain'
  : new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const short = (s) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const num = (v, d = 0) => (Math.round((+v || 0) * 10 ** d) / 10 ** d).toLocaleString('fr-FR');

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}
const svg = (p) => h('span', { class: 'ic', html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>` });
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  workout: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 3c-2 2-3 5-3 8h3v10"/>',
  weight: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 10a4 4 0 0 1 8 0M12 10l2-2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};

function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

// Tout est local : les "routes" sont traitées par db.js (IndexedDB), aucun serveur.
function api(p, method = 'GET', body) {
  const [path, qs] = p.split('?');
  return Local.handle(method, path, Object.fromEntries(new URLSearchParams(qs || '')), body || {});
}
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.message !== 'auth') toast(e.message); } };

function sheet(title, body) {
  const back = h('div', { class: 'backdrop', onclick: (e) => { if (e.target === back) close(); } });
  const content = h('div', {}, body);
  const box = h('div', { class: 'sheet' },
    h('div', { class: 'sheet-h' }, h('b', {}, title), h('button', { class: 'x', onclick: () => close() }, '✕')), content);
  back.append(box);
  document.body.append(back);
  let onClose = null;
  function close() { onClose && onClose(); back.remove(); }
  return { close, set: (n) => content.replaceChildren(n), onClose: (f) => { onClose = f; } };
}

const seg = (opts, cur, on) => h('div', { class: 'seg' },
  opts.map(([v, t]) => h('button', { class: v === cur ? 'on' : '', onclick: () => on(v) }, t)));

function dateNav() {
  return h('div', { class: 'datenav' },
    h('button', { onclick: () => { S.date = shift(S.date, -1); render(); } }, '‹'),
    h('b', {}, label(S.date)),
    h('button', { onclick: () => { S.date = shift(S.date, 1); render(); } }, '›'));
}

/* ---------- shell ---------- */
const TITLES = { home: 'Accueil', workout: 'Séance', food: 'Repas', weight: 'Poids' };
const views = {};

async function render() {
  const y = window.scrollY;
  const main = h('main', { class: 'main' });
  const top = h('header', { class: 'top' }, h('h1', {}, TITLES[S.tab]),
    h('button', { class: 'icon-btn', 'aria-label': 'Réglages', onclick: openSettings }, svg(ICONS.gear)));
  const nav = h('nav', { class: 'nav' }, Object.keys(TITLES).map((t) =>
    h('button', { class: t === S.tab ? 'on' : '', onclick: () => { S.tab = t; render(); window.scrollTo(0, 0); } }, svg(ICONS[t]), TITLES[t])));
  app.replaceChildren(top, main, nav);
  try { await views[S.tab](main); } catch (e) { if (e.message !== 'auth') main.append(h('p', { class: 'err' }, e.message)); }
  window.scrollTo(0, y);
}

/* ---------- accueil ---------- */
views.home = async (m) => {
  const t = today();
  const [sum, ws, wk, cfg] = await Promise.all([api('/summary?date=' + t), api('/weights'), api('/workouts?limit=60'), api('/settings')]);
  S.cfg = cfg;
  if (cfg.has_data && !cfg.folder && Date.now() - cfg.last_backup > 7 * 864e5) {
    m.append(h('section', { class: 'card' },
      h('h3', {}, 'Pense à sauvegarder'),
      h('small', { class: 'muted' }, 'Tes données sont uniquement sur ce téléphone. Un fichier de sauvegarde les protège si tu changes de téléphone ou effaces les données du navigateur.'),
      h('button', { class: 'btn pri', onclick: guard(async () => { await doBackup('download'); render(); }) }, 'Sauvegarder maintenant')));
  }
  const left = sum.goal - sum.eaten.kcal + sum.burned;
  const pct = Math.min(100, Math.max(0, (sum.eaten.kcal / (sum.goal + sum.burned || 1)) * 100));

  m.append(h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h3', {}, 'Calories du jour'), h('small', {}, "Aujourd'hui")),
    h('div', { class: 'big' }, num(left), ' ', h('small', {}, left >= 0 ? 'kcal restantes' : 'kcal en trop')),
    h('div', { class: 'bar' + (left < 0 ? ' over' : '') }, h('i', { style: `width:${pct}%` })),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, 'Mangé', h('b', {}, num(sum.eaten.kcal))),
      h('div', { class: 'stat' }, 'Brûlé (salle)', h('b', {}, '~' + num(sum.burned))),
      h('div', { class: 'stat' }, 'Objectif', h('b', {}, num(sum.goal)))),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, 'Protéines', h('b', {}, num(sum.eaten.protein) + ' g')),
      h('div', { class: 'stat' }, 'Glucides', h('b', {}, num(sum.eaten.carbs) + ' g')),
      h('div', { class: 'stat' }, 'Lipides', h('b', {}, num(sum.eaten.fat) + ' g')))));

  // salle : 4 semaines
  const dates = new Set(wk.map((x) => x.date));
  const dow = (new Date().getDay() + 6) % 7;
  const monday = shift(t, -dow);
  const start = shift(monday, -21);
  const weekCount = [...dates].filter((d) => d >= monday && d <= t).length;
  const cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('span', { class: 'h' }, d));
  for (let i = 0; i < 28; i++) {
    const d = shift(start, i);
    cells.push(h('span', { class: (dates.has(d) ? 'on ' : '') + (d === t ? 'td ' : '') + (d > t ? 'fut' : '') }, String(+d.slice(8))));
  }
  m.append(h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h3', {}, 'Salle'),
      h('small', {}, `${weekCount} séance${weekCount > 1 ? 's' : ''} cette semaine`)),
    h('div', { class: 'dots' }, cells),
    h('button', { class: 'btn pri', onclick: () => { S.tab = 'workout'; S.date = t; S.wView = 'day'; render(); } },
      sum.trained ? 'Continuer la séance du jour' : 'Démarrer une séance')));

  // poids
  const last = ws.at(-1), prev = ws.at(-2);
  m.append(h('section', { class: 'card', onclick: () => { S.tab = 'weight'; render(); } },
    h('div', { class: 'row between' }, h('h3', {}, 'Poids'), last && h('small', {}, short(last.date))),
    last ? h('div', { class: 'row between' },
      h('div', { class: 'big' }, num(last.kg, 1), ' ', h('small', {}, 'kg')),
      prev && h('span', { class: 'tag' }, (last.kg - prev.kg >= 0 ? '+' : '') + num(last.kg - prev.kg, 1) + ' kg'))
      : h('p', { class: 'muted' }, 'Aucune pesée pour le moment. Touche ici pour en ajouter une.')));
};

/* ---------- séance ---------- */
const fmtSets = (sets, cardio) => cardio
  ? sets.map((s) => `${num(s.minutes)} min`).join(' · ')
  : sets.map((s) => `${s.reps}×${num(s.weight, 1)}`).join(' · ') + ' kg';

views.workout = async (m) => {
  m.append(seg([['day', 'Séance'], ['hist', 'Historique']], S.wView, (v) => { S.wView = v; render(); }));
  if (S.wView === 'hist') return historyView(m);
  m.append(dateNav());
  const w = await api('/workouts/' + S.date);
  if (w.exercises.length) {
    const n = w.exercises.reduce((a, b) => a + b.sets.length, 0);
    m.append(h('div', { class: 'row between' },
      h('small', {}, `${w.exercises.length} exercice${w.exercises.length > 1 ? 's' : ''} · ${n} série${n > 1 ? 's' : ''}`),
      h('span', { class: 'tag' }, `~${num(w.kcal)} kcal brûlées`)));
  }
  w.exercises.forEach((b) => m.append(exCard(w, b)));
  if (!w.exercises.length) m.append(h('p', { class: 'muted center' }, 'Pas de séance ce jour-là.'));
  m.append(h('button', { class: 'btn pri', onclick: () => pickExercise(guard(async (ex) => {
    await api('/sets', 'POST', { date: S.date, exercise_id: ex.id });
    render();
  })) }, '+ Ajouter un exercice'));
  if (w.id) m.append(h('button', { class: 'link', onclick: guard(async () => {
    if (confirm('Supprimer toute la séance de ce jour ?')) { await api('/workouts/' + w.id, 'DELETE'); render(); }
  }) }, 'Supprimer la séance'));
};

function exCard(w, b) {
  const e = b.exercise, cardio = e.type === 'cardio';
  const card = h('section', { class: 'card' });
  card.append(h('div', { class: 'ex-h' },
    h('div', {}, h('button', { class: 'ex-name', onclick: () => showHistory(e.id) }, e.name), h('div', {}, h('small', {}, e.muscle))),
    h('button', { class: 'link', onclick: guard(async () => {
      if (confirm(`Retirer « ${e.name} » de la séance ?`)) { await api(`/workouts/${w.id}/exercises/${e.id}`, 'DELETE'); render(); }
    }) }, 'Retirer')));

  if (b.last) {
    card.append(h('div', { class: 'last' }, `Dernière fois (${short(b.last.date)}) : `, h('b', {}, fmtSets(b.last.sets, cardio)),
      !cardio && b.pr > 0 ? ` · Record : ${num(b.pr, 1)} kg` : ''));
  } else {
    card.append(h('div', { class: 'last' }, 'Première fois sur cet exercice.'));
  }

  b.sets.forEach((s, i) => {
    const save = guard(() => api('/sets/' + s.id, 'PUT', cardio
      ? { minutes: minI.value } : { reps: repsI?.value, weight: wI?.value }));
    let repsI, wI, minI;
    const row = h('div', { class: 'set' }, h('span', { class: 'n' }, i + 1));
    if (cardio) {
      minI = h('input', { class: 'inp num', type: 'number', inputmode: 'decimal', min: 0, value: s.minutes, onchange: save });
      row.append(minI, h('span', { class: 'u' }, 'min'));
    } else {
      repsI = h('input', { class: 'inp num', type: 'number', inputmode: 'numeric', min: 0, value: s.reps, onchange: save });
      wI = h('input', { class: 'inp num', type: 'number', inputmode: 'decimal', min: 0, step: 0.5, value: s.weight, onchange: save });
      row.append(repsI, h('span', { class: 'u' }, 'reps'), wI, h('span', { class: 'u' }, 'kg'));
    }
    row.append(h('button', { class: 'del', 'aria-label': 'Supprimer la série', onclick: guard(async () => { await api('/sets/' + s.id, 'DELETE'); render(); }) }, '×'));
    card.append(row);
  });

  card.append(h('button', { class: 'btn sm', onclick: guard(async () => {
    const l = b.sets.at(-1);
    await api('/sets', 'POST', { date: S.date, exercise_id: e.id, reps: l.reps, weight: l.weight, minutes: l.minutes });
    render();
  }) }, '+ Série'));

  card.append(h('input', { class: 'note', placeholder: 'Note (réglage machine, sensation…)', value: e.note || '',
    onchange: guard((ev) => api('/exercises/' + e.id, 'PUT', { note: ev.target.value })) }));
  return card;
}

async function showHistory(id) {
  const sh = sheet('Historique', h('p', { class: 'muted' }, 'Chargement…'));
  try {
    const d = await api(`/exercises/${id}/history`);
    const cardio = d.exercise.type === 'cardio';
    sh.set(h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, d.exercise.name), !cardio && d.pr > 0 && h('span', { class: 'tag' }, 'Record ' + num(d.pr, 1) + ' kg')),
      d.exercise.note && h('div', { class: 'last' }, d.exercise.note),
      d.sessions.length ? d.sessions.map((s) => h('div', { class: 'item' },
        h('small', { style: 'width:64px' }, short(s.date)), h('div', { class: 't' }, fmtSets(s.sets, cardio))))
        : h('p', { class: 'muted' }, 'Aucune donnée.')));
  } catch (e) { sh.set(h('p', { class: 'err' }, e.message)); }
}

async function historyView(m) {
  const list = await api('/workouts?limit=60');
  if (!list.length) return m.append(h('p', { class: 'muted center' }, 'Aucune séance enregistrée.'));
  list.forEach((w) => m.append(h('section', { class: 'card', onclick: () => { S.date = w.date; S.wView = 'day'; render(); } },
    h('div', { class: 'row between' }, h('h3', {}, label(w.date)), h('span', { class: 'tag' }, `~${num(w.kcal)} kcal`)),
    h('small', {}, `${w.sets} série${w.sets > 1 ? 's' : ''} · ${w.exercises.join(', ')}`))));
}

const MUSCLE_ORDER = ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Jambes', 'Fessiers', 'Mollets', 'Abdos', 'Cardio'];
async function pickExercise(onPick) {
  const exs = await api('/exercises');
  const q = h('input', { class: 'inp', placeholder: 'Rechercher un exercice…', type: 'search' });
  const list = h('div', {});
  const sh = sheet('Choisir un exercice', h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, q, list));
  const draw = () => {
    const t = q.value.toLowerCase().trim();
    const f = exs.filter((e) => !t || e.name.toLowerCase().includes(t) || e.muscle.toLowerCase().includes(t));
    const groups = {};
    f.forEach((e) => (groups[e.muscle || 'Autres'] ||= []).push(e));
    const keys = Object.keys(groups).sort((a, b) => (MUSCLE_ORDER.indexOf(a) + 1 || 99) - (MUSCLE_ORDER.indexOf(b) + 1 || 99));
    list.replaceChildren(
      ...keys.flatMap((k) => [h('div', { class: 'sect' }, k), ...groups[k].map((e) =>
        h('div', { class: 'item' }, h('button', { class: 'row-btn', onclick: () => { sh.close(); onPick(e); } }, e.name)))]),
      h('button', { class: 'btn', style: 'margin-top:12px;width:100%', onclick: () => createExercise(sh, onPick, q.value) }, '+ Créer un exercice'));
  };
  q.addEventListener('input', draw);
  draw();
}

function createExercise(sh, onPick, name) {
  let type = 'strength';
  const n = h('input', { class: 'inp', value: name || '', placeholder: 'Ex. Développé Hammer' });
  const mu = h('input', { class: 'inp', placeholder: 'Ex. Pectoraux' });
  const met = h('input', { class: 'inp', type: 'number', inputmode: 'decimal', step: 0.5, value: 5 });
  const typeSeg = () => seg([['strength', 'Musculation'], ['cardio', 'Cardio']], type, (v) => { type = v; met.value = v === 'cardio' ? 7 : 5; box.replaceChild(typeSeg(), box.children[2]); });
  const box = h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    h('label', { class: 'field' }, 'Nom', n), h('label', { class: 'field' }, 'Groupe musculaire', mu), typeSeg(),
    h('label', { class: 'field' }, 'Intensité (MET) – sert au calcul des calories', met),
    h('button', { class: 'btn pri', onclick: guard(async () => {
      const ex = await api('/exercises', 'POST', { name: n.value, muscle: mu.value, type, met: met.value });
      sh.close(); onPick(ex);
    }) }, 'Créer et ajouter'));
  sh.set(box);
}

/* ---------- repas ---------- */
const MEALS = [['breakfast', 'Petit-déjeuner'], ['lunch', 'Déjeuner'], ['dinner', 'Dîner'], ['snack', 'Collations']];

views.food = async (m) => {
  m.append(dateNav());
  const d = await api('/log?date=' + S.date);
  const pct = Math.min(100, (d.totals.kcal / (d.goal || 1)) * 100);
  m.append(h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('div', { class: 'big' }, num(d.totals.kcal), ' ', h('small', {}, `/ ${num(d.goal)} kcal`))),
    h('div', { class: 'bar' + (d.totals.kcal > d.goal ? ' over' : '') }, h('i', { style: `width:${pct}%` })),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, 'Protéines', h('b', {}, num(d.totals.protein) + ' g')),
      h('div', { class: 'stat' }, 'Glucides', h('b', {}, num(d.totals.carbs) + ' g')),
      h('div', { class: 'stat' }, 'Lipides', h('b', {}, num(d.totals.fat) + ' g')))));

  MEALS.forEach(([key, name]) => {
    const items = d.items.filter((i) => i.meal === key);
    const sum = items.reduce((a, b) => a + b.kcal, 0);
    m.append(h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, name), h('small', {}, num(sum) + ' kcal')),
      items.map((i) => h('div', { class: 'item' },
        h('div', { class: 't' }, h('div', {}, i.name), h('small', {}, `${num(i.grams)} g · P ${num(i.protein)} · G ${num(i.carbs)} · L ${num(i.fat)}`)),
        h('span', { class: 'k' }, num(i.kcal)),
        h('button', { class: 'icon-btn', 'aria-label': 'Supprimer', onclick: guard(async () => { await api('/log/' + i.id, 'DELETE'); render(); }) }, '×'))),
      h('button', { class: 'btn sm', onclick: () => addFood(key, name) }, '+ Ajouter')));
  });
};

function addFood(meal, mealName) {
  const q = h('input', { class: 'inp', type: 'search', placeholder: 'Rechercher un aliment ou une marque…' });
  const list = h('div', {});
  const hint = h('small', { class: 'muted' });
  const sh = sheet('Ajouter · ' + mealName, h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    h('div', { class: 'grid2' },
      h('button', { class: 'btn pri', onclick: () => scanBarcode(sh, meal) }, 'Scanner'),
      h('button', { class: 'btn', onclick: () => createFood(sh, meal, '') }, 'Créer')),
    q, hint, list));
  const showFoods = (foods, title) => {
    list.replaceChildren(title && h('div', { class: 'sect' }, title), ...foods.map((f) => h('div', { class: 'item' },
      h('button', { class: 'row-btn', onclick: () => qtyStep(sh, meal, f) },
        h('div', {}, f.name), h('small', {}, `${f.brand ? f.brand + ' · ' : ''}${num(f.kcal)} kcal/100 g`)))));
    if (!foods.length) list.replaceChildren(h('p', { class: 'muted center' }, 'Aucun résultat. Tu peux créer l\'aliment.'));
  };
  api('/foods/recent').then((r) => { if (!q.value && r.length) showFoods(r, 'Récents'); }).catch(() => {});
  let timer, seq = 0;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    const t = q.value.trim();
    if (!t) { hint.textContent = ''; api('/foods/recent').then((r) => showFoods(r, 'Récents')); return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      hint.textContent = 'Recherche…';
      try {
        const r = await api('/foods/search?q=' + encodeURIComponent(t));
        if (my !== seq) return;
        hint.textContent = r.offline ? 'Open Food Facts injoignable : résultats locaux uniquement.' : '';
        showFoods(r.items);
      } catch (e) { hint.textContent = e.message; }
    }, 350);
  });
}

function qtyStep(sh, meal, f) {
  const g = h('input', { class: 'inp', type: 'number', inputmode: 'decimal', min: 1, value: f.serving || 100 });
  const out = h('div', { class: 'stats' });
  const calc = () => {
    const k = (+g.value || 0) / 100;
    out.replaceChildren(
      h('div', { class: 'stat' }, 'Calories', h('b', {}, num(f.kcal * k))),
      h('div', { class: 'stat' }, 'Protéines', h('b', {}, num(f.protein * k, 1) + ' g')),
      h('div', { class: 'stat' }, 'Glucides', h('b', {}, num(f.carbs * k, 1) + ' g')),
      h('div', { class: 'stat' }, 'Lipides', h('b', {}, num(f.fat * k, 1) + ' g')));
  };
  g.addEventListener('input', calc);
  calc();
  sh.set(h('div', { class: 'card' },
    h('h3', {}, f.name), h('small', {}, `${f.brand ? f.brand + ' · ' : ''}${num(f.kcal)} kcal · P ${num(f.protein, 1)} · G ${num(f.carbs, 1)} · L ${num(f.fat, 1)} /100 g`),
    h('label', { class: 'field' }, 'Quantité (g ou ml)', g),
    f.serving > 0 && h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { g.value = f.serving; calc(); } }, `1 portion (${num(f.serving)} g)`),
      h('button', { class: 'btn sm', onclick: () => { g.value = 100; calc(); } }, '100 g')),
    out,
    h('button', { class: 'btn pri', onclick: guard(async () => {
      await api('/log', 'POST', { date: S.date, meal, food_id: f.id, grams: g.value });
      sh.close(); render();
    }) }, 'Ajouter au journal')));
  g.focus(); g.select();
}

function createFood(sh, meal, barcode) {
  const f = (label, attrs) => { const i = h('input', { class: 'inp', ...attrs }); return [h('label', { class: 'field' }, label, i), i]; };
  const [l1, name] = f('Nom', { placeholder: 'Ex. Riz basmati cuit' });
  const [l2, brand] = f('Marque (optionnel)', {});
  const [l3, kcal] = f('Calories / 100 g', { type: 'number', inputmode: 'decimal' });
  const [l4, prot] = f('Protéines / 100 g', { type: 'number', inputmode: 'decimal' });
  const [l5, carb] = f('Glucides / 100 g', { type: 'number', inputmode: 'decimal' });
  const [l6, fat] = f('Lipides / 100 g', { type: 'number', inputmode: 'decimal' });
  const [l7, serv] = f('Portion en g (optionnel)', { type: 'number', inputmode: 'decimal' });
  const [l8, code] = f('Code-barres (optionnel)', { inputmode: 'numeric', value: barcode || '' });
  sh.set(h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
    barcode && h('p', { class: 'muted' }, 'Produit introuvable : tu peux le créer, il sera retrouvé au prochain scan.'),
    l1, l2, h('div', { class: 'grid2' }, l3, l4), h('div', { class: 'grid2' }, l5, l6), h('div', { class: 'grid2' }, l7, l8),
    h('button', { class: 'btn pri', onclick: guard(async () => {
      const food = await api('/foods', 'POST', { name: name.value, brand: brand.value, kcal: kcal.value, protein: prot.value,
        carbs: carb.value, fat: fat.value, serving: serv.value, barcode: code.value });
      qtyStep(sh, meal, food);
    }) }, 'Enregistrer')));
}

async function lookup(sh, meal, code) {
  try {
    qtyStep(sh, meal, await api('/foods/barcode/' + code));
  } catch (e) {
    toast(e.message);
    if (/introuvable/i.test(e.message)) createFood(sh, meal, code);
  }
}

function scanBarcode(sh, meal) {
  const video = h('video', { playsinline: true, muted: true });
  const hint = h('small', { class: 'muted' }, 'Place le code-barres dans le cadre.');
  const manual = h('input', { class: 'inp', inputmode: 'numeric', placeholder: 'Ou tape le code-barres' });
  let stream, timer, done = false;
  const stop = () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  const found = (code) => { if (done) return; done = true; stop(); lookup(sh, meal, code); };
  sh.onClose(stop);
  sh.set(h('div', { class: 'scan', style: 'display:flex;flex-direction:column;gap:10px' },
    h('div', { class: 'frame' }, video), hint,
    h('div', { class: 'row' }, manual, h('button', { class: 'btn', onclick: () => manual.value.trim() && found(manual.value.trim()) }, 'OK')),
    window.Android && h('button', { class: 'btn', onclick: () => window.Android.scanBarcode() }, 'Relancer le scan'),
    h('button', { class: 'btn ghost', onclick: () => { done = true; sh.close(); } }, 'Annuler')));

  (async () => {
    if (window.Android) { // scanner natif de l'appli Android
      video.parentNode.style.display = 'none';
      hint.textContent = 'Ouverture du scanner…';
      window.__native.onScan = (code) => { if (code) found(code); else hint.textContent = 'Scan annulé. Relance le scan ou saisis le code.'; };
      window.__native.onScanError = (msg) => { hint.textContent = `Scanner indisponible (${msg}). Saisis le code à la main.`; };
      window.Android.scanBarcode();
      return;
    }
    if (!window.isSecureContext) { hint.textContent = "La caméra exige HTTPS (ou localhost). Saisis le code à la main ou passe l'appli en HTTPS."; return; }
    if (!('BarcodeDetector' in window)) { hint.textContent = "Ce navigateur ne sait pas lire les codes-barres. Utilise Chrome sur Android, ou saisis le code."; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      timer = setInterval(async () => {
        try { const r = await det.detect(video); if (r[0]) found(r[0].rawValue); } catch { /* frame suivante */ }
      }, 300);
    } catch { hint.textContent = "Impossible d'accéder à la caméra (permission refusée ?). Saisis le code à la main."; }
  })();
}

/* ---------- poids ---------- */
views.weight = async (m) => {
  const [ws, cfg] = await Promise.all([api('/weights'), api('/settings')]);
  S.cfg = cfg;
  const d = h('input', { class: 'inp', type: 'date', value: today() });
  const kg = h('input', { class: 'inp', type: 'number', inputmode: 'decimal', step: 0.1, placeholder: 'kg', value: ws.at(-1)?.kg || '' });
  m.append(h('section', { class: 'card' }, h('h3', {}, 'Nouvelle pesée'),
    h('div', { class: 'grid2' }, d, kg),
    h('button', { class: 'btn pri', onclick: guard(async () => { await api('/weights', 'POST', { date: d.value, kg: kg.value }); render(); }) }, 'Enregistrer')));
  m.append(h('section', { class: 'card' }, h('h3', {}, 'Évolution'), chart(ws, cfg.goal_weight)));
  if (ws.length) {
    m.append(h('section', { class: 'card' }, h('h3', {}, 'Historique'),
      [...ws].reverse().slice(0, 30).map((w) => h('div', { class: 'item' },
        h('div', { class: 't' }, label(w.date)), h('span', { class: 'k' }, num(w.kg, 1) + ' kg'),
        h('button', { class: 'icon-btn', onclick: guard(async () => { await api('/weights/' + w.id, 'DELETE'); render(); }) }, '×')))));
  }
};

function chart(ws, goal) {
  if (ws.length < 2) return h('p', { class: 'muted center' }, 'Ajoute au moins 2 pesées pour voir la courbe.');
  const pts = ws.slice(-90), W = 320, H = 160, L = 34, B = 20;
  const vals = pts.map((p) => p.kg).concat(goal > 0 ? [goal] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad2 = (hi - lo) * 0.2 || 1; lo -= pad2; hi += pad2;
  const t0 = new Date(pts[0].date).getTime(), span = Math.max(new Date(pts.at(-1).date).getTime() - t0, 1);
  const X = (d) => L + ((new Date(d).getTime() - t0) / span) * (W - L - 8);
  const Y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (H - B - 8);
  const line = pts.map((p) => `${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ');
  const g = goal > 0 ? `<line x1="${L}" x2="${W - 8}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="#8d93a0" stroke-dasharray="4 4"/><text x="${W - 8}" y="${Y(goal) - 4}" fill="#8d93a0" font-size="9" text-anchor="end">objectif ${goal} kg</text>` : '';
  return h('div', { html: `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <text x="0" y="${Y(hi - pad2) + 3}" fill="#8d93a0" font-size="9">${(hi - pad2).toFixed(1)}</text>
    <text x="0" y="${Y(lo + pad2) + 3}" fill="#8d93a0" font-size="9">${(lo + pad2).toFixed(1)}</text>${g}
    <polyline points="${line}" fill="none" stroke="#4ade80" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p) => `<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="2.6" fill="#4ade80"/>`).join('')}
    <text x="${L}" y="${H - 4}" fill="#8d93a0" font-size="9">${short(pts[0].date)}</text>
    <text x="${W - 8}" y="${H - 4}" fill="#8d93a0" font-size="9" text-anchor="end">${short(pts.at(-1).date)}</text></svg>` });
}

/* ---------- réglages & connexion ---------- */
async function openSettings() {
  const c = await api('/settings');
  const f = (label, key, step = 1) => { const i = h('input', { class: 'inp', type: 'number', inputmode: 'decimal', step, value: c[key] || '' }); return [h('label', { class: 'field' }, label, i), i]; };
  const [a, goal] = f('Objectif calories par jour (kcal)', 'kcal_goal', 50);
  const [b, gw] = f('Poids objectif (kg, optionnel)', 'goal_weight', 0.1);
  const [c2, w] = f('Poids de référence (kg) si aucune pesée', 'weight', 0.1);
  const [d, sm] = f('Minutes par série de muscu (repos inclus)', 'set_minutes', 0.5);
  const sh = sheet('Réglages', h('div', { style: 'display:flex;flex-direction:column;gap:12px' }, a, b, c2, d,
    h('small', { class: 'muted' }, 'Calories brûlées = MET × poids × durée. C\'est une estimation, pas une mesure.'),
    h('button', { class: 'btn pri', onclick: guard(async () => {
      await api('/settings', 'PUT', { kcal_goal: goal.value, goal_weight: gw.value || 0, weight: w.value, set_minutes: sm.value });
      sh.close(); render();
    }) }, 'Enregistrer'),
    window.Android && h('div', { class: 'sect' }, 'Dossier de données'),
    window.Android && h('small', { class: 'muted' }, c.folder
      ? 'Actif : chaque modification est copiée dans ton dossier (fichier gym-tracker.json).'
      : 'Choisis un dossier (ex. Documents/GymTracker). Tes données y sont enregistrées automatiquement et survivent à une désinstallation.'),
    window.Android && h('button', { class: 'btn' + (c.folder ? '' : ' pri'), onclick: () => { sh.close(); window.Android.chooseFolder(); } },
      c.folder ? 'Changer de dossier' : 'Choisir le dossier'),
    h('div', { class: 'sect' }, 'Sauvegarde'),
    h('small', { class: 'muted' }, c.last_backup
      ? `Dernière sauvegarde : ${new Date(c.last_backup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`
      : 'Aucune sauvegarde pour le moment.'),
    c.memory_only && h('small', { class: 'err' }, "Le stockage du navigateur est indisponible : les données seront perdues à la fermeture."),
    h('button', { class: 'btn', onclick: guard(() => doBackup('download')) }, window.Android ? 'Enregistrer une copie…' : 'Enregistrer dans Téléchargements'),
    !window.Android && navigator.share && h('button', { class: 'btn', onclick: guard(() => doBackup('share')) }, 'Envoyer vers Drive / Fichiers…'),
    h('button', { class: 'btn', onclick: doRestore }, 'Restaurer une sauvegarde')));
}

async function doBackup(mode) {
  const data = await api('/export');
  const name = `gym-tracker-${today()}.json`;
  if (window.Android) { window.Android.saveCopy(JSON.stringify(data), name); return; } // résultat dans __native.onSaved
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  if (mode === 'share') {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        await api('/backup-done', 'POST');
        return toast('Sauvegarde envoyée');
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    toast('Partage indisponible : fichier téléchargé à la place');
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  await api('/backup-done', 'POST');
  if (mode !== 'share') toast('Enregistré dans Téléchargements : ' + name);
}

async function restoreText(text, skipConfirm) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Fichier invalide'); }
  if (!skipConfirm && !confirm(`Remplacer TOUTES les données actuelles par cette sauvegarde (${data.workouts?.length || 0} séances, ${data.weights?.length || 0} pesées) ?`)) return;
  await api('/import', 'POST', data);
  document.querySelector('.backdrop')?.remove();
  toast('Données restaurées');
  render();
}

function doRestore() {
  if (window.Android) { window.Android.restoreFromFile(); return; } // résultat dans __native.onRestore
  const inp = h('input', { type: 'file', accept: 'application/json,.json', onchange: guard(async () => {
    if (inp.files[0]) await restoreText(await inp.files[0].text());
  }) });
  inp.click();
}

/* ---------- pont avec l'appli Android (inactif dans un navigateur) ---------- */
window.__native = {
  onScan: () => {}, onScanError: () => {},
  // bouton retour : ferme la fenêtre ouverte au lieu de quitter l'appli
  onBack() {
    const b = [...document.querySelectorAll('.backdrop')].pop();
    if (!b) return false;
    b.querySelector('.x')?.click();
    return true;
  },
  onSaved: guard(async (ok) => {
    if (ok) { await api('/backup-done', 'POST'); toast('Copie enregistrée'); render(); }
  }),
  onRestore: guard(async (text) => { if (text) await restoreText(text); }),
  onFolder: guard(async (info) => {
    if (!info) return;
    if (info.hasFile && confirm('Un fichier de données existe déjà dans ce dossier.\n\nOK : le charger (remplace les données actuelles)\nAnnuler : garder les données actuelles et écraser le fichier')) {
      await restoreText(window.Android.readBackup(), true);
    } else {
      Local.mirrorNow();
      toast('Dossier activé');
    }
    render();
  }),
};

if ('serviceWorker' in navigator && !window.Android) navigator.serviceWorker.register('sw.js').catch(() => {});
Local.ready.then(render);
