import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { finishSession, estimatedOneRepMax, normalizePlan, normalizeSet } from './workouts.mjs';
import { isIsoDate, shiftDate, weekdayFor } from './dates.mjs';
import { aliasesForMuscle, musclesForExercise } from './muscles.mjs';

const STARTER_EXERCISES = [
  ['local:barbell-bench-press', 'Barbell bench press', 'chest', 'barbell', 'pectorals'],
  ['local:barbell-squat', 'Barbell back squat', 'upper legs', 'barbell', 'quads'],
  ['local:deadlift', 'Barbell deadlift', 'back', 'barbell', 'spine'],
  ['local:overhead-press', 'Standing overhead press', 'shoulders', 'barbell', 'delts'],
  ['local:lat-pulldown', 'Lat pulldown', 'back', 'cable', 'lats'],
  ['local:dumbbell-curl', 'Dumbbell curl', 'upper arms', 'dumbbell', 'biceps'],
  ['local:pull-up', 'Pull-up', 'back', 'body weight', 'lats'],
  ['local:push-up', 'Push-up', 'chest', 'body weight', 'pectorals']
];

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function asSession(row) {
  return row ? {
    id: row.id,
    planId: row.plan_id == null ? null : Number(row.plan_id),
    workoutName: row.workout_name,
    date: row.local_date,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at
  } : null;
}

