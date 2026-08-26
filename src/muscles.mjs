const GROUPS = [
  ['chest', 'Chest', ['pectorals', 'chest', 'upper chest', 'serratus anterior']],
  ['shoulders', 'Shoulders', ['delts', 'deltoids', 'shoulders', 'rear deltoids', 'rotator cuff']],
  ['biceps', 'Biceps', ['biceps', 'brachialis']],
  ['triceps', 'Triceps', ['triceps']],
  ['forearms', 'Forearms', ['forearms', 'wrist flexors', 'wrist extensors', 'wrists', 'grip muscles', 'hands']],
  ['core', 'Abs & core', ['abs', 'abdominals', 'core', 'lower abs']],
  ['obliques', 'Obliques', ['obliques']],
  ['traps', 'Traps', ['traps', 'trapezius', 'levator scapulae']],
  ['upper_back', 'Upper back', ['upper back', 'rhomboids']],
  ['lats', 'Lats', ['lats', 'latissimus dorsi']],
  ['lower_back', 'Lower back', ['lower back', 'spine']],
  ['glutes', 'Glutes', ['glutes']],
  ['quads', 'Quadriceps', ['quads', 'quadriceps']],
  ['hamstrings', 'Hamstrings', ['hamstrings']],
  ['hips', 'Hips', ['hip flexors', 'adductors', 'abductors', 'groin', 'inner thighs']],
  ['calves', 'Calves', ['calves', 'soleus', 'shins', 'ankles', 'ankle stabilizers', 'feet']],
  ['neck', 'Neck', ['neck', 'sternocleidomastoid']]
];

const groupById = new Map(GROUPS.map(([id, label, aliases]) => [id, { id, label, aliases }]));
const idByAlias = new Map(GROUPS.flatMap(([id, , aliases]) => aliases.map((alias) => [alias, id])));

function canonicalMuscle(value) {
  return idByAlias.get(String(value ?? '').trim().toLowerCase()) ?? null;
}

export function musclesForExercise({ target, muscleGroup, secondaryMuscles = [] }) {
  const primary = canonicalMuscle(target);
  const secondary = [];
  for (const value of [muscleGroup, ...(Array.isArray(secondaryMuscles) ? secondaryMuscles : [])]) {
    const muscle = canonicalMuscle(value);
    if (muscle && muscle !== primary && !secondary.includes(muscle)) secondary.push(muscle);
  }
  return { primary, secondary };
}

export function aliasesForMuscle(id) {
  const group = groupById.get(String(id));
  if (!group) throw Object.assign(new Error('Choose a valid muscle group.'), { statusCode: 400 });
  return group.aliases;
}

export function muscleOptions() {
  return GROUPS.map(([id, label]) => ({ id, label }));
}
