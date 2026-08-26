import { renderLibrary, renderPlan, renderProgress, renderSearchResults, renderToday } from './render.js';
import { muscleLabel, renderMusclePicker } from './muscle-map.js';
import { mountMuscleMaps, unmountMuscleMaps } from './muscle-map-island.js';

const BASE = location.pathname === '/gym' || location.pathname.startsWith('/gym/') ? '/gym' : '';
const main = document.querySelector('#main');
const tabs = document.querySelector('.tabs');
const saveState = document.querySelector('#saveState');
const themeButton = document.querySelector('#themeButton');
const searchDialog = document.querySelector('#searchDialog');
const closeSearch = document.querySelector('#closeSearch');
const exerciseSearch = document.querySelector('#exerciseSearch');
const bodyPartFilter = document.querySelector('#bodyPartFilter');
const equipmentFilter = document.querySelector('#equipmentFilter');
const targetFilter = document.querySelector('#targetFilter');
const searchResults = document.querySelector('#searchResults');
const muscleFilterChip = document.querySelector('#muscleFilterChip');
const searchMuscleMap = document.querySelector('#searchMuscleMap');
const toast = document.querySelector('#toast');

const state = {
  tab: 'today',
  bootstrap: null,
  progress: null,
  planDraft: { days: [] },
  selectedWeekday: 1,
  expanded: new Set(),
  details: new Map(),
  reviewSession: null,
  reviewEditable: false,
  searchResults: [],
  searchLoading: false,
  searchPreview: null,
  searchMuscle: null,
  searchTimer: null,
  saveTimers: new Map(),
  planDirty: false,
  bodyWeightEdit: null
};

function setStatus(message, error = false) {
  saveState.textContent = message;
  saveState.classList.toggle('error', error);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body != null) {
    headers['content-type'] = 'application/json';
    headers['x-csrf-token'] = state.bootstrap?.csrf ?? '';
  }
  const response = await fetch(`${BASE}${path}`, { cache: 'no-store', ...options, headers });
  let value = {};
  try { value = await response.json(); } catch {}
  if (!response.ok) throw Object.assign(new Error(value.error || `Request failed (${response.status})`), { status: response.status });
  return value;
}

function clonePlan(plan) {
  const clone = JSON.parse(JSON.stringify(plan));
  for (const day of clone.days ?? []) {
    for (const exercise of day.exercises ?? []) exercise.repMin = exercise.repMax;
  }
  return clone;
}

function render() {
  unmountMuscleMaps(main);
  document.body.dataset.view = state.tab;
  document.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === state.tab));
  if (!state.bootstrap) return;
  if (state.tab === 'today') main.innerHTML = renderToday(state);
  if (state.tab === 'progress') main.innerHTML = renderProgress(state);
  if (state.tab === 'plan') main.innerHTML = renderPlan(state);
  if (state.tab === 'library') main.innerHTML = renderLibrary(state);
  installMediaFallbacks(main);
  mountMuscleMaps(main, openSearchPanel);
}

function installMediaFallbacks(root) {
  root.querySelectorAll('[data-media-fallback]').forEach((image) => image.addEventListener('error', () => {
    const replacement = document.createElement('span');
    replacement.textContent = 'Media unavailable';
    image.replaceWith(replacement);
  }, { once: true }));
}

async function reload({ progress = false } = {}) {
  const currentPlanDraft = state.planDraft;
  state.bootstrap = await api('/api/bootstrap');
  if (!currentPlanDraft.days.length || state.tab !== 'plan') state.planDraft = clonePlan(state.bootstrap.plan);
  if (!state.planDraft.days.some((day) => day.weekday === state.selectedWeekday)) state.selectedWeekday = state.bootstrap.weekday;
  if (progress || state.tab === 'progress') state.progress = await api('/api/progress');
  render();
}

async function switchTab(tab) {
  if (tab === state.tab) return;
  await flushPendingSetSaves();
  if (state.tab === 'plan' && state.planDirty && !confirm('Discard unsaved Plan changes?')) return;
  if (state.tab === 'plan') state.planDirty = false;
  state.tab = tab;
  state.reviewSession = null;
  if (tab === 'progress') state.progress = await api('/api/progress');
  if (tab === 'plan') {
    state.planDraft = clonePlan(state.bootstrap.plan);
    state.selectedWeekday = state.bootstrap.scheduledWorkout?.weekday ?? state.bootstrap.weekday;
  }
  render();
  main.focus({ preventScroll: true });
}

