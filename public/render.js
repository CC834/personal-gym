import { renderMuscleMap } from './muscle-map.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

export const kg = (grams, fallback = '—') => grams == null ? fallback : `${trim(Number(grams) / 1000)} kg`;
const trim = (value) => Number(value.toFixed(3)).toString();
const inputKg = (grams) => grams == null ? '' : trim(Number(grams) / 1000);
const mediaUrl = (id, kind) => `/gym/media/${encodeURIComponent(id)}/${kind}`;

function pageHead(eyebrow, title, description, action = '') {
  return `<header class="page-head"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</header>`;
}

function emptyState(icon, title, copy, action = '') {
  return `<section class="panel empty-state"><div class="empty-icon" aria-hidden="true">${icon}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p>${action}</section>`;
}

function guide(exercise, details) {
  const bodyweight = exercise.equipment === 'body weight';
  const instructions = details?.instructions?.length ? details.instructions.slice(0, 5) : [];
  return `<div class="exercise-guide">
    <div class="exercise-media">
      ${details?.gifAvailable ? `<img src="${mediaUrl(exercise.catalogId ?? exercise.exerciseId ?? exercise.id, 'gif')}" alt="${escapeHtml(exercise.name)} demonstration" data-media-fallback>` : '<span>Animation unavailable</span>'}
    </div>
    <div class="guide-copy">
      <p><strong>${escapeHtml(exercise.equipment)}</strong> · ${escapeHtml(exercise.bodyPart)}</p>
      ${bodyweight ? '<p>Enter 0 kg for bodyweight, or only the additional load.</p>' : ''}
      ${instructions.map((step, index) => `<p>${index + 1}. ${escapeHtml(step)}</p>`).join('') || '<p>Exercise instructions will appear after the full catalog is imported.</p>'}
      ${details?.attribution ? `<p class="attribution">${escapeHtml(details.attribution)}</p>` : ''}
    </div>
  </div>`;
}

function sessionExercise(exercise, index, state, editable = true, sessionId = state.bootstrap.activeSession?.id) {
  const open = state.expanded.has(exercise.id);
  const details = state.details.get(exercise.catalogId);
  const plannedSets = exercise.plannedSets ?? exercise.prescribedSets;
  const canChangeSets = editable && state.bootstrap.activeSession?.id === sessionId;
  return `<article class="exercise-card${open ? ' open' : ''}">
    <button class="exercise-summary" type="button" data-expand="${escapeHtml(exercise.id)}" data-catalog-id="${escapeHtml(exercise.catalogId)}" aria-expanded="${open}">
      <span class="exercise-index">${index + 1}</span>
      <span><strong>${escapeHtml(exercise.name)}</strong><small>${exercise.prescribedSets} × ${exercise.repMax} reps · ${kg(exercise.targetGrams)}</small></span>
      <span class="chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="exercise-body">
      ${guide(exercise, details)}
      <div class="set-table">
        <div class="set-row header"><span></span><span>kg</span><span>reps</span><span>done</span><span></span></div>
        ${exercise.sets.map((set) => `<div class="set-row${set.setNumber > plannedSets ? ' extra-set' : ''}" data-set-row data-session-id="${sessionId}" data-exercise-id="${exercise.id}" data-set-number="${set.setNumber}" data-set-completed="${set.completed}">
          <span class="set-number">${set.setNumber}${set.setNumber > plannedSets ? '<small>extra</small>' : ''}</span>
          <input class="field" data-set-load type="number" inputmode="decimal" min="0" max="1000" step="0.25" value="${inputKg(set.loadGrams)}" aria-label="Set ${set.setNumber} kilograms" ${editable ? '' : 'disabled'}>
          <input class="field" data-set-reps type="number" inputmode="numeric" min="0" max="200" step="1" value="${set.reps ?? ''}" aria-label="Set ${set.setNumber} reps" ${editable ? '' : 'disabled'}>
          <button class="set-check${set.completed ? ' done' : ''}" type="button" data-set-complete aria-label="${set.completed ? 'Mark set incomplete' : 'Complete set'}" ${editable ? '' : 'disabled'}>${set.completed ? '✓' : '○'}</button>
          ${canChangeSets && set.setNumber > plannedSets && set.setNumber === exercise.prescribedSets ? `<button class="remove-extra-set" type="button" data-remove-extra-set aria-label="Remove extra set ${set.setNumber}">×</button>` : '<span></span>'}
        </div>`).join('')}
      </div>
      ${canChangeSets ? `<button class="add-set-button" type="button" data-add-set data-session-id="${sessionId}" data-exercise-id="${exercise.id}">＋ Add set</button>` : ''}
    </div>
  </article>`;
}