export class GymStore {
  constructor({ databasePath, timezone = 'Europe/Stockholm' }) {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(databasePath);
    this.timezone = timezone;
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.#migrate();
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        body_part TEXT NOT NULL,
        equipment TEXT NOT NULL,
        target TEXT NOT NULL,
        muscle_group TEXT NOT NULL DEFAULT '',
        secondary_muscles TEXT NOT NULL DEFAULT '[]',
        instructions TEXT NOT NULL DEFAULT '[]',
        image_path TEXT,
        gif_path TEXT,
        attribution TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS catalog_exercises_name ON catalog_exercises(name COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS workout_plans (
        id INTEGER PRIMARY KEY,
        weekday INTEGER NOT NULL UNIQUE CHECK(weekday BETWEEN 1 AND 7),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS plan_exercises (
        id INTEGER PRIMARY KEY,
        plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
        exercise_id TEXT NOT NULL REFERENCES catalog_exercises(id),
        position INTEGER NOT NULL,
        prescribed_sets INTEGER NOT NULL,
        rep_min INTEGER NOT NULL,
        rep_max INTEGER NOT NULL,
        target_grams INTEGER NOT NULL,
        increment_grams INTEGER NOT NULL,
        UNIQUE(plan_id, exercise_id),
        UNIQUE(plan_id, position)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        plan_id INTEGER,
        workout_name TEXT NOT NULL,
        local_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','completed','partial')),
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions(status) WHERE status='active';
      CREATE TABLE IF NOT EXISTS session_exercises (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        source_plan_exercise_id INTEGER,
        catalog_id TEXT NOT NULL,
        name TEXT NOT NULL,
        equipment TEXT NOT NULL,
        body_part TEXT NOT NULL,
        primary_muscle TEXT,
        secondary_muscles TEXT NOT NULL DEFAULT '[]',
        position INTEGER NOT NULL,
        prescribed_sets INTEGER NOT NULL,
        planned_sets INTEGER NOT NULL,
        rep_min INTEGER NOT NULL,
        rep_max INTEGER NOT NULL,
        target_grams INTEGER NOT NULL,
        increment_grams INTEGER NOT NULL,
        progression_status TEXT NOT NULL DEFAULT 'none' CHECK(progression_status IN ('none','pending','accepted','dismissed')),
        suggested_grams INTEGER,
        UNIQUE(session_id, position)
      );
      CREATE TABLE IF NOT EXISTS session_sets (
        session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
        set_number INTEGER NOT NULL,
        reps INTEGER,
        load_grams INTEGER,
        completed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(session_exercise_id, set_number)
      );
      CREATE TABLE IF NOT EXISTS body_weights (
        local_date TEXT PRIMARY KEY,
        grams INTEGER NOT NULL CHECK(grams > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const sessionExerciseColumns = new Set(this.db.prepare('PRAGMA table_info(session_exercises)').all().map((column) => column.name));
    if (!sessionExerciseColumns.has('suggestion_type')) this.db.exec("ALTER TABLE session_exercises ADD COLUMN suggestion_type TEXT");
    if (!sessionExerciseColumns.has('suggested_rep_min')) this.db.exec('ALTER TABLE session_exercises ADD COLUMN suggested_rep_min INTEGER');
    if (!sessionExerciseColumns.has('suggested_rep_max')) this.db.exec('ALTER TABLE session_exercises ADD COLUMN suggested_rep_max INTEGER');
    if (!sessionExerciseColumns.has('planned_sets')) {
      this.db.exec('ALTER TABLE session_exercises ADD COLUMN planned_sets INTEGER');
      this.db.exec('UPDATE session_exercises SET planned_sets=prescribed_sets WHERE planned_sets IS NULL');
    }
    let addedMuscleSnapshot = false;
    if (!sessionExerciseColumns.has('primary_muscle')) {
      this.db.exec('ALTER TABLE session_exercises ADD COLUMN primary_muscle TEXT');
      addedMuscleSnapshot = true;
    }
    if (!sessionExerciseColumns.has('secondary_muscles')) {
      this.db.exec("ALTER TABLE session_exercises ADD COLUMN secondary_muscles TEXT NOT NULL DEFAULT '[]'");
      addedMuscleSnapshot = true;
    }
    if (addedMuscleSnapshot) {
      const update = this.db.prepare('UPDATE session_exercises SET primary_muscle=?,secondary_muscles=? WHERE id=?');
      const rows = this.db.prepare(`SELECT se.id,ce.target,ce.muscle_group,ce.secondary_muscles FROM session_exercises se LEFT JOIN catalog_exercises ce ON ce.id=se.catalog_id`).all();
      for (const row of rows) {
        const muscles = musclesForExercise({ target: row.target, muscleGroup: row.muscle_group, secondaryMuscles: JSON.parse(row.secondary_muscles || '[]') });
        update.run(muscles.primary, JSON.stringify(muscles.secondary), row.id);
      }
    }
    if (Number(this.db.prepare('SELECT count(*) AS count FROM catalog_exercises').get().count) === 0) {
      const insert = this.db.prepare(`INSERT INTO catalog_exercises(
        id,name,body_part,equipment,target,source,updated_at
      ) VALUES(?,?,?,?,?,'starter',?)`);
      const now = new Date().toISOString();
      for (const exercise of STARTER_EXERCISES) insert.run(...exercise, now);
    }
  }

  close() {
    this.db.close();
  }

  importCatalog(records, revision = 'unknown') {
    const statement = this.db.prepare(`
      INSERT INTO catalog_exercises(id,name,body_part,equipment,target,muscle_group,secondary_muscles,instructions,image_path,gif_path,attribution,source,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,body_part=excluded.body_part,equipment=excluded.equipment,target=excluded.target,
        muscle_group=excluded.muscle_group,secondary_muscles=excluded.secondary_muscles,instructions=excluded.instructions,
        image_path=excluded.image_path,gif_path=excluded.gif_path,attribution=excluded.attribution,source=excluded.source,updated_at=excluded.updated_at
    `);
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of records) statement.run(item.id, item.name, item.bodyPart, item.equipment, item.target, item.muscleGroup,
        JSON.stringify(item.secondaryMuscles), JSON.stringify(item.instructions), item.imagePath, item.gifPath, item.attribution, item.source, now);
      this.db.exec(`DELETE FROM catalog_exercises WHERE source='starter' AND id NOT IN (SELECT exercise_id FROM plan_exercises)`);
      this.db.prepare(`INSERT INTO catalog_meta(key,value) VALUES('revision',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(revision);
      this.db.prepare(`INSERT INTO catalog_meta(key,value) VALUES('imported_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return records.length;
  }

  catalogStatus() {
    const count = Number(this.db.prepare('SELECT count(*) AS count FROM catalog_exercises').get().count);
    const revision = this.db.prepare(`SELECT value FROM catalog_meta WHERE key='revision'`).get()?.value ?? null;
    return { count, revision };
  }

  searchExercises({ query = '', bodyPart = '', equipment = '', target = '', muscle = '', limit = 30, offset = 0 } = {}) {
    limit = Math.max(1, Math.min(60, Number(limit) || 30));
    offset = Math.max(0, Math.min(10_000, Number(offset) || 0));
    const clauses = [`body_part <> 'cardio'`];
    const values = [];
    if (String(query).trim()) {
      clauses.push('(name LIKE ? ESCAPE \'\\\' COLLATE NOCASE OR target LIKE ? ESCAPE \'\\\' COLLATE NOCASE)');
      const like = `%${String(query).trim().replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      values.push(like, like);
    }
    for (const [column, value] of [['body_part', bodyPart], ['equipment', equipment], ['target', target]]) {
      if (String(value).trim()) { clauses.push(`${column} = ? COLLATE NOCASE`); values.push(String(value).trim()); }
    }
    if (String(muscle).trim()) {
      const aliases = aliasesForMuscle(String(muscle).trim());
      const direct = aliases.map(() => 'target = ? COLLATE NOCASE OR muscle_group = ? COLLATE NOCASE').join(' OR ');
      const secondary = aliases.map(() => 'sm.value = ? COLLATE NOCASE').join(' OR ');
      clauses.push(`((${direct}) OR EXISTS (SELECT 1 FROM json_each(catalog_exercises.secondary_muscles) sm WHERE ${secondary}))`);
      for (const alias of aliases) values.push(alias, alias);
      values.push(...aliases);
    }
    const where = clauses.join(' AND ');
    const total = Number(this.db.prepare(`SELECT count(*) AS count FROM catalog_exercises WHERE ${where}`).get(...values).count);
    const rows = this.db.prepare(`SELECT id,name,body_part,equipment,target,muscle_group,secondary_muscles,image_path,gif_path,attribution FROM catalog_exercises WHERE ${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`).all(...values, limit, offset);
    return { total, items: rows.map((row) => this.#publicExercise(row)), limit, offset };
  }

  exercise(id) {
    const row = this.db.prepare('SELECT * FROM catalog_exercises WHERE id=?').get(String(id));
    return row ? this.#publicExercise(row, true) : null;
  }

  catalogFilters() {
    const values = (column) => this.db.prepare(`SELECT DISTINCT ${column} AS value FROM catalog_exercises WHERE body_part <> 'cardio' ORDER BY value COLLATE NOCASE`).all().map((row) => row.value);
    return { bodyParts: values('body_part'), equipment: values('equipment'), targets: values('target') };
  }

  exportExercises() {
    return this.db.prepare(`SELECT id,name,body_part,equipment,target,source FROM catalog_exercises WHERE body_part <> 'cardio' ORDER BY name COLLATE NOCASE`).all().map((row) => ({
      id: row.id,
      name: row.name,
      bodyPart: row.body_part,
      equipment: row.equipment,
      target: row.target,
      custom: row.source === 'custom'
    }));
  }

  createCustomExercise(exercise) {
    const duplicate = this.db.prepare('SELECT id FROM catalog_exercises WHERE name=? COLLATE NOCASE').get(exercise.name);
    if (duplicate) fail('An exercise with this name already exists.', 409);
    const id = `custom:${randomUUID()}`;
    this.db.prepare(`INSERT INTO catalog_exercises(
      id,name,body_part,equipment,target,muscle_group,secondary_muscles,instructions,image_path,gif_path,attribution,source,updated_at
    ) VALUES(?,?,?,?,?,?,'[]',?,NULL,NULL,'Personal custom exercise','custom',?)`).run(
      id, exercise.name, exercise.bodyPart, exercise.equipment, exercise.target, exercise.bodyPart,
      JSON.stringify(exercise.instructions), new Date().toISOString()
    );
    return this.exercise(id);
  }

  plan() {
    const days = this.db.prepare('SELECT id,weekday,name FROM workout_plans ORDER BY weekday').all().map((row) => ({
      id: Number(row.id),
      weekday: Number(row.weekday),
      name: row.name,
      exercises: this.db.prepare(`SELECT pe.id,pe.exercise_id,pe.position,pe.prescribed_sets,pe.rep_min,pe.rep_max,pe.target_grams,pe.increment_grams,
          ce.name,ce.equipment,ce.body_part,ce.target,ce.muscle_group,ce.secondary_muscles,ce.image_path,ce.gif_path
        FROM plan_exercises pe JOIN catalog_exercises ce ON ce.id=pe.exercise_id WHERE pe.plan_id=? ORDER BY pe.position`).all(row.id).map((item) => ({
          id: Number(item.id), exerciseId: item.exercise_id, name: item.name, equipment: item.equipment, bodyPart: item.body_part,
          muscles: musclesForExercise({ target: item.target, muscleGroup: item.muscle_group, secondaryMuscles: JSON.parse(item.secondary_muscles || '[]') }),
          imageAvailable: Boolean(item.image_path), gifAvailable: Boolean(item.gif_path), sets: Number(item.prescribed_sets), repMin: Number(item.rep_min),
          repMax: Number(item.rep_max), targetGrams: Number(item.target_grams), incrementGrams: Number(item.increment_grams)
        }))
    }));
    return { days };
  }

  savePlan(input) {
    const plan = normalizePlan(input);
    const known = this.db.prepare('SELECT id FROM catalog_exercises WHERE id=?');
    for (const day of plan.days) for (const exercise of day.exercises) if (!known.get(exercise.exerciseId)) fail(`Exercise ${exercise.exerciseId} was not found.`, 404);
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const requestedIds = plan.days.map((day) => day.id).filter(Boolean);
      if (requestedIds.length) this.db.prepare(`DELETE FROM workout_plans WHERE id NOT IN (${requestedIds.map(() => '?').join(',')})`).run(...requestedIds);
      else this.db.exec('DELETE FROM workout_plans');
      const keep = [];
      for (const day of plan.days) {
        let id = day.id;
        if (id && this.db.prepare('SELECT id FROM workout_plans WHERE id=?').get(id)) {
          this.db.prepare('UPDATE workout_plans SET weekday=?,name=?,updated_at=? WHERE id=?').run(day.weekday, day.name, now, id);
          this.db.prepare('DELETE FROM plan_exercises WHERE plan_id=?').run(id);
        } else {
          id = Number(this.db.prepare('INSERT INTO workout_plans(weekday,name,created_at,updated_at) VALUES(?,?,?,?)').run(day.weekday, day.name, now, now).lastInsertRowid);
        }
        keep.push(id);
        const insert = this.db.prepare('INSERT INTO plan_exercises(plan_id,exercise_id,position,prescribed_sets,rep_min,rep_max,target_grams,increment_grams) VALUES(?,?,?,?,?,?,?,?)');
        for (const exercise of day.exercises) insert.run(id, exercise.exerciseId, exercise.position, exercise.sets, exercise.repMin, exercise.repMax, exercise.targetGrams, exercise.incrementGrams);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.plan();
  }

  startSession(planId, date) {
    if (!isIsoDate(date)) fail('Invalid workout date.');
    const existing = this.db.prepare(`SELECT id FROM sessions WHERE status='active'`).get();
    if (existing) fail('Finish the active workout before starting another.', 409);
    const plan = this.db.prepare('SELECT id,name FROM workout_plans WHERE id=?').get(Number(planId));
    if (!plan) fail('Workout not found.', 404);
    const exercises = this.db.prepare(`SELECT pe.*,ce.name,ce.equipment,ce.body_part,ce.target,ce.muscle_group,ce.secondary_muscles FROM plan_exercises pe JOIN catalog_exercises ce ON ce.id=pe.exercise_id WHERE pe.plan_id=? ORDER BY pe.position`).all(plan.id);
    if (!exercises.length) fail('Add at least one exercise before starting this workout.', 409);
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`INSERT INTO sessions(id,plan_id,workout_name,local_date,status,started_at) VALUES(?,?,?,?,'active',?)`).run(id, plan.id, plan.name, date, now);
      const insertExercise = this.db.prepare(`INSERT INTO session_exercises(id,session_id,source_plan_exercise_id,catalog_id,name,equipment,body_part,primary_muscle,secondary_muscles,position,prescribed_sets,planned_sets,rep_min,rep_max,target_grams,increment_grams) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const insertSet = this.db.prepare(`INSERT INTO session_sets(session_exercise_id,set_number,completed,updated_at) VALUES(?,?,0,?)`);
      for (const exercise of exercises) {
        const exerciseId = randomUUID();
        const muscles = musclesForExercise({ target: exercise.target, muscleGroup: exercise.muscle_group, secondaryMuscles: JSON.parse(exercise.secondary_muscles || '[]') });
        insertExercise.run(exerciseId, id, exercise.id, exercise.exercise_id, exercise.name, exercise.equipment, exercise.body_part, muscles.primary, JSON.stringify(muscles.secondary), exercise.position, exercise.prescribed_sets, exercise.prescribed_sets, exercise.rep_min, exercise.rep_max, exercise.target_grams, exercise.increment_grams);
        for (let setNumber = 1; setNumber <= exercise.prescribed_sets; setNumber += 1) insertSet.run(exerciseId, setNumber, now);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.session(id);
  }

  session(id) {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(String(id));
    if (!row) return null;
    const session = asSession(row);
    session.exercises = this.db.prepare('SELECT * FROM session_exercises WHERE session_id=? ORDER BY position').all(row.id).map((exercise) => ({
      id: exercise.id,
      catalogId: exercise.catalog_id,
      name: exercise.name,
      equipment: exercise.equipment,
      bodyPart: exercise.body_part,
      muscles: { primary: exercise.primary_muscle, secondary: JSON.parse(exercise.secondary_muscles || '[]') },
      prescribedSets: Number(exercise.prescribed_sets),
      plannedSets: Number(exercise.planned_sets ?? exercise.prescribed_sets),
      repMin: Number(exercise.rep_min),
      repMax: Number(exercise.rep_max),
      targetGrams: Number(exercise.target_grams),
      incrementGrams: Number(exercise.increment_grams),
      progressionStatus: exercise.progression_status,
      suggestionType: exercise.suggestion_type,
      suggestedGrams: exercise.suggested_grams == null ? null : Number(exercise.suggested_grams),
      suggestedRepMin: exercise.suggested_rep_min == null ? null : Number(exercise.suggested_rep_min),
      suggestedRepMax: exercise.suggested_rep_max == null ? null : Number(exercise.suggested_rep_max),
      sets: this.db.prepare('SELECT set_number,reps,load_grams,completed FROM session_sets WHERE session_exercise_id=? ORDER BY set_number').all(exercise.id).map((set) => ({
        setNumber: Number(set.set_number), reps: set.reps == null ? null : Number(set.reps), loadGrams: set.load_grams == null ? null : Number(set.load_grams), completed: Boolean(set.completed)
      }))
    }));
    return session;
  }

  activeSession() {
    const row = this.db.prepare(`SELECT id FROM sessions WHERE status='active'`).get();
    return row ? this.session(row.id) : null;
  }

  updateSet(sessionId, sessionExerciseId, input, today) {
    const session = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(String(sessionId));
    if (!session) fail('Workout not found.', 404);
    if (session.status !== 'active' && session.local_date < shiftDate(today, -7)) fail('This workout can no longer be edited.', 409);
    const exercise = this.db.prepare('SELECT * FROM session_exercises WHERE id=? AND session_id=?').get(String(sessionExerciseId), session.id);
    if (!exercise) fail('Exercise not found in this workout.', 404);
    const set = normalizeSet(input, Number(exercise.prescribed_sets));
    this.db.prepare('UPDATE session_sets SET reps=?,load_grams=?,completed=?,updated_at=? WHERE session_exercise_id=? AND set_number=?')
      .run(set.reps, set.loadGrams, set.completed ? 1 : 0, new Date().toISOString(), exercise.id, set.setNumber);
    if (session.status !== 'active') {
      const corrected = this.session(session.id);
      this.db.prepare('UPDATE sessions SET status=? WHERE id=?').run(finishSession(corrected.exercises).status, session.id);
    }
    return this.session(session.id);
  }

  addSessionSet(sessionId, sessionExerciseId) {
    const session = this.db.prepare('SELECT status FROM sessions WHERE id=?').get(String(sessionId));
    if (!session) fail('Workout not found.', 404);
    if (session.status !== 'active') fail('Sets can only be added to an active workout.', 409);
    const exercise = this.db.prepare('SELECT * FROM session_exercises WHERE id=? AND session_id=?').get(String(sessionExerciseId), String(sessionId));
    if (!exercise) fail('Exercise not found in this workout.', 404);
    const nextSet = Number(exercise.prescribed_sets) + 1;
    if (nextSet > 30) fail('A workout exercise can have at most 30 sets.');
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE session_exercises SET prescribed_sets=? WHERE id=?').run(nextSet, exercise.id);
      this.db.prepare('INSERT INTO session_sets(session_exercise_id,set_number,completed,updated_at) VALUES(?,?,0,?)').run(exercise.id, nextSet, now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.session(sessionId);
  }

  removeExtraSessionSet(sessionId, sessionExerciseId, setNumber) {
    const session = this.db.prepare('SELECT status FROM sessions WHERE id=?').get(String(sessionId));
    if (!session) fail('Workout not found.', 404);
    if (session.status !== 'active') fail('Sets can only be removed from an active workout.', 409);
    const exercise = this.db.prepare('SELECT * FROM session_exercises WHERE id=? AND session_id=?').get(String(sessionExerciseId), String(sessionId));
    if (!exercise) fail('Exercise not found in this workout.', 404);
    setNumber = Number(setNumber);
    if (!Number.isInteger(setNumber) || setNumber !== Number(exercise.prescribed_sets)) fail('Only the last set can be removed.');
    if (setNumber <= Number(exercise.planned_sets ?? exercise.prescribed_sets)) fail('Planned sets cannot be removed during a workout.', 409);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM session_sets WHERE session_exercise_id=? AND set_number=?').run(exercise.id, setNumber);
      this.db.prepare('UPDATE session_exercises SET prescribed_sets=prescribed_sets-1 WHERE id=?').run(exercise.id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.session(sessionId);
  }

  completeSession(id) {
    const session = this.session(id);
    if (!session) fail('Workout not found.', 404);
    if (session.status !== 'active') fail('This workout is already finished.', 409);
    const result = finishSession(session.exercises);
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE sessions SET status=?,completed_at=? WHERE id=?').run(result.status, now, id);
      const update = this.db.prepare('UPDATE session_exercises SET progression_status=?,suggestion_type=?,suggested_grams=?,suggested_rep_min=?,suggested_rep_max=? WHERE id=?');
      for (const item of result.progression) update.run(item.qualified ? 'pending' : 'none', item.suggestionType, item.suggestedGrams, item.suggestedRepMin, item.suggestedRepMax, item.sessionExerciseId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.session(id);
  }

  decideProgression(sessionExerciseId, decision) {
    if (!['accepted', 'dismissed'].includes(decision)) fail('Choose whether to accept or dismiss this suggestion.');
    const exercise = this.db.prepare('SELECT * FROM session_exercises WHERE id=?').get(String(sessionExerciseId));
    if (!exercise) fail('Progression suggestion not found.', 404);
    if (exercise.progression_status !== 'pending') fail('This suggestion has already been handled.', 409);
    const planExercise = exercise.source_plan_exercise_id
      ? this.db.prepare(`SELECT pe.id FROM plan_exercises pe JOIN sessions s ON s.plan_id=pe.plan_id WHERE s.id=? AND pe.exercise_id=?`).get(exercise.session_id, exercise.catalog_id)
      : null;
    if (decision === 'accepted' && !planExercise) fail('This exercise is no longer in the original workout plan.', 409);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (decision === 'accepted' && exercise.suggestion_type === 'reps') {
        this.db.prepare('UPDATE plan_exercises SET rep_min=?,rep_max=? WHERE id=?').run(exercise.suggested_rep_min, exercise.suggested_rep_max, planExercise.id);
      } else if (decision === 'accepted') {
        this.db.prepare('UPDATE plan_exercises SET target_grams=? WHERE id=?').run(exercise.suggested_grams, planExercise.id);
      }
      this.db.prepare('UPDATE session_exercises SET progression_status=? WHERE id=?').run(decision, exercise.id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.session(exercise.session_id);
  }

  saveBodyWeight(date, grams) {
    if (!isIsoDate(date)) fail('Invalid body-weight date.');
    grams = Number(grams);
    if (!Number.isInteger(grams) || grams < 20_000 || grams > 500_000) fail('Body weight must be between 20 and 500 kg.');
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO body_weights(local_date,grams,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(local_date) DO UPDATE SET grams=excluded.grams,updated_at=excluded.updated_at`).run(date, grams, now, now);
    return this.bodyWeights();
  }

  deleteBodyWeight(date) {
    if (!isIsoDate(date)) fail('Invalid body-weight date.');
    this.db.prepare('DELETE FROM body_weights WHERE local_date=?').run(date);
    return this.bodyWeights();
  }

  cancelSession(id) {
    const session = this.db.prepare('SELECT status FROM sessions WHERE id=?').get(String(id));
    if (!session) fail('Workout not found.', 404);
    if (session.status !== 'active') fail('Only an active workout can be cancelled.', 409);
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(String(id));
  }

  bodyWeights() {
    return this.db.prepare('SELECT local_date,grams FROM body_weights ORDER BY local_date DESC LIMIT 365').all().map((row) => ({ date: row.local_date, grams: Number(row.grams) }));
  }

  history(limit = 20) {
    return this.db.prepare(`SELECT * FROM sessions WHERE status <> 'active' ORDER BY local_date DESC,completed_at DESC LIMIT ?`).all(Math.max(1, Math.min(100, Number(limit) || 20))).map((row) => {
      const session = this.session(row.id);
      session.completedSets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
      session.totalSets = session.exercises.reduce((sum, exercise) => sum + exercise.prescribedSets, 0);
      return session;
    });
  }

  progress(today, exerciseId = null) {
    const weights = this.bodyWeights();
    const latestWeight = weights[0] ?? null;
    const baselineDate = shiftDate(today, -30);
    const baseline = latestWeight ? weights.find((entry) => entry.date <= baselineDate) ?? null : null;
    const sessionsLastFourWeeks = Number(this.db.prepare(`SELECT count(*) AS count FROM sessions WHERE status <> 'active' AND local_date BETWEEN ? AND ?`).get(shiftDate(today, -27), today).count);
    const history = this.history(12);
    const completedExercises = this.db.prepare(`SELECT se.id,se.catalog_id,se.name,se.equipment,s.local_date FROM session_exercises se JOIN sessions s ON s.id=se.session_id WHERE s.status <> 'active' ORDER BY s.local_date`).all();
    const records = [];
    for (const exercise of completedExercises) {
      const sets = this.db.prepare('SELECT reps,load_grams FROM session_sets WHERE session_exercise_id=? AND completed=1').all(exercise.id);
      for (const set of sets) {
        const value = estimatedOneRepMax(set.load_grams, set.reps);
        records.push({ exerciseId: exercise.catalog_id, name: exercise.name, equipment: exercise.equipment, date: exercise.local_date, reps: Number(set.reps), loadGrams: Number(set.load_grams), estimatedOneRepMaxGrams: value });
      }
    }
    const bestByExercise = new Map();
    for (const record of records) {
      const score = record.estimatedOneRepMaxGrams ?? record.reps;
      const current = bestByExercise.get(record.exerciseId);
      if (!current || score > current.score || (score === current.score && record.date > current.record.date)) bestByExercise.set(record.exerciseId, { score, record });
    }
    const recentPr = [...bestByExercise.values()].map((item) => item.record).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
    const choices = [...new Map(completedExercises.map((item) => [item.catalog_id, { id: item.catalog_id, name: item.name, equipment: item.equipment }])).values()].sort((a, b) => a.name.localeCompare(b.name));
    const selectedId = exerciseId && choices.some((item) => item.id === exerciseId) ? exerciseId : choices[0]?.id ?? null;
    const selected = choices.find((item) => item.id === selectedId) ?? null;
    const grouped = new Map();
    for (const record of records.filter((item) => item.exerciseId === selectedId)) {
      const score = record.estimatedOneRepMaxGrams ?? record.reps;
      const current = grouped.get(record.date);
      if (!current || score > current.score) grouped.set(record.date, { score, record });
    }
    const trend = [...grouped.values()].map((item) => item.record);
    return {
      latestWeight,
      weightChangeGrams: latestWeight && baseline ? latestWeight.grams - baseline.grams : null,
      sessionsLastFourWeeks,
      recentPr,
      exerciseChoices: choices,
      selectedExercise: selected,
      trend,
      weights,
      history
    };
  }

  bootstrap(today) {
    const plan = this.plan();
    const weekday = weekdayFor(today);
    return {
      today,
      weekday,
      plan,
      scheduledWorkout: plan.days.find((day) => day.weekday === weekday) ?? null,
      activeSession: this.activeSession(),
      completedToday: this.db.prepare(`SELECT id FROM sessions WHERE local_date=? AND status <> 'active' ORDER BY completed_at DESC`).all(today).map((row) => this.session(row.id)),
      catalog: this.catalogStatus(),
      filters: this.catalogFilters()
    };
  }

  mediaRecord(id, kind) {
    if (!['image', 'gif'].includes(kind)) return null;
    const row = this.db.prepare(`SELECT ${kind === 'image' ? 'image_path' : 'gif_path'} AS path,attribution FROM catalog_exercises WHERE id=?`).get(String(id));
    return row?.path ? { path: row.path, attribution: row.attribution } : null;
  }

  catalogMediaRecords() {
    return this.db.prepare('SELECT id,image_path,gif_path FROM catalog_exercises WHERE image_path IS NOT NULL OR gif_path IS NOT NULL ORDER BY id').all().map((row) => ({
      id: row.id,
      imagePath: row.image_path,
      gifPath: row.gif_path
    }));
  }

  #publicExercise(row, details = false) {
    const exercise = {
      id: row.id, name: row.name, bodyPart: row.body_part, equipment: row.equipment, target: row.target,
      muscles: musclesForExercise({ target: row.target, muscleGroup: row.muscle_group, secondaryMuscles: JSON.parse(row.secondary_muscles || '[]') }),
      imageAvailable: Boolean(row.image_path), gifAvailable: Boolean(row.gif_path), attribution: row.attribution
    };
    if (details) Object.assign(exercise, {
      muscleGroup: row.muscle_group,
      secondaryMuscles: JSON.parse(row.secondary_muscles || '[]'),
      instructions: JSON.parse(row.instructions || '[]')
    });
    return exercise;
  }
}
