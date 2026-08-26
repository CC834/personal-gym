const LABELS = {
  chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  core: 'Abs & core', obliques: 'Obliques', traps: 'Traps', upper_back: 'Upper back', lats: 'Lats',
  lower_back: 'Lower back', glutes: 'Glutes', quads: 'Quadriceps', hamstrings: 'Hamstrings',
  hips: 'Hips', calves: 'Calves', neck: 'Neck', back: 'Back'
};

const PACKAGE_SLUGS = {
  chest: ['chest'], shoulders: ['deltoids'], biceps: ['biceps'], triceps: ['triceps'],
  forearms: ['forearm'], core: ['abs'], obliques: ['obliques'], traps: ['trapezius'],
  upper_back: ['upper-back'], lats: ['upper-back'], lower_back: ['lower-back'], glutes: ['gluteal'],
  quads: ['quadriceps'], hamstrings: ['hamstring'], hips: ['adductors'],
  calves: ['calves', 'tibialis'], neck: ['neck']
};

export const BODY_MODEL_STORAGE_KEY = 'gym:body-model';

export function muscleLabel(id) {
  return LABELS[id] ?? 'Muscle';
}

export function muscleScores(exercises) {
  const scores = new Map();
  for (const exercise of exercises ?? []) {
    const sets = Math.max(1, Number(exercise.plannedSets ?? exercise.sets ?? exercise.prescribedSets) || 1);
    const primary = exercise.muscles?.primary;
    if (primary) {
      const score = scores.get(primary) ?? { primary: 0, secondary: 0 };
      score.primary += sets;
      scores.set(primary, score);
    }
    for (const muscle of exercise.muscles?.secondary ?? []) {
      const score = scores.get(muscle) ?? { primary: 0, secondary: 0 };
      score.secondary += sets;
      scores.set(muscle, score);
    }
  }
  const maximum = Math.max(1, ...[...scores.values()].map((score) => score.primary + score.secondary * 0.45));
  return new Map([...scores].map(([muscle, score]) => [muscle, {
    ...score,
    strength: Math.max(0.42, Math.min(1, (score.primary + score.secondary * 0.45) / maximum))
  }]));
}

export function muscleMapModel(exercises) {
  const scores = muscleScores(exercises);
  const parts = new Map();
  for (const [muscle, score] of scores) {
    for (const slug of PACKAGE_SLUGS[muscle] ?? []) {
      const current = parts.get(slug) ?? { slug, muscles: [], primary: 0, secondary: 0, strength: 0 };
      current.muscles.push(muscle);
      current.primary += score.primary;
      current.secondary += score.secondary;
      current.strength = Math.max(current.strength, score.strength);
      parts.set(slug, current);
    }
  }
  return [...parts.values()].map((part) => ({
    ...part,
    searchMuscle: part.slug === 'upper-back' && part.muscles.includes('lats') && part.muscles.includes('upper_back')
      ? 'back'
      : part.muscles[0]
  }));
}

export function musclePickerModel() {
  const parts = new Map();
  for (const [muscle, slugs] of Object.entries(PACKAGE_SLUGS)) {
    for (const slug of slugs) {
      const current = parts.get(slug) ?? { slug, muscles: [], primary: 1, secondary: 0, strength: 1 };
      current.muscles.push(muscle);
      parts.set(slug, current);
    }
  }
  return [...parts.values()].map((part) => ({
    ...part,
    searchMuscle: part.slug === 'upper-back' ? 'back' : part.muscles[0]
  }));
}

export function renderMuscleMap(exercises, { interactive = false, compact = false } = {}) {
  const parts = muscleMapModel(exercises);
  if (!parts.length) return '<p class="muscle-map-empty">Muscle data is unavailable for these exercises.</p>';
  const encodedParts = encodeURIComponent(JSON.stringify(parts));
  return `<div class="muscle-map-host" data-muscle-map data-parts="${encodedParts}" data-interactive="${interactive}" data-compact="${compact}"><p class="muscle-map-loading">Loading muscle map…</p></div>`;
}

export function renderMusclePicker() {
  const encodedParts = encodeURIComponent(JSON.stringify(musclePickerModel()));
  return `<div class="muscle-map-host" data-muscle-map data-parts="${encodedParts}" data-picker="true" data-compact="true"><p class="muscle-map-loading">Loading body models…</p></div>`;
}