async function toggleExercise(button) {
  const id = button.dataset.expand;
  if (state.expanded.has(id)) state.expanded.delete(id);
  else {
    state.expanded.add(id);
    const catalogId = button.dataset.catalogId;
    if (!state.details.has(catalogId)) {
      try {
        const { exercise } = await api(`/api/exercises/${encodeURIComponent(catalogId)}`);
        state.details.set(catalogId, exercise);
      } catch (error) { showToast(error.message); }
    }
  }
  render();
}

function setPayload(row, completed) {
  const load = row.querySelector('[data-set-load]').value;
  const reps = row.querySelector('[data-set-reps]').value;
  if (completed && (load === '' || reps === '')) throw new Error('Enter kilograms and reps before completing the set.');
  return {
    setNumber: Number(row.dataset.setNumber),
    completed,
    loadGrams: load === '' ? null : Math.round(Number(load) * 1000),
    reps: reps === '' ? null : Number(reps)
  };
}

async function saveSet(row, completed, { rerender = true } = {}) {
  const key = `${row.dataset.exerciseId}:${row.dataset.setNumber}`;
  const pending = state.saveTimers.get(key);
  if (pending) clearTimeout(pending.timer);
  state.saveTimers.delete(key);
  setStatus('Saving…');
  try {
    const payload = setPayload(row, completed);
    const { session } = await api(`/api/sessions/${row.dataset.sessionId}/exercises/${row.dataset.exerciseId}/sets`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (state.bootstrap.activeSession?.id === session.id) state.bootstrap.activeSession = session;
    if (state.reviewSession?.id === session.id) {
      state.reviewSession = session;
      const selected = state.progress?.selectedExercise?.id;
      state.progress = await api(`/api/progress${selected ? `?exerciseId=${encodeURIComponent(selected)}` : ''}`);
      rerender = true;
    }
    setStatus('Saved');
    if (rerender) render();
  } catch (error) {
    setStatus(navigator.onLine ? 'Not saved' : 'Offline · not saved', true);
    showToast(error.message);
  }
}

function queueSetEdit(row) {
  const key = `${row.dataset.exerciseId}:${row.dataset.setNumber}`;
  const pending = state.saveTimers.get(key);
  if (pending) clearTimeout(pending.timer);
  const timer = setTimeout(() => saveSet(row, row.querySelector('[data-set-complete]').classList.contains('done'), { rerender: false }), 550);
  state.saveTimers.set(key, { timer, row });
  setStatus('Unsaved set');
}

async function flushPendingSetSaves() {
  const pending = [...state.saveTimers.values()];
  state.saveTimers.clear();
  await Promise.all(pending.map(({ timer, row }) => {
    clearTimeout(timer);
    return saveSet(row, row.querySelector('[data-set-complete]').classList.contains('done'), { rerender: false });
  }));
}

function discardPendingSetSaves() {
  for (const { timer } of state.saveTimers.values()) clearTimeout(timer);
  state.saveTimers.clear();
}

function selectedDay() {
  return state.planDraft.days.find((day) => day.weekday === state.selectedWeekday);
}

function updatePlanField(element) {
  const exercise = selectedDay()?.exercises.find((item) => item.exerciseId === element.closest('[data-plan-exercise]').dataset.planExercise);
  if (!exercise) return;
  const field = element.dataset.planField;
  if (field === 'targetKg') exercise.targetGrams = Math.round(Number(element.value) * 1000);
  else if (field === 'incrementKg') exercise.incrementGrams = Math.round(Number(element.value) * 1000);
  else if (field === 'reps') exercise.repMin = exercise.repMax = Number(element.value);
  else exercise[field] = Number(element.value);
  markPlanDirty();
}

function markPlanDirty() {
  state.planDirty = true;
  setStatus('Unsaved Plan');
}

async function savePlan() {
  const name = document.querySelector('#planName');
  if (name && selectedDay()) selectedDay().name = name.value.trim();
  setStatus('Saving…');
  try {
    const { plan } = await api('/api/plan', { method: 'PUT', body: JSON.stringify(state.planDraft) });
    state.bootstrap.plan = plan;
    state.planDraft = clonePlan(plan);
    state.planDirty = false;
    state.bootstrap.scheduledWorkout = plan.days.find((day) => day.weekday === state.bootstrap.weekday) ?? null;
    setStatus('Saved');
    showToast('Weekly plan saved.');
    render();
  } catch (error) {
    setStatus('Not saved', true);
    showToast(error.message);
  }
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportPlan() {
  const days = state.bootstrap.plan.days.map((day) => ({
    weekday: day.weekday,
    name: day.name,
    exercises: day.exercises.map(({ exerciseId, sets, repMax, targetGrams, incrementGrams }) => ({ exerciseId, sets, repMin: repMax, repMax, targetGrams, incrementGrams }))
  }));
  const backup = { format: 'personal-gym-plan', version: 1, exportedAt: new Date().toISOString(), plan: { days } };
  downloadFile(`gym-plan-${state.bootstrap.today}.json`, `${JSON.stringify(backup, null, 2)}\n`, 'application/json');
  showToast('Workout plan exported.');
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportExercises() {
  setStatus('Preparing export…');
  try {
    const { exercises } = await api('/api/exercises/export');
    const rows = [['Name', 'Body part', 'Equipment', 'Target muscle', 'Custom'], ...exercises.map((exercise) => [exercise.name, exercise.bodyPart, exercise.equipment, exercise.target, exercise.custom ? 'yes' : 'no'])];
    downloadFile(`gym-exercises-${state.bootstrap.today}.csv`, `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`, 'text/csv;charset=utf-8');
    setStatus('Ready');
    showToast(`${exercises.length} exercises exported.`);
  } catch (error) {
    setStatus('Export failed', true);
    showToast(error.message);
  }
}

async function importPlan(file) {
  if (!file) return;
  if (file.size > 256 * 1024) throw new Error('Plan exports must be smaller than 256 KB.');
  const parsed = JSON.parse(await file.text());
  const imported = parsed?.format === 'personal-gym-plan' ? parsed.plan : parsed;
  if (!imported || !Array.isArray(imported.days)) throw new Error('This file does not contain a Gym workout plan.');
  if (!confirm('Replace your current weekly plan with this imported plan? Workout history will stay unchanged.')) return;
  const portablePlan = { days: imported.days.map((day) => ({
    ...day,
    id: null,
    exercises: Array.isArray(day.exercises)
      ? day.exercises.map((exercise) => ({ ...exercise, repMin: exercise.repMax }))
      : day.exercises
  })) };
  setStatus('Importing…');
  const { plan } = await api('/api/plan', { method: 'PUT', body: JSON.stringify(portablePlan) });
  state.bootstrap = await api('/api/bootstrap');
  state.bootstrap.plan = plan;
  state.planDraft = clonePlan(plan);
  state.planDirty = false;
  populateFilters();
  setStatus('Ready');
  render();
  showToast('Workout plan imported.');
}

function populateFilters() {
  const add = (select, values) => {
    const initial = select.firstElementChild.outerHTML;
    select.innerHTML = initial + values.map((value) => `<option value="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">${value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</option>`).join('');
  };
  add(bodyPartFilter, state.bootstrap.filters.bodyParts);
  add(equipmentFilter, state.bootstrap.filters.equipment);
  add(targetFilter, state.bootstrap.filters.targets);
}

async function runSearch() {
  state.searchLoading = true;
  searchResults.innerHTML = renderSearchResults(state);
  const params = new URLSearchParams({ q: exerciseSearch.value, bodyPart: bodyPartFilter.value, equipment: equipmentFilter.value, target: targetFilter.value, muscle: state.searchMuscle ?? '', limit: '60' });
  try {
    const value = await api(`/api/exercises?${params}`);
    state.searchResults = value.items;
  } catch (error) {
    state.searchResults = [];
    showToast(error.message);
  } finally {
    state.searchLoading = false;
    searchResults.innerHTML = renderSearchResults(state);
    installMediaFallbacks(searchResults);
  }
}

function updateMuscleFilterChip() {
  muscleFilterChip.hidden = !state.searchMuscle;
  muscleFilterChip.textContent = state.searchMuscle ? `${muscleLabel(state.searchMuscle)} ×` : '';
}

function syncMusclePicker() {
  window.dispatchEvent(new CustomEvent('gym:muscle-filter', { detail: state.searchMuscle }));
}

function openSearchPanel(muscle = null) {
  state.searchMuscle = muscle;
  state.searchPreview = null;
  if (muscle) {
    exerciseSearch.value = '';
    bodyPartFilter.value = '';
    equipmentFilter.value = '';
    targetFilter.value = '';
  }
  updateMuscleFilterChip();
  syncMusclePicker();
  if (!searchDialog.open) searchDialog.showModal();
  exerciseSearch.focus();
  runSearch();
}

function addExercise(id) {
  const day = selectedDay();
  const source = state.searchResults.find((exercise) => exercise.id === id);
  if (!day || !source) return;
  if (day.exercises.some((exercise) => exercise.exerciseId === id)) return showToast('That exercise is already in this workout.');
  day.exercises.push({
    exerciseId: source.id,
    name: source.name,
    equipment: source.equipment,
    bodyPart: source.bodyPart,
    imageAvailable: source.imageAvailable,
    gifAvailable: source.gifAvailable,
    muscles: source.muscles,
    sets: 3,
    repMin: 10,
    repMax: 10,
    targetGrams: 0,
    incrementGrams: 2500
  });
  markPlanDirty();
  searchDialog.close();
  render();
  showToast(`${source.name} added. Save the plan when ready.`);
}

function shiftExercise(id, direction) {
  const exercises = selectedDay().exercises;
  const index = exercises.findIndex((exercise) => exercise.exerciseId === id);
  const next = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || next < 0 || next >= exercises.length) return;
  [exercises[index], exercises[next]] = [exercises[next], exercises[index]];
  markPlanDirty();
  render();
}

function dayDifference(left, right) {
  return Math.round((Date.parse(`${right}T12:00:00Z`) - Date.parse(`${left}T12:00:00Z`)) / 86_400_000);
}

async function handleClick(event) {
  const tab = event.target.closest('[data-tab]');
  if (tab) return switchTab(tab.dataset.tab);
  if (event.target.closest('[data-go-plan]')) return switchTab('plan');
  const muscle = event.target.closest('[data-muscle]');
  if (muscle) return openSearchPanel(muscle.dataset.muscle);
  if (event.target.closest('[data-export-plan]')) return exportPlan();
  if (event.target.closest('[data-export-exercises]')) return exportExercises();
  const expand = event.target.closest('[data-expand]');
  if (expand) return toggleExercise(expand);
  const start = event.target.closest('[data-start-workout]');
  if (start) {
    try {
      const { session } = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ planId: Number(start.dataset.startWorkout) }) });
      state.bootstrap.activeSession = session;
      state.expanded = new Set([session.exercises[0]?.id].filter(Boolean));
      render();
    } catch (error) { showToast(error.message); }
    return;
  }
  const complete = event.target.closest('[data-set-complete]');
  if (complete) return saveSet(complete.closest('[data-set-row]'), !complete.classList.contains('done'));
  const addSet = event.target.closest('[data-add-set]');
  if (addSet) {
    await flushPendingSetSaves();
    try {
      const { session } = await api(`/api/sessions/${addSet.dataset.sessionId}/exercises/${addSet.dataset.exerciseId}/sets`, { method: 'POST', body: '{}' });
      state.bootstrap.activeSession = session;
      render();
      showToast('Extra set added.');
    } catch (error) { showToast(error.message); }
    return;
  }
  const removeSet = event.target.closest('[data-remove-extra-set]');
  if (removeSet) {
    const row = removeSet.closest('[data-set-row]');
    if (row.dataset.setCompleted === 'true' && !confirm('Remove this completed extra set?')) return;
    await flushPendingSetSaves();
    try {
      const { session } = await api(`/api/sessions/${row.dataset.sessionId}/exercises/${row.dataset.exerciseId}/sets/${row.dataset.setNumber}`, { method: 'DELETE', body: '{}' });
      state.bootstrap.activeSession = session;
      render();
      showToast('Extra set removed.');
    } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.closest('[data-finish-workout]')) {
    await flushPendingSetSaves();
    const session = state.bootstrap.activeSession;
    const incomplete = session.exercises.some((exercise) => exercise.sets.filter((set) => set.completed).length < exercise.prescribedSets);
    if (incomplete && !confirm('Some prescribed sets are incomplete. Save this as a partial workout?')) return;
    try {
      const value = await api(`/api/sessions/${session.id}/finish`, { method: 'POST', body: '{}' });
      state.bootstrap.activeSession = null;
      state.bootstrap.completedToday.unshift(value.session);
      state.progress = null;
      render();
    } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.closest('[data-cancel-workout]')) {
    if (!confirm('Cancel this workout? Logged sets from this active workout will be removed.')) return;
    discardPendingSetSaves();
    try {
      await api(`/api/sessions/${state.bootstrap.activeSession.id}`, { method: 'DELETE', body: '{}' });
      state.bootstrap = await api('/api/bootstrap');
      state.expanded.clear();
      render();
      showToast('Workout cancelled.');
    } catch (error) { showToast(error.message); }
    return;
  }
  const progression = event.target.closest('[data-progression]');
  if (progression) {
    try {
      const { session } = await api(`/api/progression/${progression.dataset.exerciseId}`, { method: 'PATCH', body: JSON.stringify({ decision: progression.dataset.progression }) });
      const index = state.bootstrap.completedToday.findIndex((item) => item.id === session.id);
      if (index >= 0) state.bootstrap.completedToday[index] = session;
      if (progression.dataset.progression === 'accepted') state.bootstrap = await api('/api/bootstrap');
      render();
    } catch (error) { showToast(error.message); }
    return;
  }
  const selectDayButton = event.target.closest('[data-select-day]');
  if (selectDayButton) { state.selectedWeekday = Number(selectDayButton.dataset.selectDay); return render(); }
  if (event.target.closest('[data-add-day]')) {
    state.planDraft.days.push({ id: null, weekday: state.selectedWeekday, name: `${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][state.selectedWeekday - 1]} workout`, exercises: [] });
    state.planDraft.days.sort((a, b) => a.weekday - b.weekday);
    markPlanDirty();
    return render();
  }
  if (event.target.closest('[data-remove-day]')) {
    state.planDraft.days = state.planDraft.days.filter((day) => day.weekday !== state.selectedWeekday);
    markPlanDirty();
    return render();
  }
  if (event.target.closest('[data-save-plan]')) return savePlan();
  if (event.target.closest('[data-open-search]')) return openSearchPanel();
  const add = event.target.closest('[data-add-exercise]');
  if (add) return addExercise(add.dataset.addExercise);
  const planRow = event.target.closest('[data-plan-exercise]');
  if (planRow && event.target.closest('[data-remove-exercise]')) {
    selectedDay().exercises = selectedDay().exercises.filter((exercise) => exercise.exerciseId !== planRow.dataset.planExercise);
    markPlanDirty();
    return render();
  }
  const move = event.target.closest('[data-move-exercise]');
  if (move) return shiftExercise(planRow.dataset.planExercise, move.dataset.moveExercise);
  const review = event.target.closest('[data-review-session]');
  if (review) {
    try {
      const { session } = await api(`/api/sessions/${review.dataset.reviewSession}`);
      state.reviewSession = session;
      state.reviewEditable = dayDifference(session.date, state.bootstrap.today) <= 7;
      render();
      document.querySelector('.history-panel .workout-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { showToast(error.message); }
  }
  const editWeight = event.target.closest('[data-edit-weight]');
  if (editWeight) {
    state.bodyWeightEdit = state.progress.weights.find((entry) => entry.date === editWeight.dataset.editWeight) ?? null;
    return render();
  }
  const deleteWeight = event.target.closest('[data-delete-weight]');
  if (deleteWeight) {
    if (!confirm(`Delete the body-weight entry for ${deleteWeight.dataset.deleteWeight}?`)) return;
    try {
      await api('/api/body-weight', { method: 'DELETE', body: JSON.stringify({ date: deleteWeight.dataset.deleteWeight }) });
      state.bodyWeightEdit = null;
      state.progress = await api('/api/progress');
      render();
    } catch (error) { showToast(error.message); }
  }
}

tabs.addEventListener('click', (event) => handleClick(event).catch((error) => showToast(error.message)));
main.addEventListener('click', (event) => handleClick(event).catch((error) => showToast(error.message)));
main.addEventListener('input', (event) => {
  if (event.target.matches('[data-set-load],[data-set-reps]')) queueSetEdit(event.target.closest('[data-set-row]'));
  if (event.target.matches('[data-plan-field]')) updatePlanField(event.target);
  if (event.target.id === 'planName' && selectedDay()) { selectedDay().name = event.target.value; markPlanDirty(); }
});
main.addEventListener('change', async (event) => {
  if (event.target.id === 'planImport') {
    try { await importPlan(event.target.files[0]); }
    catch (error) { setStatus('Import failed', true); showToast(error instanceof SyntaxError ? 'Choose a valid JSON plan export.' : error.message); }
    finally { event.target.value = ''; }
    return;
  }
  if (event.target.id === 'progressExercise') {
    try {
      state.progress = await api(`/api/progress?exerciseId=${encodeURIComponent(event.target.value)}`);
      render();
    } catch (error) { showToast(error.message); }
  }
});
main.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.id === 'customExerciseForm') {
    const form = event.target;
    const values = Object.fromEntries(new FormData(form));
    values.instructions = String(values.instructions).split(/\n+/).map((step) => step.trim()).filter(Boolean);
    try {
      const { exercise } = await api('/api/exercises/custom', { method: 'POST', body: JSON.stringify(values) });
      state.bootstrap = await api('/api/bootstrap');
      state.planDraft = clonePlan(state.bootstrap.plan);
      populateFilters();
      form.reset();
      render();
      showToast(`${exercise.name} added to the exercise library.`);
    } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.id !== 'bodyWeightForm') return;
  const value = Number(new FormData(event.target).get('kg'));
  const date = String(new FormData(event.target).get('date'));
  try {
    await api('/api/body-weight', { method: 'PUT', body: JSON.stringify({ date, grams: Math.round(value * 1000) }) });
    state.bodyWeightEdit = null;
    state.progress = await api('/api/progress');
    render();
    showToast('Body weight saved.');
  } catch (error) { showToast(error.message); }
});