function completion(session) {
  const pending = session.exercises.filter((exercise) => exercise.progressionStatus === 'pending');
  return `<section class="panel completion-card">
    <h3>${session.status === 'partial' ? 'Workout saved as partial' : 'Workout complete'}</h3>
    <p>${escapeHtml(session.workoutName)} · ${session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0)} sets logged</p>
    ${pending.length ? `<div class="suggestions">${pending.map((exercise) => `<div class="suggestion"><span class="suggestion-copy"><strong>${escapeHtml(exercise.name)}</strong><small>${exercise.suggestionType === 'reps' ? `Move from ${exercise.repMax} to ${exercise.suggestedRepMax} reps` : `Move from ${kg(exercise.targetGrams)} to ${kg(exercise.suggestedGrams)}`}</small></span><span><button class="button quiet" type="button" data-progression="dismissed" data-exercise-id="${exercise.id}">Keep</button> <button class="button primary" type="button" data-progression="accepted" data-exercise-id="${exercise.id}">Increase</button></span></div>`).join('')}</div>` : ''}
  </section>`;
}

export function renderToday(state) {
  const { bootstrap } = state;
  const scheduled = bootstrap.scheduledWorkout;
  const active = bootstrap.activeSession;
  const completed = bootstrap.completedToday;
  const startOptions = bootstrap.plan.days.map((day) => `<button class="button${scheduled?.id === day.id ? ' primary' : ''}" type="button" data-start-workout="${day.id}">Start ${escapeHtml(day.name)}</button>`).join('');
  const focusExercises = active?.exercises ?? scheduled?.exercises ?? [];
  const muscleSummary = focusExercises.length ? `<section class="panel today-focus"><div class="today-focus-copy"><p class="eyebrow">Today's focus</p><h2>Muscles trained</h2><p>Primary and supporting muscle groups in this workout.</p></div>${renderMuscleMap(focusExercises, { compact: true })}</section>` : '';
  let content;
  if (active) {
    content = `${active.exercises.map((exercise, index) => sessionExercise(exercise, index, state)).join('')}
      <div class="workout-actions"><button class="button quiet danger" type="button" data-cancel-workout>Cancel workout</button><button class="button primary" type="button" data-finish-workout>Finish workout</button></div>`;
  } else if (!bootstrap.plan.days.length) {
    content = emptyState('＋', 'Build your training week', 'Choose your gym days and exercises first.', '<button class="button primary" type="button" data-go-plan>Open Plan</button>');
  } else {
    content = `${completed.map(completion).join('')}${emptyState(scheduled ? '↑' : '·', scheduled ? scheduled.name : 'Rest day', scheduled ? `${scheduled.exercises.length} exercises are ready when you are.` : 'Nothing is scheduled today. Start any planned workout if you feel like training.', `<div class="workout-actions">${startOptions}</div>`)}`;
  }
  return `${pageHead(DAYS[bootstrap.weekday - 1], active?.workoutName ?? scheduled?.name ?? 'Your training', active ? 'Your sets save as you complete them.' : 'Move steadily. The numbers will take care of themselves.')}
    ${muscleSummary}<div class="workout-list">${content}</div>`;
}

