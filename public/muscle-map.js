const LABELS = {
  chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  core: 'Abs & core', obliques: 'Obliques', traps: 'Traps', upper_back: 'Upper back', lats: 'Lats',
  lower_back: 'Lower back', glutes: 'Glutes', quads: 'Quadriceps', hamstrings: 'Hamstrings',
  hips: 'Hips', calves: 'Calves', neck: 'Neck'
};

function muscleScores(exercises) {
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

function region(muscle, shapes, scores, interactive) {
  const score = scores.get(muscle);
  const active = Boolean(score);
  const attributes = active && interactive
    ? `data-muscle="${muscle}" role="button" tabindex="0" aria-label="Find exercises for ${LABELS[muscle]}"`
    : `aria-label="${LABELS[muscle]}${active ? ' trained' : ''}"`;
  const style = active ? ` style="--muscle-strength:${score.strength.toFixed(2)}"` : '';
  const classes = `muscle-region${active ? ` active ${score.primary ? 'primary' : 'secondary'}` : ''}${active && interactive ? ' interactive' : ''}`;
  return `<g class="${classes}" ${attributes}${style}><title>${LABELS[muscle]}${active ? ` · ${score.primary ? 'primary' : 'secondary'}` : ''}</title>${shapes}</g>`;
}

export function muscleLabel(id) {
  return LABELS[id] ?? 'Muscle';
}

export function renderMuscleMap(exercises, { interactive = false, compact = false } = {}) {
  const scores = muscleScores(exercises);
  if (!scores.size) return '<p class="muscle-map-empty">Muscle data is unavailable for these exercises.</p>';
  const r = (muscle, shapes) => region(muscle, shapes, scores, interactive);
  return `<div class="muscle-map${compact ? ' compact' : ''}">
    <svg viewBox="0 0 320 360" role="img" aria-label="Front and back muscle groups trained in this workout">
      <text class="body-label" x="80" y="18" text-anchor="middle">Front</text><text class="body-label" x="240" y="18" text-anchor="middle">Back</text>
      <g class="body-base">
        <circle cx="80" cy="48" r="20"/><path d="M59 74 Q80 65 101 74 L109 144 Q102 181 98 198 L92 337 H72 L65 198 Q58 176 51 144 Z"/>
        <path d="M58 82 Q39 87 34 119 L20 202 L35 205 L52 139"/><path d="M102 82 Q121 87 126 119 L140 202 L125 205 L108 139"/>
        <circle cx="240" cy="48" r="20"/><path d="M219 74 Q240 65 261 74 L269 144 Q262 181 258 198 L252 337 H232 L225 198 Q218 176 211 144 Z"/>
        <path d="M218 82 Q199 87 194 119 L180 202 L195 205 L212 139"/><path d="M262 82 Q281 87 286 119 L300 202 L285 205 L268 139"/>
      </g>
      ${r('neck', '<path d="M73 66 L87 66 L91 81 L69 81 Z"/><path d="M233 66 L247 66 L251 81 L229 81 Z"/>')}
      ${r('shoulders', '<ellipse cx="55" cy="91" rx="15" ry="12"/><ellipse cx="105" cy="91" rx="15" ry="12"/><ellipse cx="215" cy="91" rx="15" ry="12"/><ellipse cx="265" cy="91" rx="15" ry="12"/>')}
      ${r('chest', '<path d="M61 96 Q80 87 80 118 Q64 123 58 111 Z"/><path d="M99 96 Q80 87 80 118 Q96 123 102 111 Z"/>')}
      ${r('biceps', '<ellipse cx="45" cy="131" rx="8" ry="20"/><ellipse cx="115" cy="131" rx="8" ry="20"/>')}
      ${r('triceps', '<ellipse cx="205" cy="133" rx="8" ry="21"/><ellipse cx="275" cy="133" rx="8" ry="21"/>')}
      ${r('forearms', '<ellipse cx="31" cy="174" rx="7" ry="25"/><ellipse cx="129" cy="174" rx="7" ry="25"/><ellipse cx="191" cy="174" rx="7" ry="25"/><ellipse cx="289" cy="174" rx="7" ry="25"/>')}
      ${r('core', '<path d="M70 122 Q80 118 90 122 L88 178 Q80 185 72 178 Z"/>')}
      ${r('obliques', '<path d="M59 122 L71 126 L70 177 L62 166 Z"/><path d="M101 122 L89 126 L90 177 L98 166 Z"/>')}
      ${r('traps', '<path d="M221 84 L240 72 L259 84 L252 112 L228 112 Z"/>')}
      ${r('upper_back', '<path d="M218 105 Q240 92 262 105 L256 132 Q240 143 224 132 Z"/>')}
      ${r('lats', '<path d="M216 118 L229 130 L226 169 L215 148 Z"/><path d="M264 118 L251 130 L254 169 L265 148 Z"/>')}
      ${r('lower_back', '<path d="M228 139 Q240 145 252 139 L254 178 Q240 187 226 178 Z"/>')}
      ${r('hips', '<path d="M63 178 Q80 187 97 178 L100 204 Q80 213 60 204 Z"/>')}
      ${r('glutes', '<ellipse cx="231" cy="195" rx="14" ry="16"/><ellipse cx="249" cy="195" rx="14" ry="16"/>')}
      ${r('quads', '<path d="M62 207 Q72 202 79 209 L76 269 Q68 278 62 265 Z"/><path d="M98 207 Q88 202 81 209 L84 269 Q92 278 98 265 Z"/>')}
      ${r('hamstrings', '<path d="M222 211 Q232 204 239 211 L236 270 Q228 277 222 265 Z"/><path d="M258 211 Q248 204 241 211 L244 270 Q252 277 258 265 Z"/>')}
      ${r('calves', '<ellipse cx="69" cy="299" rx="8" ry="25"/><ellipse cx="91" cy="299" rx="8" ry="25"/><ellipse cx="229" cy="299" rx="8" ry="25"/><ellipse cx="251" cy="299" rx="8" ry="25"/>')}
    </svg>
    <div class="muscle-legend"><span><i class="primary"></i>Primary</span><span><i class="secondary"></i>Secondary</span>${interactive ? '<small>Choose a highlighted muscle to find exercises</small>' : ''}</div>
  </div>`;
}