closeSearch.addEventListener('click', () => searchDialog.close());
muscleFilterChip.addEventListener('click', () => {
  state.searchMuscle = null;
  updateMuscleFilterChip();
  syncMusclePicker();
  runSearch();
});
searchDialog.addEventListener('click', (event) => { if (event.target === searchDialog) searchDialog.close(); });
for (const control of [exerciseSearch, bodyPartFilter, equipmentFilter, targetFilter]) control.addEventListener('input', () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(runSearch, 220);
});
searchResults.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-exercise]');
  if (button) addExercise(button.dataset.addExercise);
  const preview = event.target.closest('[data-preview-exercise]');
  if (preview) {
    api(`/api/exercises/${encodeURIComponent(preview.dataset.previewExercise)}`).then(({ exercise }) => {
      state.searchPreview = state.searchPreview?.id === exercise.id ? null : exercise;
      searchResults.innerHTML = renderSearchResults(state);
      installMediaFallbacks(searchResults);
    }).catch((error) => showToast(error.message));
  }
});
main.addEventListener('keydown', (event) => {
  const muscle = event.target.closest('[data-muscle]');
  if (muscle && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openSearchPanel(muscle.dataset.muscle);
  }
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('gym:theme', theme);
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#171a17' : '#f4f5f0';
}

const storedTheme = localStorage.getItem('gym:theme');
applyTheme(storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
themeButton.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
window.addEventListener('offline', () => setStatus('Offline · changes will not save', true));
window.addEventListener('online', () => { setStatus('Back online'); reload({ progress: state.tab === 'progress' }).catch(() => setStatus('Connection unavailable', true)); });
window.addEventListener('beforeunload', (event) => {
  if (!state.planDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

searchMuscleMap.innerHTML = renderMusclePicker();
mountMuscleMaps(searchMuscleMap, (muscle) => {
  state.searchMuscle = muscle;
  state.searchPreview = null;
  updateMuscleFilterChip();
  runSearch();
});

try {
  state.bootstrap = await api('/api/bootstrap');
  state.planDraft = clonePlan(state.bootstrap.plan);
  state.selectedWeekday = state.bootstrap.scheduledWorkout?.weekday ?? state.bootstrap.weekday;
  populateFilters();
  setStatus('Ready');
  render();
} catch (error) {
  setStatus('Unavailable', true);
  main.innerHTML = `<section class="panel empty-state"><div class="empty-icon">!</div><h2>Gym unavailable</h2><p>${error.message}</p></section>`;
}