function chart(progress) {
  const records = progress.trend;
  if (!records.length) return '<div class="empty-state"><p>Complete this exercise to begin its trend.</p></div>';
  const values = records.map((record) => record.estimatedOneRepMaxGrams ?? record.reps);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = records.map((record, index) => ({
    x: records.length === 1 ? 50 : 8 + index * (84 / (records.length - 1)),
    y: 84 - ((values[index] - min) / range) * 64,
    record
  }));
  const unit = records.some((record) => record.estimatedOneRepMaxGrams != null) ? 'kg e1RM' : 'reps';
  return `<div class="chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Exercise progress chart">
    <line class="chart-grid" x1="8" y1="84" x2="92" y2="84"></line><line class="chart-grid" x1="8" y1="20" x2="92" y2="20"></line>
    <polyline class="chart-line" vector-effect="non-scaling-stroke" points="${points.map((point) => `${point.x},${point.y}`).join(' ')}"></polyline>
    ${points.map((point) => `<circle class="chart-dot" vector-effect="non-scaling-stroke" cx="${point.x}" cy="${point.y}" r="1.5"><title>${point.record.date}: ${point.record.estimatedOneRepMaxGrams ? kg(point.record.estimatedOneRepMaxGrams) : `${point.record.reps} reps`}</title></circle>`).join('')}
    <text class="chart-label" x="8" y="96">${escapeHtml(records[0].date.slice(5))}</text><text class="chart-label" x="92" y="96" text-anchor="end">${escapeHtml(records.at(-1).date.slice(5))}</text>
    <text class="chart-label" x="8" y="15">${escapeHtml(unit)}</text>
  </svg></div>`;
}

export function renderProgress(state) {
  const progress = state.progress;
  if (!progress) return '<div class="loading-state"><span></span><p>Calculating progress…</p></div>';
  const latest = progress.latestWeight;
  const change = progress.weightChangeGrams;
  const pr = progress.recentPr;
  const prValue = pr ? (pr.estimatedOneRepMaxGrams ? kg(pr.estimatedOneRepMaxGrams) : `${pr.reps} reps`) : '—';
  return `${pageHead('Your history', 'Progress', 'A quiet view of consistency, body weight, and strength over time.')}
    <section class="summary-grid">
      <article class="panel metric"><span class="metric-label">Body weight</span><strong class="metric-value">${latest ? kg(latest.grams) : '—'}</strong><small class="metric-note">${change == null ? 'Add a reading to begin' : `${change >= 0 ? '+' : ''}${kg(change)} over 30 days`}</small></article>
      <article class="panel metric"><span class="metric-label">Last 4 weeks</span><strong class="metric-value">${progress.sessionsLastFourWeeks}</strong><small class="metric-note">workouts completed</small></article>
      <article class="panel metric"><span class="metric-label">Recent PR</span><strong class="metric-value">${prValue}</strong><small class="metric-note">${pr ? escapeHtml(pr.name) : 'Complete a workout to begin'}</small></article>
    </section>
    <div class="progress-layout">
      <section class="panel chart-panel"><div class="section-title"><h2>Strength trend</h2><select class="field" id="progressExercise" aria-label="Choose exercise">${progress.exerciseChoices.map((exercise) => `<option value="${escapeHtml(exercise.id)}" ${exercise.id === progress.selectedExercise?.id ? 'selected' : ''}>${escapeHtml(exercise.name)}</option>`).join('')}</select></div>${chart(progress)}</section>
      <section class="panel weight-panel"><div class="section-title"><h2>Body weight</h2></div><form class="body-form" id="bodyWeightForm"><input class="field" name="date" type="date" value="${escapeHtml(state.bodyWeightEdit?.date ?? state.bootstrap.today)}" max="${escapeHtml(state.bootstrap.today)}" required aria-label="Body-weight date"><input class="field" name="kg" type="number" inputmode="decimal" min="20" max="500" step="0.1" value="${state.bodyWeightEdit ? inputKg(state.bodyWeightEdit.grams) : ''}" placeholder="kg" required aria-label="Body weight in kilograms"><button class="button primary" type="submit">${state.bodyWeightEdit ? 'Save' : 'Add'}</button></form><div class="weight-list">${progress.weights.slice(0, 8).map((entry) => `<div class="weight-entry"><span>${escapeHtml(entry.date)}</span><strong>${kg(entry.grams)}</strong><span class="entry-actions"><button type="button" data-edit-weight="${escapeHtml(entry.date)}">Edit</button><button type="button" data-delete-weight="${escapeHtml(entry.date)}" aria-label="Delete body weight for ${escapeHtml(entry.date)}">×</button></span></div>`).join('') || '<p class="metric-note">No readings yet.</p>'}</div></section>
      <section class="panel history-panel"><div class="section-title"><h2>Workout history</h2></div><div class="history-list">${progress.history.map((session) => `<div class="history-entry"><span><strong>${escapeHtml(session.workoutName)}</strong><small>${escapeHtml(session.date)} · ${session.completedSets}/${session.totalSets} sets · ${escapeHtml(session.status)}</small></span><button type="button" data-review-session="${session.id}">Review</button></div>`).join('') || '<p class="metric-note">Your completed workouts will appear here.</p>'}</div>${state.reviewSession ? `<div class="workout-list">${state.reviewSession.exercises.map((exercise, index) => sessionExercise(exercise, index, state, state.reviewEditable, state.reviewSession.id)).join('')}</div>` : ''}</section>
    </div>`;
}

