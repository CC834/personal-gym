const integer = (value, name, minimum, maximum) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw Object.assign(new Error(`${name} must be between ${minimum} and ${maximum}.`), { statusCode: 400 });
  }
  return number;
};

const grams = (value, name, { allowZero = true } = {}) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < (allowZero ? 0 : 1) || number > 1_000_000) {
    throw Object.assign(new Error(`${name} must be a valid kilogram value.`), { statusCode: 400 });
  }
  return number;
};

export function normalizePlan(input) {
  if (!input || !Array.isArray(input.days)) throw Object.assign(new Error('A weekly plan is required.'), { statusCode: 400 });
  const seen = new Set();
  return {
    days: input.days.map((day) => {
      const weekday = integer(day.weekday, 'Weekday', 1, 7);
      if (seen.has(weekday)) throw Object.assign(new Error('Each weekday can have only one workout.'), { statusCode: 400 });
      seen.add(weekday);
      const name = String(day.name ?? '').trim();
      if (!name || name.length > 60) throw Object.assign(new Error('Workout names must be between 1 and 60 characters.'), { statusCode: 400 });
      if (!Array.isArray(day.exercises) || day.exercises.length > 40) throw Object.assign(new Error('Each workout can contain up to 40 exercises.'), { statusCode: 400 });
      const exerciseIds = new Set();
      return {
        id: day.id == null ? null : integer(day.id, 'Workout ID', 1, Number.MAX_SAFE_INTEGER),
        weekday,
        name,
        exercises: day.exercises.map((exercise, position) => {
          const exerciseId = String(exercise.exerciseId ?? '').trim();
          if (!exerciseId || exerciseId.length > 100) throw Object.assign(new Error('Choose a valid exercise.'), { statusCode: 400 });
          if (exerciseIds.has(exerciseId)) throw Object.assign(new Error('An exercise can appear only once in a workout.'), { statusCode: 400 });
          exerciseIds.add(exerciseId);
          const repMin = integer(exercise.repMin, 'Minimum reps', 1, 100);
          const repMax = integer(exercise.repMax, 'Maximum reps', repMin, 100);
          return {
            exerciseId,
            position,
            sets: integer(exercise.sets, 'Sets', 1, 20),
            repMin,
            repMax,
            targetGrams: grams(exercise.targetGrams, 'Target load'),
            incrementGrams: grams(exercise.incrementGrams, 'Progression increment', { allowZero: false })
          };
        })
      };
    }).sort((left, right) => left.weekday - right.weekday)
  };
}

export function normalizeSet(input, prescribedSets) {
  const setNumber = integer(input.setNumber, 'Set number', 1, prescribedSets);
  const completed = Boolean(input.completed);
  const reps = input.reps == null || input.reps === '' ? null : integer(input.reps, 'Reps', 0, 200);
  const loadGrams = input.loadGrams == null || input.loadGrams === '' ? null : grams(input.loadGrams, 'Load');
  if (completed && (reps == null || loadGrams == null)) {
    throw Object.assign(new Error('Enter kilograms and reps before completing the set.'), { statusCode: 400 });
  }
  return {
    setNumber,
    completed,
    reps,
    loadGrams
  };
}

export function progressionForExercise(exercise) {
  const completedSets = exercise.sets.filter((set) => set.completed);
  const complete = completedSets.length === exercise.prescribedSets;
  const qualified = complete && completedSets.every((set) => set.reps >= exercise.repMax && set.loadGrams >= exercise.targetGrams);
  const bodyweightReps = qualified && exercise.equipment === 'body weight' && exercise.targetGrams === 0 && exercise.repMax < 20;
  const repIncrease = bodyweightReps ? Math.min(2, 20 - exercise.repMax) : 0;
  return {
    complete,
    qualified,
    suggestionType: qualified ? (bodyweightReps ? 'reps' : 'load') : null,
    suggestedGrams: qualified && !bodyweightReps ? exercise.targetGrams + exercise.incrementGrams : null,
    suggestedRepMin: bodyweightReps ? exercise.repMax + repIncrease : null,
    suggestedRepMax: bodyweightReps ? exercise.repMax + repIncrease : null
  };
}

export function finishSession(exercises) {
  const progression = exercises.map((exercise) => ({
    sessionExerciseId: exercise.id,
    ...progressionForExercise(exercise)
  }));
  return {
    status: progression.every((item) => item.complete) ? 'completed' : 'partial',
    progression
  };
}

export function estimatedOneRepMax(loadGrams, reps) {
  const load = Number(loadGrams);
  const count = Number(reps);
  if (!(load > 0) || !(count > 0)) return null;
  return Math.round(load * (1 + count / 30));
}