export function renderPlan(state) {
  const selected = state.planDraft.days.find((day) => day.weekday === state.selectedWeekday);
  const week = DAYS.map((name, index) => {
    const weekday = index + 1;
    const day = state.planDraft.days.find((item) => item.weekday === weekday);
    return `<button class="day-card${state.selectedWeekday === weekday ? ' selected' : ''}" type="button" data-select-day="${weekday}"><span>${name.slice(0, 3)}</span><strong>${escapeHtml(day?.name ?? 'Rest')}</strong><small>${day ? `${day.exercises.length} exercises` : 'Tap to add'}</small></button>`;
  }).join('');
  const editor = selected ? `<section class="panel plan-editor">
    <div class="plan-name-row"><input class="field" id="planName" maxlength="60" value="${escapeHtml(selected.name)}" aria-label="Workout name"><button class="button quiet danger" type="button" data-remove-day>Make rest day</button></div>
    <div class="plan-muscle-overview"><div><p class="eyebrow">Workout focus</p><h2>Muscles trained</h2><p>Choose a highlighted muscle to find another exercise for ${escapeHtml(selected.name)}.</p></div>${renderMuscleMap(selected.exercises, { interactive: true })}</div>
    <div class="plan-exercises">${selected.exercises.map((exercise, index) => `<div class="plan-exercise" data-plan-exercise="${escapeHtml(exercise.exerciseId)}">
      <div class="plan-exercise-heading"><strong>${escapeHtml(exercise.name)}</strong><div class="plan-animation">${exercise.gifAvailable ? `<img src="${mediaUrl(exercise.exerciseId, 'gif')}" alt="${escapeHtml(exercise.name)} demonstration" data-media-fallback>` : '<span>Animation unavailable</span>'}</div></div>
      <label class="compact-label">Sets<input class="field" data-plan-field="sets" type="number" min="1" max="20" value="${exercise.sets}"></label>
      <label class="compact-label">Reps<input class="field" data-plan-field="reps" type="number" min="1" max="100" value="${exercise.repMax}"></label>
      <label class="compact-label">Target kg<input class="field" data-plan-field="targetKg" type="number" min="0" max="1000" step=".25" value="${inputKg(exercise.targetGrams)}"></label>
      <label class="compact-label">Increase kg<input class="field" data-plan-field="incrementKg" type="number" min=".25" max="100" step=".25" value="${inputKg(exercise.incrementGrams)}"></label>
      <span class="plan-row-actions"><button class="tiny-button" type="button" data-move-exercise="up" aria-label="Move ${escapeHtml(exercise.name)} up">↑</button><button class="tiny-button" type="button" data-move-exercise="down" aria-label="Move ${escapeHtml(exercise.name)} down">↓</button><button class="tiny-button" type="button" data-remove-exercise aria-label="Remove ${escapeHtml(exercise.name)}">×</button></span>
    </div>`).join('')}</div>
    <div class="plan-footer"><button class="button" type="button" data-open-search>Add exercise</button><button class="button primary" type="button" data-save-plan>Save weekly plan</button></div>
  </section>` : emptyState('＋', `${DAYS[state.selectedWeekday - 1]} is a rest day`, 'Add a workout when you want to train on this day.', '<button class="button primary" type="button" data-add-day>Add workout</button>');
  return `${pageHead('Monday to Sunday', 'Your plan', 'Set the week once, then adjust it only when your training changes.')}
    <div class="week-grid">${week}</div>${editor}`;
}

export function renderLibrary(state) {
  const options = (values) => values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join('');
  return `${pageHead('Your data', 'Library', 'Move your plan, browse what is available, or add an exercise of your own.')}
    <div class="library-grid">
      <section class="panel library-card">
        <p class="eyebrow">Workout plans</p><h2>Import or export</h2>
        <p>Download a portable copy of your training week, or replace it from a previous Gym export.</p>
        <div class="library-actions"><button class="button primary" type="button" data-export-plan>Export plan</button><label class="button file-button">Import plan<input class="sr-only" id="planImport" type="file" accept="application/json,.json"></label><button class="button quiet" type="button" data-go-plan>Edit workouts</button></div>
      </section>
      <section class="panel library-card">
        <p class="eyebrow">Exercise list</p><h2>${state.bootstrap.catalog.count} available</h2>
        <p>Export every available exercise with its body part, equipment, and target muscle as a CSV list.</p>
        <div class="library-actions"><button class="button" type="button" data-export-exercises>Export exercise list</button></div>
      </section>
      <section class="panel library-card custom-exercise-card">
        <p class="eyebrow">Exercise library</p><h2>Add a custom exercise</h2>
        <p>Custom exercises become searchable in Plan. Animation is optional and will show as unavailable.</p>
        <form class="custom-exercise-form" id="customExerciseForm">
          <label class="compact-label">Name<input class="field" name="name" maxlength="80" required placeholder="Cable lateral raise"></label>
          <label class="compact-label">Body part<input class="field" name="bodyPart" maxlength="60" required list="bodyPartOptions" placeholder="shoulders"><datalist id="bodyPartOptions">${options(state.bootstrap.filters.bodyParts)}</datalist></label>
          <label class="compact-label">Equipment<input class="field" name="equipment" maxlength="60" required list="equipmentOptions" placeholder="cable"><datalist id="equipmentOptions">${options(state.bootstrap.filters.equipment)}</datalist></label>
          <label class="compact-label">Target muscle<input class="field" name="target" maxlength="60" required list="targetOptions" placeholder="delts"><datalist id="targetOptions">${options(state.bootstrap.filters.targets)}</datalist></label>
          <label class="compact-label custom-instructions">Instructions, one step per line<textarea class="field" name="instructions" rows="4" maxlength="3000" placeholder="Stand beside the cable.&#10;Raise your arm with control."></textarea></label>
          <button class="button primary" type="submit">Add custom exercise</button>
        </form>
      </section>
    </div>`;
}

export function renderSearchResults(state) {
  if (state.searchLoading) return '<div class="loading-state"><span></span><p>Searching exercises…</p></div>';
  if (!state.searchResults.length) return '<div class="empty-state"><p>No matching set-and-rep exercises found.</p></div>';
  return state.searchResults.map((exercise) => `<article class="search-card${state.searchPreview?.id === exercise.id ? ' expanded' : ''}">
    <div class="search-thumb">${exercise.imageAvailable ? `<img src="${mediaUrl(exercise.id, 'image')}" alt="" data-media-fallback>` : '↗'}</div>
    <div class="search-copy"><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(exercise.bodyPart)} · ${escapeHtml(exercise.equipment)}</small></div>
    <span class="search-actions"><button class="button quiet" type="button" data-preview-exercise="${escapeHtml(exercise.id)}">Preview</button><button class="button" type="button" data-add-exercise="${escapeHtml(exercise.id)}">Add</button></span>
    ${state.searchPreview?.id === exercise.id ? `<div class="search-preview"><div class="exercise-media">${state.searchPreview.gifAvailable ? `<img src="${mediaUrl(exercise.id, 'gif')}" alt="${escapeHtml(exercise.name)} demonstration" data-media-fallback>` : '<span>Animation unavailable</span>'}</div><div class="guide-copy">${state.searchPreview.instructions.slice(0, 5).map((step, index) => `<p>${index + 1}. ${escapeHtml(step)}</p>`).join('')}<p class="attribution">${escapeHtml(state.searchPreview.attribution)}</p></div></div>` : ''}
  </article>`).join('');
}
